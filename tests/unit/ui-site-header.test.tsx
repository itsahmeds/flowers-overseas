/**
 * `SiteHeader`'s contracts (spec 004 §5.3, AC-7, AC-8, AC-14; TASK-048), rendered with
 * `react-dom/server` against the **real** `messages/*.json` through the same provider the
 * document layout uses — the pattern `tests/unit/i18n-suggestion-banner.test.tsx` established, so
 * the asserted copy is the shipped copy and the `{count}`/`{currency}` arguments are exercised
 * rather than assumed.
 *
 * What is here and not in `tests/e2e/header.spec.ts`: every property that is a fact about the
 * markup — the currency projection, AC-14 as spec 004 §14 A20 amends it in **both** directions
 * (every target with a page is a link to it; every target without one has **no element at all**,
 * not text that looks like a control; TASK-173), the reserved-height numbers, logical CSS and no
 * raw colour. Layout, stickiness, the pre/post-hydration box, CLS and the four locales in a
 * browser are the e2e file's.
 *
 * The category row's URLs come from the catalogue exactly as the document layout gets them:
 * `headerListingTargets()` asked of `listingAlternatePaths()` (`listingHrefsFor()` below), so the
 * unit render and the served header resolve the same pages.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { CATEGORIES } from "../../src/config/categories.ts";
import { COMPANY } from "../../src/config/company.ts";
import {
  CATEGORY_ROW_ENTRY_LINKS,
  CATEGORY_ROW_LINK_IDS,
  MASTHEAD_LINK_IDS,
  SEARCH_LINK_ID,
  SITE_LINKS,
  type SiteLinkId,
  categoryRowLinkId,
  isPublished,
  linkLabelKey,
  siteLink,
} from "../../src/config/site-links.ts";
import { listingAlternatePaths } from "../../src/modules/catalog";
import { loadMessages, localePath } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  HEADER_BAND_HEIGHTS,
  HEADER_STICKY_HEIGHTS,
  SEND_ANCHOR,
  type HeaderListingHrefs,
  headerAccountItems,
  headerCategoryItems,
  headerCurrencyCode,
  headerEndClusterItems,
  headerListingTargets,
  headerSearchHref,
  headerSendHref,
} from "../../src/modules/ui/layout/header-model.ts";
import { SiteFooter } from "../../src/modules/ui/layout/SiteFooter.tsx";
import { dayCountIn } from "../support/day-count.ts";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** Every site-link id the header draws, typed so `siteLink()` needs no cast. */
const headerLinkIds: readonly SiteLinkId[] = [
  ...MASTHEAD_LINK_IDS,
  ...CATEGORY_ROW_LINK_IDS,
  SEARCH_LINK_ID,
];

/** The layout's `headerListingHrefs()`, restated: the catalogue's answer per header target. */
async function listingHrefsFor(
  locale: (typeof LOCALES)[number],
): Promise<HeaderListingHrefs> {
  const entries = await Promise.all(
    headerListingTargets().map(
      async ({ id, identity }) =>
        [
          id,
          (await listingAlternatePaths({ ...identity, locale }))[locale],
        ] as const,
    ),
  );
  return Object.fromEntries(entries.filter(([, path]) => path !== undefined));
}

/** Each launch locale's resolved listing URLs, computed once for the whole file. */
const HREFS: Record<string, HeaderListingHrefs> = Object.fromEntries(
  await Promise.all(
    LOCALES.map(
      async (locale) => [locale, await listingHrefsFor(locale)] as const,
    ),
  ),
);

function render(
  locale: string,
  listingHrefs: HeaderListingHrefs = HREFS[locale] ?? {},
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["nav", "company", "a11y", "common"])}
      timeZone="UTC"
    >
      <SiteHeader locale={locale} listingHrefs={listingHrefs} />
    </NextIntlClientProvider>,
  );
}

/** The footer, with every namespace it reads (`MESSAGE_NAMESPACES`), for the N-day sweep. */
function renderFooter(locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      <SiteFooter locale={locale} />
    </NextIntlClientProvider>,
  );
}

/** Markup to the text a reader sees: tags out, entities for the spaces back. */
function textOf(markup: string): string {
  return markup
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#x27;", "'");
}

/** The exact de/pl price claims (carry-forward a). */
const EXACT_CLAIM = {
  de: "Preise inkl. MwSt. und Versand",
  pl: "Ceny zawierają dostawę i VAT",
} as const;

/**
 * The header without its phone Menu (spec 004 §14 A24 clause 3; TASK-195): the strip, the row and
 * the pill that draw the chrome from `md` up. The Menu repeats their links below `md`, and
 * `tests/unit/ui-phone-chrome.test.tsx` asserts it on its own.
 */
function withoutMenu(html: string): string {
  const out = html.replace(/<details[^>]*data-fo-menu[\s\S]*?<\/details>/u, "");
  if (out === html) throw new Error("the header drew no Menu");
  return out;
}

/** The opening tag of every element carrying `data-fo-header-item`, with its id. */
function headerItems(html: string): { id: string; tag: string }[] {
  return [
    ...html.matchAll(/<(\w+)\s[^>]*data-fo-header-item="([^"]*)"[^>]*>/g),
  ].map((match) => ({ id: match[2] ?? "", tag: match[0] }));
}

/**
 * The exact header the founder's ruling draws, per locale (spec 008 §14 A14): the category row's
 * eight entries with a page, each to its own page, in the canvas's order. Restated as data rather
 * than derived, so a target that silently stops resolving is a diff here.
 */
const EXPECTED_ROW: Record<string, readonly (readonly [string, string])[]> = {
  en: [
    ["our-selection", "/en/poland/flowers"],
    ["birthday", "/en/occasions/birthday"],
    ["sympathy", "/en/occasions/sympathy"],
    ["occasions", "/en/occasions"],
    ["bouquets", "/en/flowers/hand-tied-bouquets"],
    ["roses", "/en/flowers/roses"],
    ["plants", "/en/flowers/plants"],
    ["destinations", "/en/send-flowers-to"],
  ],
  "en-gb": [
    ["our-selection", "/en-gb/poland/flowers"],
    ["birthday", "/en-gb/occasions/birthday"],
    ["sympathy", "/en-gb/occasions/sympathy"],
    ["occasions", "/en-gb/occasions"],
    ["bouquets", "/en-gb/flowers/hand-tied-bouquets"],
    ["roses", "/en-gb/flowers/roses"],
    ["plants", "/en-gb/flowers/plants"],
    ["destinations", "/en-gb/send-flowers-to"],
  ],
  de: [
    ["our-selection", "/de/polen/blumen"],
    ["birthday", "/de/anlaesse/geburtstag"],
    ["sympathy", "/de/anlaesse/trauer"],
    ["occasions", "/de/anlaesse"],
    ["bouquets", "/de/blumen/blumenstraeusse"],
    ["roses", "/de/blumen/rosen"],
    ["plants", "/de/blumen/pflanzen"],
    ["destinations", "/de/blumen-verschicken"],
  ],
  pl: [
    ["our-selection", "/pl/polska/kwiaty"],
    ["birthday", "/pl/okazje/urodziny"],
    ["sympathy", "/pl/okazje/kondolencje"],
    ["occasions", "/pl/okazje"],
    ["bouquets", "/pl/kwiaty/bukiety"],
    ["roses", "/pl/kwiaty/roze"],
    ["plants", "/pl/kwiaty/rosliny"],
    ["destinations", "/pl/wyslij-kwiaty"],
  ],
};

/** Every header link id that has no page today, so the header may draw nothing for it. */
const UNPUBLISHED_HEADER_IDS: readonly SiteLinkId[] = SITE_LINKS.filter(
  (link) => link.surfaces.includes("header") && !isPublished(link.id),
).map((link) => link.id);

/**
 * The whole opening tag that surrounds `index` — the element an attribute belongs to, so an
 * assertion about "the strip" or "the banner" reads that element's own class list rather than the
 * document's.
 */
function tagAt(html: string, index: number): string {
  const start = html.lastIndexOf("<", index);
  return html.slice(start, html.indexOf(">", index) + 1);
}

/** Every `href` in the rendered header, in document order. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

describe("headerCurrencyCode (AC-8)", () => {
  it("prints the locale's default currency, from the registry and nothing else", () => {
    expect(LOCALES.map(headerCurrencyCode)).toEqual([
      "EUR",
      "GBP",
      "EUR",
      "PLN",
    ]);
  });

  it("falls back to the x-default locale rather than throwing on an unknown code", () => {
    // A header is not the place to fail a document: `routableLocale()` has already refused the
    // code at the routing layer (spec 003 AC-8), so this is the defensive second line.
    expect(headerCurrencyCode("zz")).toBe("EUR");
  });
});

describe("the header's registry projections (AC-14, spec 004 §14 A20)", () => {
  it("projects the category row entries that have a page, each to its page, in the canvas's order", () => {
    for (const locale of LOCALES) {
      expect(
        headerCategoryItems(locale, HREFS[locale]).map((item) => [
          item.id,
          item.href,
        ]),
        locale,
      ).toEqual(EXPECTED_ROW[locale]);
    }
    const items = headerCategoryItems("en", HREFS.en);
    // "Same-day delivery" is gated on `anyDeliveryDatesOpen()` (spec 004 §14 A19; TASK-120) and
    // has no page either; "Add-ons" has no page. Neither is an item at all.
    expect(items.map((item) => item.id)).not.toContain("same-day-delivery");
    expect(items.map((item) => item.id)).not.toContain("add-ons");
    // The one accented entry is the gated one, so nothing in the rendered row is accented today.
    expect(items.filter((item) => item.accent)).toHaveLength(0);
  });

  it("drops a published entry whose page does not exist in this locale", () => {
    // The layout hands over only the pages the catalogue says exist. Withhold one — as `/de`
    // would be withheld a hub that has no German slug — and the entry is gone, not text.
    const withoutRoses = Object.fromEntries(
      Object.entries(HREFS.de ?? {}).filter(
        ([id]) => id !== "category-row-roses",
      ),
    );
    const ids = headerCategoryItems("de", withoutRoses).map((item) => item.id);
    expect(ids).not.toContain("roses");
    expect(ids).toContain("bouquets");
    // And with no catalogue answer at all, only the `route` entry is left.
    expect(headerCategoryItems("de").map((item) => item.id)).toEqual([
      "destinations",
    ]);
  });

  it("asks the layout about exactly the published listing pages of the category row", () => {
    expect(headerListingTargets().map((target) => target.id)).toEqual(
      CATEGORY_ROW_ENTRY_LINKS.filter(
        (link) => isPublished(link.id) && link.target.kind === "listingPage",
      ).map((link) => link.id),
    );
    // Every one exists in every launch locale today: a target that stopped resolving would
    // silently leave the row, so the set is pinned.
    for (const locale of LOCALES) {
      expect(Object.keys(HREFS[locale] ?? {}).sort(), locale).toEqual(
        headerListingTargets()
          .map((target) => target.id)
          .sort(),
      );
    }
  });

  it("projects no account item, no end-cluster item and no search while none has a page", () => {
    for (const locale of LOCALES) {
      expect(headerAccountItems(locale), locale).toEqual([]);
      expect(headerEndClusterItems(locale), locale).toEqual([]);
      expect(headerSearchHref(locale), locale).toBeUndefined();
    }
  });
});

/**
 * AC-14's *other* direction: flipping a registry flag turns an absent entry into navigation **with
 * no template edit**. The committed registry publishes no account or for-florists page, so the
 * flag is flipped in a mocked module, and the assertion is on the URL the header would emit.
 */
describe("a published registry entry becomes a link with no template edit (AC-14)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../../src/config/site-links.ts");
    vi.resetModules();
  });

  it("resolves a published site link through `localePath` and never through a template", async () => {
    const actual = await vi.importActual<
      typeof import("../../src/config/site-links.ts")
    >("../../src/config/site-links.ts");
    vi.doMock("../../src/config/site-links.ts", () => ({
      ...actual,
      isPublished: (id: SiteLinkId) =>
        id === "for-florists" || actual.isPublished(id),
    }));
    const model = await import("../../src/modules/ui/layout/header-model.ts");

    expect(model.headerEndClusterItems("pl").map((item) => item.href)).toEqual([
      localePath("pl", "forFlorists"),
    ]);
    expect(headerEndClusterItems("pl")).toEqual([]);
  });
});

describe("the rendered header (AC-7, AC-14)", () => {
  it("is a `banner` landmark with a named category `navigation` and no `search` landmark", () => {
    const html = render("en");
    expect(html).toContain("<header");
    expect(html).toContain('aria-label="Categories"');
    // There is no search control in Phase 0, so there is no `search` landmark to name either
    // (§14 A4): a landmark that contains no control is a promise the header cannot keep.
    expect(html).not.toContain('role="search"');
  });

  it("links the lockup to the locale home, in every locale", () => {
    for (const locale of LOCALES) {
      expect(hrefs(render(locale))).toContain(localePath(locale, "home"));
    }
  });

  it("links every category row entry with a page, and draws no element for any target without one", () => {
    for (const locale of LOCALES) {
      const html = withoutMenu(render(locale));
      const internal = hrefs(html).filter((href) => href.startsWith("/"));
      const external = hrefs(html).filter((href) => !href.startsWith("/"));

      // Internal: the lockup, the Send pill, the switcher's three sibling locales and the
      // category row — and nothing else: no account item, no `For florists`, no search (AC-14,
      // §14 A20).
      expect(internal.toSorted(), locale).toEqual(
        [
          localePath(locale, "home"),
          `${localePath(locale, "home")}#${SEND_ANCHOR}`,
          ...LOCALES.filter((other) => other !== locale).map((other) =>
            localePath(other, "home"),
          ),
          ...(EXPECTED_ROW[locale] ?? []).map(([, href]) => href),
        ].toSorted(),
      );
      // External: the help line, dialled from the one E.164 number in `company.ts` (the v2
      // artboards draw the `tel:` link only).
      expect(external).toEqual([`tel:${COMPANY.contact.phoneE164}`]);

      // Every keyed item is an `<a>` to its page — not one `<span>` dressed as an entry.
      const items = headerItems(html);
      expect(
        items.map(({ id }) => id),
        locale,
      ).toEqual((EXPECTED_ROW[locale] ?? []).map(([id]) => id));
      for (const { id, tag } of items) {
        expect(tag, `${locale}/${id}`).toMatch(/^<a\s/);
      }
    }
  });

  it("draws nothing — no link, no text, no label — for a header target with no page", () => {
    const en = loadMessages("en", ["nav"]) as {
      nav: Record<string, unknown>;
    };
    const unpublishedCategories = CATEGORIES.filter(
      (category) => !isPublished(categoryRowLinkId(category.id)),
    );
    expect(unpublishedCategories.map((category) => category.id)).toEqual([
      "add-ons",
      "same-day-delivery",
    ]);
    expect(UNPUBLISHED_HEADER_IDS).toEqual(
      expect.arrayContaining([
        "search",
        "sign-in",
        "my-orders",
        "basket",
        "for-florists",
      ]),
    );
    for (const locale of LOCALES) {
      const html = render(locale);
      for (const id of UNPUBLISHED_HEADER_IDS) {
        expect(html, `${locale}/${id}`).not.toContain(
          `data-fo-header-item="${id}"`,
        );
      }
      for (const category of unpublishedCategories) {
        expect(html, `${locale}/${category.id}`).not.toContain(
          `data-fo-header-item="${category.id}"`,
        );
      }
    }
    // The words the founder read as dead controls are not in the document at all.
    const html = render("en");
    const account = en.nav.account as Record<string, string>;
    const category = en.nav.category as Record<string, string>;
    const search = en.nav.search as Record<string, string>;
    for (const word of [
      account.signIn,
      account.orders,
      "Basket (",
      en.nav.forFlorists as string,
      category.addOns,
      search.label,
      search.help,
    ]) {
      expect(word, "a message the check reads").toBeTruthy();
      expect(html, String(word)).not.toContain(String(word));
    }
  });

  it("prints the currency chip as text with a localised `aria-label` (AC-8)", () => {
    for (const locale of LOCALES) {
      const html = render(locale);
      const currency = headerCurrencyCode(locale);
      expect(html).toContain("data-fo-header-currency");
      expect(html).toContain(`aria-label="Prices shown in ${currency}"`);
      expect(html).toContain(`>${currency}<`);
    }
  });

  it("draws no search band and no glyph that opens nothing: nothing that looks like a control and is not (§14 A20)", () => {
    const html = render("en");
    // No search band while search has no page — not even the text shaped like a field that §14
    // A4 drew — and no form control of any kind.
    expect(html).not.toContain("data-fo-header-search");
    for (const control of [
      "<form",
      "<input",
      "<button",
      "<select",
      "<textarea",
      "placeholder=",
      "<label",
      'role="search"',
    ]) {
      expect(html, control).not.toContain(control);
    }
    // No dead menu glyph (`/review 31`, §14 A20). The phone's Menu is a native `<details>` that
    // opens a real panel (A24 clause 3 lifts A20's omission), never a `<button>` or a labelled icon.
    expect(html).not.toContain("data-fo-header-menu");
    expect(html).not.toContain('aria-label="Menu"');
    expect([...html.matchAll(/<details\b/g)]).toHaveLength(1);
  });

  it("hosts spec 003's `LocaleSwitcher` unchanged: four entries, the current one not a link", () => {
    const html = withoutMenu(render("de"));
    expect(html).toContain("data-fo-header-switcher");
    expect(html).toContain('aria-current="page"');
    expect([...html.matchAll(/<li>/g)]).toHaveLength(4);
  });

  it("puts the switcher and the currency in the notice bar, not in the banner (§14 A4)", () => {
    const html = render("en");
    const strip = html.slice(
      html.indexOf('data-fo-header-band="utility"'),
      html.indexOf("data-fo-header="),
    );
    expect(strip).toContain("data-fo-header-switcher");
    expect(strip).toContain("data-fo-header-currency");
    const banner = html.slice(html.indexOf("data-fo-header="));
    expect(banner).not.toContain("data-fo-header-switcher");
    expect(banner).not.toContain("data-fo-header-currency");
    expect(banner).toContain('data-fo-header-item="roses"');
  });

  it("draws no strip below `md`, and keeps the switcher and the currency as a second notice row from `md` to `lg` (§14 A4, A24 clause 3)", () => {
    const html = render("en");
    // Below `md` the strip is `display: none`: the Menu carries the languages, the currency and
    // the help line there (spec 004 §14 A24 clause 3, AC-47; TASK-195) …
    const stripTag = tagAt(html, html.indexOf("data-fo-utility"));
    expect(stripTag).toMatch(/class="[^"]*\bmax-md:hidden\b/u);
    const bar = tagAt(html, html.indexOf("data-fo-notice-bar"));
    // … and from `md` to `lg` the primitive's hidden utilities slot is shown as its own centred,
    // wrapping row (coordinator ruling 2026-10-04: A4 binds over the mobile artboard) …
    expect(bar).toContain("max-lg:[&amp;&gt;div&gt;div]:flex");
    expect(bar).toContain("max-lg:[&amp;&gt;div]:flex-col");
    expect(bar).not.toContain("max-lg:[&amp;&gt;div&gt;div]:hidden");
    // … and only the help line steps out of it there (the footer carries the number).
    const tel = html.indexOf(`href="tel:${COMPANY.contact.phoneE164}"`);
    expect(tagAt(html, html.lastIndexOf("<span", tel))).toContain(
      "max-lg:hidden",
    );
    const switcher = html.indexOf("data-fo-header-switcher");
    expect(tagAt(html, switcher)).not.toContain("hidden");
    expect(tagAt(html, html.indexOf("data-fo-header-currency"))).not.toContain(
      "hidden",
    );
  });

  it("styles the switcher from the wrapper, `src/modules/i18n` untouched", () => {
    const html = render("en");
    const wrapper = html.slice(html.indexOf("data-fo-header-switcher"));
    // The row, the bold current entry and the small "Beta" come from the wrapper (`&` arrives
    // HTML-escaped); the 44 px target from `NoticeBar`'s utilities slot.
    expect(html).toContain("[&amp;_ul]:flex");
    expect(html).toContain("[&amp;_[aria-current]]:font-bold");
    expect(html).toContain("[&amp;_a]:min-h-(--target-min)");
    // Spec 003 still renders its own markup (AC-7, spec 003 AC-3).
    expect(wrapper).toContain('class="underline"');
    expect(wrapper).toContain('<nav aria-label="Change language">');
  });

  it("draws one category list in one order for both artboards, with no `order` utility", () => {
    const html = render("en");
    // The v2 mobile artboard draws the same eight links in the desktop order (a scrolling chip
    // row), so there is one DOM list and no per-breakpoint re-ordering.
    expect(html).not.toMatch(/\border-\d+\b/u);
    expect([...html.matchAll(/data-fo-header-item=/g)]).toHaveLength(8);
    // Tailwind's arbitrary `min-[…]:` variant compiles this project's stylesheet down to its base
    // layer with no error raised (measured twice on a clean `.next`). Named breakpoints only.
    expect(html).not.toMatch(/min-\[\d+px\]:/);
  });

  it("links the Send pill to the home's sentence, and draws it as the one pill", () => {
    for (const locale of LOCALES) {
      const html = withoutMenu(render(locale));
      expect(headerSendHref(locale)).toBe(`${localePath(locale, "home")}#send`);
      const send = [...html.matchAll(/<a\s[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => tag.includes(`href="${headerSendHref(locale)}"`));
      expect(send, locale).toHaveLength(1);
      expect(send[0], locale).toContain("rounded-full");
    }
    expect(render("en")).toContain(">Send flowers<");
  });

  it("sets the logo as the mark and the outlined wordmark, named by the trading name (A21 clause 3)", () => {
    const html = render("en");
    const logo = html.slice(
      html.indexOf("data-fo-header-logo"),
      html.indexOf("</a>", html.indexOf("data-fo-header-logo")),
    );
    expect(logo).toContain("data-fo-wordmark");
    expect(logo).toContain(`role="img" aria-label="${COMPANY.tradingName}"`);
    // No live-type wordmark: the letters are paths, so no Newsreader file loads.
    expect(html).not.toContain(`>${COMPANY.tradingName}<`);
  });

  it('prints the honest notice: "A note from us:", the price claim and "Fresh-flower promise", and no dates line', () => {
    const html = render("en");
    const strip = html.slice(0, html.indexOf("data-fo-header="));
    expect(strip).toContain("<strong>A note from us:</strong>");
    // Spec 004 §14 A23 clause 12 (TASK-193): the dates-pending line is gone with nothing in its
    // place, so the claims open at the price claim and, below `md`, the sentence row is empty.
    expect(strip).not.toContain("first florist");
    expect(strip).not.toContain("Delivery dates");
    // The claims open at the price claim, whose leading `·` the claims span hides.
    const claims = strip.slice(strip.indexOf("data-fo-notice-claims"));
    expect(claims.slice(claims.indexOf(">") + 1)).toMatch(
      /^<span data-fo-price-claim="true"> <span aria-hidden="true" class="opacity-45" data-fo-sep="true">·<\/span> Prices include delivery and VAT<\/span>/u,
    );
    expect(strip).toContain("Prices include delivery and VAT");
    expect(strip).toContain("Fresh-flower promise");
    // Founder, 2026-10-04: "cant promise staying fresh" — no N-day freshness promise at all.
    expect(html).not.toMatch(/\d+-day/u);
    expect(html).not.toContain("Order by 14:00");
  });

  /**
   * The price claim says, in each locale's own words, that the price **includes** VAT and
   * delivery (spec 004 §14 A21; PR 172 breaker hole H1). The de/pl strings are drafts
   * (`reviewed: false`), so the case pins their meaning, not their wording: the VAT and delivery
   * tokens, an inclusion word, and none of the words that would turn it into "plus" or "excludes".
   * The German formula is spec 005's `catalog.price.inclusive` ("inkl. MwSt. und Versand").
   */
  const CLAIM_MEANING: Record<
    (typeof LOCALES)[number],
    { must: readonly RegExp[]; mustNot: RegExp }
  > = {
    en: {
      must: [/\bVAT\b/u, /\bdelivery\b/iu, /\binclude/iu],
      mustNot: /\b(?:exclud|not include|plus|excl)/iu,
    },
    "en-gb": {
      must: [/\bVAT\b/u, /\bdelivery\b/iu, /\binclude/iu],
      mustNot: /\b(?:exclud|not include|plus|excl)/iu,
    },
    de: {
      must: [/MwSt\./u, /Versand/u, /\b(?:inkl\.|einschließlich|enthalten)/iu],
      mustNot: /\b(?:zzgl\.|zuzüglich|exkl\.|ohne)/iu,
    },
    pl: {
      must: [/\bVAT\b/u, /dostaw/iu, /(?:zawierają|w tym|wliczon)/iu],
      mustNot: /(?:nie zawierają|nie obejmują|bez |plus)/iu,
    },
  };

  for (const locale of LOCALES) {
    it(`${locale}: the price claim says the price includes VAT and delivery, in ${locale}`, () => {
      const messages = loadMessages(locale, ["nav"]) as {
        nav: { utility: Record<string, string> };
      };
      const claim = messages.nav.utility.pricesInclude ?? "";
      const { must, mustNot } = CLAIM_MEANING[locale];
      for (const pattern of must)
        expect(claim, String(pattern)).toMatch(pattern);
      expect(claim).not.toMatch(mustNot);
      // The de/pl catalogues carry their own sentence, not the English one, and exactly the one
      // that says both are included (PR 172 breaker round 2, accepted carry-forward a): a claim
      // that adds "Versand wird extra berechnet" or "dostawa płatna osobno" keeps every stem the
      // patterns above look for, so the sentence itself is pinned.
      if (locale === "de" || locale === "pl") {
        expect(claim).not.toBe("Prices include delivery and VAT");
        expect(claim).toBe(EXACT_CLAIM[locale]);
      }
      expect(render(locale)).toContain(claim);
    });

    it(`${locale}: no N-day freshness promise anywhere in the chrome, and none in the guarantee's name`, () => {
      // Founder, 2026-10-04: "cant promise staying fresh" (PR 172 breaker hole H3): a number of
      // days beside the guarantee, in any of the four languages.
      const messages = loadMessages(locale, ["nav"]) as {
        nav: { utility: Record<string, string> };
      };
      const guarantee = messages.nav.utility.guarantee ?? "";
      expect(guarantee).not.toBe("");
      expect(guarantee).not.toMatch(/\d/u);
      const html = render(locale);
      expect(html).toContain(guarantee);
      // The rendered header and footer, as text (carry-forward b: the footer too).
      for (const [part, markup] of [
        ["header", html],
        ["footer", renderFooter(locale)],
      ] as const) {
        expect(dayCountIn(textOf(markup)), `${locale} ${part}`).toBeUndefined();
      }
    });
  }

  it("the day-count matcher catches every form the breakers found, and allows exactly 24/7", () => {
    for (const phrase of [
      "Unsere 7-tägige Frische-Garantie:",
      "Mit Liebe und 7 Tage Frische.",
      "7 days fresh",
      "7-day freshness guarantee",
      "Świeżość przez 7 dni",
      "7-dniowa gwarancja",
      "7 dzień",
      "7\u00a0Tage",
      // PR 174 breaker H4.
      "Fresh for 7 full days",
      "7 Kalendertage frisch",
      "sieben Tage Frische",
      "tydzień świeżości",
      "fresh for a week",
      "seven days of freshness",
      "siedem dni świeżości",
      // PR 174 breaker round 2, hole 3.
      "Unsere siebentägigen Frische-Garantie",
      "Siedmiodniowa gwarancja świeżości",
      "fresh for a fortnight",
      "Vierzehn Tage frisch",
      "fresh for fourteen days",
      "Świeże przez 7 dób",
      "a 14-day promise",
      "14-dniowa gwarancja",
    ]) {
      expect(dayCountIn(phrase), phrase).toBeDefined();
    }
    for (const phrase of [
      "Message us any time, 24/7 — we reply within a few hours.",
      "Schreiben Sie uns rund um die Uhr, 24/7.",
      "Order by 14:00 in Warsaw",
      "send us a photo within 72 hours of delivery",
      // The slash guard: without it, the "7" after "24/" would start "7 days".
      "We answer 24/7 days and nights.",
      // Not a count of days.
      "Order by Friday for the weekend",
      "Blumen fürs Wochenende",
    ]) {
      expect(dayCountIn(phrase), phrase).toBeUndefined();
    }
  });

  for (const [locale, rejected] of [
    [
      "de",
      [
        "Preise inkl. MwSt., Versand wird extra berechnet",
        "Preise inkl. MwSt. und Versand nicht enthalten",
      ],
    ],
    [
      "pl",
      [
        "Ceny zawierają VAT, dostawa płatna osobno",
        "Ceny zawierają dostawę i VAT, koszt dostawy doliczamy",
      ],
    ],
  ] as const) {
    it(`${locale}: the pinned claim rejects the breaker's reworded sentences`, () => {
      for (const claim of rejected) {
        expect(claim, claim).not.toBe(EXACT_CLAIM[locale]);
      }
    });
  }

  it("drops the price claim when the route passes none, and keeps everything else (the home)", () => {
    for (const locale of LOCALES) {
      const messages = loadMessages(locale, ["nav"]) as {
        nav: { utility: Record<string, string> };
      };
      const claim = messages.nav.utility.pricesInclude ?? "";
      expect(claim, locale).not.toBe("");
      const page = render(locale);
      const home = renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={loadMessages(locale, ["nav", "company", "a11y", "common"])}
          timeZone="UTC"
        >
          <SiteHeader
            locale={locale}
            listingHrefs={HREFS[locale] ?? {}}
            priceClaim={null}
          />
        </NextIntlClientProvider>,
      );
      expect(page, locale).toContain(claim);
      expect(page, locale).toContain("data-fo-price-claim");
      expect(home, locale).not.toContain(claim);
      expect(home, locale).not.toContain("data-fo-price-claim");
      // The guarantee stays; only the one claim goes.
      expect(home, locale).toContain(messages.nav.utility.guarantee ?? "");
    }
  });

  it("reserves the v2 artboards' band heights as fixed grid rows (AC-7)", () => {
    const html = render("en");
    const { mastheadMobile, mastheadDesktop, categoryMobile } =
      HEADER_BAND_HEIGHTS;
    // The drift guard, on the masthead band's **own** element: the numbers in its class list are
    // the numbers in the model, which is what `tests/e2e/header.spec.ts` measures.
    const band = tagAt(html, html.indexOf('data-fo-header-band="masthead"'));
    expect(band).toContain(`grid-rows-[${String(mastheadMobile)}px_auto]`);
    expect(band).toContain(`xl:grid-rows-[${String(mastheadDesktop)}px]`);
    // The mobile chip row: 44 px chips plus the artboard's 12 px below them.
    expect(categoryMobile).toBe(44 + 12);
    const row = html.slice(html.indexOf('data-fo-header-band="categories"'));
    expect(row).toContain("pb-(--space-sm2)");
    expect(HEADER_BAND_HEIGHTS).toEqual({
      mastheadMobile: 64,
      mastheadDesktop: 82,
      categoryMobile: 56,
    });
    // The sticky part: 64 + 56 + 1 rule on mobile, 82 + 1 rule on desktop.
    expect(HEADER_STICKY_HEIGHTS).toEqual({
      phone: 65,
      mobile: 121,
      desktop: 83,
    });
  });

  it("gives every link the header draws itself the 44 px target", () => {
    const html = withoutMenu(render("en"));
    const banner = html.slice(html.indexOf("data-fo-header="));
    const anchors = [...banner.matchAll(/<a\s[^>]*>/g)].map(
      (match) => match[0],
    );
    // The logo, the eight category links and the Send pill.
    expect(anchors).toHaveLength(1 + (EXPECTED_ROW.en ?? []).length + 1);
    for (const anchor of anchors) {
      expect(anchor, anchor).toMatch(/min-h-\(--(?:target-min|control-sm)\)/u);
    }
  });

  it("sticks the banner and lets the utility strip scroll away (§14 A4's addendum)", () => {
    const html = render("en");

    // Two siblings, not one wrapper: the strip comes first and is **not** inside the banner. An
    // inner sticky wrapper is bounded by its parent's padding box and would have zero px of room
    // (measured: masthead at -25 px), which is why the component returns a fragment.
    const strip = html.indexOf("data-fo-utility");
    const banner = html.indexOf("data-fo-header=");
    expect(strip).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(strip);
    expect(html.slice(strip, banner)).toContain("</div>");

    // The sticky declaration and the header layer are on the banner …
    const bannerTag = tagAt(html, banner);
    expect(bannerTag).toContain("sticky");
    expect(bannerTag).toContain("top-0");
    expect(bannerTag).toContain("layer-header");
    // … and the strip is an ordinary in-flow box with no landmark role of its own: `note`, as
    // the v2 artboards mark it, is not a landmark.
    const stripTag = tagAt(html, strip);
    expect(stripTag).not.toContain("sticky");
    expect(stripTag).not.toContain("layer-header");
    expect(stripTag).toContain('role="note"');
  });

  it("declares the `banner` landmark on the sticky element only", () => {
    const html = render("en");
    // Declared rather than implicit: `/dev/components` renders the header inside `<main>`, where
    // a bare `<header>` maps to no landmark at all.
    expect([...html.matchAll(/role="banner"/g)]).toHaveLength(1);
    expect(tagAt(html, html.indexOf("data-fo-header="))).toContain(
      'role="banner"',
    );
    // The strip's claims and help channel sit outside every landmark, which the addendum accepts.
    const strip = html.slice(
      html.indexOf("data-fo-utility"),
      html.indexOf("data-fo-header="),
    );
    expect(strip).not.toContain('role="region"');
    expect(strip).not.toContain('role="banner"');
  });
});

describe("the rendered header's CSS (AC-1, AC-5)", () => {
  /** The physical utilities `fo/no-physical-css` bans, asserted on the *output*. */
  const PHYSICAL = [
    /\bml-/,
    /\bmr-/,
    /\bpl-/,
    /\bpr-/,
    /\bleft-/,
    /\bright-/,
    /\btext-left\b/,
    /\btext-right\b/,
    /\brounded-l-/,
    /\brounded-l\b/,
    /\brounded-r-/,
    /\brounded-r\b/,
    /\bborder-l-/,
    /\bborder-l\b/,
    /\bborder-r-/,
    /\bborder-r\b/,
    /\binset-x-/,
  ];
  const COLOUR = [/#[0-9a-fA-F]{3,8}\b/, /\brgb\(/, /\bhsl\(/, /\boklch\(/];

  it("emits no physical utility in any locale, so `/ar-XB` needs no override", () => {
    for (const locale of LOCALES) {
      const classes = [...render(locale).matchAll(/class="([^"]*)"/g)]
        .map((match) => match[1])
        .join(" ");
      for (const pattern of PHYSICAL) {
        expect(pattern.test(classes), `${locale} ${String(pattern)}`).toBe(
          false,
        );
      }
    }
  });

  it("emits no colour literal: every colour comes from a token utility", () => {
    // The `Mark`'s two `var(--color-…)` reads are the documented exception (TASK-045), so the
    // scan is over class names rather than over the whole document.
    const classes = [...render("en").matchAll(/class="([^"]*)"/g)]
      .map((match) => match[1])
      .join(" ");
    for (const pattern of COLOUR) {
      expect(pattern.test(classes), String(pattern)).toBe(false);
    }
  });
});

describe("every registry label the header renders resolves in the catalogue", () => {
  it("has a message for each `labelKey`, in all four locales", () => {
    const keys = [
      ...CATEGORIES.flatMap((category) =>
        [category.labelKey, category.shortLabelKey].filter(
          (key): key is string => key !== undefined,
        ),
      ),
      // Every header link is a drawn link and therefore has a label; `linkLabelKey()` is the
      // accessor that says so (spec 008 AC-20; TASK-113).
      ...headerLinkIds.map((id) => linkLabelKey(siteLink(id))),
      siteLink(SEARCH_LINK_ID).descriptionKey ?? "",
      COMPANY.contact.labelKey,
      COMPANY.contact.hoursKey,
    ];

    for (const locale of LOCALES) {
      const messages = loadMessages(locale, ["nav", "company"]) as Record<
        string,
        unknown
      >;
      for (const key of keys) {
        const value = key
          .split(".")
          .reduce<unknown>(
            (node, part) =>
              typeof node === "object" && node !== null
                ? (node as Record<string, unknown>)[part]
                : undefined,
            messages,
          );
        expect(typeof value, `${locale} ${key}`).toBe("string");
      }
    }
  });
});
