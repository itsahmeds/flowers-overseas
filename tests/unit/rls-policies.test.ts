/**
 * Migration `0011` read as text, against `db/rls.ts` and the Drizzle mirror (spec 002 §2 "RLS and
 * roles", AC-16, AC-17, AC-18; TASK-023). The connected half is
 * `tests/integration/rls-policies.test.ts`.
 *
 * Coverage is the property: every table the mirror declares has RLS enabled and its staff policy;
 * every table is classified in `db/rls.ts`; each class gets exactly the policies its class says,
 * and no other; the rollback undoes every policy, every `ENABLE` and every helper.
 */
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "../../db/schema/index.ts";
import {
  CUSTOMER_SCOPED_TABLES,
  CUSTOMER_VIEWS,
  PARTNER_SCOPED_TABLES,
  PARTNER_VIEWS,
  PUBLIC_FILTERED_TABLES,
  PUBLIC_REFERENCE_TABLES,
  RLS_EXEMPT_TABLES,
  SELF_SCOPED_TABLES,
  STAFF_ONLY_TABLES,
} from "../../db/rls.ts";
import { readMigration } from "./support/migration-sql.ts";

const up = readMigration("0011_rls_policies.sql");
const down = readMigration("0011_rls_policies.down.sql");

const MIRROR = Object.values(schema)
  .filter(
    (value) =>
      value !== null &&
      typeof value === "object" &&
      Symbol.for("drizzle:IsDrizzleTable") in value,
  )
  .map((table) => getTableConfig(table as PgTable).name)
  .sort();

const ref = (table: string): string =>
  table === "order" ? 'public\\."order"' : `public\\.${table}`;

interface Policy {
  name: string;
  table: string;
  command: string;
  using: string;
  check: string;
}

const POLICIES: Policy[] = [
  ...up.matchAll(
    /CREATE POLICY (\w+) ON public\.(?:"(\w+)"|(\w+)) FOR (\w+) TO app_web\s+USING \(([\s\S]*?)\)(?:\s+WITH CHECK \(([\s\S]*?)\))?;/g,
  ),
].map((m) => ({
  name: m[1] ?? "",
  table: m[2] ?? m[3] ?? "",
  command: m[4] ?? "",
  using: (m[5] ?? "").replace(/\s+/g, " "),
  check: (m[6] ?? "").replace(/\s+/g, " "),
}));

const policiesOf = (table: string): Policy[] =>
  POLICIES.filter((p) => p.table === table);

describe("migration 0011 — coverage", () => {
  it("opens with the ownership preamble, closes with RESET ROLE, and never forces RLS", () => {
    expect(up.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(true);
    expect(up.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    expect(up).not.toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it("every policy the file creates was parsed (none hides behind an odd layout)", () => {
    expect(POLICIES).toHaveLength([...up.matchAll(/CREATE POLICY/g)].length);
  });

  it("enables RLS on every table of the mirror, and on nothing else", () => {
    const enabled = [
      ...up.matchAll(
        /ALTER TABLE public\.(?:"(\w+)"|(\w+)) ENABLE ROW LEVEL SECURITY;/g,
      ),
    ]
      .map((m) => m[1] ?? m[2] ?? "")
      .sort();
    expect(enabled).toEqual(MIRROR);
    for (const table of Object.keys(RLS_EXEMPT_TABLES)) {
      expect(MIRROR).not.toContain(table);
    }
  });

  it("gives every table its staff policy: admin and system, everything", () => {
    for (const table of MIRROR) {
      expect(policiesOf(table), table).toContainEqual({
        name: `${table}_staff`,
        table,
        command: "ALL",
        using: "app_is_staff()",
        check: "app_is_staff()",
      });
    }
  });

  it("classifies every table in db/rls.ts", () => {
    const classified = new Set<string>([
      ...PUBLIC_REFERENCE_TABLES,
      ...Object.keys(PUBLIC_FILTERED_TABLES),
      ...Object.keys(PARTNER_SCOPED_TABLES),
      ...Object.keys(CUSTOMER_SCOPED_TABLES),
      ...SELF_SCOPED_TABLES,
      ...STAFF_ONLY_TABLES,
    ]);
    expect([...classified].sort()).toEqual(MIRROR);
  });
});

describe("migration 0011 — each class gets exactly its policies", () => {
  it("staff-only tables have no other policy (deny by default)", () => {
    for (const table of STAFF_ONLY_TABLES) {
      expect(
        policiesOf(table).map((p) => p.name),
        table,
      ).toEqual([`${table}_staff`]);
    }
  });

  it("the public reference set is readable by everyone, unconditionally, and writable by staff only", () => {
    for (const table of PUBLIC_REFERENCE_TABLES) {
      expect(policiesOf(table), table).toEqual([
        expect.objectContaining({ name: `${table}_staff` }),
        {
          name: `${table}_read`,
          table,
          command: "SELECT",
          using: "true",
          check: "",
        },
      ]);
    }
  });

  it("media_asset, media_variant and review are public only where their condition holds", () => {
    expect(
      policiesOf("media_asset").find((p) => p.name === "media_asset_read")
        ?.using,
    ).toBe("visibility = 'public'");
    expect(
      policiesOf("review").find((p) => p.name === "review_read")?.using,
    ).toBe("moderation_status = 'published'");
    expect(
      policiesOf("media_variant").find((p) => p.name === "media_variant_read")
        ?.using,
    ).toMatch(/a\.visibility = 'public'/);
  });

  it("partner-scoped tables are keyed on a partner lookup, FOR ALL only for coverage and blackouts", () => {
    for (const [table, mode] of Object.entries(PARTNER_SCOPED_TABLES)) {
      const policy = policiesOf(table).find(
        (p) => p.name === `${table}_partner`,
      );
      expect(policy, table).toBeDefined();
      expect(policy?.using, table).toMatch(
        /^app_(is_partner_of|partner_owns_payout|partner_sees_order)\(\w+\)$/,
      );
      expect(policy?.command, table).toBe(mode === "write" ? "ALL" : "SELECT");
      if (mode === "write") expect(policy?.check).toBe(policy?.using);
    }
    expect(
      Object.entries(PARTNER_SCOPED_TABLES)
        .filter(([, mode]) => mode === "write")
        .map(([table]) => table)
        .sort(),
    ).toEqual(["partner_blackout", "partner_coverage"]);
    // Item 1: no row policy lets a partner at the order row or its lines.
    for (const table of ["order", "order_line"]) {
      expect(
        policiesOf(table).filter((p) => /partner/.test(p.using)),
        table,
      ).toEqual([]);
    }
  });

  it("customer-scoped tables are keyed on a customer lookup", () => {
    for (const [table, mode] of Object.entries(CUSTOMER_SCOPED_TABLES)) {
      const policies = policiesOf(table).filter((p) =>
        p.name.startsWith(`${table}_customer`),
      );
      expect(policies.length, table).toBeGreaterThan(0);
      for (const policy of policies) {
        expect(policy.using, table).toMatch(
          /^app_(is_customer_user|customer_owns\w*)\(\w+\)$/,
        );
      }
      const commands = policies.map((p) => p.command).sort();
      expect(commands, table).toEqual(
        mode === "write"
          ? ["ALL"]
          : mode === "read_update"
            ? ["SELECT", "UPDATE"]
            : ["SELECT"],
      );
    }
  });

  it("self-scoped tables match app_is_self(…), which needs a signed-in role", () => {
    for (const table of SELF_SCOPED_TABLES) {
      expect(
        policiesOf(table).find((p) => p.name === `${table}_self`)?.using,
        table,
      ).toMatch(/^app_is_self\(\w+\)$/);
    }
    expect(up).toMatch(
      /SELECT app_current_role\(\) IN \('customer', 'partner'\) AND person IS NOT NULL/,
    );
  });

  it("the ownership lookups are SECURITY DEFINER with a pinned search_path (item 3)", () => {
    for (const lookup of [
      "app_partner_sees_order",
      "app_partner_owns_payout",
      "app_customer_owns",
      "app_customer_owns_recipient",
      "app_customer_owns_order",
      "app_customer_owns_payment",
    ]) {
      expect(up, lookup).toMatch(
        new RegExp(
          `CREATE FUNCTION public\\.${lookup}\\(target uuid\\) RETURNS boolean\\s+LANGUAGE sql STABLE\\s+SECURITY DEFINER\\s+SET search_path = pg_catalog, public`,
        ),
      );
    }
    expect(up).toMatch(/AND \(a\.response IS NULL OR a\.response = 'accept'\)/);
  });

  it("the three views are security_barrier, list exactly db/rls.ts's columns, and are read-only to app_web", () => {
    for (const [view, columns] of Object.entries({
      ...PARTNER_VIEWS,
      ...CUSTOMER_VIEWS,
    })) {
      const match = new RegExp(
        `CREATE VIEW public\\.${view} WITH \\(security_barrier = true\\) AS\\s+SELECT ([\\s\\S]*?)\\s+FROM`,
      ).exec(up);
      expect(match, view).not.toBeNull();
      expect(
        (match?.[1] ?? "").split(",").map((c) => c.trim().replace(/^\w\./, "")),
        view,
      ).toEqual([...columns]);
    }
    expect(up).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.partner_order, public\.partner_order_line,\s+public\.customer_order_event FROM app_web;/,
    );
  });

  it("the helpers read the session variables transaction-locally and parse what withDbContext writes", () => {
    expect(up).toContain("current_setting('app.role', true)");
    expect(up).toContain("current_setting('app.user_id', true)");
    expect(up).toContain("current_setting('app.partner_ids', true)");
    expect(up).toMatch(/string_to_array\(btrim\(/);
    expect(up).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC;");
  });
});

describe("rollback 0011", () => {
  it("drops the views, every policy, RLS on every table, and every function it created", () => {
    for (const policy of POLICIES) {
      expect(down, policy.name).toMatch(
        new RegExp(
          `DROP POLICY IF EXISTS ${policy.name} ON ${ref(policy.table)};`,
        ),
      );
    }
    for (const table of MIRROR) {
      expect(down, table).toMatch(
        new RegExp(`ALTER TABLE ${ref(table)} DISABLE ROW LEVEL SECURITY;`),
      );
    }
    const helpers = [...up.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)].map(
      (m) => m[1],
    );
    expect(helpers).toHaveLength(14);
    for (const view of [
      ...Object.keys(PARTNER_VIEWS),
      ...Object.keys(CUSTOMER_VIEWS),
    ]) {
      expect(down).toContain(`DROP VIEW IF EXISTS public.${view};`);
    }
    expect(down).toContain(
      "DROP TRIGGER IF EXISTS customer_self_update_guard ON public.customer;",
    );
    for (const helper of helpers) {
      expect(down).toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${helper ?? ""}\\(`),
      );
    }
  });
});
