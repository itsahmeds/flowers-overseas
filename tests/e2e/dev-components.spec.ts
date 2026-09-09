/**
 * T-30 / AC-28 (TASK-045): the component gallery is served when `ENABLE_DEV_UI` is on, is
 * `noindex`, and renders every token ramp and every component state this task ships.
 *
 * The flag-off half is a **404**, and it is asserted where it is observable: the env schema refuses
 * the flag in production (`tests/unit/env.test.ts`), and `pnpm build` fails there — the local and
 * CI verification for that is the command in the PR body, the same shape spec 003 used for
 * `ENABLE_PSEUDO_LOCALES`. A single deployment cannot answer both 200 and 404 for one URL, so this
 * suite asserts the served side and names the flag when it is missing, exactly as
 * `tests/e2e/locale-routing.spec.ts` does for the pseudo-locales.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

/** Every section heading the gallery must render (`src/app/(dev)/dev/components/catalog.ts`). */
const SECTIONS = [
  "Colour",
  "Type",
  "Space",
  "Radius, shadow, motion, layers",
  "Icons",
  "Brand mark",
  "Layout primitives",
  "Buttons",
  "Chips",
  "Photography placeholders",
  "Contrast manifest",
];

test.describe("/dev/components", () => {
  test("is served with the flag on, and is noindex", async ({ page }) => {
    const response = await page.goto(GALLERY);
    expect(
      response?.status(),
      `${GALLERY} must be served; is ENABLE_DEV_UI=true on the target?`,
    ).toBe(200);

    // `noindex` twice over: the response header spec 001 sets on every non-production document,
    // and the document's own robots meta.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    // One `<h1>`, a `main` landmark and a skip link — the rules §5.3 applies to every document.
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main#main")).toHaveCount(1);
  });

  test("renders every section of the token and component matrix", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    for (const section of SECTIONS) {
      await expect(
        page.getByRole("heading", { level: 2, name: section, exact: true }),
      ).toBeVisible();
    }
  });

  test("renders every button variant in its eight states", async ({ page }) => {
    await page.goto(GALLERY);
    const buttons = page.getByRole("button", { name: "Continue" });
    // Five variants × (default, hover, active, focus-visible, disabled, small, full-width,
    // with-icon) = 40 `Continue` buttons; the busy one and the link one carry their own labels.
    expect(await buttons.count()).toBe(40);
    // 5 primitive `disabled` buttons, plus the header's one inert control (TASK-048, spec §14
    // A4): the mobile menu button, which is `md:hidden` and so is in the accessibility tree
    // below the `md` breakpoint and out of it above — hence the count is read from the DOM
    // rather than hard-coded per project.
    const headerDisabled = await page
      .locator("[data-fo-header] button[disabled]:visible")
      .count();
    await expect(page.getByRole("button", { disabled: true })).toHaveCount(
      5 + headerDisabled,
    );
    await expect(page.locator('button[aria-busy="true"]')).toHaveCount(5);
    await expect(
      page.getByRole("link", { name: "See destinations" }),
    ).toHaveCount(5);
  });

  /**
   * Spec §3/§8, observable on the page (`/review 27` required change 2): the gallery had a
   * "Fields" and a "Prices" section, and both are non-goals of this spec — the form layer is
   * written against the checkout's real fields (010/013) and no price is rendered before 005/008.
   * So the assertion is the absence: no form control anywhere in the gallery **outside the
   * footer**. TASK-049 narrowed it by exactly one component: the colophon's occasion-reminder
   * signup, which design round 6 added to `SiteFooter` and which the gallery renders five times
   * with the footer's five states. That is a *component's own* field, not a reusable form layer,
   * and the non-goal it must not violate — no exported `Field`, `Input`, `Select`, `Textarea` or
   * `Price` on the `ui` barrel — is asserted directly in `tests/unit/ui-barrel.test.ts`.
   * The **site header** is on this page too and contributes no control at all, since spec §14 A4
   * renders its search band as the text the artboards draw rather than as an input and a submit
   * button (TASK-048) — asserted here rather than assumed.
   */
  test("renders no form control and no price (spec §3, §8)", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    const controlsOutsideTheFooter = await page
      .locator("input, select, textarea, label")
      .evaluateAll(
        (nodes) =>
          nodes.filter((node) => node.closest("footer") === null).length,
      );
    expect(controlsOutsideTheFooter).toBe(0);
    await expect(page.locator("[data-fo-header]")).toHaveCount(1);
    await expect(
      page.locator(
        "[data-fo-header] input, [data-fo-header] form, [data-fo-header] select, [data-fo-header] textarea, [data-fo-header] label",
      ),
    ).toHaveCount(0);
    for (const section of ["Fields", "Prices"]) {
      await expect(
        page.getByRole("heading", { level: 2, name: section, exact: true }),
      ).toHaveCount(0);
    }
  });

  test("shows the photography placeholders and no image (plan/10 §3)", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    await expect(page.locator("img")).toHaveCount(0);
    await expect(
      page.getByText("Photo slot · hero · founder to supply"),
    ).toBeVisible();
  });

  test("gives the focused skip link a visible box above every layer", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    await page.keyboard.press("Tab");
    const skip = page.locator("a").first();
    await expect(skip).toBeFocused();
    const box = await skip.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
