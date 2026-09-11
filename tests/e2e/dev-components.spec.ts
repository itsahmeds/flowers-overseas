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
  "Media slots",
  "Media asset states",
  "Home hero and finder",
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
    // Scoped away from the home sections: the finder's own submit control is also labelled
    // `Continue` (the artboards' word), and it is not one of the primitive's states (TASK-052).
    // Five variants × (default, hover, active, focus-visible, disabled, small, full-width,
    // with-icon) = 40 `Continue` buttons; the busy one and the link one carry their own labels.
    const primitiveContinueButtons = await page
      .locator("button")
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              node.textContent?.trim() === "Continue" &&
              node.closest("[data-fo-finder]") === null,
          ).length,
      );
    expect(primitiveContinueButtons).toBe(40);
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
   * The **consent sheet** is the other exception §3 writes down in the same sentence — "no input,
   * select, textarea or form component ships here **beyond the consent controls**" — so its two
   * category checkboxes are counted separately below rather than waved through (TASK-051).
   */
  test("renders no form control and no price (spec §3, §8)", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    // TASK-052 narrows it by one more component, for the reason TASK-049's footer narrowed it:
    // the finder is a *component's own* form — three fields and a submit on a `get` form whose
    // target is a document that exists — and not a reusable form layer. The non-goal it must not
    // violate is asserted directly on the barrel (`tests/unit/ui-barrel.test.ts`): no exported
    // `Field`, `Input`, `Select`, `Textarea` or `Price`.
    const controlsOutsideKnownForms = await page
      .locator("input, select, textarea, label")
      .evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              node.closest("footer") === null &&
              node.closest("[data-fo-consent-panel]") === null &&
              node.closest("[data-fo-finder]") === null &&
              node.closest("[data-fo-hero]") === null,
          ).length,
      );
    expect(controlsOutsideKnownForms).toBe(0);

    // Exactly the consent controls: two labelled checkboxes per rendered settings panel, and
    // nothing else — no select, no textarea, no free-text field.
    const panels = await page.locator("[data-fo-consent-panel]").count();
    expect(panels).toBeGreaterThan(0);
    await expect(
      page.locator('[data-fo-consent-panel] input[type="checkbox"]'),
    ).toHaveCount(panels * 2);
    await expect(
      page.locator(
        "[data-fo-consent-panel] input:not([type=checkbox]), [data-fo-consent-panel] select, [data-fo-consent-panel] textarea",
      ),
    ).toHaveCount(0);
    // Two elements since §14 A4's addendum: the utility strip that scrolls with the page, and
    // the sticky banner holding the masthead and the category row.
    await expect(page.locator("[data-fo-utility]")).toHaveCount(1);
    await expect(page.locator("[data-fo-header]")).toHaveCount(1);
    await expect(
      page.locator(
        ["[data-fo-utility]", "[data-fo-header]"]
          .flatMap((root) =>
            ["input", "form", "select", "textarea", "label"].map(
              (control) => `${root} ${control}`,
            ),
          )
          .join(", "),
      ),
    ).toHaveCount(0);
    for (const section of ["Fields", "Prices"]) {
      await expect(
        page.getByRole("heading", { level: 2, name: section, exact: true }),
      ).toHaveCount(0);
    }
  });

  test("shows the photography placeholders (plan/10 §3)", async ({ page }) => {
    await page.goto(GALLERY);
    // Every named media slot is drawn, with its `sizes` string on the box (TASK-052).
    await expect(page.locator("[data-fo-media-slot]")).not.toHaveCount(0);
    for (const slot of ["hero", "grid", "tile", "thumb"]) {
      await expect(
        page.locator(`[data-fo-media-slot="${slot}"]`).first(),
      ).toBeVisible();
    }
    await expect(
      page.getByText("Photo slot · hero · founder to supply"),
    ).toBeVisible();
    // Every reserved box that is not an asset render carries no image at all: the honesty rule
    // is that the gallery shows a photograph only where the manifest has one (TASK-079).
    await expect(page.locator("[data-fo-media-placeholder] img")).toHaveCount(
      0,
    );
  });

  /**
   * The asset path's states (spec 006 §5.3, AC-17/AC-18/AC-19; TASK-079). The committed dataset
   * has no derived bytes, so this section renders against the fixture manifest in `catalog.ts`
   * and is the only place in the running application where an `<img>` exists at all — which is
   * what makes the counts below meaningful rather than incidental.
   */
  test("renders the media asset states: image, placeholder and the honesty label", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    // Exactly two displayable fixture assets, so exactly two images on the whole document.
    const images = page.locator("img");
    await expect(images).toHaveCount(2);
    for (const alt of await images.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("alt")),
    )) {
      expect(alt ?? "").not.toBe("");
    }

    // AVIF first, WebP as the `<img>`'s own ladder (spec 006 §2.5).
    await expect(page.locator('picture source[type="image/avif"]')).toHaveCount(
      2,
    );
    const imgSrcSets = await images.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("srcset") ?? ""),
    );
    expect(imgSrcSets.every((value) => value.includes(".webp"))).toBe(true);

    // The placeholder reasons this section demonstrates, each with no image in its box.
    // `unapproved` twice: the fixture's pending asset, and the committed dataset's own state —
    // 31 rows, none reviewed and none derived, so the gate reports the first failure.
    await expect(
      page.locator('[data-fo-media-placeholder="unapproved"]'),
    ).toHaveCount(2);
    for (const reason of ["noAlt", "noVariants"]) {
      await expect(
        page.locator(`[data-fo-media-placeholder="${reason}"]`),
      ).toHaveCount(1);
    }

    // AC-19: one `priority` candidate, one preload **in `<head>`**, and the preload agrees with
    // the `srcset` it was built from. Placement is the half a unit test cannot see: a `<link>`
    // rendered in the body is discovered no earlier than the `<img>` it precedes, so the preload
    // is emitted through React's `preload()`, which hoists it into the head.
    const preload = page.locator('head link[rel="preload"][as="image"]');
    await expect(preload).toHaveCount(1);
    await expect(page.locator('body link[rel="preload"]')).toHaveCount(0);
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(1);
    const preloadSrcSet = await preload.getAttribute("imagesrcset");
    const preloadSizes = await preload.getAttribute("imagesizes");
    expect(preloadSrcSet ?? "").toContain(".avif");
    expect(preloadSizes).toBe("100vw");
    const priorityBox = page.locator(
      '[data-fo-media-slot="hero"][data-fo-media-source="photo"]',
    );
    expect(await priorityBox.locator("source").getAttribute("srcset")).toBe(
      preloadSrcSet,
    );

    // Everything that is not the LCP candidate is lazy, and nothing above it is eager.
    await expect(page.locator('img[loading="lazy"]')).toHaveCount(1);
    await expect(page.locator('img[decoding="async"]')).toHaveCount(1);

    // AC-17: the label is in the HTML, in the page's locale, exactly once — and it is absent
    // from the state whose only displayed asset is a photograph.
    await expect(page.locator('[data-fo-media-provenance="ai"]')).toHaveCount(
      1,
    );
    await expect(
      page.getByText("Example arrangement · our florist hand-makes each one"),
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
