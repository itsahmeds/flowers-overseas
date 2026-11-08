/**
 * Spec 047's source scans (§10 T-19 scan half, T-30 scan half; AC-19, AC-30; TASK-445).
 *
 *  - AC-19: the florist's pay never reads a discount. No file under `src/modules/partners`, the
 *    routing code (`src/modules/orders/routing`) or any payout code (a path naming `payout`)
 *    imports `modules/discounts` or names `order_discount`, `discount_minor` or `discountMinor`.
 *  - AC-30: every insert into `discount_code` is `issueCode`'s: no other file in `src`,
 *    `scripts` or `seed` inserts into the table by SQL or through Drizzle's `insert(discountCode)`,
 *    and no caller of `issueCode` outside the module passes a source other than `"admin"`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

function filesUnder(directory: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|tsx|mts|js|mjs|sql)$/u.test(name)) out.push(path);
  }
  return out;
}

const SOURCE = filesUnder(join(ROOT, "src"));
const rel = (path: string) => relative(ROOT, path).split("\\").join("/");

describe("the florist's pay never reads a discount (AC-19)", () => {
  const payCode = SOURCE.filter((path) => {
    const name = rel(path);
    return (
      name.startsWith("src/modules/partners/") ||
      name.startsWith("src/modules/orders/routing/") ||
      /payout/iu.test(name)
    );
  });

  it("scans the partners, routing and payout code", () => {
    expect(
      payCode.some((path) =>
        rel(path).startsWith("src/modules/partners/payouts/"),
      ),
    ).toBe(true);
    expect(
      payCode.some((path) =>
        rel(path).startsWith("src/modules/orders/routing/"),
      ),
    ).toBe(true);
  });

  it("finds no discount import or column there", () => {
    const offenders = payCode.filter((path) =>
      /modules\/discounts|order_discount|discount_minor|discountMinor/u.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("every discount_code insert is issueCode's (AC-30)", () => {
  const everything = [
    ...SOURCE,
    ...filesUnder(join(ROOT, "scripts")),
    ...filesUnder(join(ROOT, "seed")),
  ];
  const INSERT_SQL = /insert\s+into\s+(?:public\.)?"?discount_code"?[\s(]/iu;
  const INSERT_DRIZZLE = /\.insert\(\s*discountCode\s*\)/u;

  it("has exactly one inserting file, src/modules/discounts/issue.ts", () => {
    const inserting = everything
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return INSERT_SQL.test(text) || INSERT_DRIZZLE.test(text);
      })
      .map(rel)
      .filter((name) => !name.startsWith("db/migrations/"));
    expect(inserting).toEqual(["src/modules/discounts/issue.ts"]);
  });

  it("has no caller outside the module passing a source other than admin", () => {
    const callers = SOURCE.filter(
      (path) =>
        !rel(path).startsWith("src/modules/discounts/") &&
        /\bissueCode\s*\(/u.test(readFileSync(path, "utf8")),
    );
    for (const path of callers) {
      const text = readFileSync(path, "utf8");
      const sources = [...text.matchAll(/source:\s*["']([a-z]+)["']/gu)].map(
        (m) => m[1],
      );
      expect(sources.length, rel(path)).toBeGreaterThan(0);
      expect(new Set(sources), rel(path)).toEqual(new Set(["admin"]));
      expect(text, rel(path)).not.toMatch(/referral/u);
    }
  });
});
