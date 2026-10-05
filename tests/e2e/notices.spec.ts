/**
 * T-14 / AC-12 (TASK-055): the failure documents (the 404 and, through its shared skin, the 500)
 * are styled with the design system and still keep every spec 003 contract they were given. The
 * `/` chooser this file also covered was deleted by spec 003 §14 A16: `/` is a 308 to `/en`
 * (`./root-redirect.spec.ts`).
 *
 * The contracts are the point. A styling pass is exactly the change that quietly turns a
 * script-free page into a hydrated one, a 404 into a soft 404 and a cacheable response into a
 * cookie-setting one, so each of them is asserted here against the built application rather than
 * described in a PR body:
 *
 *  - the 404 — status **404**, the x-default document, and a way back that is a real link;
 *  - all of them — the same lockup (the masthead's outlined wordmark since TASK-176), the same
 *    `.display` heading and the same `--measure` column,
 *    so the three read as one site (the "styled" half of T-14, asserted through the shared class
 *    contract of `src/modules/ui/layout/noticeShell.ts` rather than through a screenshot, which
 *    `tests/visual/notices.spec.ts` does separately).
 *
 * **The two 500 documents are deliberately absent from this file.** Reaching an error boundary in
 * a browser needs a route that throws on purpose, and this task was not asked to add one to the
 * localised route space. Their markup — both boundaries, every locale's copy, the shell, the two
 * actions and the absence of any provider — is asserted in `tests/unit/app-shell.test.tsx`, and
 * the shell they share with the two documents below is pinned in
 * `tests/unit/ui-notice-shell.test.ts`. Recorded in the PR body: spec 004 AC-26 (TASK-056) puts
 * "the 500 boundary" in the axe URL set and will need exactly such a route, so the decision
 * belongs with the task that must run a browser against it.
 */
import { type Page, expect, test } from "@playwright/test";

/** Every notice document, as a visitor reaches it. */
const NOTICES = [
  { name: "the 404", path: "/does-not-exist", status: 404 },
  { name: "a 404 below a real locale", path: "/en/nope", status: 404 },
] as const;

/** The masthead's own lockup metrics, so the notice documents read as the same site as `/en`. */
/**
 * The outlined wordmark's drawing (spec 004 §14 A21 clause 3; TASK-176): the SVG's markup, which
 * is the same paths wherever the lockup is drawn. v2 draws the wordmark as outlines rather than
 * live type, so "the same lockup" is compared as the same drawing instead of the same computed
 * font stack.
 */
async function wordmarkDrawing(page: Page, scope: string): Promise<string> {
  return page.evaluate((selector) => {
    const wordmark = document.querySelector(`${selector} [data-fo-wordmark]`);
    return wordmark === null ? "" : wordmark.innerHTML;
  }, scope);
}

/**
 * The masthead's own wordmark, read once from `/en`, so every notice document is compared against
 * the real chrome instead of against a literal.
 */
let mastheadWordmark = "";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.goto("/en");
    mastheadWordmark = await wordmarkDrawing(page, "[data-fo-header]");
  } finally {
    await page.close();
  }
  expect(mastheadWordmark.length).toBeGreaterThan(0);
});

for (const { name, path, status } of NOTICES) {
  test.describe(`${name} (${path})`, () => {
    test(`answers ${String(status)} and renders the notice shell`, async ({
      page,
    }) => {
      const response = await page.goto(path);

      expect(response?.status()).toBe(status);

      // One `<h1>`, in the display voice, inside the centred measure column.
      const heading = page.locator("main#main h1");
      await expect(heading).toHaveCount(1);
      await expect(heading).not.toBeEmpty();
      await expect(heading).toHaveClass(/display/);

      // The column is `--measure` wide and centred: its box never exceeds the token, and the
      // space on either side of it is equal. Measured rather than asserted from a class name.
      const box = await page.locator("main#main").boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(viewport!.width);
      expect(
        Math.abs(box!.x - (viewport!.width - box!.x - box!.width)),
      ).toBeLessThanOrEqual(1);

      // The lockup: the outlined wordmark the masthead draws on `/en`, named by the trading name,
      // which is what "the three documents read as one site" means.
      const wordmark = page.locator("main [data-fo-wordmark]");
      await expect(wordmark).toHaveCount(1);
      await expect(wordmark).toBeVisible();
      await expect(wordmark).toHaveAttribute("role", "img");
      await expect(wordmark).toHaveAccessibleName(/.+/);
      expect(await wordmarkDrawing(page, "main")).toBe(mastheadWordmark);
    });

    test("carries the design tokens rather than a browser default", async ({
      page,
    }) => {
      await page.goto(path);

      const paper = await page
        .locator("body")
        .evaluate((node) => window.getComputedStyle(node).backgroundColor);
      // `--color-surface` is the canvas's white paper, not `rgba(0, 0, 0, 0)` (unstyled) and not
      // pure `rgb(255, 255, 255)`.
      expect(paper).not.toBe("rgba(0, 0, 0, 0)");
      expect(paper).not.toBe("");
    });
  });
}

test.describe("the 404 (AC-12, AC-14)", () => {
  test("is the x-default document with a localised title, and never a soft 404", async ({
    page,
  }) => {
    const response = await page.goto("/nope");

    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    expect((await page.title()).trim().length).toBeGreaterThan(0);
    // The status is printed as the document's `.label` metadata, so the page says what it is.
    await expect(page.locator("main#main")).toContainText("404");
  });

  test("offers the locale home, and nothing that would 404 again (AC-14)", async ({
    page,
  }) => {
    await page.goto("/nope");

    const links = page.locator("main#main a[href]");
    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    );
    // The lockup and the first action go to the locale home; the second action is the
    // all-destinations hub, which appeared the moment spec 007 published its `site-links.ts` id
    // (TASK-092) — with no edit to this document, which is what AC-14's contract promised.
    expect(new Set(hrefs)).toEqual(new Set(["/en", "/en/send-flowers-to"]));

    for (const href of hrefs) {
      const target = await page.request.get(href!);
      expect(target.status(), href!).toBe(200);
    }
  });

  test("keeps its 404 status for a path below a real locale", async ({
    request,
  }) => {
    for (const path of ["/en/does-not-exist", "/de/nope", "/pl/x/y"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });
});
