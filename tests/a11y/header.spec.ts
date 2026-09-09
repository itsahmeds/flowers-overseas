/**
 * The header's own axe surface (spec 004 §8 "Accessibility", AC-7; TASK-048).
 *
 * `tests/a11y/shell.spec.ts` already audits whole documents and therefore already covers the
 * header — this file adds the two things that file cannot say:
 *
 *  - the audit is **scoped to the header** in all four launch locales plus `/ar-XB`, so a
 *    violation is attributed to this component rather than to "the page", and the RTL document is
 *    checked with the first real chrome it has ever had;
 *  - the **keyboard order** of the header is asserted directly: the skip link, the utility strip's
 *    help channel, the three sibling-locale links of spec 003's switcher, then the masthead
 *    lockup. The search band, the disabled menu button and every unpublished registry entry are
 *    deliberately *not* in the tab order, because they are text and a disabled control (spec §14
 *    A4) — a focus stop that does nothing is the failure this replaces.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HEADER = "[data-fo-header]";
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

const AUDITED = ["/en", "/en-gb", "/de", "/pl", "/ar-XB"] as const;

for (const path of AUDITED) {
  test(`${path} header has no serious or critical accessibility violations`, async ({
    page,
  }, testInfo) => {
    const response = await page.goto(path);
    expect(
      response?.status(),
      `${path} must be served; is ENABLE_PSEUDO_LOCALES=true on the target?`,
    ).toBe(200);

    const results = await new AxeBuilder({ page })
      .include(HEADER)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    await testInfo.attach(`axe-header${path.replaceAll("/", "_")}.json`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });

    expect(
      results.violations.filter((violation) =>
        BLOCKING_IMPACTS.has(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
}

test("the header's keyboard order follows the document order and stops at nothing inert", async ({
  page,
}) => {
  await page.goto("/en");

  const stops: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        if (active === null) return "none";
        const id = active.getAttribute("id");
        if (id !== null) return `${active.tagName}#${id}`;
        const href = active.getAttribute("href");
        return href === null ? active.tagName : `${active.tagName}[${href}]`;
      }),
    );
  }

  // Skip link, the help channel's WhatsApp and `tel:` links, the switcher's three sibling
  // locales, the masthead lockup. The search band is text, the menu button is disabled and every
  // unpublished registry entry is a `<span>`, so none of them is a stop (§14 A4).
  expect(stops).toEqual([
    "A[#main]",
    "A[https://wa.me/12135925150]",
    "A[tel:+12135925150]",
    "A[/en-gb]",
    "A[/de]",
    "A[/pl]",
    "A[/en]",
  ]);
});
