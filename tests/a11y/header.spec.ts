/**
 * The header's own axe surface (spec 004 §8 "Accessibility", AC-7; TASK-048).
 *
 * `tests/a11y/shell.spec.ts` already audits whole documents and therefore already covers the
 * header — this file adds the two things that file cannot say:
 *
 *  - the audit is **scoped to the chrome** — since §14 A4's addendum that is two elements, the
 *    utility strip (`[data-fo-utility]`, a plain non-landmark `<div>` that scrolls with the page)
 *    and the sticky `banner` (`[data-fo-header]`, masthead + category row) — in all four launch
 *    locales plus `/ar-XB`, so a
 *    violation is attributed to this component rather than to "the page", and the RTL document is
 *    checked with the first real chrome it has ever had;
 *  - the **keyboard order** of the header is asserted directly: the skip link, the utility strip's
 *    help channel, the three sibling-locale links of spec 003's switcher, then the masthead
 *    lockup. The search band, the decorative menu glyph and every unpublished registry entry are
 *    deliberately *not* in the tab order, because they are text and a disabled control (spec §14
 *    A4) — a focus stop that does nothing is the failure this replaces.
 *
 * **Known, recorded, not fixed here: `scrollable-region-focusable` on the category row below
 * 900 px** (serious; owner spec 004 / TASK-048). The category row is `overflow-x-auto` below the
 * `md` breakpoint and carries no keyboard-focusable child while every entry is unpublished text,
 * so axe reports a scrollable region a keyboard user cannot reach. It is found again on every
 * mobile axe run — `/review 73` rediscovered it on `/dev/components` at 390 px (TASK-108's third
 * escalation, "carried to the chrome owner") and TASK-120's sweep rediscovered it a third time —
 * so it is written down here, where the next person to run axe on the header will read it.
 *
 * The audits above run at this project's default viewport and do not trip it. It is a **real**
 * defect, not a false positive, and it is not fixed in a copy task: the fix is either a
 * `tabindex="0"` with an accessible name on the scroller or (better) publishing the entries as
 * links, which is spec 008's, and both change the header's tab order and its visual baselines.
 * Whoever owns the next header change owns this.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const HEADER = "[data-fo-header]";
const UTILITY = "[data-fo-utility]";
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
      .include(UTILITY)
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
  // locales, the masthead lockup. The search band is text, the menu glyph is decoration
  // (TASK-055) and every unpublished registry entry is a `<span>`, so none of them is a stop
  // (§14 A4).
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
