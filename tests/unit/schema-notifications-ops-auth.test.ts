/**
 * Migrations `0009` and `0010` read as text, against their Drizzle mirror (spec 002 §5.1
 * "`notifications`", "platform / ops" and "`auth`", §8, §12, §13 Q1 and Q7; spec 010 §5.1 A;
 * `plan/07` §1.2; TASK-021, TASK-022).
 *
 * The connected halves are `tests/integration/schema-notifications-ops.test.ts` (seeds read back,
 * constraints refusing) and `tests/integration/auth-adapter.test.ts` (T-35).
 */
import { describe, expect, it } from "vitest";

import { adminRoles } from "../../db/schema/auth.ts";
import {
  outboxAttemptStatuses,
  outboxStatuses,
} from "../../db/schema/notifications.ts";
import {
  flagScopes,
  retentionActions,
  usageSampleSources,
} from "../../db/schema/ops.ts";
import {
  checkList,
  createdTables,
  droppedTables,
  mirrorShape,
  readMigration,
  sqlShape,
} from "./support/migration-sql.ts";

const ops = readMigration("0009_notifications_ops.sql");
const opsDown = readMigration("0009_notifications_ops.down.sql");
const auth = readMigration("0010_auth.sql");
const authDown = readMigration("0010_auth.down.sql");
/** `0016` (spec 002 §14 A7.7, TASK-254) adds `outbox_attempt.target`. */
const a7 = readMigration("0016_payments_a7.sql");

const OPS_TABLES = [
  "outbox",
  "outbox_attempt",
  "feature_flag",
  "feature_flag_scope",
  "audit_log",
  "retention_policy",
  "db_usage_sample",
] as const;
const AUTH_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  "user_role",
] as const;

/** What `0016_audit_trail` adds to `audit_log` (spec 012 §5.1; TASK-218). */
const AUDIT_TRAIL = {
  columns: ["reason", "channel"],
  checks: [
    "audit_log_channel_check",
    "audit_log_reason_check",
    "audit_log_view_check",
  ],
  indexes: ["audit_log_at_idx", "audit_log_actor_idx", "audit_log_action_idx"],
} as const;

/** `audit_log`'s mirror as `0009` and `0010` alone shape it. */
function withoutAuditTrail(
  shape: ReturnType<typeof mirrorShape>,
): ReturnType<typeof mirrorShape> {
  const drop = (list: readonly string[], names: readonly string[]) =>
    list.filter((name) => !names.includes(name));
  return {
    ...shape,
    columns: shape.columns.filter(
      (column) =>
        !(AUDIT_TRAIL.columns as readonly string[]).includes(column.name),
    ),
    checks: drop(shape.checks, AUDIT_TRAIL.checks),
    indexes: drop(shape.indexes, AUDIT_TRAIL.indexes),
  };
}

/** The rows of `INSERT INTO public.<table> (…) VALUES (…), (…);`, each as its literal values. */
function seeded(sql: string, table: string): string[][] {
  const start = sql.indexOf(`INSERT INTO public.${table} (`);
  if (start < 0) return [];
  const values = sql.indexOf("VALUES", start) + "VALUES".length;
  const rows: string[][] = [];
  let row: string[] = [];
  let token = "";
  let depth = 0;
  for (let i = values; i < sql.length; i += 1) {
    const char = sql[i] ?? "";
    if (char === "'") {
      let literal = "";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          literal += "'";
          i += 2;
        } else if (sql[i] === "'") break;
        else {
          literal += sql[i] ?? "";
          i += 1;
        }
      }
      token = literal;
    } else if (char === "(") depth += 1;
    else if (char === ")" || (char === "," && depth === 1)) {
      row.push(token.trim());
      token = "";
      if (char === ")") {
        depth -= 1;
        rows.push(row);
        row = [];
      }
    } else if (char === ";" && depth === 0) break;
    else if (depth === 1 && /[A-Za-z0-9_]/.test(char)) token += char;
  }
  return rows;
}

describe("migrations 0009 and 0010 — shape", () => {
  it("open with the ownership preamble and close with RESET ROLE", () => {
    for (const sql of [ops, auth]) {
      expect(sql.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(
        true,
      );
      expect(sql.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    }
    for (const sql of [opsDown, authDown]) {
      expect(sql.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(
        true,
      );
    }
  });

  it("create the tables of §5.1, and their rollbacks drop each, leaf first", () => {
    expect(createdTables(ops)).toEqual([...OPS_TABLES]);
    expect(droppedTables(opsDown)).toEqual([...OPS_TABLES].reverse());
    expect(createdTables(auth)).toEqual([...AUTH_TABLES]);
    expect(droppedTables(authDown)).toEqual([...AUTH_TABLES].reverse());
    expect(`${opsDown}\n${authDown}`).not.toMatch(/CASCADE/);
  });

  for (const table of OPS_TABLES) {
    it(`${table} equals its mirror (keys added by 0010, columns by 0017 included)`, () => {
      const mirror = mirrorShape(table);
      expect(
        table === "audit_log" ? withoutAuditTrail(mirror) : mirror,
      ).toEqual(sqlShape(ops, table, `${auth}\n${a7}`));
    });
  }

  it("audit_log's mirror holds exactly what 0016_audit_trail adds (spec 012 §5.1; TASK-218)", () => {
    const trail = readMigration("0016_audit_trail.sql");
    for (const column of AUDIT_TRAIL.columns) {
      expect(trail).toMatch(new RegExp(`ADD COLUMN ${column} text`, "u"));
    }
    for (const check of AUDIT_TRAIL.checks) {
      expect(trail).toMatch(new RegExp(`ADD CONSTRAINT ${check} CHECK`, "u"));
    }
    for (const index of AUDIT_TRAIL.indexes) {
      expect(trail).toMatch(
        new RegExp(`CREATE INDEX ${index} ON public\\.audit_log `, "u"),
      );
    }
    const mirror = mirrorShape("audit_log");
    expect(mirror.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([...AUDIT_TRAIL.columns]),
    );
    expect(mirror.checks).toEqual(
      expect.arrayContaining([...AUDIT_TRAIL.checks]),
    );
    expect(mirror.indexes).toEqual(
      expect.arrayContaining([...AUDIT_TRAIL.indexes]),
    );
  });
  for (const table of AUTH_TABLES) {
    it(`${table} equals its mirror`, () => {
      expect(mirrorShape(table)).toEqual(sqlShape(auth, table));
    });
  }

  it("0010's rollback drops the three keys it added into users before dropping users", () => {
    const keys = [
      ...auth.matchAll(/ALTER TABLE public\.(\w+)\s+ADD CONSTRAINT (\w+)/g),
    ].map((m) => [m[1], m[2]]);
    expect(keys).toEqual([
      ["partner_member", "partner_member_user_id_users_id_fk"],
      ["customer", "customer_user_id_users_id_fk"],
      ["audit_log", "audit_log_actor_user_id_users_id_fk"],
    ]);
    for (const [table, key] of keys) {
      const drop = authDown.indexOf(
        `ALTER TABLE public.${table ?? ""} DROP CONSTRAINT IF EXISTS ${key ?? ""};`,
      );
      expect(drop, key).toBeGreaterThanOrEqual(0);
      expect(drop).toBeLessThan(
        authDown.indexOf("DROP TABLE IF EXISTS public.users;"),
      );
    }
  });
});

describe("the CHECK lists are the mirror's tuples (AC-7)", () => {
  const LISTS: readonly (readonly [string, string, readonly string[]])[] = [
    [ops, "outbox_status_check", outboxStatuses],
    [ops, "outbox_attempt_status_check", outboxAttemptStatuses],
    [ops, "feature_flag_scope_scope_check", flagScopes],
    [ops, "retention_policy_action_check", retentionActions],
    [ops, "db_usage_sample_source_check", usageSampleSources],
    [auth, "user_role_role_check", adminRoles],
  ];
  for (const [sql, constraint, values] of LISTS) {
    it(constraint, () => {
      expect(checkList(sql, constraint)).toEqual([...values]);
    });
  }
});

describe("§12 and spec 010 §5.1 A — the flags are data, seeded off except the demo guard", () => {
  const flags = seeded(ops, "feature_flag");

  it("seeds exactly the keys §12 and spec 010 name, each with its default", () => {
    expect(
      Object.fromEntries(flags.map(([key, , on]) => [key, on === "true"])),
    ).toEqual({
      "checkout.demo_guard": true,
      "checkout.open": false,
      "payments.stripe": false,
      "payments.mollie": false,
      "corridor.de": false,
      "corridor.es": false,
      "corridor.fr": false,
      "corridor.gb": false,
      "corridor.it": false,
      "corridor.nl": false,
      "corridor.pl": false,
      "corridor.ro": false,
      "locale.de": false,
      "locale.en": false,
      "locale.en-gb": false,
      "locale.pl": false,
    });
  });

  it("checkout.open has its PL country scope row, off", () => {
    expect(seeded(ops, "feature_flag_scope")).toEqual([
      ["checkout.open", "country", "PL", "false"],
    ]);
  });
});

describe("§8 and §13 Q7 — retention is plan/07 §1.2's, as rows", () => {
  const rows = seeded(ops, "retention_policy");
  const byKey = new Map(rows.map((row) => [row[0], row]));

  it("seeds the flows of plan/07 §1.2 and the two rows of spec 010 §5.1 A, with period and action", () => {
    expect(
      rows.map(([key, table, , days, action]) => [key, table, days, action]),
    ).toEqual([
      ["recipient_contact", "recipient", "90", "pseudonymise"],
      ["delivery_photo", "delivery_proof", "730", "delete"],
      ["buyer_personal", "customer", "1095", "pseudonymise"],
      ["invoice_archive", "order", "3650", "keep"],
      ["fraud_signals", "webhook_inbox", "365", "delete"],
      ["consent_records", "consent_log", "1825", "delete"],
      ["checkout_draft", "checkout_draft", "1", "delete"],
      ["demo_order_personal", "order", "1", "pseudonymise"],
    ]);
  });

  it("every legal note cites its source, and the two figures Q7 flags say so", () => {
    for (const row of rows) {
      expect(row[5], row[0]).toMatch(/^(plan\/07 §1\.2|Spec 010 §5\.1 A):/);
    }
    expect(byKey.get("invoice_archive")?.[5]).toMatch(/B1/);
    expect(byKey.get("delivery_photo")?.[5]).toMatch(/B4/);
    expect(byKey.get("demo_order_personal")?.[5]).toMatch(
      /24 hours after placement in production, and 7 days after placement on staging and PR environments/,
    );
  });
});

describe("§13 Q1 — the Auth.js adapter's names", () => {
  it("keeps the adapter's property names on the mirror (the adapter binds to them)", async () => {
    const { getTableConfig } = await import("drizzle-orm/pg-core");
    const schema = await import("../../db/schema/auth.ts");
    const props = (table: object): string[] =>
      Object.keys(table).filter((key) =>
        getTableConfig(table as never).columns.some(
          (column) => (table as Record<string, unknown>)[key] === column,
        ),
      );
    expect(props(schema.users).sort()).toEqual(
      [
        "id",
        "name",
        "email",
        "emailVerified",
        "image",
        "createdAt",
        "updatedAt",
      ].sort(),
    );
    expect(props(schema.accounts).sort()).toEqual(
      [
        "userId",
        "type",
        "provider",
        "providerAccountId",
        "refresh_token",
        "access_token",
        "expires_at",
        "token_type",
        "scope",
        "id_token",
        "session_state",
      ].sort(),
    );
    expect(props(schema.sessions).sort()).toEqual(
      ["sessionToken", "userId", "expires"].sort(),
    );
    expect(props(schema.verificationTokens).sort()).toEqual(
      ["identifier", "token", "expires"].sort(),
    );
  });
});
