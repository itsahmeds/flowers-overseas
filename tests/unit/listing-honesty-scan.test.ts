/**
 * The negative control on `tests/support/listing-honesty.ts` (spec 008 §8, **AC-6**, **T-06**;
 * TASK-108; carried in from `/review 73`).
 *
 * `listingHonestyViolations` is an *absence* assertion used by three layers — the component tests
 * of `tests/unit/ui-shop-components.test.tsx`, the served scan of `tests/e2e/dev-components.spec.ts`
 * and, from TASK-117, the six page types — and every call site reads `toEqual([])`. A scan that
 * matched nothing at all would therefore pass everywhere and go on passing for as long as the
 * patterns were wrong, which is the one failure mode the helper cannot report on itself.
 *
 * So this file asserts the other direction: markup that **does** make a forbidden claim is
 * reported, pattern by pattern, including the five the review named explicitly — "bestseller",
 * "same-day delivery", a `<del>`, a `line-through` utility class and a `data-fo-badge` hook.
 */
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_LISTING_MARKUP,
  FORBIDDEN_LISTING_TEXT,
  listingHonestyViolations,
  textOf,
} from "../support/listing-honesty.ts";

/** A card that says only what AC-6 allows, used as the positive control. */
const HONEST_CARD = `<article data-fo-product-card="FO-BQ-001">
  <div class="photo"></div>
  <h2><bdi>Amber Hour</bdi></h2>
  <span><bdi>£46.90</bdi></span>
  <span>Includes VAT and delivery</span>
  <p data-fo-media-provenance="ai">Example arrangement · our florist hand-makes each one</p>
</article>`;

/** One sample per named text pattern. Each must be reported under exactly that name. */
const TEXT_SAMPLES: readonly (readonly [name: string, html: string])[] = [
  ["rating", "<p>Customer rating: high</p>"],
  ["star", "<p>Four stars from our buyers</p>"],
  ["review", "<p>112 reviews</p>"],
  ["out-of-five score", "<p>4.6 / 5</p>"],
  ["ranking claim", "<p>Bestseller in Poland</p>"],
  ["delivery-timing claim", "<p>Same-day delivery in Warsaw</p>"],
  ["countdown", "<p>Hurry — ends in 2 h 15 m</p>"],
  ["old price", "<p>Was £59.90, save 20%</p>"],
  ["add to basket", "<button>Add to basket</button>"],
  ["wishlist", "<button>Quick view</button>"],
];

/** One sample per named markup pattern. */
const MARKUP_SAMPLES: readonly (readonly [name: string, html: string])[] = [
  ["<del>/<s> strike-through", "<span><del>£59.90</del> £46.90</span>"],
  ["line-through styling", '<span class="line-through">£59.90</span>'],
  ["rating markup", '<span aria-label="rating 4.6 of 5"></span>'],
  ["basket control", '<button data-fo-add-to-basket="FO-BQ-001">Buy</button>'],
  ["badge hook", '<span data-fo-badge="new">New</span>'],
  ["itemprop rating", '<span itemprop="ratingValue" content="4.6">4.6</span>'],
];

describe("listingHonestyViolations reports what AC-6 forbids", () => {
  it("covers every pattern the helper exports, so a new pattern needs a sample", () => {
    expect(TEXT_SAMPLES.map(([name]) => name)).toStrictEqual(
      FORBIDDEN_LISTING_TEXT.map((pattern) => pattern.name),
    );
    expect(MARKUP_SAMPLES.map(([name]) => name)).toStrictEqual(
      FORBIDDEN_LISTING_MARKUP.map((pattern) => pattern.name),
    );
  });

  it.each(TEXT_SAMPLES)("reports the %s claim in the text", (name, html) => {
    const found = listingHonestyViolations({ html, text: textOf(html) });
    expect(found.map((violation) => violation.name)).toContain(name);
    expect(found.filter((violation) => violation.name === name)[0]?.kind).toBe(
      "text",
    );
  });

  it.each(MARKUP_SAMPLES)("reports the %s in the markup", (name, html) => {
    const found = listingHonestyViolations({ html, text: textOf(html) });
    expect(found.map((violation) => violation.name)).toContain(name);
    expect(found.filter((violation) => violation.name === name)[0]?.kind).toBe(
      "markup",
    );
  });

  it("reports all five of the review's planted claims at once", () => {
    const planted = `<article data-fo-badge="new">
      <h2>Amber Hour</h2>
      <p>Bestseller · same-day delivery</p>
      <span class="line-through"><del>£59.90</del></span>
      <span>£46.90</span>
    </article>`;
    const found = listingHonestyViolations({
      html: planted,
      text: textOf(planted),
    });
    expect(found.map((violation) => violation.name).sort()).toStrictEqual(
      [
        "<del>/<s> strike-through",
        "badge hook",
        "delivery-timing claim",
        "line-through styling",
        "ranking claim",
      ].sort(),
    );
  });

  it("reports nothing on a card that says only what AC-6 allows", () => {
    expect(
      listingHonestyViolations({
        html: HONEST_CARD,
        text: textOf(HONEST_CARD),
      }),
    ).toStrictEqual([]);
  });

  it("does not fire on the honest words that contain a forbidden one", () => {
    // The reason every text pattern is word-bounded: "Start again" contains `star`, and
    // "warenkorb" is only a basket when it is the whole word (`tests/e2e/honesty.spec.ts`).
    const honest = "<p>Start again from the home page. Restarted, unrated.</p>";
    expect(
      listingHonestyViolations({ html: honest, text: textOf(honest) }),
    ).toStrictEqual([]);
  });

  it("returns the matched substring, so a failure names what it found", () => {
    const html = "<p>Bestseller</p>";
    const [first] = listingHonestyViolations({ html, text: textOf(html) });
    expect(first?.match.toLowerCase()).toBe("bestseller");
  });
});

describe("textOf is the browser-free half of the scan", () => {
  it("returns the words a buyer reads, and nothing of the markup", () => {
    expect(textOf(HONEST_CARD)).toContain("Amber Hour");
    expect(textOf(HONEST_CARD)).not.toContain("article");
  });

  it("returns an empty string for markup with no text, which is what the e2e guard watches for", () => {
    expect(textOf("<div><span></span></div>")).toBe("");
  });
});
