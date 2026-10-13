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
 *  - the Send pill's target, the home's sentence.
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
 * (`docs/design/wireframes/chrome-mobile.dc.html` and `chrome-desktop.dc.html`; spec 004 §14 A21
 * clause 7: "A7's reserved header height takes v2's values"; TASK-176).
 *
 * AC-7 asks for a height that is *reserved* rather than measured after paint: the bands carry
 * these numbers as fixed grid rows, so the header's box is what the first paint already showed and
 * hydration moves nothing (CLS contribution 0). `tests/e2e/header.spec.ts` asserts the served
 * header against them at both artboard widths, which is why they are data and not a comment.
 */
export const HEADER_BAND_HEIGHTS = {
  /** The logo and the Send pill: the mobile artboard's 64 px row. */
  mastheadMobile: 64,
  /** The logo, the eight links and the pill: the desktop artboard's 82 px row. */
  mastheadDesktop: 82,
  /**
   * The mobile chip row under the masthead: 44 px chips (the tap target, `--target-min`) plus the
   * artboard's 12 px below them. On the desktop artboard the links sit in the masthead row.
   */
  categoryMobile: 56,
} as const;

/**
 * The height of the **sticky** part of the chrome — `<header role="banner" data-fo-header>` (§14
 * A4's addendum, mechanism iii) — measured on the served document at the two artboard widths and
 * identical in the four launch locales:
 *
 *  - **mobile 121** = 64 masthead + 56 chip row + 1 rule;
 *  - **desktop 83** = 82 masthead (the links and the pill share it) + 1 rule.
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
  /** From `md` to `xl`: the 64 px row, the 56 px chip row and the rule. */
  mobile: 121,
  /** From `xl`: the one 82 px row and the rule. */
  desktop: 83,
} as const;

/**
 * The id of the home's sentence picker (spec 004 §14 A21 clause 4; TASK-177 renders the form), the
 * target of the header's one action, "Send flowers".
 */
export const SEND_ANCHOR = "send";

/** The Send pill's URL: the locale home's sentence (`/en#send`). */
export function headerSendHref(locale: string): string {
  return `${localePath(locale, "home")}#${SEND_ANCHOR}`;
}

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
