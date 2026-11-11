/**
 * The florist rating, the acceptance rate and the cache tags without a database (spec 022a §10
 * T-21, T-22 unit half, T-30; AC-21, AC-22, AC-30; TASK-372).
 *
 *  - T-21: `partnerRatingBp` is null for 2 ratings, 10000 for [5, 5, 5], 8667 for [5, 4, 4],
 *    9000 for [5, 4, 5, 4]; removed reviews and reviews older than 90 days are not counted (89 d
 *    23 h in, 90 d 1 s out); `acceptanceRateBp` is null under 5 answered offers, excludes
 *    withdrawn offers, and is 6667 for 4 accepted, 1 declined and 1 timed out;
 *  - T-22: spec 016's routing reads a null rating as 9000;
 *  - T-30: each review's tags are exactly `reviews`, `reviews:product:{id}` and
 *    `reviews:country:{iso2}`.
 */
import { describe, expect, it } from "vitest";

import { ROUTING_RANKING } from "@/config/routing";
import {
  acceptanceRateBp,
  type OfferInput,
  partnerRatingBp,
  type RatingInput,
} from "@/modules/partners";
import { reviewTags } from "@/modules/reviews";

const NOW = new Date("2027-05-01T12:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ratings = (values: readonly number[], ageMs = DAY): RatingInput[] =>
  values.map((rating) => ({
    rating,
    createdAt: new Date(NOW.getTime() - ageMs),
    removed: false,
  }));

const offer = (
  response: OfferInput["response"],
  withdrawn = false,
  ageMs = DAY,
): OfferInput => ({
  response,
  respondedAt: response === null ? null : new Date(NOW.getTime() - ageMs),
  withdrawn,
});

describe("T-21: partnerRatingBp", () => {
  it("holds the criterion's examples", () => {
    expect(partnerRatingBp(ratings([5, 5]), NOW)).toBeNull();
    expect(partnerRatingBp(ratings([5, 5, 5]), NOW)).toBe(10_000);
    expect(partnerRatingBp(ratings([5, 4, 4]), NOW)).toBe(8667);
    expect(partnerRatingBp(ratings([5, 4, 5, 4]), NOW)).toBe(9000);
  });

  it("excludes removed reviews", () => {
    const input = [
      ...ratings([5, 4, 4]),
      { ...ratings([1])[0]!, removed: true },
    ];
    expect(partnerRatingBp(input, NOW)).toBe(8667);
    expect(
      partnerRatingBp(
        [...ratings([5, 5]), { ...ratings([5])[0]!, removed: true }],
        NOW,
      ),
    ).toBeNull();
  });

  it("counts 89 d 23 h and not 90 d 1 s", () => {
    const edge = [...ratings([5, 5]), ...ratings([2], 89 * DAY + 23 * HOUR)];
    expect(partnerRatingBp(edge, NOW)).toBe(8000);
    const out = [...ratings([5, 5]), ...ratings([2], 90 * DAY + 1000)];
    expect(partnerRatingBp(out, NOW)).toBeNull();
  });
});

describe("T-21: acceptanceRateBp", () => {
  it("is null under 5 answered offers", () => {
    expect(
      acceptanceRateBp(
        [
          offer("accept"),
          offer("accept"),
          offer("decline"),
          offer("timeout"),
          offer(null),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("is 6667 for 4 accepted, 1 declined, 1 timed out; withdrawn offers excluded", () => {
    const base = [
      offer("accept"),
      offer("accept"),
      offer("accept"),
      offer("accept"),
      offer("decline"),
      offer("timeout"),
    ];
    expect(acceptanceRateBp(base, NOW)).toBe(6667);
    expect(
      acceptanceRateBp(
        [...base, offer("decline", true), offer("decline", true)],
        NOW,
      ),
    ).toBe(6667);
    expect(
      acceptanceRateBp([...base, offer("decline", false, 91 * DAY)], NOW),
    ).toBe(6667);
  });
});

describe("T-22: routing reads a null rating as 9000", () => {
  it("has the default the rating encoding agrees on", () => {
    expect(ROUTING_RANKING.defaultRatingBp).toBe(9000);
    expect(partnerRatingBp(ratings([5, 4, 5, 4]), NOW)).toBe(
      ROUTING_RANKING.defaultRatingBp,
    );
  });
});

describe("T-30: the cache tags of one review", () => {
  it("are exactly the three", () => {
    expect(
      reviewTags({
        reviewId: "6f1c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f60",
        productId: "0b0c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f61",
        countryIso2: "PL",
        partnerId: null,
      }),
    ).toEqual([
      "reviews",
      "reviews:product:0b0c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f61",
      "reviews:country:PL",
    ]);
    expect(
      reviewTags({
        reviewId: "x",
        productId: null,
        countryIso2: null,
        partnerId: null,
      }),
    ).toEqual(["reviews"]);
  });
});
