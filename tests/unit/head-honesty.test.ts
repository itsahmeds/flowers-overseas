/**
 * **The head sweep's pure half** (spec 004 §14 A19; spec 007 AC-19; TASK-145). The browser half
 * (`HEAD_READ`) is read and controlled by `tests/e2e/chrome-honesty.spec.ts`; this file pins what
 * the walk collects and what the patterns say about it, with no browser.
 */
import { describe, expect, it } from "vitest";

import {
  HEAD_META,
  HEAD_PARTNER_NAMES,
  HEAD_PATTERNS,
  type HeadRead,
  headOffences,
  headStrings,
  headStructure,
  normaliseHeadText,
} from "../support/head-honesty.ts";
import {
  FORBIDDEN_DELIVERY_PROMISE_TEXT,
  FORBIDDEN_RANKING_TEXT,
  FORBIDDEN_REVIEW_SHAPES,
} from "../support/listing-honesty.ts";

const CLEAN: HeadRead = {
  title: "Send flowers to Poland: a guide",
  metas: [{ key: "description", content: "How we choose what we send." }],
  jsonLd: [],
};

function withLd(...nodes: unknown[]): HeadRead {
  return { ...CLEAN, jsonLd: nodes.map((node) => JSON.stringify(node)) };
}

describe("the head sweep reads every string a claim could sit in", () => {
  it("returns the title, each meta and every JSON-LD prose string at any depth", () => {
    const read: HeadRead = {
      title: "T",
      metas: [
        { key: "description", content: "D" },
        { key: "og:title", content: "OT" },
        { key: "twitter:description", content: "TD" },
      ],
      jsonLd: [
        JSON.stringify({
          "@graph": [
            { "@type": "Organization", name: "Org", url: "https://x.test" },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  name: "Q",
                  acceptedAnswer: { "@type": "Answer", text: "A" },
                },
              ],
            },
          ],
        }),
      ],
    };

    expect(headStrings(read).map(({ source, text }) => [source, text])).toEqual(
      [
        ["title", "T"],
        ["description", "D"],
        ["og:title", "OT"],
        ["twitter:description", "TD"],
        ["json-ld[0].@graph[0].name", "Org"],
        ["json-ld[0].@graph[1].mainEntity[0].name", "Q"],
        ["json-ld[0].@graph[1].mainEntity[0].acceptedAnswer.text", "A"],
      ],
    );
  });

  it("skips URLs and identifiers, which are not prose", () => {
    const read = withLd({
      "@type": "WebPage",
      url: "https://best-sellers.test",
    });
    expect(headStrings(read).map(({ source }) => source)).toEqual([
      "title",
      "description",
    ]);
  });

  it("throws on a JSON-LD block that is not JSON rather than skipping it", () => {
    expect(() => headStrings({ ...CLEAN, jsonLd: ["{nope"] })).toThrow();
  });
});

describe("the head sweep judges them with the body sweep's patterns", () => {
  it("is exactly the ranking, delivery-timing and review-shaped lists, no second list", () => {
    expect(HEAD_PATTERNS).toEqual([
      ...FORBIDDEN_RANKING_TEXT,
      ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
      ...FORBIDDEN_REVIEW_SHAPES,
      ...HEAD_PARTNER_NAMES,
    ]);
    expect(HEAD_PATTERNS.map(({ name }) => name)).toEqual([
      "ranking claim",
      "delivery-timing claim",
      "order-by cutoff promise",
      "review",
      "rating",
      "star",
      "testimonial",
      "review count",
      "out-of-five score",
      "Trustpilot mark",
      "florist count",
      "partner name",
    ]);
  });

  it("passes a clean head", () => {
    expect(headOffences(CLEAN)).toEqual([]);
  });

  it("passes the pointing-not-promising form of a cutoff (spec 006 §14 A4)", () => {
    expect(
      headOffences({
        ...CLEAN,
        metas: [
          {
            key: "description",
            content:
              "Delivery dates and cutoffs are on the product page, once a florist has agreed one.",
          },
        ],
      }),
    ).toEqual([]);
  });

  it.each([
    [
      "title",
      { ...CLEAN, title: "Best sellers to Poland" },
      "title: ranking claim",
    ],
    [
      "description",
      {
        ...CLEAN,
        metas: [{ key: "description", content: "Same-day delivery in Warsaw" }],
      },
      "description: delivery-timing claim",
    ],
    [
      "og:description",
      {
        ...CLEAN,
        metas: [{ key: "og:description", content: "Order by 14:00" }],
      },
      "og:description: order-by cutoff promise",
    ],
    [
      "JSON-LD description",
      withLd({ "@type": "WebPage", description: "Order by 14:00 in Warsaw" }),
      "json-ld[0].description: order-by cutoff promise",
    ],
    [
      "JSON-LD name",
      withLd({ "@type": "WebPage", name: "Rated 4.8/5 by our buyers" }),
      "json-ld[0].name: rating",
    ],
    [
      "a florist count",
      { ...CLEAN, title: "Flowers from 120 florists" },
      "title: florist count",
    ],
  ])("fails a claim in the %s, naming where", (_where, read, expected) => {
    expect(headOffences(read)).toContain(expected);
  });
});

describe("the head sweep reads every string of the JSON-LD, not a list of keys", () => {
  it("collects headline, reviewBody, alternateName, slogan and handlingTime, which no key list named", () => {
    const read = withLd({
      "@type": "Article",
      headline: "H",
      reviewBody: "RB",
      alternateName: "AN",
      slogan: "SL",
      deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: "HT" },
    });
    expect(
      headStrings(read)
        .filter(({ source }) => source.startsWith("json-ld"))
        .map(({ source, text }) => [source, text]),
    ).toEqual([
      ["json-ld[0].headline", "H"],
      ["json-ld[0].reviewBody", "RB"],
      ["json-ld[0].alternateName", "AN"],
      ["json-ld[0].slogan", "SL"],
      ["json-ld[0].deliveryTime.handlingTime", "HT"],
    ]);
  });

  it.each([
    [
      "headline",
      { headline: "Best sellers to Poland" },
      "headline: ranking claim",
    ],
    [
      "reviewBody",
      { reviewBody: "Rated by 120 reviews" },
      "reviewBody: review",
    ],
    [
      "alternateName",
      { alternateName: "Same-day delivery" },
      "alternateName: delivery-timing claim",
    ],
    ["slogan", { slogan: "Best sellers" }, "slogan: ranking claim"],
    [
      "handlingTime",
      { deliveryTime: { handlingTime: "same day" } },
      "deliveryTime.handlingTime: delivery-timing claim",
    ],
  ])("fails a claim in %s", (_key, node, expected) => {
    expect(headOffences(withLd({ "@type": "Thing", ...node }))).toContain(
      `json-ld[0].${expected}`,
    );
  });

  it("reads strings inside an array, under any key and at the top level", () => {
    expect(
      headOffences(
        withLd({
          "@type": "Thing",
          description: ["Fine", "Same-day delivery"],
        }),
      ),
    ).toEqual(["json-ld[0].description[1]: delivery-timing claim"]);
    expect(headOffences(withLd(["Best sellers"]))).toEqual([
      "json-ld[0][0]: ranking claim",
    ]);
  });

  it("reads every JSON-LD block, the claim in the second one included", () => {
    expect(
      headOffences(
        withLd(
          { "@type": "Organization", name: "Flowers Overseas" },
          { "@type": "WebPage", description: "Order by 14:00 in Warsaw" },
        ),
      ),
    ).toEqual(["json-ld[1].description: order-by cutoff promise"]);
  });

  it("does not read a URL or an @-keyword as prose", () => {
    const read = withLd({
      "@context": "https://schema.org",
      "@id": "https://same-day.test/#org",
      "@type": "Organization",
      url: "https://best-sellers.test/",
      logo: "//cdn.test/same-day.png",
      sameAs: ["https://example.test/interflora"],
      name: "Flowers Overseas",
    });
    expect(headOffences(read)).toEqual([]);
    expect(headStrings(read).map(({ source }) => source)).toEqual([
      "title",
      "description",
      "json-ld[0].name",
    ]);
  });
});

describe("the head sweep flags a review or rating by structure", () => {
  const AGGREGATE = {
    "@type": "Product",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: 120,
      ratingCount: 120,
    },
  };

  it("flags the exact AC-19 shape: every claim key and the AggregateRating type, wherever", () => {
    expect(headStructure(withLd(AGGREGATE))).toEqual([
      "json-ld[0].aggregateRating: review/rating key",
      "json-ld[0].aggregateRating.@type: review/rating type",
      "json-ld[0].aggregateRating.ratingValue: review/rating key",
      "json-ld[0].aggregateRating.reviewCount: review/rating key",
      "json-ld[0].aggregateRating.ratingCount: review/rating key",
    ]);
    expect(headOffences(withLd(AGGREGATE))).toHaveLength(5);
  });

  it("flags review, reviews and reviewRating keys and the Review and Rating types, nested in a graph", () => {
    const read = withLd({
      "@graph": [
        {
          "@type": ["Product", "Review"],
          review: [{ "@type": "Review", reviewRating: { "@type": "Rating" } }],
          reviews: [],
        },
      ],
    });
    expect(headStructure(read)).toEqual([
      "json-ld[0].@graph[0].@type: review/rating type",
      "json-ld[0].@graph[0].review: review/rating key",
      "json-ld[0].@graph[0].review[0].@type: review/rating type",
      "json-ld[0].@graph[0].review[0].reviewRating: review/rating key",
      "json-ld[0].@graph[0].review[0].reviewRating.@type: review/rating type",
      "json-ld[0].@graph[0].reviews: review/rating key",
    ]);
  });

  it("flags nothing in the identity graph a locale home publishes", () => {
    expect(
      headStructure(
        withLd({
          "@graph": [
            { "@type": "Organization", name: "Flowers Overseas" },
            { "@type": "WebSite", name: "Flowers Overseas" },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("the head sweep names the competitor marks and nothing else as a partner", () => {
  it.each(["Interflora", "Euroflorist", "FLEUROP", "kwiaciarnia"])(
    "fails %s in a title",
    (mark) => {
      expect(headOffences({ ...CLEAN, title: `Flowers via ${mark}` })).toEqual([
        "title: partner name",
      ]);
    },
  );

  it("passes the ordinary words the body list also bans: Blumen, fleurs, kwiaty", () => {
    expect(
      headOffences({
        ...CLEAN,
        title: "Blumen verschicken, des fleurs, kwiaty do Polski",
      }),
    ).toEqual([]);
  });
});

describe("the head sweep reads what a person reads", () => {
  it("collapses whitespace, so a claim a line break splits is still read", () => {
    expect(
      headStrings({ ...CLEAN, title: "Order by\n\t 14:00  in  Warsaw" })[0]
        ?.text,
    ).toBe("Order by 14:00 in Warsaw");
    expect(
      headOffences({ ...CLEAN, title: "Order by\n14:00 in Warsaw" }),
    ).toEqual(["title: order-by cutoff promise"]);
    expect(
      headOffences({ ...CLEAN, title: "Order\u00A0by 14:00 in Warsaw" }),
    ).toEqual(["title: order-by cutoff promise"]);
  });

  it.each(["\u2010", "\u2011", "\u2012", "\u2013", "\u2212"])(
    "reads same%sday as same-day",
    (dash) => {
      expect(
        headOffences({ ...CLEAN, title: `Same${dash}day delivery` }),
      ).toEqual(["title: delivery-timing claim"]);
    },
  );

  it("drops a soft hyphen", () => {
    expect(normaliseHeadText("same\u00AD-day")).toBe("same-day");
  });

  it.each([
    [
      "Polish",
      "Najcz\u0119\u015bciej kupowane r\u00f3\u017ce",
      "ranking claim",
    ],
    ["German", "Empfohlen f\u00fcr dich", "ranking claim"],
  ])(
    "composes decomposed %s diacritics, which the patterns spell composed",
    (_language, composed, name) => {
      const decomposed = composed.normalize("NFD");
      expect(decomposed).not.toBe(composed);
      expect(headOffences({ ...CLEAN, title: decomposed })).toEqual([
        `title: ${name}`,
      ]);
    },
  );
});

describe("the head sweep's read list is pinned", () => {
  it("names every meta tag that carries copy", () => {
    expect(HEAD_META).toEqual([
      ["name", "description"],
      ["name", "keywords"],
      ["property", "og:title"],
      ["property", "og:description"],
      ["property", "og:site_name"],
      ["property", "og:image:alt"],
      ["name", "twitter:title"],
      ["name", "twitter:description"],
      ["name", "twitter:image:alt"],
    ]);
  });
});
