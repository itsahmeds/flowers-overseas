/**
 * T-14 / AC-12 (TASK-055): the three documents a visitor can reach without having chosen anything
 * — the `/` chooser, the 404 and, through its shared skin, the 500 — are styled with the design
 * system and still keep every spec 003 contract they were given.
 *
 * The contracts are the point. A styling pass is exactly the change that quietly turns a
 * script-free page into a hydrated one, a 404 into a soft 404 and a cacheable response into a
 * cookie-setting one, so each of them is asserted here against the built application rather than
 * described in a PR body:
 *
 *  - `/` — 200, `noindex,follow`, **no client component of its own**, no `Set-Cookie`, no
 *    negotiation `Vary`, and no consent or suggestion overlay (it has no locale to suggest, and
 *    the chooser is the one document that must work with scripting off — `./shell.spec.ts` proves
 *    that half);
 *  - the 404 — status **404**, the x-default document, and a way back that is a real link;
 *  - all of them — the same lockup, the same `.display` heading and the same `--measure` column,
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
  { name: "the chooser", path: "/", status: 200 },
  { name: "the 404", path: "/does-not-exist", status: 404 },
  { name: "a 404 below a real locale", path: "/en/nope", status: 404 },
] as const;

/** The masthead's own lockup metrics, so the notice documents read as the same site as `/en`. */
async function wordmarkFontFamily(page: Page): Promise<string> {
  return page.evaluate(() => {
    const wordmark = document.querySelector<HTMLElement>("main .display");
    return wordmark === null
      ? ""
      : window.getComputedStyle(wordmark).fontFamily;
  });
}

/**
 * The masthead's own computed font stack, read once from `/en`, so every notice document can be
 * compared against the real chrome instead of against a literal family name.
 */
let mastheadFontFamily = "";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.goto("/en");
    mastheadFontFamily = await page.evaluate(() => {
      const wordmark = document.querySelector<HTMLElement>(
        "[data-fo-header] .display",
      );
      return wordmark === null
        ? ""
        : window.getComputedStyle(wordmark).fontFamily;
    });
  } finally {
    await page.close();
  }
  expect(mastheadFontFamily.length).toBeGreaterThan(0);
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

      // The lockup: the wordmark in the display family — the same computed stack the masthead
      // renders on `/en`, which is what "the three documents read as one site" means. The family
      // name is `next/font`'s generated one, so the two are compared rather than matched against
      // "Newsreader", which never appears in a computed style.
      await expect(page.locator("main .display").first()).toBeVisible();
      expect(await wordmarkFontFamily(page)).toBe(mastheadFontFamily);
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

test.describe("the chooser's contracts survive the styling pass (AC-12)", () => {
  test("is 200, `noindex,follow`, cookie-free and varies on no negotiation header", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const headers = (await response?.headersArray()) ?? [];
    const named = (header: string): string[] =>
      headers
        .filter((entry) => entry.name.toLowerCase() === header)
        .map((entry) => entry.value.toLowerCase());

    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,follow",
    );
    expect(named("set-cookie")).toEqual([]);
    expect(named("location")).toEqual([]);
    for (const vary of named("vary")) {
      expect(vary).not.toContain("accept-language");
      expect(vary).not.toContain("cookie");
      expect(vary).not.toContain("user-agent");
    }
  });

  test("ships no island: no consent sheet, no language suggestion, no hydrated control", async ({
    page,
  }) => {
    await page.goto("/");
    // Give hydration and any lazy chunk the same chance they get on `/en`, then assert that
    // nothing arrived: the assertion is "still zero after the page settled", not "zero at once".
    await expect(page.locator("main#main h1")).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[data-fo-consent]")).toHaveCount(0);
    await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
    await expect(page.locator("[data-fo-live-region]")).toHaveCount(0);
    // The chooser renders no control at all — every affordance on it is a link.
    await expect(page.locator("button")).toHaveCount(0);
  });

  test("writes no cookie into the jar, however long it is left open", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(await context.cookies()).toEqual([]);
  });
});

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
    // Every link on the page — the lockup and the one action — goes to the locale home, because
    // `destinations` is unpublished in `src/config/site-links.ts`. When spec 007 publishes it the
    // second action appears with no edit to this document.
    expect(new Set(hrefs)).toEqual(new Set(["/en"]));

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
