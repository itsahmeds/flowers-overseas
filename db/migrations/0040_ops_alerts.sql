-- 0040_ops_alerts — the founder's alert log: one row per open problem, its notifications, and the
-- quiet-hours setting (spec 025 §5.1; AC-2, AC-36; TASK-488).
--
-- Numbered 0040 (orchestrator, 2026-11-08): 0038 is TASK-418's and 0039 TASK-439's.
--
--   1. `ops_alert`: one row per open fingerprint (`name:subject`). The partial unique index
--      `ops_alert_open_fingerprint_key` is the deduplication: two concurrent raises meet in
--      `INSERT ... ON CONFLICT ... DO UPDATE` and leave one row. `name` is validated against the
--      code's `ALERT_REGISTRY` by zod, not by an enum, so a new alert is not a migration. An alert
--      is about an order or about a component, never both and never neither. `context` holds a
--      closed key set (ids, counts, rates, provider names, ISO instants, the destination country
--      code and city id); no name, address, phone, email, message or free text.
--   2. `ops_alert_notification`: every push and email decided for an alert, sent or not, with the
--      provider's reference and, on failure, the error class and HTTP status only.
--   3. `ops_alert_setting`: the one row of quiet hours and their IANA zone, seeded 23:00 to 07:00
--      `Asia/Karachi` (§13 Q2).
--   4. RLS: staff (`admin`, `system`) only on all three; florists, buyers and the public read none.
--   5. Retention: `ops_alert`, resolved alerts deleted 12 months after their resolve, with their
--      notifications (cascade). Open alerts are never swept.
--   6. Flag `alerts.push`, global, `enabled_default = false`. Push is sent in production unless a
--      global row turns it off, and elsewhere only while a global row turns it on (§5.5, §12).
--
-- Rollback: `0040_ops_alerts.down.sql` (the alert history is lost; no order or money data lives
-- here, so no guard).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. ops_alert
 * ------------------------------------------------------------------------ */

CREATE TABLE public.ops_alert (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  environment       text        NOT NULL,
  name              text        NOT NULL,
  severity          text        NOT NULL,
  initial_severity  text        NOT NULL,
  fingerprint       text        NOT NULL,
  order_id          uuid        NULL,
  component         text        NULL,
  mode              text        NULL,
  status            text        NOT NULL DEFAULT 'open',
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  occurrences       integer     NOT NULL DEFAULT 1,
  reopen_count      integer     NOT NULL DEFAULT 0,
  act_by            timestamptz NULL,
  acknowledged_at   timestamptz NULL,
  acknowledged_by   text        NULL,
  resolved_at       timestamptz NULL,
  resolved_by       text        NULL,
  resolution        text        NULL,
  context           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  pages_24h         integer     NOT NULL DEFAULT 0,
  last_page_at      timestamptz NULL,
  clear_runs        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_alert_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT ops_alert_environment_check CHECK (environment ~ '^[a-z]+$'),
  CONSTRAINT ops_alert_name_check CHECK (name ~ '^[a-z][a-z0-9_]*([.][a-z0-9_]+)+$'),
  CONSTRAINT ops_alert_severity_check CHECK (severity IN ('P1', 'P2', 'P3')),
  CONSTRAINT ops_alert_initial_severity_check CHECK (initial_severity IN ('P1', 'P2', 'P3')),
  CONSTRAINT ops_alert_fingerprint_check CHECK (char_length(fingerprint) BETWEEN 3 AND 200),
  CONSTRAINT ops_alert_component_check CHECK (component IN ('stripe', 'mollie', 'resend', 'worker', 'queue', 'site', 'fx', 'neon', 'backup', 'push', 'email', 'alerts')),
  CONSTRAINT ops_alert_subject_check CHECK ((order_id IS NULL) <> (component IS NULL)),
  CONSTRAINT ops_alert_mode_check CHECK (mode IN ('test', 'live')),
  CONSTRAINT ops_alert_status_check CHECK (status IN ('open', 'acknowledged', 'resolved')),
  CONSTRAINT ops_alert_occurrences_check CHECK (occurrences >= 1),
  CONSTRAINT ops_alert_reopen_count_check CHECK (reopen_count >= 0),
  CONSTRAINT ops_alert_resolution_check CHECK (resolution IN ('condition_cleared', 'fixed', 'false_alarm', 'accepted_risk')),
  CONSTRAINT ops_alert_resolved_check CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CONSTRAINT ops_alert_acknowledged_by_check CHECK (char_length(acknowledged_by) BETWEEN 1 AND 80),
  CONSTRAINT ops_alert_resolved_by_check CHECK (char_length(resolved_by) BETWEEN 1 AND 80),
  CONSTRAINT ops_alert_context_check CHECK (jsonb_typeof(context) = 'object'),
  CONSTRAINT ops_alert_pages_24h_check CHECK (pages_24h >= 0),
  CONSTRAINT ops_alert_clear_runs_check CHECK (clear_runs >= 0)
);

COMMENT ON TABLE public.ops_alert IS
  'Spec 025 §5.1: one row per open alert fingerprint. Written only by src/modules/ops (raiseAlert, clearCondition, acknowledge, resolve). context is a closed key set: no personal data, no free text.';

CREATE UNIQUE INDEX ops_alert_open_fingerprint_key
  ON public.ops_alert (environment, fingerprint) WHERE status <> 'resolved';
CREATE INDEX ops_alert_status_severity_last_seen_idx
  ON public.ops_alert (status, severity, last_seen_at DESC);
CREATE INDEX ops_alert_order_id_idx ON public.ops_alert (order_id);
CREATE INDEX ops_alert_fingerprint_resolved_idx
  ON public.ops_alert (environment, fingerprint, resolved_at DESC) WHERE status = 'resolved';

CREATE TRIGGER ops_alert_updated_at
  BEFORE UPDATE ON public.ops_alert
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------------------------------------------------------------------------
 * 2. ops_alert_notification
 * ------------------------------------------------------------------------ */

CREATE TABLE public.ops_alert_notification (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id                 uuid        NOT NULL,
  channel                  text        NOT NULL,
  kind                     text        NOT NULL,
  priority                 smallint    NULL,
  recipient                text        NOT NULL,
  status                   text        NOT NULL,
  skip_reason              text        NULL,
  provider_ref             text        NULL,
  error_class              text        NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  receipt_acknowledged_at  timestamptz NULL,
  receipt_checked_at       timestamptz NULL,
  CONSTRAINT ops_alert_notification_alert_id_ops_alert_id_fk FOREIGN KEY (alert_id)
    REFERENCES public.ops_alert (id) ON DELETE CASCADE,
  CONSTRAINT ops_alert_notification_channel_check CHECK (channel IN ('push', 'email')),
  CONSTRAINT ops_alert_notification_kind_check CHECK (kind IN ('raise', 'reminder', 'escalation', 'bump', 'held_digest', 'resolve', 'test')),
  CONSTRAINT ops_alert_notification_priority_check CHECK (priority BETWEEN -2 AND 2),
  CONSTRAINT ops_alert_notification_recipient_check CHECK (recipient IN ('primary', 'backup', 'email')),
  CONSTRAINT ops_alert_notification_status_check CHECK (status IN ('sent', 'failed', 'held', 'skipped')),
  CONSTRAINT ops_alert_notification_skip_reason_check CHECK (skip_reason IN ('quiet_hours', 'storm', 'not_configured', 'push_disabled', 'severity')),
  CONSTRAINT ops_alert_notification_provider_ref_check CHECK (char_length(provider_ref) BETWEEN 1 AND 200),
  CONSTRAINT ops_alert_notification_error_class_check CHECK (error_class ~ '^[A-Za-z_]+(:[0-9]{3})?$')
);

COMMENT ON TABLE public.ops_alert_notification IS
  'Spec 025 §5.1: each push or email decided for an alert (sent, failed, held or skipped). error_class is a class name and an HTTP status only, never a message.';

CREATE INDEX ops_alert_notification_alert_id_idx
  ON public.ops_alert_notification (alert_id, created_at);
CREATE INDEX ops_alert_notification_channel_created_idx
  ON public.ops_alert_notification (channel, created_at DESC);

/* ---------------------------------------------------------------------------
 * 3. ops_alert_setting
 * ------------------------------------------------------------------------ */

CREATE TABLE public.ops_alert_setting (
  id          smallint    PRIMARY KEY DEFAULT 1,
  quiet_start time        NOT NULL DEFAULT '23:00',
  quiet_end   time        NOT NULL DEFAULT '07:00',
  time_zone   text        NOT NULL DEFAULT 'Asia/Karachi',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text        NULL,
  CONSTRAINT ops_alert_setting_id_check CHECK (id = 1),
  CONSTRAINT ops_alert_setting_window_check CHECK (quiet_start <> quiet_end),
  CONSTRAINT ops_alert_setting_time_zone_check CHECK (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'),
  CONSTRAINT ops_alert_setting_updated_by_check CHECK (char_length(updated_by) BETWEEN 1 AND 80)
);

COMMENT ON TABLE public.ops_alert_setting IS
  'Spec 025 §5.1: the one row of quiet hours (may span midnight) in an IANA zone, edited in admin with an audit_log row.';

INSERT INTO public.ops_alert_setting (id) VALUES (1);

/* ---------------------------------------------------------------------------
 * 4. RLS: staff only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.ops_alert ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_alert_staff ON public.ops_alert FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.ops_alert_notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_alert_notification_staff ON public.ops_alert_notification FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

ALTER TABLE public.ops_alert_setting ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_alert_setting_staff ON public.ops_alert_setting FOR ALL TO app_web
  USING (app_is_staff()) WITH CHECK (app_is_staff());

/* ---------------------------------------------------------------------------
 * 5. retention
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note)
VALUES ('ops_alert', 'ops_alert', 'Art. 6(1)(f) legitimate interest (operational monitoring)', 365, 'delete',
        'Spec 025 §5.1: a resolved alert and its notifications are deleted 12 months after the resolve; an open alert is never swept. No personal data is stored.');

/* ---------------------------------------------------------------------------
 * 6. flag
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('alerts.push', 'Founder alerts are pushed to the phone (spec 025). Production pushes unless this is turned off; staging and preview push only while it is on. Email is always sent.', false);

RESET ROLE;
