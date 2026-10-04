/**
 * `Offer.priceValidUntil` is never derived from the exchange rate (spec 005 §14 A7 Corrected 7,
 * amending A3 and §6; AC-11; T-36; TASK-180).
 *
 * Under A7 a converted offer would otherwise carry `rateValidUntil(as_of)`, a date one to four
 * days ahead. Google may not show the product snippet when `priceValidUntil` is in the past, and a
 * young site's pages are held longer than that between crawls (advisor memo 2026-10-04, fix 3).
 * The rule: a converted `Offer` carries the active row's `active_to` when the row has one and no
 * `priceValidUntil` when it does not; an unconverted `Offer` keeps the row's `active_to`.
 *
 * Fixture PDPs with a fresh snapshot, three rows (T-36):
 *
 *  1. converted (en-gb, GBP), the row open-ended → no `priceValidUntil` key in the graph;
 *  2. the same, with an `active_to` on the row (injected at `resolvePrice()`, because the authored
 *     dataset holds no closing row) → exactly that date;
 *  3. unconverted (pl, PLN) → the row's `active_to` unchanged, in both states.
 *
 * Spec 001's `validate-schema` CLI accepts all of them. Feeding `rateValidUntil(as_of)` back in
 * as a source turns row 1 red (it would print `2026-09-09`).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FX_SNAPSHOT_AS_OF } from "../../src/config/catalogue/fx.data.ts";
import { localeConfig } from "../../src/config/locales.ts";
import type { OfferProjection } from "../../src/modules/catalog/types.ts";
import { formatMoney, moneyDecimalString } from "../../src/modules/i18n";
import { runSeoCli } from "./support/seo-cli.ts";

const RESOLVE_MODULE = "../../src/modules/catalog/pricing/resolve.ts";
const PROJECT_MODULE = "../../src/modules/catalog/pricing/project.ts";
const LIVE = "PL" as const;
const SKU = "FO-BQ-001" as const;
const TIER = "stems_18" as const;
/** Inside the committed snapshot's window: every conversion is available. */
const FRESH = new Date(`${FX_SNAPSHOT_AS_OF}T10:00:00Z`);
/** Past the committed snapshot's bound (stale after Thu 2026-09-10 00:00Z): fails closed. */
const STALE = new Date("2026-09-11T10:00:00Z");
/** A closing date on the price row, far from any FX date. */
const ROW_ACTIVE_TO = "2026-12-31";

type Project = typeof import("../../src/modules/catalog/pricing/project.ts");

/**
 * `pricing/project.ts`, with the resolved price closing on `activeTo` (or as resolved).
 *
 * Injected at `resolvePrice()`, the seam the projection reads its `PricePoint` from: the static
 * provider's active row is `active_to IS NULL` by definition (spec 002's partial unique index), so
 * a closing row only reaches the projection from a provider that schedules an end, and the type
 * already carries one (`PricePoint.activeTo`).
 */
async function projectWithRowActiveTo(
  activeTo: string | undefined,
): Promise<Project> {
  vi.resetModules();
  if (activeTo !== undefined) {
    vi.doMock(RESOLVE_MODULE, async () => {
      const actual =
        await vi.importActual<
          typeof import("../../src/modules/catalog/pricing/resolve.ts")
        >(RESOLVE_MODULE);
      return {
        ...actual,
        resolvePrice: async (
          query: Parameters<typeof actual.resolvePrice>[0],
        ) => ({ ...(await actual.resolvePrice(query)), activeTo }),
      };
    });
  }
  return import(PROJECT_MODULE) as Promise<Project>;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(RESOLVE_MODULE);
});

async function offerFor(
  project: Project,
  locale: "en-gb" | "pl",
  now: Date = FRESH,
): Promise<{ offer: OfferProjection; visible: string; converted: boolean }> {
  const projection = await project.priceProjection(locale, {
    productId: SKU,
    tierKey: TIER,
    countryIso: LIVE,
    now,
  });
  const offer = project.offerProjection(projection);
  if (offer === null) throw new Error(`${LIVE} is the live destination`);
  return {
    offer,
    visible: formatMoney(projection.displayPrice, locale),
    converted: projection.ratePpm !== undefined,
  };
}

/** The `Offer` node a PDP publishes: `priceValidUntil` only when the projection carries one. */
function offerNode(offer: OfferProjection): Record<string, unknown> {
  return {
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
  };
}

function schemaFixture(
  offer: OfferProjection,
  visible: string,
  locale: "en-gb" | "pl",
): Record<string, unknown> {
  return {
    jsonld: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: SKU,
      offers: offerNode(offer),
    },
    visiblePrice: visible.replace(/[^0-9.,]/gu, ""),
    visibleCurrency: localeConfig(locale).currencyDefault,
  };
}

describe("Offer.priceValidUntil takes no date from the exchange rate (T-36)", () => {
  it("omits it from a converted offer whose row is open-ended (en-gb, GBP)", async () => {
    const project = await projectWithRowActiveTo(undefined);
    const { offer, converted } = await offerFor(project, "en-gb");

    expect(converted).toBe(true);
    expect(offer.priceCurrency).toBe("GBP");
    expect(offer.priceValidUntil).toBeNull();
    expect(Object.keys(offerNode(offer))).not.toContain("priceValidUntil");
  });

  it("carries exactly the row's active_to on a converted offer whose row closes", async () => {
    const project = await projectWithRowActiveTo(ROW_ACTIVE_TO);
    const { offer, converted } = await offerFor(project, "en-gb");

    expect(converted).toBe(true);
    expect(offer.priceValidUntil).toBe(ROW_ACTIVE_TO);
    expect(offerNode(offer)).toMatchObject({ priceValidUntil: ROW_ACTIVE_TO });
  });

  it("keeps the row's active_to unchanged on an unconverted offer (pl, PLN)", async () => {
    const open = await offerFor(await projectWithRowActiveTo(undefined), "pl");
    expect(open.converted).toBe(false);
    expect(open.offer.priceCurrency).toBe("PLN");
    expect(open.offer.priceValidUntil).toBeNull();

    const closing = await offerFor(
      await projectWithRowActiveTo(ROW_ACTIVE_TO),
      "pl",
    );
    expect(closing.offer.priceValidUntil).toBe(ROW_ACTIVE_TO);
  });

  it("is accepted by spec 001's validate-schema in all three shapes", async () => {
    const openProject = await projectWithRowActiveTo(undefined);
    const convertedOpen = await offerFor(openProject, "en-gb");
    const nativeOpen = await offerFor(openProject, "pl");
    const closingProject = await projectWithRowActiveTo(ROW_ACTIVE_TO);
    const convertedClosing = await offerFor(closingProject, "en-gb");

    const dir = mkdtempSync(join(tmpdir(), "fo-offer-valid-until-"));
    try {
      const fixtures = {
        "pdp-converted-open.json": schemaFixture(
          convertedOpen.offer,
          convertedOpen.visible,
          "en-gb",
        ),
        "pdp-converted-closing.json": schemaFixture(
          convertedClosing.offer,
          convertedClosing.visible,
          "en-gb",
        ),
        "pdp-native.json": schemaFixture(
          nativeOpen.offer,
          nativeOpen.visible,
          "pl",
        ),
      };
      for (const [file, body] of Object.entries(fixtures)) {
        writeFileSync(join(dir, file), `${JSON.stringify(body, null, 2)}\n`);
      }
      const result = runSeoCli("validate-schema.ts", dir);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("3 fixture(s) ok");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * The fail-closed `Offer` — what production serves whenever the rate is stale (`/break 177`
 * hole 4). An en-gb page falls back to Poland's PLN price; the `Offer` is unconverted, so it keeps
 * the row's `active_to` and takes nothing from the rate.
 */
describe("the stale-rate fallback Offer keeps the row's active_to, and only it (T-36, AC-11)", () => {
  it("has no priceValidUntil when the row is open-ended", async () => {
    const { offer, converted } = await offerFor(
      await projectWithRowActiveTo(undefined),
      "en-gb",
      STALE,
    );
    expect(converted).toBe(false);
    expect(offer.priceCurrency).toBe("PLN");
    expect(offer.priceValidUntil).toBeNull();
    expect(Object.keys(offerNode(offer))).not.toContain("priceValidUntil");
  });

  it("carries exactly the row's active_to when the row closes", async () => {
    const { offer, converted } = await offerFor(
      await projectWithRowActiveTo(ROW_ACTIVE_TO),
      "en-gb",
      STALE,
    );
    expect(converted).toBe(false);
    expect(offer.priceValidUntil).toBe(ROW_ACTIVE_TO);
  });
});
