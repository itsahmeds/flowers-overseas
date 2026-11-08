/**
 * "My bouquets" against migrated tables under the florist's row-level security (spec 030b AC-52
 * to AC-55; TASK-444).
 *
 * Fixture (AC-52): florist A maps product P sizes S and M and product Q size M; florist B maps P
 * sizes S and M. P has a `pl` name, Q only an `en` one. P is active with open prices in the live
 * country PL (where A has coverage) and in DE; Q is a draft.
 *
 *  - T-52: as a `pl` member of A the query returns exactly A's three mappings, with the `pl` name
 *    (Q falls back to `en`), the size, stems, A's own amount and the state; the card prints
 *    `100,00 zł`.
 *  - T-53: the rendered page holds none of P's or Q's retail prices, B's amounts or code, and no
 *    script.
 *  - T-54: a paused A sees "Paused" on every row; `can_fulfil` false is paused; a retired product
 *    is withdrawn; no coverage in the live country is "not on sale yet".
 *  - T-55: with `app.partner_ids = '{B}'` the query returns none of A's rows even when it asks for
 *    A by id.
 *  - A size-less mapping shows once per size of the product.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type FloristBouquetRow,
  selectFloristBouquets,
} from "../../src/modules/partners/portal/bouquets.ts";
import {
  type BouquetTranslator,
  bouquetCards,
} from "../../src/modules/partners/portal/view.ts";
import { BouquetList } from "../../src/modules/partners/ui/portal/BouquetList.tsx";
import * as make from "./support/rows.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const P = "FO-BQ-901";
const Q = "FO-BQ-902";

interface World {
  readonly a: string;
  readonly b: string;
  readonly aCode: string;
  readonly bCode: string;
  readonly p: string;
  readonly q: string;
  readonly pl: string;
}

async function product(
  tx: Tx,
  sku: string,
  status: string,
  names: Readonly<Record<string, string>>,
  tiers: readonly (readonly [key: string, stems: number, sort: number])[],
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days, status)
    VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5, ${status})
    RETURNING id`;
  const id = row?.id ?? "";
  for (const [locale, name] of Object.entries(names)) {
    await tx`INSERT INTO product_translation (product_id, locale_code, name, slug)
             VALUES (${id}, ${locale}, ${name}, ${make.unique(`${sku.toLowerCase()}-`)})`;
  }
  for (const [key, stems, sort] of tiers) {
    await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
             VALUES (${id}, ${key}, 'catalog.tier.stems', ${stems}, ${sort}, ${sort === 0})`;
  }
  return id;
}

async function world(tx: Tx): Promise<World> {
  // Status is set at insert: a status flip is an admin write (spec 012's guard).
  await make.base(tx);
  const [plRow] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone, status)
    VALUES ('PL', 'PLN', 800, 'Europe/Warsaw', 'live') RETURNING id`;
  const pl = plRow?.id ?? "";
  const de = await make.country(tx, "DE");
  const p = await product(
    tx,
    P,
    "active",
    { en: "Amber Hour", pl: "Bursztynowa godzina" },
    [
      ["S", 11, 0],
      ["M", 15, 1],
    ],
  );
  const q = await product(tx, Q, "draft", { en: "Vistula Red" }, [
    ["M", 15, 0],
  ]);
  for (const [productId, country, tier, retail, currency] of [
    [p, pl, "S", 18_900, "PLN"],
    [p, pl, "M", 21_900, "PLN"],
    [q, pl, "M", 15_900, "PLN"],
    [p, de, "S", 4_700, "EUR"],
    [p, de, "M", 5_300, "EUR"],
  ] as const) {
    await tx`INSERT INTO country_price (product_id, country_id, tier_key, retail_minor,
                                        currency_code, vat_rate_bp, active_from)
             VALUES (${productId}, ${country}, ${tier}, ${retail}, ${currency}, 800,
                     DATE '2026-01-01')`;
  }
  const a = await make.partner(tx, pl, "active");
  const b = await make.partner(tx, pl, "active");
  const [city] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${pl}) RETURNING id`;
  await tx`INSERT INTO partner_coverage (partner_id, city_id)
           VALUES (${a}, ${city?.id ?? ""}), (${b}, ${city?.id ?? ""})`;
  await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key,
                                                partner_payout_minor, currency_code)
           VALUES (${a}, ${p}, 'S', 10000, 'PLN'), (${a}, ${p}, 'M', 12000, 'PLN'),
                  (${a}, ${q}, 'M', 9000, 'PLN'),
                  (${b}, ${p}, 'S', 12600, 'PLN'), (${b}, ${p}, 'M', 13000, 'PLN')`;
  const codes = await tx<{ id: string; code: string }[]>`
    SELECT id, code FROM fulfillment_partner WHERE id IN (${a}, ${b})`;
  const codeOf = (id: string) => codes.find((row) => row.id === id)?.code ?? "";
  return { a, b, aCode: codeOf(a), bCode: codeOf(b), p, q, pl };
}

/** The query as florist `contextIds` asks for `askFor`, under the partner context. */
async function asFlorist(
  tx: Tx,
  contextIds: readonly string[],
  askFor: readonly string[] = contextIds,
  locale = "pl",
): Promise<FloristBouquetRow[]> {
  let rows: FloristBouquetRow[] = [];
  const marker = new Error("undo");
  try {
    await tx.savepoint(async (sp) => {
      await asApp(sp, { role: "partner", partnerIds: contextIds });
      rows = await selectFloristBouquets(runnerOf(sp), {
        locale,
        partnerIds: askFor,
      });
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  return rows;
}

function pageHtml(rows: readonly FloristBouquetRow[]): string {
  const t = createTranslator({
    locale: "pl",
    messages: loadMessages("pl", ["floristInbox", "catalog"]),
  }) as unknown as BouquetTranslator;
  return renderToStaticMarkup(
    createElement(BouquetList, {
      locale: "pl",
      title: "t",
      intro: "i",
      cards: bouquetCards(rows, {
        t,
        locale: "pl",
        supportEmail: "support@example.test",
        photoOf: () => null,
      }),
      empty: "e",
    }),
  ).replaceAll(" ", " ");
}

describe.skipIf(server.url === undefined)(
  `florist bouquets on PG16${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "bouquets");
    }, 300_000);
    afterAll(async () => {
      await scratch.drop();
    });

    it("T-52: a pl member of A gets exactly A's mappings: names with fallback, sizes, stems, own amounts, states", async () => {
      const rows = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        return asFlorist(tx, [w.a]);
      });
      expect(
        rows.map((row) => [
          row.sku,
          row.productName,
          row.sizeKey,
          row.stems,
          row.payoutMinor,
          row.currency,
          row.state,
        ]),
      ).toEqual([
        [P, "Bursztynowa godzina", "S", 11, 10_000n, "PLN", "on_sale"],
        [P, "Bursztynowa godzina", "M", 15, 12_000n, "PLN", "on_sale"],
        [Q, "Vistula Red", "M", 15, 9_000n, "PLN", "not_yet_on_sale"],
      ]);
      const html = pageHtml(rows);
      expect(html).toContain("Otrzymujesz <strong");
      expect(html).toContain(">100,00 zł</strong>");
      expect(html).toContain("11 łodyg");
      expect(html).toContain(`Kod ${P}`);
    });

    it("T-53: the page holds no retail price, none of B's amounts, B's code, and no script", async () => {
      const { rows, w } = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        return { rows: await asFlorist(tx, [w.a]), w };
      });
      const html = pageHtml(rows);
      for (const forbidden of [
        "189,00",
        "219,00",
        "159,00",
        "47,00",
        "53,00",
        "126,00 zł",
        "130,00 zł",
        w.bCode,
        w.b,
        "<script",
        "__NEXT_DATA__",
      ]) {
        expect(html, forbidden).not.toContain(forbidden);
      }
      expect(html).not.toContain(w.aCode);
    });

    it("T-55: with app.partner_ids = {B} the query returns none of A's rows, even asked for A", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        return {
          w,
          askedForA: await asFlorist(tx, [w.b], [w.a]),
          asB: await asFlorist(tx, [w.b]),
        };
      });
      expect(result.askedForA).toEqual([]);
      expect(result.asB.map((row) => row.payoutMinor)).toEqual([
        12_600n,
        13_000n,
      ]);
    });

    it("T-54: paused shop, cannot make, retired product, no coverage in the live country", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const z = await make.partner(tx, w.pl, "paused");
        await tx`INSERT INTO partner_coverage (partner_id, city_id)
                 SELECT ${z}, city_id FROM partner_coverage WHERE partner_id = ${w.a}`;
        await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key,
                                                      partner_payout_minor, currency_code)
                 SELECT ${z}, product_id, tier_key, partner_payout_minor, currency_code
                 FROM partner_catalog_mapping WHERE partner_id = ${w.a}`;
        const paused = await asFlorist(tx, [z]);
        await tx`UPDATE partner_catalog_mapping SET can_fulfil = false
                 WHERE partner_id = ${w.a} AND tier_key = 'S'`;
        await tx`UPDATE product SET status = 'retired', retired_at = now() WHERE id = ${w.q}`;
        const mixed = await asFlorist(tx, [w.a]);
        await tx`DELETE FROM partner_coverage WHERE partner_id = ${w.a}`;
        const uncovered = await asFlorist(tx, [w.a]);
        return { paused, mixed, uncovered };
      });
      expect(result.paused.map((row) => row.state)).toEqual([
        "paused",
        "paused",
        "paused",
      ]);
      expect(result.mixed.map((row) => row.state)).toEqual([
        "paused",
        "on_sale",
        "withdrawn",
      ]);
      expect(result.uncovered.map((row) => row.state)).toEqual([
        "paused",
        "not_yet_on_sale",
        "withdrawn",
      ]);
    });

    it("a size-less mapping shows once per size; a size-specific one wins its size", async () => {
      const rows = await rolledBack(scratch.sql, async (tx) => {
        const w = await world(tx);
        const c = await make.partner(tx, w.pl, "active");
        await tx`INSERT INTO partner_catalog_mapping (partner_id, product_id, tier_key,
                                                      partner_payout_minor, currency_code)
                 VALUES (${c}, ${w.p}, NULL, 11000, 'PLN'), (${c}, ${w.p}, 'M', 14000, 'PLN')`;
        return asFlorist(tx, [c], [c], "en");
      });
      expect(
        rows.map((row) => [row.productName, row.sizeKey, row.payoutMinor]),
      ).toEqual([
        ["Amber Hour", "S", 11_000n],
        ["Amber Hour", "M", 14_000n],
      ]);
    });
  },
);
