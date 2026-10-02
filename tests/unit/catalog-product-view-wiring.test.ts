/**
 * `productView()` **gathers** every indexability term, one by one (spec 009 §6, **AC-16**; T-16;
 * TASK-125) — the lesson of `/review 93`.
 *
 * Under the Phase 0 providers every PDP is `noindex,follow` whatever the wiring does, because no
 * destination is live and no product copy is reviewed. So a test over the committed data cannot
 * tell a view that passes `countryLive` through from one that dropped it: both say `noindex`. That
 * is exactly how TASK-114's `unparameterised` pass-through could be deleted with the whole suite
 * green (PR 93, round 1). This file therefore makes every term *able* to hold — the country's
 * state and the product's indexability are mocked at the two reads `productView()` makes, and the
 * deployment is the indexing one — and then turns each term off **alone**. Each case must flip the
 * directive to `noindex,follow`, and the all-hold case must be `index,follow`; deleting any one
 * pass-through in `productView()` turns its own named case red.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** What the two mocked reads answer; reset after every case. */
const terms = { corridorLive: true, productIndexable: true };

vi.mock("../../src/modules/geo/index.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/geo/index.ts")>();
  return {
    ...actual,
    corridorState: (iso2: string, locale: string) =>
      terms.corridorLive ? "live" : actual.corridorState(iso2, locale),
  };
});

vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    isProductIndexable: async () => terms.productIndexable,
  };
});

const { productPageIndexability, productView } =
  await import("../../src/modules/catalog/product.ts");
const { INDEX_FOLLOW, NOINDEX_FOLLOW, deploymentDescriptor } =
  await import("../../src/modules/seo/index.ts");

const INDEXING = deploymentDescriptor({
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://flowersoverseas.com",
  VERCEL_ENV: "production",
});
const PREVIEW = deploymentDescriptor({
  NODE_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://preview.example.com",
});

const NOW = new Date("2026-09-09T07:00:00Z");

afterEach(() => {
  terms.corridorLive = true;
  terms.productIndexable = true;
});

async function directive(
  overrides: {
    locale?: string;
    parameterised?: boolean;
    deployment?: typeof INDEXING;
  } = {},
): Promise<string | undefined> {
  const view = await productView(
    { locale: overrides.locale ?? "en", countryIso: "PL", sku: "FO-BQ-001" },
    {
      parameterised: overrides.parameterised ?? false,
      now: NOW,
      deployment: overrides.deployment ?? INDEXING,
    },
  );
  return view?.indexability.directive;
}

describe("every term reaches the verdict through `productView()` (§6, AC-16)", () => {
  it("all hold → `index,follow` (the control: without it every case below passes vacuously)", async () => {
    await expect(directive()).resolves.toBe(INDEX_FOLLOW);
  });

  it("country not live → `noindex,follow` (the `operational` pass-through)", async () => {
    terms.corridorLive = false;
    await expect(directive()).resolves.toBe(NOINDEX_FOLLOW);
  });

  it("product not indexable → `noindex,follow` (the `reviewed` pass-through)", async () => {
    terms.productIndexable = false;
    await expect(directive()).resolves.toBe(NOINDEX_FOLLOW);
  });

  it("parameterised URL → `noindex,follow` (the `unparameterised` pass-through)", async () => {
    await expect(directive({ parameterised: true })).resolves.toBe(
      NOINDEX_FOLLOW,
    );
  });

  it("locale not indexable → `noindex,follow` (gathered by the engine from the view's locale)", async () => {
    await expect(directive({ locale: "de" })).resolves.toBe(NOINDEX_FOLLOW);
  });

  it("not the indexing environment → `noindex,follow` (the deployment the view is handed)", async () => {
    await expect(directive({ deployment: PREVIEW })).resolves.toBe(
      NOINDEX_FOLLOW,
    );
  });
});

/**
 * The type requires every term, but a cast or a JavaScript caller can still leave one out — and an
 * `undefined` term leaves spec 007's conjunction. Each case below omits one, everything else holds
 * (the mocks above, the indexing deployment), and the answer must still be `noindex,follow`
 * (`/break 101` F1, F2). The all-hold control at the top of this file is what makes them bite.
 */
describe("an omitted term fails closed at runtime, not only in the type (hole 5)", () => {
  it("`productPageIndexability()` with `countryLive` cast away → `noindex,follow` (F1)", () => {
    const verdict = productPageIndexability(
      "en",
      {
        exists: true,
        productIndexable: true,
        unparameterised: true,
      } as never,
      INDEXING,
    );
    expect(verdict.directive).toBe(NOINDEX_FOLLOW);
    // The control: the same call with the term stated is the one index case.
    expect(
      productPageIndexability(
        "en",
        {
          exists: true,
          countryLive: true,
          productIndexable: true,
          unparameterised: true,
        },
        INDEXING,
      ).directive,
    ).toBe(INDEX_FOLLOW);
  });

  it("`productView()` with `parameterised` cast away → `noindex,follow` (F2)", async () => {
    const view = await productView(
      { locale: "en", countryIso: "PL", sku: "FO-BQ-001" },
      { now: NOW, deployment: INDEXING } as never,
    );
    expect(view?.indexability.directive).toBe(NOINDEX_FOLLOW);
  });
});
