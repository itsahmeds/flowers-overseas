/**
 * Drizzle definitions for the admin identity tables — `admin_profile` and `auth_email_send`
 * (spec 012 §2.2, §5.1 `NNNN_admin_identity`; migration `0014_admin_identity.sql`; TASK-217).
 *
 * `admin_profile` is what makes a `users` row an admin (with at least one `user_role`);
 * `auth_email_send` is the sign-in core's send log, keyed by the SHA-256 of the normalised
 * address, for both surfaces.
 *
 * `admin_order_action` (spec 020a §5.1, migration `0031_admin_order_actions.sql`; TASK-359) is the
 * record of each admin order action that took effect: its primary key is the form's `actionId`
 * (the idempotency key), it is append-only by trigger and audited by spec 012's trigger, and it
 * holds ids, a reason code and money only.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { currency } from "./geo.ts";
import { timestamps } from "./i18n.ts";
import { notificationDelivery } from "./notifications.ts";
import { order } from "./orders.ts";
import { fulfillmentPartner } from "./partners.ts";

export const adminProfile = pgTable(
  "admin_profile",
  {
    userId: uuid("user_id").primaryKey(),
    displayName: text("display_name").notNull(),
    timeZone: text("time_zone").notNull().default("Europe/Tallinn"),
    deactivatedAt: timestamp("deactivated_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "admin_profile_user_id_users_id_fk",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    check(
      "admin_profile_display_name_check",
      sql`char_length(${table.displayName}) between 2 and 80`,
    ),
  ],
);

export const authEmailSend = pgTable(
  "auth_email_send",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifierHash: char("identifier_hash", { length: 64 }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_email_send_identifier_hash_sent_at_idx").on(
      table.identifierHash,
      table.sentAt,
    ),
    check(
      "auth_email_send_identifier_hash_check",
      sql.raw(`identifier_hash ~ '^[0-9a-f]{64}$'`),
    ),
  ],
);

/** `admin_order_action.kind` (spec 020a §5.1). */
export const adminOrderActionKindValues = [
  "reroute",
  "cancel",
  "refund_full",
  "refund_partial",
  "resend",
] as const;

export const adminOrderAction = pgTable(
  "admin_order_action",
  {
    id: uuid("id").primaryKey(),
    orderId: uuid("order_id").notNull(),
    kind: text("kind").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    reason: text("reason"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
    currencyCode: text("currency_code"),
    partnerId: uuid("partner_id"),
    notificationDeliveryId: uuid("notification_delivery_id"),
    resultRef: text("result_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "admin_order_action_order_id_order_id_fk",
      columns: [table.orderId],
      foreignColumns: [order.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "admin_order_action_actor_user_id_users_id_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "admin_order_action_currency_code_currency_code_fk",
      columns: [table.currencyCode],
      foreignColumns: [currency.code],
    }).onDelete("restrict"),
    foreignKey({
      name: "admin_order_action_partner_id_fulfillment_partner_id_fk",
      columns: [table.partnerId],
      foreignColumns: [fulfillmentPartner.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "admin_order_action_notification_delivery_id_fk",
      columns: [table.notificationDeliveryId],
      foreignColumns: [notificationDelivery.id],
    }).onDelete("restrict"),
    index("admin_order_action_order_id_created_at_idx").on(
      table.orderId,
      table.createdAt,
    ),
    check(
      "admin_order_action_kind_check",
      sql.raw(
        `kind in (${adminOrderActionKindValues.map((kind) => `'${kind}'`).join(", ")})`,
      ),
    ),
    check(
      "admin_order_action_amount_minor_check",
      sql`${table.amountMinor} > 0`,
    ),
    check(
      "admin_order_action_money_pair_check",
      sql`(${table.amountMinor} is null) = (${table.currencyCode} is null)`,
    ),
    check("admin_order_action_result_ref_check", sql`${table.resultRef} <> ''`),
  ],
);
