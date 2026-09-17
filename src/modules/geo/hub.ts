/**
 * The all-destinations hub's view model and the one link predicate the whole site shares (spec
 * 007 §2 "Existence, URLs and routing" / "Internal links", §5.3, §5.4, §6, AC-7, AC-17, AC-20;
 * `docs/design/wireframes/all-destinations-desktop.dc.html` and `-mobile`; TASK-092).
 *
 * **`corridorLinkHref()` is the single answer to "may this destination be a link here?"** The
 * finder, the destinations grid, the footer's hub column, the corridor page's related row and the
 * hub itself all ask it, so they cannot disagree with each other or with the route's
 * `generateStaticParams`. It is the conjunction of three facts, each authored somewhere different
 * and each necessary:
 *
 *  1. `isCorridorPagePublished(iso2)` — the country registry's "this destination may be linked";
 *  2. `isPublished(corridorLinkId(iso2))` — the `site-links.ts` row spec 007 AC-20 requires, so a
 *     target can be withdrawn from every surface at once without touching a component;
 *  3. `corridorPageExists(iso2, locale)` — `plan/02` §5.1's existence rule **in this locale**.
 *     This is the term that keeps `/de` and `/pl` honest: no human has written a German or Polish
 *     guide (§13 Q1), so those pages do not exist and nothing links to them. A link that ignored
 *     it would be a link to the router's own 404 (spec 004 AC-14).
 *
 * Flipping a country's `guidePublished` therefore adds or removes its link on every surface at
 * once, with no template edit and no change under `src/app/` — spec 007 AC-7's "a new country is
 * data" proof, and the reason this function lives in `modules/geo` rather than in each caller.
 *
 * **The hub's grouping is registry data.** `countries.ts` carries each destination's `region`
 * (the founder's 2026-09-15 ruling (b): Central Europe · Western and Southern Europe ·
 * South-eastern Europe), and the order **inside** a group is `collator(locale)` over the
 * translated names, so Polish sorts its own way (§7). A region whose destinations all lack a page
 * in this locale renders **nothing** — not a heading, not an empty grid — and a locale where no
 * destination has a page renders the whole-page empty state instead of three empty headings
 * (the artboards' "Empty states" block).
 *
 * **What the hub does not carry**: no price, no count of countries, no map, no flag, no photo and
 * no "featured" section (founder ruling (c)); no waiting-list field (§13 Q4); and no per-country
 * copy of its own — a linked destination's teaser is the guide's own authored `seoDescription`,
 * so the hub cannot describe a country in words nobody reviewed.
 */
import {
  COUNTRIES,
  type CountryIso2,
  type CountryRegion,
  countryRegions,
  isCorridorPagePublished,
  regionHeadingKey,
} from "../../config/countries.ts";
import { corridorLinkId, isPublished } from "../../config/site-links.ts";
import { localePath, sortBy } from "../i18n/index.ts";
import type { LocaleCode } from "../../config/locales.ts";

import { corridorContentView } from "./content/view.ts";
import {
  type CorridorCrumb,
  contentLocaleOf,
  corridorPageExists,
  corridorSlug,
  corridorState,
  corridorStateKey,
} from "./corridor.ts";

/**
 * The same cast `finder-model.ts` and `labels.ts` document: the locale set is provider-backed
 * data (spec 003 AC-31), and every code that reaches this module has passed the routing gate.
 */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/**
 * The corridor path for one destination in one locale, or `undefined` when it may not be linked.
 * See the header: three terms, one answer, every surface.
 */
export function corridorLinkHref(
  iso2: CountryIso2,
  locale: string,
): string | undefined {
  if (!isCorridorPagePublished(iso2)) return undefined;
  if (!isPublished(corridorLinkId(iso2))) return undefined;
  if (!corridorPageExists(iso2, locale)) return undefined;
  return localePath(locale, "destinations", corridorSlug(iso2, locale));
}

/** One destination as the hub draws it: a link with a teaser, or text with its state line. */
export interface HubDestinationView {
  readonly iso2: CountryIso2;
  /** `destinations.{iso}.name` — the name is catalogue copy, never a literal (§7). */
  readonly nameKey: string;
  /** `destinations.state.deliveringNow` | `destinations.state.guideNotDelivering`. */
  readonly stateKey: string;
  /** The corridor page, or `undefined` → the row is text and carries the hub's state line. */
  readonly href: string | undefined;
  /** The guide's own authored `seoDescription`; absent for a destination with no page here. */
  readonly teaser: string | undefined;
  /** The content record's `reviewed` flag, for the hub's own indexability term. */
  readonly reviewed: boolean;
}

/** One region group. A group with no linked destination is never built (see the header). */
export interface HubRegionView {
  readonly region: CountryRegion;
  /** `destinationsHub.region.*`. */
  readonly headingKey: string;
  readonly destinations: readonly HubDestinationView[];
}

/** Everything the hub renders, and nothing it does not. */
export interface HubView {
  readonly locale: string;
  readonly path: string;
  readonly breadcrumb: readonly CorridorCrumb[];
  /** The region groups that have at least one destination with a page in this locale. */
  readonly regions: readonly HubRegionView[];
  /**
   * Every destination in this locale, in reading order — the whole-page empty state's list, and
   * the set the region groups are drawn from.
   */
  readonly destinations: readonly HubDestinationView[];
  /** True when no destination has a page here: the `/de` and `/pl` state of Phase 0. */
  readonly empty: boolean;
  /**
   * The hub is indexable when at least one corridor in this locale is (§6). The route passes it
   * as `pageIndexability()`'s `reviewed` term, so the hub cannot be indexed into a page with
   * nothing to link to.
   */
  readonly anyReviewed: boolean;
}

function destinationView(
  iso2: CountryIso2,
  nameKey: string,
  locale: string,
): HubDestinationView {
  const href = corridorLinkHref(iso2, locale);
  const contentLocale = contentLocaleOf(locale);
  const content =
    contentLocale === undefined
      ? undefined
      : corridorContentView(iso2, contentLocale, corridorState(iso2, locale));
  return {
    iso2,
    nameKey,
    stateKey: corridorStateKey(corridorState(iso2, locale)),
    href,
    teaser: href === undefined ? undefined : content?.seoDescription,
    reviewed: content?.reviewed ?? false,
  };
}

/**
 * The hub's whole view model.
 *
 * `nameOf` is a parameter for `finder-model.ts`'s reason: this module reads no catalogue, so the
 * collation order can be asserted in a unit test with a stub name function and the component
 * passes next-intl's. It defaults to the key itself for the one caller that needs the *shape* of
 * the page and not its order — `generateMetadata`, which reads `path` and `anyReviewed` only.
 */
export function hubView(
  locale: string,
  nameOf: (nameKey: string) => string = (nameKey) => nameKey,
): HubView {
  const all = COUNTRIES.map((country) =>
    destinationView(country.iso2, country.nameKey, locale),
  );
  const ordered = sortBy(all, localeCode(locale), (destination) =>
    nameOf(destination.nameKey),
  );

  const regions = countryRegions.flatMap((region): HubRegionView[] => {
    const members = ordered.filter(
      (destination) =>
        COUNTRIES.find((country) => country.iso2 === destination.iso2)
          ?.region === region,
    );
    // A region with nothing to link to renders nothing at all — heading included.
    if (!members.some((destination) => destination.href !== undefined)) {
      return [];
    }
    return [
      { region, headingKey: regionHeadingKey(region), destinations: members },
    ];
  });

  return {
    locale,
    path: localePath(locale, "destinations"),
    breadcrumb: [
      {
        labelKey: "common.homeLink",
        href: localePath(locale, "home"),
        current: false,
      },
      {
        labelKey: "breadcrumb.destinations",
        href: undefined,
        current: true,
      },
    ],
    regions,
    destinations: ordered,
    empty: regions.length === 0,
    anyReviewed: ordered.some(
      (destination) => destination.href !== undefined && destination.reviewed,
    ),
  };
}
