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
import { SEARCH_PARAM } from "../../../config/search.ts";
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
  /** The logo and the row's end (and the Menu below `md`): the 64 px row, at every width. */
  mastheadMobile: 64,
  /**
   * From `md`, the logo, the search field and the row's end share the same 64 px row (spec 045
   * §14 A-founder-2026-11-08a item 2's fallback, `chrome-desktop.dc.html` 2026-11-08 section,
   * "Why two rows at xl"): the one 76 px row of the mega menu board no longer applies.
   */
  mastheadDesktop: 64,
  /**
   * From `md`, at every width, the six items' second row under a 1 px rule (`.cm-row2`, 48 px;
   * it does not scroll). The item-row breakpoint has no value: the items never join row 1.
   */
  categoryMobile: 48,
  /**
   * Below `md`, the search row under the 64 px row (spec 045 §14 A-founder-2026-11-08a item 2,
   * `chrome-mobile.dc.html` 2026-11-08 section): the 44 px field with 6 px block padding.
   */
  searchPhone: 56,
} as const;

/**
 * The height of the **sticky** part of the chrome — `<header role="banner" data-fo-header>` (§14
 * A4's addendum, mechanism iii) — measured on the served document and identical in the four
 * launch locales:
 *
 *  - **phone 122** = 64 row + 1 rule + 56 search row + 1 rule (spec 045 §13 Q19's default);
 *  - **mobile 114** = 64 masthead + 1 rule + 48 item row + 1 rule, from `md`;
 *  - **desktop 114**, the same two rows from `xl`: one row of logo, six items, a 176 px field
 *    and the end cluster needs about 1,320 of the frame's 1,328 px, so spec 045 §14
 *    A-founder-2026-11-08a item 2's fallback keeps the items on row 2 at every width (the
 *    designer's measure; spec 004 §14 A-orchestrator-2026-11-08b).
 *
 * The notice bar above it is a sibling that scrolls away; its height is content-driven and asserted
 * per breakpoint in the e2e suite. It is server-rendered with no island, so nothing below it moves
 * after the first paint.
 */
export const HEADER_STICKY_HEIGHTS = {
  /** Below `md`: the 64 px row, the rule, the 56 px search row and the rule. */
  phone: 122,
  /** From `md` to `xl`: the 64 px row, the rule and the 48 px item row, and the rule. */
  mobile: 114,
  /** From `xl`: the same two rows (the fallback above). */
  desktop: 114,
} as const;

/**
 * The search field's inline size (spec 045 §14 A-founder-2026-11-08a item 2): from `md` it fills
 * the masthead row between the logo and the end cluster, from 240 px to 480 px.
 */
export const HEADER_SEARCH_FIELD_WIDTH = { min: 240, max: 480 } as const;

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
 * The locale's search page as a link (spec 045 AC-34): with `?to={iso2}` when the page's URL names
 * a destination with a shop, else the bare path (`/de/suche`, `/en/search?to=pl`); `undefined`
 * while search has no page. The header no longer draws it (the phone row holds the field since
 * §14 A-founder-2026-11-08a item 2); it stays the one place that composes the address.
 */
export function headerSearchHref(
  locale: string,
  iso2?: string | null,
): string | undefined {
  const path = siteLinkHref(locale, SEARCH_LINK_ID);
  if (path === undefined) return undefined;
  if (iso2 === undefined || iso2 === null) return path;
  return `${path}?${new URLSearchParams({ [SEARCH_PARAM.to]: iso2.toLowerCase() }).toString()}`;
}

/** The header's one search form: where it goes and the destination it carries. */
export interface HeaderSearchForm {
  /** The locale's search path, on every page (no detour through the chooser). */
  readonly action: string;
  /** The hidden `to` (lowercase ISO 3166-1), only on a page with a destination. */
  readonly to: string | undefined;
}

/**
 * The header's search form (spec 045 §2.1 as amended by §14 A-founder-2026-11-08a item 1, AC-34,
 * AC-38): on every page the locale's search path (`/de/suche`), with a hidden `to` on a page whose
 * URL names a destination with a shop (the mega menu's context: spec 043 §2 A's rule). The country
 * comes from the page's own URL only, never a cookie or a header, so the cached HTML is the same
 * for every visitor. There is no default country: no code names one (spec 004 AC-73).
 * `undefined` while search has no page.
 */
export function headerSearchForm(
  locale: string,
  iso2?: string | null,
): HeaderSearchForm | undefined {
  const action = siteLinkHref(locale, SEARCH_LINK_ID);
  if (action === undefined) return undefined;
  return {
    action,
    to: iso2 === undefined || iso2 === null ? undefined : iso2.toLowerCase(),
  };
}
