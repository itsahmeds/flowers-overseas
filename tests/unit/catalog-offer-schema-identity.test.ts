/**
 * The schema identity, end to end through spec 001's validator (spec 005 §6, AC-11, T-09;
 * TASK-067).
 *
 * TASK-009 shipped `scripts/seo/validate-schema.ts` with an `Offer.price == visiblePrice` check
 * and nothing to run it against: `tests/fixtures/seo/schema/` was empty, so the check was
 * green-by-vacuity from the day it landed until TASK-069 seeded the directory (`/review 52`). This file is what AC-11 means by "makes it
 * satisfiable" — it builds the JSON-LD a PDP will publish **from the real projection**, writes it
 * out in the fixture shape with the **rendered** price as `visiblePrice`, and runs the CLI over
 * it exactly as `pnpm seo:validate` does.
 *
 * The negative control matters as much as the positive case: the same graph with the offer's
 * price moved by one minor unit must fail, and fail naming the mismatch. Without it, "the
 * validator passed" would only prove that the validator was reachable.
 *
 * The graph is assembled here rather than imported because spec 007 owns the JSON-LD builders
 * (spec 005 §3): what 005 owns is `offerProjection()`, the typed input, and the proof that its
 * numbers are the page's numbers. When 007's builder lands, this test's hand-built node is what
 * it must reproduce.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import type { LocaleCode } from "../../src/config/locales.ts";
import { localeConfig } from "../../src/config/locales.ts";
import {
  offerProjection,
  priceProjection,
} from "../../src/modules/catalog/pricing/project.ts";
import type { OfferProjection } from "../../src/modules/catalog/types.ts";
import { formatMoney, moneyDecimalString } from "../../src/modules/i18n";
import { runSeoCli } from "./support/seo-cli.ts";

const CLI = "validate-schema.ts";
const FRESH = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
const LIVE = "PL" as const;
const SKU = "FO-BQ-001" as const;
const TIER = "stems_18" as const;
const LOCALES = ["en", "en-gb", "pl"] as const satisfies readonly LocaleCode[];

/**
 * The amount a buyer reads, with the currency symbol and the spaces stripped and the locale's own
 * decimal separator kept — `€45.90` → `45.90`, `159,00 zł` → `159,00`.
 *
 * `validate-schema` accepts the locale's comma in `visiblePrice` and rejects it in `Offer.price`,
 * which is precisely the asymmetry the fixture is here to exercise. A grouping separator would
 * make the string ambiguous, so the helper refuses one rather than guessing (no price in the
 * dataset's bands is large enough to group, and if one ever is, this fails loudly).
 */
function visibleAmountOf(rendered: string): string {
  const stripped = rendered.replace(/[^0-9.,]/gu, "");
  if (stripped.includes(".") && stripped.includes(",")) {
    throw new Error(
      `\`${rendered}\` carries a grouping separator, so the visible amount is ambiguous`,
    );
  }
  return stripped;
}

/** The `Product` + `Offer` graph a PDP publishes, built from one offer projection (spec 007). */
function productGraph(
  offer: OfferProjection,
  name: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    offers: {
      "@type": "Offer",
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      availability: offer.availability,
      eligibleRegion: offer.eligibleRegion,
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: moneyDecimalString(offer.shippingRate),
          currency: offer.shippingRate.currency,
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        returnPolicyCategory: offer.hasMerchantReturnPolicy,
      },
      ...(offer.priceValidUntil === null
        ? {}
        : { priceValidUntil: offer.priceValidUntil }),
    },
  };
}

/** Writes the fixtures into a fresh temp directory, runs the CLI over it, cleans up. */
function withFixtures<T>(
  fixtures: Readonly<Record<string, unknown>>,
  fn: (dir: string) => T,
): T {
  const dir = mkdtempSync(join(tmpdir(), "fo-catalog-schema-"));
  try {
    for (const [file, body] of Object.entries(fixtures)) {
      writeFileSync(join(dir, file), `${JSON.stringify(body, null, 2)}\n`);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** One fixture per locale: the graph, the rendered amount, the rendered currency. */
async function fixturesForEachLocale(): Promise<
  Record<string, Record<string, unknown>>
> {
  const fixtures: Record<string, Record<string, unknown>> = {};
  for (const locale of LOCALES) {
    const projection = await priceProjection(locale, {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: FRESH,
    });
    const offer = offerProjection(projection);
    if (offer === null) throw new Error(`${LIVE} is the live destination`);

    fixtures[`pdp-${locale}.json`] = {
      jsonld: productGraph(offer, SKU),
      visiblePrice: visibleAmountOf(
        formatMoney(projection.displayPrice, locale),
      ),
      visibleCurrency: localeConfig(locale).currencyDefault,
    };
  }
  return fixtures;
}

describe("offerProjection through spec 001's validate-schema (AC-11, T-09)", () => {
  it("passes the `Offer.price == visiblePrice` check in every locale", async () => {
    const fixtures = await fixturesForEachLocale();
    const result = withFixtures(fixtures, (dir) => runSeoCli(CLI, dir));

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`${String(LOCALES.length)} fixture(s) ok`);
  });

  it("fails when the published price is one minor unit off the rendered one", async () => {
    const projection = await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: FRESH,
    });
    const offer = offerProjection(projection);
    if (offer === null) throw new Error(`${LIVE} is the live destination`);

    const drifted: OfferProjection = {
      ...offer,
      price: moneyDecimalString({
        amountMinor: projection.displayPrice.amountMinor + 1,
        currency: projection.displayPrice.currency,
      }),
    };
    const result = withFixtures(
      {
        "pdp-drifted.json": {
          jsonld: productGraph(drifted, SKU),
          visiblePrice: visibleAmountOf(
            formatMoney(projection.displayPrice, "en"),
          ),
          visibleCurrency: "EUR",
        },
      },
      (dir) => runSeoCli(CLI, dir),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not equal visiblePrice");
  });

  it("publishes no offer, and therefore no fixture, for a `demo` destination", async () => {
    const projection = await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: "DE",
      now: FRESH,
    });
    expect(offerProjection(projection)).toBeNull();
  });
});

/**
 * The **committed** fixture, which is the one `pnpm seo:validate` actually runs (`/review 52`).
 *
 * The suite above proves the identity holds; it proves it in a temp directory that no CI job
 * reads. `tests/fixtures/seo/schema/pdp-product-offer.json` is the same graph on disk, so the
 * schema gate of `pnpm seo:validate` has something to fail on — and this test regenerates it and
 * compares, so the file cannot rot into a fixture that passes a validator while disagreeing with
 * the code it was taken from.
 *
 * Its `priceValidUntil` is in the past by construction: it is the committed FX snapshot's validity
 * (`FX_SNAPSHOT_AS_OF` + `MAX_FX_AGE_HOURS`), and the snapshot is authored data. Regenerating the
 * fixture is part of TASK-071's `fx.refresh`, not a separate chore.
 */
describe("the committed schema fixture `seo:validate` runs (`/review 52`)", () => {
  const FIXTURE = "tests/fixtures/seo/schema/pdp-product-offer.json";

  it("is exactly what `offerProjection()` produces today", async () => {
    const projection = await priceProjection("en", {
      productId: SKU,
      tierKey: TIER,
      countryIso: LIVE,
      now: FRESH,
    });
    const offer = offerProjection(projection);
    if (offer === null) throw new Error(`${LIVE} is the live destination`);

    const expected = {
      jsonld: productGraph(offer, SKU),
      visiblePrice: visibleAmountOf(formatMoney(projection.displayPrice, "en")),
      visibleCurrency: localeConfig("en").currencyDefault,
    };
    const committed: unknown = JSON.parse(
      readFileSync(resolve(process.cwd(), FIXTURE), "utf8"),
    );

    expect(committed).toEqual(expected);
  });

  it("passes the CLI in place, so the gate is no longer vacuous", () => {
    const result = runSeoCli(CLI, "tests/fixtures/seo/schema");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("fixture(s) ok");
    expect(result.stdout).not.toContain("no fixtures");
  });
});
