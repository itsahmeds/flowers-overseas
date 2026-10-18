/**
 * **The head sweep's pure half** (spec 004 §14 A19; spec 007 AC-19; TASK-145). The browser half
 * (`HEAD_READ`) is read and controlled by `tests/e2e/chrome-honesty.spec.ts`; this file pins what
 * the walk collects and what the patterns say about it, with no browser.
 */
import { describe, expect, it } from "vitest";

import {
  HEAD_PATTERNS,
  type HeadRead,
  headOffences,
  headStrings,
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
