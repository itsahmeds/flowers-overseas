/**
 * T-08 (spec 001 AC-7, TASK-004; ADR-0009): `fo/no-direct-order-status-write` over the
 * order-status fixtures. The rule is path-dependent — the same call is a violation in
 * `src/modules/catalog/x.ts` and legitimate in `src/modules/orders/service/transition.ts` — so
 * every case is run through RuleTester's `filename` option.
 *
 * T-64 (spec 001 §14 A20, AC-60; TASK-162): the shapes lint can see — aliased tables, the table
 * `"order"`, quoted and schema-qualified SQL over line breaks, `ON CONFLICT … DO UPDATE`, Drizzle
 * `onConflictDoUpdate`, and a `.set(patch)` the rule cannot read (red: "cannot prove this does
 * not write `status`"). The T-64 rows are written out exactly as the spec lists them; the
 * "further shapes" block below them holds what a breaker would try next. The rule's `files`
 * (every root AC-60 names) are asserted through the real config at the end of this file and in
 * `tests/unit/lint-coverage.test.ts`'s AC-52 table.
 */
import { ESLint, Linter, RuleTester } from "eslint";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  isOrderServiceFile,
  isOrderStatusSql,
} from "../../eslint/fo/no-direct-order-status-write.js";
import plugin from "../../eslint/fo/index.js";
import { tsLanguageOptions } from "./support/ts-parser";

const fixtureDir = resolve(__dirname, "../fixtures/lint");
const fixture = (name: string): string =>
  readFileSync(join(fixtureDir, name), "utf8");

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

/** A module outside the order service: nothing here may write the status column. */
const OUTSIDE = "src/modules/catalog/x.ts";
/** The state machine itself (ADR-0009): the one place the write is allowed. */
const INSIDE = "src/modules/orders/service/transition.ts";

describe("fo/no-direct-order-status-write fixtures (T-08)", () => {
  it("reports exactly one error per invalid fixture outside src/modules/orders/service/", () => {
    expect(() => {
      ruleTester.run("no-direct-order-status-write", rule, {
        valid: [],
        invalid: [
          {
            code: fixture("order-status-drizzle.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: fixture("order-status-sql.ts"),
            filename: OUTSIDE,
            errors: [{ messageId: "sql" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("allows the identical Drizzle call and SQL inside the order service, and clean writes anywhere", () => {
    expect(() => {
      ruleTester.run("no-direct-order-status-write", rule, {
        valid: [
          {
            code: fixture("src/modules/orders/service/transition.ts"),
            filename: INSIDE,
          },
          { code: fixture("order-status-drizzle.ts"), filename: INSIDE },
          { code: fixture("order-status-sql.ts"), filename: INSIDE },
          { code: fixture("order-status-valid.ts"), filename: OUTSIDE },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("cites ADR-0009 and orderService.transition in the message", () => {
    const linter = new Linter();
    const messages = linter.verify(
      fixture("order-status-drizzle.ts"),
      {
        files: ["**/*.ts"],
        plugins: { fo: plugin },
        languageOptions: tsLanguageOptions,
        rules: { "fo/no-direct-order-status-write": "error" },
      },
      "src/modules/catalog/x.ts",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain("ADR-0009");
    expect(messages[0]?.message).toContain("orderService.transition");
  });
});

describe("fo/no-direct-order-status-write shapes", () => {
  const lint = (code: string, filename = OUTSIDE): Linter.LintMessage[] => {
    const linter = new Linter();
    return linter.verify(
      code,
      {
        files: ["**/*.ts"],
        plugins: { fo: plugin },
        languageOptions: tsLanguageOptions,
        rules: { "fo/no-direct-order-status-write": "error" },
      },
      filename,
    );
  };

  it.each([
    ['db.update(orders).set({ status: "paid" });', 1],
    ["tx.update(orders).set({ status }).where(eq(orders.id, id));", 1],
    ["db.update(orders).set({ ...statusPatch });", 1],
    ['db.update(schema.orders).set({ "status": next });', 1],
    ['await db.update(orders).where(cond).set({ status: "paid" });', 1],
    ['db.update(orders).set({ recipient_name: "x" });', 0],
    ['db.update(order_events).set({ status: "x" });', 0],
    ["db.update(orders).set({ statusless: 1 });", 0],
  ])("Drizzle chain %s reports %i", (code, expected) => {
    expect(lint(code)).toHaveLength(expected);
  });

  it.each([
    ["sql`UPDATE orders SET status = 'paid'`;", 1],
    ["sql`update  orders\n  set status = $1, updated_at = now()`;", 1],
    ["const q = \"UPDATE orders SET status = 'paid'\";", 1],
    ["sql`UPDATE orders SET recipient_name = $1`;", 0],
    ["sql`SELECT status FROM orders`;", 0],
    ["sql`UPDATE partners SET status = 'live'`;", 0],
  ])("SQL %s reports %i", (code, expected) => {
    expect(lint(code)).toHaveLength(expected);
  });

  it("stays silent everywhere inside the order service", () => {
    expect(
      lint('db.update(orders).set({ status: "paid" });', INSIDE),
    ).toHaveLength(0);
    expect(
      lint(
        "sql`UPDATE orders SET status = 'paid'`;",
        "src/modules/orders/service/nested/guards.ts",
      ),
    ).toHaveLength(0);
  });
});

/** The spec's message for a patch the rule cannot read (AC-60 item 4). */
const CANNOT_PROVE = "cannot prove this does not write `status`";

interface Case {
  readonly name: string;
  readonly code: string;
  readonly messageId: "drizzle" | "sql" | "unreadable";
}

/** T-64's Invalid column, in the spec's order, at `src/modules/catalog/x.ts`. */
const T64_INVALID: readonly Case[] = [
  {
    name: "import { orders as o } then db.update(o).set({ status })",
    code: 'import { orders as o } from "@/db/schema";\ndb.update(o).set({ status });',
    messageId: "drizzle",
  },
  {
    name: "const t = orders; db.update(t).set({ status })",
    code: "const t = orders;\ndb.update(t).set({ status });",
    messageId: "drizzle",
  },
  {
    name: 'db.update(schema["orders"]).set({ status })',
    code: 'db.update(schema["orders"]).set({ status });',
    messageId: "drizzle",
  },
  {
    name: "the string UPDATE \"order\" SET status = 'paid'",
    code: "const q = 'UPDATE \"order\" SET status = \\'paid\\'';",
    messageId: "sql",
  },
  {
    name: 'the string UPDATE "orders" SET "status" = \'paid\'',
    code: "const q = 'UPDATE \"orders\" SET \"status\" = \\'paid\\'';",
    messageId: "sql",
  },
  {
    name: "the string update public.orders o set status = 'paid', split over two lines",
    code: "const q = `update public.orders o\nset status = 'paid'`;",
    messageId: "sql",
  },
  {
    name: "sql`UPDATE ${orders} SET ${orders.status} = 'paid'`",
    code: "sql`UPDATE ${orders} SET ${orders.status} = 'paid'`;",
    messageId: "sql",
  },
  {
    name: "INSERT INTO orders … ON CONFLICT (id) DO UPDATE SET status = 'paid'",
    code: "sql`INSERT INTO orders (id, notes) VALUES (${id}, ${notes}) ON CONFLICT (id) DO UPDATE SET status = 'paid'`;",
    messageId: "sql",
  },
  {
    name: "db.insert(orders).values(v).onConflictDoUpdate({ target: orders.id, set: { status } })",
    code: "db.insert(orders).values(v).onConflictDoUpdate({ target: orders.id, set: { status } });",
    messageId: "drizzle",
  },
  {
    name: "db.update(orders).set(patch) where patch is a parameter",
    code: "export function save(patch: Record<string, unknown>) {\n  return db.update(orders).set(patch);\n}",
    messageId: "unreadable",
  },
];

/** T-64's Valid column at `src/modules/catalog/x.ts`. */
const T64_VALID: readonly { readonly name: string; readonly code: string }[] = [
  {
    name: "db.update(orders).set({ notes })",
    code: "db.update(orders).set({ notes });",
  },
  {
    name: 'db.insert(orders).values({ status: "draft" })',
    code: 'db.insert(orders).values({ status: "draft" });',
  },
];

/** One RuleTester run per row, so a red names its row. */
const reportsOnce = ({ name, code, messageId }: Case, filename = OUTSIDE) =>
  ruleTester.run("no-direct-order-status-write", rule, {
    valid: [],
    invalid: [{ name, code, filename, errors: [{ messageId }] }],
  });
const passes = (
  { name, code }: { name: string; code: string },
  filename = OUTSIDE,
) =>
  ruleTester.run("no-direct-order-status-write", rule, {
    valid: [{ name, code, filename }],
    invalid: [],
  });

describe("fo/no-direct-order-status-write T-64 (AC-60)", () => {
  it.each(T64_INVALID)(
    "outside the service, $name is red once ($messageId)",
    (row) => {
      expect(() => reportsOnce(row)).not.toThrow();
    },
  );

  it.each(T64_VALID)("outside the service, $name passes", (row) => {
    expect(() => passes(row)).not.toThrow();
  });

  it.each(T64_INVALID)(
    "inside src/modules/orders/service/transition.ts, $name passes",
    (row) => {
      expect(() => passes(row, INSIDE)).not.toThrow();
    },
  );

  it(`says "${CANNOT_PROVE}" for a patch it cannot read`, () => {
    const linter = new Linter();
    const messages = linter.verify(
      "export const save = (patch: object) => db.update(orders).set(patch);",
      {
        files: ["**/*.ts"],
        plugins: { fo: plugin },
        languageOptions: tsLanguageOptions,
        rules: { "fo/no-direct-order-status-write": "error" },
      },
      OUTSIDE,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toContain(CANNOT_PROVE);
    expect(messages[0]?.message).toContain("orderService.transition");
  });
});

/**
 * Beyond T-64: each shape below is one step past a T-64 row (another alias form, another way to
 * hand `.set()` something it cannot read, the SQL a looser or tighter pattern gets wrong). Each
 * row names the message it must carry, or `0` when it must stay clean.
 */
describe("the allowed path is anchored at the repository root (/review 119 change 1)", () => {
  const [row] = T64_INVALID;
  it.each([
    "scripts/src/modules/orders/service/x.ts",
    "src/modules/catalog/src/modules/orders/service/x.ts",
    "tests/fixtures/lint/scripts/src/modules/orders/service/x.ts",
    "/elsewhere/src/modules/orders/service/x.ts",
  ])("%s is not the service: red", (filename) => {
    expect(row).toBeDefined();
    if (row !== undefined) {
      expect(() => reportsOnce(row, filename)).not.toThrow();
    }
  });

  it.each([
    INSIDE,
    `${process.cwd()}/${INSIDE}`,
    "./src/modules/orders/service/nested/guards.ts",
    "tests/fixtures/lint/src/modules/orders/service/transition.ts",
  ])("%s is the service: clean", (filename) => {
    expect(row).toBeDefined();
    if (row !== undefined) expect(() => passes(row, filename)).not.toThrow();
  });
});

describe("fo/no-direct-order-status-write further shapes (AC-60)", () => {
  const FURTHER_INVALID: readonly Case[] = [
    // 1. Aliases.
    {
      name: "const { orders: t } = schema",
      code: "const { orders: t } = schema;\ndb.update(t).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "import { order } (spec 002's table name)",
      code: 'import { order } from "@/db/schema";\ndb.update(order).set({ status: "paid" });',
      messageId: "drizzle",
    },
    {
      name: "import { order as o }",
      code: 'import { order as o } from "@/db/schema";\ndb.update(o).set({ status: "paid" });',
      messageId: "drizzle",
    },
    {
      name: "schema.order",
      code: 'db.update(schema.order).set({ status: "paid" });',
      messageId: "drizzle",
    },
    {
      name: "an alias of an alias",
      code: "const a = orders;\nconst b = a;\ndb.update(b).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "a let alias assigned later",
      code: "let t = partners;\nt = orders;\ndb.update(t).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "orders as typeof orders",
      code: "db.update(orders as typeof orders).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "schema[`orders`]",
      code: "db.update(schema[`orders`]).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "the chain held in a variable, then .set({ status })",
      code: "const q = db.update(orders);\nq.set({ status });",
      messageId: "drizzle",
    },
    {
      name: 'db["update"](orders)["set"]({ status })',
      code: 'db["update"](orders)["set"]({ status });',
      messageId: "drizzle",
    },
    // 3. Upserts.
    {
      name: "onConflictDoUpdate on an aliased table",
      code: 'import { orders as o } from "@/db/schema";\ndb.insert(o).values(v).onConflictDoUpdate({ target: o.id, set: { status: "paid" } });',
      messageId: "drizzle",
    },
    {
      name: "onConflictDoUpdate(config), config unread",
      code: "export const up = (config: never) => db.insert(orders).values(v).onConflictDoUpdate(config);",
      messageId: "unreadable",
    },
    {
      name: "onConflictDoUpdate({ ...rest })",
      code: "db.insert(orders).values(v).onConflictDoUpdate({ target: orders.id, ...rest });",
      messageId: "unreadable",
    },
    {
      name: "onConflictDoUpdate({ set: patch }), patch a parameter",
      code: "export const up = (patch: never) => db.insert(orders).values(v).onConflictDoUpdate({ target: orders.id, set: patch });",
      messageId: "unreadable",
    },
    // 4. Refuse what it cannot read.
    {
      name: ".set({ ...x }), x unread",
      code: "export const save = (x: never) => db.update(orders).set({ ...x });",
      messageId: "unreadable",
    },
    {
      name: ".set(buildPatch())",
      code: "db.update(orders).set(buildPatch());",
      messageId: "unreadable",
    },
    {
      name: ".set(input.patch)",
      code: "db.update(orders).set(input.patch);",
      messageId: "unreadable",
    },
    {
      name: ".set({ [key]: value })",
      code: "db.update(orders).set({ [key]: value });",
      messageId: "unreadable",
    },
    {
      name: '.set({ ["status"]: next })',
      code: 'db.update(orders).set({ ["status"]: next });',
      messageId: "drizzle",
    },
    {
      name: "a same-file literal with a status key",
      code: 'const patch = { notes, status: "paid" };\ndb.update(orders).set(patch);',
      messageId: "drizzle",
    },
    {
      name: "a same-file literal that spreads a status literal",
      code: 'const base = { status: "paid" };\nconst patch = { notes, ...base };\ndb.update(orders).set(patch);',
      messageId: "drizzle",
    },
    {
      name: "a same-file literal given status after it was written",
      code: 'const patch: Record<string, string> = { notes };\npatch.status = "paid";\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: 'a same-file literal given ["status"] after it was written',
      code: 'const patch: Record<string, string> = { notes };\npatch["status"] = "paid";\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a same-file literal passed to Object.assign",
      code: 'const patch = { notes };\nObject.assign(patch, { status: "paid" });\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a same-file literal handed to another name",
      code: 'const patch = { notes };\nconst same: Record<string, string> = patch;\nsame.status = "paid";\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a same-file literal stored in a Map and written through it",
      code: 'const patch = { notes };\nconst held = new Map<string, Record<string, string>>();\nheld.set("k", patch);\nheld.get("k")!.status = "paid";\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a same-file literal used as a Map key and written through it",
      code: 'const patch = { notes };\nconst held = new Map<Record<string, string>, number>();\nheld.set(patch, 1);\n[...held.keys()][0]!.status = "paid";\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a same-file literal given status by ++",
      code: 'const patch: Record<string, number> = { count: 1 };\npatch["status"]++;\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a same-file literal whose own method is called",
      code: 'const patch = {\n  notes,\n  mark() {\n    Object.assign(this, { status: "paid" });\n  },\n};\npatch.mark();\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "a let patch assigned again",
      code: "let patch = { notes };\npatch = next;\ndb.update(orders).set(patch);",
      messageId: "unreadable",
    },
    {
      name: "a conditional patch with a status branch",
      code: 'db.update(orders).set(done ? { status: "paid" } : { notes });',
      messageId: "drizzle",
    },
    // /review 119 change 2 and /break 119 hole 9: a table picked by a branch, a chain returned
    // by a same-file function.
    {
      name: "db.update(flag ? orders : t)",
      code: "db.update(flag ? orders : t).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "db.update(t ?? orders)",
      code: "db.update(t ?? orders).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "db.update((0, orders))",
      code: "db.update((0, orders)).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "const t = done ? orders : partners",
      code: "const t = done ? orders : partners;\ndb.update(t).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "a function declaration returning the chain",
      code: "function u() {\n  return db.update(orders);\n}\nu().set({ status });",
      messageId: "drizzle",
    },
    {
      name: "an arrow returning the chain",
      code: "const u = () => db.update(orders);\nu().set({ status });",
      messageId: "drizzle",
    },
    {
      name: "a branch picking the chain",
      code: "(flag ? db.update(orders) : q).set({ status });",
      messageId: "drizzle",
    },
    // /break 119 holes 1–7.
    {
      name: "hole 1: a same-file literal passed to another one-argument call",
      code: "const patch = { notes };\nmutate(patch);\ndb.update(orders).set(patch);",
      messageId: "unreadable",
    },
    {
      name: "hole 2: a same-file literal held under another key and written through it",
      code: 'const patch: Record<string, string> = { notes };\nconst h = { p: patch };\nh.p.status = "paid";\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "hole 3: a patch destructured from a literal holding status",
      code: 'const { patch } = { patch: { status: "paid" } };\ndb.update(orders).set(patch);',
      messageId: "unreadable",
    },
    {
      name: "hole 4: a computed key in the upsert config",
      code: "db.insert(orders).values(v).onConflictDoUpdate({ target: orders.id, [key]: patch });",
      messageId: "unreadable",
    },
    {
      name: "hole 5: schema?.orders",
      code: "db.update(schema?.orders).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "hole 6: const { orders: t = fallback } = schema",
      code: "const { orders: t = fallback } = schema;\ndb.update(t).set({ status });",
      messageId: "drizzle",
    },
    {
      name: "hole 7: a same-file literal spread into a call",
      code: "const patch = { notes };\nfn(...patch);\ndb.update(orders).set(patch);",
      messageId: "unreadable",
    },
    // /break 119 hole 8: the guards that a valid row cannot hold.
    {
      name: "onConflictDoUpdate() with no argument",
      code: "db.insert(orders).values(v).onConflictDoUpdate();",
      messageId: "unreadable",
    },
    {
      name: "(await chain).set({ status })",
      code: "export async function f() {\n  (await db.update(orders)).set({ status });\n}",
      messageId: "drizzle",
    },
    {
      name: "a patch that spreads itself (the seen guard)",
      code: "const p = { ...p };\ndb.update(orders).set(p);",
      messageId: "unreadable",
    },
    {
      name: "a string + suffix, reported once",
      code: "const q = \"UPDATE orders SET status = 'paid'\" + suffix;",
      messageId: "sql",
    },
    {
      name: "a template + suffix, reported once",
      code: "const q = `UPDATE orders SET status = 'paid'` + suffix;",
      messageId: "sql",
    },
    {
      name: "a statement interpolated whole, reported once where it is written",
      code: "const q = \"UPDATE orders SET status = 'paid'\";\nsql`${q}`;",
      messageId: "sql",
    },
    // 2. SQL.
    {
      name: 'UPDATE ONLY "public"."order" AS o SET "status"',
      code: 'const q = `UPDATE ONLY "public"."order" AS o SET "status" = $1 WHERE o.id = $2`;',
      messageId: "sql",
    },
    {
      name: "a semicolon inside a string before status",
      code: "const q = `UPDATE orders SET notes = ';', status = 'paid'`;",
      messageId: "sql",
    },
    {
      name: "a comment between UPDATE and SET",
      code: "const q = `UPDATE orders -- the order\n  SET status = 'paid'`;",
      messageId: "sql",
    },
    {
      name: "a comment holding a quote",
      code: "const q = `UPDATE orders /* it's */ SET status = 'paid'`;",
      messageId: "sql",
    },
    {
      name: "a tuple SET",
      code: "const q = `UPDATE orders SET (notes, status) = ($1, 'paid')`;",
      messageId: "sql",
    },
    {
      name: "status after a subquery with a FROM",
      code: "const q = `UPDATE orders SET notes = (SELECT n FROM x WHERE y), status = 'paid' WHERE id = $1`;",
      messageId: "sql",
    },
    {
      name: "an aliased table interpolated into sql``",
      code: "import { orders as o } from \"@/db/schema\";\nsql`UPDATE ${o} SET ${o.status} = 'paid'`;",
      messageId: "sql",
    },
    {
      name: '${sql.raw("orders")}',
      code: 'sql`UPDATE ${sql.raw("orders")} SET status = 1`;',
      messageId: "sql",
    },
    {
      name: '${sql.identifier("orders")}',
      code: 'sql`UPDATE ${sql.identifier("orders")} SET status = 1`;',
      messageId: "sql",
    },
    {
      name: '${sql.raw("status")}',
      code: 'sql`UPDATE orders SET ${sql.raw("status")} = 1`;',
      messageId: "sql",
    },
    {
      name: "const c = orders.status, interpolated",
      code: "const c = orders.status;\nsql`UPDATE ${orders} SET ${c} = 1`;",
      messageId: "sql",
    },
    {
      name: "a let that may hold orders.status, interpolated",
      code: "let c = orders.status;\nif (flag) c = orders.notes;\nsql`UPDATE ${orders} SET ${c} = 1`;",
      messageId: "sql",
    },
    {
      name: 'const T = "orders", interpolated',
      code: 'const T = "orders";\nsql`UPDATE ${T} SET status = 1`;',
      messageId: "sql",
    },
    {
      name: 'insert into public."order" … on conflict do update set "status"',
      code: 'const q = `insert into public."order" (id) values ($1)\non conflict (id) do update set "status" = excluded.status`;',
      messageId: "sql",
    },
    {
      name: "MERGE INTO orders … UPDATE SET status",
      code: "const q = `MERGE INTO orders o USING s ON o.id = s.id WHEN MATCHED THEN UPDATE SET status = s.status`;",
      messageId: "sql",
    },
    {
      name: "a WITH … UPDATE inside parentheses",
      code: "const q = `WITH u AS (UPDATE orders SET status = 'paid' RETURNING id) SELECT * FROM u`;",
      messageId: "sql",
    },
    {
      name: "strings joined with +",
      code: 'const q = "UPDATE orders " + "SET status = \'paid\'";',
      messageId: "sql",
    },
  ];

  const FURTHER_VALID: readonly {
    readonly name: string;
    readonly code: string;
  }[] = [
    {
      name: "a same-file literal with no status key",
      code: "const patch = { notes };\ndb.update(orders).set(patch);",
    },
    {
      name: "a same-file literal spread into the patch",
      code: "const patch = { notes };\ndb.update(orders).set({ ...patch, updatedAt });",
    },
    {
      name: "a same-file literal read by member",
      code: "const patch = { notes };\nlog(patch.notes);\ndb.update(orders).set(patch);",
    },
    {
      name: "a conditional patch with no status branch",
      code: "db.update(orders).set(done ? { notes } : { updatedAt });",
    },
    {
      name: "onConflictDoUpdate with a clean set",
      code: "db.insert(orders).values(v).onConflictDoUpdate({ target: orders.id, set: { notes } });",
    },
    {
      name: "onConflictDoUpdate on another table",
      code: "db.insert(partners).values(v).onConflictDoUpdate({ target: partners.id, set: patch });",
    },
    {
      name: ".set(patch) on another table",
      code: "db.update(partners).set(patch);",
    },
    {
      name: ".set(patch) on order_events",
      code: "db.update(order_events).set(patch);",
    },
    {
      name: "a status value, not a status key",
      code: 'db.update(orders).set({ notes: "status" });',
    },
    {
      name: "status only in a string value of the SQL",
      code: "const q = `UPDATE orders SET notes = 'status' WHERE id = $1`;",
    },
    {
      name: "status only in the WHERE",
      code: "const q = `UPDATE orders SET recipient_snapshot = NULL WHERE status = 'closed'`;",
    },
    {
      name: "status only in RETURNING",
      code: "const q = `UPDATE orders SET notes = $1 RETURNING status`;",
    },
    {
      name: "an insert that sets status, doing nothing on conflict",
      code: "const q = `INSERT INTO orders (id, status) VALUES ($1, 'draft') ON CONFLICT (id) DO NOTHING`;",
    },
    {
      name: "an upsert whose DO UPDATE leaves status alone",
      code: "const q = `INSERT INTO orders (id, status) VALUES ($1, 'draft') ON CONFLICT (id) DO UPDATE SET notes = excluded.notes`;",
    },
    {
      name: "UPDATE order_items SET status",
      code: "const q = `UPDATE order_items SET status = 'x'`;",
    },
    {
      name: 'UPDATE "orders_archive" SET status',
      code: "const q = `UPDATE \"orders_archive\" SET status = 'x'`;",
    },
    {
      name: "UPDATE orders SET order_status_note",
      code: "const q = `UPDATE orders SET order_status_note = $1`;",
    },
    // /break 119 hole 8: one row per false-positive guard.
    {
      name: "a column destructured from the table (the destructuring skip)",
      code: "const { notes: n } = orders;\ndb.update(n).set({ status });",
    },
    {
      name: "status only in a block comment",
      code: "const q = `UPDATE orders SET notes = 1 /* not status */`;",
    },
    {
      name: "status only in a line comment",
      code: "const q = `UPDATE orders SET notes = 1 -- not status\nWHERE id = $1`;",
    },
    {
      name: "status only after FROM",
      code: "const q = `UPDATE orders SET notes = s.note FROM status s WHERE s.id = orders.id`;",
    },
    {
      name: "status only after the bracket that closes the UPDATE",
      code: "const q = `WITH u AS (UPDATE orders SET notes = 1) SELECT status FROM u`;",
    },
    {
      name: "a table alias cycle (the seen guard)",
      code: "let t = partners;\nlet u = t;\nt = u;\ndb.update(t).set({ status });",
    },
    {
      name: "a chain variable cycle (the seen guard)",
      code: "let q = db.select();\nq = q.where(x);\nq.set({ status });",
    },
    {
      name: "an interpolation cycle (the seen guard)",
      code: 'let a = "x";\nlet b = a;\na = b;\nsql`UPDATE ${a} SET status = 1`;',
    },
    {
      name: "a branch between two other tables",
      code: "db.update(flag ? partners : payouts).set({ status });",
    },
    {
      name: '${sql.raw("partners")}',
      code: 'sql`UPDATE ${sql.raw("partners")} SET status = 1`;',
    },
    {
      name: "an unknown table interpolated",
      code: "sql`UPDATE ${partners} SET ${partners.status} = 'live'`;",
    },
  ];

  it.each(FURTHER_INVALID)(
    "outside the service, $name is red once ($messageId)",
    (row) => {
      expect(() => reportsOnce(row)).not.toThrow();
    },
  );

  it.each(FURTHER_VALID)("outside the service, $name passes", (row) => {
    expect(() => passes(row)).not.toThrow();
  });

  it.each(FURTHER_INVALID)("inside the service, $name passes", (row) => {
    expect(() => passes(row, INSIDE)).not.toThrow();
  });
});

describe("the rule's files in the real config (AC-60 item 5)", () => {
  const eslint = new ESLint({ cwd: resolve(__dirname, "../..") });
  it.each([
    "scripts/db-migrate.ts",
    "seed/check.ts",
    "db/schema/index.ts",
    "drizzle.config.ts",
    "next.config.ts",
    "eslint.config.mjs",
    "src/lib/db.ts",
  ])("is error on %s", async (file) => {
    const config = (await eslint.calculateConfigForFile(
      resolve(__dirname, "../..", file),
    )) as Linter.Config;
    const entry = config.rules?.["fo/no-direct-order-status-write"];
    expect(Array.isArray(entry) ? entry[0] : entry).toBe(2);
  });
});

describe("exported predicates", () => {
  it("recognises the order-service path from the repository root, on posix and windows separators", () => {
    expect(
      isOrderServiceFile("/repo/src/modules/orders/service/x.ts", "/repo"),
    ).toBe(true);
    expect(
      isOrderServiceFile(
        "C:\\repo\\src\\modules\\orders\\service\\x.ts",
        "C:\\repo",
      ),
    ).toBe(true);
    expect(
      isOrderServiceFile("/repo/src/modules/orders/queries.ts", "/repo"),
    ).toBe(false);
    expect(
      isOrderServiceFile(
        "/repo/scripts/src/modules/orders/service/x.ts",
        "/repo",
      ),
    ).toBe(false);
    expect(
      isOrderServiceFile("/other/src/modules/orders/service/x.ts", "/repo"),
    ).toBe(false);
  });

  it("matches the spec's SQL pattern", () => {
    expect(isOrderStatusSql("UPDATE orders SET status = 'paid'")).toBe(true);
    expect(isOrderStatusSql("update orders set x = 1, status = 'paid'")).toBe(
      true,
    );
    expect(
      isOrderStatusSql("UPDATE orders SET x = 1; UPDATE p SET status = 2"),
    ).toBe(false);
  });
});
