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
 *  - the header's reserved heights (AC-7), taken from the two approved artboards and exported as
 *    data so the CSS, the gallery and the e2e assertion all read the same numbers — as **two**
 *    numbers since §14 A4's addendum: the chrome the document reserves, and the part of it that is
 *    sticky.
 *
 * No database, no `Intl` call, no clock (`pnpm check:no-db`, `fo/no-adhoc-intl`).
 */
import { CATEGORIES, type CategoryConfig } from "../../../config/categories.ts";
import {
  type CountryIso2,
  anyDeliveryDatesOpen,
  isCountryIso2,
} from "../../../config/countries.ts";
import {
  CATEGORY_ROW_LINK_IDS,
  type ListingPageLinkType,
  MASTHEAD_LINK_IDS,
  SEARCH_LINK_ID,
  SITE_LINKS,
  type SiteLink,
  type SiteLinkId,
  categoryRowLinkId,
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
 * (`docs/design/homepage-v1/homepage-mobile.dc.html` and `-desktop.dc.html`).
 *
 * AC-7 asks for a height that is *reserved* rather than measured after paint: the bands below
 * carry these numbers as fixed heights, so the header's box is what the first paint already
 * showed and hydration moves nothing (CLS contribution 0). `tests/e2e/header.spec.ts` asserts the
 * served header against them at both breakpoints, which is why they are data and not a comment.
 */
export const HEADER_BAND_HEIGHTS = {
  /**
   * Utility strip: the artboards draw 34 px of text, but §14 A4 moves the language switcher and
   * the currency chip into this band and every rendered link owes the 44 px target of §5.3/§8, so
   * the strip's minimum is the target and not the artboards' text height.
   */
  utility: 44,
  /** Masthead: 12 px + 26 px lockup + 12 px on mobile; 18 px + 48 px + 18 px on desktop. */
  mastheadMobile: 50,
  mastheadDesktop: 84,
  /**
   * The mobile-only search band: a 42 px pill plus the artboard's 10 px separation. **Not drawn**
   * while search is unpublished (spec 004 §14 A20; TASK-173), so the mobile masthead grid is one
   * 50 px row; the number stays as the band spec 008 brings back with the real control.
   */
  searchMobile: 52,
  /**
   * Category row: 44 px on mobile — the artboard's 28 px label row grown to the §5.3/§8 tap target
   * the day its entries became links (TASK-173, as TASK-048 recorded it would) — and 14 px + 24 px
   * + 14 px on desktop (one line, now that the switcher and the chip have left it, §14 A4).
   */
  categoryMobile: 44,
  categoryDesktop: 52,
} as const;

/**
 * The **rendered** header height per breakpoint, rounded to the pixel, measured on the served
 * document at the two artboard widths (390 px and 1440 px) and identical in all four launch
 * locales and in `/ar-XB` — which is the property AC-7 actually needs: one deterministic box, the
 * same before and after hydration, with nothing measured after paint.
 *
 * Measured at 390 px, 412 px (the `e2e-mobile` Pixel 7), 1280 px (`e2e-desktop`) and 1440 px, in
 * `en`, `en-gb`, `de`, `pl` and `ar-XB`, the two numbers below hold in every combination:
 *
 *  - **desktop 183** = 44 utility + 84 masthead + 52 category row + 3 hairlines, which is the
 *    artboards' anatomy with one difference: the strip's 34 px of text becomes the 44 px tap
 *    target of the links §14 A4 moved into it. The category row is the artboard's single 52 px
 *    line again, because the switcher no longer sits in it.
 *  - **mobile 245** = 113 utility + 50 masthead + 52 search band + 28 category row + 2 hairlines.
 *    The strip runs to three lines at 390 px — the cutoff line, the help channel, and the
 *    switcher with the chip — because spec 003's switcher is four language names (~274 px) and
 *    each of its links owes 44 px. §14 A4 accepted that cost to make AC-8's chip visible without
 *    scrolling; the canvas's compact `EN · EUR` control, which spec 008 owns together with the
 *    currency menu, is what brings the band back to one line (~176 px in total).
 *
 * `/en-XA` (the +40 % pseudo-locale) grows the desktop category row to three lines and the header
 * to 263 px, which is the wrap behaviour §7 asks for rather than a regression.
 *
 * **TASK-173 (spec 004 §14 A20) shrank the mobile number to 209** = 113 utility + 50 masthead +
 * 44 category row + 2 hairlines: the search band is not drawn while search has no page, and the
 * category row grew from 28 px to the 44 px target its links owe. Desktop is unchanged at 183,
 * because the 52 px row already holds a 44 px link and the masthead keeps its 84 px.
 *
 * `tests/e2e/header.spec.ts` asserts the served box against these numbers at both breakpoints,
 * and `tests/unit/ui-site-header.test.tsx` asserts the band minimums against the class names, so
 * neither the design source nor the rendered outcome can drift unnoticed.
 */
export const HEADER_HEIGHTS = { mobile: 209, desktop: 183 } as const;

/**
 * The height of the **sticky** part of the chrome — the `<header role="banner" data-fo-header>` the
 * component renders as a sibling of the utility strip (§14 A4's addendum, 2026-09-09, mechanism
 * iii): masthead + category row + their two hairlines.
 *
 *  - **mobile 96** = 50 masthead + 44 category row + 2 rules (TASK-173: no search band, and the
 *    row at the 44 px target its links owe; it was 132 with both)
 *  - **desktop 138** = 84 masthead + 52 category row + 2 rules
 *
 * `HEADER_HEIGHTS` above stays the number AC-7 reserves, and it is now the **sum of two boxes**:
 * 113 + 96 = 209 at 390 px, 45 + 138 = 183 at 1440 px (the strip's own box carries its border, so
 * the arithmetic is the measured 245 / 183 and not a rounding of it). `tests/e2e/header.spec.ts`
 * measures `[data-fo-utility]` and `[data-fo-header]` and asserts both the parts and the sum, plus
 * the property the split exists for: after a 600 px scroll the masthead is at the top of the
 * viewport and the strip is above it.
 */
export const HEADER_STICKY_HEIGHTS = { mobile: 96, desktop: 138 } as const;

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
 * The URLs of the header's **listing-page** targets in one locale, by link id (spec 008 §14 A14;
 * TASK-173). A link id with no entry has no page in this locale.
 *
 * Supplied by the document layout, because whether `/de/blumen/rosen` exists is
 * `listingExists()`'s answer and `src/modules/ui` may not import `src/modules/catalog` (`plan/01`
 * §5) — the footer's `unavailable` seam, applied to the header. The layout resolves exactly the
 * identities `headerListingTargets()` lists, so the two cannot name different pages.
 */
export type HeaderListingHrefs = Readonly<Partial<Record<string, string>>>;

/** One listing page the header may link to, as the catalogue's existence rule names it. */
export interface HeaderListingTarget {
  readonly id: SiteLinkId;
  readonly identity: {
    readonly pageType: ListingPageLinkType;
    readonly entityKey?: string;
    readonly countryIso?: CountryIso2;
  };
}

/**
 * Every **published** header link whose target is one listing page — the identities the layout
 * asks the catalogue about. An unpublished one is not asked about at all: it is not drawn.
 */
export function headerListingTargets(): readonly HeaderListingTarget[] {
  const targets: HeaderListingTarget[] = [];
  for (const link of SITE_LINKS) {
    if (!link.surfaces.includes("header") || !isPublished(link.id)) continue;
    if (link.target.kind !== "listingPage") continue;
    const { pageType, entityKey, countryIso } = link.target;
    // The registry's code is shape-checked there and narrowed to a known destination here: a code
    // the country registry does not hold names no page, so it is not asked about.
    if (countryIso !== undefined && !isCountryIso2(countryIso)) continue;
    targets.push({
      id: link.id,
      identity: {
        pageType,
        ...(entityKey === undefined ? {} : { entityKey }),
        ...(countryIso === undefined ? {} : { countryIso }),
      },
    });
  }
  return targets;
}

/**
 * The URL of a site-link entry, or `undefined` when the header must **not draw it** (spec 004
 * AC-14 as §14 A20 amends it).
 *
 * Three reasons for `undefined`, and they are the whole rule: the entry is not published; its
 * target is `pending` (no route shape exists yet, which `SiteLinkSchema` already refuses to
 * publish); or it is one listing page that does not exist in this locale (`listingHrefs` has no
 * entry for it). A `route` target exists wherever `localePath()` builds it.
 */
export function siteLinkHref(
  locale: string,
  id: SiteLinkId,
  listingHrefs: HeaderListingHrefs = {},
): string | undefined {
  const link = siteLink(id);
  if (!isPublished(id)) return undefined;
  if (link.target.kind === "route") {
    return localePath(locale, link.target.pageType);
  }
  if (link.target.kind === "listingPage") return listingHrefs[id];
  return undefined;
}

/** An entry of the header as the template renders it: a label key, and whether it may be a link. */
export interface HeaderItem {
  /** Stable id — the registry id, so a failing assertion names the row to flip. */
  readonly id: string;
  /** The `nav.*`/`common.*` message key that labels it. */
  readonly labelKey: string;
  /** A shorter label for the mobile row, when the canvas draws one. */
  readonly shortLabelKey?: string;
  /**
   * The entry's 1-based position in the **mobile** artboard's row, when it is in it. The template
   * turns it into a flex `order` that `md` clears, so the mobile artboard's order (Best sellers ·
   * Bouquets · Roses · Plants · Occasions · Same-day) and the desktop artboard's are one DOM list
   * (spec §14 A4's nit).
   */
  readonly mobileOrder?: number;
  /**
   * The resolved target. **Required**: an entry with no page is not an item at all (spec 004
   * §14 A20; TASK-173), so the template has no text branch and no `published` branch to get
   * wrong — every item it receives is a link.
   */
  readonly href: string;
  /** The canvas prints exactly one category row entry in the accent colour. */
  readonly accent: boolean;
  /** Present in the mobile artboard's scrollable row. */
  readonly showOnMobile: boolean;
}

function fromCategory(
  locale: string,
  category: CategoryConfig,
  listingHrefs: HeaderListingHrefs,
): HeaderItem | undefined {
  const href = siteLinkHref(
    locale,
    categoryRowLinkId(category.id),
    listingHrefs,
  );
  if (href === undefined) return undefined;
  return {
    id: category.id,
    labelKey: category.labelKey,
    ...(category.shortLabelKey === undefined
      ? {}
      : { shortLabelKey: category.shortLabelKey }),
    ...(category.mobileOrder === undefined
      ? {}
      : { mobileOrder: category.mobileOrder }),
    href,
    accent: category.accent,
    showOnMobile: category.showOnMobile,
  };
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
    accent: false,
    showOnMobile,
  };
}

function drawn(item: HeaderItem | undefined): item is HeaderItem {
  return item !== undefined;
}

/**
 * The category row, in the canvas's order, **only the entries with a page in this locale** (spec
 * 004 §14 A20, spec 008 §14 A14; TASK-173) — and minus every row that asserts a delivery date
 * nobody has agreed to (spec 004 §14 A19; TASK-120).
 *
 * The filter is the registry's `requiresDeliveryDates` flag against `anyDeliveryDatesOpen()`, the
 * single chrome predicate, so "Same-day delivery" is *absent* rather than reworded: a category
 * whose whole subject is a delivery window we cannot offer has nothing honest to say. The
 * surviving rows keep their `mobileOrder` values, which are registry positions and not render
 * indices, so the row re-appears in its drawn place the day a florist's operations land.
 */
export function headerCategoryItems(
  locale: string,
  listingHrefs: HeaderListingHrefs = {},
): readonly HeaderItem[] {
  const datesOpen = anyDeliveryDatesOpen();
  return CATEGORIES.filter(
    (category) => datesOpen || !category.requiresDeliveryDates,
  )
    .map((category) => fromCategory(locale, category, listingHrefs))
    .filter(drawn);
}

/**
 * The masthead's account cluster (`Sign in` · `My orders` · `Basket (0)`), **only the entries
 * whose page exists** — none today (010/019 own them), so the cluster is empty. The mobile artboard
 * draws two of the three icons, so `My orders` is the one entry hidden below the `md` breakpoint.
 */
export function headerAccountItems(locale: string): readonly HeaderItem[] {
  return MASTHEAD_LINK_IDS.map((id) =>
    fromSiteLink(locale, siteLink(id), id !== "my-orders"),
  ).filter(drawn);
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
