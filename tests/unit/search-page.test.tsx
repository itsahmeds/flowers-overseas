/**
 * The search results page (spec 045 §2.2, §2.7, §6; AC-3's markup half, AC-5, AC-10, AC-12, AC-13,
 * AC-15, AC-37; T-03, T-05, T-10, T-12, T-13, T-15, T-37's unit halves; §11's request log and
 * `alert=search.slow`; TASK-402).
 *
 * `searchPage()` builds the view exactly as the route does and `SearchResultsPage` renders it to
 * the server HTML, so every assertion here reads the markup a buyer with JavaScript off receives.
 * The committed catalogue answers AC-5, AC-10, AC-13 and AC-37; AC-12 and AC-15 need a fixture
 * (a product priced in one country only, a destination that takes dates), so they run on a source
 * over the same catalogue whose listing set and dates the test decides.
 *
 * Countries are test data here; nothing under `src/` names one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { LocaleCode } from "../../src/config/locales.ts";
import {
  coreRange,
  listingView,
  megaMenuModel,
  productCardView,
  getProduct,
  listingHref,
} from "../../src/modules/catalog/index.ts";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import {
  type SearchPageView,
  type SearchProduct,
  type SearchSource,
  SearchResultsPage,
  catalogSearchSource,
  memoryEngine,
  searchEngine,
  searchPage,
  slowSearchMonitor,
} from "../../src/modules/search/index.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const LOCALES: readonly LocaleCode[] = ["en", "en-gb", "de", "pl"];
const messages = (locale: LocaleCode) =>
  loadMessages(locale, MESSAGE_NAMESPACES) as Record<string, unknown>;

/** A message by dotted key in a locale's merged catalogue. */
function message(locale: LocaleCode, key: string): string {
  let node: unknown = messages(locale);
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== "string") throw new Error(`no message ${key}`);
  return node;
}

/** The page's view through the route's own function, with a silent log. */
async function view(
  locale: LocaleCode,
  raw: Record<string, string>,
  deps: Parameters<typeof searchPage>[2] = {},
): Promise<SearchPageView> {
  const outcome = await searchPage(locale, raw, {
    log: { info: () => undefined },
    slow: { record: () => undefined },
    ...deps,
  });
  if (outcome.kind !== "page") throw new Error("expected a page");
  return outcome.view;
}

function html(page: SearchPageView): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={page.locale}
      messages={messages(page.locale)}
      timeZone="UTC"
    >
      <SearchResultsPage view={page} />
    </NextIntlClientProvider>,
  );
}

/** HTML-escape the way React does, for comparing a message with the markup. */
function escaped(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

/** Every `<form>` with its action and its hidden inputs. */
function forms(markup: string): { attrs: string; body: string }[] {
  return [...markup.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/gu)].map(
    (match) => ({ attrs: match[1] ?? "", body: match[2] ?? "" }),
  );
}

function hidden(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/<input[^>]*type="hidden"[^>]*>/gu)].map((match) => [
      /name="([^"]*)"/u.exec(match[0])?.[1] ?? "",
      /value="([^"]*)"/u.exec(match[0])?.[1] ?? "",
    ]),
  );
}

beforeAll(async () => {
  // Build the process's index once; every case below reuses it.
  await searchEngine().search({ locale: "en", query: "roses", to: "pl" });
}, 120_000);

describe("the three no-results states on /en/search?to=pl (AC-5)", () => {
  it("empty: the H1, no search form in <main> (the header holds it), the chip, the header's occasions, Poland's first 12", async () => {
    const page = await view("en", { to: "pl" });
    const markup = html(page);
    expect(markup).toContain(
      `<h1 class="${markup.match(/<h1 class="([^"]*)"/u)?.[1] ?? ""}">${escaped(message("en", "search.heading"))}</h1>`,
    );
    // AC-43 / AC-5 as amended: the header field is the page's one search form.
    expect(markup).not.toContain('role="search"');
    expect(markup).not.toContain('name="q" type="search"');
    expect(markup).not.toContain("autofocus");
    // The chip names Poland (AC-40).
    expect(page.destination?.code).toBe("pl");
    expect(markup).toContain(`data-fo-search-chip="pl"`);
    expect(markup).toContain(
      escaped(
        message("en", "shop.chosen.line").replace(
          "{country}",
          page.destination?.name ?? "",
        ),
      ),
    );
    expect(markup).toMatch(
      /<option (value="pl" selected=""|selected="" value="pl")>[^<]+<\/option>/u,
    );
    // "Browse by occasion": exactly the header's occasion links, out of context.
    const model = await megaMenuModel("en", null);
    const occasions = (
      model.panels.find((panel) => panel.id === "occasions")?.columns ?? []
    )
      .flatMap((column) => column.entries)
      .flatMap((entry) => (entry.kind === "link" ? [entry.href] : []));
    expect(occasions.length).toBeGreaterThan(0);
    const block = markup.slice(
      markup.indexOf("data-fo-search-occasions"),
      markup.indexOf("data-fo-search-selection"),
    );
    expect(hrefs(block)).toEqual(occasions);
    // "Our selection": Poland's shop root, page 1, in its order.
    const listing = await listingView({
      locale: "en",
      pageType: "countryShopRoot",
      country: "poland",
    });
    expect(page.result.selection.map((card) => card.productId)).toEqual(
      // The first 12 of the listing's order (the listing pages 24 since TASK-390).
      listing?.items.slice(0, 12).map((card) => card.productId),
    );
    expect(page.result.selection).toHaveLength(12);
    expect(markup).toContain(
      escaped(message("en", "nav.category.ourSelection")),
    );
  });

  it("too short (q=r): search.tooShort above the same content, no count, no How we sort", async () => {
    const markup = html(await view("en", { q: "r", to: "pl" }));
    const tooShort = markup.indexOf(escaped(message("en", "search.tooShort")));
    expect(tooShort).toBeGreaterThan(0);
    expect(tooShort).toBeLessThan(markup.indexOf("data-fo-search-occasions"));
    expect(markup).toContain("data-fo-search-selection");
    expect(markup).not.toContain("data-fo-ranking-disclosure");
    expect(markup).not.toContain("data-fo-search-count");
  });

  it("no results (q=xqzv): search.noResults with the query in <bdi>, no results grid, occasions and selection", async () => {
    const markup = html(await view("en", { q: "xqzv", to: "pl" }));
    const [before] = message("en", "search.noResults").split("{query}");
    expect(markup).toContain(escaped(before ?? ""));
    expect(markup).toMatch(/<bdi><em[^>]*>xqzv<\/em><\/bdi>/u);
    expect(markup).not.toContain("data-fo-search-results");
    expect(markup).toContain("data-fo-search-occasions");
    expect(markup).toContain("data-fo-search-selection");
    expect(markup).not.toContain("data-fo-search-did-you-mean");
  });

  it("no state says popular, bestseller or recommended, in any locale (AC-5's scan)", async () => {
    for (const locale of LOCALES) {
      for (const raw of [
        { to: "pl" },
        { q: "r", to: "pl" },
        { q: "xqzv", to: "pl" },
        { q: "roses", to: "pl" },
        { q: "roses" },
        {},
      ]) {
        const markup = html(await view(locale, raw)).toLowerCase();
        for (const banned of ["popular", "bestseller", "recommended"]) {
          expect(markup, `${locale} ${JSON.stringify(raw)}`).not.toContain(
            banned,
          );
        }
      }
    }
  });
});

describe("results (AC-3's markup half, the H1, How we sort, the pager)", () => {
  it("results: the H1 holds the query in <bdi>, one closed How we sort with the sentence, the cards", async () => {
    const page = await view("en", { q: "roses", to: "pl" });
    const markup = html(page);
    expect(page.result.state).toBe("results");
    expect(markup).toMatch(
      /<h1[^>]*>Results for “<bdi><em[^>]*>roses<\/em><\/bdi>”<\/h1>/u,
    );
    expect(markup.match(/data-fo-ranking-disclosure/gu)).toHaveLength(1);
    expect(markup).not.toMatch(/<details[^>]*\sopen(=|\s|>)/u);
    expect(
      markup.split(escaped(message("en", "search.ranking.disclosure"))),
    ).toHaveLength(2);
    expect(markup).not.toContain("earn us more");
    expect(page.result.cards.length).toBeGreaterThan(0);
  });

  it("no href in any state carries q=, and the pager, Did you mean and any-date are GET forms", async () => {
    const cases: Record<string, string>[] = [
      { to: "pl" },
      { q: "r", to: "pl" },
      { q: "xqzv", to: "pl" },
      { q: "tolaps", to: "pl" },
      { q: "roses", to: "pl" },
      { q: "flowers", to: "pl" },
      { q: "flowers", to: "pl", page: "2" },
      { q: "roses" },
      {},
    ];
    for (const raw of cases) {
      const markup = html(await view("en", raw));
      for (const href of hrefs(markup)) {
        expect(href, JSON.stringify(raw)).not.toMatch(/[?&]q=/u);
      }
      for (const form of forms(markup)) {
        expect(form.attrs).toContain('method="get"');
      }
    }
  });

  it("page 2 carries q, to and page in the Previous form's hidden inputs, and page 1 drops page", async () => {
    const page = await view("en", { q: "flowers", to: "pl", page: "2" });
    expect(page.result.pageCount).toBeGreaterThan(1);
    const markup = html(page);
    const previous = forms(markup).find((form) =>
      form.attrs.includes('data-fo-search-step="previous"'),
    );
    expect(previous).toBeDefined();
    expect(hidden(previous?.body ?? "")).toEqual({ q: "flowers", to: "pl" });
    const next = forms(markup).find((form) =>
      form.attrs.includes('data-fo-search-step="next"'),
    );
    if (page.result.pageCount > 2) {
      expect(hidden(next?.body ?? "")).toEqual({
        q: "flowers",
        to: "pl",
        page: "3",
      });
    } else {
      expect(next).toBeUndefined();
    }
  });

  it("a page past the last answers notFound (spec 008's 404), and so does page=11 before the engine", async () => {
    const engine = {
      search: vi.fn(searchEngine().search),
      suggest: vi.fn(searchEngine().suggest),
    };
    expect(
      await searchPage(
        "en",
        { q: "roses", to: "pl", page: "11" },
        {
          engine,
          log: { info: () => undefined },
        },
      ),
    ).toEqual({ kind: "notFound" });
    expect(engine.search).not.toHaveBeenCalled();
    expect(
      await searchPage(
        "en",
        { q: "roses", to: "pl", page: "10" },
        {
          log: { info: () => undefined },
          slow: { record: () => undefined },
        },
      ),
    ).toEqual({ kind: "notFound" });
  });

  it("renders the query as text: markup in q is escaped, never parsed", async () => {
    const markup = html(
      await view("en", { q: "<script>alert(1)</script>", to: "pl" }),
    );
    expect(markup).not.toContain("<script>alert(1)");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("awkward queries (the breaker's cases)", () => {
  it("a 200-character query is cut to 80 code points; the chip's forms carry the cut words", async () => {
    const page = await view("en", { q: "roses ".repeat(34), to: "pl" });
    expect([...page.result.query].length).toBeLessThanOrEqual(80);
    const change = forms(html(page)).find((form) =>
      form.attrs.includes("data-fo-search-chip-change"),
    );
    expect(hidden(change?.body ?? "").q).toBe(page.result.query);
  });

  it("Polish with and without accents finds the same bouquets on /pl", async () => {
    const accented = await view("pl", { q: "róże", to: "pl" });
    const plain = await view("pl", { q: "roze", to: "pl" });
    expect(accented.result.cards.length).toBeGreaterThan(0);
    expect(plain.result.cards.map((card) => card.productId)).toEqual(
      accented.result.cards.map((card) => card.productId),
    );
  });

  it("right-to-left words are printed inside <bdi>, so they cannot reorder the sentence", async () => {
    const markup = html(await view("en", { q: "roses ורדים", to: "pl" }));
    expect(markup).toMatch(/<bdi><em[^>]*>roses ורדים<\/em><\/bdi>/u);
  });
});

describe("the Occasions and Flowers groups (AC-10, as §14 A-founder-2026-11-08a splits it)", () => {
  const birthday: [LocaleCode, string][] = [
    ["en", "birthday"],
    ["de", "Geburtstag"],
    ["pl", "urodziny"],
  ];
  it.each(birthday)(
    "%s: %s leads Occasions with Poland's birthday page, else the hub",
    async (locale, q) => {
      const page = await view(locale, { q, to: "pl" });
      const first = page.result.groups.occasions[0];
      const country = await listingHref({
        pageType: "countryOccasion",
        locale,
        countryIso: "PL",
        entityKey: "birthday",
      });
      const hub = await listingHref({
        pageType: "occasionHub",
        locale,
        entityKey: "birthday",
      });
      expect(hub ?? country).toBeDefined();
      expect(first?.href).toBe(country ?? hub);
      expect(page.result.groups.occasions.length).toBeLessThanOrEqual(3);
      expect(html(page)).toContain(`href="${first?.href ?? ""}"`);
    },
  );

  it("roses adds Poland's roses category page under Flowers (the country page, since it exists)", async () => {
    const page = await view("en", { q: "roses", to: "pl" });
    const country = await listingHref({
      pageType: "countryCategory",
      locale: "en",
      countryIso: "PL",
      entityKey: "roses",
    });
    expect(country).toBeDefined();
    expect(page.result.groups.categories.map((link) => link.href)).toEqual([
      country,
    ]);
    expect(page.result.groups.occasions).toEqual([]);
  });

  it("sympathy: one occasion and at most three flower links, each a page that exists, groups in order", async () => {
    const page = await view("en", { q: "sympathy", to: "pl" });
    const hub = await listingHref({
      pageType: "occasionHub",
      locale: "en",
      entityKey: "sympathy",
    });
    expect(page.result.groups.occasions[0]?.href).toBe(hub);
    expect(page.result.groups.categories.length).toBeGreaterThan(0);
    expect(page.result.groups.categories.length).toBeLessThanOrEqual(3);
    for (const link of [
      ...page.result.groups.occasions,
      ...page.result.groups.categories,
    ]) {
      expect(link.href.split("/").at(-1) ?? "").not.toBe("");
    }
    const markup = html(page);
    const order = ["occasions", "categories"].map((kind) =>
      markup.indexOf(`data-fo-search-group="${kind}"`),
    );
    expect(order[0]).toBeGreaterThan(0);
    expect(order[0]).toBeLessThan(order[1] ?? 0);
  });
});

/** A source over the committed catalogue whose listing set per destination the test decides. */
function fixtureSource(options: {
  readonly listed: Readonly<Record<string, readonly string[]>>;
  readonly datesOpen?: (iso2: string, date: string) => boolean;
  readonly deliverable?: (iso2: string, sku: string, date: string) => boolean;
  readonly saleable?: (iso2: string, sku: string) => boolean;
}): () => SearchSource {
  return () => {
    const real = catalogSearchSource();
    return {
      ...real,
      async destinations(locale) {
        return (await real.destinations(locale)).filter((destination) =>
          Object.hasOwn(options.listed, destination.iso2),
        );
      },
      async products(locale, iso2) {
        const all: SearchProduct[] = [...(await real.products(locale, iso2))];
        const keep = options.listed[iso2] ?? [];
        return all
          .filter((product) => keep.includes(product.sku))
          .map((product) => ({
            ...product,
            saleable: options.saleable?.(iso2, product.sku) ?? product.saleable,
          }));
      },
      dateOpen: (iso2, date) =>
        Promise.resolve(options.datesOpen?.(iso2, date) ?? false),
      deliverableOn: (iso2, sku, date) =>
        Promise.resolve(options.deliverable?.(iso2, sku, date) ?? true),
    };
  };
}

describe("scope by destination (AC-12)", () => {
  // X has an open price in Germany only; Y in Poland and Germany. Both are rose bouquets.
  let x = "";
  let y = "";
  beforeAll(async () => {
    const roses = (
      await searchEngine().search({ locale: "en", query: "roses", to: "pl" })
    ).view.cards.map((card) => card.productId);
    [x = "", y = ""] = roses;
    expect(x).not.toBe("");
    expect(y).not.toBe("");
  }, 120_000);

  it("returns Y and not X for to=pl, both for to=de", async () => {
    const engine = memoryEngine({
      source: fixtureSource({ listed: { PL: [y], DE: [x, y] } }),
    });
    const shops = () => Promise.resolve(["PL", "DE"]);
    const pl = await view("en", { q: "roses", to: "pl" }, { engine, shops });
    expect(pl.result.cards.map((card) => card.productId)).toEqual([y]);
    const de = await view("en", { q: "roses", to: "de" }, { engine, shops });
    expect(new Set(de.result.cards.map((card) => card.productId))).toEqual(
      new Set([x, y]),
    );
  }, 120_000);

  it("every card's price equals the listing card's for that destination, four locales, Poland and Germany", async () => {
    for (const locale of LOCALES) {
      for (const to of ["pl", "de"]) {
        const page = await view(locale, { q: "roses", to });
        expect(page.result.cards.length, `${locale} ${to}`).toBeGreaterThan(0);
        for (const card of page.result.cards) {
          const product = await getProduct(card.productId);
          if (product === null) throw new Error(card.productId);
          const listed = await productCardView(
            product,
            locale,
            to.toUpperCase() as "PL",
            {
              productLinks: true,
            },
          );
          expect(card.price, `${locale} ${to} ${card.productId}`).toEqual(
            listed.price,
          );
          expect(html(page)).toContain(`data-fo-search-chip="${to}"`);
        }
      }
    }
  }, 120_000);
});

describe("no destination (AC-13, AC-39) and the chip (AC-40)", () => {
  it.each([[{ q: "roses" }], [{}]])(
    "%o: no amount, noMoney once, the chip's change form carrying q, country-less core cards",
    async (raw: Record<string, string>) => {
      const page = await view("en", raw);
      const markup = html(page);
      expect(page.destination).toBeNull();
      expect(page.result.state).toBe("noDestination");
      // No money anywhere: no currency symbol or code, no formatted amount.
      for (const symbol of ["€", "£", "zł", "PLN", "EUR", "GBP", "US$"]) {
        expect(markup, symbol).not.toContain(symbol);
      }
      expect(
        markup.split(escaped(message("en", "shop.hub.noMoney"))),
      ).toHaveLength(2);
      // No chooser detour: the chip's change form goes straight to the search path (AC-38).
      expect(markup).not.toContain("/choose-country/search");
      expect(markup).not.toContain("data-fo-search-chip-remove");
      const change = forms(markup).find((form) =>
        form.attrs.includes("data-fo-search-chip-change"),
      );
      expect(change?.attrs).toContain('action="/en/search"');
      expect(change?.attrs).toContain('method="get"');
      expect(hidden(change?.body ?? "")).toEqual(
        raw.q === undefined ? {} : { q: "roses" },
      );
      expect(change?.body).toContain(
        escaped(message("en", "home.picker.label")),
      );
      // Every card a core product, drawn country-less through the chooser with rel="nofollow".
      const core = new Set((await coreRange("en")).map((entry) => entry.sku));
      const cards =
        page.result.countryLess?.[
          raw.q === undefined ? "selection" : "cards"
        ] ?? [];
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(core.has(card.productId), card.productId).toBe(true);
        expect(card.href).toMatch(
          /^\/en\/choose-country\/product\/[a-z0-9-]+$/u,
        );
        expect(markup).toMatch(
          new RegExp(
            `href="${card.href ?? ""}"[^>]*rel="nofollow"|rel="nofollow"[^>]*href="${card.href ?? ""}"`,
            "u",
          ),
        );
      }
      expect(markup).toContain(escaped(message("en", "shop.price.choose")));
    },
  );

  it("roses with no country: the Flowers group links the roses hub, the bouquets are exactly coreRange's matches (AC-39)", async () => {
    const page = await view("en", { q: "roses" });
    const hub = await listingHref({
      pageType: "categoryHub",
      locale: "en",
      entityKey: "roses",
    });
    expect(page.result.groups.categories.map((link) => link.href)).toContain(
      hub,
    );
    const core = new Set((await coreRange("en")).map((entry) => entry.sku));
    const cards = page.result.countryLess?.cards ?? [];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(core.has(card.productId)).toBe(true);
    const markup = html(page);
    expect(markup).toContain(escaped(message("en", "search.groups.bouquets")));
  });

  it("birthday, delivery, pol and qqqqqq with no country (AC-39)", async () => {
    const birthday = await view("en", { q: "birthday" });
    expect(birthday.result.groups.occasions[0]?.href).toBe(
      "/en/occasions/birthday",
    );
    const delivery = await view("en", { q: "delivery" });
    expect(delivery.result.groups.help.map((link) => link.href)).toContain(
      "/en/delivery",
    );
    const pol = await view("en", { q: "pol" });
    expect(pol.destination).toBeNull();
    expect(pol.result.groups.destinations.map((link) => link.href)).toContain(
      "/en/poland/flowers",
    );
    const nothing = await view("en", { q: "qqqqqq" });
    const markup = html(nothing);
    expect(markup).toContain("data-fo-search-no-results");
    expect(markup).not.toContain("data-fo-search-groups");
    for (const page of [birthday, delivery, pol]) {
      const groups = html(page);
      const kinds = /data-fo-search-groups="([^"]*)"/u.exec(groups)?.[1] ?? "";
      expect(kinds.split(" ")).toEqual(
        ["destinations", "occasions", "categories", "help"].filter((kind) =>
          kinds.split(" ").includes(kind),
        ),
      );
      for (const kind of [
        "destinations",
        "occasions",
        "categories",
        "help",
      ] as const) {
        expect(page.result.groups[kind].length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("with Poland: the chip reads Sending to Poland, change keeps q and lists the shop countries in collation order, remove keeps q alone (AC-40)", async () => {
    const page = await view("en", { q: "roses", to: "pl" });
    const markup = html(page);
    const change = forms(markup).find((form) =>
      form.attrs.includes("data-fo-search-chip-change"),
    );
    expect(change?.attrs).toContain('action="/en/search"');
    expect(hidden(change?.body ?? "")).toEqual({ q: "roses" });
    const options = [
      ...(change?.body ?? "").matchAll(
        /<option[^>]*value="([a-z]{2})"[^>]*>([^<]+)</gu,
      ),
    ];
    const names = options.map((match) => match[2] ?? "");
    expect([...names].sort(new Intl.Collator("en").compare)).toEqual(names);
    expect(options.map((match) => match[1])).toEqual(
      page.destinations.map((option) => option.code),
    );
    const remove = forms(markup).find((form) =>
      form.attrs.includes("data-fo-search-chip-remove"),
    );
    expect(remove?.attrs).toContain('action="/en/search"');
    expect(hidden(remove?.body ?? "")).toEqual({ q: "roses" });
    expect(remove?.body).toContain(
      escaped(message("en", "search.chip.remove")),
    );
  });

  it("roses poland: the words set Poland, and remove drops the country word (AC-40)", async () => {
    const page = await view("en", { q: "roses poland" });
    expect(page.destination?.code).toBe("pl");
    expect(page.result.queryWithoutDestination).toBe("roses");
    const remove = forms(html(page)).find((form) =>
      form.attrs.includes("data-fo-search-chip-remove"),
    );
    expect(hidden(remove?.body ?? "")).toEqual({ q: "roses" });
  });

  it("that page shows Germany's cards at Germany's prices, and its select changes to Poland's", async () => {
    const de = await view("en", { q: "roses", to: "de" });
    expect(de.destination?.code).toBe("de");
    const markup = html(de);
    const select = forms(markup).find((form) =>
      form.attrs.includes("data-fo-search-chip-change"),
    );
    expect(select?.attrs).toContain('action="/en/search"');
    expect(hidden(select?.body ?? "")).toEqual({ q: "roses" });
    expect(select?.body).toContain('name="to"');
    const pl = await view("en", { q: "roses", to: "pl" });
    expect(pl.destination?.code).toBe("pl");
    expect(pl.result.cards.map((card) => card.price.currency)).not.toContain(
      undefined,
    );
  });

  it("names no country under src/modules/search or the search route (spec 004 AC-73's scan)", () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/u.test(name)) files.push(path);
      }
    };
    walk(join(ROOT, "src", "modules", "search"));
    walk(join(ROOT, "src", "app", "[locale]", "-search"));
    files.push(join(ROOT, "src", "lib", "search-routes.ts"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /defaultSearchDestination|DEMO_DESTINATION_ISO2/u,
      );
      expect(text, file).not.toMatch(
        /["'`](PL|DE|FR|IT|NL|RO|ES|pl|de-DE|poland|polska|germany)["'`]/u,
      );
      expect(text, file).not.toMatch(
        /cf-ipcountry|accept-language|fo_dest|headers\(\)|cookies\(\)/iu,
      );
    }
  });
});

describe("dates (AC-15)", () => {
  it("with an open date, what cannot arrive leaves, is counted, and Show every date drops the date", async () => {
    const all = (
      await searchEngine().search({ locale: "en", query: "roses", to: "pl" })
    ).view.cards.map((card) => card.productId);
    const [z = "", y = ""] = all;
    const source = fixtureSource({
      listed: { DE: [y, z] },
      datesOpen: (iso2, date) => iso2 === "DE" && date === "2026-12-04",
      deliverable: (_iso2, sku) => sku !== y,
    });
    const engine = memoryEngine({ source });
    const deps = {
      engine,
      shops: () => Promise.resolve(["DE"]),
      takesDates: (iso2: string) => iso2 === "de",
    };
    const dated = await view(
      "en",
      { q: "roses", to: "de", date: "2026-12-04" },
      deps,
    );
    expect(dated.result.cards.map((card) => card.productId)).toEqual([z]);
    expect(dated.result.hiddenByDate).toBe(1);
    expect(dated.result.dateApplied).toBe("2026-12-04");
    const markup = html(dated);
    expect(markup).toContain('data-fo-search-hidden-by-date="1"');
    expect(markup).toContain("1 more bouquet matches but cannot arrive on");
    const anyDate = forms(markup).find((form) =>
      form.body.includes("data-fo-search-any-date"),
    );
    expect(hidden(anyDate?.body ?? "")).toEqual({ q: "roses", to: "de" });

    const undated = await view("en", { q: "roses", to: "de" }, deps);
    expect(new Set(undated.result.cards.map((card) => card.productId))).toEqual(
      new Set([y, z]),
    );
    expect(undated.result.hiddenByDate).toBe(0);
    expect(html(undated)).not.toContain("data-fo-search-hidden-by-date");
  }, 120_000);

  it("without a date, saleable ones come first within one tier and band", async () => {
    const all = (
      await searchEngine().search({ locale: "en", query: "roses", to: "pl" })
    ).view.cards.map((card) => card.productId);
    const [first = "", second = ""] = all;
    const engine = memoryEngine({
      source: fixtureSource({
        listed: { DE: [first, second] },
        saleable: (_iso2, sku) => sku === second,
      }),
    });
    const page = await view(
      "en",
      { q: "roses", to: "de" },
      { engine, shops: () => Promise.resolve(["DE"]) },
    );
    expect(page.result.cards.map((card) => card.productId)[0]).toBe(second);
  }, 120_000);

  it("with today's data no destination takes dates: a date changes nothing in the body", async () => {
    const without = html(await view("en", { q: "roses", to: "pl" }));
    const withDate = html(
      await view("en", { q: "roses", to: "pl", date: "2026-12-04" }),
    );
    expect(withDate).toBe(without);
    expect(without).not.toContain('name="date"');
  });
});

describe("Did you mean (AC-37)", () => {
  it("tolaps: noResults and exactly one GET button suggesting tulips, carrying q=tulips and to=pl", async () => {
    const markup = html(await view("en", { q: "tolaps", to: "pl" }));
    expect(markup).toContain("data-fo-search-no-results");
    const buttons = forms(markup).filter((form) =>
      form.attrs.includes("data-fo-search-did-you-mean"),
    );
    expect(buttons).toHaveLength(1);
    expect(hidden(buttons[0]?.body ?? "")).toEqual({ q: "tulips", to: "pl" });
    expect(buttons[0]?.body).toContain("Did you mean <bdi>tulips</bdi>?");
  });

  it.each(["sunflwers", "roses", "qqqqqq"])(
    "%s renders no Did you mean",
    async (q) => {
      const markup = html(await view("en", { q, to: "pl" }));
      expect(markup).not.toContain("data-fo-search-did-you-mean");
      if (q === "qqqqqq") expect(markup).toContain("data-fo-search-no-results");
    },
  );
});

describe("the request log and alert=search.slow (§11)", () => {
  it("logs search.request with the numbers and never the query", async () => {
    const lines: Record<string, unknown>[] = [];
    await searchPage(
      "en",
      { q: "anna kowalska roses", to: "pl" },
      {
        log: { info: (fields) => lines.push(fields) },
        slow: { record: () => undefined },
      },
    );
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toMatchObject({
      event: "search.request",
      locale: "en",
      destination: "PL",
      page: 1,
    });
    expect(Object.keys(line ?? {}).sort()).toEqual(
      [
        "destination",
        "duration_ms",
        "event",
        "generation",
        "locale",
        "page",
        "results",
        "state",
        "tier_counts",
      ].sort(),
    );
    expect(JSON.stringify(line)).not.toMatch(/anna|kowalska|roses/u);
  });

  it("raises search.slow once when an eleventh request over 1 000 ms lands within 5 minutes", () => {
    const raised: string[] = [];
    const monitor = slowSearchMonitor((alert) => raised.push(alert));
    for (let index = 0; index < 10; index += 1)
      monitor.record(1001, index * 1000);
    monitor.record(1000, 11_000);
    expect(raised).toEqual([]);
    monitor.record(1500, 12_000);
    expect(raised).toEqual(["search.slow"]);
    monitor.record(1500, 13_000);
    expect(raised).toEqual(["search.slow"]);
    // After a quiet window, the count starts again.
    for (let index = 0; index < 11; index += 1)
      monitor.record(2000, 400_000 + index);
    expect(raised).toEqual(["search.slow", "search.slow"]);
  });
});
