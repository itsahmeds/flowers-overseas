/**
 * The content half of the corridor view model (spec 007 §5.2 "`corridorView`", §5.3, AC-4;
 * TASK-087).
 *
 * `corridorView()` proper — states, facts, the occasion calendar, the link slots — is the route
 * task's; what exists here is the part that comes from authored copy, built **only** through the
 * provider seam. That is what makes AC-4 measurable today: swapping
 * `staticCountryContentProvider` for a fake changes what a page would render, and the swap lives
 * inside `src/modules/geo/`.
 *
 * Two rules the later blocks inherit:
 *
 *  - **A block whose data is missing renders nothing.** The view model carries `undefined` for an
 *    unauthored (country, locale, state) rather than an empty shell, so a caller cannot render a
 *    heading with nothing under it (the `TrustMarks` empty-state rule of spec 004 §5.3).
 *  - **The view model is the single source.** The page, the `FAQPage` builder and the sitemap row
 *    read the same object, so structured data is incapable of describing something the page does
 *    not render (`plan/02` §15).
 */
import { getCountryContentProvider } from "./provider.ts";
import type {
  CorridorState,
  CountryLocaleContent,
  FaqItem,
} from "./schemas.ts";

/** What a corridor page renders from authored copy, and nothing else. */
export interface CorridorContentView {
  readonly iso2: string;
  readonly locale: string;
  readonly state: CorridorState;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly h1: string;
  readonly intro: string;
  readonly body: string;
  readonly faq: readonly FaqItem[];
  readonly localFlowers: string;
  readonly taboos: string;
  readonly relatedIso2: readonly string[];
  /** `content.reviewed` — one of the four inputs to `indexability()` (spec 007 §6). */
  readonly reviewed: boolean;
  /** The `<lastmod>` candidate this record contributes (`plan/02` §10: never "now"). */
  readonly updatedAt: string;
}

function viewOf(content: CountryLocaleContent): CorridorContentView {
  return {
    iso2: content.iso2,
    locale: content.locale,
    state: content.state,
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    h1: content.h1,
    intro: content.intro,
    body: content.body,
    faq: content.faq,
    localFlowers: content.localFlowers,
    taboos: content.taboos,
    relatedIso2: content.relatedIso2,
    reviewed: content.reviewed,
    updatedAt: content.updatedAt,
  };
}

/**
 * The authored copy for one (country, locale, state), or `undefined` when nobody has written it.
 * Read through the provider, never through the filesystem: this is the function spec 002/012's
 * database implementation moves under with no call-site change.
 */
export function corridorContentView(
  iso2: string,
  locale: string,
  state: CorridorState,
): CorridorContentView | undefined {
  const content = getCountryContentProvider().get(iso2, locale, state);
  return content === undefined ? undefined : viewOf(content);
}

/**
 * Every authored (country, locale, state) the active provider knows, in its order. The existence
 * rule (`status === 'live' || guidePublished`, plus this set) is the route task's; this is its
 * content half.
 */
export function listCorridorContent(): readonly CorridorContentView[] {
  return getCountryContentProvider().list().map(viewOf);
}
