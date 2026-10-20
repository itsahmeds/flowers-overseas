/**
 * The Stripe adapter (spec 013 §2 B, §5.2, AC-7, AC-8; ADR-0005; TASK-255).
 *
 * The only code that talks to Stripe. It speaks Stripe's REST API with `fetch` directly, so no SDK
 * enters the bundle and MSW can serve recorded responses to it in the contract suite. Every
 * request carries:
 *
 *  - the secret (in production the restricted `rk_live_` key, spec 013 §5.2 "Keys and
 *    environments") as a bearer token;
 *  - `Stripe-Version: STRIPE_API_VERSION`, so the account's default version never changes a
 *    response;
 *  - an `Idempotency-Key` on every write, the key the lifecycle chose (`pi:create:{paymentId}`,
 *    `capture:{paymentId}`, `void:{paymentId}`, the refund row id).
 *
 * Responses are parsed with the zod schemas of `schemas.ts`; one that does not parse throws
 * `StripeResponseInvalid`, because the pinned version makes that a bug, not an outcome. Network
 * failures, rate limits and 5xx are `unavailable`; Stripe's `message` is never read.
 *
 * The secret and the webhook secret are injected by the caller (the lifecycle, TASK-257), never
 * read from `process.env` here.
 */
import type { Money } from "@/modules/i18n";

import {
  providerFailure,
  type CreateIntentInput,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderFailure,
  type ProviderIntent,
  type ProviderRefund,
  type RefundMetadataInput,
  type SignatureInvalid,
  type WebhookHeaders,
} from "../provider.ts";
import { fromStripeCurrency, toStripeAmount } from "./amount.ts";
import { SUBSCRIBED_STRIPE_EVENT_TYPES } from "./events.ts";
import { stripeCreateIntentParams, toStripeForm } from "./params.ts";
import {
  StripeErrorSchema,
  StripeEventListSchema,
  StripePaymentIntentSchema,
  StripeRefundSchema,
  type StripeCharge,
  type StripePaymentIntent,
  type StripeRefund,
} from "./schemas.ts";
import { STRIPE_API_BASE, STRIPE_API_VERSION } from "./version.ts";
import { toProviderEvent, verifyStripeWebhook } from "./webhook.ts";

export interface StripeAdapterConfig {
  /** `sk_test_…` / `rk_test_…` outside production, `rk_live_…` in production. */
  readonly secretKey: string;
  /** The endpoint's signing secret, `whsec_…`. */
  readonly webhookSecret: string;
}

export interface StripeAdapterDeps {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

/** A Stripe response that does not match the pinned version's shape. A bug: it throws. */
export class StripeResponseInvalid extends Error {
  constructor(path: string) {
    super(
      `Stripe response for ${path} does not match API version ${STRIPE_API_VERSION}`,
    );
    this.name = "StripeResponseInvalid";
  }
}

/** The page size `listEventsSince` asks for, Stripe's maximum. */
export const STRIPE_EVENTS_PAGE_SIZE = 100;

type Outcome =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly failure: ProviderFailure };

function chargeOf(intent: StripePaymentIntent): StripeCharge | undefined {
  const charge = intent.latest_charge;
  return typeof charge === "object" && charge !== null ? charge : undefined;
}

function toProviderIntent(intent: StripePaymentIntent): ProviderIntent {
  const charge = chargeOf(intent);
  const details = charge?.payment_method_details ?? undefined;
  const card = details?.card ?? undefined;
  const error = intent.last_payment_error ?? undefined;
  const declineCode = error?.decline_code ?? error?.code ?? undefined;
  const declineRef = error?.charge ?? error?.payment_method?.id ?? undefined;

  return {
    ref: intent.id,
    status: intent.status,
    amount: {
      amountMinor: intent.amount,
      currency: fromStripeCurrency(intent.currency),
    },
    captureMethod: intent.capture_method,
    methodType: card?.wallet?.type ?? details?.type ?? null,
    ...(card?.brand ? { cardBrand: card.brand } : {}),
    ...(card?.last4 ? { cardLast4: card.last4 } : {}),
    ...(card?.three_d_secure?.result
      ? { threeDsOutcome: card.three_d_secure.result }
      : {}),
    ...(typeof charge?.outcome?.risk_score === "number"
      ? { riskScore: charge.outcome.risk_score }
      : {}),
    livemode: intent.livemode,
    ...(typeof card?.capture_before === "number"
      ? { captureBefore: new Date(card.capture_before * 1000) }
      : {}),
    ...(declineCode !== undefined && declineRef !== undefined
      ? { lastDecline: { code: declineCode, ref: declineRef } }
      : {}),
    clientSecret: intent.client_secret ?? "",
  };
}

function toProviderRefund(
  refund: StripeRefund,
  intentRef: string,
): ProviderRefund {
  const paymentIntent = refund.payment_intent;
  return {
    ref: refund.id,
    intentRef:
      typeof paymentIntent === "string"
        ? paymentIntent
        : (paymentIntent?.id ?? intentRef),
    status: refund.status ?? "pending",
    amount: {
      amountMinor: refund.amount,
      currency: fromStripeCurrency(refund.currency),
    },
    ...(refund.failure_reason ? { failureCode: refund.failure_reason } : {}),
  };
}

/** Stripe's HTTP status and error code → our failure kind. */
function failureFor(status: number, body: unknown): ProviderFailure {
  const parsed = StripeErrorSchema.safeParse(body);
  const code = parsed.success
    ? (parsed.data.error.code ?? parsed.data.error.type)
    : undefined;
  if (status === 404) return providerFailure("not_found", code);
  if (status === 429 || status >= 500 || status === 401 || status === 403) {
    return providerFailure("unavailable", code);
  }
  if (code === "payment_intent_unexpected_state") {
    return providerFailure("state_conflict", code);
  }
  return providerFailure("rejected", code);
}

export function createStripeProvider(
  config: StripeAdapterConfig,
  deps: StripeAdapterDeps = {},
): PaymentProvider {
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  async function request(
    method: "GET" | "POST",
    path: string,
    form: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<Outcome> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.secretKey}`,
      "stripe-version": STRIPE_API_VERSION,
    };
    if (idempotencyKey !== undefined)
      headers["idempotency-key"] = idempotencyKey;
    let url = `${STRIPE_API_BASE}${path}`;
    const init: RequestInit = { method, headers };
    if (method === "GET") {
      const query = form.toString();
      if (query !== "") url = `${url}?${query}`;
    } else {
      headers["content-type"] = "application/x-www-form-urlencoded";
      init.body = form.toString();
    }

    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      return { ok: false, failure: providerFailure("unavailable") };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (!response.ok) {
      return { ok: false, failure: failureFor(response.status, body) };
    }
    return { ok: true, body };
  }

  function intentFrom(
    outcome: Outcome,
    path: string,
  ): ProviderIntent | ProviderFailure {
    if (!outcome.ok) return outcome.failure;
    const parsed = StripePaymentIntentSchema.safeParse(outcome.body);
    if (!parsed.success) throw new StripeResponseInvalid(path);
    return toProviderIntent(parsed.data);
  }

  const expandCharge = (): URLSearchParams =>
    new URLSearchParams([["expand[]", "latest_charge"]]);

  const intentPath = (ref: string, action = ""): string =>
    `/payment_intents/${encodeURIComponent(ref)}${action}`;

  return {
    name: "stripe",

    async createIntent(input: CreateIntentInput) {
      const params = stripeCreateIntentParams(input);
      const form = toStripeForm(
        params as unknown as Parameters<typeof toStripeForm>[0],
      );
      const path = "/payment_intents";
      return intentFrom(
        await request("POST", path, form, input.idempotencyKey),
        path,
      );
    },

    async retrieveIntent(ref: string) {
      const path = intentPath(ref);
      return intentFrom(await request("GET", path, expandCharge()), path);
    },

    async capture(ref: string, idempotencyKey: string) {
      const path = intentPath(ref, "/capture");
      return intentFrom(
        await request("POST", path, expandCharge(), idempotencyKey),
        path,
      );
    },

    async cancel(ref: string, idempotencyKey: string) {
      const path = intentPath(ref, "/cancel");
      return intentFrom(
        await request("POST", path, expandCharge(), idempotencyKey),
        path,
      );
    },

    async refund(
      ref: string,
      amount: Money,
      idempotencyKey: string,
      metadata: RefundMetadataInput,
    ): Promise<ProviderRefund | ProviderFailure> {
      const form = toStripeForm({
        payment_intent: ref,
        amount: toStripeAmount(amount),
        metadata: {
          order_id: metadata.orderId,
          refund_id: metadata.refundId,
          reason: metadata.reason,
        },
      });
      const path = "/refunds";
      const outcome = await request("POST", path, form, idempotencyKey);
      if (!outcome.ok) {
        // A refund has no state to wait for: a refusal of any kind is `rejected`, with its code.
        return outcome.failure.failure === "state_conflict"
          ? providerFailure("rejected", outcome.failure.code)
          : outcome.failure;
      }
      const parsed = StripeRefundSchema.safeParse(outcome.body);
      if (!parsed.success) throw new StripeResponseInvalid(path);
      return toProviderRefund(parsed.data, ref);
    },

    verifyAndParseWebhook(
      rawBody: string,
      headers: WebhookHeaders,
    ): ProviderEvent | SignatureInvalid {
      return verifyStripeWebhook(rawBody, headers, config.webhookSecret, now());
    },

    async listEventsSince(
      since: Date,
    ): Promise<readonly ProviderEvent[] | ProviderFailure> {
      const collected: ProviderEvent[] = [];
      let startingAfter: string | undefined;
      for (;;) {
        const form = new URLSearchParams([
          ["created[gte]", String(Math.floor(since.getTime() / 1000))],
          ["limit", String(STRIPE_EVENTS_PAGE_SIZE)],
          ...SUBSCRIBED_STRIPE_EVENT_TYPES.map((type): [string, string] => [
            "types[]",
            type,
          ]),
        ]);
        if (startingAfter !== undefined)
          form.set("starting_after", startingAfter);
        const path = "/events";
        const outcome = await request("GET", path, form);
        if (!outcome.ok) return outcome.failure;
        const parsed = StripeEventListSchema.safeParse(outcome.body);
        if (!parsed.success) throw new StripeResponseInvalid(path);
        collected.push(...parsed.data.data.map(toProviderEvent));
        const last = parsed.data.data.at(-1);
        if (!parsed.data.has_more || last === undefined) break;
        startingAfter = last.id;
      }
      // Stripe lists newest first, page after page; the contract is oldest first.
      return collected.reverse();
    },
  };
}
