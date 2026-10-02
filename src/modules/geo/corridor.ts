/**
 * The corridor page's existence rule, its two states and its one view model (spec 007 §2
 * "Existence, URLs and routing" and "The page, in its two states", §5.2, §5.3, AC-5, AC-6, AC-8,
 * AC-22; TASK-091).
 *
 * Four functions, in the order the route uses them:
 *
 *  - **`corridorState(iso2, locale)`** — `live` only when the registry says `live` **and** a
 *    florist is taking our orders (`hasActivePartners`, `partners.ts`) **and** a `live` content
 *    file exists for the locale **and** the country's `operations` block is complete. Otherwise
 *    `guide`. Every one of the four is a fact somebody had to author; that is what stops
 *    `countries.ts`'s design label from printing a cutoff (§13 Q3).
 *  - **`corridorPageExists(iso2, locale)`** — `plan/02` §5.1's rule verbatim:
 *    `(status === 'live' || guidePublished)` **and** an authored, parsed content file for that
 *    (country, locale, state). A country that fails it has **no URL**, not a thin one.
 *  - **`listCorridorPages()`** — exactly that set, as route params. `generateStaticParams` returns
 *    it and `dynamicParams = false`, so the existence rule is structural: every other slug,
 *    segment and casing is a hard 404 the router answers, not a runtime branch a page could
 *    forget (AC-5, AC-6).
 *  - **`corridorView(iso2, locale)`** — the **single** source for the page, for TASK-093's JSON-LD
 *    builders and for TASK-094's sitemap row, so structured data is incapable of describing
 *    something the page does not render (`plan/02` §15).
 *
 * Two rules the view model carries rather than the components:
 *
 *  - **A block whose data is missing is `undefined`, never an empty shell** (spec 004 §5.3's
 *    `TrustMarks` rule): no occasion rows means no `occasions`, and the calendar block is then
 *    absent from the document — no heading, no caption, no "coming soon".
 *  - **Nothing here links to a page that does not exist.** Related destinations are filtered
 *    through `relatedCorridorViews()` (the target must be authored in *this* locale) and then
 *    through the existence rule itself, and the breadcrumb's hub crumb is a link only while
 *    `site-links.ts` publishes it (TASK-092 flips it). spec 004 AC-14 extended to the new route.
 *
 * The live state's **from-price** and **shop entry** are `CorridorLiveSlots`: data this spec does
 * not own (spec 005's `fromPrice` needs a product, spec 008 owns the shop entry and its five link
 * ids). Phase 0 passes none, so both blocks are absent — which is also the branch a live
 * destination hits before 008 ships, exactly as the artboard's state C draws it — and AC-8's
 * live-state assertions drive them from a fixture.
 */
import {
  COUNTRIES,
  type CountryIso2,
  type CountryOperations,
  countryConfig,
  countrySlug,
  hasCompleteOperations,
  isCountryIso2,
  isGuidePublished,
} from "../../config/countries.ts";
import { occasionByKey } from "../../config/catalogue/occasions.data.ts";
import { isPublished } from "../../config/site-links.ts";
import {
  launchLocales,
  localePath,
  routableLocale,
  routableLocaleCodes,
} from "../i18n/index.ts";

import {
  type CorridorContentView,
  corridorContentView,
  relatedCorridorViews,
} from "./content/view.ts";
import type { CorridorState, FaqItem } from "./content/schemas.ts";
import {
  type IsoDate,
  type OccasionRuleKind,
  committedOccasionCalendar,
  observedUndatedOccasions,
  upcomingOccasions,
} from "./occasions/index.ts";
import { hasActivePartners } from "./partners.ts";

/** The seven destinations, as the closed code set this module iterates. */
const COUNTRY_SET: readonly CountryIso2[] = COUNTRIES.map(
  (country) => country.iso2,
);

/** How many months of occasions the calendar lists (spec 007 §2, AC-22). */
export const CORRIDOR_CALENDAR_MONTHS = 12;

/**
 * The locale whose authored content and whose slug a URL prefix reads.
 *
 * It is the prefix itself for a launch locale. For a **pseudo-locale** it is the x-default
 * locale: `/en-XA` and `/ar-XB` exist so the visual and accessibility suites have real documents
 * to screenshot (`src/app/[locale]/layout.tsx`, spec 003 AC-29), the pseudo catalogue rewrites
 * *chrome strings* and nothing else, and `countries.ts` authors slugs for launch locales only. So
 * a pseudo corridor document is the English guide inside pseudo chrome — which is exactly what an
 * RTL screenshot has to show — and it can never be indexed or announced: `isLocaleIndexable()` is
 * false for a non-launch locale, so `indexability()` answers `noindex,follow`, `alternatesFor()`
 * emits no alternate for it, and the production env schema refuses the flag that routes it at all.
 */
export function contentLocaleOf(locale: string): string | undefined {
  const config = routableLocale(locale);
  if (config === undefined) return undefined;
  if (!config.isPseudo) return config.code;
  return config.fallbackCode ?? undefined;
}

/**
 * The status chip's message key — **from the corridor state, never from `countries.ts`'s
 * `status`**.
 *
 * `destinationStateKey()` answers from the registry label, which is right on the home page (the
 * founder-approved canvas prints "Delivering now" for Poland there) and wrong here: a corridor
 * page that renders a guide with a "Delivering now" chip claims a delivery it then refuses to
 * describe, which is exactly the claim AC-19 forbids. The chip therefore says what the page says.
 * The two converge the day `corridorState()` answers `live`, which is the same data flip.
 */
export function corridorStateKey(state: CorridorState): string {
  return state === "live"
    ? "destinations.state.deliveringNow"
    : "destinations.state.guideNotDelivering";
}

/**
 * The all-destinations hub's link id in `site-links.ts` — `destinationsHub` in spec 007 AC-20 and
 * in `SeoPageType`; the id itself is hyphen-case because `SiteLinkSchema` requires it. TASK-092
 * published it, which is what turns the breadcrumb's middle crumb into a link.
 */
export const HUB_LINK_ID = "destinations";

/**
 * The hub's path in a locale, or `undefined` while its link id is unpublished. One predicate, so
 * the breadcrumb, the footer column and the hub's own canonical cannot disagree (spec 004 AC-14).
 */
export function destinationsHubHref(locale: string): string | undefined {
  return isPublished(HUB_LINK_ID)
    ? localePath(locale, "destinations")
    : undefined;
}

/** One corridor URL, as `generateStaticParams` needs it. */
export interface CorridorPageParams {
  readonly iso2: CountryIso2;
  readonly locale: string;
  /** The localised country slug — `poland`, `polen`, `polska` (`countries.ts`). */
  readonly slug: string;
  readonly state: CorridorState;
}

/**
 * The four terms the live state is the conjunction of — the shape `pageIndexability()` uses in
 * `src/modules/seo`, and for the same two reasons: a table-driven test can drive **the rule**
 * without a fixture registry, and a caller cannot gather three of the four and forget the fourth.
 */
export interface CorridorStateTerms {
  /** `countries.ts` says `status: "live"` — a design label, not an operational fact (§13 Q3). */
  readonly registryLive: boolean;
  /** A florist is taking our orders there (`hasActivePartners`). */
  readonly activePartners: boolean;
  /** The country's `operations` block is complete: a cutoff somebody agreed to. */
  readonly operationsComplete: boolean;
  /** A `live`-state content file exists for this locale. */
  readonly liveContent: boolean;
}

export const CORRIDOR_STATE_TERMS = [
  "registryLive",
  "activePartners",
  "operationsComplete",
  "liveContent",
] as const;

/** The pure rule: `live` only when every term holds. Sixteen cases, one conjunction. */
export function corridorStateFrom(terms: CorridorStateTerms): CorridorState {
  return CORRIDOR_STATE_TERMS.every((term) => terms[term]) ? "live" : "guide";
}

/**
 * The state this (country, locale) renders in: gather the four terms, then apply the rule.
 */
export function corridorState(iso2: string, locale: string): CorridorState {
  if (!isCountryIso2(iso2)) return "guide";
  const content = contentLocaleOf(locale);
  if (content === undefined) return "guide";
  return corridorStateFrom({
    registryLive: countryConfig(iso2).status === "live",
    activePartners: hasActivePartners(iso2),
    operationsComplete: hasCompleteOperations(iso2),
    liveContent: corridorContentView(iso2, content, "live") !== undefined,
  });
}

/** `plan/02` §5.1's existence rule. `false` means there is no URL at all, not a `noindex` one. */
export function corridorPageExists(iso2: string, locale: string): boolean {
  if (!isCountryIso2(iso2)) return false;
  const content = contentLocaleOf(locale);
  if (content === undefined) return false;
  const country = countryConfig(iso2);
  const published = country.status === "live" || isGuidePublished(iso2);
  if (!published) return false;
  return (
    corridorContentView(iso2, content, corridorState(iso2, locale)) !==
    undefined
  );
}

/**
 * Every corridor URL that exists, in registry order (Poland first, then the six guide
 * destinations) and locale order. At most 28 in Phase 0 — seven destinations × four locales — and
 * fourteen in fact, because `de` and `pl` have no authored guide (§13 Q1).
 */
export function listCorridorPages(): readonly CorridorPageParams[] {
  const pages: CorridorPageParams[] = [];
  for (const locale of routableLocaleCodes()) {
    for (const country of COUNTRY_SET) {
      if (!corridorPageExists(country, locale)) continue;
      pages.push({
        iso2: country,
        locale,
        slug: corridorSlug(country, locale),
        state: corridorState(country, locale),
      });
    }
  }
  return pages;
}

/**
 * The per-locale paths of one destination's corridor page, for `alternatesFor()`'s path target
 * (spec 007 §6 "hreflang set", AC-11).
 *
 * Only locales that genuinely have the page appear, because the slug is per-locale data and a
 * locale with no authored guide has no URL: "a `pl` post without a `de` translation has no `de`
 * alternate" (`plan/02` §8), which is why the `de` and `pl` clusters start empty. Pseudo-locales
 * are absent by construction — `alternatesFor()` filters on `isLocaleIndexable()` — and are not
 * offered here either, so nothing can announce one.
 */
export function corridorAlternatePaths(
  iso2: CountryIso2,
): Readonly<Record<string, string>> {
  const paths: Record<string, string> = {};
  for (const locale of launchLocales()) {
    if (!corridorPageExists(iso2, locale.code)) continue;
    paths[locale.code] = localePath(
      locale.code,
      "destinations",
      corridorSlug(iso2, locale.code),
    );
  }
  return paths;
}

/** The slug a locale's corridor URL carries — the x-default's for a pseudo-locale prefix. */
export function corridorSlug(iso2: CountryIso2, locale: string): string {
  return countrySlug(iso2, contentLocaleOf(locale) ?? locale);
}

/** The destination whose slug is `slug` in `locale`, or `undefined` — the route's 404 condition. */
export function corridorIso2ForSlug(
  locale: string,
  slug: string,
): CountryIso2 | undefined {
  if (contentLocaleOf(locale) === undefined) return undefined;
  return COUNTRY_SET.find((iso2) => corridorSlug(iso2, locale) === slug);
}

/* -------------------------------------------------------------------------- */
/* The view model                                                             */
/* -------------------------------------------------------------------------- */

/** One crumb of the breadcrumb trail. `href` is absent when the target is not published. */
export interface CorridorCrumb {
  /** Message key for the visible label — never a literal (`CLAUDE.md`, §7). */
  readonly labelKey: string;
  readonly href: string | undefined;
  /** The leaf carries `aria-current="page"` and is never a link (spec 007 §5.3). */
  readonly current: boolean;
}

/** The delivery-facts block: `operations` when they were authored, nothing invented when not. */
export interface CorridorFactsView {
  readonly known: boolean;
  /** Present only in the live state, where the registry has a complete block. */
  readonly operations: CountryOperations | undefined;
  /** `destinations.{iso}.cities` — the registry refuses one on a non-`live` destination. */
  readonly citiesKey: string | undefined;
}

/** One dated occasion, ready to format. No date literal reaches a component (AC-22). */
export interface CorridorOccasionView {
  readonly occasionKey: string;
  /** `catalog.facet.occasion.*` — the occasion's name in the reader's language. */
  readonly labelKey: string;
  /** `YYYY-MM-DD` in the destination's calendar; `formatDate` renders it (AC-22). */
  readonly date: IsoDate;
  /** The `plan/03` §9 rule the date was computed from — the artboards print it. */
  readonly ruleKind: OccasionRuleKind;
}

/** An occasion the destination keeps but nobody can date (`rule: none`). Never given a date. */
export interface CorridorUndatedOccasionView {
  readonly occasionKey: string;
  readonly labelKey: string;
}

/** A related destination that genuinely has a page in this locale. */
export interface CorridorRelatedView {
  readonly iso2: string;
  /** `destinations.{iso}.name`. */
  readonly nameKey: string;
  /** `destinations.state.*` — the same two states the finder and the grid print. */
  readonly stateKey: string;
  readonly href: string;
}

/**
 * Data this spec does not own, supplied by spec 005/008 "when there is a price to show **and a
 * shop to enter**" and by the AC-8 fixtures meanwhile.
 *
 * **The two slots have two different conditions, and they always did** (spec 008 AC-20;
 * TASK-113). Each field's own rule is written on it below, and neither is `corridorState()`:
 *
 *  - `fromPrice` is a **price**, and a price on a guide page is a Phase 1 claim: it is absent
 *    until the destination is operationally live, because quoting a price beside "we are still
 *    choosing florists" is the unfair-practice risk `plan/07` §4 names;
 *  - `shopEntryHref` is a **link to a page that already exists**. `/en/poland/flowers` has served
 *    200 with 84 priced products since PR #89, and the section it opens says "See what can
 *    arrive in Poland" — no delivery date, no cutoff, no basket. Suppressing it while the country
 *    is `guide` does not make the page more honest; it makes 294 URLs unreachable, which is what
 *    it did until this task (see `src/modules/catalog/shop-entry.ts` for the measurement).
 */
export interface CorridorLiveSlots {
  /**
   * Visible "from" text, already formatted by `formatMoney` — never an `Offer` (§6). **Live
   * destinations only**, applied in `corridorView()` below.
   */
  readonly fromPrice?: string | undefined;
  /**
   * The shop entry's target, when its link id is published **and** the target exists — the two
   * conditions this field has always stated, and the only two. Answered once, for both, by
   * `corridorShopEntry()` in `src/modules/catalog`, which is where the catalogue may be read.
   */
  readonly shopEntryHref?: string | undefined;
}

/** Everything the corridor page renders, and nothing it does not. */
export interface CorridorView {
  readonly iso2: CountryIso2;
  readonly locale: string;
  readonly slug: string;
  readonly path: string;
  readonly state: CorridorState;
  readonly nameKey: string;
  readonly stateKey: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly h1: string;
  readonly intro: string;
  readonly body: string;
  readonly localFlowers: string;
  readonly taboos: string;
  readonly faq: readonly FaqItem[];
  readonly reviewed: boolean;
  readonly updatedAt: string;
  readonly breadcrumb: readonly CorridorCrumb[];
  readonly facts: CorridorFactsView;
  /** `undefined` — not `[]` — when the destination has no rules: the block is then absent. */
  readonly occasions: readonly CorridorOccasionView[] | undefined;
  readonly undatedOccasions: readonly CorridorUndatedOccasionView[] | undefined;
  /** `undefined` when no authored target has a page here: heading included, nothing renders. */
  readonly related: readonly CorridorRelatedView[] | undefined;
  readonly liveSlots: CorridorLiveSlots;
}

export interface CorridorViewOptions {
  /**
   * The first day of the calendar window, `YYYY-MM-DD`. The route passes the build's date; a test
   * passes a fixed one, which is what keeps a rendered calendar assertable without a frozen clock.
   */
  readonly from: IsoDate;
  readonly liveSlots?: CorridorLiveSlots;
}

function crumbsFor(
  locale: string,
  country: CountryIso2,
  slug: string,
): readonly CorridorCrumb[] {
  return [
    {
      labelKey: "common.homeLink",
      href: localePath(locale, "home"),
      current: false,
    },
    {
      labelKey: "breadcrumb.destinations",
      // Text, never a link to a 404, while the hub's id is unpublished (spec 004 AC-14).
      href: destinationsHubHref(locale),
      current: false,
    },
    {
      labelKey: countryConfig(country).nameKey,
      href: localePath(locale, "destinations", slug),
      current: true,
    },
  ];
}

function occasionViews(
  iso2: CountryIso2,
  from: IsoDate,
): readonly CorridorOccasionView[] {
  return upcomingOccasions(iso2, from, CORRIDOR_CALENDAR_MONTHS).map(
    (occasion) => ({
      occasionKey: occasion.occasionKey,
      labelKey: occasionByKey(occasion.occasionKey).labelKey,
      date: occasion.date,
      ruleKind: ruleKindOf(iso2, occasion.occasionKey),
    }),
  );
}

/** The rule type behind a dated occasion, for the calendar's third column. */
function ruleKindOf(iso2: string, occasionKey: string): OccasionRuleKind {
  const row = committedOccasionCalendar.find(
    (candidate) =>
      candidate.countryIso2 === iso2 && candidate.occasionKey === occasionKey,
  );
  /* c8 ignore next -- every dated occasion came from a row of this table. */
  return row?.ruleType ?? "none";
}

function relatedViews(
  view: CorridorContentView,
  locale: string,
): readonly CorridorRelatedView[] {
  return relatedCorridorViews(view.iso2, view.locale, view.state).flatMap(
    (target) => {
      if (!isCountryIso2(target.iso2)) return [];
      if (!corridorPageExists(target.iso2, locale)) return [];
      const country = countryConfig(target.iso2);
      return [
        {
          iso2: target.iso2,
          nameKey: country.nameKey,
          stateKey: corridorStateKey(corridorState(target.iso2, locale)),
          href: localePath(
            locale,
            "destinations",
            corridorSlug(target.iso2, locale),
          ),
        },
      ];
    },
  );
}

/**
 * The corridor page's whole view model, or `undefined` when the page does not exist — which the
 * route answers with `notFound()` rather than with an empty page.
 */
export function corridorView(
  iso2: string,
  locale: string,
  options: CorridorViewOptions,
): CorridorView | undefined {
  if (!isCountryIso2(iso2)) return undefined;
  if (!corridorPageExists(iso2, locale)) return undefined;
  const state = corridorState(iso2, locale);
  const contentLocale = contentLocaleOf(locale) ?? locale;
  const content = corridorContentView(iso2, contentLocale, state);
  /* c8 ignore next -- `corridorPageExists` has already proved the file is there. */
  if (content === undefined) return undefined;

  const country = countryConfig(iso2);
  const slug = corridorSlug(iso2, locale);
  const occasions = occasionViews(iso2, options.from);
  const undated = observedUndatedOccasions(iso2).map((occasionKey) => ({
    occasionKey,
    labelKey: occasionByKey(occasionKey).labelKey,
  }));
  const related = relatedViews(content, locale);

  return {
    iso2,
    locale,
    slug,
    path: localePath(locale, "destinations", slug),
    state,
    nameKey: country.nameKey,
    stateKey: corridorStateKey(state),
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    h1: content.h1,
    intro: content.intro,
    body: content.body,
    localFlowers: content.localFlowers,
    taboos: content.taboos,
    faq: content.faq,
    reviewed: content.reviewed,
    updatedAt: content.updatedAt,
    breadcrumb: crumbsFor(locale, iso2, slug),
    facts: {
      known: state === "live",
      operations: state === "live" ? country.operations : undefined,
      citiesKey: state === "live" ? country.citiesKey : undefined,
    },
    occasions: occasions.length === 0 ? undefined : occasions,
    undatedOccasions: undated.length === 0 ? undefined : undated,
    related: related.length === 0 ? undefined : related,
    // Per-slot, not per-state (see `CorridorLiveSlots`): the **price** waits for an operationally
    // live destination, the **shop entry** waits only for a shop root that exists and a link id
    // that is published — which is spec 008 AC-20's "the corridor page renders them as links",
    // unsatisfiable in Phase 0 by any live-only gate because no country is live in Phase 0.
    liveSlots: {
      ...(state === "live" && options.liveSlots?.fromPrice !== undefined
        ? { fromPrice: options.liveSlots.fromPrice }
        : {}),
      ...(options.liveSlots?.shopEntryHref === undefined
        ? {}
        : { shopEntryHref: options.liveSlots.shopEntryHref }),
    },
  };
}
