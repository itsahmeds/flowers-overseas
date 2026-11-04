/**
 * The pay step (spec 013 §5.2 "Payment step and provider", §5.3 "Components"; AC-1, AC-3, AC-4,
 * AC-5, AC-7 unit halves, spec 010 AC-77; T-01, T-03, T-04, T-05, T-07 unit halves; TASK-262).
 * No network: MSW refuses every unhandled request (`tests/msw/setup.ts`), the Stripe.js loader is
 * a double (AC-53), and no Stripe key is read from the environment.
 *
 *  - `prepare`: the Element's deferred-intent options carry the draft's total in GBP, EUR and PLN,
 *    `captureMethod: 'automatic'`, the flag-enabled `available` methods and no BLIK; an
 *    unsupported currency or a missing key answers `payments_unavailable`;
 *  - registration: only with the router and the keys; the worker's job table registers the router;
 *  - the mode: a registered test step, `payments.stripe` on and a `sk_test_` key give `test`
 *    outside production and never in production (AC-1's last clause);
 *  - the island's controller against a Stripe.js double: mount, pay, decline, validation;
 *  - the pre-contract block and the pay button (AC-3, AC-77); the panel's server HTML;
 *  - the return route (AC-4): no query read, 303 to `done` with no query, the three headers;
 *  - AC-7's request half: nothing in the pay step reads a request header.
 */
import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTranslator } from "next-intl";

import { relayMatches } from "../../src/config/honesty.ts";
import { PAYMENT_METHODS } from "../../src/config/payment-methods.ts";
import {
  currentCheckoutMode,
  paymentStepFor,
  type CheckoutFlagReader,
} from "../../src/modules/checkout";
import { formatMoney, loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import type { MethodSources } from "../../src/modules/payments/methods.ts";
import {
  methodSourcesFromFlags,
  registerStripePaymentSteps,
  stripePaymentStep,
  type StripeStepDeps,
} from "../../src/modules/payments/pay-step.ts";
import { FakePaymentProvider } from "../../src/modules/payments/fake";
import {
  createPaymentController,
  type PanelPreparation,
  type StripeLike,
} from "../../src/modules/ui/checkout/payment/controller.ts";
import { PayButton } from "../../src/modules/ui/checkout/payment/PayButton.tsx";
import { PaymentPanel } from "../../src/modules/ui/checkout/payment/PaymentPanel.tsx";
import { PreContractBlock } from "../../src/modules/ui/checkout/payment/PreContractBlock.tsx";

const ROOT = new URL("../../", import.meta.url);
const source = (path: string): string =>
  readFileSync(new URL(path, ROOT), "utf8");

const METHODS_ON: MethodSources = {
  enabledFlags: new Set([
    "payments.method.card",
    "payments.method.apple-pay",
    "payments.method.google-pay",
    "payments.method.blik",
  ]),
  registry: PAYMENT_METHODS.map((method) => ({
    ...method,
    available: method.id !== "blik",
    ...(method.id === "blik" ? {} : { processor: "stripe" as const }),
  })),
};

function deps(overrides: Partial<StripeStepDeps> = {}): StripeStepDeps {
  return {
    provider: () => new FakePaymentProvider(),
    publishableKey: "pk_test_fixture",
    methodSources: () => Promise.resolve(METHODS_ON),
    ...overrides,
  };
}

describe("prepare: the Element's deferred intent (AC-1 Element half, AC-7)", () => {
  const step = stripePaymentStep("test", deps());

  for (const [currency, amountMinor] of [
    ["GBP", 4590],
    ["EUR", 5290],
    ["PLN", 18_900],
  ] as const) {
    it(`${currency}: the draft's total, automatic capture, card only`, async () => {
      const answer = await step.prepare?.({
        amountMinor,
        currency,
        buyerCountryDeclared: currency === "PLN" ? "PL" : "GB",
        locale: "en-gb",
      });
      expect(answer).toEqual({
        kind: "ready",
        preparation: {
          elementOptions: {
            mode: "payment",
            amountMinor,
            currency: currency.toLowerCase(),
            methodTypes: ["card"],
            captureMethod: "automatic",
          },
          publishableKey: "pk_test_fixture",
          stripeLocale: "en-GB",
        },
      });
    });
  }

  it("offers no BLIK to a Polish buyer paying PLN while BLIK is not available", async () => {
    const answer = await step.prepare?.({
      amountMinor: 18_900,
      currency: "PLN",
      buyerCountryDeclared: "PL",
      locale: "pl",
    });
    expect(
      answer?.kind === "ready" && answer.preparation.elementOptions.methodTypes,
    ).toEqual(["card"]);
  });

  it("answers payments_unavailable with no method on, an unsupported currency or no key", async () => {
    const off = stripePaymentStep(
      "test",
      deps({
        methodSources: () => Promise.resolve({ enabledFlags: new Set() }),
      }),
    );
    expect(
      await off.prepare?.({
        amountMinor: 1,
        currency: "GBP",
        buyerCountryDeclared: "GB",
        locale: "en",
      }),
    ).toEqual({ kind: "payments_unavailable" });
    expect(
      await step.prepare?.({
        amountMinor: 1,
        currency: "XXX",
        buyerCountryDeclared: "GB",
        locale: "en",
      }),
    ).toEqual({ kind: "payments_unavailable" });
    const keyless = stripePaymentStep("test", deps({ publishableKey: "" }));
    expect(
      await keyless.prepare?.({
        amountMinor: 1,
        currency: "GBP",
        buyerCountryDeclared: "GB",
        locale: "en",
      }),
    ).toEqual({ kind: "payments_unavailable" });
  });

  it("writes nothing in the placement transaction (authorise is a no-op for test and live)", async () => {
    const executor = { execute: vi.fn() };
    await step.authorise({
      executor: executor as never,
      purchaseId: "0b6a3f0e-8d1c-4c55-9a51-1c2f3e4d5a6b",
      orderIds: [],
    });
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

describe("the method flags as sources (AC-7 request half)", () => {
  it("reads only registered flag keys, and an unregistered key is off without a read", async () => {
    const read = vi.fn(() => Promise.resolve(true));
    const sources = await methodSourcesFromFlags(read)();
    // `payments.method.*` rows are TASK-421's seed: until they exist, no method is on.
    for (const call of read.mock.calls as unknown as [string][]) {
      expect(call[0]).toMatch(/^payments\.method\./u);
    }
    expect(sources.enabledFlags.size).toBe(read.mock.calls.length);
  });

  it("no pay-step file reads a request header or cf-ipcountry (ADR-0006)", () => {
    for (const path of [
      "src/modules/payments/pay-step.ts",
      "src/modules/payments/wiring.ts",
      "src/modules/checkout/pay.ts",
      "src/app/[locale]/(checkout)/_views/PayStep.tsx",
      "src/app/[locale]/(checkout)/checkout/pay-actions.ts",
      "src/app/[locale]/(checkout)/checkout/return/route.ts",
    ]) {
      const text = source(path);
      expect(text, path).not.toMatch(
        /cf-ipcountry|headers\(\)|x-vercel-ip|geo\b/iu,
      );
    }
  });
});

describe("registration (spec 013 §5.2: only with the router and the keys)", () => {
  it("registers nothing without the router or the publishable key, both steps with them", () => {
    expect(
      registerStripePaymentSteps({ deps: deps(), routingReady: () => false }),
    ).toEqual([]);
    expect(paymentStepFor("test")).toBeNull();
    expect(
      registerStripePaymentSteps({
        deps: deps({ publishableKey: "" }),
        routingReady: () => true,
      }),
    ).toEqual([]);
    expect(paymentStepFor("live")).toBeNull();
    expect(
      registerStripePaymentSteps({ deps: deps(), routingReady: () => true }),
    ).toEqual(["test", "live"]);
    expect(paymentStepFor("test")?.mode).toBe("test");
    expect(paymentStepFor("live")?.mode).toBe("live");
  });

  it("the worker's job table registers the routing handler unconditionally at load", () => {
    const table = source("src/jobs/handlers.ts");
    expect(table).toMatch(/^registerRoutingOutbox\(\);$/mu);
  });
});

describe("the mode with a registered test step (spec 010 AC-1, AC-2; AC-1's last clause)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const flags =
    (stripe: boolean): CheckoutFlagReader =>
    (key) =>
      Promise.resolve(
        key === "payments.stripe"
          ? stripe
          : key === "checkout.open" || key === "checkout.demo_guard",
      );

  it("test with the flag and a test key outside production; demo in production or with the flag off", async () => {
    registerStripePaymentSteps({ deps: deps(), routingReady: () => true });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("APP_ENV", "staging");
    const ask = (stripe: boolean) =>
      currentCheckoutMode({
        countryIso: "PL",
        locale: "en-gb",
        flags: flags(stripe),
      });
    expect(await ask(true)).toBe("test");
    expect(await ask(false)).toBe("demo");
    vi.stubEnv("APP_ENV", "production");
    expect(await ask(true)).toBe("demo");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await ask(true)).toBe("demo");
  });
});

/* ------------------------------------------------------------------------------------------- */
/* The island's controller against a Stripe.js double (AC-53)                                  */
/* ------------------------------------------------------------------------------------------- */

const PREPARATION: PanelPreparation = {
  elementOptions: {
    mode: "payment",
    amountMinor: 4590,
    currency: "gbp",
    methodTypes: ["card"],
    captureMethod: "automatic",
  },
  publishableKey: "pk_test_fixture",
  stripeLocale: "en-GB",
};

function stripeDouble(
  confirm: { error?: { type?: string; code?: string } } = {},
  submitError = false,
) {
  const calls: { method: string; args: unknown }[] = [];
  const elements = {
    create: (type: "payment") => {
      calls.push({ method: "create", args: type });
      return {
        mount: (target: unknown) => {
          calls.push({ method: "mount", args: target });
        },
      };
    },
    submit: () => {
      calls.push({ method: "submit", args: null });
      return Promise.resolve(submitError ? { error: { message: "x" } } : {});
    },
  };
  const stripe: StripeLike = {
    elements: (options) => {
      calls.push({ method: "elements", args: options });
      return elements;
    },
    confirmPayment: (options) => {
      calls.push({ method: "confirmPayment", args: options });
      return Promise.resolve(confirm);
    },
  };
  return { stripe, calls };
}

describe("the PaymentPanel controller (AC-1, AC-5)", () => {
  it("mounts a deferred-intent Element with the total, the methods and automatic capture", async () => {
    const { stripe, calls } = stripeDouble();
    const load = vi.fn(() => Promise.resolve(stripe));
    const controller = createPaymentController({
      preparation: PREPARATION,
      locale: "en-gb",
      origin: "https://flowersoverseas.com",
      load,
      pay: vi.fn(),
      declined: vi.fn(),
    });
    expect(await controller.mount("#co-payment-element")).toBe(true);
    expect(load).toHaveBeenCalledWith("pk_test_fixture", "en-GB");
    expect(calls[0]).toEqual({
      method: "elements",
      args: {
        mode: "payment",
        amount: 4590,
        currency: "gbp",
        paymentMethodTypes: ["card"],
        captureMethod: "automatic",
      },
    });
    expect(calls.slice(1)).toEqual([
      { method: "create", args: "payment" },
      { method: "mount", args: "#co-payment-element" },
    ]);
  });

  it("Pay: submit, then the server's pay, then confirmPayment with the return route on this origin", async () => {
    const { stripe, calls } = stripeDouble();
    const pay = vi.fn(() =>
      Promise.resolve({
        kind: "confirm" as const,
        clientSecret: "pi_1_secret_fake",
      }),
    );
    const controller = createPaymentController({
      preparation: PREPARATION,
      locale: "pl",
      origin: "https://flowersoverseas.com",
      load: () => Promise.resolve(stripe),
      pay,
      declined: vi.fn(),
    });
    await controller.mount("#x");
    const form = new FormData();
    expect(await controller.pay(form)).toEqual({ kind: "left" });
    expect(pay).toHaveBeenCalledWith(form);
    const confirm = calls.find((call) => call.method === "confirmPayment");
    expect(confirm?.args).toMatchObject({
      clientSecret: "pi_1_secret_fake",
      confirmParams: {
        return_url: "https://flowersoverseas.com/pl/checkout/return",
      },
    });
    expect(calls.map((call) => call.method)).toEqual([
      "elements",
      "create",
      "mount",
      "submit",
      "confirmPayment",
    ]);
  });

  it("a decline asks the server for our message key, never shows the provider's", async () => {
    const { stripe } = stripeDouble({
      error: { type: "card_error", code: "card_declined" },
    });
    const declined = vi.fn(() =>
      Promise.resolve({
        kind: "error" as const,
        messageKey: "payments.error.insufficientFunds",
      }),
    );
    const controller = createPaymentController({
      preparation: PREPARATION,
      locale: "en-gb",
      origin: "https://flowersoverseas.com",
      load: () => Promise.resolve(stripe),
      pay: () => Promise.resolve({ kind: "confirm", clientSecret: "s" }),
      declined,
    });
    await controller.mount("#x");
    expect(await controller.pay(new FormData())).toEqual({
      kind: "message",
      messageKey: "payments.error.insufficientFunds",
    });
    expect(declined).toHaveBeenCalledTimes(1);
  });

  it("an invalid Element calls no server; a server refusal shows its key; Stripe.js down is unavailable", async () => {
    const invalid = stripeDouble({}, true);
    const pay = vi.fn();
    const one = createPaymentController({
      preparation: PREPARATION,
      locale: "en-gb",
      origin: "https://x.test",
      load: () => Promise.resolve(invalid.stripe),
      pay,
      declined: vi.fn(),
    });
    await one.mount("#x");
    expect(await one.pay(new FormData())).toEqual({ kind: "invalid" });
    expect(pay).not.toHaveBeenCalled();

    const refused = createPaymentController({
      preparation: PREPARATION,
      locale: "en-gb",
      origin: "https://x.test",
      load: () => Promise.resolve(stripeDouble().stripe),
      pay: () =>
        Promise.resolve({
          kind: "error",
          messageKey: "payments.error.unavailable",
        }),
      declined: vi.fn(),
    });
    await refused.mount("#x");
    expect(await refused.pay(new FormData())).toEqual({
      kind: "message",
      messageKey: "payments.error.unavailable",
    });

    const down = createPaymentController({
      preparation: PREPARATION,
      locale: "en-gb",
      origin: "https://x.test",
      load: () => Promise.resolve(null),
      pay: vi.fn(),
      declined: vi.fn(),
    });
    expect(await down.mount("#x")).toBe(false);
    expect(await down.pay(new FormData())).toEqual({
      kind: "message",
      messageKey: "payments.error.unavailable",
    });
  });
});

/* ------------------------------------------------------------------------------------------- */
/* The rendered parts (AC-3, AC-77)                                                             */
/* ------------------------------------------------------------------------------------------- */

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
vi.mock("../../src/app/[locale]/(checkout)/checkout/pay-actions.ts", () => ({
  payStepAction: vi.fn(),
  payDeclinedAction: vi.fn(),
}));

const { preContractRows } =
  await import("../../src/app/[locale]/(checkout)/_views/PayStep.tsx");

type Translate = (key: string, values?: Record<string, unknown>) => string;
const en = createTranslator({
  locale: "en-gb",
  messages: loadMessages("en-gb", MESSAGE_NAMESPACES),
} as Parameters<typeof createTranslator>[0]) as unknown as Translate;

const CANCELLATION =
  "You can cancel for free until we start preparing your order. Flowers are fresh, so the 14-day cancellation right does not apply after that.";

function text(html: string): string {
  return html
    .replace(/<\/?(?:b|em|strong|button|a|bdi|span)\b[^>]*>/gu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

const GBP = { amountMinor: 4590, currency: "GBP" as const };

describe("the pre-contract block (AC-3, spec 010 AC-77)", () => {
  const item = {
    name: "Amber Hour",
    details: ["18 stems", "with a printed card"],
    date: "2026-10-08",
    city: "Warszawa",
  };

  it("one delivery: what you buy, the total, the date, the exact cancellation item, the seller", () => {
    const html = renderToStaticMarkup(
      <PreContractBlock
        draftLabel={en("payments.step.draftLabel")}
        links={[{ label: "Terms", href: "/en-gb/terms" }]}
        rows={preContractRows(en, [item], GBP as never, "en-gb")}
        title={en("payments.step.preContractTitle")}
      />,
    );
    const body = text(html);
    expect(body).toBe(
      `Before you pay Draft, not in force What you buy Amber Hour, 18 stems, with a printed card Total £45.90, VAT and delivery included Delivery Thursday 8 October, Warszawa Cancelling ${CANCELLATION} Seller Flowers Overseas Terms`,
    );
    expect(en("checkout.legal.cancellation")).toBe(CANCELLATION);
    expect(relayMatches(body, "en-gb")).toEqual([]);
  });

  it("live has no draft label", () => {
    const html = renderToStaticMarkup(
      <PreContractBlock
        links={[]}
        rows={preContractRows(en, [item], GBP as never, "en-gb")}
        title={en("payments.step.preContractTitle")}
      />,
    );
    expect(html).not.toContain("data-fo-pre-contract-draft");
  });

  it("two deliveries: each named with its date, the total and the cancellation item once", () => {
    const rows = preContractRows(
      en,
      [
        item,
        { ...item, name: "Vistula Red", date: "2026-10-10", city: "Kraków" },
      ],
      { amountMinor: 11_680, currency: "GBP" } as never,
      "en-gb",
    );
    expect(rows.map((row) => row.term)).toEqual([
      "What you buy",
      "Total",
      "Cancelling",
      "Seller",
    ]);
    expect(rows[0]?.details).toEqual([
      "Delivery 1 of 2: Amber Hour, 18 stems, with a printed card · Thursday 8 October, Warszawa",
      "Delivery 2 of 2: Vistula Red, 18 stems, with a printed card · Saturday 10 October, Kraków",
    ]);
    expect(rows[1]?.details).toEqual(["£116.80, VAT and delivery included"]);
  });
});

describe("the pay button and the panel's server HTML (AC-3, AC-5)", () => {
  it("names the amount through formatMoney in the pay-and-order wording", () => {
    const label = en("checkout.legal.payButton", {
      amount: formatMoney(GBP, "en-gb"),
    });
    expect(label).toBe("Pay £45.90 and place order");
    const html = renderToStaticMarkup(
      <PayButton label={label} pending={false} pendingLabel="x" />,
    );
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*><span aria-live="polite">Pay £45.90 and place order<\/span><\/button>/u,
    );
  });

  it("server-renders the decline region and the block, and no pay button before the Element mounts", () => {
    const html = renderToStaticMarkup(
      <PaymentPanel
        declined={vi.fn()}
        load={vi.fn()}
        locale="en-gb"
        messages={{}}
        pay={vi.fn()}
        payLabel="Pay £45.90 and place order"
        pendingLabel="Processing your payment…"
        preparation={PREPARATION}
        processedBy={en("payments.step.processedBy")}
        seenTotal={{ amountMinor: 4590, currency: "GBP" }}
        title="Payment"
      >
        <p data-block="">block</p>
      </PaymentPanel>,
    );
    expect(html).toContain(
      'aria-live="polite" data-fo-payment-error-region=""',
    );
    expect(html).toContain('<p data-block="">block</p>');
    expect(html).not.toContain("data-fo-pay-button");
    expect(html).toContain(
      '<input type="hidden" name="seenTotalMinor" value="4590"/>',
    );
    expect(html).not.toMatch(/secret/iu);
  });
});

/* ------------------------------------------------------------------------------------------- */
/* The return route (AC-4)                                                                      */
/* ------------------------------------------------------------------------------------------- */

describe("the return route (AC-4)", () => {
  it("reads no query, reconciles the cookie's purchase, 303 to done with no query and three headers", async () => {
    vi.resetModules();
    const located = vi.fn(() => Promise.resolve("/pl/checkout/done"));
    vi.doMock("next/headers", () => ({
      cookies: () =>
        Promise.resolve({
          get: () => ({ value: "a".repeat(43) }),
        }),
    }));
    vi.doMock("@/modules/payments/wiring", () => ({}));
    vi.doMock("@/modules/checkout", async () => ({
      ...(await vi.importActual<object>("@/modules/checkout")),
      paymentReturnLocation: located,
      isDraftToken: () => true,
    }));
    const { GET } =
      await import("../../src/app/[locale]/(checkout)/checkout/return/route.ts");
    const response = await GET(
      new Request(
        "https://flowersoverseas.com/pl/checkout/return?payment_intent=pi_123&payment_intent_client_secret=pi_123_secret_abc&redirect_status=succeeded",
      ),
      { params: Promise.resolve({ locale: "pl" }) },
    );
    expect(located).toHaveBeenCalledWith({
      locale: "pl",
      token: "a".repeat(43),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/pl/checkout/done");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
  });
});
