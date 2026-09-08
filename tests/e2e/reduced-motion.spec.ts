/**
 * T-08 / AC-6 (TASK-045): with `prefers-reduced-motion: reduce` emulated, **every** transition and
 * animation the design system defines is gone.
 *
 * §9's wording is about banner opening, and both banners arrive later (the consent sheet with
 * TASK-051, the restyled suggestion banner with TASK-053). What is testable today — and what those
 * tasks inherit rather than re-implement — is the token-level contract: the `@layer base` block in
 * `src/app/globals.css` collapses `transition-duration`, `animation-duration` and
 * `scroll-behavior` for every element, `!important`, so a component cannot opt back in. The
 * gallery is where the design system's transitions actually exist in Phase 0 (every `Button`
 * carries `transition-colors duration-fast`), so it is where the assertion is made.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

async function transitionOfFirstButton(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const button = document.querySelector("button");
    if (button === null) return null;
    const style = getComputedStyle(button);
    return {
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    };
  });
}

test("without the preference, the design system's transitions are real", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const response = await page.goto(GALLERY);
  expect(
    response?.status(),
    `${GALLERY} must be served; is ENABLE_DEV_UI=true on the target?`,
  ).toBe(200);

  const style = await transitionOfFirstButton(page);
  expect(style?.transitionDuration).toBe("0.12s");
});

test("with `reduce`, no transition or animation runs (AC-6)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(GALLERY);
  expect(response?.status()).toBe(200);

  const style = await transitionOfFirstButton(page);
  // 0.01 ms, not `none`: the listeners still fire, the motion does not.
  expect(style?.transitionDuration).toBe("1e-05s");
  expect(style?.animationDuration).toBe("1e-05s");
  expect(style?.scrollBehavior).toBe("auto");
});

test("with `reduce`, a locale document has no animated property either", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");

  const durations = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .map((element) => {
        const style = getComputedStyle(element);
        return `${style.transitionDuration}|${style.animationDuration}`;
      })
      .filter((pair) => !/^(0s|1e-05s)\|(0s|1e-05s)$/.test(pair)),
  );
  expect(durations).toEqual([]);
});
