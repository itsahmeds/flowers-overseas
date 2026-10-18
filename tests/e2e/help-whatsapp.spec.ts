/**
 * T-36's chrome half (spec 041 §14 A-founder-2026-10-14d, AC-34 for the header strip, the phone
 * Menu and the footer; TASK-238). The help page's half is TASK-182's, which builds that page.
 *
 * On `/en`, a product page and `/pl`, at 1440 × 900 (the utility strip's help line and the footer)
 * and at 390 × 844 (the opened Menu's help line and the footer): every link whose text carries the
 * locale's `company.support.label` ("Help & WhatsApp" or its draft) and every WhatsApp link has
 * `href` exactly `https://wa.me/12135925150` (the E.164 number without its `+`, no query string),
 * and no link on the page is `tel:`.
 *
 * Red when the help line's `href` is set back to `tel:+12135925150`, and when `?text=` is added.
 * The viewports are set here, so the suite runs in the `e2e-desktop` project only.
 */
import { type Page, expect, test } from "@playwright/test";

import { COMPANY } from "../../src/config/company.ts";

const WHATSAPP = `https://wa.me/${COMPANY.contact.phoneE164.slice(1)}`;

/** `company.support.label` per locale, as the catalogues carry it. */
const LABEL: Readonly<Record<string, string>> = {
  en: "Help & WhatsApp",
  pl: "Pomoc i WhatsApp",
};

const PAGES = [
  { path: "/en", locale: "en" },
  { path: "/en/poland/product/small-kindness", locale: "en" },
  { path: "/pl", locale: "pl" },
] as const;

const VIEWPORTS = [
  { width: 1440, height: 900, help: "[data-fo-header-band='utility']" },
  { width: 390, height: 844, help: "[data-fo-menu-panel]" },
] as const;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "e2e-desktop",
    "sets its own viewports; run once, in e2e-desktop",
  );
});

/** Every rendered link's text and `href`. */
async function linksOf(page: Page): Promise<{ text: string; href: string }[]> {
  return page.locator("a[href]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent ?? "",
      href: node.getAttribute("href") ?? "",
    })),
  );
}

test("pins the one target: the E.164 number without its plus", () => {
  expect(WHATSAPP).toBe("https://wa.me/12135925150");
});

for (const { path, locale } of PAGES) {
  for (const viewport of VIEWPORTS) {
    test(`${path} at ${String(viewport.width)} px: every Help & WhatsApp control opens WhatsApp, never tel:`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      if (viewport.width < 768) {
        await page.locator("[data-fo-menu-summary]").click();
        await expect(page.locator("[data-fo-menu][open]")).toHaveCount(1);
      }

      const links = await linksOf(page);
      // No `tel:` link anywhere on the page (spec 041 AC-34, last clause).
      expect(links.filter(({ href }) => href.startsWith("tel:"))).toEqual([]);

      // Every WhatsApp link is the one target, with no query string.
      const whatsapp = links.filter(({ href }) =>
        /wa\.me|whatsapp/iu.test(href),
      );
      expect(whatsapp.length, path).toBeGreaterThan(0);
      for (const { href } of whatsapp) expect(href, path).toBe(WHATSAPP);

      // Every control named by the support label is that same link.
      const label = LABEL[locale] ?? "";
      const labelled = links.filter(({ text }) => text.includes(label));
      expect(labelled.length, path).toBeGreaterThan(0);
      for (const { href } of labelled) expect(href, path).toBe(WHATSAPP);

      // The help line this width draws — the strip from `lg`, the Menu below `md` — and the
      // footer's Help & WhatsApp column, each a visible link to WhatsApp.
      await expect(
        page.locator(`${viewport.help} a[href="${WHATSAPP}"]`),
      ).toBeVisible();
      await expect(page.locator(`footer a[href="${WHATSAPP}"]`)).toHaveCount(1);
    });
  }
}
