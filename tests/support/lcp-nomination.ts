/**
 * AC-24's nomination, read off rendered markup (spec 008 §9 **AC-24**, T-24; spec 006 AC-19;
 * `src/modules/ui/shop/ListingGrid.tsx`, `src/modules/ui/media/MediaAsset.tsx`).
 *
 * > **AC-24** Exactly one image per page carries `priority` and has a matching
 * > `<link rel="preload">` built from the same manifest lookup as its `srcset`; **it is the first
 * > product photo**; initial image transfer is ≤204 800 B per page; CLS across the
 * > placeholder→image swap is 0.
 *
 * **What it requires of a page whose first card has no photograph.** Spec 006 §5.3's placeholder
 * renders *no `<img>`* — it is a captioned box — so on such a page there is no first product photo
 * to nominate, and "exactly one" has nothing to range over. The rule that still bites, and the one
 * these helpers exist to assert, is the rest of the sentence: **the nomination is the first card's
 * photograph and nothing else.** Zero photographs therefore means zero nominations — not a
 * preload of a photograph further down the grid (the LCP element is the first card's box, so
 * preloading a lazy tile below it spends the LCP budget on a resource the LCP element never uses),
 * and not a preload of an asset the page did not render. That is a *falsifiable* zero: a page that
 * nominated anything at all fails it.
 *
 * So both counts below are compared against **the first card's own photograph**, never against the
 * page's other output: `preloaded` must equal `[]` when the first card is a placeholder and
 * `[that photograph's descriptor]` when it is not. The descriptor is the pair React's `preload()`
 * emits — `imagesrcset`/`imagesizes` — and `MediaAsset` builds it from the very `ResolvedImage`
 * the `<picture>` rendered from (`preloadArgsFor`), so comparing it to the first `<source>` of the
 * first card is AC-24's "built from the same manifest lookup as its `srcset`" as a markup fact.
 *
 * The browser-side twin of these assertions is in `tests/e2e/country-category.spec.ts` and
 * `tests/e2e/country-occasion.spec.ts`; the byte budgets of AC-24's second half are
 * `tests/e2e/media-budgets.spec.ts`'s.
 */

/** The `imagesrcset`/`imagesizes` pair of one image preload, or of one rendered `<source>`. */
export interface ImageDescriptor {
  readonly srcset: string;
  readonly sizes: string;
}

export interface LcpNominations {
  /** Every `<img>` in the document: placeholders render none (spec 006 §5.3). */
  readonly images: number;
  /** `loading="eager"` — nothing but the nominated image may be eager. */
  readonly eager: number;
  /**
   * `fetchpriority="high"`. Matched case-insensitively because `renderToStaticMarkup` writes
   * React's `fetchPriority` while the DOM attribute is `fetchpriority`.
   */
  readonly high: number;
  /** One descriptor per `<link rel="preload" as="image">`, in document order. */
  readonly preloaded: readonly ImageDescriptor[];
}

function attribute(tag: string, name: string): string {
  return new RegExp(`\\s${name}="([^"]*)"`, "iu").exec(tag)?.[1] ?? "";
}

export function lcpNominations(html: string): LcpNominations {
  const links = html.match(/<link[^>]*>/giu) ?? [];
  const preloads = links.filter(
    (link) => /rel="preload"/iu.test(link) && /as="image"/iu.test(link),
  );
  return {
    images: (html.match(/<img[\s>]/gu) ?? []).length,
    eager: (html.match(/loading="eager"/gu) ?? []).length,
    high: (html.match(/<img[^>]*fetchpriority="high"/giu) ?? []).length,
    preloaded: preloads.map((link) => ({
      srcset: attribute(link, "imagesrcset"),
      sizes: attribute(link, "imagesizes"),
    })),
  };
}

/**
 * The descriptor of the **first product card's** photograph — the one image AC-24 permits a page
 * to nominate — or `undefined` when that card is a placeholder. Scoped to the first card's own
 * markup on purpose: a photograph on the third card must not satisfy an assertion about the
 * first.
 */
export function firstCardPhotograph(html: string): ImageDescriptor | undefined {
  const first = html.indexOf("data-fo-product-card=");
  if (first === -1) return undefined;
  const next = html.indexOf("data-fo-product-card=", first + 1);
  const card = html.slice(first, next === -1 ? undefined : next);
  const source = /<source[^>]*>/iu.exec(card)?.[0];
  if (source === undefined) return undefined;
  return {
    srcset: attribute(source, "srcset"),
    sizes: attribute(source, "sizes"),
  };
}

/**
 * The zero-based index of the product card holding the nominated `<img>`, or `undefined` when the
 * page nominates none. AC-24's "it is the first product photo" as a number, so a nomination that
 * moved to the second card fails an assertion instead of passing one.
 *
 * Matched on `<img …>` rather than on the bare attribute because the preload `<link>` carries
 * `fetchpriority="high"` too, and React hoists it above every card.
 */
export function nominatedImageCard(html: string): number | undefined {
  const nominated = /<img[^>]*fetchpriority="high"/iu.exec(html)?.index;
  if (nominated === undefined) return undefined;
  const cards = [...html.matchAll(/data-fo-product-card=/gu)].map(
    (match) => match.index,
  );
  const holding = cards.filter((start) => start < nominated).length - 1;
  return holding < 0 ? undefined : holding;
}

/**
 * What `lcpNominations().preloaded` must equal for a page whose first card renders `photograph`:
 * exactly one descriptor, or none at all. Written as a list so the assertion is one `toEqual`
 * that can fail on either side — a missing nomination, a second one, or one built from a
 * different lookup than the `<picture>` it belongs to.
 */
export function expectedPreloads(
  photograph: ImageDescriptor | undefined,
): readonly ImageDescriptor[] {
  return photograph === undefined ? [] : [photograph];
}
