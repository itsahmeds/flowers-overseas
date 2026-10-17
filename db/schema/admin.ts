/**
 * Drizzle definitions for the admin identity tables — `admin_profile` and `auth_email_send`
 * (spec 012 §2.2, §5.1 `NNNN_admin_identity`; migration `0013_admin_identity.sql`; TASK-217).
 *
 * `admin_profile` is what makes a `users` row an admin (with at least one `user_role`);
 * `auth_email_send` is the sign-in core's send log, keyed by the SHA-256 of the normalised
 * address, for both surfaces.
 */
import { sql } from "drizzle-orm";
import {
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
import { timestamps } from "./i18n.ts";

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
