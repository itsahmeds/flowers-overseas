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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  addressKinds,
  consentSubjectKinds,
  recipientPlaceKinds,
} from "../../db/schema/customers.ts";
import * as schema from "../../db/schema/index.ts";
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
      /asset\.kind = 'partner' AND asset\.visibility = 'private'/,
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

  it("drop the media guard, both functions and the postcode_zone key, and nothing else", () => {
    expect(partnersDown).toMatch(
      /^DROP TRIGGER IF EXISTS media_asset_partner_application_guard ON public\.media_asset;$/m,
    );
    expect(partnersDown).toMatch(
      /DROP FUNCTION IF EXISTS public\.media_asset_partner_application_guard\(\);/,
    );
    expect(partnersDown).toMatch(
      /DROP FUNCTION IF EXISTS public\.partner_application_media_check\(\);/,
    );
    expect(customersDown).toMatch(
      /ALTER TABLE public\.postcode_zone DROP CONSTRAINT IF EXISTS postcode_zone_id_country_key;/,
    );
    const statements = (sql: string): string[] =>
      sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    expect(statements(partnersDown)).toHaveLength(1 + 1 + 9 + 2 + 1);
    expect(statements(customersDown)).toHaveLength(1 + 5 + 1 + 1);
  });

  it("add, in 0006, the one key on another migration's table that the rollback removes", () => {
    expect(
      [...both.matchAll(/ALTER TABLE public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["postcode_zone"]);
    expect(
      [...both.matchAll(/ON public\.(\w+)\s+FOR EACH ROW/g)].map((m) => m[1]),
    ).not.toContain("postcode_zone");
  });
});
