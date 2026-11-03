/**
 * Spec 013's `test` and `live` confirmation states (spec 013 §5.3 "What the confirmation says",
 * the projection table, "No edits after placement"; §14 A-founder-2026-10-22 item 8; AC-6,
 * AC-46, AC-47, AC-52; T-06, T-46, T-47, T-52 unit halves; TASK-263).
 *
 *  - `confirmationProjection` over A6.4's 26 statuses gives exactly the key of §5.3's table; the
 *    cancelled states keyed on the actor class (`buyer`, `admin:{id}` with and without
 *    `buyer_cancel`, `system:routing.no_partner_expiry`), each refunding then refunded, with the
 *    right `{amount}`;
 *  - the rendered page (`ConfirmationPage` with the registered renderer over fixture sources):
 *    the Kraków fixture's exact `en-gb` strings in the four paid states and `in_production`; no
 *    "refund", "cannot deliver", "could not deliver" or "If we" in the order content of those
 *    five; the cancel line the last element of `<main>`; `no_partner_available` and
 *    `manual_reroute` byte-equal to `routed`; no reason string anywhere;
 *  - AC-47 over the 26 statuses: no "Change" or "Edit", no checkout-step link, no form but the
 *    cancel action; the state file calls no checkout draft action (source scan);
 *  - AC-52: the two-delivery purchase, one `<h1>`, a block per delivery, the masked email once.
 */
import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createTranslator } from "next-intl";

import type { LocaleCode } from "../../src/config/locales.ts";
import type {
  Confirmation,
  ConfirmedDelivery,
} from "../../src/modules/checkout";
import { IntegerMoneySchema } from "../../src/modules/catalog";
import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  type ConfirmationBlock,
  ConfirmationBlockSchema,
  isCancellable,
  postPurchaseSteps,
} from "../../src/modules/orders/confirmation-block.ts";
import { buyerStep } from "../../src/modules/orders/tracking-view.ts";
import {
  type ConfirmationInput,
  type ConfirmationState,
  confirmationKey,
  confirmationProjection,
} from "../../src/modules/payments/confirmation.ts";
import { STATES } from "../fixtures/order-machine.ts";

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
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { ConfirmationGone, ConfirmationPage } =
  await import("../../src/app/[locale]/(checkout)/_views/ConfirmationView.tsx");
const { registerPaymentConfirmationStates } =
  await import("../../src/app/[locale]/(checkout)/_views/PaymentConfirmation.tsx");

const ID_1 = "0b6a3f0e-8d1c-4c55-9a51-1c2f3e4d5a6b";
const ID_2 = "7f1e2d3c-4b5a-4968-8776-655443322110";

/** The one value each status reads (spec 013 §5.3's table, written out, not derived). */
const EXPECTED_KEY: Readonly<Record<string, string>> = {
  placed: "payments.confirmation.notCompleted",
  payment_failed: "payments.confirmation.cancelled",
  abandoned: "payments.confirmation.cancelled",
  authorised: "payments.confirmation.paid",
  paid_unrouted: "payments.confirmation.paid",
  routed: "payments.confirmation.paid",
  no_partner_available: "payments.confirmation.paid",
  manual_reroute: "payments.confirmation.paid",
  accepted: "payments.confirmation.paid",
  paid: "payments.confirmation.paid",
  in_production: "tracking.headline.beingMade",
  awaiting_buyer: "tracking.headline.beingMade",
  out_for_delivery: "tracking.headline.onItsWay",
  delivery_failed: "tracking.headline.onItsWay",
  redelivery_scheduled: "tracking.headline.onItsWay",
  delivered: "tracking.headline.delivered",
  photo_uploaded: "tracking.headline.delivered",
  disputed: "tracking.headline.delivered",
  closed: "tracking.headline.closed",
  resolved: "tracking.headline.closed",
  refunded_full: "tracking.headline.closed",
  chargeback_open: "tracking.headline.closed",
  chargeback_won: "tracking.headline.closed",
  chargeback_lost: "tracking.headline.closed",
  cancelled: "payments.confirmation.cancelledByYouRefunding",
  cancelled_refunded: "payments.confirmation.cancelledByYouRefunding",
};

const GBP = (amountMinor: number) => ({
  amountMinor,
  currency: "GBP" as const,
});

function input(
  status: string,
  overrides: Partial<ConfirmationInput> = {},
): ConfirmationInput {
  const row = STATES.find((state) => state.key === status);
  if (row === undefined) throw new Error(`no status ${status}`);
  return {
    status,
    buyerProjection: row.buyerProjection,
    cancelActor: status.startsWith("cancelled") ? "buyer" : null,
    cancelReason: status.startsWith("cancelled") ? "buyer_cancel" : null,
    total: GBP(4590),
    succeeded: [],
    ...overrides,
  };
}

describe("the projection table (AC-6)", () => {
  it("gives exactly the table's key for each of A6.4's 26 statuses", () => {
    expect(STATES).toHaveLength(26);
    for (const state of STATES) {
      expect(
        confirmationKey(confirmationProjection(input(state.key))),
        state.key,
      ).toBe(EXPECTED_KEY[state.key]);
    }
  });

  it("keys a cancellation on the actor class, refunding then refunded, with the table's amount", () => {
    const cases: readonly [string, string | null, string][] = [
      ["buyer", "buyer_cancel", "cancelledByYou"],
      [
        "admin:4c0a7f4e-1d2b-4e5f-8a9b-0c1d2e3f4a5b",
        "buyer_cancel",
        "cancelledByYou",
      ],
      [
        "admin:4c0a7f4e-1d2b-4e5f-8a9b-0c1d2e3f4a5b",
        "goodwill",
        "notDelivered",
      ],
      ["system:routing.no_partner_expiry", "no_partner", "notDelivered"],
    ];
    for (const status of ["cancelled", "cancelled_refunded"]) {
      for (const [actor, reason, stem] of cases) {
        const refunding = confirmationProjection(
          input(status, { cancelActor: actor, cancelReason: reason }),
        );
        expect(confirmationKey(refunding), `${status} ${actor}`).toBe(
          `payments.confirmation.${stem}Refunding`,
        );
        expect(refunding).toMatchObject({ amount: GBP(4590) });
        const refunded = confirmationProjection(
          input(status, {
            cancelActor: actor,
            cancelReason: reason,
            succeeded: [
              {
                amountMinor: 4590,
                succeededAt: new Date("2026-10-06T10:00:00Z"),
              },
            ],
          }),
        );
        expect(confirmationKey(refunded), `${status} ${actor}`).toBe(
          `payments.confirmation.${stem}Refunded`,
        );
        expect(refunded).toMatchObject({ amount: GBP(4590) });
      }
    }
  });

  it("prints the remaining balance while refunding and the succeeded sum once refunded", () => {
    // Remaining balance, not the order total: £10 already back, £35.90 still to come.
    expect(
      confirmationProjection(
        input("cancelled", {
          succeeded: [],
        }),
      ),
    ).toMatchObject({ refunded: false, amount: GBP(4590) });
    expect(
      confirmationProjection(
        input("cancelled", {
          succeeded: [
            {
              amountMinor: 1000,
              succeededAt: new Date("2026-10-06T10:00:00Z"),
            },
            {
              amountMinor: 3590,
              succeededAt: new Date("2026-10-07T10:00:00Z"),
            },
          ],
        }),
      ),
    ).toMatchObject({ refunded: true, amount: GBP(4590) });
    expect(
      confirmationProjection(
        input("cancelled", {
          succeeded: [
            {
              amountMinor: 1000,
              succeededAt: new Date("2026-10-06T10:00:00Z"),
            },
          ],
        }),
      ),
    ).toMatchObject({ refunded: true, amount: GBP(1000) });
  });

  it("never carries the reason, and the paid state carries no amount at all", () => {
    const state = confirmationProjection(
      input("cancelled", {
        cancelActor: "system:routing.no_partner_expiry",
        cancelReason: "no_partner",
      }),
    );
    expect(JSON.stringify(state)).not.toMatch(/no_partner|reason/u);
    expect(confirmationProjection(input("paid"))).toEqual({ kind: "paid" });
  });
});

/* ------------------------------------------------------------------------------------------- */
/* The rendered page                                                                            */
/* ------------------------------------------------------------------------------------------- */

function delivery(
  orderId: string,
  overrides: Partial<ConfirmedDelivery> = {},
): ConfirmedDelivery {
  return {
    orderId,
    reference: orderId === ID_1 ? "FO-7K2M-9QXA" : "FO-3PRT-H8WD",
    sku: null,
    productName: "Amber Hour",
    tier: null,
    countryIso: "PL",
    recipientName: "Maria Przykładowa",
    address: "ul. Przykładowa 1, 30-001 Kraków",
    city: "Kraków",
    deliveryDate: "2025-10-17",
    card: null,
    addonNameKeys: [],
    amount: IntegerMoneySchema.parse(GBP(4590)),
    ...overrides,
  };
}

function block(
  orderId: string,
  state: ConfirmationState,
  reference: string,
): ConfirmationBlock {
  const projection =
    state.kind === "paid"
      ? "confirmed"
      : state.kind === "progress"
        ? state.step
        : "cancelled";
  return ConfirmationBlockSchema.parse({
    reference,
    mode: "live",
    maskedEmail: "a•••@example.com",
    projection,
    steps: postPurchaseSteps(projection),
    trackingUrl: `https://flowersoverseas.com/en-gb/track/TOKEN${orderId.slice(0, 4)}`,
    trackingPath: `/en-gb/track/TOKEN${orderId.slice(0, 4)}`,
    calendarPath: `/en-gb/track/TOKEN${orderId.slice(0, 4)}/calendar.ics`,
    deliveryDate: "2025-10-17",
    invoice: "pending",
    cancelLine: isCancellable(projection)
      ? { amount: { amountMinor: 4590, currencyCode: "GBP" } }
      : null,
  });
}

let fixtureStates = new Map<string, ConfirmationState>();
registerPaymentConfirmationStates({
  states: (ids) =>
    Promise.resolve(
      new Map(
        ids.flatMap((id) => {
          const state = fixtureStates.get(id);
          return state === undefined ? [] : [[id, state] as const];
        }),
      ),
    ),
  block: (orderId) => {
    const state = fixtureStates.get(orderId);
    if (state === undefined) throw new Error("no fixture");
    return Promise.resolve(
      block(orderId, state, orderId === ID_1 ? "FO-7K2M-9QXA" : "FO-3PRT-H8WD"),
    );
  },
});

async function render(
  inputs: readonly ConfirmationInput[],
  options: {
    readonly locale?: LocaleCode;
    readonly mode?: "test" | "live";
    readonly deliveries?: readonly ConfirmedDelivery[];
  } = {},
): Promise<string> {
  const deliveries =
    options.deliveries ??
    inputs.map((_, index) => delivery(index === 0 ? ID_1 : ID_2));
  fixtureStates = new Map(
    deliveries.map((d, index) => {
      const source = inputs[index];
      if (source === undefined) throw new Error("input missing");
      return [d.orderId, confirmationProjection(source)] as const;
    }),
  );
  const confirmation = {
    kind: "placed",
    mode: options.mode ?? "live",
    total: GBP(deliveries.reduce((sum, d) => sum + d.amount.amountMinor, 0)),
    deliveries,
  } as unknown as Confirmation;
  const element = await ConfirmationPage({
    confirmation,
    locale: options.locale ?? "en-gb",
    cancel: null,
  });
  return renderToStaticMarkup(<main id="main">{element}</main>).replace(
    /<script>[\s\S]*?<\/script>$/u,
    "",
  );
}

/** Visible text: inline tags vanish, block tags separate words. */
function text(html: string): string {
  return html
    .replace(/<\/?(?:b|em|strong|button|a|bdi|span)\b[^>]*>/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, " ")
    .trim();
}

const PAID = "Thank you. We have your order.";
const ARRIVAL = "Your flowers arrive in Kraków on Friday 17 October.";
const NEGATIVE = /refund|cannot deliver|could not deliver|if we/iu;

describe("the paid states and `in_production` (AC-46)", () => {
  for (const status of ["paid_unrouted", "routed", "accepted", "paid"]) {
    it(`${status}: the exact heading and arrival line, no negative words, the line last`, async () => {
      const html = await render([input(status)]);
      expect(html).toMatch(
        new RegExp(
          `<h1[^>]*data-fo-confirmation-heading=""[^>]*>${PAID}</h1>`,
          "u",
        ),
      );
      expect(html).toContain(
        `<p class="text-ink m-0" data-fo-arrival="">${ARRIVAL}</p>`,
      );
      expect(text(html)).not.toMatch(NEGATIVE);
      // The cancel line is the last element of `<main>` (spec 018's foot line).
      const last = html.slice(html.lastIndexOf("data-fo-cancel-line"));
      expect(last).toMatch(
        /^data-fo-cancel-line=""[^]*<\/form><\/div><\/main>$/u,
      );
    });
  }

  it("in_production: the arrival line under 'Being made', no cancel line, no negative words", async () => {
    const html = await render([input("in_production")]);
    expect(html).toMatch(
      /<h1[^>]*data-fo-confirmation-heading=""[^>]*>Being made<\/h1>/u,
    );
    expect(html).toContain(
      `data-fo-confirmation-heading="">Being made</h1><p class="text-ink m-0" data-fo-arrival="">${ARRIVAL}</p>`,
    );
    expect(html).not.toContain("data-fo-cancel-line");
    expect(text(html)).not.toMatch(NEGATIVE);
  });

  it("no_partner_available and manual_reroute render byte-equal to routed", async () => {
    const routed = await render([input("routed")]);
    expect(await render([input("no_partner_available")])).toBe(routed);
    expect(await render([input("manual_reroute")])).toBe(routed);
  });

  it("a later status prints 'Refunded {amount} on {date}' only once a refund succeeded", async () => {
    const html = await render([
      input("delivered", {
        succeeded: [
          { amountMinor: 1000, succeededAt: new Date("2026-10-18T09:00:00Z") },
        ],
      }),
    ]);
    expect(text(html)).toContain("Refunded £10.00 on 18 Oct");
  });
});

describe("the cancelled and unpaid states (AC-6)", () => {
  it("prints each refund notice with its amount and no reason, and no block", async () => {
    const notices: readonly [ConfirmationInput, string][] = [
      [
        input("cancelled"),
        "You cancelled this order. We are refunding £45.90 to your original payment method.",
      ],
      [
        input("cancelled_refunded", {
          cancelActor: "system:routing.no_partner_expiry",
          cancelReason: "no_partner",
        }),
        "We could not deliver this order. We are refunding £45.90 to your original payment method.",
      ],
      [
        input("cancelled", {
          cancelActor: "admin:4c0a7f4e-1d2b-4e5f-8a9b-0c1d2e3f4a5b",
          cancelReason: "redelivery_failed",
          succeeded: [
            {
              amountMinor: 4590,
              succeededAt: new Date("2026-10-18T09:00:00Z"),
            },
          ],
        }),
        "We could not deliver this order. We have refunded £45.90.",
      ],
    ];
    for (const [source, notice] of notices) {
      const html = await render([source]);
      expect(html).toMatch(new RegExp(`<h1[^>]*>${notice}</h1>`, "u"));
      expect(html).not.toMatch(/no_partner|redelivery_failed|buyer_cancel/u);
      expect(html).not.toContain("data-fo-post-purchase");
      expect(html).not.toContain("data-fo-cancel-line");
    }
  });

  it("placed, payment_failed and abandoned read their sentence and nothing charged", async () => {
    expect(text(await render([input("placed")]))).toContain(
      "Your payment was not completed. Nothing was charged. You can try again.",
    );
    for (const status of ["payment_failed", "abandoned"]) {
      expect(text(await render([input(status)]))).toContain(
        "This order was cancelled and nothing was charged.",
      );
    }
  });

  it("test mode adds the test label; live does not", async () => {
    expect(text(await render([input("paid")], { mode: "test" }))).toContain(
      "Test mode. Use a test card. No real money moves.",
    );
    expect(text(await render([input("paid")]))).not.toContain("Test mode");
  });

  it("with no cookie the page is spec 010's 'no longer available'", async () => {
    const element = await ConfirmationPage({
      confirmation: { kind: "gone" },
      locale: "en-gb",
    });
    expect(element.type).toBe(ConfirmationGone);
    const html = renderToStaticMarkup(
      <main>{await ConfirmationGone({ locale: "en-gb" })}</main>,
    );
    expect(text(html)).toBe(
      "This confirmation is no longer available. Choose flowers",
    );
  });
});

describe("no edits after placement (AC-47)", () => {
  it("over the 26 statuses: no Change or Edit, no checkout link, no form but the cancel action", async () => {
    for (const state of STATES) {
      const html = await render([input(state.key)]);
      expect(text(html), state.key).not.toMatch(/\b(?:Change|Edit)\b/u);
      expect(html, state.key).not.toMatch(/aria-label="(?:Change|Edit)/u);
      expect(html, state.key).not.toMatch(
        /href="\/[a-z-]+\/checkout(?:[/?"])/u,
      );
      const forms = html.match(/<form\b/gu) ?? [];
      const cancel = html.match(/data-fo-cancel-line=""[^>]*><form\b/gu) ?? [];
      expect(forms.length, state.key).toBe(cancel.length);
      expect(forms.length, state.key).toBe(
        isCancellable(buyerStep(state.buyerProjection)) ? 1 : 0,
      );
    }
  });

  it("the state file calls no checkout draft action (source scan)", () => {
    const source = readFileSync(
      new URL(
        "../../src/app/[locale]/(checkout)/_views/PaymentConfirmation.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /checkout\/actions|checkoutAction|placeOrderAction|saveRecipientStep|saveCardAndBuyerStep|updateSelection|removeLineAction|updateLineAction/u,
    );
    expect(source).not.toMatch(/stepPath\(|"\/checkout\?|\/checkout\?step/u);
  });
});

describe("two deliveries (AC-52)", () => {
  const two = [
    delivery(ID_1),
    delivery(ID_2, {
      city: "Warszawa",
      deliveryDate: "2025-10-18",
      amount: IntegerMoneySchema.parse(GBP(7090)),
      address: "ul. Przykładowa 2, 00-001 Warszawa",
    }),
  ];

  it("one heading, a block per delivery in order, each arrival line, the email once, one total", async () => {
    const html = await render([input("paid"), input("routed")], {
      deliveries: two,
    });
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${PAID}</h1>`, "u"));
    const body = text(html);
    expect(body).toContain("Delivery 1 of 2");
    expect(body).toContain("Delivery 2 of 2");
    expect(body.indexOf(ARRIVAL)).toBeLessThan(
      body.indexOf("Your flowers arrive in Warszawa on Saturday 18 October."),
    );
    expect(html.match(/data-fo-post-purchase-email=""/gu)).toHaveLength(1);
    expect(html.match(/data-fo-cancel-line=""/gu)).toHaveLength(2);
    expect(body).toContain("£116.80");
  });

  it("delivery 2 not delivered: its notice only in block 2; the heading and block 1 untouched", async () => {
    const before = await render([input("paid"), input("routed")], {
      deliveries: two,
    });
    const html = await render(
      [
        input("paid"),
        input("cancelled", {
          cancelActor: "system:routing.no_partner_expiry",
          cancelReason: "no_partner",
          total: GBP(7090),
        }),
      ],
      { deliveries: two },
    );
    const blockOf = (page: string, n: number) =>
      page.slice(
        page.indexOf(`data-fo-delivery-block="${String(n)}"`),
        n === 1
          ? page.indexOf('data-fo-delivery-block="2"')
          : page.indexOf("data-fo-purchase-total"),
      );
    expect(text(blockOf(html, 2))).toContain(
      "We could not deliver this order. We are refunding £70.90 to your original payment method.",
    );
    expect(blockOf(html, 1)).toBe(blockOf(before, 1));
    expect(text(blockOf(html, 1))).not.toMatch(NEGATIVE);
    const heading = /<h1[^>]*>([^<]*)<\/h1>/u.exec(html)?.[1];
    expect(heading).toBe(PAID);
  });

  it("both cancelled: the heading is 'Your order'", async () => {
    const html = await render(
      [input("cancelled"), input("cancelled", { total: GBP(7090) })],
      { deliveries: two },
    );
    expect(/<h1[^>]*>([^<]*)<\/h1>/u.exec(html)?.[1]).toBe("Your order");
  });
});
