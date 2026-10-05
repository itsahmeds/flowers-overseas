/**
 * T-27 — the recipient-email gate of `pnpm db:check` (spec 002 §8, §9 AC-27; `plan/07` §1.3;
 * TASK-018).
 *
 * "A fixture migration adding `recipient.email` makes `db:check` fail with the `plan/07` §1.3
 * citation; `recipient_contact_note` passes." The first two cases are that sentence, run through
 * `runDbCheck` against a copy of the committed migrations and schema with one fixture migration
 * added. The rest are the other routes by which an email column can reach `recipient` or
 * `recipient_address` (the gate replays the chain through a table model, `checkRecipientEmail` in
 * `scripts/db-check.ts`), and the near misses that must stay green.
 */
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { pgSchema, pgTable, text, uuid } from "drizzle-orm/pg-core";

import {
  checkRecipientEmail,
  DYNAMIC_SQL_ALLOWED,
  dynamicSqlCount,
  lexSql,
  MIGRATIONS_DIR,
  readSources,
  RECIPIENT_EMAIL_CITATION,
  recipientEmailViolations,
  recipientEmailInTables,
  runDbCheck,
  runDbCheckWithMirror,
  SCHEMA_DIR,
} from "../../scripts/db-check.ts";

const repoRoot = resolve(__dirname, "../..");
const committedMigrations = readSources(join(repoRoot, MIGRATIONS_DIR), ".sql");
const committedSchema = readSources(join(repoRoot, SCHEMA_DIR), ".ts");
const CITATION = /plan\/07 §1\.3/;

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A copy of the committed tree with `fixture` appended as the next migration. */
function treeWith(fixture: string): { migrations: string; schema: string } {
  const root = mkdtempSync(join(tmpdir(), "t27-"));
  scratch.push(root);
  const migrations = join(root, "migrations");
  const schema = join(root, "schema");
  cpSync(join(repoRoot, MIGRATIONS_DIR), migrations, { recursive: true });
  cpSync(join(repoRoot, SCHEMA_DIR), schema, { recursive: true });
  const next = String(
    readdirSync(migrations).filter((f) => /^\d{4}_.*(?<!\.down)\.sql$/.test(f))
      .length + 1,
  ).padStart(4, "0");
  writeFileSync(
    join(migrations, `${next}_fixture.sql`),
    `SET LOCAL ROLE app_owner;\n${fixture}\nRESET ROLE;\n`,
  );
  writeFileSync(
    join(migrations, `${next}_fixture.down.sql`),
    "SET LOCAL ROLE app_owner;\nRESET ROLE;\n",
  );
  return { migrations, schema };
}

/** The gate over the committed migrations plus one forward fixture. */
function gate(
  fixture: string,
  extra: ReadonlyMap<string, string> = new Map(),
): string[] {
  const sources = new Map(committedMigrations);
  sources.set("9999_fixture.sql", fixture);
  for (const [file, body] of extra) sources.set(file, body);
  return checkRecipientEmail(sources, committedSchema);
}

describe("T-27 — the fixture of spec 002 §10, end to end through db:check", () => {
  it("fails a migration that adds recipient.email, citing plan/07 §1.3 and naming file, table and column", () => {
    const { migrations, schema } = treeWith(
      "ALTER TABLE public.recipient ADD COLUMN email text;",
    );
    const { ok, output } = runDbCheck(migrations, schema);
    expect(ok).toBe(false);
    expect(output).toEqual([
      `0007_fixture.sql: column \`email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
    expect(output[0]).toMatch(CITATION);
  });

  it("passes a migration that adds recipient.recipient_contact_note", () => {
    const { migrations, schema } = treeWith(
      "ALTER TABLE public.recipient ADD COLUMN recipient_contact_note text;",
    );
    expect(runDbCheck(migrations, schema)).toEqual({
      ok: true,
      output: ["7 migration(s), each with a rollback"],
    });
  });

  it("passes the committed tree: 0006's recipient tables carry no email column", () => {
    expect(checkRecipientEmail(committedMigrations, committedSchema)).toEqual(
      [],
    );
    expect(
      runDbCheck(join(repoRoot, MIGRATIONS_DIR), join(repoRoot, SCHEMA_DIR)).ok,
    ).toBe(true);
  });

  it("fails the committed 0006 itself when its recipient table gains an email column", () => {
    const sources = new Map(committedMigrations);
    const original = sources.get("0006_customers.sql") ?? "";
    const mutated = original.replace(
      "  full_name           text        NOT NULL,\n",
      "  full_name           text        NOT NULL,\n  email               text        NULL,\n",
    );
    expect(mutated).not.toBe(original);
    sources.set("0006_customers.sql", mutated);
    expect(checkRecipientEmail(sources)).toEqual([
      expect.stringMatching(
        /^0006_customers\.sql: column `email` on `recipient` .*plan\/07 §1\.3/,
      ),
    ]);
  });
});

describe("AC-27 — every name the pattern /e[-_]?mail/i covers, on both recipient tables", () => {
  const names = [
    "email",
    "e_mail",
    '"e-mail"',
    '"Email"',
    '"E_MAIL"',
    "recipient_email",
    "emailaddress",
  ];
  for (const table of ["recipient", "recipient_address"]) {
    for (const name of names) {
      it(`${table}.${name}`, () => {
        const lines = gate(
          `ALTER TABLE public.${table} ADD COLUMN ${name} text;`,
        );
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(`on \`${table}\``);
        expect(lines[0]).toMatch(CITATION);
      });
    }
  }
});

describe("AC-27 — the routes by which a column can arrive", () => {
  const routes: readonly [string, string][] = [
    ["ADD without COLUMN", "ALTER TABLE recipient ADD email text;"],
    [
      "ADD COLUMN IF NOT EXISTS",
      "ALTER TABLE recipient ADD COLUMN IF NOT EXISTS email text;",
    ],
    [
      "ALTER TABLE IF EXISTS ONLY",
      "ALTER TABLE IF EXISTS ONLY public.recipient ADD COLUMN email text;",
    ],
    [
      "a second action in one ALTER",
      "ALTER TABLE recipient ADD COLUMN note text, ADD COLUMN email text;",
    ],
    [
      "a quoted table name",
      'ALTER TABLE "public"."recipient" ADD COLUMN email text;',
    ],
    [
      "another schema's recipient",
      "ALTER TABLE app.recipient ADD COLUMN email text;",
    ],
    [
      "RENAME COLUMN",
      "ALTER TABLE recipient RENAME COLUMN full_name TO email;",
    ],
    [
      "RENAME without COLUMN",
      "ALTER TABLE recipient_address RENAME delivery_note TO e_mail;",
    ],
    [
      "a table renamed into recipient",
      "CREATE TABLE contact (email text); DROP TABLE recipient_address; ALTER TABLE contact RENAME TO recipient_address;",
    ],
    [
      "CREATE TABLE … (LIKE customer)",
      "CREATE TABLE recipient_address (LIKE public.customer INCLUDING ALL);",
    ],
    [
      "CREATE TABLE … INHERITS",
      "CREATE TABLE contact (email text); CREATE TABLE recipient_address (id uuid) INHERITS (contact);",
    ],
    [
      "ALTER TABLE … INHERIT",
      "CREATE TABLE contact (email text); ALTER TABLE recipient INHERIT contact;",
    ],
    [
      "a parent that gains the column after INHERIT",
      "CREATE TABLE contact (id uuid); ALTER TABLE recipient INHERIT contact; ALTER TABLE contact ADD COLUMN email text;",
    ],
    [
      "PARTITION OF",
      "CREATE TABLE contact (email text) PARTITION BY LIST (email); DROP TABLE recipient; CREATE TABLE recipient PARTITION OF contact DEFAULT;",
    ],
    [
      "CREATE TABLE … AS",
      "DROP TABLE recipient; CREATE TABLE recipient AS SELECT id, email_normalised AS email FROM customer;",
    ],
    [
      "SELECT … INTO",
      "DROP TABLE recipient; SELECT id, email_normalised INTO recipient FROM customer;",
    ],
    [
      "a DO block's EXECUTE",
      "DO $$ BEGIN EXECUTE 'ALTER TABLE recipient ADD COLUMN email text'; END $$;",
    ],
    [
      "a tagged dollar body",
      "DO $body$ BEGIN EXECUTE $q$ALTER TABLE recipient ADD COLUMN email text$q$; END $body$;",
    ],
    [
      "an escape string",
      "DO $$ BEGIN EXECUTE E'ALTER TABLE recipient ADD COLUMN \\'x\\' text, ADD COLUMN email text'; END $$;",
    ],
    [
      "a Unicode-escaped identifier",
      'ALTER TABLE recipient ADD COLUMN U&"\\0065mail" text;',
    ],
    [
      "comments between the words",
      "ALTER /* x */ TABLE -- y\n recipient ADD /* z */ COLUMN email text;",
    ],
    [
      "a column added and dropped again (it existed at that version)",
      "ALTER TABLE recipient ADD COLUMN email text; ALTER TABLE recipient DROP COLUMN email;",
    ],
  ];
  for (const [label, sql] of routes) {
    it(label, () => {
      const lines = gate(sql);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(
        lines.some((line) =>
          /^9999_fixture\.sql: column `[^`]+` on `recipient(_address)?`/.test(
            line,
          ),
        ),
      ).toBe(true);
      for (const line of lines) {
        expect(line).toMatch(
          /^9999_fixture\.sql: (column `[^`]+` on `recipient(_address)?`|1 dynamic-SQL EXECUTE)/,
        );
        expect(line).toMatch(CITATION);
      }
    });
  }

  it("a rollback file that adds the column", () => {
    const lines = gate(
      "SELECT 1;",
      new Map([
        [
          "9999_fixture.down.sql",
          "ALTER TABLE recipient ADD COLUMN email text;",
        ],
      ]),
    );
    expect(lines).toEqual([
      expect.stringMatching(
        /^9999_fixture\.down\.sql: column `email` on `recipient`/,
      ),
    ]);
  });

  it("a Drizzle mirror that declares the column", () => {
    const schema = new Map(committedSchema);
    const original = schema.get("customers.ts") ?? "";
    const mutated = original.replace(
      'fullName: text("full_name").notNull(),',
      'fullName: text("full_name").notNull(),\n    contactEmail: text("contact_email"),',
    );
    expect(mutated).not.toBe(original);
    schema.set("customers.ts", mutated);
    expect(checkRecipientEmail(committedMigrations, schema)).toEqual([
      expect.stringMatching(
        /^customers\.ts: column `contactEmail` on `recipient`/,
      ),
      expect.stringMatching(
        /^customers\.ts: column `contact_email` on `recipient`/,
      ),
    ]);
  });
});

/** The one line the dynamic-SQL rule writes for the fixture. */
const DYNAMIC = (count: number, file = "9999_fixture.sql"): string =>
  `${file}: ${String(count)} dynamic-SQL EXECUTE statement(s) — db:check cannot read SQL assembled at run time, so it cannot prove no email column reaches a recipient table (${RECIPIENT_EMAIL_CITATION}); write the DDL literally, or add the file to DYNAMIC_SQL_ALLOWED with a reason`;
const VIEW = (table: string): string =>
  `9999_fixture.sql: \`${table}\` is created as a view, whose columns db:check cannot read — a recipient table must be a table, and ${RECIPIENT_EMAIL_CITATION}`;

describe("AC-27 — fails closed on what it cannot read (breaker hole 1, PR 200)", () => {
  it("EXECUTE format('… %I …', 'e' || 'mail')", () => {
    expect(
      gate(
        "DO $$ BEGIN EXECUTE format('ALTER TABLE public.recipient ADD COLUMN %I text', 'e' || 'mail'); END $$;",
      ),
    ).toEqual([DYNAMIC(1)]);
  });

  it("EXECUTE of a concatenation", () => {
    expect(
      gate(
        "DO $$ BEGIN EXECUTE 'ALTER TABLE recipient ADD COLUMN ' || 'e' || 'mail text'; END $$;",
      ),
    ).toEqual([DYNAMIC(1)]);
  });

  it("EXECUTE of a variable, and RETURN QUERY EXECUTE in a function body", () => {
    expect(
      gate(`DO $$ DECLARE c text := 'e' || 'mail';
BEGIN EXECUTE 'ALTER TABLE recipient ADD COLUMN ' || c || ' text'; END $$;
CREATE FUNCTION f() RETURNS SETOF int LANGUAGE plpgsql AS $f$ BEGIN RETURN QUERY EXECUTE 'SELECT 1'; END $f$;`),
    ).toEqual([DYNAMIC(2)]);
  });

  it("EXECUTE in a rollback file", () => {
    expect(
      gate(
        "SELECT 1;",
        new Map([
          ["9999_fixture.down.sql", "DO $$ BEGIN EXECUTE 'SELECT 1'; END $$;"],
        ]),
      ),
    ).toEqual([DYNAMIC(1, "9999_fixture.down.sql")]);
  });

  it("recipient swapped for a view with an email column (the breaker's route)", () => {
    expect(
      gate(
        "ALTER TABLE recipient RENAME TO recipient_base; CREATE VIEW recipient AS SELECT b.*, c.email_normalised AS email FROM recipient_base b JOIN customer c ON c.id = b.customer_id;",
      ),
    ).toEqual([VIEW("recipient")]);
  });

  it("a materialized view, or CREATE OR REPLACE VIEW, named recipient_address", () => {
    expect(
      gate("CREATE MATERIALIZED VIEW recipient_address AS SELECT 1 AS x;"),
    ).toEqual([VIEW("recipient_address")]);
    expect(
      gate("CREATE OR REPLACE VIEW public.recipient_address AS SELECT 1 AS x;"),
    ).toEqual([VIEW("recipient_address")]);
  });

  it("a view renamed into a recipient name brings every name in its text", () => {
    for (const verb of [
      "ALTER VIEW",
      "ALTER TABLE",
      "ALTER MATERIALIZED VIEW",
    ]) {
      const lines = gate(
        `CREATE ${verb.endsWith("MATERIALIZED VIEW") ? "MATERIALIZED " : ""}VIEW contact AS SELECT email_normalised AS email FROM customer; DROP TABLE recipient; ${verb} contact RENAME TO recipient;`,
      );
      expect(lines, verb).toContain(
        `9999_fixture.sql: column \`email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
      );
    }
  });

  it("a foreign table named recipient", () => {
    expect(
      gate(
        "DROP TABLE recipient; CREATE FOREIGN TABLE recipient (email text) SERVER s;",
      ),
    ).toEqual([
      `9999_fixture.sql: column \`email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });

  it("allows dynamic SQL only in 0001's role bootstrap, which needs it, and the list is pinned", () => {
    expect([...DYNAMIC_SQL_ALLOWED.keys()]).toEqual([
      "0001_roles_grants_updated_at.sql",
      "0001_roles_grants_updated_at.down.sql",
    ]);
    for (const file of DYNAMIC_SQL_ALLOWED.keys()) {
      expect(
        dynamicSqlCount(committedMigrations.get(file) ?? ""),
        file,
      ).toBeGreaterThan(0);
    }
    for (const [file, body] of committedMigrations) {
      if (!DYNAMIC_SQL_ALLOWED.has(file))
        expect(dynamicSqlCount(body), file).toBe(0);
    }
  });
});

describe("AC-27 — the evaluated mirror (breaker hole 2, PR 200)", () => {
  const contactColumns = { contact: text("e_mail") };
  const COLUMN = "email";
  const named: string = ["recipient", "address"].join("_");
  const tables: readonly [string, unknown, string][] = [
    [
      "a spread",
      pgTable("recipient", { id: uuid("id"), ...contactColumns }),
      "e_mail",
    ],
    ["a constant", pgTable("recipient_address", { x: text(COLUMN) }), "email"],
    [
      "a template literal",
      pgTable("recipient", { x: text(`e${"-"}mail`) }),
      "e-mail",
    ],
    [
      "a computed table name and a key-named column",
      pgTable(named, { email: text() }),
      "email",
    ],
    [
      "a table in another schema",
      pgSchema("app").table("recipient", { email: text("email") }),
      "email",
    ],
  ];
  for (const [label, table, column] of tables) {
    it(label, () => {
      expect(recipientEmailInTables([table])).toEqual([
        expect.stringMatching(
          new RegExp(
            `^db/schema: column \`${column}\` on \`recipient(_address)?\` .*plan/07 §1\\.3`,
          ),
        ),
      ]);
    });
  }

  it("passes a buyer's email, a non-table export and the committed mirror", async () => {
    const schema = (await import("../../db/schema/index.ts")) as Record<
      string,
      unknown
    >;
    expect(
      recipientEmailInTables([
        pgTable("customer", { email: text("email_normalised") }),
        "recipient",
        { name: "recipient", email: true },
        ...Object.values(schema),
      ]),
    ).toEqual([]);
  });

  it("runDbCheckWithMirror fails a mirror whose recipient spreads in an email column", async () => {
    const root = mkdtempSync(join(repoRoot, "node_modules/.cache/t27-mirror-"));
    scratch.push(root);
    const schemaDir = join(root, "schema");
    cpSync(join(repoRoot, SCHEMA_DIR), schemaDir, { recursive: true });
    const file = join(schemaDir, "customers.ts");
    const original = readFileSync(file, "utf8");
    const mutated = original
      .replace(
        "export const recipient = pgTable(",
        'const contactColumns = { contact: text("e_mail") };\n\nexport const recipient = pgTable(',
      )
      .replace(
        '    fullName: text("full_name").notNull(),',
        '    fullName: text("full_name").notNull(),\n    ...contactColumns,',
      );
    expect(mutated).not.toBe(original);
    writeFileSync(file, mutated);
    const { ok, output } = await runDbCheckWithMirror(
      join(repoRoot, MIGRATIONS_DIR),
      schemaDir,
    );
    expect(ok).toBe(false);
    expect(output).toEqual([
      `db/schema: column \`e_mail\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });

  it("runDbCheckWithMirror passes the committed tree", async () => {
    expect(
      await runDbCheckWithMirror(
        join(repoRoot, MIGRATIONS_DIR),
        join(repoRoot, SCHEMA_DIR),
      ),
    ).toEqual({ ok: true, output: ["6 migration(s), each with a rollback"] });
  });
});

describe("AC-27 — near misses that pass", () => {
  const passes: readonly [string, string][] = [
    [
      "recipient_contact_note",
      "ALTER TABLE recipient ADD COLUMN recipient_contact_note text;",
    ],
    [
      "an email column on customer (a buyer has one)",
      "ALTER TABLE customer ADD COLUMN email_verified_at timestamptz;",
    ],
    [
      "an email column on a table named like a recipient",
      "CREATE TABLE recipient_email_log (email text);",
    ],
    [
      "a constraint whose name says email",
      "ALTER TABLE recipient ADD CONSTRAINT recipient_no_email_check CHECK (true);",
    ],
    [
      "prose in a comment",
      "-- ALTER TABLE recipient ADD COLUMN email text;\n/* ADD COLUMN email */ SELECT 1;",
    ],
    [
      "prose in a COMMENT ON string",
      "COMMENT ON TABLE recipient IS 'no email column, ever';",
    ],
    [
      "a column 'female' (no e-mail in it)",
      "ALTER TABLE recipient ADD COLUMN female boolean;",
    ],
    [
      "EXECUTE FUNCTION, EXECUTE PROCEDURE and the EXECUTE privilege",
      `CREATE TRIGGER t BEFORE UPDATE ON recipient FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER u BEFORE UPDATE ON recipient FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO app_web;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_web;`,
    ],
    [
      "a view with an email column under another name",
      "CREATE VIEW buyer_contact AS SELECT email_normalised AS email FROM customer;",
    ],
  ];
  for (const [label, sql] of passes) {
    it(label, () => {
      expect(gate(sql)).toEqual([]);
    });
  }
});

describe("recipientEmailViolations — the same rule over a live catalogue (TASK-027)", () => {
  it("reports only recipient-table columns matching the pattern", () => {
    expect(
      recipientEmailViolations([
        { table: "recipient", column: "full_name" },
        { table: "recipient_address", column: "E-Mail" },
        { table: "customer", column: "email_normalised" },
        { table: "recipient", column: "recipient_contact_note" },
      ]),
    ).toEqual([
      `database: column \`E-Mail\` on \`recipient_address\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });
});

describe("lexSql", () => {
  it("keeps quoted identifiers' case, folds bare words, drops nested comments, keeps strings whole", () => {
    expect(
      lexSql(`/* a /* b */ c */ ALTER "Recipient" 'it''s' $x$ y $x$ -- z`),
    ).toEqual([
      { kind: "word", value: "alter" },
      { kind: "ident", value: "Recipient" },
      { kind: "string", value: "it's" },
      { kind: "string", value: " y " },
    ]);
  });

  it("reads every committed migration in well under a second", () => {
    const started = performance.now();
    for (const body of committedMigrations.values()) lexSql(body);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(
      readFileSync(
        join(repoRoot, MIGRATIONS_DIR, "0006_customers.sql"),
        "utf8",
      ),
    ).toContain("CREATE TABLE public.recipient (");
  });
});
