/**
 * `SiteHeader`'s projections (spec 004 §5.3, AC-7, AC-8, AC-14; TASK-048).
 *
 * Everything the header decides *before* it renders anything, in one place and with no JSX, so
 * each rule is a unit test rather than a screenshot:
 *
 *  - which currency code the chip prints for a locale (AC-8) — read from the locale registry's
 *    `currencyDefault`, never from a cookie, a header or a visitor preference, which is what
 *    keeps the document one cache entry with no `Vary` and no `Set-Cookie`;
 *  - whether a registry entry is drawn at all (AC-14, spec 004 §14 A20; TASK-173) — an entry is
 *    drawn **exactly when it resolves to a URL**, and an entry with no page is absent: no link,
 *    no text, nothing that looks clickable and does nothing. Asked here so the template carries
 *    no `published` branch of its own and a go-live is a data flip in `src/config/site-links.ts`;
 *  - the header's reserved heights (AC-7), taken from the two v2 chrome artboards and exported as
 *    data so the CSS and the e2e assertion read the same numbers;
 *
 * No database, no `Intl` call, no clock (`pnpm check:no-db`, `fo/no-adhoc-intl`).
 */
import {
  BASKET_LINK_ID,
  CATEGORY_ROW_LINK_IDS,
  MASTHEAD_LINK_IDS,
  SEARCH_LINK_ID,
  type SiteLink,
  type SiteLinkId,
  isPublished,
  linkLabelKey,
  siteLink,
} from "../../../config/site-links.ts";
import {
  documentFallbackLocale,
  getLocaleRegistry,
  localePath,
} from "../../i18n/index.ts";

/**
 * The reserved height of each header band, per artboard, in CSS pixels
 * (`docs/design/wireframes/chrome-mobile.dc.html` and `chrome-desktop.dc.html`; spec 004 §14 A21
 * clause 7: "A7's reserved header height takes v2's values"; TASK-176).
 *
 * AC-7 asks for a height that is *reserved* rather than measured after paint: the bands carry
 * these numbers as fixed grid rows, so the header's box is what the first paint already showed and
 * hydration moves nothing (CLS contribution 0). `tests/e2e/header.spec.ts` asserts the served
 * header against them at both artboard widths, which is why they are data and not a comment.
 */
export const HEADER_BAND_HEIGHTS = {
  /** The logo and the row's end (and the Menu below `md`): the 64 px row. */
  mastheadMobile: 64,
  /**
   * The logo, the six mega menu items and the row's end: the mega menu board's 76 px row (spec 004
   * §14 A-founder-2026-10-24a item 5, `chrome-desktop.dc.html` `.cm-row`; TASK-383).
   */
  mastheadDesktop: 76,
  /**
   * From `md` to `xl`, the six items' second row under a 1 px rule (`.cm-row2`, 48 px; it does
   * not scroll). On the desktop board the items sit in the masthead row.
   */
  categoryMobile: 48,
} as const;

/**
 * The height of the **sticky** part of the chrome — `<header role="banner" data-fo-header>` (§14
 * A4's addendum, mechanism iii) — measured on the served document at the two artboard widths and
 * identical in the four launch locales:
 *
 *  - **mobile 114** = 64 masthead + 1 rule + 48 item row + 1 rule;
 *  - **desktop 77** = 76 masthead (the logo, the six items and the row's end) + 1 rule.
 *
 * TASK-176 (v2) changed both, deliberately: v1 was 96 / 138 with the search band gone (TASK-173).
 * The notice bar above it is a sibling that scrolls away; its height is content-driven and asserted
 * per breakpoint in the e2e suite: 80 px on a phone (the sentence plus the 44 px row of languages
 * and currency that spec 004 §14 A4 keeps reachable at 390 px), 62 px from `lg`. It is server-
 * rendered with no island, so nothing below it moves after the first paint.
 */
export const HEADER_STICKY_HEIGHTS = {
  /**
   * Below `md` (spec 004 §14 A24 clause 3, AC-47; TASK-195): the logo and the Menu in the 64 px
   * row plus the 1 px rule. The chip row is not drawn there, and neither is the strip.
   */
  phone: 65,
  /** From `md` to `xl`: the 64 px row, the rule and the 48 px item row, and the rule. */
  mobile: 114,
  /** From `xl`: the one 76 px row and the rule. */
  desktop: 77,
} as const;

/**
 * The currency code the chip prints for a locale (AC-8): `en`→EUR, `en-gb`→GBP, `de`→EUR,
 * `pl`→PLN, all four read from `locale.currencyDefault` in `src/config/locales.ts` rather than
 * restated here, so a fifth locale is a data change (spec 003 AC-31). An unknown code falls back
 * to the x-default locale's currency instead of throwing: the code reaching a rendered header has
 * already been through `routableLocale()`, and a header is not the place to fail a document.
 */
export function headerCurrencyCode(locale: string): string {
  const config = getLocaleRegistry().get(locale) ?? documentFallbackLocale();
  return config.currencyDefault;
}

/**
 * The URL of a site-link entry, or `undefined` when the header must **not draw it** (spec 004
 * AC-14 as §14 A20 amends it).
 *
 * Three reasons for `undefined`, and they are the whole rule: the entry is not published; its
 * target is `pending` (no route shape exists yet, which `SiteLinkSchema` already refuses to
 * publish); or it names a listing page, which the header no longer links from the registry: the
 * mega menu's listing entries come from `megaMenuModel()`'s existence reads (TASK-383), which is
 * where "does this page exist in this locale" is answered. A `route` target exists wherever
 * `localePath()` builds it, and a `transactional` one (the basket) under every locale prefix.
 */
export function siteLinkHref(
  locale: string,
  id: SiteLinkId,
): string | undefined {
  const link = siteLink(id);
  if (!isPublished(id)) return undefined;
  if (link.target.kind === "route") {
    return localePath(locale, link.target.pageType);
  }
  // A transactional page's segment is the English word in every locale (spec 010 §13 Q10).
  if (link.target.kind === "transactional") {
    return localePath(locale, "home", link.target.page);
  }
  return undefined;
}

/** An entry of the header as the template renders it: a label key, and whether it may be a link. */
export interface HeaderItem {
  /** Stable id — the registry id, so a failing assertion names the row to flip. */
  readonly id: string;
  /** The `nav.*`/`common.*` message key that labels it. */
  readonly labelKey: string;
  /**
   * The resolved target. **Required**: an entry with no page is not an item at all (spec 004
   * §14 A20; TASK-173), so the template has no text branch and no `published` branch to get
   * wrong — every item it receives is a link.
   */
  readonly href: string;
  /** Present in the mobile artboard's scrollable row. */
  readonly showOnMobile: boolean;
}

function fromSiteLink(
  locale: string,
  link: SiteLink,
  showOnMobile: boolean,
): HeaderItem | undefined {
  const href = siteLinkHref(locale, link.id);
  if (href === undefined) return undefined;
  return {
    id: link.id,
    labelKey: linkLabelKey(link),
    href,
    showOnMobile,
  };
}

function drawn(item: HeaderItem | undefined): item is HeaderItem {
  return item !== undefined;
}

/**
 * The masthead's account cluster (`Sign in` · `My orders`), **only the entries whose page exists**
 * — none today (019 owns them), so the cluster is empty. `My orders` is hidden below the `md`
 * breakpoint. The basket is not in it: it is the icon link of `headerBasketHref()`.
 */
export function headerAccountItems(locale: string): readonly HeaderItem[] {
  return MASTHEAD_LINK_IDS.map((id) =>
    fromSiteLink(locale, siteLink(id), id !== "my-orders"),
  ).filter(drawn);
}

/**
 * The header's basket link (spec 010 §14 A-founder-2026-10-22 D10; TASK-349): `/{locale}/basket`
 * once the registry publishes it, or `undefined` (not drawn). The same URL for every visitor: the
 * count is the post-paint island's, never the server's, so a cached page stays one document.
 */
export function headerBasketHref(locale: string): string | undefined {
  return siteLinkHref(locale, BASKET_LINK_ID);
}

/** The category row's end cluster (`For florists`, spec 011's), only once its page exists. */
export function headerEndClusterItems(locale: string): readonly HeaderItem[] {
  return CATEGORY_ROW_LINK_IDS.map((id) =>
    fromSiteLink(locale, siteLink(id), false),
  ).filter(drawn);
}

/**
 * Whether the header draws its search band: only once search has a page (spec 008 owns it).
 * Until then there is no band at all — not the field-shaped text §14 A4 drew, which looked like a
 * control and did nothing (spec 004 §14 A20).
 */
export function headerSearchHref(locale: string): string | undefined {
  return siteLinkHref(locale, SEARCH_LINK_ID);
}
