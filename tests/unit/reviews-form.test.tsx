/**
 * The review form without a database (spec 022a §10 T-12 robots and header half, T-14 schema
 * half, T-31 component half; AC-12, AC-14, AC-31; TASK-371).
 *
 *  - robots disallows `/*\/review/` and not `/*\/reviews`; the form and the opt-out page carry
 *    `noindex`, `no-store` and `no-referrer`;
 *  - `ReviewSubmission`: graphemes counted with `Intl.Segmenter` (emoji and "ż" one each), 1000
 *    accepted, 1001 refused on `text`; ratings 0 and 6 refused on `rating`; the checkbox unticked
 *    by default; the text trimmed;
 *  - `StarRadioGroup`: a fieldset with a legend and five native radios of one name, required, each
 *    named "{n} out of 5", the emailed star checked, the error tied with `aria-describedby`;
 *  - the form's words in en, de and pl: no negative framing, incentive, relay word or U+2014;
 *  - the first name a buyer chose to show is a first name only.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { relayMatches } from "@/config/honesty";
import { loadMessages } from "@/modules/i18n";
import {
  displayFirstName,
  graphemeCount,
  reviewCopyHits,
  ReviewSubmissionSchema,
} from "@/modules/reviews";
import { DISALLOWED_PATHS, robotsTxt } from "@/modules/seo/robots";
import { StarRadioGroup } from "@/modules/ui";

import { reviewHeaderRules } from "../../src/lib/transactional-headers.ts";

const INDEXING = {
  environment: "production",
  siteUrl: "https://flowersoverseas.com",
} as const;

function blocks(pattern: string, url: string): boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}`, "u").test(url);
}

describe("T-12: robots and headers", () => {
  it("disallows /*/review/ and leaves /*/reviews crawlable", () => {
    expect(DISALLOWED_PATHS).toContain("/*/review/");
    expect(robotsTxt(INDEXING).split("\n")).toContain("Disallow: /*/review/");
    expect(blocks("/*/review/", "/en/review/AbC")).toBe(true);
    expect(blocks("/*/review/", "/de/review/AbC/stop")).toBe(true);
    for (const path of ["/en/reviews", "/de/bewertungen", "/pl/opinie"]) {
      expect(
        DISALLOWED_PATHS.some((pattern) => blocks(pattern, path)),
        path,
      ).toBe(false);
    }
  });

  it("sends noindex, no-store and no-referrer on the form and the opt-out page", () => {
    const rules = reviewHeaderRules();
    expect(rules.map((rule) => rule.source)).toEqual([
      "/:locale/review/:token",
      "/:locale/review/:token/stop",
    ]);
    for (const rule of rules) {
      const headers = Object.fromEntries(
        rule.headers.map((header) => [header.key.toLowerCase(), header.value]),
      );
      expect(headers["x-robots-tag"]).toContain("noindex");
      expect(headers["cache-control"]).toContain("no-store");
      expect(headers["referrer-policy"]).toBe("no-referrer");
    }
  });
});

describe("T-14: ReviewSubmission", () => {
  const mixed = (n: number) =>
    Array.from(
      { length: n },
      (_, index) => ["ż", "🌷", "e", "👩‍👩‍👧"][index % 4],
    ).join("");

  it("counts graphemes, not code units", () => {
    expect(graphemeCount("ż🌷👩‍👩‍👧")).toBe(3);
    expect(mixed(1000).length).toBeGreaterThan(1000);
  });

  it("accepts 1000 graphemes and refuses 1001 on the text field", () => {
    expect(
      ReviewSubmissionSchema.safeParse({ rating: 5, text: mixed(1000) })
        .success,
    ).toBe(true);
    const refused = ReviewSubmissionSchema.safeParse({
      rating: 5,
      text: mixed(1001),
    });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues.map((issue) => issue.path)).toEqual([
      ["text"],
    ]);
  });

  it("refuses ratings 0 and 6 on the rating field, and accepts 1 to 5 from a form", () => {
    for (const rating of [0, 6, "0", "6", "", "four"]) {
      const refused = ReviewSubmissionSchema.safeParse({ rating });
      expect(refused.success, String(rating)).toBe(false);
      expect(refused.error?.issues[0]?.path).toEqual(["rating"]);
    }
    for (const rating of ["1", "2", "3", "4", "5"]) {
      expect(ReviewSubmissionSchema.parse({ rating }).rating).toBe(
        Number(rating),
      );
    }
  });

  it("trims the text, keeps no empty text, and leaves the first name off unless ticked", () => {
    const parsed = ReviewSubmissionSchema.parse({ rating: 4, text: "  ok  " });
    expect(parsed).toEqual({ rating: 4, text: "ok", showFirstName: false });
    expect(
      ReviewSubmissionSchema.parse({ rating: 4, text: "   " }).text,
    ).toBeNull();
    expect(
      ReviewSubmissionSchema.parse({ rating: 4, showFirstName: "on" })
        .showFirstName,
    ).toBe(true);
    expect(
      ReviewSubmissionSchema.safeParse({ rating: 4, extra: 1 }).success,
    ).toBe(false);
  });
});

describe("T-31: StarRadioGroup", () => {
  const labels = [1, 2, 3, 4, 5].map((n) => `${String(n)} out of 5`);

  it("is a fieldset with a legend and five native, required radios of one name; the emailed star is checked", () => {
    const html = renderToStaticMarkup(
      <StarRadioGroup
        defaultValue={4}
        legend="Your rating"
        name="rating"
        optionLabels={labels}
      />,
    );
    expect(html).toMatch(/^<fieldset/u);
    expect(html).toContain("<legend");
    expect(html).toContain("Your rating");
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/gu) ?? [];
    expect(radios).toHaveLength(5);
    for (const [index, radio] of radios.entries()) {
      expect(radio).toContain('name="rating"');
      expect(radio).toContain(`value="${String(index + 1)}"`);
      expect(radio).toContain(`aria-label="${String(index + 1)} out of 5"`);
      expect(radio).toContain("required");
    }
    const checked = radios.filter((radio) => radio.includes("checked"));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="4"');
  });

  it("checks nothing without a star, and ties the error to the group", () => {
    const html = renderToStaticMarkup(
      <StarRadioGroup
        error="Choose from 1 to 5 stars."
        errorId="rating-error"
        legend="Your rating"
        name="rating"
        optionLabels={labels}
      />,
    );
    expect(html).not.toMatch(/<input[^>]*checked/u);
    expect(html).toContain('aria-describedby="rating-error"');
    expect(html).toContain('id="rating-error"');
    expect(html).toContain('aria-invalid="true"');
  });
});

describe("the form's words", () => {
  for (const locale of ["en", "de", "pl"] as const) {
    it(`${locale}: no negative framing, incentive, relay word or U+2014`, () => {
      const messages = loadMessages(locale, ["reviews"]) as {
        reviews: { form: Record<string, string>; stop: Record<string, string> };
      };
      const texts = [
        ...Object.values(messages.reviews.form),
        ...Object.values(messages.reviews.stop),
      ];
      expect(texts.length).toBeGreaterThan(20);
      for (const text of texts) {
        expect(reviewCopyHits(text, locale), text).toEqual([]);
        expect(relayMatches(text, locale), text).toEqual([]);
        expect(text).not.toContain("—");
        expect(text).not.toContain("–");
      }
    });
  }
});

describe("the first name a buyer chose to show", () => {
  it("is one word, never a surname or a title", () => {
    expect(displayFirstName("Łucja Nowak-Kowalska")).toBe("Łucja");
    expect(displayFirstName("Dr. Anna Nowak")).toBe("Anna");
    expect(displayFirstName("J Smith")).toBeNull();
    expect(displayFirstName("  ")).toBeNull();
    expect(displayFirstName(null)).toBeNull();
  });
});
