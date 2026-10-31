/**
 * The product parameter route, called as Next calls it (spec 009 §5.2, §14 **A10**, AC-15; T-15's
 * integration half; TASK-128): `src/app/[locale]/%5Fquery/-product/[segment]/[child]/[grandchild]/
 * page.tsx`, with a `params` and a `searchParams` promise in, an element or a thrown `notFound()`
 * out.
 *
 * **The trap** (TASK-146's, again): in Phase 0 every product page is `noindex,follow` and its
 * canonical is the bare URL whether or not the parameter was read. So each value case asserts what
 * only the parameter route can produce: the **selected** tier and date of the view the page
 * renders, the total that selection prints, and the `parameterised` term the route handed
 * `productView()` (spied at the catalogue's barrel, the module the route imports), compared with
 * the bare route's.
 *
 * The five value cases (AC-15): a valid value re-renders the selection; an unknown tier, a
 * malformed date, an out-of-window date and an unselectable date fall back to the default
 * rendering with a 200 (an element, no throw). The date cases run on Poland **live** (spec 007's
 * `withActivePartnersProvider` over the committed `operations` block: Monday to Saturday, no
 * Sunday), because only a live picker has a date to choose (A10, memo E-3), at a fixed clock
 * inside the committed FX snapshot's window: Wednesday 9 September 2026, 09:00 in Warsaw.
 */
import { type ReactElement, isValidElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** What each `productView()` call was asked, in order: the route's own options. */
const calls = vi.hoisted(
  () => [] as { parameterised: boolean; selection?: unknown }[],
);

vi.mock("../../src/modules/catalog/index.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/modules/catalog/index.ts")>();
  return {
    ...actual,
    productView: (
      ...args: Parameters<typeof actual.productView>
    ): ReturnType<typeof actual.productView> => {
      calls.push({
        parameterised: args[1].parameterised,
        ...(args[1].selection === undefined
          ? {}
          : { selection: args[1].selection }),
      });
      return actual.productView(...args);
    },
  };
});

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
  getTranslations: (): Promise<(key: string) => string> =>
    Promise.resolve((key: string) => key),
}));

const parameterRoute =
  await import("../../src/app/[locale]/%5Fquery/-product/[segment]/[child]/[grandchild]/page.tsx");
const productRoute =
  await import("../../src/app/[locale]/-product/[segment]/[child]/[grandchild]/page.tsx");
const { ProductPage } =
  await import("../../src/modules/ui/product/ProductPage.tsx");
const { withActivePartnersProvider } =
  await import("../../src/modules/geo/partners.ts");

type ProductView = import("../../src/modules/catalog/index.ts").ProductView;

/** Wednesday 9 September 2026, 09:00 Europe/Warsaw. */
const MORNING = new Date("2026-09-09T07:00:00Z");
/** A Sunday inside the fourteen-day window: Poland delivers Monday to Saturday. */
const SUNDAY = "2026-09-13";
/** Six weeks on: well formed, outside the window. */
const OUT_OF_WINDOW = "2026-10-21";

const AMBER = {
  locale: "en",
  segment: "poland",
  child: "product",
  grandchild: "amber-hour",
} as const;

type Params = {
  locale: string;
  segment: string;
  child: string;
  grandchild: string;
};
type Query = Record<string, string | string[] | undefined>;

const partnered = { hasActivePartners: (iso2: string) => iso2 === "PL" };

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MORNING);
});
afterAll(() => {
  vi.useRealTimers();
});

/** The view `ProductPage` is mounted over, from the element the route returned. */
function viewIn(element: ReactElement): ProductView {
  const children = (element.props as { children: readonly ReactElement[] })
    .children;
  const [pdp] = children;
  expect(isValidElement(pdp) && pdp.type === ProductPage).toBe(true);
  return (pdp?.props as { view: ProductView }).view;
}

async function parameterised(
  query: Query,
  params: Params = AMBER,
): Promise<ProductView> {
  return viewIn(
    await parameterRoute.default({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(query),
    }),
  );
}

async function bare(params: Params = AMBER): Promise<ProductView> {
  return viewIn(
    await productRoute.default({ params: Promise.resolve(params) }),
  );
}

const live = <T,>(run: () => Promise<T>): Promise<T> =>
  withActivePartnersProvider(partnered, run);

async function notFoundFor(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return true;
    throw error;
  }
}

/** The one total the summary prints for the view's own selection. */
const totalOf = (view: ProductView): number | undefined =>
  view.selectedDate === undefined
    ? view.tiers.find((tier) => tier.tierKey === view.selectedTierKey)?.price
        .amountMinor
    : view.totals[view.selectedTierKey]?.[view.selectedDate];

describe("AC-15: a valid value re-renders the selection", () => {
  it("`?tier=` selects that size, its price and its total (preview and live)", async () => {
    for (const run of [<T,>(f: () => Promise<T>) => f(), live]) {
      const base = await run(() => bare());
      const other = base.tiers.find(
        (tier) => tier.tierKey !== base.selectedTierKey,
      );
      expect(other).toBeDefined();
      const chosen = await run(() =>
        parameterised({ tier: other?.tierKey ?? "" }),
      );
      expect(chosen.selectedTierKey).toBe(other?.tierKey);
      expect(chosen.selectedTierKey).not.toBe(base.selectedTierKey);
      expect(totalOf(chosen)).not.toBe(totalOf(base));
    }
  });

  it("`?date=` selects that date in `live`, and the summary prints that date's total", async () => {
    const base = await live(() => bare());
    expect(base.delivery.state).toBe("live");
    const selectable = base.delivery.dates
      .filter((date) => date.selectable)
      .map((date) => date.date);
    // The earliest is preselected; ask for the third, so the answer cannot be the default.
    expect(base.selectedDate).toBe(selectable[0]);
    const wanted = selectable[2] ?? "";
    const chosen = await live(() => parameterised({ date: wanted }));
    expect(chosen.selectedDate).toBe(wanted);
    expect(totalOf(chosen)).toBe(
      chosen.totals[chosen.selectedTierKey]?.[wanted],
    );
  });

  it("`?tier=…&date=…` selects both, and an unknown parameter beside them is dropped", async () => {
    const base = await live(() => bare());
    const other = base.tiers.find(
      (tier) => tier.tierKey !== base.selectedTierKey,
    );
    const wanted =
      base.delivery.dates.filter((date) => date.selectable)[3]?.date ?? "";
    const chosen = await live(() =>
      parameterised({
        tier: other?.tierKey ?? "",
        date: wanted,
        utm_source: "newsletter",
      }),
    );
    expect([chosen.selectedTierKey, chosen.selectedDate]).toEqual([
      other?.tierKey,
      wanted,
    ]);
  });
});

describe("AC-15: anything else falls back to the default rendering, with a 200 and no error", () => {
  it("an unknown tier (a retired key, TASK-240) renders the default size", async () => {
    const base = await bare();
    for (const tier of ["stems_18", "nonsense", "STEMS_15"]) {
      const view = await parameterised({ tier });
      expect(view.selectedTierKey, tier).toBe(base.selectedTierKey);
    }
  });

  it("a malformed, an out-of-window and an unselectable date render the earliest date", async () => {
    const base = await live(() => bare());
    const sunday = base.delivery.dates.find((date) => date.date === SUNDAY);
    // The Sunday is in the window and closed, so it really is the unselectable case.
    expect(sunday?.selectable).toBe(false);
    expect(
      base.delivery.dates.some((date) => date.date === OUT_OF_WINDOW),
    ).toBe(false);
    for (const date of ["2026-09-31", "12-09-2026", OUT_OF_WINDOW, SUNDAY]) {
      const view = await live(() => parameterised({ date }));
      expect(view.selectedDate, date).toBe(base.selectedDate);
      expect(totalOf(view), date).toBe(totalOf(base));
    }
  });

  it("a date in `preview` selects nothing: no date can be chosen there", async () => {
    const view = await parameterised({ date: "2026-09-10" });
    expect(view.delivery.state).toBe("preview");
    expect(view.selectedDate).toBeUndefined();
  });
});

describe("AC-15: the parameter route renders `parameterised: true`; the product route `false`", () => {
  it("hands `productView()` the flag and the parsed selection", async () => {
    calls.length = 0;
    await bare();
    await parameterised({ tier: "stems_15", date: "bad", gclid: "x" });
    expect(calls).toEqual([
      { parameterised: false },
      { parameterised: true, selection: { tierKey: "stems_15" } },
    ]);
  });

  it("its head is the view's robots and the bare canonical", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://flowersoverseas.com");
    const metadata = await parameterRoute.generateMetadata({
      params: Promise.resolve(AMBER),
      searchParams: Promise.resolve({ tier: "stems_15" }),
    });
    const bareHead = await productRoute.generateMetadata({
      params: Promise.resolve(AMBER),
    });
    expect(metadata.robots).toBe("noindex,follow");
    const canonical = String(metadata.alternates?.canonical ?? "");
    expect(canonical).toMatch(/\/en\/poland\/product\/amber-hour$/u);
    expect(canonical).toBe(String(bareHead.alternates?.canonical ?? ""));
    vi.unstubAllEnvs();
  });
});

describe("AC-15 / A10: what the parameter route refuses", () => {
  it("404s a request with neither key: it did not come through the rewrite", async () => {
    for (const query of [{}, { gclid: "x" }, { utm_source: "n", sort: "a" }]) {
      expect(
        await notFoundFor(() => parameterised(query)),
        JSON.stringify(query),
      ).toBe(true);
    }
    expect(
      await notFoundFor(() =>
        parameterRoute.generateMetadata({
          params: Promise.resolve(AMBER),
          searchParams: Promise.resolve({ gclid: "x" }),
        }),
      ),
    ).toBe(true);
  });

  it("404s the uppercase spellings a case-insensitive rewrite captures", async () => {
    for (const params of [
      { ...AMBER, locale: "EN" },
      { ...AMBER, child: "PRODUCT" },
      { ...AMBER, segment: "Poland" },
      { ...AMBER, grandchild: "Amber-Hour" },
      { ...AMBER, child: "produkt" },
      { ...AMBER, grandchild: "no-such-bouquet" },
    ]) {
      expect(
        await notFoundFor(() => parameterised({ tier: "stems_15" }, params)),
        JSON.stringify(params),
      ).toBe(true);
    }
  });
});
