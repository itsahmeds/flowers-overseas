/**
 * The tracking routes on the built preview (spec 018 §5.3, §6; AC-7, AC-12; T-07 browser half,
 * T-12; TASK-338).
 *
 * The preview has no database and no `SIGNED_LINK_SECRET`, so only links that fail before either
 * is read are requested here: a token without a dot and one whose MAC is not 16 bytes. Both must
 * answer the one not-working page with status 404, in the URL's language, with the lookup form,
 * the robots meta and header, `no-store`, `Referrer-Policy: no-referrer`, and no canonical or
 * alternate. Forged, rotated and expired links resolve to the same failure value in
 * `tests/integration/tracking-page.test.ts`, which is what makes their page this one.
 */
import { expect, test } from "@playwright/test";

const LOCALES = [
  { code: "en-gb", lang: "en-GB", title: "This tracking link does not work." },
  { code: "pl", lang: "pl", title: "This tracking link does not work." },
] as const;

const BAD_TOKENS = ["not-a-token", "eyJ4IjoxfQ.c2hvcnQ"] as const;

test.describe("tracking: the not-working page (AC-7, AC-12)", () => {
  for (const locale of LOCALES) {
    test(`one 404 body for every bad link in ${locale.code}`, async ({
      page,
    }) => {
      const mains: string[] = [];
      for (const token of BAD_TOKENS) {
        const response = await page.goto(`/${locale.code}/track/${token}`);
        expect(response?.status()).toBe(404);
        const headers = response?.headers() ?? {};
        expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
        expect(headers["cache-control"]).toContain("no-store");
        expect(headers["referrer-policy"]).toBe("no-referrer");
        await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          /noindex,\s*nofollow/u,
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
        await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
        const main = page.locator('main[data-fo-track="not-working"]');
        await expect(main.locator("h1")).toHaveText(locale.title);
        await expect(main.locator('form[method="post"]')).toHaveAttribute(
          "action",
          `/${locale.code}/track`,
        );
        await expect(main.locator('input[name="reference"]')).toBeVisible();
        await expect(main.locator('input[name="email"]')).toBeVisible();
        mains.push(await main.innerHTML());
      }
      expect(new Set(mains).size).toBe(1);
    });
  }

  test("the photo and the calendar file answer a bare 404 for a bad link", async ({
    request,
  }) => {
    for (const path of ["photo", "calendar.ics"]) {
      const response = await request.get(`/en-gb/track/not-a-token/${path}`);
      expect(response.status()).toBe(404);
      expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      expect(await response.text()).toBe("");
    }
  });
});
