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

import {
  checkRecipientEmail,
  lexSql,
  MIGRATIONS_DIR,
  readSources,
  RECIPIENT_EMAIL_CITATION,
  recipientEmailViolations,
  runDbCheck,
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
      for (const line of lines) {
        expect(line).toMatch(
          /^9999_fixture\.sql: column `[^`]+` on `recipient(_address)?`/,
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
