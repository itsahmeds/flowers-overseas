/**
 * **T-17 / AC-15** and **T-18 / AC-16**, served (spec 004 §8, §9; `plan/09` Phase 0 AC 6;
 * TASK-053).
 *
 * AC-15 is the Phase 0 criterion this task could break: with the occasion tiles, the explainer,
 * the FAQ and the trust strip, the locale home is now nine sections of copy, and every one of
 * them is a place a review, a rating, a star, a partner name or a florist count could appear. So
 * the assertion is made where a buyer would see it — the **rendered document text** of all four
 * locale homes and the footer — and not only over the catalogue (`tests/unit/home-honesty.test.ts`
 * does that half, with the same patterns and the same reasoning about word boundaries).
 *
 * AC-16 is the other half of the same honesty: spec 007 owns structured data, canonicals and
 * hreflang, and until it lifts `noindex` there must be none of them anywhere. A `FAQPage` block
 * over the five disclosures this task ships would be the obvious, wrong thing to add, so the
 * absence is asserted rather than assumed.
 */
import { expect, test } from "@playwright/test";

const LOCALES = ["/en", "/en-gb", "/de", "/pl"] as const;

/**
 * The forbidden claim shapes of AC-15, word-bounded for the reason the unit half documents:
 * "Start again from the home page" contains `star`.
 */
const FORBIDDEN: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: "review", pattern: /\breviews?\b/iu },
  { name: "rating", pattern: /\bratings?\b|\brated\b/iu },
  { name: "star", pattern: /\bstars?\b|★|⭐/iu },
  { name: "testimonial", pattern: /\btestimonials?\b/iu },
  { name: "review count", pattern: /\d[\d\s,.]*\s*(reviews?|ratings?)\b/iu },
  {
    name: "out-of-five score",
    pattern: /\b\d(?:[.,]\d)?\s*(?:\/|out of)\s*5\b/iu,
  },
  { name: "Trustpilot mark", pattern: /trustpilot|feefo|reviews\.io/iu },
  { name: "florist count", pattern: /\d[\d\s,.]*\s*florists?\b/iu },
  {
    name: "customer count",
    pattern: /\d[\d\s,.]*\s*(customers?|orders? delivered|deliveries)\b/iu,
  },
  {
    name: "partner name",
    pattern: /\b(kwiaciarnia|blumen|fleurs|interflora|euroflorist|fleurop)\b/iu,
  },
];

test.describe("AC-15: nothing on a served page claims what we cannot support", () => {
  for (const path of LOCALES) {
    test(`${path} carries no review, rating, star, testimonial, count or partner name`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // The whole document, chrome included: the footer's trust slot, the header's utility strip
      // and the nine sections of the home.
      const rendered = (await page.locator("body").innerText()).replaceAll(
        /\s+/g,
        " ",
      );
      const offences = FORBIDDEN.filter(({ pattern }) =>
        pattern.test(rendered),
      ).map(({ name }) => name);
      expect(offences, rendered.slice(0, 400)).toEqual([]);
    });

    test(`${path} shows no photograph, no star glyph and no rating widget`, async ({
      page,
    }) => {
      await page.goto(path);

      // `plan/10` §3: the demo shows no image it does not have. Every photo box on the page is a
      // reserved slot with a caption.
      await expect(page.locator("main img")).toHaveCount(0);
      await expect(page.locator("main picture")).toHaveCount(0);
      await expect(
        page.locator('[itemtype*="Review"], [itemprop="ratingValue"]'),
      ).toHaveCount(0);
      // The reserved slots are present and each says what it will hold.
      const slots = page.locator("main [data-fo-media-slot]");
      expect(await slots.count()).toBeGreaterThan(6);
    });
  }

  test("the footer's trust slot is empty and reserves no box", async ({
    page,
  }) => {
    await page.goto("/en");
    const footer = page.locator("footer");

    await expect(footer).toHaveCount(1);
    const rendered = (await footer.innerText()).replaceAll(/\s+/g, " ");
    for (const { name, pattern } of FORBIDDEN) {
      expect(pattern.test(rendered), `${name}: ${rendered}`).toBe(false);
    }
    await expect(footer.locator("img")).toHaveCount(0);
  });
});

/**
 * **Narrowed by TASK-093 (spec 007 AC-15), the way AC-10 narrowed the canonical clause.** AC-16's
 * subject is structured data *this spec* would invent — a `FAQPage` over the five disclosures, a
 * `Review`, a rating — and spec 007 §2 always owned what the locale home does publish. Since
 * TASK-093 that is exactly two nodes in one document: `Organization` (name, url, logo — nothing
 * `company.ts` does not hold) and `WebSite` without a `SearchAction`. The assertion is therefore
 * "nothing but those two", which is stricter than the old "none at all" in the direction that
 * matters: a third node, a rating or a product would fail it. The canonical and the hreflang
 * cluster are still spec 007's and still absent here (TASK-094, TASK-096).
 */
test.describe("AC-16: no structured data, canonical or hreflang from a 004 page", () => {
  for (const path of LOCALES) {
    test(`${path} emits only spec 007's identity JSON-LD, no canonical and no alternate`, async ({
      page,
    }) => {
      await page.goto(path);

      const blocks = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
      expect(blocks).toHaveLength(1);
      const document = JSON.parse(blocks[0] ?? "{}") as Record<string, unknown>;
      const graph = (document["@graph"] ?? []) as readonly Record<
        string,
        unknown
      >[];
      expect(graph.map((node) => node["@type"])).toEqual([
        "Organization",
        "WebSite",
      ]);
      expect(blocks[0]).not.toContain("SearchAction");
      expect(blocks[0]).not.toContain("FAQPage");
      expect(blocks[0]).not.toContain("Product");
      expect(blocks[0]).not.toContain("Review");

      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
      // The document is still `noindex,nofollow` until spec 007 says otherwise (spec 003 AC-7).
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
    });
  }

  test("the FAQ's five disclosures ship no FAQPage markup", async ({
    page,
  }) => {
    await page.goto("/en");

    await expect(page.locator("[data-fo-faq] details")).toHaveCount(5);
    await expect(
      page.locator('[data-fo-faq] [itemtype*="FAQPage"], [data-fo-faq] script'),
    ).toHaveCount(0);
    // And none from the document either: the home's chrome FAQ is not the authored 8-12 band a
    // corridor guide carries, so nothing on this page is a `FAQPage` (spec 007 AC-15).
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(blocks.join("")).not.toContain("FAQPage");
  });
});
