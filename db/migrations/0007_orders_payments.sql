-- 0007_orders_payments — the order machine as reference data, the order tables, and the payment
-- tables (spec 002 §5.1 "`orders`" and "`payments`", §8, AC-14; §14 A6; spec 010 §5.1 A;
-- `plan/11` §2, §3; `plan/01` §9; TASK-019).
--
-- Twelve tables, in dependency order:
--
--   reference  `order_status` (26 rows, A6.4) and `order_transition` (73 rows, A6.3), seeded
--              here because they are the machine itself: spec 010's engine and `0008`'s trigger
--              read legality from them, never from code (ADR-0009);
--   orders     `"order"`, `order_line`, `order_event`, `order_assignment`, `substitution_note`,
--              `delivery_proof`, `review`;
--   payments   `payment`, `refund`, `webhook_inbox`;
--
-- and one deferred key: `payout_line.order_id → "order".id` (`0005` could not add it).
--
-- What is *not* here: the integrity triggers (append-only events, the status-write switch, the
-- initial-status and assignment-mode guards, the delivery-photo asset guard) are `0008`
-- (TASK-020); RLS is `0011` (TASK-023). No order, payment or review row is seeded: §6 makes a
-- fabricated `aggregateRating` impossible by the absence of data.
--
-- The properties this migration is measured on
-- ---------------------------------------------
--
--   1. **The machine is data.** `order_transition(from_status, event, to_status, allowed_actors)`
--      holds exactly A6.3's rows with its sets expanded, keyed `(from_status, event)` so every row
--      has one target. `event` holds `plan/11` §2 catalogue names as amended by A6.6, never arrow
--      labels (ruling R8). `allowed_actors` replaces §5.1's `requires_actor` (A6.2). Every state
--      carries its buyer-visible projection and its terminal flag (A6.4), and
--      `tests/unit/schema-orders-payments.test.ts` / the integration suite compare both tables
--      with `tests/fixtures/order-machine.ts` in both directions (AC-14, T-14).
--   2. **Money is a pair, in the buyer's currency.** Every `*_minor` is `bigint` beside a currency
--      column with an FK to `currency` (AC-5). An order line, a payment and the payment's refunds
--      reference their parent by `(id, currency)`, so a line or a refund in another currency than
--      its order cannot be written.
--   3. **History is a snapshot** (`plan/11` §3). `recipient_snapshot` and `buyer_snapshot` are what
--      was typed at checkout; later address-book edits cannot rewrite an order. The snapshot is
--      the one place recipient contact survives the 90-day sweep, pseudonymised in place (§8).
--   4. **Every order says whether it is real** (spec 010 §5.1 A). `mode` has no default; a `live`
--      order cannot exist without the terms version the buyer accepted.
--   5. **Store before process** (`plan/01` §9). `webhook_inbox` is unique on `(provider,
--      event_id)`, so a provider's retry is a duplicate key, not a second charge.
--
-- **Deviations from §5.1's text, declared rather than silent**
--
--   - `order_transition.requires_actor` is `allowed_actors text[]` (A6.2, approved).
--   - Values §5.1 leaves open are closed lists here, because AC-7 requires a CHECK list on every
--     status column: `payment.status`, `refund.status` (`succeeded` is the value A6.4 names).
--   - `"order".status` defaults to `placed`, the only status an insert may carry (`0008`).
--   - Tables that are updated carry `created_at` / `updated_at` with the shared trigger (AC-10);
--     `order_event` is append-only and carries `occurred_at` alone.
--
-- Rollback: `0007_orders_payments.down.sql`.

SET LOCAL ROLE app_owner;

/* ---------------------------------------------------------------------------
 * order_status — every state of plan/11 §2 as amended by A6.4 (26 rows)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_status (
  key              text PRIMARY KEY,
  is_terminal      boolean     NOT NULL,
  buyer_projection text        NOT NULL,
  CONSTRAINT order_status_key_check CHECK (key ~ '^[a-z][a-z_]*[a-z]$'),
  CONSTRAINT order_status_buyer_projection_check CHECK (buyer_projection IN (
    'placed', 'confirmed', 'with_florist', 'being_made', 'on_its_way', 'delivered', 'closed',
    'cancelled'
  ))
);

INSERT INTO public.order_status (key, is_terminal, buyer_projection) VALUES
  ('placed',               false, 'placed'),
  ('authorised',           false, 'confirmed'),
  ('paid_unrouted',        false, 'confirmed'),
  ('routed',               false, 'confirmed'),
  ('no_partner_available', false, 'confirmed'),
  ('manual_reroute',       false, 'confirmed'),
  ('accepted',             false, 'with_florist'),
  ('paid',                 false, 'with_florist'),
  ('in_production',        false, 'being_made'),
  ('awaiting_buyer',       false, 'being_made'),
  ('out_for_delivery',     false, 'on_its_way'),
  ('delivery_failed',      false, 'on_its_way'),
  ('redelivery_scheduled', false, 'on_its_way'),
  ('delivered',            false, 'delivered'),
  ('photo_uploaded',       false, 'delivered'),
  ('disputed',             false, 'delivered'),
  ('closed',               false, 'closed'),
  ('resolved',             false, 'closed'),
  ('refunded_full',        false, 'closed'),
  ('chargeback_open',      false, 'closed'),
  ('chargeback_won',       true,  'closed'),
  ('chargeback_lost',      true,  'closed'),
  ('payment_failed',       true,  'cancelled'),
  ('abandoned',            true,  'cancelled'),
  ('cancelled',            true,  'cancelled'),
  ('cancelled_refunded',   true,  'cancelled');

/* ---------------------------------------------------------------------------
 * order_transition — A6.3, sets expanded (73 rows)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_transition (
  from_status    text        NOT NULL,
  event          text        NOT NULL,
  to_status      text        NOT NULL,
  allowed_actors text[]      NOT NULL,
  CONSTRAINT order_transition_pkey PRIMARY KEY (from_status, event),
  CONSTRAINT order_transition_from_status_order_status_key_fk FOREIGN KEY (from_status)
    REFERENCES public.order_status (key) ON DELETE RESTRICT,
  CONSTRAINT order_transition_to_status_order_status_key_fk FOREIGN KEY (to_status)
    REFERENCES public.order_status (key) ON DELETE RESTRICT,
  CONSTRAINT order_transition_event_check CHECK (event ~ '^(order|assignment)\.[a-z][a-z_]*[a-z]$'),
  CONSTRAINT order_transition_allowed_actors_check CHECK (
    cardinality(allowed_actors) > 0
    AND allowed_actors <@ ARRAY['buyer', 'partner', 'admin', 'system']::text[]
  )
);

CREATE INDEX order_transition_to_status_idx ON public.order_transition USING btree (to_status);

INSERT INTO public.order_transition (from_status, event, to_status, allowed_actors) VALUES
  ('placed', 'order.authorised', 'authorised', ARRAY['system']),
  ('placed', 'order.captured', 'paid_unrouted', ARRAY['system']),
  ('placed', 'order.payment_failed', 'payment_failed', ARRAY['system']),
  ('placed', 'order.abandoned', 'abandoned', ARRAY['system']),
  ('authorised', 'order.routed', 'routed', ARRAY['system']),
  ('paid_unrouted', 'order.routed', 'routed', ARRAY['system']),
  ('routed', 'assignment.accepted', 'accepted', ARRAY['partner', 'admin']),
  ('routed', 'assignment.declined', 'routed', ARRAY['partner', 'admin']),
  ('routed', 'assignment.timed_out', 'routed', ARRAY['system']),
  ('routed', 'order.no_partner_available', 'no_partner_available', ARRAY['system']),
  ('no_partner_available', 'order.manual_reroute', 'manual_reroute', ARRAY['admin']),
  ('manual_reroute', 'order.routed', 'routed', ARRAY['admin', 'system']),
  ('authorised', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin', 'system']),
  ('paid_unrouted', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin', 'system']),
  ('routed', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin', 'system']),
  ('no_partner_available', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin', 'system']),
  ('manual_reroute', 'order.cancelled', 'cancelled', ARRAY['buyer', 'admin', 'system']),
  ('accepted', 'order.captured', 'paid', ARRAY['system']),
  ('accepted', 'order.payment_failed', 'payment_failed', ARRAY['system']),
  ('paid', 'order.in_production', 'in_production', ARRAY['system']),
  ('in_production', 'order.substitution_proposed', 'awaiting_buyer', ARRAY['partner', 'admin']),
  ('awaiting_buyer', 'order.substitution_resolved', 'in_production', ARRAY['buyer', 'admin', 'system']),
  ('in_production', 'order.out_for_delivery', 'out_for_delivery', ARRAY['partner', 'admin']),
  ('out_for_delivery', 'order.delivered', 'delivered', ARRAY['partner', 'admin']),
  ('out_for_delivery', 'order.delivery_failed', 'delivery_failed', ARRAY['partner', 'admin']),
  ('delivery_failed', 'order.redelivery_scheduled', 'redelivery_scheduled', ARRAY['admin']),
  ('redelivery_scheduled', 'order.out_for_delivery', 'out_for_delivery', ARRAY['partner', 'admin']),
  ('redelivery_scheduled', 'order.cancelled_refunded', 'cancelled_refunded', ARRAY['admin']),
  ('delivered', 'order.photo_uploaded', 'photo_uploaded', ARRAY['partner', 'admin']),
  ('photo_uploaded', 'order.closed', 'closed', ARRAY['system']),
  ('delivered', 'order.disputed', 'disputed', ARRAY['buyer', 'admin']),
  ('photo_uploaded', 'order.disputed', 'disputed', ARRAY['buyer', 'admin']),
  ('closed', 'order.disputed', 'disputed', ARRAY['buyer', 'admin']),
  ('disputed', 'order.resolved', 'resolved', ARRAY['admin']),
  ('resolved', 'order.closed', 'closed', ARRAY['admin', 'system']),
  ('paid', 'order.refunded_partial', 'paid', ARRAY['system']),
  ('in_production', 'order.refunded_partial', 'in_production', ARRAY['system']),
  ('awaiting_buyer', 'order.refunded_partial', 'awaiting_buyer', ARRAY['system']),
  ('out_for_delivery', 'order.refunded_partial', 'out_for_delivery', ARRAY['system']),
  ('delivery_failed', 'order.refunded_partial', 'delivery_failed', ARRAY['system']),
  ('redelivery_scheduled', 'order.refunded_partial', 'redelivery_scheduled', ARRAY['system']),
  ('delivered', 'order.refunded_partial', 'delivered', ARRAY['system']),
  ('photo_uploaded', 'order.refunded_partial', 'photo_uploaded', ARRAY['system']),
  ('disputed', 'order.refunded_partial', 'disputed', ARRAY['system']),
  ('resolved', 'order.refunded_partial', 'resolved', ARRAY['system']),
  ('paid', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('in_production', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('awaiting_buyer', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('out_for_delivery', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('delivery_failed', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('redelivery_scheduled', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('delivered', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('photo_uploaded', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('disputed', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('resolved', 'order.refunded_full', 'refunded_full', ARRAY['system']),
  ('cancelled', 'order.refunded_full', 'cancelled', ARRAY['system']),
  ('cancelled_refunded', 'order.refunded_full', 'cancelled_refunded', ARRAY['system']),
  ('refunded_full', 'order.closed', 'closed', ARRAY['system']),
  ('paid', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('in_production', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('awaiting_buyer', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('out_for_delivery', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('delivery_failed', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('redelivery_scheduled', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('delivered', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('photo_uploaded', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('disputed', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('resolved', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('paid_unrouted', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('closed', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('refunded_full', 'order.chargeback_opened', 'chargeback_open', ARRAY['system']),
  ('chargeback_open', 'order.chargeback_won', 'chargeback_won', ARRAY['system']),
  ('chargeback_open', 'order.chargeback_lost', 'chargeback_lost', ARRAY['system']);

/* ---------------------------------------------------------------------------
 * "order" — one buyer, one recipient, one destination, one status
 * ------------------------------------------------------------------------ */

CREATE TABLE public."order" (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token           text        NOT NULL,
  mode                   text        NOT NULL,
  customer_id            uuid        NOT NULL,
  recipient_id           uuid        NOT NULL,
  destination_country_id uuid        NOT NULL,
  destination_city_id    uuid        NULL,
  destination_postcode   text        NULL,
  delivery_date          date        NOT NULL,
  delivery_window        text        NULL,
  status                 text        NOT NULL DEFAULT 'placed',
  buyer_currency_code    text        NOT NULL,
  buyer_total_minor      bigint      NOT NULL,
  fx_rate_ppm            bigint      NULL,
  base_currency_code     text        NOT NULL,
  base_total_minor       bigint      NOT NULL,
  vat_breakdown          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  supply_model           text        NULL,
  terms_version          text        NULL,
  buyer_snapshot         jsonb       NOT NULL,
  recipient_snapshot     jsonb       NOT NULL,
  source                 text        NOT NULL DEFAULT 'real',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_public_token_key UNIQUE (public_token),
  CONSTRAINT order_id_buyer_currency_code_key UNIQUE (id, buyer_currency_code),
  CONSTRAINT order_customer_id_customer_id_fk FOREIGN KEY (customer_id)
    REFERENCES public.customer (id) ON DELETE RESTRICT,
  CONSTRAINT order_recipient_id_recipient_id_fk FOREIGN KEY (recipient_id)
    REFERENCES public.recipient (id) ON DELETE RESTRICT,
  CONSTRAINT order_destination_country_id_country_id_fk FOREIGN KEY (destination_country_id)
    REFERENCES public.country (id) ON DELETE RESTRICT,
  CONSTRAINT order_destination_city_id_city_id_fk FOREIGN KEY (destination_city_id)
    REFERENCES public.city (id) ON DELETE RESTRICT,
  CONSTRAINT order_status_order_status_key_fk FOREIGN KEY (status)
    REFERENCES public.order_status (key) ON DELETE RESTRICT,
  CONSTRAINT order_buyer_currency_code_currency_code_fk FOREIGN KEY (buyer_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT order_base_currency_code_currency_code_fk FOREIGN KEY (base_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT order_public_token_check CHECK (public_token ~ '^[A-Za-z0-9_-]{22,}$'),
  CONSTRAINT order_mode_check CHECK (mode IN ('demo', 'test', 'live')),
  CONSTRAINT order_terms_version_check CHECK (mode <> 'live' OR terms_version IS NOT NULL),
  CONSTRAINT order_buyer_currency_code_check CHECK (buyer_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_base_currency_code_check CHECK (base_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_buyer_total_minor_check CHECK (buyer_total_minor > 0),
  CONSTRAINT order_base_total_minor_check CHECK (base_total_minor > 0),
  CONSTRAINT order_fx_rate_ppm_check CHECK (fx_rate_ppm IS NULL OR fx_rate_ppm > 0),
  CONSTRAINT order_fx_check CHECK (
    buyer_currency_code = base_currency_code OR fx_rate_ppm IS NOT NULL
  ),
  CONSTRAINT order_vat_breakdown_check CHECK (jsonb_typeof(vat_breakdown) = 'array'),
  CONSTRAINT order_supply_model_check CHECK (supply_model IN ('principal', 'agent')),
  CONSTRAINT order_buyer_snapshot_check CHECK (jsonb_typeof(buyer_snapshot) = 'object'),
  CONSTRAINT order_recipient_snapshot_check CHECK (jsonb_typeof(recipient_snapshot) = 'object'),
  CONSTRAINT order_source_check CHECK (source IN ('seed', 'real'))
);

CREATE INDEX order_customer_id_idx ON public."order" USING btree (customer_id);
CREATE INDEX order_recipient_id_idx ON public."order" USING btree (recipient_id);
CREATE INDEX order_status_idx ON public."order" USING btree (status);
CREATE INDEX order_delivery_date_idx
  ON public."order" USING btree (destination_country_id, delivery_date);

COMMENT ON COLUMN public."order".recipient_snapshot IS
  'plan/11 §3: the recipient as typed at checkout; pseudonymised in place by retention.sweep (spec 002 §8), never rewritten by address-book edits.';
COMMENT ON COLUMN public."order".mode IS
  'Spec 010 §5.1 A: demo | test | live, no default. Demo and test orders route only to demo partners (0008).';

/* ---------------------------------------------------------------------------
 * order_line — what was bought, in the order's currency
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_line (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             uuid        NOT NULL,
  kind                 text        NOT NULL,
  product_id           uuid        NULL,
  addon_id             uuid        NULL,
  tier_key             text        NULL,
  qty                  integer     NOT NULL,
  unit_retail_minor    bigint      NOT NULL,
  currency_code        text        NOT NULL,
  partner_payout_minor bigint      NULL,
  payout_currency_code text        NULL,
  vat_rate_bp          integer     NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_line_order_fkey FOREIGN KEY (order_id, currency_code)
    REFERENCES public."order" (id, buyer_currency_code) ON DELETE RESTRICT,
  CONSTRAINT order_line_product_id_product_id_fk FOREIGN KEY (product_id)
    REFERENCES public.product (id) ON DELETE RESTRICT,
  CONSTRAINT order_line_addon_id_addon_id_fk FOREIGN KEY (addon_id)
    REFERENCES public.addon (id) ON DELETE RESTRICT,
  CONSTRAINT order_line_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT order_line_payout_currency_code_currency_code_fk FOREIGN KEY (payout_currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT order_line_kind_check CHECK (kind IN ('product', 'addon', 'surcharge')),
  CONSTRAINT order_line_subject_check CHECK (
    CASE kind
      WHEN 'product' THEN product_id IS NOT NULL AND addon_id IS NULL
      WHEN 'addon' THEN addon_id IS NOT NULL AND product_id IS NULL
      ELSE product_id IS NULL AND addon_id IS NULL
    END
  ),
  CONSTRAINT order_line_qty_check CHECK (qty > 0),
  CONSTRAINT order_line_unit_retail_minor_check CHECK (unit_retail_minor >= 0),
  CONSTRAINT order_line_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_line_payout_check CHECK (
    (partner_payout_minor IS NULL) = (payout_currency_code IS NULL)
    AND (partner_payout_minor IS NULL OR partner_payout_minor >= 0)
  ),
  CONSTRAINT order_line_payout_currency_code_check CHECK (payout_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT order_line_vat_rate_bp_check CHECK (vat_rate_bp BETWEEN 0 AND 10000)
);

CREATE INDEX order_line_order_id_idx ON public.order_line USING btree (order_id);

/* ---------------------------------------------------------------------------
 * order_event — the append-only log (the trigger that makes it so is 0008's)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL,
  seq             integer     NOT NULL,
  type            text        NOT NULL,
  from_status     text        NULL,
  to_status       text        NULL,
  actor           text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  payload_version integer     NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_event_order_id_seq_key UNIQUE (order_id, seq),
  CONSTRAINT order_event_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT order_event_from_status_order_status_key_fk FOREIGN KEY (from_status)
    REFERENCES public.order_status (key) ON DELETE RESTRICT,
  CONSTRAINT order_event_to_status_order_status_key_fk FOREIGN KEY (to_status)
    REFERENCES public.order_status (key) ON DELETE RESTRICT,
  CONSTRAINT order_event_seq_check CHECK (seq >= 1),
  CONSTRAINT order_event_type_check CHECK (type ~ '^[a-z][a-z_]*\.[a-z][a-z_]*[a-z]$'),
  CONSTRAINT order_event_status_pair_check CHECK ((from_status IS NULL) = (to_status IS NULL)),
  CONSTRAINT order_event_actor_check CHECK (actor ~ '^(buyer|partner|admin|system)(:[^[:space:]]+)?$'),
  CONSTRAINT order_event_payload_check CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT order_event_payload_version_check CHECK (payload_version >= 1)
);

/* ---------------------------------------------------------------------------
 * order_assignment — one offer to one partner, numbered per order
 * ------------------------------------------------------------------------ */

CREATE TABLE public.order_assignment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        NOT NULL,
  partner_id     uuid        NOT NULL,
  offered_at     timestamptz NOT NULL DEFAULT now(),
  sla_expires_at timestamptz NOT NULL,
  responded_at   timestamptz NULL,
  response       text        NULL,
  reason         text        NULL,
  attempt        integer     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_assignment_order_id_attempt_key UNIQUE (order_id, attempt),
  CONSTRAINT order_assignment_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT order_assignment_partner_id_fulfillment_partner_id_fk FOREIGN KEY (partner_id)
    REFERENCES public.fulfillment_partner (id) ON DELETE RESTRICT,
  CONSTRAINT order_assignment_response_check CHECK (response IN ('accept', 'decline', 'timeout')),
  CONSTRAINT order_assignment_responded_check CHECK ((response IS NULL) = (responded_at IS NULL)),
  CONSTRAINT order_assignment_sla_check CHECK (sla_expires_at > offered_at),
  CONSTRAINT order_assignment_attempt_check CHECK (attempt >= 1)
);

CREATE INDEX order_assignment_partner_id_idx ON public.order_assignment USING btree (partner_id);

/* ---------------------------------------------------------------------------
 * substitution_note — a florist's proposal and the buyer's answer
 * ------------------------------------------------------------------------ */

CREATE TABLE public.substitution_note (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid        NOT NULL,
  proposed_by    text        NOT NULL,
  proposal_md    text        NOT NULL,
  media_asset_id uuid        NULL,
  resolution     text        NULL,
  resolved_at    timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT substitution_note_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT substitution_note_media_asset_id_media_asset_id_fk FOREIGN KEY (media_asset_id)
    REFERENCES public.media_asset (id) ON DELETE RESTRICT,
  CONSTRAINT substitution_note_resolution_check CHECK (
    resolution IN ('accepted', 'rejected', 'auto_accepted')
  ),
  CONSTRAINT substitution_note_resolved_check CHECK ((resolution IS NULL) = (resolved_at IS NULL)),
  CONSTRAINT substitution_note_proposed_by_check CHECK (
    proposed_by ~ '^(buyer|partner|admin|system)(:[^[:space:]]+)?$'
  )
);

CREATE INDEX substitution_note_order_id_idx ON public.substitution_note USING btree (order_id);

/* ---------------------------------------------------------------------------
 * delivery_proof — the photo, private and EXIF-stripped (0008's trigger enforces it)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.delivery_proof (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid        NOT NULL,
  media_asset_id     uuid        NOT NULL,
  uploaded_by        text        NOT NULL,
  uploaded_at        timestamptz NOT NULL DEFAULT now(),
  approved           boolean     NOT NULL DEFAULT false,
  public_use_consent boolean     NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_proof_media_asset_id_key UNIQUE (media_asset_id),
  CONSTRAINT delivery_proof_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT delivery_proof_media_asset_id_media_asset_id_fk FOREIGN KEY (media_asset_id)
    REFERENCES public.media_asset (id) ON DELETE RESTRICT,
  CONSTRAINT delivery_proof_uploaded_by_check CHECK (
    uploaded_by ~ '^(buyer|partner|admin|system)(:[^[:space:]]+)?$'
  )
);

CREATE INDEX delivery_proof_order_id_idx ON public.delivery_proof USING btree (order_id);

COMMENT ON COLUMN public.delivery_proof.public_use_consent IS
  'Spec 002 §8, plan/07 §1.2: public gallery use only with the recipient''s consent; false by default.';

/* ---------------------------------------------------------------------------
 * review — Omnibus provenance (plan/07 §7); seeded with none (§6)
 * ------------------------------------------------------------------------ */

CREATE TABLE public.review (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid        NULL,
  source            text        NOT NULL,
  rating            smallint    NOT NULL,
  text              text        NULL,
  verified_order    boolean     NOT NULL DEFAULT false,
  moderation_status text        NOT NULL DEFAULT 'pending',
  locale_code       text        NULL,
  published_at      timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_order_id_key UNIQUE (order_id),
  CONSTRAINT review_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT,
  CONSTRAINT review_locale_code_locale_code_fk FOREIGN KEY (locale_code)
    REFERENCES public.locale (code) ON DELETE RESTRICT,
  CONSTRAINT review_source_check CHECK (source IN ('trustpilot', 'internal')),
  CONSTRAINT review_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT review_moderation_status_check CHECK (
    moderation_status IN ('pending', 'published', 'hidden')
  ),
  CONSTRAINT review_verified_order_check CHECK (NOT verified_order OR order_id IS NOT NULL),
  CONSTRAINT review_published_check CHECK (
    moderation_status <> 'published' OR published_at IS NOT NULL
  )
);

/* ---------------------------------------------------------------------------
 * payment — one provider attempt, in the order's currency
 * ------------------------------------------------------------------------ */

CREATE TABLE public.payment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid        NOT NULL,
  provider         text        NOT NULL,
  provider_ref     text        NOT NULL,
  status           text        NOT NULL,
  method           text        NOT NULL,
  amount_minor     bigint      NOT NULL,
  currency_code    text        NOT NULL,
  three_ds_outcome text        NULL,
  risk_score       smallint    NULL,
  captured_at      timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_provider_ref_key UNIQUE (provider_ref),
  CONSTRAINT payment_id_currency_code_key UNIQUE (id, currency_code),
  CONSTRAINT payment_order_fkey FOREIGN KEY (order_id, currency_code)
    REFERENCES public."order" (id, buyer_currency_code) ON DELETE RESTRICT,
  CONSTRAINT payment_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT payment_provider_check CHECK (provider IN ('stripe', 'mollie')),
  CONSTRAINT payment_status_check CHECK (status IN (
    'pending', 'requires_action', 'authorised', 'captured', 'failed', 'cancelled'
  )),
  CONSTRAINT payment_method_check CHECK (method ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT payment_amount_minor_check CHECK (amount_minor > 0),
  CONSTRAINT payment_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payment_risk_score_check CHECK (risk_score BETWEEN 0 AND 100),
  CONSTRAINT payment_captured_check CHECK (status <> 'captured' OR captured_at IS NOT NULL)
);

CREATE INDEX payment_order_id_idx ON public.payment USING btree (order_id);

/* ---------------------------------------------------------------------------
 * refund — always in its payment's currency
 * ------------------------------------------------------------------------ */

CREATE TABLE public.refund (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    uuid        NOT NULL,
  provider_ref  text        NOT NULL,
  amount_minor  bigint      NOT NULL,
  currency_code text        NOT NULL,
  reason        text        NOT NULL,
  status        text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_provider_ref_key UNIQUE (provider_ref),
  CONSTRAINT refund_payment_fkey FOREIGN KEY (payment_id, currency_code)
    REFERENCES public.payment (id, currency_code) ON DELETE RESTRICT,
  CONSTRAINT refund_currency_code_currency_code_fk FOREIGN KEY (currency_code)
    REFERENCES public.currency (code) ON DELETE RESTRICT,
  CONSTRAINT refund_amount_minor_check CHECK (amount_minor > 0),
  CONSTRAINT refund_currency_code_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT refund_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled'))
);

CREATE INDEX refund_payment_id_idx ON public.refund USING btree (payment_id);

/* ---------------------------------------------------------------------------
 * webhook_inbox — store before process (plan/01 §9), ready for spec 013
 * ------------------------------------------------------------------------ */

CREATE TABLE public.webhook_inbox (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           text        NOT NULL,
  event_id           text        NOT NULL,
  signature_verified boolean     NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz NULL,
  attempts           integer     NOT NULL DEFAULT 0,
  raw                jsonb       NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_inbox_provider_event_id_key UNIQUE (provider, event_id),
  CONSTRAINT webhook_inbox_provider_check CHECK (provider IN ('stripe', 'mollie')),
  CONSTRAINT webhook_inbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT webhook_inbox_processed_check CHECK (processed_at IS NULL OR signature_verified)
);

CREATE INDEX webhook_inbox_unprocessed_idx
  ON public.webhook_inbox USING btree (received_at) WHERE processed_at IS NULL;

/* ---------------------------------------------------------------------------
 * the deferred key of 0005: a payout line names a real order
 * ------------------------------------------------------------------------ */

ALTER TABLE public.payout_line
  ADD CONSTRAINT payout_line_order_id_order_id_fk FOREIGN KEY (order_id)
    REFERENCES public."order" (id) ON DELETE RESTRICT;

/* ---------------------------------------------------------------------------
 * updated_at (AC-10)
 * ------------------------------------------------------------------------ */

CREATE TRIGGER order_set_updated_at BEFORE UPDATE ON public."order"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_line_set_updated_at BEFORE UPDATE ON public.order_line
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER order_assignment_set_updated_at BEFORE UPDATE ON public.order_assignment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER substitution_note_set_updated_at BEFORE UPDATE ON public.substitution_note
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER delivery_proof_set_updated_at BEFORE UPDATE ON public.delivery_proof
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER review_set_updated_at BEFORE UPDATE ON public.review
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER payment_set_updated_at BEFORE UPDATE ON public.payment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER refund_set_updated_at BEFORE UPDATE ON public.refund
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER webhook_inbox_set_updated_at BEFORE UPDATE ON public.webhook_inbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

RESET ROLE;
