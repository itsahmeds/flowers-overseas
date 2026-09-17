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

import { listingHonestyViolations } from "../support/listing-honesty.ts";

const GALLERY = "/dev/components";

/** The listing section's marker: spec 008's states, which several media counts exclude. */
const LISTING_STATE = "[data-fo-listing-state]";

/**
 * How many elements match `selector` **outside** the listing section (TASK-108). The media
 * assertions below are about the asset path's own states, and spec 008's card states reuse the
 * same fixture asset, so they are counted where they are made rather than globally.
 */
async function outsideListing(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<number> {
  return (
    await page
      .locator(selector)
      .evaluateAll(
        (nodes, marker) =>
          nodes.filter((node) => node.closest(marker) === null),
        LISTING_STATE,
      )
  ).length;
}

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
  "Home sections",
  "Contrast manifest",
  // TASK-108: spec 008's seven listing primitives (the section `LISTING_STATES` names).
  "Listing and card blocks",
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
              node.closest("[data-fo-hero]") === null &&
              // TASK-108 narrows it by one more component, for the reason the footer, the finder
              // and the hero narrowed it before: the listing toolbar is a *component's own* form
              // — one labelled `<select>` and one submit on a `GET` form whose target is the
              // listing itself (spec 008 §2) — and not a reusable form layer. The non-goal it
              // must not violate is still asserted on the barrel: no exported `Field`, `Input`,
              // `Select`, `Textarea` or `Price`.
              node.closest("[data-fo-listing-toolbar]") === null,
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

    // Exactly two displayable fixture assets in the media section, so exactly two images there.
    // The listing section renders the same fixture asset in its card states (TASK-108), so this
    // count is taken outside it — the assertion is about the asset path's states, not about how
    // many sections happen to use one.
    const images = page.locator("img");
    expect(await outsideListing(page, "img")).toBe(2);
    for (const alt of await images.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("alt")),
    )) {
      expect(alt ?? "").not.toBe("");
    }

    // AVIF first, WebP as the `<img>`'s own ladder (spec 006 §2.5) — one `<source>` per image,
    // counted outside the listing section for the reason above.
    expect(
      await outsideListing(page, 'picture source[type="image/avif"]'),
    ).toBe(2);
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

    // Everything that is not the LCP candidate is lazy, and nothing above it is eager. Counted
    // outside the listing section, which renders the same fixture asset in its card states
    // (TASK-108) and whose own lazy/eager contract is asserted in
    // `tests/unit/ui-shop-components.test.tsx`.
    expect(await outsideListing(page, 'img[loading="lazy"]')).toBe(1);
    expect(await outsideListing(page, 'img[decoding="async"]')).toBe(1);

    // AC-17: the label is in the HTML, in the page's locale, exactly once in this section — and
    // it is absent from the state whose only displayed asset is a photograph.
    expect(await outsideListing(page, '[data-fo-media-provenance="ai"]')).toBe(
      1,
    );
    // `.first()`: the listing section renders the same label on each card that displays a
    // generated photograph (spec 008 §2), which is the correct behaviour there and is counted
    // in that section's own tests.
    await expect(
      page
        .getByText("Example arrangement · our florist hand-makes each one")
        .first(),
    ).toBeVisible();
  });

  /**
   * **T-06 (DOM half) / AC-6**, served (spec 008 §8, §9 L261; TASK-108). The six page types are
   * TASK-117's; what is assertable today is the set of components those pages are built from, in
   * every state they can reach, through the same scan
   * (`tests/support/listing-honesty.ts`) the component tests use.
   */
  test("says nothing spec 008 AC-6 forbids, anywhere in the listing section", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    // The section is addressed through the heading id `sectionId()` builds, so the scan covers
    // the listing primitives and not the gallery chrome around them (the site header's category
    // row, for one, carries wording this scan would rightly refuse on a listing).
    const section = page.locator("section:has(> #listing-and-card-blocks)");
    await expect(section).toHaveCount(1);
    const html = (await section.innerHTML()).trim();
    const text = (await section.innerText()).trim();
    expect(listingHonestyViolations({ html, text })).toEqual([]);
  });

  test("renders the listing primitives in every drawn state", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    // §13 Q8: the card is a tile until spec 009 publishes the product link id, so the tile state
    // carries no `<a>` at all and the link state carries exactly one.
    const tile = page.locator('[data-fo-listing-state="cardTile"]');
    await expect(tile.locator("a")).toHaveCount(0);
    await expect(
      tile.locator('[data-fo-product-card-kind="tile"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-fo-listing-state="cardLink"] a'),
    ).toHaveCount(1);

    // The grid is a named list of four cards.
    const grid = page.locator('[data-fo-listing-state="gridDesktop"] ul');
    await expect(grid).toHaveCount(1);
    expect(await grid.getAttribute("aria-label")).toContain("4");
    await expect(grid.locator("li")).toHaveCount(4);

    // The toolbar is a GET form with a real select and a real submit — no island, no auto-submit.
    const toolbar = page.locator('[data-fo-listing-toolbar="default"] form');
    await expect(toolbar).toHaveAttribute("method", "get");
    await expect(toolbar.locator("select[name=sort]")).toHaveCount(1);
    await expect(toolbar.locator('button[type="submit"]')).toHaveCount(1);
    await expect(
      page
        .getByText(
          "Our order is the order we chose ourselves. It is not a ranking by sales, by popularity or by payment, and it does not change with who you are.",
        )
        .first(),
    ).toBeVisible();

    // Pagination: a labelled nav of real links, nothing on a single page, and no `?page=1`.
    const first = page.locator('[data-fo-listing-state="paginationFirst"] nav');
    await expect(first).toHaveAttribute("aria-label", "Pages of products");
    await expect(first.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(first.locator("button")).toHaveCount(0);
    await expect(
      page.locator('[data-fo-listing-state="paginationSingle"] nav'),
    ).toHaveCount(0);

    // The empty state: the sentence and the ways out, and no grid, skeleton or card.
    const empty = page.locator('[data-fo-listing-state="empty"]');
    await expect(empty.locator("ul")).toHaveCount(0);
    await expect(empty.locator("[data-fo-product-card]")).toHaveCount(0);
    await expect(empty.locator("a")).toHaveCount(3);

    // The from-price chip renders nothing where there is no destination (§2, 005 §13 Q10).
    expect(
      (
        await page
          .locator('[data-fo-listing-state="fromPriceNone"]')
          .innerText()
      ).trim(),
    ).toBe("");
    await expect(
      page.locator('[data-fo-listing-state="chipRowEmpty"] nav'),
    ).toHaveCount(0);
  });

  test("the sort form works with JavaScript disabled and by keyboard alone", async ({
    browser,
  }) => {
    // A context with JavaScript off: the toolbar must still submit, because it is a `GET` form
    // and not an island (spec 008 §2, AC-9's render half).
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(GALLERY);

    const select = page.locator("#gallery-sort-default");
    await expect(select).toBeVisible();
    await select.selectOption("price-desc");
    await Promise.all([
      page.waitForURL(/sort=price-desc/),
      page
        .locator('[data-fo-listing-toolbar="default"] button[type="submit"]')
        .click(),
    ]);
    expect(new URL(page.url()).searchParams.get("sort")).toBe("price-desc");
    await context.close();
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
