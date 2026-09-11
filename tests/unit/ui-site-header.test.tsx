/**
 * `SiteHeader`'s contracts (spec 004 §5.3, AC-7, AC-8, AC-14; TASK-048), rendered with
 * `react-dom/server` against the **real** `messages/*.json` through the same provider the
 * document layout uses — the pattern `tests/unit/i18n-suggestion-banner.test.tsx` established, so
 * the asserted copy is the shipped copy and the `{count}`/`{currency}` arguments are exercised
 * rather than assumed.
 *
 * What is here and not in `tests/e2e/header.spec.ts`: every property that is a fact about the
 * markup — the currency projection, the "unpublished target is text, never a link" rule of AC-14
 * in **both** directions (the second one through a mocked registry, because the committed one has
 * nothing published and a rule only tested in its false branch is not tested), the search band
 * being text rather than a control (spec §14 A4), the reserved-height numbers, logical CSS and no
 * raw colour. Layout, stickiness, the
 * pre/post-hydration box, CLS and the four locales in a browser are the e2e file's.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { CATEGORIES } from "../../src/config/categories.ts";
import { COMPANY } from "../../src/config/company.ts";
import {
  CATEGORY_ROW_LINK_IDS,
  MASTHEAD_LINK_IDS,
  SEARCH_LINK_ID,
  type SiteLinkId,
  siteLink,
} from "../../src/config/site-links.ts";
import { loadMessages, localePath } from "../../src/modules/i18n";
import {
  HEADER_BAND_HEIGHTS,
  HEADER_HEIGHTS,
  HEADER_STICKY_HEIGHTS,
  headerAccountItems,
  headerCategoryItems,
  headerCurrencyCode,
  headerEndClusterItems,
} from "../../src/modules/ui/layout/header-model.ts";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;

/** Every site-link id the header draws, typed so `siteLink()` needs no cast. */
const headerLinkIds: readonly SiteLinkId[] = [
  ...MASTHEAD_LINK_IDS,
  ...CATEGORY_ROW_LINK_IDS,
  SEARCH_LINK_ID,
];

function render(locale: string, basketCount?: number): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["nav", "company", "a11y", "common"])}
      timeZone="UTC"
    >
      <SiteHeader
        locale={locale}
        {...(basketCount === undefined ? {} : { basketCount })}
      />
    </NextIntlClientProvider>,
  );
}

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

describe("the header's registry projections (AC-14)", () => {
  it("projects every category row entry, in the canvas's order, with no target", () => {
    const items = headerCategoryItems("en");
    expect(items.map((item) => item.id)).toEqual(
      CATEGORIES.map((category) => category.id),
    );
    // Phase 0: no shop, so not one entry may be a link.
    expect(items.filter((item) => item.href !== undefined)).toEqual([]);
    expect(items.filter((item) => item.accent)).toHaveLength(1);
  });

  it("projects the account cluster and the end cluster with no target either", () => {
    expect(headerAccountItems("en").map((item) => item.id)).toEqual([
      ...MASTHEAD_LINK_IDS,
    ]);
    expect(headerEndClusterItems("en").map((item) => item.id)).toEqual([
      ...CATEGORY_ROW_LINK_IDS,
    ]);
    for (const item of [
      ...headerAccountItems("en"),
      ...headerEndClusterItems("en"),
    ]) {
      expect(item.href, item.id).toBeUndefined();
    }
  });

  it("hides `My orders` below the `md` breakpoint, as the mobile artboard draws it", () => {
    const mobile = headerAccountItems("en")
      .filter((item) => item.showOnMobile)
      .map((item) => item.id);
    expect(mobile).toEqual(["sign-in", "basket"]);
  });
});

/**
 * AC-14's *other* direction: flipping a registry flag turns text into navigation **with no
 * template edit**. The committed registries publish nothing, so the flag is flipped in a mocked
 * module rather than in the repository, and the assertion is on the URL the header would emit.
 */
describe("a published registry entry becomes a link with no template edit (AC-14)", () => {
  beforeEach(() => {
    // The model is statically imported at the top of this file, so the cache has to go before a
    // mocked registry can reach it.
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../../src/config/categories.ts");
    vi.doUnmock("../../src/config/site-links.ts");
    vi.resetModules();
  });

  it("resolves a published category under the locale's own shop segment", async () => {
    vi.doMock("../../src/config/categories.ts", () => ({
      CATEGORY_NAV_LABEL_KEY: "nav.categories.label",
      CATEGORIES: [
        {
          id: "roses",
          labelKey: "nav.category.roses",
          published: true,
          owningSpec: "008",
          showOnMobile: true,
          accent: false,
        },
        {
          id: "occasions",
          labelKey: "nav.category.occasions",
          published: true,
          owningSpec: "008",
          showOnMobile: true,
          accent: false,
        },
      ],
      isCategoryPublished: () => true,
    }));
    const model = await import("../../src/modules/ui/layout/header-model.ts");

    // `de`, deliberately: the localised segment comes from `src/config/locales.ts`, so a German
    // category URL is German without this file knowing a single segment.
    expect(model.headerCategoryItems("de").map((item) => item.href)).toEqual([
      localePath("de", "shopCategory", "roses"),
      localePath("de", "occasions"),
    ]);
  });

  it("resolves a published site link through `localePath` and never through a template", async () => {
    vi.doMock("../../src/config/site-links.ts", () => ({
      CATEGORY_ROW_LINK_IDS: ["for-florists"],
      MASTHEAD_LINK_IDS: [],
      SEARCH_LINK_ID: "search",
      isPublished: () => true,
      siteLink: () => ({
        id: "for-florists",
        labelKey: "nav.forFlorists",
        target: { kind: "route", pageType: "forFlorists" },
        published: true,
        owningSpec: "011",
        surfaces: ["header", "footer"],
      }),
    }));
    const model = await import("../../src/modules/ui/layout/header-model.ts");

    expect(model.headerEndClusterItems("pl").map((item) => item.href)).toEqual([
      localePath("pl", "forFlorists"),
    ]);
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

  it("renders every unpublished target as text and links nothing but the home, the phone, WhatsApp and the switcher", () => {
    for (const locale of LOCALES) {
      const html = render(locale);
      const internal = hrefs(html).filter((href) => href.startsWith("/"));
      const external = hrefs(html).filter((href) => !href.startsWith("/"));

      // Internal: the lockup plus the switcher's three sibling locales. Nothing else — no
      // category, no account item, no `For florists` (AC-14).
      expect(internal.toSorted()).toEqual(
        [
          localePath(locale, "home"),
          ...LOCALES.filter((other) => other !== locale).map((other) =>
            localePath(other, "home"),
          ),
        ].toSorted(),
      );
      // External: the help channel, both built from the one E.164 number in `company.ts`.
      expect(external).toEqual([
        `https://wa.me/${COMPANY.contact.phoneE164.slice(1)}`,
        `tel:${COMPANY.contact.phoneE164}`,
      ]);

      // And each unpublished entry is present as *text*, keyed by its registry id.
      for (const item of [
        ...headerCategoryItems(locale),
        ...headerAccountItems(locale),
        ...headerEndClusterItems(locale),
      ]) {
        expect(html, `${locale}/${item.id}`).toContain(
          `data-fo-header-item="${item.id}"`,
        );
      }
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

  it("renders the search band as the artboards draw it: text, and not one form control (§14 A4)", () => {
    const html = render("en");

    // No control at all — the amendment's whole point. A `<form>` with no `action` navigates to
    // the current URL at zero JavaScript, and a `disabled` submit is pixel-identical to an
    // enabled one, so the band renders what the artboards literally draw instead.
    for (const control of [
      "<form",
      "<input",
      '<button type="submit"',
      "<select",
      "<textarea",
      "placeholder=",
      "<label",
    ]) {
      expect(html, control).not.toContain(control);
    }

    // What it does render: the placeholder sentence in the field-shaped box, `Search` in the
    // button-shaped box, and the honest explanation for a screen reader.
    const band = html.slice(html.indexOf("data-fo-header-search"));
    expect(band).toContain("Search flowers, occasions, a city or a country");
    expect(band).toContain(">Search<");
    expect(band).toContain("Search opens when the shop does.");
    expect(siteLink(SEARCH_LINK_ID).descriptionKey).toBe("nav.search.help");
  });

  it("renders the menu glyph as decoration, not as a control (`/review 31`, TASK-055)", () => {
    const html = render("en");
    // It shipped as `<button disabled>`: pixel-identical to an enabled button and doing nothing
    // when pressed. There is nothing to disclose until spec 008 publishes a nav target, so there
    // is no button at all — the same answer §14 A4 gave the search band.
    const menu = html.slice(html.indexOf("data-fo-header-menu"));
    const openTag = html.slice(
      html.lastIndexOf("<", html.indexOf("data-fo-header-menu")),
      html.indexOf(">", html.indexOf("data-fo-header-menu")) + 1,
    );
    expect(openTag).toContain("<span");
    expect(openTag).toContain('aria-hidden="true"');
    expect(openTag).toContain('data-fo-header-menu="unpublished"');
    // The 44 px box the artboard reserves stays, so publishing the menu moves no pixel.
    expect(openTag).toContain("min-h-[44px]");
    expect(menu).toContain("<svg");
    // And no button anywhere in the header: the whole component is zero client JavaScript and
    // has no control left that does nothing.
    expect(html).not.toContain("<button");
    expect(html).not.toContain('aria-label="Menu"');
  });

  it("prints the basket count through the catalogue's `{count, number}` argument", () => {
    expect(render("en")).toContain("Basket (0)");
    expect(render("en", 3)).toContain("Basket (3)");
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
    expect(categories).toContain('data-fo-header-item="for-florists"');
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
    // The mobile artboard's order (Best sellers · Bouquets · Roses · Plants · Occasions ·
    // Same-day) as flex `order` utilities that `md` clears, so the row is one list.
    for (const position of [1, 2, 3, 4, 5, 6]) {
      expect(html).toContain(`order-${String(position)} md:order-none`);
    }
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
    // what `tests/e2e/header.spec.ts` measures the served header against.
    expect(html).toContain(`min-h-[${String(utility)}px]`);
    expect(html).toContain(
      `grid-rows-[${String(mastheadMobile)}px_${String(searchMobile)}px]`,
    );
    expect(html).toContain(`md:grid-rows-[${String(mastheadDesktop)}px]`);
    expect(html).toContain(
      `min-h-[${String(HEADER_BAND_HEIGHTS.categoryMobile)}px]`,
    );
    expect(html).toContain(
      `md:min-h-[${String(HEADER_BAND_HEIGHTS.categoryDesktop)}px]`,
    );
    expect(HEADER_HEIGHTS).toEqual({ mobile: 245, desktop: 183 });
    // The sum above is now two boxes (§14 A4's addendum): 113 + 132 and 45 + 138.
    expect(HEADER_STICKY_HEIGHTS).toEqual({ mobile: 132, desktop: 138 });
  });

  it("gives every rendered link the 44 px target from the header's own wrapper (§14 A4)", () => {
    const html = render("en");
    // Every `<a>` the header renders itself: the WhatsApp icon-link (44 × 44, it has no text),
    // the `tel:` link and the masthead lockup. The switcher's three links are covered by the
    // `[&_a]:min-h-[44px]` wrapper asserted above; `tests/e2e/header.spec.ts` measures all of
    // them in a browser at 390 px and 1440 px, which is the assertion that cannot be faked.
    const anchors = [...html.matchAll(/<a\s[^>]*>/g)].map((match) => match[0]);
    const own = anchors.filter(
      (anchor) => !anchor.includes('class="underline"'),
    );
    expect(own).toHaveLength(3);
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
      ...headerLinkIds.map((id) => siteLink(id).labelKey),
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
