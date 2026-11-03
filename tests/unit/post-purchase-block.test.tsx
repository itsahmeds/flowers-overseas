/**
 * Spec 018's post-purchase block and the buyer's cancel, without a database (spec 018 §5.2
 * "`getConfirmationBlock`", "Buyer cancellation", §5.3 `checkout/done`, §7; §14
 * A-founder-2026-10-14b B.1, B.2; AC-9, AC-28 confirmation half, AC-39 block half, AC-43, AC-46
 * confirmation half; T-09, T-28, T-39, T-43, T-46 render halves; TASK-340).
 *
 * Spec 013's `test` and `live` states (TASK-263) are not merged, so the block is mounted the way
 * AC-9 says until they are: through a fixture renderer registered with spec 010's
 * `registerConfirmationState`, rendered by `ConfirmationPage` inside `<main>` exactly as the done
 * page does.
 *
 *  - `maskEmail`, `postPurchaseSteps`, `isCancellable` over A6.4's 26 statuses (set P exactly);
 *  - the rendered block: masked email, the four steps' exact words with the current one marked,
 *    `wa.me` with no `text`, the invoice tile per state, the tracking and calendar tiles; the cancel
 *    line as the **last element of `<main>`**, exactly its words, one text-styled button and no
 *    panel; no "refund" or "cannot deliver" before the press; absent outside set P;
 *  - the confirm dialog (`?cancel=review`): its four strings, the amount in GBP, PLN and EUR;
 *  - the refusal (`?cancel=refused`): exactly `postPurchase.cancelRefused`, `role="status"`;
 *  - the demo state: no block, no line;
 *  - `runBuyerCancel`: the cookie's purchase decides; a foreign reference, no purchase, a demo
 *    purchase and a forged step are 404 and call nothing; each outcome's 303 target;
 *  - the relay scan (AC-39) of the block in en-gb, de and pl, and no dash in the new copy;
 *  - the source scan (AC-28): no `UPDATE "order"` and no `appendEvent` in this task's code.
 */
import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createTranslator } from "next-intl";

import { relayMatches } from "../../src/config/honesty.ts";
import type { LocaleCode } from "../../src/config/locales.ts";
import type { Confirmation } from "../../src/modules/checkout";
import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  type ConfirmationBlock,
  ConfirmationBlockSchema,
  isCancellable,
  maskEmail,
  postPurchaseSteps,
} from "../../src/modules/orders/confirmation-block.ts";
import { buyerStep } from "../../src/modules/orders/tracking-view.ts";
import { SET_P, STATES } from "../fixtures/order-machine.ts";

vi.mock("next-intl/server", () => ({
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace?: string;
  }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: loadMessages(locale, MESSAGE_NAMESPACES),
        ...(namespace === undefined ? {} : { namespace }),
      } as Parameters<typeof createTranslator>[0]),
    ),
}));
// The action module reads cookies and redirects; the render only binds it.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { CancelDialog, CancelLine, PostPurchaseBlock, cancelDialogOpen } =
  await import("../../src/app/[locale]/(checkout)/_views/PostPurchaseBlock.tsx");
const { ConfirmationPage, registerConfirmationState } =
  await import("../../src/app/[locale]/(checkout)/_views/ConfirmationView.tsx");
const { cancelUiStateFrom, donePath, runBuyerCancel } =
  await import("../../src/app/[locale]/(checkout)/checkout/done/buyer-cancel.ts");
type CancelUiState = ReturnType<typeof cancelUiStateFrom>;

const ORDER_ID = "0b6a3f0e-8d1c-4c55-9a51-1c2f3e4d5a6b";
const OTHER_ID = "7f1e2d3c-4b5a-4968-8776-655443322110";
const REFERENCE = "FO-7K2M-9QXA";

/** The en strings of §7 and the boards, the one value each assertion holds the page to. */
const EN = {
  email: "A confirmation is on its way to a•••@example.com.",
  steps: [
    "We have your order and your payment",
    "Being made",
    "On its way",
    "Delivered, with a photo",
  ],
  line: "Plans changed? You can cancel for free until we start preparing your order.",
  button: "You can cancel for free",
  title: "Cancel this order?",
  yes: "Yes, cancel it",
  no: "Keep my order",
  refused:
    "We have started preparing your order, so it can no longer be cancelled. Message us on WhatsApp if something is wrong.",
  pending: "We will email your invoice shortly.",
  issued: "We have emailed it to you.",
};

function block(overrides: Partial<ConfirmationBlock> = {}): ConfirmationBlock {
  const projection = overrides.projection ?? "confirmed";
  return ConfirmationBlockSchema.parse({
    reference: REFERENCE,
    mode: "live",
    maskedEmail: "a•••@example.com",
    projection,
    steps: postPurchaseSteps(projection),
    trackingUrl: "https://flowersoverseas.com/en-gb/track/TOKEN123",
    trackingPath: "/en-gb/track/TOKEN123",
    calendarPath: "/en-gb/track/TOKEN123/calendar.ics",
    deliveryDate: "2026-10-08",
    invoice: "pending",
    cancelLine: isCancellable(projection)
      ? { amount: { amountMinor: 4590, currencyCode: "GBP" } }
      : null,
    ...overrides,
  });
}

/** The block each fixture order shows; read by the fixture renderer. */
const BLOCKS = new Map<string, ConfirmationBlock>();

function placed(
  mode: "demo" | "test" | "live",
  orderId = ORDER_ID,
): Confirmation {
  return {
    kind: "placed",
    mode,
    total: { amountMinor: 4590, currency: "GBP" },
    deliveries: [
      {
        orderId,
        reference: REFERENCE,
        sku: null,
        productName: "Amber Hour",
        tier: null,
        countryIso: "PL",
        recipientName: "Anna",
        address: "ul. Prosta 1, 00-001 Warszawa",
        city: "Warszawa",
        deliveryDate: "2026-10-08",
        card: null,
        addonNameKeys: [],
        amount: { amountMinor: 4590, currency: "GBP" },
      },
    ],
  } as Confirmation;
}

/**
 * The fixture renderer AC-9 allows until spec 013's states merge: the state's column (a heading,
 * then the block), the recap, then the line last in `<main>`, then the dialog; the column and the
 * recap are `inert` while the dialog is open.
 */
async function fixtureState({
  confirmation,
  locale,
  cancel,
}: {
  readonly confirmation: Extract<Confirmation, { kind: "placed" }>;
  readonly locale: LocaleCode;
  readonly cancel: CancelUiState;
}) {
  const [delivery] = confirmation.deliveries;
  const model = BLOCKS.get(delivery?.orderId ?? "");
  if (model === undefined) throw new Error("no fixture block");
  const open = cancelDialogOpen(model, 1, cancel);
  const [body, line, dialog] = await Promise.all([
    PostPurchaseBlock({ block: model, locale }),
    CancelLine({ block: model, locale, line: 1, state: cancel }),
    CancelDialog({ block: model, locale, line: 1, state: cancel }),
  ]);
  return (
    <>
      <div data-fixture-column="" inert={open}>
        <h1>Thank you. We have your order.</h1>
        {body}
      </div>
      <aside data-fixture-recap="" inert={open}>
        Your order
      </aside>
      {line}
      {dialog}
    </>
  );
}
registerConfirmationState("live", fixtureState);
registerConfirmationState("test", fixtureState);

async function page(
  model: ConfirmationBlock,
  options: {
    readonly locale?: LocaleCode;
    readonly cancel?: CancelUiState;
    readonly mode?: "demo" | "test" | "live";
  } = {},
): Promise<string> {
  BLOCKS.set(ORDER_ID, model);
  const element = await ConfirmationPage({
    confirmation: placed(options.mode ?? "live"),
    locale: options.locale ?? "en-gb",
    cancel: options.cancel ?? null,
  });
  // React's static renderer appends its form-replay script for a function `action`; Next
  // renders a server action's own endpoint instead, so the script is not part of the page.
  return renderToStaticMarkup(<main id="main">{element}</main>).replace(
    /<script>[\s\S]*?<\/script>$/u,
    "",
  );
}

/** Visible text: inline tags vanish, block tags separate words. */
function text(html: string): string {
  return html
    .replace(/<\/?(?:b|em|strong|button|a|bdi)\b[^>]*>/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

/** Every opening `<tag …>` that carries `needle` among its attributes. */
function tags(html: string, tag: string, needle: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gu"))]
    .map((match) => match[0])
    .filter((open) => open.includes(needle));
}

/** The cancel line's container through the end of `<main>`, or `null`. */
function tail(html: string): string | null {
  const start = html.lastIndexOf("<div", html.indexOf("data-fo-cancel-line"));
  return html.includes("data-fo-cancel-line") ? html.slice(start) : null;
}

describe("maskEmail (AC-9)", () => {
  it("keeps the first character, three bullets, @ and the domain", () => {
    expect(maskEmail("anna.kowalska@example.com")).toBe("a•••@example.com");
    expect(maskEmail("  Zoë@post.pl ")).toBe("Z•••@post.pl");
    expect(maskEmail("\u{1F33B}x@flowers.example")).toBe(
      "\u{1F33B}•••@flowers.example",
    );
    expect(maskEmail("a@b@c.example")).toBe("a•••@c.example");
  });

  it("gives null for a value with no local part or no domain", () => {
    for (const value of [null, "", "anna", "@example.com", "anna@"]) {
      expect(maskEmail(value), String(value)).toBeNull();
    }
  });
});

describe("the four steps and set P (AC-9, AC-28, AC-46)", () => {
  it("marks the current step from the folded projection", () => {
    const states = (projection: Parameters<typeof postPurchaseSteps>[0]) =>
      postPurchaseSteps(projection).map((step) => step.state);
    expect(states("confirmed")).toEqual([
      "current",
      "future",
      "future",
      "future",
    ]);
    expect(states("being_made")).toEqual([
      "done",
      "current",
      "future",
      "future",
    ]);
    expect(states("on_its_way")).toEqual(["done", "done", "current", "future"]);
    expect(states("delivered")).toEqual(["done", "done", "done", "current"]);
    expect(states("closed")).toEqual(["done", "done", "done", "done"]);
    expect(states("placed")).toEqual(["future", "future", "future", "future"]);
    expect(states("cancelled")).toEqual([
      "future",
      "future",
      "future",
      "future",
    ]);
  });

  it("is cancellable in exactly the seven statuses of set P, read from the projection", () => {
    const cancellable = STATES.filter((state) =>
      isCancellable(buyerStep(state.buyerProjection)),
    )
      .map((state) => state.key)
      .sort();
    expect(cancellable).toEqual([...SET_P].sort());
    expect(cancellable).toHaveLength(7);
    expect(cancellable).toContain("paid");
    expect(cancellable).not.toContain("in_production");
    expect(cancellable).not.toContain("placed");
  });
});

describe("the block on the live confirmation (AC-9, AC-43)", () => {
  it("renders the masked email, the four steps, the tiles and the contact path", async () => {
    const html = await page(block());
    expect(text(html)).toContain(EN.email);
    const labels = [
      ...html.matchAll(
        /data-fo-post-purchase-step="[^"]+"[^>]*>.*?<h3[^>]*>([^<]+)<\/h3>/gu,
      ),
    ].map((match) => match[1]);
    expect(labels).toEqual(EN.steps);
    expect(html).toMatch(
      /<li aria-current="step"[^>]*data-fo-post-purchase-step="order"/u,
    );
    expect(html.match(/aria-current="step"/gu)).toHaveLength(1);
    expect(text(html)).toContain("What happens next");
    // The tracking tile links to the order's token path; the calendar tile to its file.
    expect(tags(html, "a", "data-fo-post-purchase-track")).toEqual([
      expect.stringContaining('href="/en-gb/track/TOKEN123"'),
    ]);
    expect(html).toContain('href="/en-gb/track/TOKEN123/calendar.ics"');
    expect(text(html)).toContain("Thursday 8 October, all day");
    // WhatsApp with no `text` parameter (AC-9).
    const wa = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/gu)].map(
      (match) => match[1] ?? "",
    );
    expect(wa.length).toBeGreaterThan(0);
    for (const href of wa) {
      expect(href).toMatch(/^https:\/\/wa\.me\/\d+$/u);
    }
    expect(text(html)).toContain(`Quote your order ${REFERENCE}.`);
  });

  it("reads the invoice tile from the invoice state", async () => {
    const pending = await page(block({ invoice: "pending" }));
    expect(pending).toContain('data-fo-post-purchase-invoice="pending"');
    expect(text(pending)).toContain(EN.pending);
    expect(text(pending)).not.toContain(EN.issued);
    const issued = await page(block({ invoice: "issued" }));
    expect(text(issued)).toContain(EN.issued);
    expect(text(issued)).not.toContain(EN.pending);
  });

  it("at paid_unrouted: step 1 current, and no hold, authorisation or waiting (AC-43)", async () => {
    const html = await page(
      block({ projection: "confirmed", invoice: "issued" }),
    );
    expect(html).toMatch(
      /aria-current="step"[^>]*data-fo-post-purchase-step="order"/u,
    );
    expect(text(html)).not.toMatch(
      /\bheld\b|\bhold\b|authori[sz]|not yet charged|accept/iu,
    );
  });
});

describe("the quiet cancel line (AC-9, AC-28, AC-46)", () => {
  it("is the last element of <main>: exactly its words, one text-styled button, no panel", async () => {
    const html = await page(block());
    const last = tail(html);
    expect(last).not.toBeNull();
    // Nothing follows the line's container but the end of <main>.
    expect(last).toMatch(
      /^<div[^>]*data-fo-cancel-line=""[^>]*>.*<\/div><\/main>$/u,
    );
    expect(last?.match(/<div/gu)).toHaveLength(1);
    expect(text(last ?? "")).toBe(EN.line);
    const buttons = [
      ...(last ?? "").matchAll(/<button[^>]*>([^<]*)<\/button>/gu),
    ];
    expect(buttons.map((match) => match[1])).toEqual([EN.button]);
    expect(tags(last ?? "", "button", 'name="step"')).toEqual([
      expect.stringMatching(
        /type="submit".*value="review"|value="review".*type="submit"/u,
      ),
    ]);
    // No panel, highlight, rule or wash around it (the withdrawn cancel panel had all four).
    const classes = [...(last ?? "").matchAll(/class="([^"]*)"/gu)]
      .map((match) => match[1] ?? "")
      .filter((value) => !value.includes("underline"));
    for (const value of classes) {
      expect(value).not.toMatch(
        /\bbg-|\bborder\b|border-[a-z]|shadow|rounded|wash/u,
      );
    }
    // The button itself is text: no background, border or padding.
    const [button] = tags(last ?? "", "button", 'value="review"');
    for (const word of ["bg-transparent", "border-0", "p-0", "underline"]) {
      expect(button?.split('"')[1]?.split(" ")).toContain(word);
    }
  });

  it("says nothing about a refund or a failure before the button is pressed", async () => {
    for (const locale of ["en", "en-gb"] as const) {
      const html = await page(block(), { locale });
      expect(text(html)).not.toMatch(
        /refund|cannot deliver|could not deliver/iu,
      );
    }
  });

  it("is absent outside set P, and nothing replaces it", async () => {
    for (const projection of [
      "placed",
      "being_made",
      "on_its_way",
      "delivered",
      "closed",
    ] as const) {
      const html = await page(block({ projection }));
      expect(html, projection).not.toContain("data-fo-cancel-line");
      expect(text(html), projection).not.toContain(EN.button);
      expect(text(html), projection).not.toMatch(/cancel/iu);
    }
  });

  it("the 05:59 page shows the line; the 06:00 page (being made) does not (AC-46)", async () => {
    const before = await page(block({ projection: "confirmed" }));
    const after = await page(block({ projection: "being_made" }));
    expect(text(before)).toContain(EN.line);
    expect(text(after)).not.toContain(EN.line);
    expect(after).toMatch(
      /aria-current="step"[^>]*data-fo-post-purchase-step="beingMade"/u,
    );
    for (const html of [before, after]) {
      expect(text(html)).not.toMatch(
        /refund|cannot deliver|could not deliver/iu,
      );
    }
  });
});

describe("the confirm dialog (§5.2, ?cancel=review)", () => {
  const review: CancelUiState = { step: "review", line: 1 };

  it("opens with the four strings, the order's amount, and the page behind it inert", async () => {
    const html = await page(block(), { cancel: review });
    expect(html).toMatch(/<dialog [^>]*open=""/u);
    expect(html).toMatch(
      /<dialog [^>]*aria-labelledby="cancel-title-FO-7K2M-9QXA"/u,
    );
    const dialog = html.slice(html.indexOf("<dialog"));
    expect(text(dialog)).toBe(
      `${EN.title} We refund £45.90 in full. ${EN.yes} ${EN.no}`,
    );
    expect(tags(dialog, "button", 'value="confirm"')).toEqual([
      expect.stringContaining('name="step"'),
    ]);
    expect(dialog).toMatch(/value="confirm"[^>]*>Yes, cancel it</u);
    expect(tags(dialog, "form", 'method="get"')).toEqual([
      expect.stringContaining('action="/en-gb/checkout/done"'),
    ]);
    expect(tags(dialog, "button", "autofocus")).toHaveLength(1);
    expect(dialog).toMatch(/<button autofocus=""[^>]*>Keep my order</u);
    expect(html).toMatch(/data-fixture-column="" inert=""/u);
    expect(html).toMatch(/data-fo-cancel-line="" inert=""/u);
  });

  it("prints the refund in the order's own currency: GBP, PLN and EUR", async () => {
    const cases = [
      {
        amountMinor: 4590,
        currencyCode: "GBP",
        locale: "en-gb",
        shown: "£45.90",
      },
      {
        amountMinor: 18900,
        currencyCode: "PLN",
        locale: "pl",
        shown: "189,00 zł",
      },
      {
        amountMinor: 5990,
        currencyCode: "EUR",
        locale: "de",
        shown: "59,90 €",
      },
      { amountMinor: 5, currencyCode: "EUR", locale: "en-gb", shown: "€0.05" },
    ] as const;
    for (const each of cases) {
      const html = await page(
        block({
          cancelLine: {
            amount: {
              amountMinor: each.amountMinor,
              currencyCode: each.currencyCode,
            },
          },
        }),
        { cancel: review, locale: each.locale },
      );
      expect(html, each.currencyCode).toContain(each.shown);
    }
  });

  it("does not open for another line, nor outside set P", async () => {
    const other = await page(block(), { cancel: { step: "review", line: 2 } });
    expect(other).not.toContain("<dialog");
    const late = await page(block({ projection: "being_made" }), {
      cancel: review,
    });
    expect(late).not.toContain("<dialog");
    expect(text(late)).not.toMatch(/refund/iu);
  });
});

describe("the refusal (?cancel=refused)", () => {
  it("shows exactly cancelRefused, as a status, with the WhatsApp link, where the line was", async () => {
    const html = await page(block({ projection: "being_made" }), {
      cancel: { step: "refused", line: 1 },
    });
    expect(html).toMatch(
      /<p autofocus=""[^>]*role="status"[^>]*>We have started/u,
    );
    const refusal = html.slice(
      html.lastIndexOf("<div", html.indexOf("data-fo-cancel-refused")),
    );
    expect(refusal).toMatch(/<\/div><\/main>$/u);
    expect(text(refusal)).toMatch(
      new RegExp(`^${EN.refused.replace(/[.?]/gu, "\\$&")} WhatsApp \\+`, "u"),
    );
    expect(refusal).toMatch(/href="https:\/\/wa\.me\/\d+"/u);
    expect(text(html)).not.toContain(EN.button);
    expect(text(html)).not.toMatch(/accept|florist/iu);
  });

  it("draws the line, not the refusal, when the order is still in set P (a stale query)", async () => {
    const html = await page(block(), { cancel: { step: "refused", line: 1 } });
    expect(text(html)).toContain(EN.line);
    expect(text(html)).not.toContain(EN.refused);
  });
});

describe("the demo state (AC-9, 010 AC-29)", () => {
  it("renders no block and no line", async () => {
    const html = await page(block(), { mode: "demo" });
    expect(html).not.toContain("data-fo-post-purchase");
    expect(html).not.toContain("data-fo-cancel-line");
    expect(html).toContain('data-fo-confirmation="demo"');
  });
});

describe("the query (no id in any URL)", () => {
  it("reads only cancel and line", () => {
    expect(cancelUiStateFrom({ cancel: "review", line: "1" })).toEqual({
      step: "review",
      line: 1,
    });
    expect(cancelUiStateFrom({ cancel: "refused", line: "3" })).toEqual({
      step: "refused",
      line: 3,
    });
    for (const params of [
      {},
      { cancel: "confirm", line: "1" },
      { cancel: "review" },
      { cancel: "review", line: "0" },
      { cancel: "review", line: "x" },
      { cancel: ["review", "review"], line: "1" },
    ]) {
      expect(cancelUiStateFrom(params), JSON.stringify(params)).toBeNull();
    }
    expect(donePath("pl", null)).toBe("/pl/checkout/done");
    expect(donePath("en-gb", { step: "review", line: 2 })).toBe(
      "/en-gb/checkout/done?cancel=review&line=2",
    );
  });
});

describe("runBuyerCancel: the cookie's purchase decides (AC-28)", () => {
  function deps(
    confirmation: Confirmation,
    outcome: Awaited<
      ReturnType<Parameters<typeof runBuyerCancel>[1]["cancel"]>
    >,
  ) {
    const cancel = vi.fn(() => Promise.resolve(outcome));
    return {
      cancel,
      deps: { confirmation: () => Promise.resolve(confirmation), cancel },
    };
  }

  it("answers each outcome with its 303 back to the page", async () => {
    const review = deps(placed("live"), {
      kind: "review",
      amount: { amountMinor: 4590, currencyCode: "GBP" },
    });
    expect(
      await runBuyerCancel(
        { locale: "en-gb", reference: REFERENCE, step: "review" },
        review.deps,
      ),
    ).toEqual({
      kind: "redirect",
      to: "/en-gb/checkout/done?cancel=review&line=1",
    });
    expect(review.cancel).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      step: "review",
    });

    const done = deps(placed("test"), { kind: "cancelled" });
    expect(
      await runBuyerCancel(
        { locale: "pl", reference: REFERENCE, step: "confirm" },
        done.deps,
      ),
    ).toEqual({ kind: "redirect", to: "/pl/checkout/done" });
    expect(done.cancel).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      step: "confirm",
    });

    const refused = deps(placed("live"), { kind: "refused" });
    expect(
      await runBuyerCancel(
        { locale: "de", reference: REFERENCE, step: "confirm" },
        refused.deps,
      ),
    ).toEqual({
      kind: "redirect",
      to: "/de/checkout/done?cancel=refused&line=1",
    });
  });

  it("is 404 and calls nothing for another draft's order, no purchase, a demo purchase or a forged step", async () => {
    const cases: [Confirmation, unknown, unknown][] = [
      // The cookie leads to another purchase: the posted reference is not among its orders.
      [placed("live", OTHER_ID), "FO-0000-0000", "confirm"],
      [{ kind: "gone" }, REFERENCE, "confirm"],
      [placed("demo"), REFERENCE, "confirm"],
      [placed("live"), REFERENCE, "cancel"],
      [placed("live"), REFERENCE, null],
      [placed("live"), { reference: REFERENCE }, "confirm"],
    ];
    for (const [confirmation, reference, step] of cases) {
      const each = deps(confirmation, { kind: "cancelled" });
      expect(
        await runBuyerCancel({ locale: "en-gb", reference, step }, each.deps),
        JSON.stringify([confirmation.kind, reference, step]),
      ).toEqual({ kind: "not_found" });
      expect(each.cancel).not.toHaveBeenCalled();
    }
  });

  it("passes the module's not_found on (an order that vanished)", async () => {
    const gone = deps(placed("live"), { kind: "not_found" });
    expect(
      await runBuyerCancel(
        { locale: "en-gb", reference: REFERENCE, step: "confirm" },
        gone.deps,
      ),
    ).toEqual({ kind: "not_found" });
  });
});

describe("the buyer's voice (AC-39 block half, AC-9)", () => {
  it("gives no relay-language hit in en-gb, de and pl, in every state of the block", async () => {
    for (const locale of ["en-gb", "de", "pl"] as const) {
      for (const projection of [
        "placed",
        "confirmed",
        "being_made",
        "on_its_way",
        "delivered",
        "closed",
      ] as const) {
        for (const cancel of [
          null,
          { step: "review", line: 1 },
          { step: "refused", line: 1 },
        ] as const) {
          const html = await page(block({ projection, invoice: "issued" }), {
            locale,
            cancel,
          });
          expect(
            relayMatches(text(html), locale),
            `${locale} ${projection} ${cancel?.step ?? "plain"}`,
          ).toEqual([]);
        }
      }
    }
  });

  it("has no em or en dash in any locale's postPurchase copy", () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const messages = loadMessages(locale, MESSAGE_NAMESPACES) as {
        confirmation: { postPurchase: Record<string, unknown> };
      };
      const all = JSON.stringify(messages.confirmation.postPurchase);
      expect(all, locale).not.toMatch(/[–—]/u);
      expect(relayMatches(all, locale), locale).toEqual([]);
    }
  });
});

describe("the source scan (AC-28)", () => {
  const FILES = [
    "src/modules/orders/confirmation-block.ts",
    "src/modules/orders/buyer-cancel.ts",
    "src/app/[locale]/(checkout)/_views/PostPurchaseBlock.tsx",
    "src/app/[locale]/(checkout)/checkout/done/actions.ts",
    "src/app/[locale]/(checkout)/checkout/done/buyer-cancel.ts",
  ];

  it('finds no UPDATE "order" and no appendEvent; the cancel is spec 013\'s cancelOrder as buyer', () => {
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/UPDATE\s+"?order"?/iu);
      expect(source, file).not.toMatch(/appendEvent/u);
      expect(source, file).not.toMatch(/\btransition\(/u);
    }
    const cancel = readFileSync("src/modules/orders/buyer-cancel.ts", "utf8");
    expect(cancel).toMatch(/export const BUYER_CANCEL_ACTOR = "buyer";/u);
    expect(cancel).toMatch(
      /export const BUYER_CANCEL_REASON = "buyer_cancel";/u,
    );
    expect(cancel).toMatch(
      /await cancelOrder\(\s*orderId,\s*BUYER_CANCEL_ACTOR,\s*BUYER_CANCEL_REASON,\s*options,\s*\)/u,
    );
  });
});
