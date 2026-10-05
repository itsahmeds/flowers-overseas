/**
 * The checkout primitives' islands in a browser (spec 010 **AC-14** component half, **T-14**
 * component half, **AC-38** island half, **T-38** island half; TASK-201).
 *
 * Driven on `/dev/components`' "Checkout" section, the only surface that mounts them until
 * TASK-204 builds `/checkout` (whose own e2e, T-14's page half, submits a real step). The live
 * form there has no submit button and posts nowhere.
 *
 *  - **AC-14:** the error summary that appears in a hydrated page takes focus (`FocusOnMount`),
 *    links to each field, and following a link focuses that field.
 *  - **On blur:** an edited required field left empty shows its message, ties it by
 *    `aria-describedby`, marks `aria-invalid`, and keeps the value; a postcode in the wrong form
 *    shows the format message.
 *  - **Card counter:** typing updates the counter and mirrors the message and the signature into
 *    the printed-card preview.
 *  - **AC-38:** none of that makes a network request.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";
const IDS = {
  form: "gallery-checkout-form",
  summary: "gallery-checkout-errors",
  showErrors: "gallery-checkout-show-errors",
  name: "gallery-checkout-name",
  postcode: "gallery-checkout-postcode",
  card: "gallery-checkout-card",
  signAs: "gallery-checkout-sign-as",
} as const;

test.describe("checkout primitives on /dev/components", () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto(GALLERY);
    expect(
      response?.status(),
      `${GALLERY} must be served; is ENABLE_DEV_UI=true on the target?`,
    ).toBe(200);
    await page.waitForLoadState("networkidle");
  });

  test("the error summary takes focus and links to each field (AC-14)", async ({
    page,
  }) => {
    await page.locator(`#${IDS.showErrors}`).click();
    const summary = page.locator(`#${IDS.summary}`);
    await expect(summary).toBeFocused();
    await expect(summary).toHaveAttribute("role", "alert");
    const links = summary.locator("a");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", `#${IDS.name}`);
    await expect(links.nth(1)).toHaveAttribute("href", `#${IDS.postcode}`);
    await links.nth(1).click();
    await expect(page.locator(`#${IDS.postcode}`)).toBeFocused();
  });

  test("an edited field shows its message on blur and keeps its value", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    const name = page.locator(`#${IDS.name}`);
    await name.fill("Anna");
    await name.fill("");
    await name.blur();
    const nameError = page.locator(`#${IDS.name}-error`);
    await expect(nameError).toBeVisible();
    await expect(nameError).toHaveText("Please fill this in to continue.");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveAttribute(
      "aria-describedby",
      new RegExp(`\\b${IDS.name}-error\\b`),
    );

    const postcode = page.locator(`#${IDS.postcode}`);
    await postcode.fill("123");
    await postcode.blur();
    await expect(page.locator(`#${IDS.postcode}-error`)).toHaveText(
      "Please enter it in the form 00-001.",
    );
    await expect(postcode).toHaveValue("123");

    await postcode.fill("00-001");
    await postcode.blur();
    await expect(page.locator(`#${IDS.postcode}-error`)).toBeHidden();
    await expect(postcode).not.toHaveAttribute("aria-invalid", "true");

    expect(requests, "the islands make no network request").toEqual([]);
  });

  test("tabbing through an untouched field raises nothing", async ({
    page,
  }) => {
    await page.locator(`#${IDS.name}`).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(`#${IDS.name}-error`)).toBeHidden();
  });

  test("the card counter and preview follow what is typed, offline (AC-38)", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.locator(`#${IDS.card}`).fill("Hello Mama 👨‍👩‍👧");
    await expect(page.locator(`#${IDS.card}-count`)).toHaveText(
      "12 of 200 characters",
    );
    await page.locator(`#${IDS.signAs}`).fill("Love, Anna");
    const preview = page.locator(`[data-fo-mirror="${IDS.card}"]`);
    await expect(preview).toHaveText("Hello Mama 👨‍👩‍👧");
    await expect(page.locator(`[data-fo-mirror="${IDS.signAs}"]`)).toHaveText(
      "Love, Anna",
    );

    expect(requests, "the islands make no network request").toEqual([]);
  });
});
