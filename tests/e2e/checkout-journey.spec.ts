/**
 * The demo checkout end to end, against a database-backed origin (spec 010 §11 "CI", §12 task 8;
 * TASK-208): **T-14** page half, **T-29**, **T-33**, **T-34** (URL half), **T-68** (single
 * delivery), and the axe pass on each step and the confirmation (**T-37**, the `en-gb` and `pl`
 * half of its four-locale matrix).
 *
 * The journey starts where a buyer starts, on the product page's "Try a demo order", walks the
 * four steps (spec 010 §14 A-founder-2026-10-25a: recipient, "Your card", "Your details", check)
 * with "Use sample details", a typed card and signature and typed buyer details, places the order
 * and reads the confirmation, in `en-gb` and `pl`, once with JavaScript and once without (every
 * form is a plain `<form>` posting to the server action, so both runs take the same path). A
 * three-line basket walks step 1 and step 2 per line, step 3 once and step 4 once, with
 * JavaScript off (**T-105**, AC-105, AC-58 and AC-7 as amended; TASK-418).
 *
 * **Where it runs.** Every other e2e spec runs against the database-less preview origin. The
 * checkout cannot: it writes a draft and places an order. The `e2e` job of `ci.yml` starts a
 * Postgres 16 service, migrates it, seeds it insert-only, opens `checkout.open` for `PL` (a
 * CI-only data flip), and serves the same build a second time on port 3100 with that database;
 * `CHECKOUT_E2E_BASE_URL` names it. Without that variable the suite is skipped locally with the
 * reason, and fails in CI, where a skip would hide the only browser run of the checkout.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { type Page, type Request, expect, test } from "@playwright/test";

import { CHECKOUT_SAMPLES } from "../../src/config/checkout-samples";

const ORIGIN = process.env.CHECKOUT_E2E_BASE_URL;
const IN_CI = process.env.CI === "true" || process.env.CI === "1";

if (ORIGIN === undefined && IN_CI) {
  throw new Error(
    "CHECKOUT_E2E_BASE_URL is not set: the e2e job must serve the database-backed origin (ci.yml, TASK-208)",
  );
}

test.skip(
  ORIGIN === undefined,
  "no database-backed origin: set CHECKOUT_E2E_BASE_URL (the e2e job in ci.yml does)",
);
if (ORIGIN !== undefined) test.use({ baseURL: ORIGIN });

const LOCALES = [
  { locale: "en-gb", pdp: "/en-gb/poland/product/amber-hour" },
  { locale: "pl", pdp: "/pl/polska/produkt/amber-hour" },
] as const;

type Messages = Record<string, unknown>;

function messages(locale: string): Messages {
  const file = locale === "pl" ? "pl" : "en";
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", `${file}.json`), "utf8"),
  ) as Messages;
}

function text(catalogue: Messages, key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalogue,
    );
  if (typeof value !== "string") throw new Error(`no message ${key}`);
  return value;
}

const SAMPLE = CHECKOUT_SAMPLES.PL;
const CARD = { message: "Happy birthday from far away", signAs: "Love, Kasia" };
const REFERENCE = /FO-[0-9A-Z]{4}-[0-9A-Z]{4}/u;

/** Every value a URL must never carry (AC-34). */
function personalValues(token: string): string[] {
  return [
    token,
    SAMPLE.recipient.fields.fullName,
    SAMPLE.recipient.fields.street,
    SAMPLE.recipient.fields.postcode,
    SAMPLE.recipient.fields.phone,
    SAMPLE.recipient.fields.phone.replaceAll(" ", ""),
    SAMPLE.buyer.email,
    SAMPLE.buyer.buyerName,
    CARD.message,
    CARD.signAs,
  ];
}

/** The visible submit with this label: the form's own on a wide screen, the sticky bar's on a phone. */
async function press(page: Page, label: string): Promise<void> {
  // The stylesheet decides which of the two is shown, so wait for it before choosing.
  await page.waitForLoadState("load");
  await page
    .locator('button[type="submit"]:not([aria-hidden="true"])', {
      hasText: label,
    })
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForLoadState("domcontentloaded");
}

/** The step form's inputs, a radio group counted once (AC-7, AC-105: at most eight per screen). */
async function stepInputNames(page: Page): Promise<string[]> {
  const names = await page
    .locator(
      '#co-step input:not([type="hidden"]), #co-step select, #co-step textarea',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("name") ?? ""),
    );
  return [...new Set(names)];
}

/** The progress list: four items, `aria-current="step"` on the current one only. */
async function expectProgress(page: Page, current: string): Promise<void> {
  const items = page.locator("ol[aria-label] > li[data-fo-step]");
  await expect(items).toHaveCount(4);
  await expect(items.and(page.locator('[aria-current="step"]'))).toHaveCount(1);
  await expect(page.locator('li[aria-current="step"]')).toHaveAttribute(
    "data-fo-step",
    current,
  );
}

const BUYER_FIELDS = ["email", "buyerName", "buyerPhone", "residenceCountry"];

/** Step 3, "Your details": exactly the buyer's four inputs, filled where empty. */
async function fillDetails(page: Page): Promise<void> {
  await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
    "data-fo-checkout",
    "details",
  );
  await expectProgress(page, "details");
  expect((await stepInputNames(page)).toSorted()).toEqual(
    [...BUYER_FIELDS].toSorted(),
  );
  if ((await page.locator("#co-email").inputValue()) === "") {
    await page.locator("#co-email").fill(SAMPLE.buyer.email);
  }
  if ((await page.locator("#co-buyerName").inputValue()) === "") {
    await page.locator("#co-buyerName").fill(SAMPLE.buyer.buyerName);
  }
  if ((await page.locator("#co-residenceCountry").inputValue()) === "") {
    await page
      .locator("#co-residenceCountry")
      .selectOption(SAMPLE.buyer.residenceCountry);
  }
}

/** Step 2, "Your card": the card and the sign-off, and no buyer field (AC-105). */
async function expectCardStep(page: Page): Promise<void> {
  await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
    "data-fo-checkout",
    "card",
  );
  await expectProgress(page, "card");
  const names = await stepInputNames(page);
  for (const field of BUYER_FIELDS) expect(names).not.toContain(field);
  expect(names.length).toBeLessThanOrEqual(8);
}

async function axeClean(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
    ),
    `axe on ${where}`,
  ).toEqual([]);
}

for (const javaScript of [true, false] as const) {
  test.describe(`the demo checkout, JavaScript ${javaScript ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled: javaScript });

    for (const { locale, pdp } of LOCALES) {
      test(`${locale}: product page to confirmation, nothing personal in a URL (T-14, T-29, T-33, T-34, T-68)`, async ({
        page,
        context,
      }, testInfo) => {
        const m = messages(locale);
        const requests: string[] = [];
        page.on("request", (request: Request) => requests.push(request.url()));
        const runAxe = javaScript && testInfo.project.name === "e2e-desktop";

        // The product page's demo entry (spec 009 amendment, AC-5).
        const product = await page.goto(pdp);
        expect(product?.status()).toBe(200);
        await page
          .locator('[data-fo-pdp-entry] button[value="checkout"]')
          .click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
          "data-fo-checkout",
          "recipient",
        );
        await expect(page.locator("[data-fo-demo-banner]")).toBeVisible();
        const token =
          (await context.cookies()).find(
            (cookie) => cookie.name === "fo_checkout",
          )?.value ?? "";
        expect(token).not.toBe("");

        // Step 1: the sample, then a date.
        await page.locator('button[value="sample"]').click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page.locator("#co-fullName")).toHaveValue(
          SAMPLE.recipient.fields.fullName,
        );
        const chosen = page.locator('input[name="deliveryDate"]:checked');
        if ((await chosen.count()) === 0) {
          await page
            .locator('input[name="deliveryDate"]:not([disabled])')
            .first()
            .check({ force: true });
        }
        await expectProgress(page, "recipient");
        expect((await stepInputNames(page)).length).toBeLessThanOrEqual(8);
        if (runAxe) await axeClean(page, `${locale} step 1`);
        await press(page, text(m, "checkout.action.toYourCard"));

        // Step 2, "Your card": a typed card and signature, and no buyer field.
        await expectCardStep(page);
        await page.locator("#co-cardMessage").fill(CARD.message);
        await page.locator("#co-signAs").fill(CARD.signAs);
        if (runAxe) await axeClean(page, `${locale} step 2`);
        await press(page, text(m, "checkout.action.toCard"));

        // Step 3, "Your details": the buyer's four fields, once.
        await fillDetails(page);
        if (runAxe) await axeClean(page, `${locale} step 3`);
        await press(page, text(m, "checkout.action.toReview"));

        // Step 4: the review shows what was typed; no pre-contract block in demo (AC-33).
        await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
          "data-fo-checkout",
          "review",
        );
        await expectProgress(page, "review");
        const review = page.locator("[data-fo-review]");
        await expect(review).toContainText(SAMPLE.recipient.fields.fullName);
        await expect(review).toContainText(CARD.message);
        await expect(review).toContainText(CARD.signAs);
        if (runAxe) await axeClean(page, `${locale} step 4`);
        await press(page, text(m, "checkout.demo.place"));

        // The confirmation (AC-29, AC-33, AC-68): reference, demo statement, recap; no way back
        // into the steps and no form.
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/checkout/done$`, "u"),
        );
        const done = page.locator('[data-fo-confirmation="demo"]');
        await expect(done).toBeVisible();
        await expect(page.locator("[data-fo-demo-banner]")).toBeVisible();
        await expect(done.locator("[data-fo-reference]")).toContainText(
          REFERENCE,
        );
        await expect(done.locator("[data-fo-demo-statement]")).toHaveText(
          text(m, "confirmation.demo.body"),
        );
        await expect(
          page.locator("[data-fo-confirmation-recap]"),
        ).toContainText(SAMPLE.recipient.fields.fullName);
        await expect(page.locator('main a[href*="step="]')).toHaveCount(0);
        await expect(page.locator("main form")).toHaveCount(0);
        if (runAxe) await axeClean(page, `${locale} confirmation`);

        // AC-34, URL half: the query names the screen and nothing else; nothing personal anywhere.
        const own = requests.filter((url) => url.startsWith(ORIGIN ?? ""));
        expect(own.length).toBeGreaterThan(0);
        for (const url of own) {
          const parsed = new URL(url);
          if (parsed.pathname.includes("/checkout")) {
            for (const key of parsed.searchParams.keys()) {
              expect(["step", "line", "_rsc"], url).toContain(key);
            }
          }
          for (const value of personalValues(token)) {
            expect(decodeURIComponent(url), url).not.toContain(value);
          }
        }
      });
    }
  });
}

test("the confirmation without a cookie says it is no longer available, with no order data (T-29)", async ({
  page,
}) => {
  const response = await page.goto("/en-gb/checkout/done");
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-fo-confirmation="gone"]')).toBeVisible();
  await expect(page.locator("main")).not.toContainText(REFERENCE);
});

test("Enter in a step 1 field continues; it never presses Use sample details", async ({
  page,
}) => {
  const m = messages("en-gb");
  await page.goto("/en-gb/poland/product/amber-hour");
  await page.locator('[data-fo-pdp-entry] button[value="checkout"]').click();
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#co-fullName").fill("Typed By Hand");
  await page.locator("#co-fullName").press("Enter");
  await page.waitForLoadState("domcontentloaded");
  // The step's own submit ran: the other fields are empty, so step 1 comes back with its error
  // summary, and the sample was not applied over what was typed.
  await expect(page.locator("#co-fullName")).toHaveValue("Typed By Hand");
  await expect(page.locator("#co-street")).not.toHaveValue(
    SAMPLE.recipient.fields.street,
  );
  await expect(page.locator("#co-errors")).toBeVisible();
  expect(text(m, "checkout.action.toYourCard")).not.toBe("");
});

for (const javaScript of [true, false] as const) {
  test.describe(`step 2 add-ons, JavaScript ${javaScript ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled: javaScript });

    test("an add-on press keeps the typed card (TASK-504)", async ({
      page,
    }) => {
      const m = messages("en-gb");
      await page.goto("/en-gb/poland/product/amber-hour");
      await page
        .locator('[data-fo-pdp-entry] button[value="checkout"]')
        .click();
      await page.waitForLoadState("domcontentloaded");
      await page.locator('button[value="sample"]').click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("#co-fullName")).toHaveValue(
        SAMPLE.recipient.fields.fullName,
      );
      if (
        (await page.locator('input[name="deliveryDate"]:checked').count()) === 0
      ) {
        await page
          .locator('input[name="deliveryDate"]:not([disabled])')
          .first()
          .check({ force: true });
      }
      await press(page, text(m, "checkout.action.toYourCard"));
      await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
        "data-fo-checkout",
        "card",
      );
      await page.locator("#co-cardMessage").fill(CARD.message);
      await page.locator("#co-signAs").fill(CARD.signAs);
      const addon = page
        .locator("[data-fo-addon] button[name='addAddon']")
        .first();
      const key = (await addon.getAttribute("value")) ?? "";
      await addon.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(
        page.locator(`[data-fo-addon="${key}"] button[name='removeAddon']`),
      ).toBeVisible();
      await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
        "data-fo-checkout",
        "card",
      );
      await expect(page.locator("#co-cardMessage")).toHaveValue(CARD.message);
      await expect(page.locator("#co-signAs")).toHaveValue(CARD.signAs);
    });
  });
}

/*
 * T-105 (AC-105, AC-58 and AC-7 as amended; TASK-418): with JavaScript off, a three-line basket
 * walks step 1 and step 2 per line, step 3 once with the buyer's four fields, then step 4, and
 * places a demo order, in `en-gb` and `pl`. `?step=details` before the last line's step 2 draws
 * that step 2; a card changed after step 3 is saved keeps the buyer's fields.
 */
test.describe("a three-line basket, JavaScript off (T-105)", () => {
  test.use({ javaScriptEnabled: false });

  for (const { locale, pdp } of LOCALES) {
    test(`${locale}: steps 1 and 2 per line, step 3 once, step 4, placed`, async ({
      page,
    }) => {
      const m = messages(locale);
      for (let added = 0; added < 3; added += 1) {
        await page.goto(pdp);
        await page
          .locator('[data-fo-pdp-entry] button[value="basket"]')
          .click();
        await page.waitForLoadState("domcontentloaded");
      }
      await page.goto(`/${locale}/checkout`);
      for (let line = 1; line <= 3; line += 1) {
        await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
          "data-fo-checkout",
          "recipient",
        );
        await page.locator('button[value="sample"]').click();
        await page.waitForLoadState("domcontentloaded");
        if (
          (await page.locator('input[name="deliveryDate"]:checked').count()) ===
          0
        ) {
          await page
            .locator('input[name="deliveryDate"]:not([disabled])')
            .first()
            .check({ force: true });
        }
        expect((await stepInputNames(page)).length).toBeLessThanOrEqual(8);
        await press(page, text(m, "checkout.action.toYourCard"));
      }
      for (let line = 1; line <= 3; line += 1) {
        await expectCardStep(page);
        await expect(page.locator("[data-fo-delivery-of]")).toBeVisible();
        if (line === 2) {
          // Step 3 is not reachable before every line's step 2.
          await page.goto(`/${locale}/checkout?step=details`);
          await expectCardStep(page);
          await expect(
            page.locator('#co-step input[name="_line"]'),
          ).toHaveValue("2");
        }
        await page.locator("#co-cardMessage").fill(`${CARD.message} ${line}`);
        await press(page, text(m, "checkout.action.toCard"));
      }
      await fillDetails(page);
      await expect(page.locator("[data-fo-delivery-of]")).toHaveCount(0);
      await press(page, text(m, "checkout.action.toReview"));
      await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
        "data-fo-checkout",
        "review",
      );

      // A card changed after step 3 keeps the buyer's fields: back to step 4, not step 3.
      await page.goto(`/${locale}/checkout?step=card&line=3`);
      await expectCardStep(page);
      await page.locator("#co-cardMessage").fill("Changed after step 3");
      await press(page, text(m, "checkout.action.toCard"));
      await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
        "data-fo-checkout",
        "review",
      );
      await expect(page.locator("[data-fo-review]")).toContainText(
        "Changed after step 3",
      );
      await page.goto(`/${locale}/checkout?step=details`);
      await expect(page.locator("#co-email")).toHaveValue(SAMPLE.buyer.email);

      await page.goto(`/${locale}/checkout?step=review`);
      await press(page, text(m, "checkout.demo.place"));
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/checkout/done$`, "u"),
      );
      await expect(page.locator('[data-fo-confirmation="demo"]')).toBeVisible();
    });
  }
});
