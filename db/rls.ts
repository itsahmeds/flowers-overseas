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
 * The build role (spec 012b §5.1 item 1, AC-4; migration `0018_catalogue_build_role`, TASK-292).
 * `next build` connects as `app_build`, which may `SELECT` exactly these tables and write nothing:
 * the public reference set above without the order machine's two reference tables (no order
 * table of any kind, §5.1), plus the two flag tables the build reads to decide which flagged
 * routes exist. Each has a `<table>_build_read` policy `TO app_build`.
 */
export const BUILD_ROLE = "app_build";

export const BUILD_ROLE_READ_TABLES = [
  ...PUBLIC_REFERENCE_TABLES.filter(
    (table) => table !== "order_status" && table !== "order_transition",
  ),
  "feature_flag",
  "feature_flag_scope",
].sort();

/** The build role's filtered reads: the same rows a public render sees (`PUBLIC_FILTERED_TABLES`). */
export const BUILD_ROLE_FILTERED_TABLES = PUBLIC_FILTERED_TABLES;

/**
 * Partner-scoped (`app.role = 'partner'`, the row's partner in `app.partner_ids`). `write` tables
 * are the partner's own availability (`FOR ALL`): coverage and blackouts, nothing with money in
 * it. Everything else is read-only, because order, assignment and money records change only
 * through spec 010's engine and the payments module, in a system transaction (spec 011 §2: "the
 * partner role is read-only on every order table"; review round 1, item 2: the catalogue mapping
 * holds `partner_payout_minor`, so it is read-only too). `delivery_proof` and `substitution_note`
 * are visible only while the partner's offer is open or accepted. `"order"` and `order_line` are
 * not here: partners read them through `PARTNER_VIEWS`.
 */
export const PARTNER_SCOPED_TABLES = {
  fulfillment_partner: "read",
  partner_translation: "read",
  partner_member: "read",
  partner_coverage: "write",
  partner_blackout: "write",
  partner_catalog_mapping: "read",
  payout: "read",
  payout_line: "read",
  order_assignment: "read",
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
  delivery_proof: "read",
  substitution_note: "read",
  payment: "read",
  refund: "read",
  // spec 018 §5.1 (migration `0021_post_purchase`, TASK-337): the buyer's own invoices and
  // credit notes, read-only (an invoice never changes).
  invoice: "read",
} as const;

/**
 * The column-limited read paths: `security_barrier` views owned by `app_owner`, filtered by a
 * `SECURITY DEFINER` lookup, `SELECT` only for `app_web`. Each lists exactly the columns it shows.
 */
export const PARTNER_VIEWS = {
  partner_order: [
    "id",
    "status",
    "mode",
    "destination_country_id",
    "destination_city_id",
    "destination_postcode",
    "delivery_date",
    "delivery_window",
    "recipient_snapshot",
    "created_at",
    "updated_at",
  ],
  partner_order_line: [
    "id",
    "order_id",
    "kind",
    "product_id",
    "addon_id",
    "tier_key",
    "qty",
    "partner_payout_minor",
    "payout_currency_code",
  ],
} as const;

/** The buyer's order timeline without the internal payload and actor (review round 1, nit 3). */
export const CUSTOMER_VIEWS = {
  customer_order_event: [
    "order_id",
    "seq",
    "type",
    "from_status",
    "to_status",
    "occurred_at",
  ],
} as const;

/** Columns a partner must never read, whatever the path (spec 002 §8). */
export const PARTNER_FORBIDDEN_COLUMNS = [
  "buyer_snapshot",
  "customer_id",
  "public_token",
  "buyer_total_minor",
  "base_total_minor",
  "unit_retail_minor",
  // spec 010 §14 A-founder-2026-10-22 (AC-69): the purchase would name a florist's sibling orders.
  "purchase_id",
] as const;

/** Readable by the signed-in person themself (`customer` or `partner` role, `app.user_id` matches). */
export const SELF_SCOPED_TABLES = [
  "users",
  "user_role",
  "partner_member",
] as const;

/** Staff only (`admin`, `system`): no other policy. */
export const STAFF_ONLY_TABLES = [
  "accounts",
  // spec 012 (migration `0014_admin_identity`, TASK-217): the admin profile and the sign-in
  // core's send log. RLS and the staff policy are in `0014` itself, not in `0011`.
  "admin_profile",
  "audit_log",
  "auth_email_send",
  "consent_log",
  "db_usage_sample",
  "feature_flag",
  "feature_flag_scope",
  // spec 018 §5.1 (migration `0021_post_purchase`, TASK-337): the issuer's VAT registrations,
  // the invoice profiles and the numbering series are admin and system only; `public` reads none.
  "invoice_profile",
  "invoice_series",
  "message_catalog",
  "order_event",
  "outbox",
  "outbox_attempt",
  "partner_application",
  // spec 013 / spec 002 §14 A7.5 (migration `0017_payments_a7`, TASK-254): a chargeback on a
  // payment. Partners, customers and the public read nothing.
  "payment_dispute",
  "retention_policy",
  "sessions",
  "tax_registration",
  "verification_tokens",
  "webhook_inbox",
] as const;

/**
 * The system role only (`app.role = 'system'`): one policy, `<table>_system`, and no staff policy
 * either, so not even an admin session reads them. Spec 010 §5.1 B (migration
 * `0015_checkout_draft`, TASK-203): an unfinished checkout holds a stranger's typed details for at
 * most 24 hours and only the checkout's own system transactions read it.
 */
export const SYSTEM_ONLY_TABLES = [
  "checkout_draft",
  // spec 010 §14 A-founder-2026-10-22 (migration `0020_checkout_draft_lines`, TASK-348): a
  // basket's lines, with the same single policy as their draft.
  "checkout_draft_line",
  // spec 002 §14 A7.7 (migration `0017_payments_a7`, TASK-254): one row per outbox target, read
  // and written only by the dispatcher's system transactions.
  "outbox_delivery",
] as const;

/**
 * The system role writes, an admin session reads, nobody else sees a row: one `<table>_system`
 * policy (all, `app.role = 'system'`) and one `<table>_admin` policy (select, `app.role =
 * 'admin'`), and no staff policy, so an admin cannot write one. Spec 010 §14 A-founder-2026-10-22
 * item 2 A (migration `0019_purchase`, TASK-347): a purchase groups a buyer's orders, so no
 * partner, customer or public policy exists and a florist never sees a sibling order through it.
 */
export const SYSTEM_WRITE_ADMIN_READ_TABLES = ["purchase"] as const;

/**
 * Tables without RLS, and why. `schema_migrations` is the runner's bookkeeping: created and owned
 * by the connecting login, granted to nobody, absent from `db/schema/` (`db/migrations/README.md`).
 */
export const RLS_EXEMPT_TABLES = {
  schema_migrations:
    "migration runner bookkeeping; owned by the connecting login, no grant to app_web",
} as const;
