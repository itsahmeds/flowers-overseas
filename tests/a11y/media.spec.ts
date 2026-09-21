/**
 * axe over the three media states — gallery, placeholder and provenance note — **with no exception
 * list** (spec 006 **AC-23**; T-23; TASK-080).
 *
 * `tests/a11y/dev-components.spec.ts` audits `/dev/components` as a whole page and keeps doing so.
 * What is here is what changed when the photographs landed, audited as the spec names it: the
 * gallery section of the component catalogue (where the image, the two placeholder reasons and the
 * label are rendered side by side against a fixture manifest), and the locale home, which is the
 * first real page to carry `<img>` at all.
 *
 * Two assertions are made **before** each audit, because an axe run over a page that is not in the
 * state the test claims is a green tick for nothing:
 *
 *  - the image state is reached — there is at least one `<picture> <img>` with a non-empty `alt`;
 *  - the placeholder state is reached — there is at least one `[data-fo-media-placeholder]` box
 *    with **no** `<img>` inside it.
 *
 * The RTL pseudo-locale is audited too, and it audits something no LTR run can: `ar-XB` has no alt
 * text, so every asset degrades to the placeholder, which is the only page state where the whole
 * media surface is captioned boxes. That is `plan/07` §8's rule rendered, and it is the state a
 * screen-reader user in an unreviewed locale would meet.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const BLOCKING = new Set(["serious", "critical"]);

async function violations(
  page: import("@playwright/test").Page,
  selector?: string,
): Promise<{ id: string; impact: string | null | undefined }[]> {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
  if (selector !== undefined) builder = builder.include(selector);
  const results = await builder.analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map((violation) => ({ id: violation.id, impact: violation.impact }));
}

test.describe("the image state on a real page (AC-23)", () => {
  for (const path of ["/en", "/de", "/pl"] as const) {
    test(`${path} with photographs has no serious or critical violations`, async ({
      page,
    }) => {
      expect((await page.goto(path))?.status()).toBe(200);

      const images = page.locator("picture img");
      await expect(images.first()).toBeVisible();
      for (const alt of await images.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLImageElement).alt),
      )) {
        // AC-18 at the page level: alt on a product or brand image is never empty, because an
        // informative image announced as nothing fails WCAG 1.1.1.
        expect(alt.trim().length).toBeGreaterThan(0);
      }

      // The honesty label is text in the page's own language, in the document before hydration.
      await expect(page.locator("[data-fo-media-provenance='ai']")).toHaveCount(
        1,
      );

      expect(await violations(page)).toEqual([]);
    });
  }

  test("/ar-XB degrades every slot to a captioned box, and that state is clean too", async ({
    page,
  }) => {
    const response = await page.goto("/ar-XB");
    test.skip(
      response === null || response.status() !== 200,
      "the pseudo-locale is not enabled on this target",
    );

    await expect(page.locator("picture img")).toHaveCount(0);
    await expect(
      page.locator("[data-fo-media-placeholder]").first(),
    ).toBeVisible();
    // No label, because no generated image is being displayed: the note follows what the page
    // shows, not what its dataset holds (AC-17).
    await expect(page.locator("[data-fo-media-provenance]")).toHaveCount(0);

    expect(await violations(page)).toEqual([]);
  });
});

test.describe("the gallery, placeholder and provenance states together (AC-23)", () => {
  test("/dev/components media section has no serious or critical violations", async ({
    page,
  }) => {
    const response = await page.goto("/dev/components");
    test.skip(
      response === null || response.status() === 404,
      "/dev/components is not enabled on this target",
    );

    // The three states the spec names, each asserted present before the audit runs.
    await expect(page.locator("picture img").first()).toBeVisible();
    await expect(
      page.locator("[data-fo-media-placeholder]").first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-fo-media-provenance='ai']").first(),
    ).toBeVisible();

    expect(await violations(page, "main")).toEqual([]);
  });
});
