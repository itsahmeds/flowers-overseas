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

import { megaMenuModel } from "../../src/modules/catalog";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import { loadMessages } from "../../src/modules/i18n";
import {
  SiteHeader,
  type SiteHeaderProps,
} from "../../src/modules/ui/layout/SiteHeader.tsx";
import {
  type MegaMenuModel,
  panelEntries,
} from "../../src/modules/ui/layout/mega-model.ts";

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

/** The two locales AC-3 names. */
type BaselineLocale = "en" | "en-gb";
/** `[entry id, target]` in drawing order: an href, or a form's `action?name=value`. */
type Drawn = [string, string][];

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

/**
 * The row's and the Menu's entries as `SiteHeader` draws them, each with its target, and any link
 * to the old Send pill's `#send` (spec 004 §14 A-founder-2026-10-24a, Q-24d: none).
 */
function drawn(props: SiteHeaderProps): {
  row: Drawn;
  menu: Drawn;
  send: string | undefined;
  context: string | null | undefined;
} {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale={props.locale}
      messages={loadMessages(props.locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      {/* The switcher is an async Server Component; it is asserted by its props below. */}
      <SiteHeader {...props} switcher={null} />
    </NextIntlClientProvider>,
  );
  const menuAt = html.search(/<details[^>]*\sdata-fo-menu=""/u);
  const collect = (markup: string): Drawn =>
    [
      ...markup.matchAll(
        /<a\b[^>]*\sdata-fo-mega-entry="([^"]*)"[^>]*\shref="([^"]*)"|<a\b[^>]*\shref="([^"]*)"[^>]*\sdata-fo-mega-entry="([^"]*)"|<form action="([^"]*)" method="get"><input type="hidden" name="([^"]*)" value="([^"]*)"\/><button[^>]*data-fo-mega-entry="([^"]*)"/gu,
      ),
    ].map((match) =>
      match[1] !== undefined
        ? [match[1], match[2] ?? ""]
        : match[4] !== undefined
          ? [match[4], match[3] ?? ""]
          : [
              match[8] ?? "",
              `${match[5] ?? ""}?${match[6] ?? ""}=${match[7] ?? ""}`,
            ],
    );
  const send = [...html.matchAll(/href="([^"]*#send)"/gu)].map((m) => m[1])[0];
  return {
    row: collect(html.slice(0, menuAt)),
    menu: collect(html.slice(menuAt)),
    send,
    context: props.megaMenu?.context,
  };
}

/** The model's entries as `drawn()` reads them: what AC-3 and AC-50 compare the header with. */
function expected(model: MegaMenuModel): Drawn {
  return model.panels.flatMap((panel) =>
    panelEntries(panel).map((entry): [string, string] => [
      entry.id,
      entry.kind === "facet"
        ? `${entry.action}?${entry.name}=${entry.value}`
        : entry.href,
    ]),
  );
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

describe("out of context, the row and the Menu equal megaMenuModel(locale, null) (AC-3, T-03)", () => {
  for (const locale of ["en", "en-gb"] as const) {
    for (const { name, path, params } of OUT_OF_CONTEXT) {
      it(`${name} in ${locale}`, async () => {
        const target = path.startsWith("../")
          ? path.slice("../@header/".length)
          : path;
        const { row, menu, send, context } = drawn(
          await headerProps(target, params(locale)),
        );
        const model = await megaMenuModel(locale, null);
        expect(context).toBeNull();
        expect(row.length).toBeGreaterThan(40);
        expect(row).toEqual(expected(model));
        expect(menu).toEqual(expected(model));
        expect(send).toBeUndefined();
      });
    }
  }
});

const IN_CONTEXT: readonly {
  name: string;
  path: string;
  country: "PL" | "FR";
  params: (locale: BaselineLocale) => Record<string, string>;
}[] = [
  {
    name: "Poland's shop root",
    path: "[segment]/[child]/page.tsx",
    country: "PL",
    params: (locale) => ({ locale, segment: "poland", child: "flowers" }),
  },
  {
    name: "Poland's roses",
    path: "[segment]/[child]/[grandchild]/page.tsx",
    country: "PL",
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
    country: "PL",
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
    country: "PL",
    params: (locale) => ({
      locale,
      segment: "send-flowers-to",
      child: "poland",
    }),
  },
  {
    name: "France's shop root",
    path: "[segment]/[child]/page.tsx",
    country: "FR",
    params: (locale) => ({ locale, segment: "france", child: "flowers" }),
  },
  {
    name: "Poland's shop root page 2 (the parameter route)",
    path: "%5Fquery/[segment]/[child]/page.tsx",
    country: "PL",
    params: (locale) => ({ locale, segment: "poland", child: "flowers" }),
  },
  {
    name: "Poland's roses sorted (the depth-4 parameter route)",
    path: "%5Fquery/[segment]/[child]/[grandchild]/page.tsx",
    country: "PL",
    params: (locale) => ({
      locale,
      segment: "poland",
      child: "flowers",
      grandchild: "roses",
    }),
  },
];

describe("in a destination's context, every entry is that country's (spec 043 AC-1, AC-50, T-01, T-50)", () => {
  for (const locale of ["en", "en-gb"] as const) {
    for (const { name, path, country, params } of IN_CONTEXT) {
      it(`${name} in ${locale}`, async () => {
        const { row, menu, send, context } = drawn(
          await headerProps(path, params(locale)),
        );
        const model = await megaMenuModel(locale, country);
        expect(context).toBe(country);
        expect(row).toEqual(expected(model));
        expect(menu).toEqual(expected(model));
        expect(send).toBeUndefined();
        // In context nothing goes through the chooser, and the hubs are the country's pages.
        const out = expected(await megaMenuModel(locale, null));
        for (const [id, target] of row) {
          expect(target, id).not.toContain("/choose-country");
          const hub = out.find(([other]) => other === id)?.[1];
          if (id.startsWith("category:") || id.startsWith("occasion:")) {
            expect(target, id).not.toBe(hub);
          }
        }
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
    // Depth 2 and the non-product depth 4 mirror `@switcher` too (breaker HOLE 1 on PR 308): an
    // empty list here would send the header's language links to the locale homes.
    expect(
      await switcherOf("[segment]/page.tsx", {
        locale: "en",
        segment: "occasions",
      }),
    ).toEqual(["occasions"]);
    expect(
      await switcherOf("[segment]/[child]/[grandchild]/page.tsx", {
        locale: "en",
        segment: "poland",
        child: "flowers",
        grandchild: "roses",
      }),
    ).toEqual(["poland", "flowers", "roses"]);
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
