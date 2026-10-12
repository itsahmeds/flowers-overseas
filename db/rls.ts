/**
 * Who may read what: the row-level-security map of migration `0011_rls_policies.sql` (spec 002
 * §2 "RLS and roles", §8, §13 Q4, AC-16, AC-17, AC-18; `plan/07` §1.1; `plan/12` §4; TASK-023).
 *
 * Every application table has RLS enabled and a `<table>_staff` policy (`app.role` `admin` or
 * `system`: everything). Beyond that, a table is in exactly one of the sets below, and the
 * migration grants exactly what its set says. Nothing else is readable: deny by default.
 *
 * `tests/unit/rls-policies.test.ts` holds this file, the migration and the Drizzle mirror equal;
 * `tests/integration/rls-policies.test.ts` proves each set against a migrated database as
 * `app_web`. TASK-027's `db:check` RLS-coverage rule reads `RLS_EXEMPT_TABLES`.
 */

/** Read by anyone, `app.role = 'public'` included: the catalogue and geo reference data. */
export const PUBLIC_REFERENCE_TABLES = [
  "addon",
  "addon_country_price",
  "addon_translation",
  "category",
  "category_translation",
  "city",
  "city_translation",
  "country",
  "country_holiday",
  "country_locale_content",
  "country_price",
  "country_translation",
  "currency",
  "fx_rate",
  "locale",
  "occasion",
  "occasion_country",
  "occasion_translation",
  "order_status",
  "order_transition",
  "postcode_zone",
  "product",
  "product_category",
  "product_media",
  "product_media_alt",
  "product_occasion",
  "product_tier",
  "product_translation",
  "region",
] as const;

/** Read by anyone, but only some rows: the condition is the migration's. */
export const PUBLIC_FILTERED_TABLES = {
  media_asset: "visibility = 'public'",
  media_variant: "its media_asset is readable (public)",
  review: "moderation_status = 'published'",
} as const;

/**
 * Partner-scoped (`app.role = 'partner'`, the row's partner in `app.partner_ids`). `write` tables
 * are the partner's own configuration (`FOR ALL`); the others are read-only, because order and
 * money records change only through spec 010's engine and the payments module, in a system
 * transaction (spec 011 §2: "the partner role is read-only on every order table").
 */
export const PARTNER_SCOPED_TABLES = {
  fulfillment_partner: "read",
  partner_translation: "read",
  partner_member: "read",
  partner_coverage: "write",
  partner_blackout: "write",
  partner_catalog_mapping: "write",
  payout: "read",
  payout_line: "read",
  order_assignment: "read",
  order: "read",
  order_line: "read",
  delivery_proof: "read",
  substitution_note: "read",
} as const;

/**
 * Customer-scoped (`app.role = 'customer'`, through `customer.user_id = app.user_id`). The address
 * book is the buyer's to edit; orders and their records are read-only.
 */
export const CUSTOMER_SCOPED_TABLES = {
  customer: "read_update",
  address: "write",
  recipient: "write",
  recipient_address: "write",
  order: "read",
  order_line: "read",
  order_event: "read",
  delivery_proof: "read",
  substitution_note: "read",
  payment: "read",
  refund: "read",
} as const;

/** Readable by the signed-in person themself, whatever `app.role` (`app.user_id` matches). */
export const SELF_SCOPED_TABLES = [
  "users",
  "user_role",
  "partner_member",
] as const;

/** Staff only (`admin`, `system`): no other policy. */
export const STAFF_ONLY_TABLES = [
  "accounts",
  "audit_log",
  "consent_log",
  "db_usage_sample",
  "feature_flag",
  "feature_flag_scope",
  "message_catalog",
  "outbox",
  "outbox_attempt",
  "partner_application",
  "retention_policy",
  "sessions",
  "verification_tokens",
  "webhook_inbox",
] as const;

/**
 * Tables without RLS, and why. `schema_migrations` is the runner's bookkeeping: created and owned
 * by the connecting login, granted to nobody, absent from `db/schema/` (`db/migrations/README.md`).
 */
export const RLS_EXEMPT_TABLES = {
  schema_migrations:
    "migration runner bookkeeping; owned by the connecting login, no grant to app_web",
} as const;
