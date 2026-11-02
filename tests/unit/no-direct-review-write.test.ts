/**
 * T-14 (spec 012b AC-14; proposed ADR-0022; TASK-293): `fo/no-direct-review-write`.
 *
 * `attest()` (`src/modules/i18n/db/ledger.ts`) is the one writer of the review columns —
 * `reviewed`, `reviewed_by`, `reviewed_at` and `review_state` — and Postgres's
 * `review_write_guard()` refuses any other write at run time. The rule catches the attempt first,
 * in every root that can reach the database: a Drizzle `.set()` / `.values()` /
 * `onConflictDoUpdate({ set })` naming one of the columns, and a raw SQL string or template that
 * updates or inserts one. The same code lexically inside a function named `attest` is valid.
 */
import { ESLint, RuleTester } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import rule, {
  REVIEW_COLUMNS,
  isReviewWriteSql,
} from "../../eslint/fo/no-direct-review-write.js";
import plugin from "../../eslint/fo/index.js";
import { tsLanguageOptions } from "./support/ts-parser";

const ruleTester = new RuleTester({ languageOptions: tsLanguageOptions });

const FILE = "src/modules/catalog/editor.ts";

const inAttest = (body: string): string =>
  `export async function attest(db, input) {\n${body}\n}`;

describe("fo/no-direct-review-write (T-14)", () => {
  it("names exactly the four review columns", () => {
    expect([...REVIEW_COLUMNS].sort()).toEqual([
      "review_state",
      "reviewed",
      "reviewed_at",
      "reviewed_by",
    ]);
  });

  it("reports a Drizzle update setting `reviewed` and a raw SQL string setting `review_state`", () => {
    expect(() => {
      ruleTester.run("no-direct-review-write", rule, {
        valid: [],
        invalid: [
          {
            code: "await db.update(productTranslation).set({ reviewed: true }).where(x);",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "await sql.unsafe(\"UPDATE media_asset SET review_state = 'approved' WHERE id = $1\", [id]);",
            filename: FILE,
            errors: [{ messageId: "sql" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("allows the same two writes inside attest()", () => {
    expect(() => {
      ruleTester.run("no-direct-review-write", rule, {
        valid: [
          {
            code: inAttest(
              "await db.update(productTranslation).set({ reviewed: true }).where(x);",
            ),
            filename: "src/modules/i18n/db/ledger.ts",
          },
          {
            code: inAttest(
              "await sql.unsafe(\"UPDATE media_asset SET review_state = 'approved' WHERE id = $1\", [id]);",
            ),
            filename: "src/modules/i18n/db/ledger.ts",
          },
          {
            code: "export const attest = async (db) => { await db.execute(sql`UPDATE public.product_translation SET reviewed = ${true}`); };",
            filename: "src/modules/i18n/db/ledger.ts",
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports every column and every write shape it can read", () => {
    expect(() => {
      ruleTester.run("no-direct-review-write", rule, {
        valid: [],
        invalid: [
          ...[
            "reviewed",
            "reviewedBy",
            "reviewedAt",
            "reviewState",
            "reviewed_by",
            "reviewed_at",
            "review_state",
          ].map((key) => ({
            code: `db.update(t).set({ ${key}: x });`,
            filename: FILE,
            errors: [{ messageId: "drizzle" as const }],
          })),
          {
            code: 'db.update(t).set({ "reviewed": true });',
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "db.update(t).set({ ['reviewState']: 'approved' });",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "db.insert(mediaAsset).values({ reviewState: 'approved' });",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "db.insert(mediaAsset).values([{ checksum }, { reviewState: 'approved' }]);",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "db.insert(t).values(v).onConflictDoUpdate({ target: t.id, set: { reviewed: true } });",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "const patch = { name, reviewed: true };\ndb.update(t).set(patch);",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            code: "db.execute(sql`UPDATE public.product_translation\n  SET name = ${n},\n      reviewed = true`);",
            filename: FILE,
            errors: [{ messageId: "sql" }],
          },
          {
            code: 'sql.unsafe("update product_translation set reviewed_by = $1");',
            filename: FILE,
            errors: [{ messageId: "sql" }],
          },
          {
            code: "sql.unsafe(`INSERT INTO media_asset (id, review_state) VALUES ($1, $2)`);",
            filename: FILE,
            errors: [{ messageId: "sql" }],
          },
          {
            code: 'sql.raw("UPDATE product_translation SET \\"reviewed_at\\" = now()");',
            filename: FILE,
            errors: [{ messageId: "sql" }],
          },
          {
            // A function merely *called* attest elsewhere is no cover for its caller.
            code: "async function save() { await attest(); db.update(t).set({ reviewed: true }); }",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
          {
            // Nor is a function whose name only begins with attest.
            code: "function attestLater() { db.update(t).set({ reviewed: true }); }",
            filename: FILE,
            errors: [{ messageId: "drizzle" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("leaves reads, unrelated sets and other columns alone", () => {
    expect(() => {
      ruleTester.run("no-direct-review-write", rule, {
        valid: [
          {
            code: "db.update(t).set({ name: 'x', slug: 'y' });",
            filename: FILE,
          },
          { code: "cache.set(key, { reviewed: true });", filename: FILE },
          { code: "map.set('reviewed', true);", filename: FILE },
          {
            code: "const row = { reviewed: false, reviewed_by: null };",
            filename: FILE,
          },
          {
            code: "db.execute(sql`SELECT reviewed, review_state FROM product_translation WHERE reviewed = true`);",
            filename: FILE,
          },
          {
            code: "db.execute(sql`UPDATE product_translation SET name = ${n} WHERE reviewed = true`);",
            filename: FILE,
          },
          {
            code: "db.execute(sql`INSERT INTO review_attestation (subject_kind, decision) VALUES ('x', 'approved')`);",
            filename: FILE,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("isReviewWriteSql reads the statement, not the prose", () => {
    expect(isReviewWriteSql("UPDATE t SET reviewed = true")).toBe(true);
    expect(
      isReviewWriteSql("UPDATE t SET a = 1, review_state='approved'"),
    ).toBe(true);
    expect(isReviewWriteSql("UPDATE t SET a = 1 WHERE reviewed = true")).toBe(
      false,
    );
    expect(isReviewWriteSql("SELECT reviewed FROM t")).toBe(false);
    expect(isReviewWriteSql("the reviewed flag")).toBe(false);
  });

  it("is error on every root that can reach the database, through the real config", async () => {
    const eslint = new ESLint({ cwd: resolve(__dirname, "../..") });
    for (const file of [
      "src/modules/catalog/index.ts",
      "scripts/admin-grant.ts",
      "seed/index.ts",
      "db/schema/review.ts",
    ]) {
      const config = (await eslint.calculateConfigForFile(file)) as {
        rules?: Record<string, unknown>;
      };
      const entry = config.rules?.["fo/no-direct-review-write"];
      const severity = Array.isArray(entry) ? entry[0] : entry;
      expect([2, "error"], file).toContain(severity);
    }
    expect(Object.keys(plugin.rules ?? {})).toContain("no-direct-review-write");
  });
});
