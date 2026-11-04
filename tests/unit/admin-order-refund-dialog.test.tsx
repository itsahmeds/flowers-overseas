/**
 * Spec 020a's refund dialogs, the phone's Actions bar and the refund server action (TASK-361;
 * artboards `admin-order-refund-*`, `admin-order-actions-mobile`).
 *
 *  - The rendered halves of AC-17 (full: the remaining balance, never typed; the cancelled retry
 *    and the anomaly with the server's reason), AC-18 (as typed: exactly the balance points to
 *    Refund in full, above it is refused), AC-20 (exactly the seven reasons, never a system
 *    one), AC-21 (only the full refund on the anomaly), AC-22 (the three suggestions of the
 *    fixture, each a `type="button"` that fills and never submits; at or above the balance
 *    omitted), AC-23's done line, and every refusal line of the artboard.
 *  - `refundOrderAction`: the guard first, the provider from payments' `adminRefundDeps`, no
 *    command call and `PROVIDER_NOT_CONFIGURED` without keys, the form's fields as the command's
 *    strict schema wants them, the result as `?action=…&result=…&ref=…` (codes and uuids only).
 *  - `adminRefundDeps`: `null` without keys, the Stripe adapter with test keys.
 *
 * Rendered with `renderToStaticMarkup`: a closed `<dialog>` still carries its content.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatMoney } from "@/modules/i18n";
import type { AdminOrderDetail } from "@/modules/orders";

import {
  OrderActionsPanel,
  type OrderActionsData,
} from "../../src/app/admin/(signed-in)/orders/[id]/actions-panel.tsx";
import { checkRefundAmount } from "../../src/app/admin/(signed-in)/orders/[id]/refund-form.tsx";
import {
  minorUnitsText,
  parseMinorUnits,
} from "../../src/modules/admin/order-actions/money.ts";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  adminOrderRefund: vi.fn(),
  adminRefundDeps: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: (url: string) => {
      throw new Error(`REDIRECT ${url}`);
    },
  };
});

vi.mock("@/modules/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/admin")>();
  return {
    ...actual,
    requirePermission: mocks.requirePermission,
    adminRequestId: () => Promise.resolve("req-1"),
  };
});

vi.mock("@/modules/admin/order-actions/refund", () => ({
  adminOrderRefund: mocks.adminOrderRefund,
}));

vi.mock("@/modules/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/payments")>();
  return { ...actual, adminRefundDeps: mocks.adminRefundDeps };
});

const ORDER_ID = "0b7e1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const ACTION_ID = "5d1c7a0e-2b3f-4c4d-9e5f-6a7b8c9d0e1f";
const REFUND_ID = "7e2d8b1f-3c4a-4d5e-8f60-7b8c9d0e1f2a";

/** Spec 020a AC-22's fixture: Amber Hour 45.00 € and chocolates 2 × 6.50 €, 58.00 € in all. */
function order(
  status: string,
  over: Partial<AdminOrderDetail> = {},
): AdminOrderDetail {
  return {
    orderId: ORDER_ID,
    reference: "FO-8RTW-2KQM",
    mode: "live",
    status,
    buyerStatus: "being_made",
    placedAt: "2026-10-07T17:58:00.000Z",
    deliveryDate: "2026-10-08",
    deliveryWindow: null,
    destination: { iso2: "PL", name: "Poland", timeZone: "Europe/Warsaw" },
    cityName: "Warszawa",
    totalMinor: 5_800,
    currency: "EUR",
    vatBreakdown: [],
    lines: [
      {
        lineId: "a1a1a1a1-1111-4111-8111-111111111111",
        kind: "product",
        name: "Amber Hour",
        tierKey: null,
        qty: 1,
        unitRetailMinor: 4_500,
        amountMinor: 4_500,
        vatRateBp: 800,
      },
      {
        lineId: "b2b2b2b2-2222-4222-8222-222222222222",
        kind: "addon",
        name: "Chocolates",
        tierKey: null,
        qty: 2,
        unitRetailMinor: 650,
        amountMinor: 1_300,
        vatRateBp: 2_300,
      },
    ],
    recipient: null,
    events: [
      {
        seq: 9,
        type: "order.production_started",
        fromStatus: "paid",
        toStatus: "in_production",
        actor: "system:payments.production_start",
        occurredAt: "2026-10-08T05:00:00.000Z",
        payload: {},
      },
    ],
    assignments: [],
    payments: [],
    ...over,
  } as AdminOrderDetail;
}

function data(
  status: string,
  over: Partial<OrderActionsData> = {},
  orderOver: Partial<AdminOrderDetail> = {},
): OrderActionsData {
  return {
    order: order(status, orderOver),
    roles: ["admin"],
    viewerZone: "Europe/Tallinn",
    capturedMinor: 5_800n,
    remainingMinor: 5_800n,
    refundInFlight: false,
    cancelRefundMinor: null,
    failedAutomatic: null,
    requestedRefundMinor: null,
    refundReady: true,
    candidates: [],
    grace: null,
    outcome: null,
    ...over,
  };
}

function render(d: OrderActionsData): string {
  const element = OrderActionsPanel({ data: d });
  return element === null ? "" : renderToStaticMarkup(element);
}

/** The HTML of one dialog, from its opener to the dialog's end. */
function dialog(html: string, id: "refund-full" | "refund-partial"): string {
  const start = html.indexOf(`id="order-action-${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</dialog>", start));
}

/** The values of the reason radios in `html`, in order. */
function reasonRadios(html: string): string[] {
  return [
    ...html.matchAll(/type="radio"[^>]*name="reason" value="([a-z_]+)"/gu),
  ].map((match) => match[1] ?? "");
}

/** Visible text, tags dropped and entities that matter here decoded. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ");
}

/** An amount as the page formats it (`formatMoney`, the admin's `en`). */
const eur = (minor: number): string =>
  formatMoney({ amountMinor: BigInt(minor), currency: "EUR" }, "en").replace(
    /\s+/gu,
    " ",
  );

const SEVEN = [
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
];

describe("Refund in full (spec 020a AC-17, AC-20, AC-21)", () => {
  it("states charged, refunded or on its way, and the remaining balance it will refund; no amount field", () => {
    const html = dialog(
      render(data("in_production", { remainingMinor: 4_500n })),
      "refund-full",
    );
    expect(text(html)).toContain(
      `Refund in full · ${eur(4500)} Refund in full FO-8RTW-2KQM`,
    );
    expect(text(html)).toContain(
      `Charged ${eur(5800)} Refunded or on its way ${eur(1300)} Refund now ${eur(4500)}`,
    );
    expect(html).not.toContain('name="amountText"');
    expect(html).toContain('name="kind" value="full"');
    expect(text(html)).toContain(`Refund ${eur(4500)}`);
    expect(text(html)).toContain(
      "Refunds go to the card or wallet the buyer paid with. The buyer receives the refund email and a credit note.",
    );
  });

  it("offers exactly the seven admin reasons, none chosen, never a system reason", () => {
    const html = dialog(render(data("paid")), "refund-full");
    expect(reasonRadios(html)).toEqual(SEVEN);
    expect(html).not.toMatch(/name="reason" value="[a-z_]+" checked/u);
    for (const system of [
      "buyer_cancel",
      "no_partner",
      "authorisation_lapsing",
      "redelivery_failed",
    ]) {
      expect(html).not.toContain(`value="${system}"`);
    }
  });

  it("on a cancelled order whose automatic refund failed: the banner, Retry in full, the cancellation's reason fixed", () => {
    const html = render(
      data(
        "cancelled",
        { failedAutomatic: { amountMinor: 5_800n, reason: "buyer_cancel" } },
        {
          events: [
            {
              seq: 6,
              type: "order.cancelled",
              fromStatus: "routed",
              toStatus: "cancelled",
              actor: "admin:u-1",
              occurredAt: "2026-10-07T19:00:00.000Z",
              payload: { reason: "buyer_cancel" },
            },
          ],
        },
      ),
    );
    expect(text(html)).toContain(
      `The automatic refund of ${eur(5800)} failed. Retry it with the cancellation’s reason, The buyer asked.`,
    );
    const full = dialog(html, "refund-full");
    expect(text(full)).toContain(`Retry in full · ${eur(5800)}`);
    expect(full).toContain("bg-accent");
    expect(text(full)).toContain(
      "Reason: The buyer asked. Set by the order, not chosen here.",
    );
    expect(reasonRadios(full)).toEqual([]);
    expect(full).toContain('type="hidden" name="reason" value="goodwill"');
    expect(html).not.toContain('id="order-action-refund-partial"');
  });

  it("on an abandoned order with a captured payment: only the full refund, reason Other fixed", () => {
    const html = render(data("abandoned"));
    expect(html).not.toContain('id="order-action-refund-partial"');
    const full = dialog(html, "refund-full");
    expect(text(full)).toContain(
      "Reason: Other. Set by the order, not chosen here.",
    );
    expect(reasonRadios(full)).toEqual([]);
  });
});

describe("Refund in part (spec 020a AC-16, AC-18, AC-20, AC-22)", () => {
  it("is the money field in the order's currency, named with it, with the balance in the hint", () => {
    const html = dialog(render(data("paid")), "refund-partial");
    expect(html).toContain('name="amountText"');
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('aria-label="Amount, EUR"');
    expect(html).toContain('placeholder="0.00"');
    expect(text(html)).toContain(
      `Less than ${eur(5800)}, what is left to refund. A dot or a comma before the cents.`,
    );
    expect(reasonRadios(html)).toEqual(SEVEN);
    // Nothing typed yet: the button names no amount.
    expect(text(html)).toMatch(/Keep Refund $/u);
  });

  it("suggests 13.00, 13.50 and 11.60 for the fixture, each a button that fills and never submits", () => {
    const html = dialog(render(data("paid")), "refund-partial");
    const chips = [
      ...html.matchAll(
        /<button type="button" aria-pressed="false"[^>]*>(.*?)<\/button>/gu,
      ),
    ].map((match) => text(match[1] ?? "").trim());
    expect(chips).toEqual([
      `Add-on missing · Chocolates × 2 ${eur(1300)}`,
      `Substitution complaint ${eur(1350)}`,
      `Late delivery ${eur(1160)}`,
    ]);
    expect(text(html)).toContain(
      "Fills the amount and the reason. Nothing is sent until you press Refund.",
    );
  });

  it("omits a suggestion at or above the remaining balance", () => {
    const html = dialog(
      render(data("paid", { remainingMinor: 1_200n })),
      "refund-partial",
    );
    const chips = [...html.matchAll(/aria-pressed="false"/gu)];
    expect(chips).toHaveLength(1);
    expect(text(html)).toContain(`Late delivery ${eur(1160)}`);
    expect(text(html)).not.toContain(`${eur(1300)}`);
  });

  it("checks what is typed as the server will: digits only, below the balance, the balance itself points to Refund in full", () => {
    expect(checkRefundAmount("", "EUR", 5_800n)).toEqual({ state: "empty" });
    for (const bad of ["12.505", "1e3", "-5", "0", "0.00", " ", "12.50 zł"]) {
      expect(checkRefundAmount(bad, "EUR", 5_800n), bad).toEqual({
        state: "invalid",
      });
    }
    expect(checkRefundAmount("58", "EUR", 5_800n)).toEqual({ state: "whole" });
    expect(checkRefundAmount("58,00", "EUR", 5_800n)).toEqual({
      state: "whole",
    });
    expect(checkRefundAmount("58.01", "EUR", 5_800n)).toEqual({
      state: "exceeds",
    });
    expect(checkRefundAmount("57.99", "EUR", 5_800n)).toEqual({
      state: "ok",
      amountMinor: 5_799n,
    });
    expect(checkRefundAmount("0.01", "GBP", 5_800n)).toEqual({
      state: "ok",
      amountMinor: 1n,
    });
    expect(checkRefundAmount("12,5", "PLN", 5_800n)).toEqual({
      state: "ok",
      amountMinor: 1_250n,
    });
  });

  it("is absent with less than two minor units left; the full refund stays", () => {
    const html = render(data("in_production", { remainingMinor: 1n }));
    expect(html).not.toContain('id="order-action-refund-partial"');
    expect(text(dialog(html, "refund-full"))).toContain(`Refund ${eur(1)}`);
  });
});

describe("refusals and results (spec 020a §5.2 'Result', artboard refusal lines)", () => {
  const outcome = (action: string, result: string) => ({ action, result });

  it.each([
    ["AMOUNT_INVALID", "Enter an amount like 12.50 or 12,50."],
    [
      "REFUND_EXCEEDS_CAPTURED",
      `That is more than the ${eur(4500)} left to refund.`,
    ],
    [
      "USE_FULL_REFUND",
      "That is everything left to refund. Use Refund in full.",
    ],
    ["NOT_REFUNDABLE", "This order cannot be refunded now. Nothing was done."],
    [
      "CURRENCY_MISMATCH",
      "The amount is not in the currency the buyer paid in. Nothing was done.",
    ],
  ])(
    "a partial refund refused with %s reads its line in the dialog",
    (code, line) => {
      const html = dialog(
        render(
          data("in_production", {
            remainingMinor: 4_500n,
            outcome: outcome("refund_partial", code),
          }),
        ),
        "refund-partial",
      );
      expect(text(html)).toContain(line);
    },
  );

  it("ORDER_CHANGED after another refund says how much is left now; after anything else, the stale-page line", () => {
    const refundedMeanwhile = render(
      data(
        "in_production",
        {
          remainingMinor: 4_500n,
          outcome: outcome("refund_partial", "ORDER_CHANGED"),
        },
        {
          events: [
            {
              seq: 10,
              type: "order.refund_requested",
              fromStatus: "in_production",
              toStatus: "in_production",
              actor: "admin:u-2",
              occurredAt: "2026-10-08T08:14:00.000Z",
              payload: {},
            },
          ],
        },
      ),
    );
    expect(text(refundedMeanwhile)).toContain(
      `Another refund was made meanwhile. Only ${eur(4500)} is left now. Nothing was done.`,
    );
    const otherwise = render(
      data("in_production", {
        outcome: outcome("refund_full", "ORDER_CHANGED"),
      }),
    );
    expect(text(otherwise)).toContain(
      "This order changed after you opened it. Nothing was done. Reload to see it as it is now.",
    );
    expect(text(otherwise)).not.toContain("Another refund");
  });

  it("a refusal whose dialog is gone reads in the card: the provider without keys, and a forged refund on a finished order", () => {
    expect(
      text(
        render(
          data("paid", {
            refundReady: false,
            outcome: outcome("refund_full", "PROVIDER_NOT_CONFIGURED"),
          }),
        ),
      ),
    ).toContain(
      "Refunds from this page start once the card provider is connected. Nothing was done.",
    );
    expect(
      text(
        render(
          data("refunded_full", {
            remainingMinor: 0n,
            outcome: outcome("refund_partial", "NOT_REFUNDABLE"),
          }),
        ),
      ),
    ).toContain("This order cannot be refunded now. Nothing was done.");
  });

  it("done: the amount the refund row asks for", () => {
    const html = render(
      data("in_production", {
        remainingMinor: 4_500n,
        requestedRefundMinor: 1_300n,
        outcome: outcome("refund_partial", "done"),
      }),
    );
    expect(html).toContain('role="status"');
    expect(text(html)).toContain(`Refund of ${eur(1300)} requested.`);
  });

  it("formats each currency through formatMoney: PLN and GBP", () => {
    const pln = render(
      data(
        "paid",
        { capturedMinor: 12_345n, remainingMinor: 12_345n },
        { currency: "PLN", totalMinor: 12_345 },
      ),
    );
    expect(text(dialog(pln, "refund-full"))).toContain(
      text(
        `Refund now ${formatMoney({ amountMinor: 12_345n, currency: "PLN" }, "en")}`,
      ),
    );
    expect(dialog(pln, "refund-partial")).toContain('aria-label="Amount, PLN"');
    const gbp = render(
      data(
        "paid",
        { capturedMinor: 999n, remainingMinor: 999n },
        { currency: "GBP", totalMinor: 999 },
      ),
    );
    expect(text(dialog(gbp, "refund-full"))).toContain(
      text(
        `Refund now ${formatMoney({ amountMinor: 999n, currency: "GBP" }, "en")}`,
      ),
    );
  });
});

describe("the phone's Actions bar (spec 020a §5.3, artboard admin-order-actions-mobile)", () => {
  it("renders with the count of actions when the card has controls, the card itself folded below 768 px", () => {
    const html = render(data("in_production", { remainingMinor: 4_500n }));
    expect(html).toContain("data-actions-bar");
    expect(text(html)).toContain("2 actions Actions");
    expect(html).toContain('class="max-md:hidden"');
  });

  it("names the auto-cancel time, bold, for no_partner_available", () => {
    const html = render(
      data("no_partner_available", {
        grace: {
          graceEnd: new Date("2026-10-08T08:00:00.000Z"),
          destinationZone: "Europe/Warsaw",
        },
      }),
    );
    expect(html).toMatch(
      /<b class="text-ink">Cancelled automatically at 11:00 \(Tallinn\) unless rerouted<\/b>/u,
    );
  });

  it("is absent on a finished order and a demo order: the reasons stay in a card", () => {
    expect(render(data("refunded_full", { remainingMinor: 0n }))).not.toContain(
      "data-actions-bar",
    );
    expect(render(data("paid", {}, { mode: "demo" }))).not.toContain(
      "data-actions-bar",
    );
  });
});

describe("refundOrderAction (spec 020a AC-2, AC-17, AC-18; TASK-361)", () => {
  const session = {
    userId: "u-1",
    roles: ["admin"],
    timeZone: "Europe/Tallinn",
  };

  function form(fields: Record<string, string>): FormData {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    return formData;
  }

  async function submit(fields: Record<string, string>): Promise<string> {
    const { refundOrderAction } =
      await import("../../src/app/admin/(signed-in)/orders/[id]/actions.ts");
    try {
      await refundOrderAction(form(fields));
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("no redirect");
  }

  const base = { orderId: ORDER_ID, actionId: ACTION_ID, expectedSeq: "9" };
  const provider = { provider: { name: "fake" } };

  beforeEach(() => {
    mocks.requirePermission.mockReset().mockResolvedValue(session);
    mocks.adminOrderRefund.mockReset();
    mocks.adminRefundDeps.mockReset();
  });

  it("asks for orders.refund before anything else; a refusal of the guard calls nothing", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      submit({ ...base, kind: "full", reason: "quality" }),
    ).resolves.toBe("FORBIDDEN");
    expect(mocks.requirePermission).toHaveBeenCalledWith("orders.refund");
    expect(mocks.adminRefundDeps).not.toHaveBeenCalled();
    expect(mocks.adminOrderRefund).not.toHaveBeenCalled();
  });

  it("without the provider's keys: PROVIDER_NOT_CONFIGURED, and the command never runs (no refund row)", async () => {
    mocks.adminRefundDeps.mockReturnValue(null);
    await expect(
      submit({
        ...base,
        kind: "partial",
        amountText: "13.00",
        reason: "addon_missing",
      }),
    ).resolves.toBe(
      `REDIRECT /admin/orders/${ORDER_ID}?action=refund_partial&result=PROVIDER_NOT_CONFIGURED`,
    );
    expect(mocks.adminOrderRefund).not.toHaveBeenCalled();
  });

  it("a full refund passes no amount (the server's balance) and redirects with the refund row as ref", async () => {
    mocks.adminRefundDeps.mockReturnValue(provider);
    mocks.adminOrderRefund.mockResolvedValue({
      ok: true,
      kind: "refund_full",
      resultRef: REFUND_ID,
      replayed: false,
    });
    await expect(
      submit({
        ...base,
        kind: "full",
        amountText: "1",
        reason: "late_delivery",
        note: " ",
      }),
    ).resolves.toBe(
      `REDIRECT /admin/orders/${ORDER_ID}?action=refund_full&result=done&ref=${REFUND_ID}`,
    );
    const [input, deps] = mocks.adminOrderRefund.mock.calls[0] ?? [];
    expect(input).toEqual({
      orderId: ORDER_ID,
      actionId: ACTION_ID,
      expectedSeq: 9,
      kind: "full",
      reason: "late_delivery",
    });
    expect((deps as { refund: unknown }).refund).toBe(provider);
  });

  it("a partial refund passes the typed text and the note; exactly the balance comes back as USE_FULL_REFUND", async () => {
    mocks.adminRefundDeps.mockReturnValue(provider);
    mocks.adminOrderRefund.mockResolvedValue({
      ok: false,
      code: "REFUND_EXCEEDS_CAPTURED",
      hint: "use_full_refund",
    });
    await expect(
      submit({
        ...base,
        kind: "partial",
        amountText: "58,00",
        reason: "other",
        note: "SENTINEL-NOTE-7",
      }),
    ).resolves.toBe(
      `REDIRECT /admin/orders/${ORDER_ID}?action=refund_partial&result=USE_FULL_REFUND`,
    );
    expect(mocks.adminOrderRefund.mock.calls[0]?.[0]).toEqual({
      orderId: ORDER_ID,
      actionId: ACTION_ID,
      expectedSeq: 9,
      kind: "partial",
      amountText: "58,00",
      reason: "other",
      note: "SENTINEL-NOTE-7",
    });
  });

  it("above the balance: REFUND_EXCEEDS_CAPTURED; the note never reaches the URL", async () => {
    mocks.adminRefundDeps.mockReturnValue(provider);
    mocks.adminOrderRefund.mockResolvedValue({
      ok: false,
      code: "REFUND_EXCEEDS_CAPTURED",
    });
    const url = await submit({
      ...base,
      kind: "partial",
      amountText: "58.01",
      reason: "goodwill",
      note: "SENTINEL-NOTE-7",
    });
    expect(url).toBe(
      `REDIRECT /admin/orders/${ORDER_ID}?action=refund_partial&result=REFUND_EXCEEDS_CAPTURED`,
    );
    expect(url).not.toContain("SENTINEL");
    expect(url).not.toContain("58");
  });

  it("a missing reason reaches the command, whose strict schema answers INPUT_INVALID", async () => {
    mocks.adminRefundDeps.mockReturnValue(provider);
    mocks.adminOrderRefund.mockResolvedValue({
      ok: false,
      code: "INPUT_INVALID",
    });
    await expect(
      submit({ ...base, kind: "partial", amountText: "1" }),
    ).resolves.toBe(
      `REDIRECT /admin/orders/${ORDER_ID}?action=refund_partial&result=INPUT_INVALID`,
    );
    expect(mocks.adminOrderRefund.mock.calls[0]?.[0]).not.toHaveProperty(
      "reason",
    );
  });

  it("a double submit of one actionId reaches the command twice with the same id (runOrderAction replays the second)", async () => {
    mocks.adminRefundDeps.mockReturnValue(provider);
    mocks.adminOrderRefund
      .mockResolvedValueOnce({
        ok: true,
        kind: "refund_partial",
        resultRef: REFUND_ID,
        replayed: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        kind: "refund_partial",
        resultRef: REFUND_ID,
        replayed: true,
      });
    const fields = {
      ...base,
      kind: "partial",
      amountText: "0.01",
      reason: "goodwill",
    };
    const first = await submit(fields);
    const second = await submit(fields);
    expect(second).toBe(first);
    expect(
      mocks.adminOrderRefund.mock.calls.map(
        (call) => (call[0] as { actionId: string }).actionId,
      ),
    ).toEqual([ACTION_ID, ACTION_ID]);
  });
});

describe("payments' adminRefundDeps (the one barrel export, TASK-361)", () => {
  it("is null without keys and the Stripe adapter with test keys", async () => {
    const actual =
      await vi.importActual<typeof import("@/modules/payments")>(
        "@/modules/payments",
      );
    expect(actual.adminRefundDeps({})).toBeNull();
    expect(
      actual.adminRefundDeps({ STRIPE_SECRET_KEY: "sk_test_x" }),
    ).toBeNull();
    expect(
      actual.adminRefundDeps({
        APP_ENV: "staging",
        STRIPE_SECRET_KEY: "sk_live_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      }),
    ).toBeNull();
    const deps = actual.adminRefundDeps({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    });
    expect(deps).not.toBeNull();
    expect(typeof deps?.provider.refund).toBe("function");
  });
});

describe("minorUnitsText: what a suggestion puts into the field", () => {
  it("writes plain digits that parseMinorUnits reads back to the same amount, in EUR, GBP and PLN", () => {
    expect(minorUnitsText(1_300n, "EUR")).toBe("13.00");
    expect(minorUnitsText(1_160n, "PLN")).toBe("11.60");
    expect(minorUnitsText(1n, "GBP")).toBe("0.01");
    expect(minorUnitsText(0n, "EUR")).toBe("0.00");
    for (const currency of ["EUR", "GBP", "PLN"] as const) {
      for (const amount of [1n, 9n, 10n, 99n, 100n, 1_350n, 99_999_999_999n]) {
        expect(
          parseMinorUnits(minorUnitsText(amount, currency), currency),
        ).toEqual({
          ok: true,
          amountMinor: amount,
        });
      }
    }
    expect(() => minorUnitsText(-1n, "EUR")).toThrow(RangeError);
  });
});
