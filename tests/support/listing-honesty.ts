/**
 * **T-06 / AC-6**, written once and used by every layer (spec 008 §8, §9 L261, §10 L309;
 * TASK-108).
 *
 * AC-6 is an *absence* criterion: "No rating, star, review count, badge, delivery-timing claim,
 * strike-through, old price, countdown or add-to-basket appears on any page in any locale." An
 * absence is only worth asserting if the same assertion runs everywhere a listing renders, so the
 * patterns live here and are imported by the component tests (this task), the `/dev/components`
 * e2e scan (this task) and the six-page-type scan of TASK-117.
 *
 * Two kinds of evidence are scanned, because a claim can be made in either:
 *
 *  - **text** — the words a buyer reads, word-bounded, in every locale the listing ships in;
 *  - **markup** — the elements a claim hides in even when its words are translated: `<del>`, `<s>`,
 *    a `line-through` utility, a `<time>` counting down, an `aria-label` mentioning a basket, a
 *    `data-*` hook a later task might wire a badge to.
 *
 * The text patterns are word-bounded for the reason `tests/e2e/honesty.spec.ts` documents: "Start
 * again from the home page" contains `star`, and a substring scan would fail an honest page.
 */

export interface HonestyPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

/** Claims in words. Run against rendered **text**, per locale. */
export const FORBIDDEN_LISTING_TEXT: readonly HonestyPattern[] = [
  { name: "rating", pattern: /\bratings?\b|\brated\b|\bbewertung/iu },
  { name: "star", pattern: /\bstars?\b|\bsterne\b|★|⭐/iu },
  { name: "review", pattern: /\breviews?\b|\brezension|\bopinie\b/iu },
  {
    name: "out-of-five score",
    pattern: /\b\d(?:[.,]\d)?\s*(?:\/|out of)\s*5\b/iu,
  },
  {
    name: "ranking claim",
    pattern:
      /\bbest ?sellers?\b|\bmost popular\b|\brecommended for you\b|\bbestseller/iu,
  },
  {
    name: "delivery-timing claim",
    pattern:
      /\bsame[- ]day\b|\bnext[- ]day\b|\bdeliver(?:ed|y) (?:today|tomorrow)\b|\border within\b/iu,
  },
  {
    name: "countdown",
    pattern: /\bcountdown\b|\bends in\b|\bhurry\b|\b\d+\s*h\s*\d+\s*m\b/iu,
  },
  {
    name: "old price",
    pattern: /\bwas\s*[€£$]|\brrp\b|\bsave\s*\d+%|\b\d+%\s*off\b/iu,
  },
  {
    name: "add to basket",
    pattern:
      /\badd to (?:basket|cart|bag)\b|\bbuy now\b|\bin den warenkorb\b/iu,
  },
  { name: "wishlist", pattern: /\bwish ?list\b|\bquick view\b/iu },
];

/** Claims in markup. Run against rendered **HTML**. */
export const FORBIDDEN_LISTING_MARKUP: readonly HonestyPattern[] = [
  { name: "<del>/<s> strike-through", pattern: /<\/?(?:del|s)[\s>]/iu },
  { name: "line-through styling", pattern: /line-through/iu },
  {
    name: "rating markup",
    pattern: /aria-label="[^"]*\b(?:rating|stars?|review)/iu,
  },
  {
    name: "basket control",
    pattern: /data-fo-(?:basket|cart|add-to-basket)|name="add-to-basket"/iu,
  },
  {
    name: "badge hook",
    pattern: /data-fo-(?:badge|rating|countdown|old-price)/iu,
  },
  {
    name: "itemprop rating",
    pattern: /itemprop="(?:aggregateRating|ratingValue|reviewCount)"/iu,
  },
];

export interface HonestyViolation {
  readonly kind: "text" | "markup";
  readonly name: string;
  readonly match: string;
}

/**
 * Every AC-6 violation in one rendered card, grid or page. Returns the matches rather than
 * throwing, so each caller can name the locale, the URL or the state in its own failure message.
 */
export function listingHonestyViolations(rendered: {
  readonly text: string;
  readonly html: string;
}): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const { name, pattern } of FORBIDDEN_LISTING_TEXT) {
    const hit = pattern.exec(rendered.text);
    if (hit) found.push({ kind: "text", name, match: hit[0] });
  }
  for (const { name, pattern } of FORBIDDEN_LISTING_MARKUP) {
    const hit = pattern.exec(rendered.html);
    if (hit) found.push({ kind: "markup", name, match: hit[0] });
  }
  return found;
}

/** The rendered text of an HTML string, for a layer that has no browser (the component tests). */
export function textOf(html: string): string {
  return html
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/&[a-z]+;|&#\d+;/giu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}
