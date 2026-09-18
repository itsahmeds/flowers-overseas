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

/**
 * **Ranking claims** — a description of the default order we cannot evidence (spec 008 §8, AC-9;
 * `plan/07` §2.1's ranking-transparency duty; Omnibus Art. 6a / UK DMCC).
 *
 * Split out of `FORBIDDEN_LISTING_TEXT` by TASK-120 so the **chrome** scan can reuse exactly this
 * half: a ranking phrase is forbidden in *every locale's messages*, unconditionally and with no
 * gate, because we have no sales, no personalisation and no paid placement to describe truthfully
 * — which is why `nav.category.bestSellers` was renamed rather than gated. The German and Polish
 * forms are here even though `de`/`pl` ship as English echoes today: the day a native reviewer
 * replaces them, the scan must already know what to look for.
 */
export const FORBIDDEN_RANKING_TEXT: readonly HonestyPattern[] = [
  {
    name: "ranking claim",
    pattern:
      /\bbest ?sellers?\b|\bbestseller|\bmost popular\b|\brecommended for you\b|\bmeistverkauft|\bbeliebteste[nrs]?\b|\bempfohlen f(?:ü|ue)r dich\b|\bnajcz(?:ę|e)(?:ś|s)ciej kupowane\b|\bnajpopularniejsz|\bpolecane dla ciebie\b/iu,
  },
];

/**
 * **Delivery-timing promises** — "same day", "next day", "delivery today", "order by HH:MM"
 * (spec 004 §14 A19; spec 008 AC-6; spec 007 AC-19's forbidden set).
 *
 * Unlike a ranking claim, one of these is not forbidden *copy*: it is copy that may only render
 * when the fact behind it is true. `anyDeliveryDatesOpen()` is the one predicate, false for every
 * destination in Phase 0, so the scans built on these patterns assert an **absence from the
 * rendered document** — and, in the catalogue, that every key carrying one is in the declared
 * gated set (`tests/unit/chrome-honesty.test.tsx`).
 *
 * The bare word "cutoff" is deliberately **not** a pattern, and "order by" counts only when a
 * time follows it: `corridor.facts.orderBy` prints the label `Order by` beside "— no cutoff,
 * because no florist has agreed to one", which is the honest row this whole sweep exists to make
 * possible. What is forbidden is the promise, not the noun.
 */
export const FORBIDDEN_DELIVERY_PROMISE_TEXT: readonly HonestyPattern[] = [
  {
    name: "delivery-timing claim",
    pattern:
      /\bsame[- ]day\b|\bnext[- ]day\b|\bdeliver(?:ed|y|s)? (?:today|tomorrow|the same day)\b|\border within\b|\btaggleiche|\bam selben tag\b|\bnoch heute\b|\bheute geliefert\b|\btego samego dnia\b|\b(?:dostawa )?jeszcze dzi(?:ś|s)/iu,
  },
  {
    name: "order-by cutoff promise",
    pattern:
      /\border by\b[\s,]*(?:\d{1,2}[:.]\d{2}|\{(?:date|time)\})|\bbestellen sie bis\b|\bzam(?:ó|o)w do\b|\bbis \d{1,2}[:.]\d{2} uhr\b/iu,
  },
];

/** Claims in words. Run against rendered **text**, per locale. */
export const FORBIDDEN_LISTING_TEXT: readonly HonestyPattern[] = [
  { name: "rating", pattern: /\bratings?\b|\brated\b|\bbewertung/iu },
  { name: "star", pattern: /\bstars?\b|\bsterne\b|★|⭐/iu },
  { name: "review", pattern: /\breviews?\b|\brezension|\bopinie\b/iu },
  {
    name: "out-of-five score",
    pattern: /\b\d(?:[.,]\d)?\s*(?:\/|out of)\s*5\b/iu,
  },
  ...FORBIDDEN_RANKING_TEXT,
  ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
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
