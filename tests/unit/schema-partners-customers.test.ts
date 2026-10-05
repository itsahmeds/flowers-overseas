/**
 * Migrations `0005` and `0006` read as text, against their Drizzle mirror (spec 002 §5.1
 * "`partners`" and "`customers`", §2, §8, AC-5, AC-7, AC-10, AC-27; spec 010 §5.1 A; TASK-018).
 *
 * The connected half — the database actually refusing the rows these constraints exist to refuse
 * — is `tests/integration/schema-partners-customers.test.ts`. Everything below is decidable from
 * the repository and runs on every pull request: the tables and their columns in §5.1's order on
 * both sides, the CHECK lists equal to the mirror's tuples, the money pairs, the minimisation
 * properties of §8, the `updated_at` triggers and the rollbacks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  addressKinds,
  consentSubjectKinds,
  recipientPlaceKinds,
} from "../../db/schema/customers.ts";
import * as schema from "../../db/schema/index.ts";
import { FOREIGN_KEYS } from "../fixtures/schema-foreign-keys.ts";
import {
  partnerApplicationStatuses,
  partnerMemberRoles,
  partnerNotificationChannels,
  partnerStatuses,
  payoutLineKinds,
  payoutStatuses,
} from "../../db/schema/partners.ts";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

/** SQL with `--` line comments and block comments removed, so a rule never matches prose. */
function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const read = (file: string): string =>
  withoutComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));

const partners = read("0005_partners.sql");
const partnersDown = read("0005_partners.down.sql");
const customers = read("0006_customers.sql");
const customersDown = read("0006_customers.down.sql");
const both = `${partners}\n${customers}`;

const PARTNER_TABLES = [
  "fulfillment_partner",
  "partner_translation",
  "partner_member",
  "partner_coverage",
  "partner_blackout",
  "partner_catalog_mapping",
  "partner_application",
  "payout",
  "payout_line",
] as const;
const CUSTOMER_TABLES = [
  "customer",
  "address",
  "recipient",
  "recipient_address",
  "consent_log",
] as const;

const createdTables = (sql: string): string[] =>
  [...sql.matchAll(/CREATE TABLE public\.(\w+) \(/g)].map((m) => m[1] ?? "");

function tableBody(table: string): string {
  const match = new RegExp(
    `CREATE TABLE public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
  ).exec(both);
  expect(match, `${table} is not created`).not.toBeNull();
  return match?.[1] ?? "";
}

/** `[name, type]` per column, in declaration order; constraints come after the last column. */
function columnsOf(table: string): [string, string][] {
  const columns: [string, string][] = [];
  for (const raw of tableBody(table).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("CONSTRAINT")) break;
    const match = /^([a-z_0-9]+)\s+([a-z[\]0-9]+)/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      columns.push([match[1], match[2]]);
    }
  }
  return columns;
}

function checkList(constraint: string): readonly string[] | undefined {
  const match = new RegExp(
    `CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\(\\s*\\w+\\s+IN\\s*\\(([^)]*)\\)`,
    "i",
  ).exec(both);
  if (match?.[1] === undefined) return undefined;
  return [...match[1].matchAll(/'([^']*)'/g)].map((value) => value[1] ?? "");
}

const mirrorTables = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (
    value !== null &&
    typeof value === "object" &&
    Symbol.for("drizzle:IsDrizzleTable") in value
  ) {
    const table = value as PgTable;
    mirrorTables.set(getTableConfig(table).name, table);
  }
}

describe("migrations 0005 and 0006 — shape", () => {
  it("open with the ownership preamble and close with RESET ROLE", () => {
    for (const sql of [partners, partnersDown, customers, customersDown]) {
      expect(sql.trimStart().startsWith("SET LOCAL ROLE app_owner;")).toBe(
        true,
      );
      expect(sql.trimEnd().endsWith("RESET ROLE;")).toBe(true);
    }
  });

  it("create exactly §5.1's partner tables in 0005 and customer tables in 0006, parents first", () => {
    expect(createdTables(partners)).toEqual([...PARTNER_TABLES]);
    expect(createdTables(customers)).toEqual([...CUSTOMER_TABLES]);
  });

  it("create no extension, no enum and no citext (§2, AC-7)", () => {
    expect(both).not.toMatch(/CREATE\s+EXTENSION/i);
    expect(both).not.toMatch(/CREATE\s+TYPE/i);
    expect(both).not.toMatch(/citext/i);
  });

  for (const table of [...PARTNER_TABLES, ...CUSTOMER_TABLES]) {
    it(`${table}: the SQL columns equal the mirror's, in order, with the same nullability`, () => {
      const mirror = mirrorTables.get(table);
      expect(mirror, `${table} is not in the Drizzle barrel`).toBeDefined();
      const config = getTableConfig(mirror as PgTable);
      expect(columnsOf(table).map(([name]) => name)).toEqual(
        config.columns.map((column) => column.name),
      );
      const body = tableBody(table);
      for (const column of config.columns) {
        const line =
          new RegExp(`^\\s*${column.name}\\s.*$`, "m").exec(body)?.[0] ?? "";
        expect(
          /NOT NULL|PRIMARY KEY/.test(line),
          `${table}.${column.name}`,
        ).toBe(column.notNull);
      }
    });
  }
});

describe("value lists (CHECK lists, never an enum — AC-7)", () => {
  const lists: [string, readonly string[]][] = [
    ["fulfillment_partner_status_check", partnerStatuses],
    [
      "fulfillment_partner_notification_channel_check",
      partnerNotificationChannels,
    ],
    ["partner_member_role_check", partnerMemberRoles],
    ["partner_application_status_check", partnerApplicationStatuses],
    ["payout_status_check", payoutStatuses],
    ["payout_line_kind_check", payoutLineKinds],
    ["address_kind_check", addressKinds],
    ["recipient_address_place_kind_check", recipientPlaceKinds],
    ["consent_log_subject_kind_check", consentSubjectKinds],
  ];
  for (const [constraint, tuple] of lists) {
    it(`${constraint} equals the mirror's tuple`, () => {
      expect(checkList(constraint)).toEqual([...tuple]);
    });
  }

  it("spells §5.1's lists verbatim", () => {
    expect([...partnerStatuses]).toEqual([
      "demo",
      "onboarding",
      "active",
      "paused",
      "offboarded",
    ]);
    expect([...partnerApplicationStatuses]).toEqual([
      "new",
      "contacted",
      "rejected",
      "converted",
    ]);
    expect([...payoutStatuses]).toEqual(["draft", "statement_sent", "paid"]);
    expect([...payoutLineKinds]).toEqual(["order", "adjustment", "goodwill"]);
    expect([...recipientPlaceKinds]).toEqual([
      "home",
      "work",
      "hospital",
      "funeral_home",
      "hotel",
      "cemetery",
      "church",
    ]);
  });

  it("spec 010 §5.1 A: a partner's status includes demo and has no default", () => {
    expect(checkList("fulfillment_partner_status_check")).toContain("demo");
    expect(columnsOf("fulfillment_partner")).toContainEqual(["status", "text"]);
    expect(
      /^\s*status\s+text\s+NOT NULL,$/m.test(tableBody("fulfillment_partner")),
    ).toBe(true);
  });
});

describe("money (§2, AC-5)", () => {
  const moneyTables = ["partner_catalog_mapping", "payout", "payout_line"];
  it("every *_minor column is a bigint beside a currency_code with a foreign key to currency", () => {
    const found: string[] = [];
    for (const table of [...PARTNER_TABLES, ...CUSTOMER_TABLES]) {
      for (const [name, type] of columnsOf(table)) {
        if (!name.endsWith("_minor")) continue;
        found.push(`${table}.${name}`);
        expect(type, `${table}.${name}`).toBe("bigint");
        expect(columnsOf(table)).toContainEqual(["currency_code", "text"]);
        expect(tableBody(table)).toMatch(
          new RegExp(
            `${table}_currency_code_currency_code_fk FOREIGN KEY \\(currency_code\\)\\s+REFERENCES public\\.currency \\(code\\)`,
          ),
        );
      }
    }
    expect(found).toEqual([
      "partner_catalog_mapping.partner_payout_minor",
      "payout.total_minor",
      "payout_line.amount_minor",
    ]);
    for (const table of moneyTables) {
      expect(tableBody(table)).toMatch(
        new RegExp(
          `${table}_currency_code_check CHECK \\(currency_code ~ '\\^\\[A-Z\\]\\{3\\}\\$'\\)`,
        ),
      );
    }
  });

  it("declares no numeric, real or double precision column", () => {
    const types = [...PARTNER_TABLES, ...CUSTOMER_TABLES].flatMap((table) =>
      columnsOf(table).map(([, type]) => type),
    );
    expect(
      types.filter((type) => /^(numeric|real|double|float)/.test(type)),
    ).toEqual([]);
    expect(both).not.toMatch(/\b(numeric|double precision)\b/i);
  });

  it("keeps a payout line in its payout's currency, and pays an order once", () => {
    expect(tableBody("payout_line")).toMatch(
      /payout_line_payout_fkey FOREIGN KEY \(payout_id, currency_code\)\s+REFERENCES public\.payout \(id, currency_code\)/,
    );
    expect(partners).toMatch(
      /CREATE UNIQUE INDEX payout_line_order_once_idx\s+ON public\.payout_line USING btree \(order_id\) WHERE kind = 'order';/,
    );
  });

  it("allows one base-tier mapping per partner and product (NULLS NOT DISTINCT)", () => {
    expect(partners).toMatch(
      /CREATE UNIQUE INDEX partner_catalog_mapping_partner_product_tier_idx\s+ON public\.partner_catalog_mapping USING btree \(partner_id, product_id, tier_key\)\s+NULLS NOT DISTINCT;/,
    );
  });
});

describe("minimisation (§8, plan/07 §1.3, §5)", () => {
  it("keeps recipient and recipient_address free of any email column (AC-27)", () => {
    for (const table of ["recipient", "recipient_address"]) {
      const names = columnsOf(table).map(([name]) => name);
      expect(
        names.filter((name) => /e[-_]?mail/i.test(name)),
        table,
      ).toEqual([]);
    }
  });

  it("stores a truncated IP at most: a cidr of /24 or /48, and no other address column", () => {
    expect(columnsOf("consent_log")).toContainEqual([
      "source_ip_truncated",
      "cidr",
    ]);
    expect(tableBody("consent_log")).toMatch(
      /family\(source_ip_truncated\) = 4 AND masklen\(source_ip_truncated\) <= 24\)\s+OR \(family\(source_ip_truncated\) = 6 AND masklen\(source_ip_truncated\) <= 48\)/,
    );
    const addressTyped = [...PARTNER_TABLES, ...CUSTOMER_TABLES].flatMap(
      (table) =>
        columnsOf(table)
          .filter(
            ([name, type]) =>
              type === "inet" || type === "cidr" || /(^|_)ip(_|$)/.test(name),
          )
          .map(([name]) => `${table}.${name}`),
    );
    expect(addressTyped).toEqual(["consent_log.source_ip_truncated"]);
  });

  it("makes buyer email unique case-insensitively with lower(), only among unredacted rows", () => {
    expect(customers).toMatch(
      /CREATE UNIQUE INDEX customer_email_normalised_idx\s+ON public\.customer USING btree \(lower\(email_normalised\)\) WHERE redacted = false;/,
    );
  });

  it("requires a recipient phone until the contact is redacted, and flags redaction with its date", () => {
    const body = tableBody("recipient");
    expect(body).toMatch(
      /recipient_phone_check CHECK \(contact_redacted OR phone_e164 IS NOT NULL\)/,
    );
    expect(body).toMatch(
      /contact_redacted = \(contact_redacted_at IS NOT NULL\)/,
    );
    expect(tableBody("customer")).toMatch(
      /customer_redacted_check CHECK \(redacted = \(redacted_at IS NOT NULL\)\)/,
    );
  });
});

describe("partner_application.media_asset_ids references media_asset (brief)", () => {
  it("checks every listed id against a private partner asset, as SECURITY DEFINER with a pinned path", () => {
    expect(partners).toMatch(
      /CREATE FUNCTION public\.partner_application_media_check\(\) RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = pg_catalog, public/,
    );
    expect(partners).toMatch(
      /kind = 'partner' AND visibility = 'private'\s+FOR SHARE/,
    );
    expect(partners).toMatch(
      /CREATE TRIGGER partner_application_media_check\s+BEFORE INSERT OR UPDATE OF media_asset_ids ON public\.partner_application/,
    );
  });

  it("guards the asset side on delete and on a change of id, kind or visibility", () => {
    expect(partners).toMatch(
      /CREATE TRIGGER media_asset_partner_application_guard\s+BEFORE DELETE OR UPDATE OF id, kind, visibility ON public\.media_asset/,
    );
    expect(partners).toMatch(/media_asset_ids @> ARRAY\[OLD\.id\]/);
  });
});

describe("updated_at (AC-10)", () => {
  it("gives every table with updated_at a trigger on 0001's function, and consent_log neither", () => {
    for (const table of [...PARTNER_TABLES, ...CUSTOMER_TABLES]) {
      const hasColumn = columnsOf(table).some(
        ([name]) => name === "updated_at",
      );
      const trigger = new RegExp(
        `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.set_updated_at\\(\\);`,
      ).test(both);
      expect(trigger, table).toBe(hasColumn);
      expect(hasColumn, table).toBe(table !== "consent_log");
    }
  });
});

describe("the rollbacks", () => {
  const drops = (sql: string): string[] =>
    [...sql.matchAll(/DROP TABLE IF EXISTS public\.(\w+);/g)].map(
      (m) => m[1] ?? "",
    );

  it("drop every table their migration created, leaf first, without CASCADE", () => {
    expect(drops(partnersDown)).toEqual([...PARTNER_TABLES].reverse());
    expect(drops(customersDown)).toEqual([...CUSTOMER_TABLES].reverse());
    expect(`${partnersDown}${customersDown}`).not.toMatch(/CASCADE/i);
  });

  it("drop the media guard, the three functions and the two postcode_zone keys, and nothing else", () => {
    expect(partnersDown).toMatch(
      /^DROP TRIGGER IF EXISTS media_asset_partner_application_guard ON public\.media_asset;$/m,
    );
    expect(partnersDown).toMatch(
      /DROP FUNCTION IF EXISTS public\.media_asset_partner_application_guard\(\);/,
    );
    expect(partnersDown).toMatch(
      /DROP FUNCTION IF EXISTS public\.partner_application_media_check\(\);/,
    );
    expect(partnersDown).toMatch(
      /DROP FUNCTION IF EXISTS public\.payout_currency_check\(\);/,
    );
    expect(partnersDown).toMatch(
      /ALTER TABLE public\.postcode_zone DROP CONSTRAINT IF EXISTS postcode_zone_id_city_key;/,
    );
    expect(customersDown).toMatch(
      /ALTER TABLE public\.postcode_zone DROP CONSTRAINT IF EXISTS postcode_zone_id_country_key;/,
    );
    const statements = (sql: string): string[] =>
      sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    // preamble, guard trigger, nine tables, the zone key, three functions, RESET ROLE
    expect(statements(partnersDown)).toHaveLength(1 + 1 + 9 + 1 + 3 + 1);
    expect(statements(customersDown)).toHaveLength(1 + 5 + 1 + 1);
  });

  it("add one key each to another migration's table (postcode_zone), which the rollbacks remove", () => {
    expect(
      [...partners.matchAll(/ALTER TABLE public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["postcode_zone"]);
    expect(
      [...customers.matchAll(/ALTER TABLE public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["postcode_zone"]);
    expect(
      [...both.matchAll(/ON public\.(\w+)\s+FOR EACH ROW/g)].map((m) => m[1]),
    ).not.toContain("postcode_zone");
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Round 1 (PR 200): delete rules, mirror parity, the lock, currency, deferred FKs            */
/* ------------------------------------------------------------------------------------------ */

describe("foreign keys and their delete rules (breaker hole 3)", () => {
  it("the SQL declares exactly the pinned foreign keys, with the pinned delete rule", () => {
    const declared = [
      ...both.matchAll(
        /CONSTRAINT (\w+) FOREIGN KEY \(([^)]*)\)\s+REFERENCES public\.(\w+) \(([^)]*)\) ON DELETE (\w+)/g,
      ),
    ].map((m) => [m[1], m[2], m[3], m[4], m[5]]);
    expect(declared).toEqual(FOREIGN_KEYS.map((fk) => [...fk]));
    expect([...both.matchAll(/FOREIGN KEY/g)]).toHaveLength(
      FOREIGN_KEYS.length,
    );
  });

  it("the mirror declares the same foreign keys with the same delete rule (B4)", () => {
    const mirrored: string[][] = [];
    for (const table of [...PARTNER_TABLES, ...CUSTOMER_TABLES]) {
      const config = getTableConfig(mirrorTables.get(table) as PgTable);
      for (const fk of config.foreignKeys) {
        const reference = fk.reference();
        mirrored.push([
          fk.getName(),
          reference.columns.map((column) => column.name).join(", "),
          getTableConfig(reference.foreignTable).name,
          reference.foreignColumns.map((column) => column.name).join(", "),
          (fk.onDelete ?? "no action").toUpperCase(),
        ]);
      }
    }
    expect(mirrored.sort()).toEqual(FOREIGN_KEYS.map((fk) => [...fk]).sort());
  });
});

describe("mirror parity beyond names and nullability (breaker hole 4)", () => {
  const SQL_TYPE: Record<string, string> = {
    timestamptz: "timestamp with time zone",
  };
  const sqlNames = (table: string, kind: string): string[] =>
    [
      ...tableBody(table).matchAll(
        new RegExp(`CONSTRAINT (\\w+) ${kind}`, "g"),
      ),
    ].map((m) => m[1] ?? "");
  const indexNames = (table: string, unique: boolean): string[] =>
    [
      ...both.matchAll(
        new RegExp(
          `CREATE ${unique ? "UNIQUE " : ""}INDEX (\\w+)\\s+ON public\\.${table} `,
          "g",
        ),
      ),
    ].map((m) => m[1] ?? "");

  for (const table of [...PARTNER_TABLES, ...CUSTOMER_TABLES]) {
    it(`${table}: column types, CHECK names, unique keys and indexes agree`, () => {
      const config = getTableConfig(mirrorTables.get(table) as PgTable);
      expect(
        config.columns.map((column) => [column.name, column.getSQLType()]),
      ).toEqual(
        columnsOf(table).map(([name, type]) => [name, SQL_TYPE[type] ?? type]),
      );
      expect(config.checks.map((c) => c.name).sort()).toEqual(
        sqlNames(table, "CHECK").sort(),
      );
      expect(config.uniqueConstraints.map((u) => u.getName()).sort()).toEqual(
        sqlNames(table, "UNIQUE").sort(),
      );
      expect(config.primaryKeys.map((pk) => pk.getName()).sort()).toEqual(
        sqlNames(table, "PRIMARY KEY").sort(),
      );
      expect(
        config.indexes
          .filter((ix) => ix.config.unique)
          .map((ix) => ix.config.name)
          .sort(),
      ).toEqual(indexNames(table, true).sort());
      expect(
        config.indexes
          .filter((ix) => !ix.config.unique)
          .map((ix) => ix.config.name)
          .sort(),
      ).toEqual(indexNames(table, false).sort());
    });
  }

  it("the two keys added to 0002's postcode_zone are in the geo mirror and in a migration", () => {
    const zone = getTableConfig(mirrorTables.get("postcode_zone") as PgTable);
    const names = zone.uniqueConstraints.map((u) => u.getName());
    expect(names).toEqual(
      expect.arrayContaining([
        "postcode_zone_id_city_key",
        "postcode_zone_id_country_key",
      ]),
    );
    expect(partners).toMatch(
      /ALTER TABLE public\.postcode_zone\s+ADD CONSTRAINT postcode_zone_id_city_key UNIQUE \(id, city_id\);/,
    );
    expect(customers).toMatch(
      /ALTER TABLE public\.postcode_zone\s+ADD CONSTRAINT postcode_zone_id_country_key UNIQUE \(id, country_id\);/,
    );
  });
});

describe("the media check locks what it checks (review R1)", () => {
  it("locks the listed assets FOR SHARE, with the kind and visibility predicate in the locking query", () => {
    const fn = partners.slice(
      partners.indexOf(
        "CREATE FUNCTION public.partner_application_media_check()",
      ),
      partners.indexOf("CREATE TRIGGER partner_application_media_check"),
    );
    expect(fn).toMatch(
      /SELECT id FROM public\.media_asset\s+WHERE id = ANY \(NEW\.media_asset_ids\) AND kind = 'partner' AND visibility = 'private'\s+FOR SHARE\s*\)/,
    );
    expect(fn).not.toMatch(/KEY SHARE/);
  });
});

describe("money stays in the partner's currency, and no line is zero (breaker holes 5, 6)", () => {
  it("a mapping references the partner's (id, payout_currency_code)", () => {
    expect(tableBody("fulfillment_partner")).toMatch(
      /fulfillment_partner_id_payout_currency_key UNIQUE \(id, payout_currency_code\)/,
    );
  });

  it("a payout is checked against the partner's currency, locking the partner row", () => {
    expect(partners).toMatch(
      /SELECT payout_currency_code INTO expected\s+FROM public\.fulfillment_partner WHERE id = NEW\.partner_id\s+FOR SHARE;/,
    );
    expect(partners).toMatch(
      /CREATE TRIGGER payout_currency_check\s+BEFORE INSERT OR UPDATE OF partner_id, currency_code ON public\.payout/,
    );
  });

  it("an order or goodwill line is strictly positive; an adjustment is non-zero", () => {
    expect(tableBody("payout_line")).toMatch(
      /payout_line_amount_minor_check CHECK \(\s*CASE kind WHEN 'adjustment' THEN amount_minor <> 0 ELSE amount_minor > 0 END\s*\)/,
    );
  });
});

describe("the deferred foreign keys cannot be forgotten (review nit 3)", () => {
  const DEFERRED: readonly (readonly [string, string, string, string])[] = [
    [
      "partner_member",
      "user_id",
      "users",
      "partner_member_user_id_users_id_fk",
    ],
    ["customer", "user_id", "users", "customer_user_id_users_id_fk"],
    ["payout_line", "order_id", "order", "payout_line_order_id_order_id_fk"],
  ];
  const allSql = [...readdirSync(MIGRATIONS_DIR)]
    .filter((file) => file.endsWith(".sql") && !file.endsWith(".down.sql"))
    .map((file) => read(file))
    .join("\n");
  const briefs = `${readFileSync(join(process.cwd(), "docs/tasks/TASK-019.md"), "utf8")}\n${readFileSync(join(process.cwd(), "docs/tasks/TASK-022.md"), "utf8")}`;

  for (const [table, column, parent, constraint] of DEFERRED) {
    it(`${table}.${column} → ${parent}: the column exists, its task's brief names ${constraint}, and once ${parent} exists a migration adds it`, () => {
      expect(columnsOf(table).map(([name]) => name)).toContain(column);
      expect(briefs).toContain(constraint);
      const parentExists = new RegExp(
        `CREATE TABLE (public\\.)?"?${parent}"? \\(`,
      ).test(allSql);
      if (parentExists)
        expect(allSql).toContain(`CONSTRAINT ${constraint} FOREIGN KEY`);
      else expect(allSql).not.toContain(constraint);
    });
  }
});
