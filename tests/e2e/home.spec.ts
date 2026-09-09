/**
 * T-12 / AC-10's above-the-fold half and **T-13 / AC-11** (TASK-052): the locale home's hero,
 * finder and proof row, served.
 *
 * Everything here needs a browser, a real response or both, which is what separates it from
 * `tests/unit/ui-home.test.tsx`:
 *
 *  - **one `<h1>` per document in all four locales**, inside the `main` landmark, with the hero
 *    slot present and holding no `<img>` (AC-10);
 *  - **the finder works with JavaScript disabled** (AC-11's hard requirement), asserted in a
 *    `javaScriptEnabled: false` context: the three fields are labelled, the country field is a
 *    native `<input list>` over a `<datalist>` of all seven destinations, and `Continue` submits
 *    to a **200** document — which is the property the whole "no `action` to a non-200 URL" rule
 *    exists for;
 *  - **the type-ahead enhancement**: with JavaScript on, typing filters the list, the matching
 *    name appears beneath the field with its typed prefix in bold, the count is announced through
 *    a polite live region, and picking a match fills the field (design round 7);
 *  - **keyboard operability** (WCAG 2.1.1): tab reaches every field and the submit control, in
 *    document order, and each is focusable;
 *  - **no cookie is written** by any of it — the finder is a `get` form, and the document is one
 *    cache entry (`plan/02` §14, spec 001 AC-15, spec 003 AC-12);
 *  - **the four-fact proof row** renders four facts and no photograph (AC-15's trap: "We
 *    photograph it at the door" is a promise, not a gallery).
 *
 * Both projects run every test: `e2e-desktop` is 1280 px and `e2e-mobile` is a Pixel 7 at 412 px,
 * so the two artboard geometries are covered without a second config.
 */
import { expect, test } from "@playwright/test";

const LOCALES = ["/en", "/en-gb", "/de", "/pl"] as const;

const HERO = "[data-fo-hero]";
const FINDER = "[data-fo-finder]";
const FORM = "[data-fo-finder-form]";
const PROOF = "[data-fo-proof-row]";
const DESTINATION_LIST = "[data-fo-finder-destinations]";
const MATCHES = "[data-fo-finder-matches]";
const ANNOUNCE = "[data-fo-finder-announce]";

/** The seven Phase-0 destinations of `src/config/countries.ts`, restated (AC-11). */
const DESTINATIONS = ["PL", "DE", "FR", "ES", "IT", "RO", "NL"] as const;

/** The field ids of `finder-model.ts`, restated so a rename is a visible diff. */
const FIELDS = ["finder-country", "finder-town", "finder-date"] as const;

test.describe("the locale home, above the fold", () => {
  for (const path of LOCALES) {
    test(`${path} renders one h1, the reserved hero slot and no image`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page.locator("main#main h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        page.locator(`${HERO} [data-fo-media-slot="hero"]`),
      ).toHaveCount(1);
      // `plan/10` §3: the demo shows no photograph it does not have.
      await expect(page.locator(`${HERO} img`)).toHaveCount(0);
      await expect(
        page.locator(`${HERO} [data-fo-media-slot="hero"]`),
      ).toHaveAttribute("data-fo-media-sizes", "100vw");
    });

    test(`${path} reserves the hero slot's box before paint`, async ({
      page,
    }) => {
      await page.goto(path);
      const box = await page
        .locator(`${HERO} [data-fo-media-slot="hero"]`)
        .boundingBox();
      expect(box?.height ?? 0).toBeGreaterThan(200);
      expect(box?.width ?? 0).toBeGreaterThan(300);
    });

    test(`${path} names all seven destinations with a state, and links none`, async ({
      page,
    }) => {
      await page.goto(path);

      for (const iso2 of DESTINATIONS) {
        await expect(
          page.locator(`${DESTINATION_LIST} [data-fo-destination="${iso2}"]`),
        ).toHaveCount(1);
      }
      // AC-14: nothing in the finder or the destination list is a link while every corridor
      // page is unpublished.
      await expect(page.locator(`${FINDER} a[href]`)).toHaveCount(0);
      await expect(page.locator(`${DESTINATION_LIST} a[href]`)).toHaveCount(0);
    });

    test(`${path} renders the four-fact proof row and no photo in it`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page.locator(`${PROOF} li`)).toHaveCount(4);
      await expect(page.locator(`${PROOF} img`)).toHaveCount(0);
      await expect(page.locator(`${PROOF} [data-fo-media-slot]`)).toHaveCount(
        0,
      );
    });
  }

  test("writes no cookie and sends no Set-Cookie", async ({
    page,
    context,
  }) => {
    const response = await page.goto("/en");
    const headers = await response?.headersArray();

    expect(
      (headers ?? [])
        .map((header) => header.name.toLowerCase())
        .filter((name) => name === "set-cookie"),
    ).toEqual([]);
    // Typing into the finder writes nothing either: no island stores a preference.
    await page.locator("#finder-country").fill("Pol");
    await page.locator("#finder-town").fill("Warszawa");
    expect(await context.cookies()).toEqual([]);
  });
});

test.describe("the finder's fields", () => {
  test("labels every field and reaches each one from the keyboard", async ({
    page,
  }) => {
    await page.goto("/en");

    for (const id of FIELDS) {
      const field = page.locator(`#${id}`);
      await expect(field).toHaveCount(1);
      // A label bound by `for`, which is what gives the control its accessible name.
      await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
      await field.focus();
      await expect(field).toBeFocused();
    }

    // The submit control is reachable and is a real submit.
    const submit = page.locator(`${FORM} button[type="submit"]`);
    await expect(submit).toHaveCount(1);
    await submit.focus();
    await expect(submit).toBeFocused();
  });

  test("submits to a 200 document and carries the answers in the query", async ({
    page,
  }) => {
    await page.goto("/en");
    await page.locator("#finder-country").fill("Poland");
    await page.locator("#finder-town").fill("Warszawa");

    await Promise.all([
      page.waitForURL(/\/en\?/),
      page.locator(`${FORM} button[type="submit"]`).click(),
    ]);

    const url = new URL(page.url());
    expect(url.pathname).toBe("/en");
    expect(url.searchParams.get("country")).toBe("Poland");
    expect(url.searchParams.get("town")).toBe("Warszawa");
    // The destination list is what `Continue` shows while no corridor page is published.
    expect(url.hash).toBe("#destinations");
    await expect(page.locator("#destinations")).toBeVisible();
  });

  test("the date field carries no prefilled value, because the page is cached", async ({
    page,
  }) => {
    await page.goto("/en");
    await expect(page.locator("#finder-date")).toHaveValue("");
    await expect(page.locator("#finder-date")).toHaveAttribute("type", "date");
  });
});

test.describe("the type-ahead enhancement (design round 7)", () => {
  test("filters to the matching country and announces the count", async ({
    page,
  }) => {
    await page.goto("/en");
    const field = page.locator("#finder-country");

    // Nothing is shown before anything is typed.
    await expect(page.locator(MATCHES)).toHaveCount(0);
    await expect(page.locator(ANNOUNCE)).toHaveText("");

    await field.fill("pol");

    const matches = page.locator(`${MATCHES} li`);
    await expect(matches).toHaveCount(1);
    await expect(matches.first()).toContainText("Poland");
    // The matched prefix in bold, as the artboards draw it — in the destination's own casing,
    // which is what the visitor is about to accept into the field.
    await expect(page.locator(`${MATCHES} strong`).first()).toHaveText("Pol");
    await expect(page.locator(ANNOUNCE)).toHaveText("1 country matches");
    await expect(page.locator(ANNOUNCE)).toHaveAttribute("aria-live", "polite");

    // A prefix nothing starts with says so rather than showing an empty box.
    await field.fill("zz");
    await expect(page.locator(MATCHES)).toHaveCount(0);
    await expect(page.locator(ANNOUNCE)).toHaveText(
      "No country matches what you typed",
    );
  });

  test("picks a match by keyboard, fills the field and closes the list", async ({
    page,
  }) => {
    await page.goto("/en");
    await page.locator("#finder-country").fill("net");

    const option = page.locator(`${MATCHES} button`).first();
    await option.focus();
    await expect(option).toBeFocused();
    // Focus inside the widget must not dismiss it — that is the difference between the blur rule
    // and a list that cannot be reached by keyboard at all.
    await expect(page.locator(MATCHES)).toHaveCount(1);
    await option.press("Enter");

    await expect(page.locator("#finder-country")).toHaveValue("Netherlands");
    // The picked option's button has just been unmounted, so focus is put back on the field the
    // visitor was filling in; the town field is next in the tab order from there.
    await expect(page.locator(MATCHES)).toHaveCount(0);
    await expect(page.locator("#finder-country")).toBeFocused();
  });

  test("picks a match by mouse, closes the list and uncovers the town field", async ({
    page,
  }) => {
    // 390 px is where `/review 40` measured the un-dismissed list over the town label and the top
    // 12 px of its input.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    await page.locator("#finder-country").fill("pol");

    await page.locator(`${MATCHES} button`).first().click();

    await expect(page.locator("#finder-country")).toHaveValue("Poland");
    // The query now matches the picked country exactly, which is precisely the state the first
    // cut left the list open in.
    await expect(page.locator(MATCHES)).toHaveCount(0);
    await expect(page.locator(ANNOUNCE)).toHaveText("");

    // Nothing paints over the town label or the top of its input any more: hit-test both.
    for (const selector of ['label[for="finder-town"]', "#finder-town"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      const topmost = await page.evaluate(
        ([x, y]) => {
          const element = document.elementFromPoint(x as number, y as number);
          return element === null
            ? null
            : (element.closest("label, input")?.outerHTML.slice(0, 80) ??
                element.outerHTML.slice(0, 80));
        },
        [(box?.x ?? 0) + 4, (box?.y ?? 0) + 2] as const,
      );
      expect(topmost, selector).toContain("finder-town");
    }
  });

  test("Escape dismisses the list, keeps what was typed and re-opens on the next keystroke", async ({
    page,
  }) => {
    await page.goto("/en");
    const field = page.locator("#finder-country");
    await field.fill("pol");
    await expect(page.locator(MATCHES)).toHaveCount(1);

    await field.press("Escape");

    await expect(page.locator(MATCHES)).toHaveCount(0);
    // The first Escape dismisses the suggestions only — a browser that also cleared the field
    // would throw away the visitor's typing.
    await expect(field).toHaveValue("pol");
    await expect(field).toBeFocused();
    await expect(page.locator(ANNOUNCE)).toHaveText("");

    await field.pressSequentially("a");
    await expect(page.locator(MATCHES)).toHaveCount(1);
  });

  test("moving focus out of the field closes the list", async ({ page }) => {
    await page.goto("/en");
    await page.locator("#finder-country").fill("pol");
    await expect(page.locator(MATCHES)).toHaveCount(1);

    await page.locator("#finder-town").focus();

    await expect(page.locator(MATCHES)).toHaveCount(0);
  });

  test("hands the native list over on hydration, so there are never two pop-ups", async ({
    page,
  }) => {
    await page.goto("/en");
    // The island removes `list` once it is alive; the `<datalist>` itself stays in the document
    // for a visitor whose JavaScript never runs.
    await expect(page.locator("#finder-country")).not.toHaveAttribute(
      "list",
      /.+/,
    );
    await expect(page.locator("datalist#finder-country-options")).toHaveCount(
      1,
    );
  });
});

test.describe("the finder with JavaScript disabled (AC-11)", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of LOCALES) {
    test(`${path} is a native type-ahead over all seven destinations`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // The country field is the platform's own combobox: `list` pointing at a `<datalist>` of
      // the seven destinations, which types, filters and picks with no script at all.
      await expect(page.locator("#finder-country")).toHaveAttribute(
        "list",
        "finder-country-options",
      );
      await expect(
        page.locator("datalist#finder-country-options option"),
      ).toHaveCount(DESTINATIONS.length);
      for (const id of FIELDS) {
        await expect(page.locator(`label[for="${id}"]`)).toHaveCount(1);
      }
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }

  test("Continue still submits to a 200 document", async ({ page }) => {
    await page.goto("/en");
    await page.locator("#finder-country").fill("Poland");

    const [response] = await Promise.all([
      page.waitForNavigation(),
      page.locator(`${FORM} button[type="submit"]`).click(),
    ]);

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/en");
    await expect(page.locator("#destinations")).toBeVisible();
  });
});
