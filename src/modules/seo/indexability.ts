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
  | "devGallery";

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
};

/** The five terms of the rule, in the order the header documents them. */
export const INDEXABILITY_TERMS = [
  "pageTypeIndexable",
  "exists",
  "reviewed",
  "localeIndexable",
  "indexingEnvironment",
] as const;

export type IndexabilityTerm = (typeof INDEXABILITY_TERMS)[number];

export type IndexabilityTerms = Readonly<Record<IndexabilityTerm, boolean>>;

export interface IndexabilityVerdict {
  /** `true` iff every term holds. The one answer sitemap membership is allowed to read. */
  readonly indexable: boolean;
  /** What `<meta name="robots">` and the `X-Robots-Tag` say. */
  readonly directive: RobotsDirective;
  /** The terms as gathered, so a failure names the gate rather than the page. */
  readonly terms: IndexabilityTerms;
}

/** The pure rule: the conjunction of every term. T-10's table drives exactly this function. */
export function indexability(terms: IndexabilityTerms): RobotsDirective {
  return INDEXABILITY_TERMS.every((term) => terms[term])
    ? INDEX_FOLLOW
    : NOINDEX_FOLLOW;
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
  });
}
