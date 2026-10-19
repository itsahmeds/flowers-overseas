/**
 * Drizzle definition for `checkout_draft` (spec 010 §5.1 B `NNNN_checkout_draft`; migration
 * `0015_checkout_draft.sql`; TASK-203).
 *
 * The typed mirror of the migration: an unfinished checkout, keyed by the SHA-256 of the
 * `fo_checkout` cookie's token (never the token), with the selection, the steps' values, spec
 * 005's signed quote and the two amounts the price-changed notice compares. `order_id UNIQUE` is
 * placement's idempotency key. The service that reads and writes it is
 * `src/modules/checkout/draft.ts`; nothing else does.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { product } from "./catalog.ts";
import { country, currency } from "./geo.ts";
import { locale, timestamps } from "./i18n.ts";
import { order } from "./orders.ts";

/** The three modes a draft is started in (spec 010 §5.2); `closed` never starts one. */
export const checkoutDraftModes = ["demo", "test", "live"] as const;

export const checkoutDraft = pgTable(
  "checkout_draft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenSha256: text("token_sha256").notNull(),
    localeCode: text("locale_code").notNull(),
    destinationCountryId: uuid("destination_country_id").notNull(),
    productId: uuid("product_id").notNull(),
    tierKey: text("tier_key").notNull(),
    deliveryDate: date("delivery_date", { mode: "string" }),
    addonKeys: text("addon_keys")
      .array()
      .notNull()
      .default(sql`'{}'`),
    recipient: jsonb("recipient"),
    buyer: jsonb("buyer"),
    card: jsonb("card"),
    quote: jsonb("quote"),
    expectedTotalMinor: bigint("expected_total_minor", { mode: "bigint" }),
    expectedCurrencyCode: text("expected_currency_code"),
    confirmedTotalMinor: bigint("confirmed_total_minor", { mode: "bigint" }),
    confirmedCurrencyCode: text("confirmed_currency_code"),
    mode: text("mode", { enum: checkoutDraftModes }).notNull(),
    stepsCompleted: smallint("steps_completed").notNull().default(0),
    orderId: uuid("order_id"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("checkout_draft_token_sha256_key").on(table.tokenSha256),
    unique("checkout_draft_order_id_key").on(table.orderId),
    foreignKey({
      name: "checkout_draft_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
    }),
    foreignKey({
      name: "checkout_draft_destination_country_id_country_id_fk",
      columns: [table.destinationCountryId],
      foreignColumns: [country.id],
    }),
    foreignKey({
      name: "checkout_draft_product_id_product_id_fk",
      columns: [table.productId],
      foreignColumns: [product.id],
    }),
    foreignKey({
      name: "checkout_draft_expected_currency_code_currency_code_fk",
      columns: [table.expectedCurrencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_confirmed_currency_code_currency_code_fk",
      columns: [table.confirmedCurrencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_order_id_order_id_fk",
      columns: [table.orderId],
      foreignColumns: [order.id],
    }).onDelete("cascade"),
    check(
      "checkout_draft_token_sha256_check",
      sql`${table.tokenSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "checkout_draft_tier_key_check",
      sql`char_length(${table.tierKey}) between 1 and 64`,
    ),
    check(
      "checkout_draft_mode_check",
      sql`${table.mode} in ('demo', 'test', 'live')`,
    ),
    check(
      "checkout_draft_steps_completed_check",
      sql`${table.stepsCompleted} between 0 and 3`,
    ),
    check(
      "checkout_draft_expected_pair_check",
      sql`(${table.expectedTotalMinor} is null) = (${table.expectedCurrencyCode} is null) and (${table.expectedTotalMinor} is null or ${table.expectedTotalMinor} >= 0)`,
    ),
    check(
      "checkout_draft_confirmed_pair_check",
      sql`(${table.confirmedTotalMinor} is null) = (${table.confirmedCurrencyCode} is null) and (${table.confirmedTotalMinor} is null or ${table.confirmedTotalMinor} >= 0)`,
    ),
    check(
      "checkout_draft_expires_at_check",
      sql`${table.expiresAt} > ${table.lastActivityAt}`,
    ),
    index("checkout_draft_expires_at_idx").on(table.expiresAt),
  ],
);
