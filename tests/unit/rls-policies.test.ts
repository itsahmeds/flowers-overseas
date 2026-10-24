/**
 * Migration `0011` read as text, against `db/rls.ts` and the Drizzle mirror (spec 002 §2 "RLS and
 * roles", AC-16, AC-17, AC-18; TASK-023). The connected half is
 * `tests/integration/rls-policies.test.ts`.
 *
 * Coverage is the property: every table the mirror declares has RLS enabled and its staff policy;
 * every table is classified in `db/rls.ts`; each class gets exactly the policies its class says,
 * and no other; the rollback undoes every policy, every `ENABLE` and every helper.
 */
import { readdirSync } from "node:fs";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "../../db/schema/index.ts";
import {
  BUILD_ROLE_FILTERED_TABLES,
  BUILD_ROLE_READ_TABLES,
  CUSTOMER_SCOPED_TABLES,
  CUSTOMER_VIEWS,
  PARTNER_SCOPED_TABLES,
  PARTNER_VIEWS,
  PUBLIC_FILTERED_TABLES,
  PUBLIC_REFERENCE_TABLES,
  RLS_EXEMPT_TABLES,
  SELF_SCOPED_TABLES,
  STAFF_ONLY_TABLES,
  SYSTEM_ONLY_TABLES,
  SYSTEM_WRITE_ADMIN_READ_TABLES,
} from "../../db/rls.ts";
import {
  MIGRATIONS_DIR,
  createdTables,
  readMigration,
} from "./support/migration-sql.ts";

/**
 * The RLS of a table created **after** `0011` lives in the migration that creates it (spec 012's
 * `0014_admin_identity`, TASK-217): its `ENABLE ROW LEVEL SECURITY` and staff policy are read
 * from there, and its rollback drops the table (and the policies with it) instead of disabling
 * RLS in `0011`'s rollback.
 */
const LATER_MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
  .filter((file) => !file.endsWith(".down.sql") && file > "0011_")
  .filter((file) => !file.startsWith("0011_"))
  .sort();
const LATER_TABLES = new Set(
  LATER_MIGRATIONS.flatMap((file) => createdTables(readMigration(file))),
);
const LATER_DOWNS = LATER_MIGRATIONS.map((file) =>
  readMigration(file.replace(/\.sql$/, ".down.sql")),
).join("\n");

const up0011 = readMigration("0011_rls_policies.sql");
const up = [up0011, ...LATER_MIGRATIONS.map(readMigration)].join("\n");
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

/** `0018`'s `TO app_build` read policies (spec 012b §5.1 item 1; TASK-292). */
const BUILD_POLICIES: Policy[] = [
  ...up.matchAll(
    /CREATE POLICY (\w+) ON public\.(\w+) FOR (\w+) TO app_build\s+USING \(([\s\S]*?)\);/g,
  ),
].map((m) => ({
  name: m[1] ?? "",
  table: m[2] ?? "",
  command: m[3] ?? "",
  using: (m[4] ?? "").replace(/\s+/g, " "),
  check: "",
}));

const policiesOf = (table: string): Policy[] =>
  POLICIES.filter((p) => p.table === table);

describe("migration 0011 — coverage", () => {
  it("opens with the ownership preamble, closes with RESET ROLE, and never forces RLS", () => {
    expect(up0011.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(
      true,
    );
    expect(up0011.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    expect(up).not.toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it("every policy the file creates was parsed (none hides behind an odd layout)", () => {
    // The build role's policies (`0018`, spec 012b) are read by their own block below.
    expect(POLICIES.length + BUILD_POLICIES.length).toBe(
      [...up.matchAll(/CREATE POLICY/g)].length,
    );
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
    const withoutStaff: readonly string[] = [
      ...SYSTEM_ONLY_TABLES,
      ...SYSTEM_WRITE_ADMIN_READ_TABLES,
    ];
    for (const table of MIRROR.filter((name) => !withoutStaff.includes(name))) {
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
      ...SYSTEM_ONLY_TABLES,
      ...SYSTEM_WRITE_ADMIN_READ_TABLES,
    ]);
    expect([...classified].sort()).toEqual(MIRROR);
  });
});

describe("migration 0011 — each class gets exactly its policies", () => {
  it("system-only tables have exactly one policy, for app.role = 'system' (spec 010 §5.1 B)", () => {
    expect(SYSTEM_ONLY_TABLES.length).toBeGreaterThan(0);
    for (const table of SYSTEM_ONLY_TABLES) {
      expect(policiesOf(table), table).toEqual([
        {
          name: `${table}_system`,
          table,
          command: "ALL",
          using: "public.app_current_role() = 'system'",
          check: "public.app_current_role() = 'system'",
        },
      ]);
    }
  });

  it("system-write, admin-read tables have exactly those two policies (spec 010 §14 A-founder-2026-10-22)", () => {
    expect(SYSTEM_WRITE_ADMIN_READ_TABLES).toEqual(["purchase"]);
    for (const table of SYSTEM_WRITE_ADMIN_READ_TABLES) {
      expect(policiesOf(table), table).toEqual([
        {
          name: `${table}_system`,
          table,
          command: "ALL",
          using: "public.app_current_role() = 'system'",
          check: "public.app_current_role() = 'system'",
        },
        {
          name: `${table}_admin`,
          table,
          command: "SELECT",
          using: "public.app_current_role() = 'admin'",
          check: "",
        },
      ]);
    }
  });

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
    for (const policy of POLICIES.filter((p) => !LATER_TABLES.has(p.table))) {
      expect(down, policy.name).toMatch(
        new RegExp(
          `DROP POLICY IF EXISTS ${policy.name} ON ${ref(policy.table)};`,
        ),
      );
    }
    for (const table of MIRROR) {
      if (LATER_TABLES.has(table)) {
        expect(LATER_DOWNS, table).toContain(
          `DROP TABLE IF EXISTS public.${table};`,
        );
        continue;
      }
      expect(down, table).toMatch(
        new RegExp(`ALTER TABLE ${ref(table)} DISABLE ROW LEVEL SECURITY;`),
      );
    }
    const helpers = [
      ...up0011.matchAll(/CREATE FUNCTION public\.(\w+)\(/g),
    ].map((m) => m[1]);
    expect(helpers).toHaveLength(14);
    for (const view of [
      ...Object.keys(PARTNER_VIEWS),
      ...Object.keys(CUSTOMER_VIEWS),
    ]) {
      expect(down).toContain(`DROP VIEW IF EXISTS public.${view};`);
    }
    expect(down).toMatch(
      /^DROP TRIGGER IF EXISTS customer_self_update_guard ON public\.customer;$/m,
    );
    for (const helper of helpers) {
      expect(down).toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${helper ?? ""}\\(`),
      );
    }
  });
});

describe("migration 0018 — the build role reads the public set (spec 012b AC-4; TASK-292)", () => {
  const up0018 = readMigration("0018_catalogue_build_role.sql");
  const down0018 = readMigration("0018_catalogue_build_role.down.sql");

  it("gives app_build one SELECT policy per table of its set, with the public render's condition", () => {
    const tables = [
      ...BUILD_ROLE_READ_TABLES,
      ...Object.keys(BUILD_ROLE_FILTERED_TABLES),
    ].sort();
    expect(BUILD_POLICIES.map((p) => p.table).sort()).toEqual(tables);
    for (const policy of BUILD_POLICIES) {
      expect(policy.name).toBe(`${policy.table}_build_read`);
      expect(policy.command).toBe("SELECT");
      const publicRead = policiesOf(policy.table).find(
        (p) => p.name === `${policy.table}_read`,
      );
      // The flag tables have no public read for app_web: the build's is unconditional.
      expect(policy.using, policy.table).toBe(publicRead?.using ?? "true");
    }
  });

  it("grants SELECT on exactly that set, and no other privilege on any table", () => {
    const grant = /GRANT SELECT ON([\s\S]*?)TO app_build;/u.exec(up0018);
    const granted = (grant?.[1] ?? "")
      .split(",")
      .map((name) => name.trim().replace(/^public\./u, ""))
      .filter((name) => name !== "")
      .sort();
    expect(granted).toEqual(
      [
        ...BUILD_ROLE_READ_TABLES,
        ...Object.keys(BUILD_ROLE_FILTERED_TABLES),
      ].sort(),
    );
    expect(up0018).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|ALL)/u);
    expect(up0018).toMatch(/NOLOGIN[^;]*NOBYPASSRLS/u);
    // No role default for `app.role`: unset already reads as `public`, and a non-superuser
    // migration login cannot set a placeholder default (see the migration's header).
    expect(up0018).not.toMatch(/^\s*ALTER ROLE app_build SET/mu);
  });

  it("rolls back every policy it creates, revokes the grants and drops the role", () => {
    for (const policy of BUILD_POLICIES) {
      expect(down0018).toContain(
        `DROP POLICY IF EXISTS ${policy.name} ON public.${policy.table};`,
      );
    }
    const revoke = /REVOKE ALL ON([\s\S]*?)FROM app_build;/u.exec(down0018);
    const grant = /GRANT SELECT ON([\s\S]*?)TO app_build;/u.exec(up0018);
    expect(revoke?.[1]?.trim()).toBe(grant?.[1]?.trim());
    expect(down0018).toContain("DROP ROLE app_build;");
  });
});
