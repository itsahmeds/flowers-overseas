/**
 * The product page's one island in a browser, and the v2 error letter (spec 004 §14 A21 clauses 3
 * and 5; spec 009 AC-14 / T-14, the network half; TASK-179).
 *
 *  - Typing into the card field mirrors the words into the printed-card preview, in four locales.
 *  - **The message goes nowhere:** while it is typed, no request is made whose URL or body carries
 *    it, the page's URL does not change, and the field has no `name`.
 *  - The preview's line is set in Caveat, and only after the buyer types does the visible line
 *    change from the sample; one preview is visible at a time.
 *  - The 404 is the letter (the TASK-170 document, restyled), with its one `<h1>`.
 *
 * The unit halves — the island's import graph, the byte-free static checks — are
 * `tests/unit/product-card-preview.test.tsx`.
 */
import { expect, test } from "@playwright/test";

const POLAND_PDPS = [
  "/en/poland/product/amber-hour",
  "/en-gb/poland/product/amber-hour",
  "/de/polen/produkt/amber-hour",
  "/pl/polska/produkt/amber-hour",
] as const;

/** Latin-Ext on purpose: the Polish letters A21 clause 3's Latin-Ext subset exists for. */
const MESSAGE = "Kochana Mamo, ąćęłńóśźż — wszystkiego najlepszego";

for (const url of POLAND_PDPS) {
  test(`${url}: the typed card message reaches the preview and nothing else`, async ({
    page,
  }) => {
    await page.goto(url);
    const field = page.locator("#pdp-card-message");
    await expect(field).toBeVisible();
    expect(await field.getAttribute("name")).toBeNull();

    // One card: the sample sentence and the words line, which is empty until the buyer types.
    const words = page.locator("[data-fo-card-text]");
    const sampleLine = page.locator("[data-fo-card-sample]");
    await expect(words).toHaveCount(1);
    await expect(sampleLine).toHaveCount(1);
    const sample = (await sampleLine.textContent()) ?? "";
    expect(sample.length).toBeGreaterThan(0);
    await expect(words).toHaveText("");
    // Hydrated: the island's first effect marks the sample shown.
    await expect(sampleLine).toHaveAttribute("aria-hidden", "false");

    const requests: { url: string; body: string; type: string }[] = [];
    page.on("request", (request) => {
      requests.push({
        url: request.url(),
        body: request.postData() ?? "",
        type: request.resourceType(),
      });
    });
    const before = page.url();

    await field.fill(MESSAGE);
    await expect(words).toHaveText(MESSAGE);
    await expect(sampleLine).toHaveAttribute("aria-hidden", "true");
    // The counter counts what `maxLength` limits.
    await expect(page.locator("#pdp-card-message-count")).toContainText(
      String(MESSAGE.length),
    );

    // Clearing the field puts the sample back.
    await field.fill("");
    await expect(words).toHaveText("");
    await expect(sampleLine).toHaveAttribute("aria-hidden", "false");
    await expect(sampleLine).toHaveText(sample);
    await field.fill(MESSAGE);

    expect(page.url()).toBe(before);
    const encoded = encodeURIComponent(MESSAGE);
    for (const request of requests) {
      expect(request.url).not.toContain(encoded);
      expect(request.url).not.toContain("Kochana");
      expect(request.body).not.toContain("Kochana");
      // Typing may pull the hand face or a lazy image into view; it never calls a script API.
      expect(
        ["fetch", "xhr", "websocket", "eventsource"],
        request.url,
      ).not.toContain(request.type);
    }

    const family = await words.evaluate(
      (node) => getComputedStyle(node).fontFamily,
    );
    // `next/font/local` names the family after the export (`handFont`, `handFontExt`).
    expect(family.toLowerCase()).toMatch(/caveat|handfont/u);
  });
}

/**
 * Spec 042 AC-10 / T-10 (the browser half; TASK-308): motion 15's hand-over. The words line reads
 * exactly the typed string; the first input crossfades the sample out and the words in over
 * `--duration-base` (0.2 s), opacity only; clearing gives the sample back; typing makes no request.
 * Under reduced motion the swap is instant (AC-4). Red with the swap at `--duration-slow` (0.32 s)
 * and with the sample left in place after typing.
 */
const PDP = "/en-gb/poland/product/amber-hour";

/** The two lines' computed opacity and transition, once any transition has finished. */
async function lines(page: import("@playwright/test").Page) {
  await page.waitForFunction(() =>
    (
      document.querySelector("[data-fo-card-preview]")?.getAnimations({
        subtree: true,
      }) ?? []
    ).every((animation) => animation.playState !== "running"),
  );
  return page.evaluate(() => {
    const read = (selector: string) => {
      const node = document.querySelector(selector);
      if (node === null) throw new Error(`${selector} is missing`);
      const style = getComputedStyle(node);
      return {
        text: node.textContent,
        opacity: style.opacity,
        property: style.transitionProperty,
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
      };
    };
    return {
      words: read("[data-fo-card-text]"),
      sample: read("[data-fo-card-sample]"),
    };
  });
}

test.describe("spec 042 AC-10: the card preview fills in as the buyer writes", () => {
  test("the first words crossfade in over 0.2 s, read exactly as typed, and clearing gives the sample back", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(PDP);
    const field = page.locator("#pdp-card-message");
    // Hydrated: the island's first effect marks the sample shown.
    await expect(page.locator("[data-fo-card-sample]")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    const rest = await lines(page);
    expect(rest.words).toMatchObject({ text: "", opacity: "0" });
    expect(rest.sample.opacity).toBe("1");
    const sample = rest.sample.text;

    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() !== "font") requests.push(request.url());
    });

    // The first character starts the crossfade: both lines move on `opacity` at 0.2 s.
    await field.pressSequentially("H");
    await page.waitForFunction(
      () =>
        (document
          .querySelector("[data-fo-card-preview]")
          ?.getAnimations({ subtree: true }).length ?? 0) > 0,
    );
    const fading = await page.evaluate(() =>
      (
        document
          .querySelector("[data-fo-card-preview]")
          ?.getAnimations({ subtree: true }) ?? []
      ).map((animation) => ({
        property:
          animation instanceof CSSTransition
            ? animation.transitionProperty
            : "not a transition",
        duration: animation.effect?.getTiming().duration,
      })),
    );
    expect(fading).toEqual([
      { property: "opacity", duration: 200 },
      { property: "opacity", duration: 200 },
    ]);

    await field.pressSequentially("appy birthday, Ola");
    const typed = await lines(page);
    expect(typed.words).toEqual({
      text: "Happy birthday, Ola",
      opacity: "1",
      property: "opacity",
      duration: "0.2s",
      easing: "cubic-bezier(0.2, 0, 0.13, 1)",
    });
    expect(typed.sample).toMatchObject({ text: sample, opacity: "0" });
    await expect(page.locator("[data-fo-card-sample]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    // Later keystrokes change only text: nothing was animating once the first fade ended.

    await field.fill("");
    const cleared = await lines(page);
    expect(cleared.words).toMatchObject({ text: "", opacity: "0" });
    expect(cleared.sample).toMatchObject({ text: sample, opacity: "1" });

    expect(requests, "typing makes no request").toEqual([]);
    // The printed label is the card's caption.
    await expect(page.locator("[data-fo-card-preview] figcaption")).toHaveText(
      "Printed on our card · included",
    );
  });

  test("under reduced motion the swap is instant (AC-4)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PDP);
    await expect(page.locator("[data-fo-card-sample]")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await page.locator("#pdp-card-message").pressSequentially("H");
    await expect(page.locator("[data-fo-card-text]")).toHaveText("H");
    const running = await page.evaluate(
      () =>
        document
          .querySelector("[data-fo-card-preview]")
          ?.getAnimations({ subtree: true }).length,
    );
    expect(running).toBe(0);
    const typed = await lines(page);
    expect(typed.words).toMatchObject({ text: "H", opacity: "1" });
    expect(typed.sample.opacity).toBe("0");
    for (const line of [typed.words, typed.sample]) {
      expect(Number.parseFloat(line.duration)).toBeLessThanOrEqual(0.12);
    }
  });

  test("on /ar-XB the card and the field render with no sideways scroll (AC-5)", async ({
    page,
  }) => {
    const response = await page.goto("/ar-XB/poland/product/amber-hour");
    // Served wherever the suites run (the a11y suite audits the same URL).
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-fo-card-sample]")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    await page.locator("#pdp-card-message").fill("عيد ميلاد سعيد، Ola");
    await expect(page.locator("[data-fo-card-text]")).toHaveText(
      "عيد ميلاد سعيد، Ola",
    );
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBe(widths.client);
  });
});

test("the 404 is the v2 letter, with its one heading and a way home", async ({
  page,
}) => {
  const response = await page.goto("/en/no-such-page-at-all");
  expect(response?.status()).toBe(404);
  const letter = page.locator("[data-fo-notice-letter]");
  await expect(letter).toHaveCount(1);
  await expect(letter.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(letter.locator('a[href="/en"]')).toHaveCount(1);
});
