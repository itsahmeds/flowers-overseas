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
import {
  HEADER_BAND_HEIGHTS,
  HEADER_HEIGHTS,
  HEADER_STICKY_HEIGHTS,
  type HeaderListingHrefs,
  headerAccountItems,
  headerCategoryItems,
  headerCurrencyCode,
  headerEndClusterItems,
  headerListingTargets,
  headerSearchHref,
} from "../../src/modules/ui/layout/header-model.ts";
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
  basketCount?: number,
  listingHrefs: HeaderListingHrefs = HREFS[locale] ?? {},
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["nav", "company", "a11y", "common"])}
      timeZone="UTC"
    >
      <SiteHeader
        locale={locale}
        listingHrefs={listingHrefs}
        {...(basketCount === undefined ? {} : { basketCount })}
      />
    </NextIntlClientProvider>,
  );
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
      const html = render(locale);
      const internal = hrefs(html).filter((href) => href.startsWith("/"));
      const external = hrefs(html).filter((href) => !href.startsWith("/"));

      // Internal: the lockup, the switcher's three sibling locales and the category row — and
      // nothing else: no account item, no `For florists`, no search (AC-14, §14 A20).
      expect(internal.toSorted(), locale).toEqual(
        [
          localePath(locale, "home"),
          ...LOCALES.filter((other) => other !== locale).map((other) =>
            localePath(other, "home"),
          ),
          ...(EXPECTED_ROW[locale] ?? []).map(([, href]) => href),
        ].toSorted(),
      );
      // External: the help channel, both built from the one E.164 number in `company.ts`.
      expect(external).toEqual([
        `https://wa.me/${COMPANY.contact.phoneE164.slice(1)}`,
        `tel:${COMPANY.contact.phoneE164}`,
      ]);

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

  it("draws no search band and no menu glyph: nothing that looks like a control and is not (§14 A20)", () => {
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
    // No menu glyph: it opened nothing (`/review 31` made it decoration; §14 A20 removes it).
    expect(html).not.toContain("data-fo-header-menu");
    expect(html).not.toContain('aria-label="Menu"');
  });

  it("hosts spec 003's `LocaleSwitcher` unchanged: four entries, the current one not a link", () => {
    const html = render("de");
    expect(html).toContain("data-fo-header-switcher");
    expect(html).toContain('aria-current="page"');
    expect([...html.matchAll(/<li>/g)]).toHaveLength(4);
  });

  it("puts the switcher and the currency chip in the utility strip, not the category row (§14 A4)", () => {
    const html = render("en");
    const strip = html.slice(
      html.indexOf('data-fo-header-band="utility"'),
      html.indexOf('data-fo-header-band="masthead"'),
    );

    // Both controls are inside the utility band …
    expect(strip).toContain("data-fo-header-controls");
    expect(strip).toContain("data-fo-header-switcher");
    expect(strip).toContain("data-fo-header-currency");
    // … and the category row's end cluster holds `For florists` and nothing else.
    const categories = html.slice(
      html.indexOf('data-fo-header-band="categories"'),
    );
    expect(categories).not.toContain("data-fo-header-switcher");
    expect(categories).not.toContain("data-fo-header-currency");
    expect(categories).toContain('data-fo-header-item="roses"');
  });

  it("styles the switcher from the wrapper: 44 px targets, no underline, `src/modules/i18n` untouched", () => {
    const html = render("en");
    const wrapper = html.slice(html.indexOf("data-fo-header-switcher"));

    // The wrapper carries the treatment (`&` arrives HTML-escaped in the serialised markup).
    expect(html).toContain("[&amp;_a]:min-h-[44px]");
    expect(html).toContain("[&amp;_a]:no-underline");
    // Spec 003 still renders its own `underline` class and its own `<nav><ul><li>` — this file
    // suppresses and lays them out rather than editing the component (AC-7, spec 003 AC-3).
    expect(wrapper).toContain('class="underline"');
    expect(wrapper).toContain('<nav aria-label="Change language">');
  });

  it("re-orders the mobile category row from `mobileOrder`, one DOM list, no arbitrary variant", () => {
    const html = render("en");
    // The mobile artboard's order (Our selection · Bouquets · Roses · Plants · Occasions ·
    // Same-day) as flex `order` utilities that `md` clears, so the row is one list. Position 6 is
    // the gated `same-day-delivery` row, absent while no destination takes delivery dates
    // (spec 004 §14 A19; TASK-120) — the surviving positions keep their registry numbers, which
    // is what puts the row back in its drawn place the day a florist's operations land.
    for (const position of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`order-${String(position)} md:order-none`);
    }
    expect(html).not.toContain("order-6 md:order-none");
    // Tailwind's arbitrary `min-[…]:` variant compiles this project's stylesheet down to its base
    // layer with no error raised (measured twice on a clean `.next`), which would ship a header
    // with no styling at all. Named breakpoints only.
    expect(html).not.toMatch(/min-\[\d+px\]:/);
  });

  it("reserves the artboards' band heights as fixed utilities (AC-7)", () => {
    const html = render("en");
    const { utility, mastheadMobile, mastheadDesktop, searchMobile } =
      HEADER_BAND_HEIGHTS;
    // The drift guard: the numbers in the class names are the numbers in the model, which is
    // what `tests/e2e/header.spec.ts` measures the served header against. With no search band
    // (§14 A20) the mobile masthead is one row.
    expect(html).toContain(`min-h-[${String(utility)}px]`);
    expect(html).toContain(`grid-rows-[${String(mastheadMobile)}px]`);
    expect(html).not.toContain(
      `grid-rows-[${String(mastheadMobile)}px_${String(searchMobile)}px]`,
    );
    expect(html).toContain(`md:grid-rows-[${String(mastheadDesktop)}px]`);
    expect(html).toContain(
      `min-h-[${String(HEADER_BAND_HEIGHTS.categoryMobile)}px]`,
    );
    expect(html).toContain(
      `md:min-h-[${String(HEADER_BAND_HEIGHTS.categoryDesktop)}px]`,
    );
    // TASK-173: 113 + 50 + 44 + 2 on mobile, the search band gone and the row at 44 px.
    expect(HEADER_BAND_HEIGHTS.categoryMobile).toBe(44);
    expect(HEADER_HEIGHTS).toEqual({ mobile: 209, desktop: 183 });
    // The sum above is two boxes (§14 A4's addendum): 113 + 96 and 45 + 138.
    expect(HEADER_STICKY_HEIGHTS).toEqual({ mobile: 96, desktop: 138 });
  });

  it("gives every rendered link the 44 px target from the header's own wrapper (§14 A4)", () => {
    const html = render("en");
    // Every `<a>` the header renders itself: the WhatsApp icon-link (44 × 44, it has no text),
    // the `tel:` link, the masthead lockup and the eight category row links. The switcher's three
    // links are covered by the `[&_a]:min-h-[44px]` wrapper asserted above;
    // `tests/e2e/header.spec.ts` measures all of them in a browser at 390 px and 1440 px, which is
    // the assertion that cannot be faked.
    const anchors = [...html.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);
    const own = anchors.filter(
      (anchor) => !anchor.includes('class="underline"'),
    );
    expect(own).toHaveLength(3 + (EXPECTED_ROW.en ?? []).length);
    for (const anchor of own) {
      expect(anchor, anchor).toContain("min-h-[44px]");
    }
    expect(
      own.filter((anchor) => anchor.includes("min-w-[44px]")),
    ).toHaveLength(1);
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
    // … and the strip is an ordinary in-flow box with no landmark role of its own (the addendum
    // rules the strip out of the landmark tree: same copy, no new label key).
    const stripTag = tagAt(html, strip);
    expect(stripTag).not.toContain("sticky");
    expect(stripTag).not.toContain("layer-header");
    expect(stripTag).not.toContain("role=");
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
