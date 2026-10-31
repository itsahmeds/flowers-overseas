/**
 * The demo checkout end to end, against a database-backed origin (spec 010 §11 "CI", §12 task 8;
 * TASK-208): **T-14** page half, **T-29**, **T-33**, **T-34** (URL half), **T-68** (single
 * delivery), and the axe pass on each step and the confirmation (**T-37**, the `en-gb` and `pl`
 * half of its four-locale matrix).
 *
 * The journey starts where a buyer starts, on the product page's "Try a demo order", walks the
 * three steps with "Use sample details", a typed card and signature, places the order and reads
 * the confirmation, in `en-gb` and `pl`, once with JavaScript and once without (every form is a
 * plain `<form>` posting to the server action, so both runs take the same path).
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
        if (runAxe) await axeClean(page, `${locale} step 1`);
        await press(page, text(m, "checkout.action.toCard"));

        // Step 2: a typed card and signature; the buyer as the sample left it, or typed.
        await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
          "data-fo-checkout",
          "card",
        );
        await page.locator("#co-cardMessage").fill(CARD.message);
        await page.locator("#co-signAs").fill(CARD.signAs);
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
        if (runAxe) await axeClean(page, `${locale} step 2`);
        await press(page, text(m, "checkout.action.toReview"));

        // Step 3: the review shows what was typed; no pre-contract block in demo (AC-33).
        await expect(page.locator("[data-fo-checkout]")).toHaveAttribute(
          "data-fo-checkout",
          "review",
        );
        const review = page.locator("[data-fo-review]");
        await expect(review).toContainText(SAMPLE.recipient.fields.fullName);
        await expect(review).toContainText(CARD.message);
        await expect(review).toContainText(CARD.signAs);
        if (runAxe) await axeClean(page, `${locale} step 3`);
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
  expect(text(m, "checkout.action.toCard")).not.toBe("");
});
