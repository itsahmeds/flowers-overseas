/**
 * Drizzle definitions for identity — `users`, `accounts`, `sessions`, `verification_tokens` and
 * `user_role` (spec 002 §5.1 "`auth`", §13 Q1; `plan/11` §1; migration `0010_auth.sql`;
 * TASK-022).
 *
 * Auth.js v5's Drizzle adapter is given these tables (`DrizzleAdapter(db, { usersTable:
 * users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable:
 * verificationTokens })`) and binds to their **property** names, which are exactly the adapter's
 * (`id`, `name`, `email`, `emailVerified`, `image`; `userId`, `type`, `provider`,
 * `providerAccountId`, `refresh_token`, `access_token`, `expires_at`, `token_type`, `scope`,
 * `id_token`, `session_state`; `sessionToken`, `expires`; `identifier`, `token`). Rename none of
 * them. The SQL column names are this schema's snake case. T-35 drives the round trip.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./i18n.ts";

/** `user_role.role` — the admin sub-roles of `plan/11` §1. */
export const adminRoles = ["admin", "ops", "finance", "content"] as const;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", {
      withTimezone: true,
      mode: "date",
    }),
    image: text("image"),
    ...timestamps,
  },
  (table) => [
    unique("users_email_key").on(table.email),
    check(
      "users_email_check",
      sql`${table.email} = lower(${table.email}) and ${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+$'`,
    ),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({
      name: "accounts_pkey",
      columns: [table.provider, table.providerAccountId],
    }),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "verification_tokens_pkey",
      columns: [table.identifier, table.token],
    }),
  ],
);

export const userRole = pgTable(
  "user_role",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "user_role_pkey", columns: [table.userId, table.role] }),
    check(
      "user_role_role_check",
      sql.raw(`role in (${adminRoles.map((r) => `'${r}'`).join(", ")})`),
    ),
  ],
);
