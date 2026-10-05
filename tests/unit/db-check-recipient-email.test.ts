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
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { jsonb, pgSchema, pgTable, text, uuid } from "drizzle-orm/pg-core";

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
          /^9999_fixture\.sql: (column `[^`]+` on `recipient(_address)?`|1 dynamic-SQL EXECUTE|`recipient(_address)?` gets columns db:check cannot see|DDL inside a DO block)/,
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

/**
 * A scratch directory under the repository, so a copied mirror resolves `drizzle-orm` from the
 * repository's `node_modules`. It lives in `test-results/` (ignored by git, the formatter and
 * lint), not under `node_modules/`: Node does not strip types there, and `node_modules/.cache`
 * does not exist on a fresh install (breaker r2 observation). Created with its parent.
 */
function mirrorScratch(): string {
  const parent = join(repoRoot, "test-results");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "t27-mirror-"));
  scratch.push(root);
  return root;
}

/**
 * A copy of `scripts/db-check.ts`, `db/migrations/` and `db/schema/` in a scratch tree, with
 * `recipient` spreading in an `e_mail` column when `spread` is set. The copied script imports
 * `../db/schema/index.ts` statically, so running it reads the copied mirror: that is how the CLI
 * entry point itself is tested (breaker r2 hole C) without a computed `import()` in `scripts/`.
 */
function mirrorTree(spread: boolean): { root: string; schemaDir: string } {
  const root = mirrorScratch();
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(
    join(repoRoot, "scripts/db-check.ts"),
    join(root, "scripts/db-check.ts"),
  );
  cpSync(join(repoRoot, MIGRATIONS_DIR), join(root, MIGRATIONS_DIR), {
    recursive: true,
  });
  const schemaDir = join(root, SCHEMA_DIR);
  cpSync(join(repoRoot, SCHEMA_DIR), schemaDir, { recursive: true });
  if (spread) {
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
  }
  return { root, schemaDir };
}

/** Nests `inner` in `levels` function bodies, each with its own `$qN$` tag. */
function nested(levels: number, inner: string): string {
  let body = inner;
  for (let level = levels; level >= 1; level -= 1) {
    body = `CREATE FUNCTION f${String(level)}() RETURNS void LANGUAGE plpgsql AS $q${String(level)}$ BEGIN ${body}; END $q${String(level)}$`;
  }
  return `${body};`;
}

/** The procedural-body line (breaker r3 / reviewer R2-1): DDL inside a DO block or function body. */
const PROCEDURAL = (file = "9999_fixture.sql"): string =>
  `${file}: DDL inside a DO block or a function body — db:check reads DDL at the top level of a migration only, so it cannot prove no email column reaches a recipient table (${RECIPIENT_EMAIL_CITATION}); write the statement at the top level, or add the file to DYNAMIC_SQL_ALLOWED with a reason`;
/** The type allow-list line (breaker r3): a recipient column of a non-scalar type. */
const TYPE_LINE = (table: string, column: string, type: string): string =>
  `9999_fixture.sql: column \`${column}\` on \`${table}\` has type \`${type}\`, which is not a built-in scalar on RECIPIENT_COLUMN_TYPE — a domain, composite or row type hides its fields, and ${RECIPIENT_EMAIL_CITATION}`;

const TYPED = (file = "9999_fixture.sql"): string =>
  `${file}: a typed table (\`OF\` a type, or \`ALTER TYPE … CASCADE\`) takes its columns from a type db:check does not follow, so it cannot prove no email column reaches a recipient table (${RECIPIENT_EMAIL_CITATION}); give the table its columns directly`;

describe("AC-27 — breaker round 2 (PR 200)", () => {
  it("A: an EXECUTE nested four and six $qN$ levels deep is still refused", () => {
    const execute =
      "EXECUTE 'ALTER TABLE public.recipient ADD COLUMN ' || 'e' || 'mail text'";
    expect(gate(nested(4, execute))).toEqual([PROCEDURAL(), DYNAMIC(1)]);
    expect(gate(nested(6, execute))).toEqual([PROCEDURAL(), DYNAMIC(1)]);
  });

  it("A: literal DDL nested six function bodies deep is still read", () => {
    expect(
      gate(nested(6, "ALTER TABLE recipient ADD COLUMN email text")),
    ).toEqual([
      PROCEDURAL(),
      `9999_fixture.sql: column \`email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });

  it("B: ALTER TABLE … OF a type, then ALTER TYPE … ADD ATTRIBUTE … CASCADE (the breaker's route)", () => {
    expect(
      gate(
        "CREATE TYPE recipient_row AS (id uuid, full_name text); ALTER TABLE recipient OF recipient_row; ALTER TYPE recipient_row ADD ATTRIBUTE email text CASCADE;",
      ),
    ).toEqual([TYPED()]);
  });

  describe("R2-1: DDL inside plpgsql control flow is read wherever it sits", () => {
    const COLUMN_LINE = `9999_fixture.sql: column \`email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`;
    const bodies: readonly [string, string][] = [
      [
        "IF (SELECT …) THEN (the reviewer's case)",
        "IF (SELECT true) THEN ALTER TABLE recipient ADD COLUMN email text; END IF;",
      ],
      [
        "the ELSE branch",
        "IF false THEN NULL; ELSE ALTER TABLE recipient ADD COLUMN email text; END IF;",
      ],
      [
        "an ELSIF after a SELECT condition",
        "IF (SELECT false) THEN NULL; ELSIF (SELECT true) THEN ALTER TABLE recipient ADD COLUMN email text; END IF;",
      ],
      [
        "CASE … WHEN … THEN",
        "CASE WHEN (SELECT 1) = 1 THEN ALTER TABLE recipient ADD COLUMN email text; END CASE;",
      ],
      [
        "a LOOP",
        "FOR i IN SELECT 1 LOOP ALTER TABLE recipient ADD COLUMN email text; END LOOP;",
      ],
      [
        "a WHILE loop on a SELECT",
        "WHILE (SELECT false) LOOP NULL; END LOOP; PERFORM 1; ALTER TABLE recipient ADD COLUMN email text;",
      ],
      [
        "a nested BEGIN block",
        "BEGIN BEGIN IF (SELECT true) THEN ALTER TABLE recipient ADD COLUMN email text; END IF; END; END;",
      ],
      [
        "a labelled block after a SELECT INTO",
        "<<outer>> DECLARE n int; BEGIN SELECT 1 INTO n; IF n = 1 THEN ALTER TABLE recipient ADD COLUMN email text; END IF; END;",
      ],
    ];
    for (const [label, body] of bodies) {
      it(label, () => {
        // Refused outright as procedural DDL, and still read: the column line is defence in depth.
        expect(gate(`DO $$ BEGIN ${body} END $$;`)).toEqual([
          PROCEDURAL(),
          COLUMN_LINE,
        ]);
      });
    }

    it("a recognised statement read again from a later keyword changes nothing", () => {
      expect(
        gate(
          "CREATE VIEW buyer_contact AS SELECT email_normalised AS email FROM customer; ALTER TABLE recipient ADD COLUMN note text, DROP COLUMN note; GRANT SELECT ON recipient TO app_web;",
        ),
      ).toEqual([]);
    });
  });

  it("B: ALTER TABLE … OF a type on its own, even with no email attribute yet", () => {
    expect(
      gate(
        "CREATE TYPE recipient_row AS (id uuid); ALTER TABLE recipient OF recipient_row;",
      ),
    ).toEqual([TYPED()]);
  });

  it("B: CREATE TABLE … OF a type, and ALTER TYPE … CASCADE on its own", () => {
    expect(
      gate(
        "DROP TABLE recipient_address; CREATE TABLE recipient_address OF contact_row;",
      ),
    ).toEqual([TYPED()]);
    expect(
      gate("ALTER TYPE contact_row RENAME ATTRIBUTE phone TO email CASCADE;"),
    ).toEqual([TYPED()]);
  });

  it("B: a column of a composite type that carries an email attribute", () => {
    expect(
      gate(
        "CREATE TYPE contact_t AS (phone text, email text); ALTER TABLE recipient ADD COLUMN contact contact_t;",
      ),
    ).toEqual([
      TYPE_LINE("recipient", "contact", "contact_t"),
      `9999_fixture.sql: column \`contact.email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
    expect(
      gate(
        "CREATE TYPE contact_t AS (phone text); ALTER TYPE contact_t ADD ATTRIBUTE e_mail text; ALTER TABLE recipient_address ADD COLUMN contacts public.contact_t[];",
      ),
    ).toEqual([
      TYPE_LINE("recipient_address", "contacts", "public.contact_t[]"),
      `9999_fixture.sql: column \`contacts.e_mail\` on \`recipient_address\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });

  it("B: a composite column carried into recipient by LIKE, and a nested composite", () => {
    expect(
      gate(
        "CREATE TYPE contact_t AS (email text); CREATE TABLE contact_book (c contact_t); DROP TABLE recipient; CREATE TABLE recipient (LIKE contact_book);",
      ),
    ).toEqual([
      TYPE_LINE("recipient", "c", "contact_t"),
      `9999_fixture.sql: column \`c.email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
    expect(
      gate(
        "CREATE TYPE inner_t AS (email text); CREATE TYPE outer_t AS (who inner_t); ALTER TABLE recipient ADD COLUMN x outer_t;",
      ),
    ).toEqual([
      TYPE_LINE("recipient", "x", "outer_t"),
      `9999_fixture.sql: column \`x.who.email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });

  it("B: a type that gains an email attribute after a recipient column uses it", () => {
    for (const change of [
      "ALTER TYPE contact_t ADD ATTRIBUTE email text",
      "ALTER TYPE contact_t RENAME ATTRIBUTE phone TO email",
    ]) {
      expect(
        gate(
          `CREATE TYPE contact_t AS (phone text); ALTER TABLE recipient ADD COLUMN contact contact_t; ${change};`,
        ),
        change,
      ).toEqual([
        TYPE_LINE("recipient", "contact", "contact_t"),
        `9999_fixture.sql: column \`contact.email\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
      ]);
    }
  });

  it("B: a composite type with no email attribute is refused too: only built-in scalars", () => {
    expect(
      gate(
        "CREATE TYPE money_t AS (amount_minor bigint, currency text); ALTER TABLE recipient ADD COLUMN m money_t;",
      ),
    ).toEqual([TYPE_LINE("recipient", "m", "money_t")]);
  });

  it("C: the CLI runs the evaluated mirror (a spread email column fails `node scripts/db-check.ts`)", () => {
    const { root } = mirrorTree(true);
    const run = spawnSync(
      process.execPath,
      [join(root, "scripts/db-check.ts")],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    expect(run.status).toBe(1);
    expect(run.stderr.trim().split("\n")).toEqual([
      `db:check: db/schema: column \`e_mail\` on \`recipient\` — recipient data is minimised, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
  });

  it("C: the same copied CLI passes the unmutated tree", () => {
    const { root } = mirrorTree(false);
    const run = spawnSync(
      process.execPath,
      [join(root, "scripts/db-check.ts")],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    expect({ status: run.status, stdout: run.stdout.trim() }).toEqual({
      status: 0,
      stdout: "6 migration(s), each with a rollback",
    });
  });
});

describe("AC-27 — the class, closed (breaker r3, PR 200)", () => {
  const SEARCH_PATH = `9999_fixture.sql: a search_path change — an unqualified type could then resolve to a user type, and the recipient type allow-list (${RECIPIENT_EMAIL_CITATION}) assumes it cannot; qualify names instead`;
  const UNSEEN = (column: string): string =>
    `9999_fixture.sql: column \`${column}\` on \`recipient\` has a type db:check cannot see (taken from a view or a query) — a recipient table holds built-in scalar types only, and ${RECIPIENT_EMAIL_CITATION}`;

  it("E: a domain over an email-bearing composite", () => {
    expect(
      gate(
        "CREATE TYPE contact_t AS (email text); CREATE DOMAIN contact_d AS contact_t; ALTER TABLE recipient ADD COLUMN contact contact_d;",
      ),
    ).toEqual([TYPE_LINE("recipient", "contact", "contact_d")]);
  });

  it("E: a domain over text, and a schema-qualified type called text", () => {
    expect(
      gate(
        "CREATE DOMAIN note_d AS text; ALTER TABLE recipient ADD COLUMN note note_d;",
      ),
    ).toEqual([TYPE_LINE("recipient", "note", "note_d")]);
    expect(gate("ALTER TABLE recipient ADD COLUMN note public.text;")).toEqual([
      TYPE_LINE("recipient", "note", "public.text"),
    ]);
  });

  it("F: a table row type, a view row type, and a type renamed afterwards", () => {
    expect(
      gate("ALTER TABLE recipient ADD COLUMN buyer public.customer;"),
    ).toEqual([TYPE_LINE("recipient", "buyer", "public.customer")]);
    expect(
      gate(
        "CREATE VIEW buyer_v AS SELECT email_normalised FROM customer; ALTER TABLE recipient ADD COLUMN b buyer_v;",
      ),
    ).toEqual([TYPE_LINE("recipient", "b", "buyer_v")]);
    expect(
      gate(
        "CREATE TYPE a_t AS (x text); ALTER TABLE recipient ADD COLUMN a a_t; ALTER TYPE a_t RENAME TO b_t;",
      ),
    ).toEqual([TYPE_LINE("recipient", "a", "a_t")]);
  });

  it("F: an array of a composite, and ALTER COLUMN … TYPE to a composite", () => {
    expect(
      gate(
        "ALTER TABLE recipient_address ADD COLUMN people public.customer[];",
      ),
    ).toEqual([TYPE_LINE("recipient_address", "people", "public.customer[]")]);
    expect(
      gate(
        "CREATE TYPE p_t AS (x text); ALTER TABLE recipient ALTER COLUMN full_name SET DATA TYPE p_t USING NULL;",
      ),
    ).toEqual([TYPE_LINE("recipient", "full_name", "p_t")]);
  });

  it("a view renamed into recipient: every column's type is unseen", () => {
    const lines = gate(
      "CREATE VIEW contact AS SELECT 1 AS n; DROP TABLE recipient; ALTER VIEW contact RENAME TO recipient;",
    );
    expect(lines).toContain(UNSEEN("n"));
  });

  it("R2-1, closed by refusal: DDL in a function body, a DO inside a body, with no EXECUTE", () => {
    expect(
      gate(
        "CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF (SELECT true) THEN DROP TABLE recipient; END IF; END $f$;",
      ),
    ).toEqual([PROCEDURAL()]);
    expect(
      gate(
        "CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $f$ BEGIN DO $d$ BEGIN NULL; END $d$; END $f$;",
      ),
    ).toEqual([PROCEDURAL()]);
  });

  it("search_path changes: SET, set_config, ALTER ROLE, and inside a body", () => {
    expect(gate("SET LOCAL search_path TO evil, pg_catalog;")).toEqual([
      SEARCH_PATH,
    ]);
    expect(
      gate("SELECT set_config('search_path', 'evil, pg_catalog', true);"),
    ).toEqual([SEARCH_PATH]);
    expect(gate("ALTER ROLE app_owner SET search_path = evil;")).toEqual([
      SEARCH_PATH,
    ]);
    expect(
      gate(
        "DO $$ BEGIN PERFORM set_config('search_path', 'evil', true); END $$;",
      ),
    ).toEqual([SEARCH_PATH]);
  });

  it("passes: every allow-listed scalar, a function header's SET search_path, ON CONFLICT DO NOTHING in a body", () => {
    expect(
      gate(`ALTER TABLE recipient
  ADD COLUMN a varchar(200), ADD COLUMN b character varying, ADD COLUMN c char(2),
  ADD COLUMN d character(3), ADD COLUMN e numeric(10,2), ADD COLUMN f int, ADD COLUMN g bigint,
  ADD COLUMN h smallint, ADD COLUMN i bool, ADD COLUMN j date, ADD COLUMN k timestamp with time zone,
  ADD COLUMN l pg_catalog.text, ADD COLUMN m text[] NOT NULL DEFAULT '{}', ADD COLUMN n uuid COLLATE "C";
CREATE FUNCTION g() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $g$ BEGIN INSERT INTO locale (code, bcp47, name) VALUES ('x', 'x', 'x') ON CONFLICT DO NOTHING; END $g$;`),
    ).toEqual([]);
  });

  it("the evaluated mirror refuses a non-scalar recipient column too", () => {
    expect(
      recipientEmailInTables([pgTable("recipient", { data: jsonb("data") })]),
    ).toEqual([
      `db/schema: column \`data\` on \`recipient\` has type \`jsonb\`, which is not a built-in scalar on RECIPIENT_COLUMN_TYPE — a domain, composite or row type hides its fields, and ${RECIPIENT_EMAIL_CITATION}`,
    ]);
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
    const { schemaDir } = mirrorTree(true);
    const mirror = (await import(
      pathToFileURL(join(schemaDir, "index.ts")).href
    )) as Record<string, unknown>;
    const { ok, output } = await runDbCheckWithMirror(
      join(repoRoot, MIGRATIONS_DIR),
      schemaDir,
      mirror,
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
