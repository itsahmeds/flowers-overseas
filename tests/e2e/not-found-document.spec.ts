/**
 * T-42: the not-found document as round 2 draws it (spec 004 §14 A23 AC-40 as rebound by A24
 * clause 6; AC-12 re-verified; spec 003 AC-8; QA 2026-10-18 Q1-24 and N-11; TASK-191).
 *
 * `/en/does-not-exist` and `/pl/nie-ma` answer 404 with `lang` and render the `errors-*` notice
 * document: the logo alone in the header, no navigation and no footer; the letter, untilted, with
 * the code as a paragraph eyebrow, one `<h1>`, one sentence and two links (Home, Destinations) that
 * each answer 200; no stamp, no postmark and no airmail edge; exactly one decoration, the dashed
 * route, an `aria-hidden` SVG; and the document fills the first viewport (its block size is at
 * least the viewport's minus the header) at 1440 × 900 and 390 × 844.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PATHS = ["/en/does-not-exist", "/pl/nie-ma"] as const;
const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

for (const path of PATHS) {
  test.describe(`${path} (AC-40, T-42)`, () => {
    test("answers 404 with `lang`, and is the notice document", async ({
      page,
      request,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      expect(await page.locator("html").getAttribute("lang")).toBeTruthy();

      // The logo alone in the header: one link, no navigation, no footer.
      await expect(page.locator("header")).toHaveCount(1);
      await expect(page.locator("header a")).toHaveCount(1);
      await expect(page.locator("nav")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);

      // The letter: the code as a paragraph eyebrow, one `<h1>`, one sentence, two links.
      const letter = page.locator("main [data-fo-notice-letter]");
      await expect(letter).toHaveCount(1);
      await expect(letter.locator("p").first()).toHaveText("404");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(letter.locator("h1")).toHaveCount(1);
      await expect(letter.locator("a")).toHaveCount(2);
      const hrefs = await letter
        .locator("a")
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
      expect(hrefs[0]).toMatch(/^\/en$/u);
      expect(hrefs[1]).toMatch(/^\/en\/send-flowers-to$/u);
      for (const href of hrefs) {
        const answer = await request.get(href, { maxRedirects: 0 });
        expect(answer.status(), href).toBe(200);
      }

      // No stamp, no postmark, no airmail edge; exactly one `aria-hidden` decoration in <main>.
      const marks = await page.evaluate(() => {
        // The document under the header: the logo's own mark is the logo, not a decoration.
        const main = document.querySelector("[data-fo-notice-404]");
        const all = Array.from(main?.querySelectorAll("*") ?? []);
        return {
          devices: all.filter((element) =>
            /stamp|postmark|airmail/iu.test(
              `${element.getAttribute("class") ?? ""} ${Array.from(
                element.attributes,
              )
                .map((attribute) => attribute.name)
                .join(" ")}`,
            ),
          ).length,
          hidden: all
            .filter((element) => element.getAttribute("aria-hidden") === "true")
            .map((element) => element.tagName.toLowerCase()),
          airmail: all.filter((element) =>
            getComputedStyle(element, "::before").backgroundImage.includes(
              "repeating-linear-gradient",
            ),
          ).length,
        };
      });
      expect(marks.devices).toBe(0);
      expect(marks.airmail).toBe(0);
      expect(marks.hidden).toEqual(["svg"]);
    });

    for (const size of SIZES) {
      test(`at ${String(size.width)} × ${String(size.height)}: fills the first viewport, nothing tilted`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto(path);
        const geometry = await page.evaluate(() => {
          const header = document
            .querySelector("header")
            ?.getBoundingClientRect();
          const main = document
            .querySelector("[data-fo-notice-404]")
            ?.getBoundingClientRect();
          const letter = document.querySelector("[data-fo-notice-letter]");
          const transform =
            letter === null ? "none" : getComputedStyle(letter).transform;
          const rotate =
            letter === null ? "none" : getComputedStyle(letter).rotate;
          let tilted = rotate !== "none" && rotate !== "0deg";
          if (transform !== "none") {
            const matrix = new DOMMatrixReadOnly(transform);
            tilted ||= Math.abs(matrix.b) > 1e-6 || Math.abs(matrix.c) > 1e-6;
          }
          return {
            headerBottom: header?.bottom ?? 0,
            mainHeight: main?.height ?? 0,
            tilted,
            viewport: window.innerHeight,
          };
        });
        expect(geometry.tilted).toBe(false);
        expect(geometry.mainHeight).toBeGreaterThanOrEqual(
          geometry.viewport - geometry.headerBottom - 0.5,
        );
      });
    }

    test("has no serious or critical axe violation", async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        results.violations
          .filter((violation) =>
            ["serious", "critical"].includes(violation.impact ?? ""),
          )
          .map((violation) => violation.id),
      ).toEqual([]);
    });
  });
}
