/**
 * The Stripe adapter (spec 013 §2 B, §5.2, AC-7, AC-8; ADR-0005; TASK-255).
 *
 * The only code that talks to Stripe. It speaks Stripe's REST API with `fetch` directly, so no SDK
 * enters the bundle and MSW can serve recorded responses to it in the contract suite. Every
 * request carries:
 *
 *  - the secret (in production the live restricted key, spec 013 §5.2 "Keys and
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
import type { z } from "zod";

import type { Money } from "@/modules/i18n";

import {
  isProviderFailure,
  providerFailure,
  type CreateIntentInput,
  type PaymentProvider,
  type ProviderDispute,
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
  STRIPE_DISPUTE_STATUSES,
  StripeChargeSchema,
  StripeDisputeSchema,
  StripeErrorSchema,
  StripeEventListSchema,
  StripePaymentIntentSchema,
  StripeRefundListSchema,
  StripeRefundSchema,
  type StripeCharge,
  type StripeDispute,
  type StripePaymentIntent,
  type StripeRefund,
} from "./schemas.ts";
import { STRIPE_API_BASE, STRIPE_API_VERSION } from "./version.ts";
import { toProviderEvent, verifyStripeWebhook } from "./webhook.ts";

export interface StripeAdapterConfig {
  /** A test key outside production; the live restricted key in production (spec 013 §5.2). */
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
    ...(refund.metadata?.["refund_id"]
      ? { refundId: refund.metadata["refund_id"] }
      : {}),
  };
}

/** The id of an expandable reference. */
function idOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : value.id;
}

function toProviderDispute(
  dispute: StripeDispute,
  intentRef: string,
): ProviderDispute {
  const due = dispute.evidence_details?.due_by;
  return {
    ref: dispute.id,
    intentRef,
    status: STRIPE_DISPUTE_STATUSES[dispute.status],
    amount: {
      amountMinor: dispute.amount,
      currency: fromStripeCurrency(dispute.currency),
    },
    reason: dispute.reason,
    ...(typeof due === "number" ? { evidenceDueBy: new Date(due * 1000) } : {}),
    openedAt: new Date(dispute.created * 1000),
  };
}

/** Stripe's HTTP status and error code → our failure kind. */
function failureFor(status: number, code: string | undefined): ProviderFailure {
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

  /**
   * One call to Stripe. The body is read and parsed here, with `schema` on success and
   * `StripeErrorSchema` on failure, so no unparsed byte leaves this function.
   */
  async function request<T>(
    method: "GET" | "POST",
    path: string,
    form: URLSearchParams,
    schema: z.ZodType<T>,
    idempotencyKey?: string,
  ): Promise<T | ProviderFailure> {
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
      return providerFailure("unavailable");
    }

    if (!response.ok) {
      let code: string | undefined;
      try {
        const error = StripeErrorSchema.safeParse(
          JSON.parse(await response.text()),
        );
        code = error.success
          ? (error.data.error.code ?? error.data.error.type)
          : undefined;
      } catch {
        code = undefined;
      }
      return failureFor(response.status, code);
    }

    let parsed: z.ZodSafeParseResult<T>;
    try {
      parsed = schema.safeParse(JSON.parse(await response.text()));
    } catch (error) {
      // Not JSON is a shape we do not know; a body cut off in transit is the network's.
      if (error instanceof SyntaxError) throw new StripeResponseInvalid(path);
      return providerFailure("unavailable");
    }
    if (!parsed.success) throw new StripeResponseInvalid(path);
    return parsed.data;
  }

  function intentFrom(
    result: StripePaymentIntent | ProviderFailure,
  ): ProviderIntent | ProviderFailure {
    return isProviderFailure(result) ? result : toProviderIntent(result);
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
        await request(
          "POST",
          path,
          form,
          StripePaymentIntentSchema,
          input.idempotencyKey,
        ),
      );
    },

    async retrieveIntent(ref: string) {
      const path = intentPath(ref);
      return intentFrom(
        await request("GET", path, expandCharge(), StripePaymentIntentSchema),
      );
    },

    async capture(ref: string, idempotencyKey: string) {
      const path = intentPath(ref, "/capture");
      return intentFrom(
        await request(
          "POST",
          path,
          expandCharge(),
          StripePaymentIntentSchema,
          idempotencyKey,
        ),
      );
    },

    async cancel(ref: string, idempotencyKey: string) {
      const path = intentPath(ref, "/cancel");
      return intentFrom(
        await request(
          "POST",
          path,
          expandCharge(),
          StripePaymentIntentSchema,
          idempotencyKey,
        ),
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
      const result = await request(
        "POST",
        path,
        form,
        StripeRefundSchema,
        idempotencyKey,
      );
      if (isProviderFailure(result)) {
        // A refund has no state to wait for: a refusal of any kind is `rejected`, with its code.
        return result.failure === "state_conflict"
          ? providerFailure("rejected", result.code)
          : result;
      }
      return toProviderRefund(result, ref);
    },

    async retrieveRefund(ref: string) {
      const path = `/refunds/${encodeURIComponent(ref)}`;
      const result = await request(
        "GET",
        path,
        new URLSearchParams(),
        StripeRefundSchema,
      );
      return isProviderFailure(result) ? result : toProviderRefund(result, "");
    },

    async listChargeRefunds(
      chargeRef: string,
    ): Promise<readonly ProviderRefund[] | ProviderFailure> {
      const collected: ProviderRefund[] = [];
      let startingAfter: string | undefined;
      for (;;) {
        const form = new URLSearchParams([
          ["charge", chargeRef],
          ["limit", String(STRIPE_EVENTS_PAGE_SIZE)],
        ]);
        if (startingAfter !== undefined)
          form.set("starting_after", startingAfter);
        const page = await request(
          "GET",
          "/refunds",
          form,
          StripeRefundListSchema,
        );
        if (isProviderFailure(page)) return page;
        collected.push(
          ...page.data.map((refund) => toProviderRefund(refund, "")),
        );
        const last = page.data.at(-1);
        if (!page.has_more || last === undefined) break;
        startingAfter = last.id;
      }
      // Stripe lists newest first; the interface is oldest first.
      return collected.reverse();
    },

    async retrieveDispute(
      ref: string,
    ): Promise<ProviderDispute | ProviderFailure> {
      const path = `/disputes/${encodeURIComponent(ref)}`;
      const dispute = await request(
        "GET",
        path,
        new URLSearchParams(),
        StripeDisputeSchema,
      );
      if (isProviderFailure(dispute)) return dispute;
      let intentRef = idOf(dispute.payment_intent);
      if (intentRef === null) {
        // An older dispute names only its charge: the charge names the intent it paid.
        const chargeRef = idOf(dispute.charge) ?? "";
        const charge = await request(
          "GET",
          `/charges/${encodeURIComponent(chargeRef)}`,
          new URLSearchParams(),
          StripeChargeSchema,
        );
        if (isProviderFailure(charge)) return charge;
        intentRef = idOf(charge.payment_intent);
      }
      if (intentRef === null) {
        return providerFailure("not_found", "dispute_without_intent");
      }
      return toProviderDispute(dispute, intentRef);
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
        const page = await request("GET", path, form, StripeEventListSchema);
        if (isProviderFailure(page)) return page;
        collected.push(...page.data.map(toProviderEvent));
        const last = page.data.at(-1);
        if (!page.has_more || last === undefined) break;
        startingAfter = last.id;
      }
      // Stripe lists newest first, page after page; the contract is oldest first.
      return collected.reverse();
    },
  };
}
