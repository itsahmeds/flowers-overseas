/**
 * Drizzle definitions for the `discounts` tables: `discount_code`, `discount_code_currency`,
 * `discount_code_country`, `discount_code_product` and `order_discount` (spec 047 §5.1; migration
 * `0037_discount_codes.sql`; TASK-445).
 *
 * The typed mirror of the migration. What to read off this file:
 *
 *  - **money is integer minor units beside its currency**: a fixed amount and a minimum order per
 *    currency, an order's share in the order currency and in the base currency;
 *  - **percent is basis points**, 100 to 5 000, so no float touches money;
 *  - **the shape of a code** (a fixed code has an amount, a percent code none) is the deferred
 *    constraint trigger `discount_code_shape_check` (`DISCOUNT_SHAPE_INVALID`), which Drizzle does
 *    not model;
 *  - **one row per order** in `order_discount`, holding the order's share of its purchase's
 *    discount (§14 A-orchestrator-2026-10-25 item 2);
 *  - **RLS: staff only** (`admin`, `system`). No florist, buyer or public role reads a code.
 *
 * `order_line.discount_minor` lives in `orders.ts`, the four draft columns in `checkout.ts`.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { product } from "./catalog.ts";
import { country, currency } from "./geo.ts";
import { timestamps } from "./i18n.ts";
import { order } from "./orders.ts";

/** `discount_code.kind` and `order_discount.kind`. */
export const discountKinds = ["percent", "fixed"] as const;
/** `discount_code.status`: the stored half; scheduled, ended and used up are computed. */
export const discountCodeStatuses = ["active", "disabled"] as const;
/** `discount_code.source`: the referral hook (§2); only `admin` is reachable from a screen. */
export const discountCodeSources = ["admin", "referral"] as const;

export const discountCode = pgTable(
  "discount_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    codeNormalised: text("code_normalised").notNull(),
    campaignLabel: text("campaign_label").notNull(),
    kind: text("kind", { enum: discountKinds }).notNull(),
    percentBp: integer("percent_bp"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    maxRedemptions: integer("max_redemptions"),
    maxPerEmail: integer("max_per_email").default(1),
    status: text("status", { enum: discountCodeStatuses })
      .notNull()
      .default("active"),
    source: text("source", { enum: discountCodeSources })
      .notNull()
      .default("admin"),
    issuerRef: text("issuer_ref"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    ...timestamps,
  },
  (table) => [
    unique("discount_code_code_normalised_key").on(table.codeNormalised),
    check(
      "discount_code_code_normalised_check",
      sql`${table.codeNormalised} ~ '^[A-Z0-9]{6,32}$'`,
    ),
    check(
      "discount_code_percent_bp_check",
      sql`${table.percentBp} between 100 and 5000`,
    ),
    check(
      "discount_code_kind_percent_check",
      sql`(${table.kind} = 'percent') = (${table.percentBp} is not null)`,
    ),
    check(
      "discount_code_ends_at_check",
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const discountCodeCurrency = pgTable(
  "discount_code_currency",
  {
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCode.id, { onDelete: "cascade" }),
    currencyCode: text("currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    amountOffMinor: bigint("amount_off_minor", { mode: "bigint" }),
    minOrderMinor: bigint("min_order_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    primaryKey({
      name: "discount_code_currency_pkey",
      columns: [table.discountCodeId, table.currencyCode],
    }),
    check(
      "discount_code_currency_ceiling_check",
      sql`${table.amountOffMinor} is null or ${table.amountOffMinor} * 2 <= ${table.minOrderMinor}`,
    ),
  ],
);

export const discountCodeCountry = pgTable(
  "discount_code_country",
  {
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCode.id, { onDelete: "cascade" }),
    countryId: uuid("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "discount_code_country_pkey",
      columns: [table.discountCodeId, table.countryId],
    }),
    index("discount_code_country_country_id_idx").on(table.countryId),
  ],
);

export const discountCodeProduct = pgTable(
  "discount_code_product",
  {
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCode.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "discount_code_product_pkey",
      columns: [table.discountCodeId, table.productId],
    }),
    index("discount_code_product_product_id_idx").on(table.productId),
  ],
);

export const orderDiscount = pgTable(
  "order_discount",
  {
    orderId: uuid("order_id").primaryKey(),
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCode.id, { onDelete: "restrict" }),
    codeSnapshot: text("code_snapshot").notNull(),
    kind: text("kind", { enum: discountKinds }).notNull(),
    percentBp: integer("percent_bp"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currencyCode: text("currency_code").notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
    baseCurrencyCode: text("base_currency_code")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    emailKeySha256: text("email_key_sha256").notNull(),
    mode: text("mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /** The share is in its order's currency. */
    foreignKey({
      name: "order_discount_order_fkey",
      columns: [table.orderId, table.currencyCode],
      foreignColumns: [order.id, order.buyerCurrencyCode],
    }).onDelete("restrict"),
    check("order_discount_amount_minor_check", sql`${table.amountMinor} > 0`),
    check(
      "order_discount_email_key_sha256_check",
      sql`${table.emailKeySha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "order_discount_mode_check",
      sql`${table.mode} in ('demo', 'test', 'live')`,
    ),
    index("order_discount_code_mode_idx").on(table.discountCodeId, table.mode),
  ],
);
