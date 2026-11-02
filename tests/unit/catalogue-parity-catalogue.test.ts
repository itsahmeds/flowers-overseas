/**
 * T-02's unit half for the catalogue and price half of `pnpm catalogue:parity` (spec 012b AC-2;
 * TASK-294). The integration half (a migrated and seeded Postgres reads back with zero
 * differences) is `tests/integration/catalogue-cms-schema.test.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  type ParityRow,
  catalogueParity,
  catalogueParityLines,
  staticCatalogueRows,
} from "../../scripts/catalogue-parity-catalogue.ts";

const STATIC = staticCatalogueRows();

/** `rows` with the row `table|key` given new `fields`. */
function edited(
  rows: readonly ParityRow[],
  table: ParityRow["table"],
  key: string,
  fields: Record<string, string>,
): ParityRow[] {
  return rows.map((row) =>
    row.table === table && row.key === key
      ? { ...row, fields: { ...row.fields, ...fields } }
      : row,
  );
}

describe("catalogue:parity, catalogue and price half (AC-2 / T-02)", () => {
  it("covers every product, size and price row of the dataset", () => {
    const tables = new Set(STATIC.map((row) => row.table));
    expect([...tables].sort()).toEqual([
      "country_price",
      "product",
      "product_tier",
    ]);
    expect(STATIC.filter((row) => row.table === "product")).toHaveLength(84);
  });

  it("is empty for identical rows", () => {
    expect(catalogueParity(STATIC, [...STATIC])).toEqual([]);
  });

  it("names the URL and field of one changed price and of one changed product status, and nothing else", () => {
    const price = STATIC.find(
      (row) =>
        row.table === "country_price" &&
        row.iso2 === "PL" &&
        row.fields["active_to"] === "",
    );
    if (price === undefined)
      throw new Error("no open Polish price in the dataset");
    const product = STATIC.find(
      (row) => row.table === "product" && row.sku !== price.sku,
    );
    if (product === undefined) throw new Error("no second product");

    const database = edited(
      edited(STATIC, "country_price", price.key, {
        retail_minor: String(Number(price.fields["retail_minor"]) + 100),
      }),
      "product",
      product.key,
      { status: "retired" },
    );
    const differences = catalogueParity(STATIC, database);
    expect(differences.map((d) => `${d.table} ${d.key}.${d.field}`)).toEqual([
      `country_price ${price.key}.retail_minor`,
      `product ${product.key}.status`,
    ]);
    const [priceDifference, productDifference] = differences;
    // The price feeds the product page in Poland in every launch locale and Poland's shop root.
    expect(priceDifference?.urls.length).toBeGreaterThan(0);
    expect(
      priceDifference?.urls.every((url) => /^\/[a-z-]+\//u.test(url)),
    ).toBe(true);
    expect(
      priceDifference?.urls.some(
        (url) => url.includes("/poland") || url.includes("/polska"),
      ),
    ).toBe(true);
    // The status feeds that product's page in every destination it is priced in.
    expect(productDifference?.urls.length).toBeGreaterThan(
      priceDifference?.urls.length ?? 0,
    );
    const lines = catalogueParityLines(differences, "catalogue:parity");
    expect(lines.at(-1)).toMatch(
      /^catalogue:parity: 2 differing catalogue field\(s\) across \d+ URL\(s\)$/u,
    );
    expect(
      lines.some((line) =>
        line.endsWith(
          `.retail_minor: static "${price.fields["retail_minor"] ?? ""}", database "${String(Number(price.fields["retail_minor"]) + 100)}"`,
        ),
      ),
    ).toBe(true);
  });

  it("reports a row only one side has, on its every field", () => {
    const [first] = STATIC;
    if (first === undefined) throw new Error("empty dataset");
    const differences = catalogueParity(STATIC, STATIC.slice(1));
    expect(differences.map((d) => d.key)).toEqual(
      Object.keys(first.fields).map(() => first.key),
    );
    expect(differences.every((d) => d.database === undefined)).toBe(true);
  });
});
