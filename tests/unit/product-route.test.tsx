/**
 * The product route — `src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx`'s product branch
 * (spec 009 §2, §5.4, AC-1, AC-8's "zero template edits"; T-01 unit half; TASK-127).
 *
 * The route is called as Next calls it — a `params` promise in, an element or a thrown
 * `notFound()` out — so every AC-1 shape is asserted against the file that serves it, not only
 * against the resolver underneath. `notFound()` is the real one; `next-intl/server` is replaced
 * by a minimal stand-in because there is no request context in a unit test.
 *
 * What a 200 means here: the branch returns `ProductPage` over the `productView()` of exactly the
 * resolved (locale, destination, SKU). What a 404 means: `NEXT_HTTP_ERROR_FALLBACK;404` is thrown
 * — never a redirect, and never a substitute page.
 */
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * Every committed product is priced in every destination, so "no active price here" has no
 * corpus example. The one term is made switchable — the `catalog-product-routes.test.ts` seam —
 * and the rest of the existence rule stays real.
 */
const reads: { unpriced?: string } = {};
vi.mock("../../src/modules/catalog/read.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/read.ts")>();
  return {
    ...actual,
    hasActivePrice: async (sku: string, iso2: string) =>
      reads.unpriced === `${sku}|${iso2}`
        ? false
        : await actual.hasActivePrice(sku, iso2 as never),
  };
});

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getTranslations: (): Promise<(key: string) => string> =>
    Promise.resolve((key: string) => key),
}));

const route =
  await import("../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx");
const { ProductPage } = await import("../../src/modules/ui");
const { listProductPages, productPageExists } =
  await import("../../src/modules/catalog");
const { listingLocales, publishedCountries } =
  await import("../../src/modules/catalog/listing.ts");
const { listProducts } = await import("../../src/modules/catalog/read.ts");
const { slugFor } = await import("../../src/modules/catalog/slugs.ts");
const { corridorSlug } = await import("../../src/modules/geo/index.ts");
const { localePath, productPath } =
  await import("../../src/modules/i18n/index.ts");
const { productView } = await import("../../src/modules/catalog");
const { withActivePartnersProvider } =
  await import("../../src/modules/geo/partners.ts");
const { CANONICAL_HOST, deploymentDescriptor, isIndexingEnvironment } =
  await import("../../src/modules/seo/environment.ts");

type Params = {
  locale: string;
  segment: string;
  child: string;
  grandchild: string;
};

function call(params: Params): Promise<ReactElement> {
  return route.default({ params: Promise.resolve(params) });
}

async function notFoundFor(params: Params): Promise<boolean> {
  try {
    await call(params);
    return false;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return true;
    throw error;
  }
}

const AMBER = {
  locale: "en",
  segment: "poland",
  child: "product",
  grandchild: "amber-hour",
} as const;

describe("AC-1: the product route answers the existence set and 404s everything else", () => {
  it("emits every page `productPageExists()` admits, per (locale, published destination) — §14 A6", async () => {
    // `dynamicParams = true` is inert under the `[locale]` layout's `false` (spec 003's gate), so
    // the params this function returns are the build's whole 200 set for the product branch.
    expect(route.dynamicParams).toBe(true);
    expect(route.revalidate).toBe(3600);

    const segmentOf = (locale: string) =>
      localePath(locale as never, "product").split("/")[2] ?? "";
    const emitted = new Set(
      (await route.generateStaticParams())
        .filter((entry) => entry.child === segmentOf(entry.locale))
        .map(
          (entry) =>
            `/${entry.locale}/${entry.segment}/${entry.child}/${entry.grandchild}`,
        ),
    );

    const perPair = new Map<string, number>();
    let admitted = 0;
    for (const locale of listingLocales()) {
      for (const countryIso of publishedCountries()) {
        for (const product of await listProducts({})) {
          const exists = await productPageExists({
            locale,
            countryIso,
            sku: product.sku,
          });
          const path = productPath(
            locale,
            corridorSlug(countryIso, locale),
            slugFor("product", product.sku, locale) ?? "",
          );
          expect(emitted.has(path), path).toBe(exists);
          if (!exists) continue;
          admitted += 1;
          const pair = `${locale}|${countryIso}`;
          perPair.set(pair, (perPair.get(pair) ?? 0) + 1);
        }
      }
    }

    // Spec 009 §2's arithmetic: 84 products × 7 published destinations × 4 launch locales.
    expect(admitted).toBe(2352);
    expect(emitted.size).toBe(2352);
    expect(perPair.size).toBe(28);
    for (const [pair, count] of perPair) expect(count, pair).toBe(84);
  });

  it("renders `ProductPage` over the resolved product, in every launch locale", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const [page] = (await listProductPages(locale)).filter(
        (record) => record.countryIso === "PL",
      );
      expect(page, locale).toBeDefined();
      const [, , countrySlug, child, slug] = (page?.path ?? "").split("/");
      const element = await call({
        locale,
        segment: countrySlug ?? "",
        child: child ?? "",
        grandchild: slug ?? "",
      });
      expect(isValidElement(element), locale).toBe(true);
      expect(element.type, locale).toBe(ProductPage);
      const props = element.props as { view: { product: { sku: string } } };
      expect(props.view.product.sku, locale).toBe(page?.sku);
    }
  });

  it("404s an unknown slug, an uppercase variant, another locale's segment and an unknown locale", async () => {
    expect(await notFoundFor(AMBER)).toBe(false);
    expect(await notFoundFor({ ...AMBER, grandchild: "no-such-bouquet" })).toBe(
      true,
    );
    expect(await notFoundFor({ ...AMBER, grandchild: "Amber-Hour" })).toBe(
      true,
    );
    expect(await notFoundFor({ ...AMBER, segment: "Poland" })).toBe(true);
    expect(await notFoundFor({ ...AMBER, child: "produkt" })).toBe(true);
    expect(await notFoundFor({ ...AMBER, locale: "fr" })).toBe(true);
    expect(await notFoundFor({ ...AMBER, segment: "atlantis" })).toBe(true);
  });

  it("404s a product with no active price in that destination", async () => {
    expect(await notFoundFor(AMBER)).toBe(false);
    reads.unpriced = "FO-BQ-001|PL";
    try {
      expect(await notFoundFor(AMBER)).toBe(true);
    } finally {
      delete reads.unpriced;
    }
    expect(await notFoundFor(AMBER)).toBe(false);
  });
});

/**
 * `/break 135` round 1 HOLE 1 (spec 009 §6, AC-16; ADR-0007): the PDP's `<head>` robots tag is the
 * route's own `generateMetadata` output, so it is asserted there — not only on the view model the
 * route reads it from. Phase 0's rule is that every product page is `noindex,follow`, whatever its
 * picker says, and it is asked in the **indexing environment** (`production` on the canonical
 * host), the one place the environment gate does not already close the page: a route that wrote
 * `INDEX_FOLLOW` would be indexable exactly there.
 */
describe("AC-16: the product page's robots tag is `noindex,follow` in every picker state", () => {
  const partnered = { hasActivePartners: (iso2: string) => iso2 === "PL" };
  const metadataFor = (params: Params) =>
    route.generateMetadata({ params: Promise.resolve(params) });

  it("emits exactly `noindex,follow` for preview, unavailable and live PDPs on the indexable deployment", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", `https://${CANONICAL_HOST}`);
    try {
      const deployment = deploymentDescriptor(process.env);
      expect(isIndexingEnvironment(deployment)).toBe(true);

      const GERMANY = { ...AMBER, segment: "germany" } as const;
      const DE = {
        locale: "de",
        segment: "polen",
        child: "produkt",
        grandchild: "amber-hour",
      } as const;
      const cases = [
        { name: "preview", iso2: "PL", params: AMBER, live: false },
        { name: "preview (de)", iso2: "PL", params: DE, live: false },
        { name: "unavailable", iso2: "DE", params: GERMANY, live: false },
        { name: "live", iso2: "PL", params: AMBER, live: true },
      ] as const;
      const states = new Set<string>();
      for (const { name, iso2, params, live } of cases) {
        const ask = async () => ({
          metadata: await metadataFor(params),
          view: await productView(
            { locale: params.locale, countryIso: iso2, sku: "FO-BQ-001" },
            { parameterised: false, deployment },
          ),
        });
        const { metadata, view } = live
          ? await withActivePartnersProvider(partnered, ask)
          : await ask();
        // The state is the one the case names, so no state passes by being absent.
        expect(view?.delivery.state, name).toBe(name.split(" ")[0]);
        states.add(view?.delivery.state ?? "");
        expect(metadata.robots, name).toBe("noindex,follow");
        expect(metadata.robots, name).toBe(view?.indexability.directive);
      }
      expect([...states].sort()).toEqual(["live", "preview", "unavailable"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * `/review 96`'s second carry-forward (spec 009 AC-3, §11): `writeProductExistenceSummary()` is
 * called by **this** route's `generateStaticParams` — the function whose output the counts describe
 * — and once per build. Next calls `generateStaticParams` more than once (collection, then render),
 * so the guard is what keeps one table, not two, in one `$GITHUB_STEP_SUMMARY`. Both halves are
 * asserted on the file a runner would read: dropping the call leaves zero tables, dropping the
 * guard leaves two.
 */
describe("AC-3: the product existence counts reach the CI step summary once per build", () => {
  it("appends exactly one product table across repeated `generateStaticParams` calls", async () => {
    const { mkdtempSync, readFileSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "fo-pdp-sum-")), "summary.md");
    vi.stubEnv("GITHUB_STEP_SUMMARY", file);
    // A fresh module instance is a fresh build: the cases above already called the shared one.
    vi.resetModules();
    const build =
      await import("../../src/app/[locale]/[segment]/[child]/[grandchild]/page.tsx");
    try {
      const first = await build.generateStaticParams();
      const second = await build.generateStaticParams();
      expect(second).toEqual(first);
      expect(existsSync(file)).toBe(true);
      const tables = readFileSync(file, "utf8").match(
        /^### Product page existence set /gmu,
      );
      expect(tables).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
