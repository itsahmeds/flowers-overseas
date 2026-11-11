/**
 * Spec 022a's display (TASK-373): T-23 to T-28 and T-32 at the unit layer, over a fake reader in
 * place of `public_review` (the integration half, `tests/integration/reviews-display.test.ts`,
 * reads the view itself).
 *
 *  - T-23: the policy's existence (flag or data), its eight sections, `noindex` while
 *    `lawyerReviewed` is false, the footer links only while their page exists.
 *  - T-24: 404 at zero and 200 at one; the index minimum at 9 and 10 reviews with text; page 2 of
 *    21; `?page=1` is the bare URL; `?stars=1` parses and malformed queries are no page.
 *  - T-25: a 21-review fixture with one 1-star: the summary, the bars' sum, every card field.
 *  - T-26: the block at 2 and 3 reviews, at most 5 cards, its links.
 *  - T-27: `aggregateRating` on the `Product` node only, equal to the visible summary; named
 *    `review` entries only; no other node gains either.
 *  - T-28: the gate admits review words inside `[data-fo-reviews]` only while reviews exist.
 *  - T-32: the pay step's notice exists in four locales, with no tick box.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { infoPage } from "@/config/info-pages";
import { ratingValueOf } from "@/config/review-rating";
import { REVIEWS_PAGE_INDEX_MINIMUM } from "@/config/reviews";
import { isPublished } from "@/config/site-links";
import { loadMessages } from "@/modules/i18n";
import {
  type ReviewReader,
  missingReviewLinkIds,
  reviewBlockDisplay,
  reviewPolicyLive,
  reviewsPageDisplay,
  reviewsPageExists,
  reviewsPageMeetsIndexMinimum,
  reviewsPageQuery,
} from "@/modules/reviews/display";
import { REVIEW_POLICY_LEAVES } from "@/modules/reviews";
import type {
  PublicReview,
  ReviewScopeFilter,
  ReviewSummary,
} from "@/modules/reviews/public";
import { infoPageMetadata, withProductReviews } from "@/modules/seo";
import { footerView } from "@/modules/ui/layout/footerView";
import {
  RatingSummary,
  ReviewsBlock,
} from "@/modules/ui/reviews/ReviewDisplay";
import { ReviewsPageView } from "@/modules/ui/reviews/ReviewsPageView";

import { cardOf } from "../../src/app/[locale]/reviews-route.tsx";
import { withReviewMarkup } from "../../src/app/[locale]/reviews-blocks.tsx";
import { reviewRegions, reviewsGateFindings } from "../support/reviews-gate.ts";

const ROOT = join(import.meta.dirname, "..", "..");

interface Fixture extends PublicReview {
  readonly sku: string;
}

/** `n` published reviews, newest first: ratings cycle 5,4,5,3 with the `oneStarAt` one a 1. */
function fixtures(
  n: number,
  options: {
    readonly sku?: string;
    readonly iso2?: string;
    readonly oneStarAt?: number;
    readonly withText?: number;
  } = {},
): Fixture[] {
  const cycle = [5, 4, 5, 3];
  return Array.from({ length: n }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    rating: index === options.oneStarAt ? 1 : (cycle[index % 4] ?? 5),
    text:
      index < (options.withText ?? n)
        ? `Lovely flowers, number ${String(index)}.`
        : null,
    display_name: index % 3 === 0 ? "Anna" : null,
    locale_code: index % 2 === 0 ? "en" : "pl",
    published_at: new Date(Date.UTC(2027, 4, 30 - index, 12)),
    delivered_month: new Date(Date.UTC(2027, 3, 1)),
    iso2: options.iso2 ?? "PL",
    response_text: index === 2 ? "Thank you for ordering." : null,
    response_at: index === 2 ? new Date(Date.UTC(2027, 4, 30)) : null,
    withheld_reason: index === 4 ? "abuse" : null,
    sku: options.sku ?? "AMBER-HOUR",
  }));
}

function inScope(
  rows: readonly Fixture[],
  scope: ReviewScopeFilter,
): Fixture[] {
  if (scope === "all") return [...rows];
  if ("productSku" in scope)
    return rows.filter((r) => r.sku === scope.productSku);
  if ("countryIso2" in scope)
    return rows.filter((r) => r.iso2 === scope.countryIso2);
  return [];
}

function summaryOf(rows: readonly Fixture[]): ReviewSummary {
  const count = rows.length;
  const at = (n: number) => rows.filter((r) => r.rating === n).length;
  return {
    average:
      count === 0 ? null : rows.reduce((s, r) => s + r.rating, 0) / count,
    count,
    withText: rows.filter((r) => r.text !== null).length,
    distribution: { 1: at(1), 2: at(2), 3: at(3), 4: at(4), 5: at(5) },
    newestPublishedAt: rows[0]?.published_at ?? null,
  };
}

function reader(rows: readonly Fixture[], inviteOn = false): ReviewReader {
  return {
    summary: (scope) => Promise.resolve(summaryOf(inScope(rows, scope))),
    list: (scope, page, options = {}) => {
      const size = options.pageSize ?? 20;
      const filtered = inScope(rows, scope).filter(
        (r) => options.stars === undefined || r.rating === options.stars,
      );
      return Promise.resolve(filtered.slice((page - 1) * size, page * size));
    },
    inviteFlagOn: () => Promise.resolve(inviteOn),
  };
}

function render(locale: string, node: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, ["reviews", "home", "a11y", "common"])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

describe("T-24: the reviews page's existence, robots term, pagination and query", () => {
  it("answers 404 with zero published reviews and exists with one", async () => {
    expect(await reviewsPageExists(reader([]))).toBe(false);
    expect(await reviewsPageDisplay(1, undefined, reader([]))).toBeUndefined();
    expect(await reviewsPageExists(reader(fixtures(1)))).toBe(true);
    expect(
      (await reviewsPageDisplay(1, undefined, reader(fixtures(1))))?.reviews,
    ).toHaveLength(1);
  });

  it("meets the index minimum at 10 reviews with text and not at 9", () => {
    expect(REVIEWS_PAGE_INDEX_MINIMUM).toBe(10);
    expect(reviewsPageMeetsIndexMinimum(summaryOf(fixtures(9)))).toBe(false);
    expect(reviewsPageMeetsIndexMinimum(summaryOf(fixtures(10)))).toBe(true);
    // Ten published, one of them without visible text: still under the minimum.
    expect(
      reviewsPageMeetsIndexMinimum(summaryOf(fixtures(10, { withText: 9 }))),
    ).toBe(false);
  });

  it("lists 20 per page, newest first: page 2 of 21 holds the oldest, page 3 is no page", async () => {
    const rows = fixtures(21);
    const one = await reviewsPageDisplay(1, undefined, reader(rows));
    const two = await reviewsPageDisplay(2, undefined, reader(rows));
    expect(one?.pages).toBe(2);
    expect(one?.reviews).toHaveLength(20);
    expect(one?.reviews[0]?.id).toBe(rows[0]?.id);
    expect(two?.reviews.map((r) => r.id)).toEqual([rows[20]?.id]);
    expect(
      await reviewsPageDisplay(3, undefined, reader(rows)),
    ).toBeUndefined();
  });

  it("filters by stars, with the filter's own page count", async () => {
    const rows = fixtures(21, { oneStarAt: 7 });
    const ones = await reviewsPageDisplay(1, 1, reader(rows));
    expect(ones?.reviews.map((r) => r.rating)).toEqual([1]);
    expect(ones?.pages).toBe(1);
    expect(await reviewsPageDisplay(2, 1, reader(rows))).toBeUndefined();
  });

  it("parses ?page and ?stars: page=1 is the bare URL, malformed is no page", () => {
    expect(reviewsPageQuery({})).toEqual({
      kind: "page",
      page: 1,
      stars: undefined,
    });
    expect(reviewsPageQuery({ page: "1" })).toEqual({
      kind: "firstPage",
      stars: undefined,
    });
    expect(reviewsPageQuery({ page: "1", stars: "1" })).toEqual({
      kind: "firstPage",
      stars: 1,
    });
    expect(reviewsPageQuery({ page: "2" })).toEqual({
      kind: "page",
      page: 2,
      stars: undefined,
    });
    expect(reviewsPageQuery({ stars: "1" })).toEqual({
      kind: "page",
      page: 1,
      stars: 1,
    });
    for (const bad of [
      { page: "0" },
      { page: "02" },
      { page: "x" },
      { page: "-1" },
      { stars: "6" },
      { stars: "0" },
      { stars: "4.5" },
      { page: ["2", "3"] },
      { stars: ["1", "2"] },
    ]) {
      expect(reviewsPageQuery(bad), JSON.stringify(bad)).toEqual({
        kind: "notFound",
      });
    }
  });
});

describe("T-25: the summary and the cards equal the published set", () => {
  const rows = fixtures(21, { oneStarAt: 9 });
  const summary = summaryOf(rows);
  const html = render(
    "en",
    <ReviewsPageView
      crumbs={[]}
      locale="en"
      page={1}
      pages={2}
      path="/en/reviews"
      policyHref="/en/legal/reviews"
      reviews={rows.slice(0, 20).map(cardOf)}
      stars={undefined}
      summary={summary}
    />,
  );

  it("prints the average to one decimal and the count, and five bars summing to it, the 1 star included", () => {
    const average = /data-fo-review-average="([^"]+)"/u.exec(html)?.[1];
    expect(average).toBe(ratingValueOf(summary.average ?? 0).toFixed(1));
    expect(html).toContain('data-fo-review-count="21"');
    const bars = [...html.matchAll(/data-fo-review-bar-count="(\d+)"/gu)].map(
      (m) => Number(m[1]),
    );
    expect(bars).toHaveLength(5);
    expect(bars.reduce((a, b) => a + b, 0)).toBe(21);
    // Bars run 5 to 1; the last is the planted 1-star review.
    expect(bars.at(-1)).toBe(1);
    expect(html).toContain('href="/en/reviews?stars=1"');
  });

  it("shows each card's stars' text, its words in their own lang, the name or Verified buyer, the badge, the month and country, the reply and the withheld line", () => {
    expect(html).toContain('aria-label="Rated 5 out of 5"');
    expect(html).toMatch(
      /<p[^>]*dir="auto"[^>]*lang="pl"[^>]*>Lovely flowers, number 1\.<\/p>/u,
    );
    expect(html).toContain("<bdi>Anna</bdi>");
    expect(html).toContain("Verified buyer");
    expect(html).toContain("verified order");
    expect(html).toContain("Delivered April 2027 · Poland");
    expect(html).toContain("Reply from Flowers Overseas");
    expect(html).toContain("Thank you for ordering.");
    expect(html).toContain(
      "This review’s comment was withheld: abusive language",
    );
    expect(html).toContain(encodeURIComponent(rows[0]?.id ?? "x"));
    expect(html).toContain('href="/en/legal/reviews"');
    // The pages: page 2 linked, page 1 current, no `?page=1` anywhere.
    expect(html).toContain('href="/en/reviews?page=2"');
    expect(html).not.toContain('page=1"');
  });
});

describe("T-26: the PDP and corridor blocks", () => {
  it("renders with 3 published reviews of the product and not with 2", async () => {
    expect(
      await reviewBlockDisplay(
        { productSku: "AMBER-HOUR" },
        reader(fixtures(2)),
      ),
    ).toBeUndefined();
    const other = [...fixtures(2), ...fixtures(5, { sku: "OTHER" })];
    expect(
      await reviewBlockDisplay({ productSku: "AMBER-HOUR" }, reader(other)),
    ).toBeUndefined();
    expect(
      await reviewBlockDisplay(
        { productSku: "AMBER-HOUR" },
        reader(fixtures(3)),
      ),
    ).toBeDefined();
  });

  it("renders with 3 published reviews of orders to the country and not with 2", async () => {
    expect(
      await reviewBlockDisplay({ countryIso2: "PL" }, reader(fixtures(2))),
    ).toBeUndefined();
    expect(
      await reviewBlockDisplay({ countryIso2: "DE" }, reader(fixtures(3))),
    ).toBeUndefined();
    expect(
      await reviewBlockDisplay({ countryIso2: "PL" }, reader(fixtures(3))),
    ).toBeDefined();
  });

  it("shows at most 5 cards, and links to the reviews page and the policy", async () => {
    const display = await reviewBlockDisplay(
      { productSku: "AMBER-HOUR" },
      reader(fixtures(8)),
    );
    expect(display?.reviews).toHaveLength(5);
    expect(display?.summary.count).toBe(8);
    const html = render(
      "en",
      <ReviewsBlock
        locale="en"
        policyHref="/en/legal/reviews"
        reviews={(display?.reviews ?? []).map(cardOf)}
        reviewsHref="/en/reviews"
        summary={display?.summary ?? summaryOf([])}
      />,
    );
    expect(html.match(/data-fo-review-card=/gu)).toHaveLength(5);
    expect(html).toContain('href="/en/reviews"');
    expect(html).toContain("See all reviews");
    expect(html).toContain('href="/en/legal/reviews"');
    expect(html).toContain("What our customers <em>say</em>");
    expect(reviewRegions(html)).toHaveLength(1);
  });
});

describe("T-27: review markup on the PDP's Product node only, equal to what it shows", () => {
  const product = { "@type": "Product", name: "Amber Hour" } as const;
  const crumbs = { "@type": "BreadcrumbList", itemListElement: [] } as const;

  it("adds aggregateRating equal to the visible summary and a review per visible named card", async () => {
    const display = await reviewBlockDisplay(
      { productSku: "AMBER-HOUR" },
      reader(fixtures(8)),
    );
    if (display === undefined) throw new Error("fixture under the minimum");
    const nodes = withReviewMarkup([crumbs, product], {
      display,
      line: <span />,
      block: <span />,
    });
    expect(nodes[0]).toBe(crumbs);
    const marked = nodes[1] as Record<string, unknown>;
    const html = render(
      "en",
      <RatingSummary
        locale="en"
        starsHref={() => "/"}
        summary={display.summary}
      />,
    );
    const visible = /data-fo-review-average="([^"]+)"/u.exec(html)?.[1];
    expect(marked["aggregateRating"]).toEqual({
      "@type": "AggregateRating",
      ratingValue: Number(visible),
      ratingCount: 8,
      bestRating: 5,
      worstRating: 1,
    });
    const named = display.reviews.filter((r) => r.display_name !== null);
    const entries = marked["review"] as {
      author: { name: string };
      reviewRating: { ratingValue: number };
    }[];
    expect(entries).toHaveLength(named.length);
    expect(entries.length).toBeLessThanOrEqual(5);
    expect(entries.map((e) => e.reviewRating.ratingValue)).toEqual(
      named.map((r) => r.rating),
    );
    expect(entries.every((e) => e.author.name === "Anna")).toBe(true);
  });

  it("puts nothing anywhere when the page has no Product node or no block", () => {
    expect(withReviewMarkup([crumbs, undefined], undefined)).toEqual([
      crumbs,
      undefined,
    ]);
    expect(JSON.stringify(withReviewMarkup([crumbs], undefined))).not.toMatch(
      /aggregateRating|"Review"/u,
    );
    expect(() =>
      withProductReviews(
        { "@type": "Organization" },
        { average: 5, count: 3, cards: [] },
      ),
    ).toThrow();
  });

  it("rounds the markup and the page the same way", () => {
    for (const average of [4.25, 4.45, 4.05, 89 / 20, 13 / 3]) {
      const html = render(
        "en",
        <RatingSummary
          locale="en"
          starsHref={() => "/"}
          summary={{
            average,
            count: 3,
            distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 },
          }}
        />,
      );
      expect(/data-fo-review-average="([^"]+)"/u.exec(html)?.[1]).toBe(
        ratingValueOf(average).toFixed(1),
      );
    }
  });
});

describe("T-28: the honesty gate admits review words only inside a live [data-fo-reviews] region", () => {
  const rows = fixtures(3);
  const block = render(
    "en",
    <ReviewsBlock
      locale="en"
      reviews={rows.map(cardOf)}
      reviewsHref="/en/reviews"
      summary={summaryOf(rows)}
    />,
  );

  it("is green for a region with published reviews", () => {
    expect(
      reviewsGateFindings({ html: `<main>${block}</main>`, published: 3 }),
    ).toEqual([]);
  });

  it("is red for a planted region with zero published reviews", () => {
    expect(
      reviewsGateFindings({ html: `<main>${block}</main>`, published: 0 }),
    ).toContain("a [data-fo-reviews] region with zero published reviews");
  });

  it("is red for a review word outside a region, and admits the footer links only while reviews exist", () => {
    expect(
      reviewsGateFindings({ html: "<p>Read our reviews</p>", published: 3 }),
    ).toContain("review outside [data-fo-reviews]");
    const footer = '<footer><a href="/en/reviews">Reviews</a></footer>';
    expect(
      reviewsGateFindings({
        html: footer,
        published: 3,
        footerLinks: ["Reviews"],
      }),
    ).toEqual([]);
    expect(
      reviewsGateFindings({
        html: footer,
        published: 0,
        footerLinks: ["Reviews"],
      }),
    ).not.toEqual([]);
  });
});

describe("T-23: the policy and the footer links exist with the data", () => {
  it("exists once reviews.invite is on or a review is published", async () => {
    expect(await reviewPolicyLive(reader([]))).toBe(false);
    expect(await reviewPolicyLive(reader([], true))).toBe(true);
    expect(await reviewPolicyLive(reader(fixtures(1)))).toBe(true);
    expect(await missingReviewLinkIds(reader([]))).toEqual([
      "reviews",
      "review-policy",
    ]);
    expect(await missingReviewLinkIds(reader([], true))).toEqual(["reviews"]);
    expect(await missingReviewLinkIds(reader(fixtures(1)))).toEqual([]);
  });

  it("lives at its three URLs, under the legal machinery, with the registry's leaves", () => {
    const entry = infoPage("review-policy");
    expect(entry.family).toBe("legal");
    expect(entry.leafSlugs?.["en"]).toBe(REVIEW_POLICY_LEAVES.en);
    expect(entry.leafSlugs?.["de"]).toBe(REVIEW_POLICY_LEAVES.de);
    expect(entry.leafSlugs?.["pl"]).toBe(REVIEW_POLICY_LEAVES.pl);
  });

  it.each(["en", "en-gb", "de", "pl"])(
    "carries the eight sections of §8 in %s and is noindex while lawyerReviewed is false",
    (locale) => {
      const file = readFileSync(
        join(ROOT, "content/legal", locale, "review-policy.md"),
        "utf8",
      );
      const ids = [...file.matchAll(/\{#([a-z-]+)\}/gu)].map((m) => m[1]);
      expect(ids).toEqual([
        "who-can-review",
        "how-we-check",
        "what-we-publish",
        "moderation",
        "replies",
        "no-rewards",
        "trustpilot",
        "report",
      ]);
      expect(file).toMatch(/^lawyerReviewed: false$/mu);
      expect(file).not.toMatch(/[–—]/u);
      const head = infoPageMetadata("review-policy", locale, {
        environment: "production",
        siteUrl: "https://flowersoverseas.com",
      });
      expect(head?.robots).toBe("noindex,follow");
    },
  );

  it("links the footer to both only while their page exists", () => {
    expect(isPublished("reviews")).toBe(true);
    expect(isPublished("review-policy")).toBe(true);
    const hrefs = (unavailable: string[]) =>
      [
        ...footerView("de", { unavailable }).columns,
        footerView("de", { unavailable }).legal,
      ]
        .flatMap((group) => group.links)
        .filter((link) => link.id === "reviews" || link.id === "review-policy")
        .map((link) => ("href" in link ? link.href : undefined));
    expect(hrefs([])).toEqual([
      "/de/bewertungen",
      "/de/rechtliches/bewertungsrichtlinie",
    ]);
    expect(hrefs(["reviews", "review-policy"])).toEqual([undefined, undefined]);
  });
});

describe("T-32: the pay step's review notice", () => {
  it.each(["en", "en-gb", "de", "pl"])("exists in %s", (locale) => {
    const messages = loadMessages(locale, ["checkout"]) as {
      checkout: { reviewNotice?: string };
    };
    expect(messages.checkout.reviewNotice).toMatch(/\S/u);
    expect(messages.checkout.reviewNotice).not.toMatch(/[–—]/u);
  });

  it("is printed by the pay step as a line, with no tick box", () => {
    const source = readFileSync(
      join(ROOT, "src/app/[locale]/(checkout)/_views/PayStep.tsx"),
      "utf8",
    );
    const at = source.indexOf('all("checkout.reviewNotice")');
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at - 200, at + 100)).toMatch(/<p\b/u);
    expect(source).not.toMatch(/type="checkbox"/u);
  });
});
