/**
 * AC-27 for the colophon (TASK-049): element baselines of the footer at the mobile and desktop
 * artboards, in the two locales that break layouts — `en` (the source copy) and `de` (compound
 * nouns, the longest strings in the catalogue).
 *
 * **Element screenshots, not full pages.** The full-page baselines of `./shell.spec.ts` already
 * change with every task that adds a section, so a footer regression would be one diff among many
 * and would be re-baselined away by the next task. Four tight screenshots of the `contentinfo`
 * subtree are what actually gate the canvas's colophon: the five-column grid and its collapse,
 * the two link columns as *text* rather than links, the absence of a payment logo, and the legal
 * row.
 *
 * Baselines are per platform (`snapshotPathTemplate`): `darwin/` is generated locally with
 * `pnpm test:visual --update-snapshots`, `linux/` comes from the `visual` CI job's failure
 * artifact, and both are committed — the procedure TASK-042 established.
 *
 * `navigator.languages` is emptied for the reason `./shell.spec.ts` documents: the suggestion
 * island would otherwise put the runner's language configuration into a committed PNG.
 */
import { type BrowserContext, expect, test } from "@playwright/test";

/**
 * A recorded consent decision, seeded before the first navigation (TASK-051).
 *
 * The consent sheet is a bottom sheet on the mobile artboard, so it paints **over the colophon**
 * — and an element screenshot captures whatever is painted in the element's box, overlay
 * included. Without this the footer baseline records whether the island's chunk had arrived yet,
 * which made this file flake rather than fail. With a refusal already in the jar the island
 * renders nothing; the sheet has its own baselines in `./consent.spec.ts`.
 */
async function recordConsentRefusal(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<void> {
  await context.addCookies([
    {
      name: "fo_consent",
      value: encodeURIComponent(
        JSON.stringify({
          v: 1,
          a: false,
          m: false,
          ts: "2026-09-09T00:00:00.000Z",
          cid: "6f1e6e6a-1d3a-4b5e-9c2f-8f0a1b2c3d4e",
        }),
      ),
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

/** The two artboards of `docs/design/homepage-v1/`. */
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const LOCALES = ["en", "de"] as const;

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`/${locale} footer matches the ${viewport.name} baseline`, async ({
      page,
      context,
      baseURL,
    }) => {
      await recordConsentRefusal(context, baseURL);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          get: () => [],
        });
      });
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('[data-fo-banner="shown"]')).toHaveCount(0);
      await expect(page.locator("[data-fo-consent]")).toHaveCount(0);

      const footer = page.getByRole("contentinfo");
      await expect(footer).toBeVisible();
      await expect(footer).toHaveScreenshot(
        `footer-${locale}-${viewport.name}.png`,
      );
    });
  }
}
