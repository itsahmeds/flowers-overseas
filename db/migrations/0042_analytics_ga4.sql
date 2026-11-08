-- 0042_analytics_ga4: the GA4 server side's two tables, the 60-day clock on the GA ids and the
-- kill switch (spec 023 §5.1, §12; AC-29, AC-30; TASK-491).
--
-- Numbered 0042 (orchestrator, 2026-11-08): main ends at 0039; 0040 and 0041 are held by TASK-449
-- and TASK-442. If this merges first, the orchestrator renumbers.
--
--   1. `order_analytics`: one row per `test` or `live` order, written after placement by
--      `recordOrderContext`: the consent snapshot, the GA client id and session id (only with
--      analytics consent, by check), and a random `ga_transaction_id` that is neither the order
--      reference nor `order.id`. `ids_cleared_at` is set by the retention sweep.
--   2. `analytics_dispatch`: one row per outbox delivery the `analytics.ga4` handler finished,
--      `sent` or `skipped` with its reason. The partial unique index
--      `analytics_one_purchase_sent` refuses a second sent purchase for one order; `event_id` and
--      `refund_id` are unique, so a redelivery cannot write a second row.
--   3. RLS: `system` only on both (no florist, buyer or admin read in spec 023).
--   4. Retention: `order_analytics_ga_ids` (spec 023 §5.1 names it `order_analytics.ga_ids`;
--      `retention_policy_key_check` takes no dot), 60 days from `created_at`, pseudonymise: the
--      sweep nulls both GA ids and stamps `ids_cleared_at`.
--   5. Flag `analytics.mp_send`, global, off by default: off, every delivery is skipped
--      `disabled` (recorded, never silent).
--
-- No column is added to `order`, `payment`, `refund` or `order_event`; no state or event is added.
-- Rollback: `0042_analytics_ga4.down.sql` (measurement records only, so no guard).

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * 1. order_analytics
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_analytics (
  order_id               uuid PRIMARY KEY,
  analytics_consent      boolean     NOT NULL,
  marketing_consent      boolean     NOT NULL,
  consent_policy_version text        NOT NULL,
  ga_client_id           text        NULL,
  ga_session_id          text        NULL,
  ga_transaction_id      uuid        NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  ids_cleared_at         timestamptz NULL,
  CONSTRAINT order_analytics_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  CONSTRAINT order_analytics_ga_transaction_id_key UNIQUE (ga_transaction_id),
  CONSTRAINT order_analytics_consent_ids_check
    CHECK (analytics_consent OR (ga_client_id IS NULL AND ga_session_id IS NULL)),
  CONSTRAINT order_analytics_session_needs_client_check
    CHECK (ga_session_id IS NULL OR ga_client_id IS NOT NULL),
  CONSTRAINT order_analytics_ga_client_id_check
    CHECK (ga_client_id IS NULL OR ga_client_id ~ '^[0-9]{1,20}\.[0-9]{1,20}$'),
  CONSTRAINT order_analytics_ga_session_id_check
    CHECK (ga_session_id IS NULL OR ga_session_id ~ '^[0-9]{1,20}$'),
  CONSTRAINT order_analytics_consent_policy_version_check
    CHECK (consent_policy_version ~ '^[0-9]{1,6}$')
);

COMMENT ON TABLE public.order_analytics IS
  'Spec 023 §5.1: consent snapshot and GA ids per test or live order; ids only with analytics consent, cleared after 60 days.';

/* ---------------------------------------------------------------------------
 * 2. analytics_dispatch
 * ------------------------------------------------------------------------ */

CREATE TABLE public.analytics_dispatch (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL,
  event_id    uuid        NOT NULL,
  kind        text        NOT NULL,
  refund_id   uuid        NULL,
  outcome     text        NOT NULL,
  skip_reason text        NULL,
  http_status integer     NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_dispatch_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE CASCADE,
  CONSTRAINT analytics_dispatch_event_id_order_event_id_fk FOREIGN KEY (event_id)
    REFERENCES public.order_event (id),
  CONSTRAINT analytics_dispatch_refund_id_refund_id_fk FOREIGN KEY (refund_id)
    REFERENCES public.refund (id),
  CONSTRAINT analytics_dispatch_event_id_key UNIQUE (event_id),
  CONSTRAINT analytics_dispatch_refund_id_key UNIQUE (refund_id),
  CONSTRAINT analytics_dispatch_kind_check CHECK (kind IN ('purchase', 'refund')),
  CONSTRAINT analytics_dispatch_refund_check CHECK ((kind = 'refund') = (refund_id IS NOT NULL)),
  CONSTRAINT analytics_dispatch_outcome_check CHECK (outcome IN ('sent', 'skipped')),
  CONSTRAINT analytics_dispatch_skip_reason_check CHECK (skip_reason IN (
    'no_context', 'no_consent', 'no_client_id', 'not_configured', 'disabled', 'mode_not_live',
    'too_old', 'value_mismatch', 'rejected', 'no_purchase_sent', 'ids_cleared'
  )),
  CONSTRAINT analytics_dispatch_skipped_check CHECK ((outcome = 'skipped') = (skip_reason IS NOT NULL)),
  CONSTRAINT analytics_dispatch_http_status_check CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599)
);

CREATE UNIQUE INDEX analytics_one_purchase_sent ON public.analytics_dispatch (order_id)
  WHERE kind = 'purchase' AND outcome = 'sent';

CREATE INDEX analytics_dispatch_order_id_idx ON public.analytics_dispatch USING btree (order_id);

COMMENT ON TABLE public.analytics_dispatch IS
  'Spec 023 §5.1: one row per finished analytics.ga4 delivery, sent or skipped with its reason; no personal field.';

/* ---------------------------------------------------------------------------
 * 3. RLS: system only
 * ------------------------------------------------------------------------ */

ALTER TABLE public.order_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_analytics_system ON public.order_analytics FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

ALTER TABLE public.analytics_dispatch ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_dispatch_system ON public.analytics_dispatch FOR ALL TO app_web
  USING (public.app_current_role() = 'system')
  WITH CHECK (public.app_current_role() = 'system');

/* ---------------------------------------------------------------------------
 * 4. retention
 * ------------------------------------------------------------------------ */

INSERT INTO public.retention_policy (key, entity_table, basis, retention_days, action, legal_note)
VALUES ('order_analytics_ga_ids', 'order_analytics', 'Art. 6(1)(a) consent', 60, 'pseudonymise',
        'Spec 023 §5.1, §13 Q5: the GA client id and session id held for an order are set to null 60 days after placement (created_at); refunds after that are not sent to GA4.');

/* ---------------------------------------------------------------------------
 * 5. flag
 * ------------------------------------------------------------------------ */

INSERT INTO public.feature_flag (key, description, enabled_default) VALUES
  ('analytics.mp_send', 'Sends purchase and refund to GA4 by Measurement Protocol for buyers who accepted analytics (spec 023). Off: each delivery is recorded as skipped (disabled); nothing is sent.', false);

RESET ROLE;
