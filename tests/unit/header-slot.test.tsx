/**
 * The `@header` parallel-route slot (spec 043 §5.3 A, §5.4, AC-1, AC-3, AC-4; T-01, T-03 and T-04's
 * unit halves; TASK-288).
 *
 *  1. **The route-tree diff** (T-03): every `page.tsx` under `src/app/[locale]` has a page at the
 *     same path in the slot, and the slot has no page for a route that does not exist. Next keeps
 *     an unmatched slot's previous content on a client navigation, so one missing file would leave
 *     a Poland row on the page navigated to. Red when a new route has no slot file, and when the
 *     slot's page for a route is deleted.
 *  2. **What each slot page draws**: the header's row and Menu hrefs, rendered from the props the
 *     slot page hands `SiteHeader`. Out of context they equal the baseline captured from `main`
 *     before the change (`tests/fixtures/header/out-of-context-hrefs.json`); in Poland's and
 *     France's context they are the design band's table. The price claim is absent on the home
 *     only, and the language links ask for the segments `@switcher` asks for.
 *  3. **Static by construction** (T-04): no slot file reads a request header, a cookie, the search
 *     parameters or the client path, and none is a client module.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { type ReactElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { loadMessages } from "../../src/modules/i18n";
import {
  SiteHeader,
  type SiteHeaderProps,
} from "../../src/modules/ui/layout/SiteHeader.tsx";
import baseline from "../fixtures/header/out-of-context-hrefs.json" with { type: "json" };

vi.mock("next-intl/server", () => ({
  setRequestLocale: (): void => undefined,
}));

const ROOT = join(import.meta.dirname, "..", "..");
const LOCALE_DIR = join(ROOT, "src", "app", "[locale]");
const SLOT_DIR = join(LOCALE_DIR, "@header");

/** Every `page.tsx` below `dir`, as paths relative to it, skipping parallel-route slots. */
function pagesUnder(dir: string, skipSlots: boolean): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        if (skipSlots && name.startsWith("@")) continue;
        walk(path);
      } else if (name === "page.tsx") {
        out.push(relative(dir, path).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return out.sort();
}

describe("the slot has a page for every route under [locale] (T-03)", () => {
  const routes = pagesUnder(LOCALE_DIR, true);
  const slot = pagesUnder(SLOT_DIR, false);

  it("finds the route tree it diffs (the walk is not empty)", () => {
    expect(routes).toContain("page.tsx");
    expect(routes).toContain("[segment]/[child]/[grandchild]/page.tsx");
    expect(routes).toContain(
      "-product/[segment]/[child]/[grandchild]/page.tsx",
    );
  });

  it("mirrors every route, and nothing else", () => {
    expect(slot).toEqual(routes);
  });

  it("keeps a default.tsx for a full load of anything unmatched", () => {
    expect(statSync(join(SLOT_DIR, "default.tsx")).isFile()).toBe(true);
  });
});

/** The same two locales the baseline was captured in. */
type BaselineLocale = "en" | "en-gb";
type Hrefs = Record<string, string>;

interface SlotModule {
  default: (input: {
    params: Promise<Record<string, string>>;
  }) => Promise<ReactElement>;
}

async function slotPage(path: string): Promise<SlotModule> {
  return (await import(/* @vite-ignore */ join(SLOT_DIR, path))) as SlotModule;
}

/** The element a slot page returns: `SiteHeader` with the route's props. */
async function headerProps(
  path: string,
  params: Record<string, string>,
): Promise<SiteHeaderProps> {
  let element: unknown = await (
    await slotPage(path)
  ).default({
    params: Promise.resolve(params),
  });
  // The slot page renders `RouteHeader`, an async Server Component: unwrap it to the element it
  // returns, which must be `SiteHeader` itself.
  while (
    isValidElement(element) &&
    element.type !== SiteHeader &&
    typeof element.type === "function"
  ) {
    const render = element.type as (props: unknown) => unknown;
    element = await render(element.props);
  }
  expect(isValidElement(element)).toBe(true);
  const header = element as ReactElement<SiteHeaderProps>;
  expect(header.type).toBe(SiteHeader);
  return header.props;
}

/** The row's and the Menu's hrefs by item id, and the Send pill's, as `SiteHeader` draws them. */
function drawn(props: SiteHeaderProps): {
  row: Hrefs;
  menu: Hrefs;
  send: string | undefined;
} {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={props.locale}
      messages={loadMessages(props.locale, [
        "nav",
        "company",
        "a11y",
        "common",
      ])}
      timeZone="UTC"
    >
      {/* The switcher is an async Server Component; it is asserted by its props below. */}
      <SiteHeader {...props} switcher={null} />
    </NextIntlClientProvider>,
  );
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
  const attr = (tag: string, name: string): string | undefined =>
    new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  const collect = (name: string): Hrefs =>
    Object.fromEntries(
      anchors
        .filter((tag) => attr(tag, name) !== undefined)
        .map((tag) => [attr(tag, name) ?? "", attr(tag, "href") ?? ""]),
    );
  const send = anchors
    .map((tag) => attr(tag, "href"))
    .find((href) => href?.endsWith("#send"));
  return {
    row: collect("data-fo-header-item"),
    menu: collect("data-fo-menu-item"),
    send,
  };
}

/** Order matters: the row is a list, so compare entries, not sets. */
function entriesOf(hrefs: Hrefs): [string, string][] {
  return Object.entries(hrefs);
}

const OUT_OF_CONTEXT: readonly {
  name: string;
  path: string;
  params: (locale: BaselineLocale) => Record<string, string>;
}[] = [
  {
    name: "the locale home",
    path: "page.tsx",
    params: (locale) => ({ locale }),
  },
  {
    name: "the destinations hub",
    path: "[segment]/page.tsx",
    params: (locale) => ({ locale, segment: "send-flowers-to" }),
  },
  {
    name: "the occasions index",
    path: "[segment]/page.tsx",
    params: (locale) => ({ locale, segment: "occasions" }),
  },
  {
    name: "a category hub",
    path: "[segment]/[child]/page.tsx",
    params: (locale) => ({ locale, segment: "flowers", child: "roses" }),
  },
  {
    name: "an occasion hub",
    path: "[segment]/[child]/page.tsx",
    params: (locale) => ({ locale, segment: "occasions", child: "birthday" }),
  },
  {
    name: "the boom route",
    path: "boom/page.tsx",
    params: (locale) => ({ locale }),
  },
  {
    name: "the slot default",
    path: "../@header/default.tsx",
    params: (locale) => ({ locale }),
  },
];

describe("out of context, the row and the Menu keep main's hrefs (AC-3, T-03)", () => {
  for (const locale of ["en", "en-gb"] as const) {
    for (const { name, path, params } of OUT_OF_CONTEXT) {
      it(`${name} in ${locale}`, async () => {
        const target = path.startsWith("../")
          ? path.slice("../@header/".length)
          : path;
        const { row, menu, send } = drawn(
          await headerProps(target, params(locale)),
        );
        expect(entriesOf(row)).toEqual(entriesOf(baseline[locale].row));
        expect(entriesOf(menu)).toEqual(entriesOf(baseline[locale].menu));
        expect(send).toBe(baseline[locale].send);
      });
    }
  }
});

/** The design band's table (`country-shop-desktop.dc.html`, "Spec 043 · the header in context"). */
function inContext(
  locale: BaselineLocale,
  country: "poland" | "france",
): Hrefs {
  const base = baseline[locale].row;
  return {
    "our-selection": `/${locale}/${country}/flowers`,
    birthday: `/${locale}/${country}/flowers/birthday-flowers`,
    sympathy: `/${locale}/${country}/flowers/sympathy-flowers`,
    // Unchanged everywhere.
    occasions: base.occasions,
    bouquets: `/${locale}/${country}/flowers/hand-tied-bouquets`,
    roses: `/${locale}/${country}/flowers/roses`,
    plants: `/${locale}/${country}/flowers/plants`,
    destinations: base.destinations,
  };
}

const IN_CONTEXT: readonly {
  name: string;
  path: string;
  country: "poland" | "france";
  params: (locale: BaselineLocale) => Record<string, string>;
}[] = [
  {
    name: "Poland's shop root",
    path: "[segment]/[child]/page.tsx",
    country: "poland",
    params: (locale) => ({ locale, segment: "poland", child: "flowers" }),
  },
  {
    name: "Poland's roses",
    path: "[segment]/[child]/[grandchild]/page.tsx",
    country: "poland",
    params: (locale) => ({
      locale,
      segment: "poland",
      child: "flowers",
      grandchild: "roses",
    }),
  },
  {
    name: "a Poland product page",
    path: "-product/[segment]/[child]/[grandchild]/page.tsx",
    country: "poland",
    params: (locale) => ({
      locale,
      segment: "poland",
      child: "product",
      grandchild: "amber-hour",
    }),
  },
  {
    name: "Poland's guide",
    path: "[segment]/[child]/page.tsx",
    country: "poland",
    params: (locale) => ({
      locale,
      segment: "send-flowers-to",
      child: "poland",
    }),
  },
  {
    name: "France's shop root",
    path: "[segment]/[child]/page.tsx",
    country: "france",
    params: (locale) => ({ locale, segment: "france", child: "flowers" }),
  },
  {
    name: "Poland's shop root page 2 (the parameter route)",
    path: "%5Fquery/[segment]/[child]/page.tsx",
    country: "poland",
    params: (locale) => ({ locale, segment: "poland", child: "flowers" }),
  },
  {
    name: "Poland's roses sorted (the depth-4 parameter route)",
    path: "%5Fquery/[segment]/[child]/[grandchild]/page.tsx",
    country: "poland",
    params: (locale) => ({
      locale,
      segment: "poland",
      child: "flowers",
      grandchild: "roses",
    }),
  },
];

describe("in a destination's context, the shop items link to its own pages (AC-1, T-01)", () => {
  for (const locale of ["en", "en-gb"] as const) {
    for (const { name, path, country, params } of IN_CONTEXT) {
      it(`${name} in ${locale}`, async () => {
        const { row, menu, send } = drawn(
          await headerProps(path, params(locale)),
        );
        expect(entriesOf(row)).toEqual(entriesOf(inContext(locale, country)));
        expect(entriesOf(menu)).toEqual(entriesOf(inContext(locale, country)));
        expect(send).toBe(baseline[locale].send);
      });
    }
  }
});

describe("the two things the layout used to hand in are the route's", () => {
  it("draws no price claim on the locale home and the claim everywhere else", async () => {
    expect(
      (await headerProps("page.tsx", { locale: "en" })).priceClaim,
    ).toBeNull();
    for (const { path, params } of [...OUT_OF_CONTEXT, ...IN_CONTEXT].filter(
      (entry) => entry.path !== "page.tsx",
    )) {
      const target = path.startsWith("../")
        ? path.slice("../@header/".length)
        : path;
      const claim = (await headerProps(target, params("en"))).priceClaim;
      expect(isValidElement(claim), target).toBe(true);
    }
  });

  it("asks the language links for the segments `@switcher` asks for", async () => {
    const switcherOf = async (
      path: string,
      params: Record<string, string>,
    ): Promise<unknown> => {
      const { switcher } = await headerProps(path, params);
      return isValidElement(switcher)
        ? (switcher.props as { segments?: unknown }).segments
        : undefined;
    };
    const product = {
      locale: "en",
      segment: "poland",
      child: "product",
      grandchild: "amber-hour",
    };
    expect(
      await switcherOf(
        "-product/[segment]/[child]/[grandchild]/page.tsx",
        product,
      ),
    ).toEqual(["poland", "product", "amber-hour"]);
    expect(
      await switcherOf("[segment]/[child]/page.tsx", {
        locale: "en",
        segment: "poland",
        child: "flowers",
      }),
    ).toEqual(["poland", "flowers"]);
    // `@switcher` mirrors neither the home nor the parameter routes: its default, the homes.
    expect(await switcherOf("page.tsx", { locale: "en" })).toEqual([]);
    expect(
      await switcherOf("%5Fquery/[segment]/[child]/page.tsx", {
        locale: "en",
        segment: "poland",
        child: "flowers",
      }),
    ).toEqual([]);
  });
});

describe("the slot stays static (AC-4, T-04)", () => {
  const files = [
    ...pagesUnder(SLOT_DIR, false).map((path) => join(SLOT_DIR, path)),
    join(SLOT_DIR, "default.tsx"),
    join(LOCALE_DIR, "route-header.tsx"),
  ];

  it.each(files.map((file) => [relative(ROOT, file), file]))(
    "%s reads no request, cookie, query or client path and is no client module",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\bheaders\s*\(/);
      expect(source).not.toMatch(/\bcookies\s*\(/);
      expect(source).not.toMatch(/\bsearchParams\b/);
      expect(source).not.toMatch(/\busePathname\b|\buseSearchParams\b/);
      expect(source).not.toMatch(/^\s*["']use client["']/m);
      expect(source).not.toMatch(/next\/headers/);
    },
  );
});
