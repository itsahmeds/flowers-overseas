/**
 * The one indexability rule engine (spec 007 §2 "Indexability, canonical, hreflang, robots", §6
 * "Indexability", AC-9 / T-10; `plan/02` §7, §10, §12; ADR-0007; TASK-090).
 *
 * `plan/02` §10's "nothing `noindex` ever appears in a sitemap" and §8's "generated from the same
 * data as the sitemap, so they cannot disagree" are not promises three consumers are asked to
 * keep: the `<meta name="robots">`, the sitemap membership query and the hreflang cluster all call
 * **this** function, and nothing else in `src/` recomputes a directive from the terms. Specs
 * 008–011 register their page types in `PAGE_TYPE_POLICY` below instead of writing a `noindex`
 * branch of their own.
 *
 * ## The rule
 *
 * A page is `index,follow` only when **every** term of `INDEXABILITY_TERMS` holds, and
 * `noindex,follow` otherwise. `follow` never varies: a page we do not want in the index is still a
 * page whose links we want crawled (`plan/02` §7 — the locale chooser, the facets and the demo
 * shop pages are all `noindex,follow`; `nofollow` would strand the crawl).
 *
 *  - `pageTypeIndexable` — some page types can never be indexed whatever their data says: the
 *    locale chooser `/` (`plan/02` §7) and the `/dev/components` gallery (spec 004 AC-28). The
 *    policy is a table rather than a call-site `if`, so a new page type has to state its answer.
 *  - `exists` — spec 007 §6's existence rule for that page type, decided by its owner (for a
 *    corridor: `status === 'live' || guidePublished` **and** an authored content file for that
 *    locale and state; TASK-091 supplies it). A page that does not exist has no URL at all — it
 *    404s rather than rendering `noindex` — so this term is what keeps a *removed* page out of the
 *    sitemap, not a licence to render a thin one.
 *  - `reviewed` — the content record's own `reviewed` flag (`plan/02` §12): copy that no human has
 *    signed off in the target language is never indexable, even when it exists and renders.
 *  - `localeIndexable` — spec 003's `isLocaleIndexable()` (`plan/03` §6.4's ≤5 % unreviewed share
 *    **and** `isLaunch`), so an English page served at `/de/` cannot be indexed.
 *  - `indexingEnvironment` — `isIndexingEnvironment()` (§6 "The environment gate"): production on
 *    the canonical host. Until the §12 flip this term is `false` everywhere, which is why every
 *    page of this spec is built, rendered and tested `noindex` today.
 *
 * ## Shape
 *
 * `indexability(terms)` is the pure rule over the term record — that is what T-10's sixteen-case
 * table drives. `pageIndexability(page, deployment)` is the call site's entry: it *gathers* the
 * terms (locale gate, environment gate, page-type policy) and then asks the same rule, so no
 * caller can gather three of them and forget the fourth.
 */
import { isLocaleIndexable } from "../i18n/index.ts";

import {
  type DeploymentDescriptor,
  isIndexingEnvironment,
} from "./environment.ts";

/** The only two directives this site emits (`plan/02` §7; see the header on `follow`). */
export const INDEX_FOLLOW = "index,follow" as const;
export const NOINDEX_FOLLOW = "noindex,follow" as const;

export type RobotsDirective = typeof INDEX_FOLLOW | typeof NOINDEX_FOLLOW;

/**
 * Every page type the engine knows. A spec that adds a page type adds it here **and** to
 * `PAGE_TYPE_POLICY`, which is a type error until it does.
 */
export type SeoPageType =
  | "localeChooser"
  | "localeHome"
  | "destinationsHub"
  | "corridor"
  | "devGallery"
  // Spec 008 §2's six listing page types, registered here rather than branching there (spec 008
  // §6 "Indexability — one engine, six descriptors", AC-14; TASK-107). `catalog/listing.ts`
  // gathers their terms and calls `pageIndexability()`; no robots literal is written outside this
  // module.
  | "countryShopRoot"
  | "countryCategory"
  | "countryOccasion"
  | "categoryHub"
  | "occasionHub"
  | "occasionsIndex"
  // Spec 009 §6's product detail page, registered here rather than branching there (spec 009
  // AC-16, "no new `noindex` branch in this spec"; TASK-125). `catalog/product.ts` gathers its
  // terms — every one of them **stated**, none omitted — and calls `pageIndexability()`.
  | "product";

/**
 * Whether a page type may ever be indexed (`plan/02` §7; spec 004 AC-28; spec 007 §6).
 * `"never"` is a structural answer — no data flip can lift it — and `"byRule"` means the four
 * data terms decide.
 */
export const PAGE_TYPE_POLICY: Readonly<
  Record<SeoPageType, "never" | "byRule">
> = {
  // `plan/02` §7 "Locale chooser `/`: noindex,follow" — it is a redirect surface, not content.
  localeChooser: "never",
  // spec 004 AC-28: a development affordance, refused in production by the env schema.
  devGallery: "never",
  localeHome: "byRule",
  destinationsHub: "byRule",
  corridor: "byRule",
  // Spec 008 §6: all six are `byRule`. In Phase 0 every one of them answers `noindex,follow`
  // because no country is operational and `isIndexingEnvironment()` is false — a data answer, not
  // a policy one, which is what lets the hubs lift at the indexing flip with no edit here.
  countryShopRoot: "byRule",
  countryCategory: "byRule",
  countryOccasion: "byRule",
  categoryHub: "byRule",
  occasionHub: "byRule",
  occasionsIndex: "byRule",
  // Spec 009 §6: `index,follow` iff the page exists **and** its destination is genuinely live
  // **and** the product is indexable there **and** the locale is **and** this is the indexing
  // environment. Every PDP answers `noindex,follow` in Phase 0 by data, not by policy.
  product: "byRule",
};

/**
 * The terms of the rule, in the order the header documents them.
 *
 * `operational` is spec 008 §6's sixth term (TASK-107, spec 007 §14 **A7**): "the country is
 * genuinely `live` (`corridorState(iso2) === 'live'`, i.e. an active partner exists)". It is
 * **optional** on the term record, because it is a gate only the three country-scoped listing
 * types have: a corridor guide, a locale home and a hub are honest pages before any florist has
 * signed, and forcing every descriptor to assert `operational: true` would turn a gate into a
 * ritual. A7 fixes what "optional" means: an omitted optional term is **not asserted by this page
 * type** — it leaves the conjunction — and is never *satisfied by default*, which is how an
 * omitted **required** term used to buy itself an `index` directive. A page type that has the gate
 * must state it, which is what `catalog/listing.ts` does for all three.
 */
export const INDEXABILITY_TERMS = [
  "pageTypeIndexable",
  "exists",
  "reviewed",
  "localeIndexable",
  "indexingEnvironment",
  "operational",
  "unparameterised",
] as const;

export type IndexabilityTerm = (typeof INDEXABILITY_TERMS)[number];

/**
 * The terms that may be omitted: not every page type has an operational gate (§6), and not every
 * page type can be reached with a query string.
 *
 * `unparameterised` is spec 008 §6's "any URL carrying a sort or facet parameter is
 * `noindex,follow`, always, canonical to the base" (AC-15; TASK-114) — registered here for the
 * reason `operational` was (spec 007 §14 **A7**): it is a *term*, not a second `noindex` branch.
 * It can only remove `index`, it lives where §2 sends specs 008–011, and AC-14's "no robots
 * literal outside `modules/seo`" holds. `?page=N` is deliberately **not** part of it: a paginated
 * URL is a real page that inherits the base page's directive and is self-canonical (`plan/02` §7),
 * so the term names the parameters that make a *duplicate*, not the one that makes a page.
 */
export type OptionalIndexabilityTerm = "operational" | "unparameterised";

export type IndexabilityTerms = Readonly<
  Record<Exclude<IndexabilityTerm, OptionalIndexabilityTerm>, boolean>
> &
  Readonly<Partial<Record<OptionalIndexabilityTerm, boolean>>>;

export interface IndexabilityVerdict {
  /** `true` iff every term holds. The one answer sitemap membership is allowed to read. */
  readonly indexable: boolean;
  /** What `<meta name="robots">` and the `X-Robots-Tag` say. */
  readonly directive: RobotsDirective;
  /** The terms as gathered, so a failure names the gate rather than the page. */
  readonly terms: IndexabilityTerms;
}

/** The terms a page type may omit, as data (spec 007 §14 A7); the type above says the same. */
export const OPTIONAL_INDEXABILITY_TERMS = [
  "operational",
  "unparameterised",
] as const satisfies readonly IndexabilityTerm[];

function isOptionalTerm(term: IndexabilityTerm): boolean {
  return (OPTIONAL_INDEXABILITY_TERMS as readonly IndexabilityTerm[]).includes(
    term,
  );
}

/**
 * The pure rule: the conjunction of every term. T-10's table drives exactly this function.
 *
 * **An absent term is not a satisfied term** (spec 007 §14 A7). An absent *optional* term is one
 * this page type does not assert, so it leaves the conjunction; an absent *required* term is a
 * gate nobody answered, and the safe answer to that is `noindex`. The earlier `terms[term] ?? true`
 * read both as satisfied — the one direction a robots rule must not fail in.
 */
export function indexability(terms: IndexabilityTerms): RobotsDirective {
  const holds = INDEXABILITY_TERMS.every((term) => {
    const asserted: boolean | undefined = terms[term];
    if (asserted === undefined) return isOptionalTerm(term);
    return asserted;
  });
  return holds ? INDEX_FOLLOW : NOINDEX_FOLLOW;
}

/** The same rule, with the terms carried so a caller can report *why* a page is `noindex`. */
export function indexabilityVerdict(
  terms: IndexabilityTerms,
): IndexabilityVerdict {
  const directive = indexability(terms);
  return {
    indexable: directive === INDEX_FOLLOW,
    directive,
    terms: { ...terms },
  };
}

/** One page, described by its owner: the page type, its locale and its two data gates. */
export interface PageDescriptor {
  readonly pageType: SeoPageType;
  /** Locale code as it appears in the URL (`en`, `en-gb`, `de`, `pl`). */
  readonly locale: string;
  /** Spec 007 §6's existence rule for this page type, decided by the page's owner. */
  readonly exists: boolean;
  /** The content record's `reviewed` flag (`plan/02` §12). */
  readonly reviewed: boolean;
  /**
   * Spec 008 §6's operational gate, for the page types that have one: the destination is
   * genuinely live (`corridorState(iso2) === 'live'` — an active partner, not a registry label).
   * Omitted where the page type has no such gate, and an omitted term reads as satisfied.
   */
  readonly operational?: boolean;
  /**
   * Spec 008 §6's parameter gate (AC-15; TASK-114): `false` when this request's URL carries a
   * **sort or facet** parameter, which makes it a duplicate of the base URL and therefore
   * `noindex,follow` with a canonical back to that base. Omitted by the page types that take no
   * parameters at all, and never set `false` for `?page=N` — a paginated URL inherits the base
   * page's directive.
   */
  readonly unparameterised?: boolean;
}

/**
 * Gather the terms for one page and apply the rule. This is the entry TASK-091's
 * `generateMetadata` and TASK-094's sitemap builder call — both with the *same* descriptor, which
 * is what makes "nothing `noindex` appears in a sitemap" structural.
 */
export function pageIndexability(
  page: PageDescriptor,
  deployment: DeploymentDescriptor,
): IndexabilityVerdict {
  return indexabilityVerdict({
    pageTypeIndexable: PAGE_TYPE_POLICY[page.pageType] === "byRule",
    exists: page.exists,
    reviewed: page.reviewed,
    localeIndexable: isLocaleIndexable(page.locale),
    indexingEnvironment: isIndexingEnvironment(deployment),
    ...(page.operational === undefined
      ? {}
      : { operational: page.operational }),
    ...(page.unparameterised === undefined
      ? {}
      : { unparameterised: page.unparameterised }),
  });
}
