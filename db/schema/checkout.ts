/**
 * Drizzle definitions for `checkout_draft` and `checkout_draft_line` (spec 010 §5.1 B
 * `NNNN_checkout_draft`, migration `0015_checkout_draft.sql`, TASK-203; reshaped by spec 010 §14
 * A-founder-2026-10-22 item 2 B, migration `0020_checkout_draft_lines.sql`, TASK-348).
 *
 * The typed mirror of the migrations. A draft is a basket: keyed by the SHA-256 of the
 * `fo_checkout` cookie's token (never the token), it holds the basket-level fields (locale, mode,
 * the basket's currency, the buyer, the amounts the price-changed notice compares, a pending
 * notice) and one to `BASKET_MAX_LINES` lines. A line is one bouquet for one recipient on one date
 * in one destination: its selection, its recipient and card, its signed quote of spec 005 and the
 * amount the buyer last saw for it. `purchase_id UNIQUE` is placement's idempotency key. The
 * service that reads and writes both is `src/modules/checkout/draft.ts`; nothing else does.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { order, purchase } from "./orders.ts";

/** The three modes a draft is started in (spec 010 §5.2); `closed` never starts one. */
export const checkoutDraftModes = ["demo", "test", "live"] as const;

/** The notices the start route leaves for the next basket render (§14 A-founder-2026-10-22). */
export const checkoutDraftPendingNotices = [
  "added",
  "full",
  "other_mode",
  "other_currency",
] as const;

export const checkoutDraft = pgTable(
  "checkout_draft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenSha256: text("token_sha256").notNull(),
    localeCode: text("locale_code").notNull(),
    buyer: jsonb("buyer"),
    expectedTotalMinor: bigint("expected_total_minor", { mode: "bigint" }),
    expectedCurrencyCode: text("expected_currency_code"),
    confirmedTotalMinor: bigint("confirmed_total_minor", { mode: "bigint" }),
    confirmedCurrencyCode: text("confirmed_currency_code"),
    mode: text("mode", { enum: checkoutDraftModes }).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
    /** The basket's currency, set by its first line (`0020`). */
    currencyCode: text("currency_code"),
    buyerSaved: boolean("buyer_saved").notNull().default(false),
    pendingNotice: text("pending_notice", {
      enum: checkoutDraftPendingNotices,
    }),
    purchaseId: uuid("purchase_id"),
  },
  (table) => [
    unique("checkout_draft_token_sha256_key").on(table.tokenSha256),
    unique("checkout_draft_purchase_id_key").on(table.purchaseId),
    foreignKey({
      name: "checkout_draft_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
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
      name: "checkout_draft_currency_code_currency_code_fk",
      columns: [table.currencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_purchase_id_purchase_id_fk",
      columns: [table.purchaseId],
      foreignColumns: [purchase.id],
    }),
    check(
      "checkout_draft_token_sha256_check",
      sql`${table.tokenSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "checkout_draft_mode_check",
      sql`${table.mode} in ('demo', 'test', 'live')`,
    ),
    check(
      "checkout_draft_pending_notice_check",
      sql`${table.pendingNotice} in ('added', 'full', 'other_mode', 'other_currency')`,
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

export const checkoutDraftLine = pgTable(
  "checkout_draft_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id").notNull(),
    /** 1 to `BASKET_MAX_LINES`; the migration's `BETWEEN 1 AND 5` is pinned equal to it. */
    position: smallint("position").notNull(),
    destinationCountryId: uuid("destination_country_id").notNull(),
    productId: uuid("product_id").notNull(),
    tierKey: text("tier_key").notNull(),
    deliveryDate: date("delivery_date", { mode: "string" }),
    addonKeys: text("addon_keys")
      .array()
      .notNull()
      .default(sql`'{}'`),
    recipient: jsonb("recipient"),
    card: jsonb("card"),
    quote: jsonb("quote"),
    lastSeenTotalMinor: bigint("last_seen_total_minor", { mode: "bigint" }),
    lastSeenCurrencyCode: text("last_seen_currency_code"),
    stepsCompleted: smallint("steps_completed").notNull().default(0),
    orderId: uuid("order_id"),
    ...timestamps,
  },
  (table) => [
    unique("checkout_draft_line_draft_id_position_key").on(
      table.draftId,
      table.position,
    ),
    unique("checkout_draft_line_order_id_key").on(table.orderId),
    foreignKey({
      name: "checkout_draft_line_draft_id_checkout_draft_id_fk",
      columns: [table.draftId],
      foreignColumns: [checkoutDraft.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "checkout_draft_line_destination_country_id_country_id_fk",
      columns: [table.destinationCountryId],
      foreignColumns: [country.id],
    }),
    foreignKey({
      name: "checkout_draft_line_product_id_product_id_fk",
      columns: [table.productId],
      foreignColumns: [product.id],
    }),
    foreignKey({
      name: "checkout_draft_line_last_seen_currency_code_currency_code_fk",
      columns: [table.lastSeenCurrencyCode],
      foreignColumns: [currency.code],
    }),
    foreignKey({
      name: "checkout_draft_line_order_id_order_id_fk",
      columns: [table.orderId],
      foreignColumns: [order.id],
    }),
    check(
      "checkout_draft_line_position_check",
      sql`${table.position} between 1 and 5`,
    ),
    check(
      "checkout_draft_line_tier_key_check",
      sql`char_length(${table.tierKey}) between 1 and 64`,
    ),
    check(
      "checkout_draft_line_steps_completed_check",
      sql`${table.stepsCompleted} between 0 and 2`,
    ),
    check(
      "checkout_draft_line_last_seen_pair_check",
      sql`(${table.lastSeenTotalMinor} is null) = (${table.lastSeenCurrencyCode} is null) and (${table.lastSeenTotalMinor} is null or ${table.lastSeenTotalMinor} >= 0)`,
    ),
  ],
);
