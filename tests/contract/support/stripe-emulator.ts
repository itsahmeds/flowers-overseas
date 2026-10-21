/**
 * A Stripe API emulator for MSW, built on Stripe's published fixtures for the pinned version
 * (spec 013 AC-8, T-08; TASK-255). It does what Stripe's own `stripe-mock` does: each response is
 * the OpenAPI fixture object (`tests/contract/fixtures/stripe/<version>/`) with the request's
 * parameters and the emulated state laid over it, so the adapter is exercised against Stripe's
 * documented shapes and never against the network (`onUnhandledRequest: "error"`).
 *
 * It keeps the state a contract case needs (intents, charges, refunds, events), replays a write
 * that reuses an `Idempotency-Key`, and records every request so a test can read the exact wire
 * parameters (AC-7). The `simulate*` methods stand for the buyer and the bank.
 */
import { createHmac } from "node:crypto";

import { http, HttpResponse, type RequestHandler } from "msw";

import chargeFixture from "../fixtures/stripe/2026-09-30.endive/charge.json" with { type: "json" };
import eventFixture from "../fixtures/stripe/2026-09-30.endive/event.json" with { type: "json" };
import intentFixture from "../fixtures/stripe/2026-09-30.endive/payment_intent.json" with { type: "json" };
import refundFixture from "../fixtures/stripe/2026-09-30.endive/refund.json" with { type: "json" };
import {
  STRIPE_API_BASE,
  STRIPE_API_VERSION,
} from "../../../src/modules/payments/stripe/version.ts";

type Json = Record<string, unknown>;

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  /** The form body (POST) or the query (GET), decoded into Stripe's nested shape. */
  readonly params: Json;
  /** The raw `key=value` pairs, in order. */
  readonly pairs: readonly (readonly [string, string])[];
}

/** Decode Stripe's `a[b][0]=c` form encoding into nested objects and arrays. */
export function parseStripeForm(
  pairs: Iterable<readonly [string, string]>,
): Json {
  const root: Json = {};
  for (const [rawKey, value] of pairs) {
    const [head = "", ...rest] = rawKey.split("[");
    const parts = [head, ...rest.map((part) => part.replace(/\]$/, ""))];
    let cursor: Record<string | number, unknown> | unknown[] = root;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] ?? "";
      const key: string | number = Array.isArray(cursor)
        ? part === ""
          ? cursor.length
          : Number(part)
        : part;
      const slots = cursor as Record<string | number, unknown>;
      if (index === parts.length - 1) {
        slots[key] = value;
        break;
      }
      if (slots[key] === undefined) {
        slots[key] = /^\d*$/.test(parts[index + 1] ?? "") ? [] : {};
      }
      cursor = slots[key] as Record<string | number, unknown> | unknown[];
    }
  }
  return root;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function stripeError(
  status: number,
  type: string,
  code: string,
  extra: Json = {},
) {
  return HttpResponse.json(
    {
      error: {
        type,
        code,
        // Stripe's message, which the adapter must never read or surface (AC-5).
        message: `Emulated Stripe message for ${code}; never shown to a buyer.`,
        ...extra,
      },
    },
    { status },
  );
}

/** Codes Stripe reports as `card_declined` with this `decline_code` (docs.stripe.com/testing). */
const DECLINE_CODES = new Set([
  "generic_decline",
  "insufficient_funds",
  "lost_card",
  "stolen_card",
  "card_velocity_exceeded",
]);

export interface StripeEmulatorOptions {
  readonly webhookSecret: string;
  readonly livemode?: boolean;
  readonly now: () => Date;
  /** Page size the events list uses, so pagination can be exercised with few events. */
  readonly eventsPageSize?: number;
}

export class StripeEmulator {
  readonly requests: RecordedRequest[] = [];
  private readonly intents = new Map<string, Json>();
  private readonly charges = new Map<string, Json>();
  private readonly refunded = new Map<string, number>();
  private readonly events: Json[] = [];
  private readonly idempotent = new Map<
    string,
    { status: number; body: unknown }
  >();
  private counter = 0;

  private readonly options: StripeEmulatorOptions;

  constructor(options: StripeEmulatorOptions) {
    this.options = options;
  }

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}_3Emu${String(this.counter).padStart(6, "0")}B7WZ01zgkW`;
  }

  private seconds(date: Date = this.options.now()): number {
    return Math.floor(date.getTime() / 1000);
  }

  private intentView(intent: Json, expandCharge: boolean): Json {
    const view = clone(intent);
    const chargeId = view["latest_charge"];
    if (expandCharge && typeof chargeId === "string") {
      view["latest_charge"] = clone(this.charges.get(chargeId) ?? null);
    }
    return view;
  }

  private record(request: Request, pairs: [string, string][]): RecordedRequest {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const recorded: RecordedRequest = {
      method: request.method,
      path: url.pathname.replace(/^\/v1/, ""),
      headers,
      params: parseStripeForm(pairs),
      pairs,
    };
    this.requests.push(recorded);
    return recorded;
  }

  private async read(request: Request): Promise<RecordedRequest> {
    if (request.method === "GET") {
      return this.record(request, [
        ...new URL(request.url).searchParams.entries(),
      ]);
    }
    const text = await request.text();
    return this.record(request, [...new URLSearchParams(text).entries()]);
  }

  /** Replays a write whose `Idempotency-Key` was seen on the same path. */
  private once(
    recorded: RecordedRequest,
    run: () => { status: number; body: unknown },
  ) {
    const key = recorded.headers["idempotency-key"];
    const slot = key === undefined ? undefined : `${recorded.path} ${key}`;
    const stored = slot === undefined ? undefined : this.idempotent.get(slot);
    const result = stored ?? run();
    if (slot !== undefined && stored === undefined)
      this.idempotent.set(slot, result);
    return HttpResponse.json(clone(result.body) as Json, {
      status: result.status,
    });
  }

  private errorBody(type: string, code: string, extra: Json = {}) {
    return {
      error: {
        type,
        code,
        message: `Emulated Stripe message for ${code}; never shown to a buyer.`,
        ...extra,
      },
    };
  }

  handlers(): RequestHandler[] {
    const base = STRIPE_API_BASE;
    return [
      http.post(`${base}/payment_intents`, async ({ request }) => {
        const recorded = await this.read(request);
        return this.once(recorded, () => {
          const params = recorded.params;
          const id = this.id("pi");
          const intent: Json = {
            ...clone(intentFixture),
            id,
            amount: Number(params["amount"]),
            amount_received: 0,
            amount_capturable: 0,
            currency: String(params["currency"]),
            capture_method: String(
              params["capture_method"] ?? "automatic_async",
            ),
            client_secret: `${id}_secret_Dm43xiq1k0ywrRRjDoi8y1gkM`,
            created: this.seconds(),
            canceled_at: null,
            description: params["description"] ?? null,
            livemode: this.options.livemode ?? false,
            metadata: params["metadata"] ?? {},
            payment_method_types: params["payment_method_types"] ?? ["card"],
            payment_method_options: params["payment_method_options"] ?? {},
            automatic_payment_methods: null,
            last_payment_error: null,
            latest_charge: null,
            next_action: null,
            processing: null,
            receipt_email: null,
            shipping: null,
            transfer_data: null,
            status: "requires_payment_method",
          };
          this.intents.set(id, intent);
          return { status: 200, body: intent };
        });
      }),

      http.get(`${base}/payment_intents/:id`, async ({ request, params }) => {
        await this.read(request);
        const intent = this.intents.get(String(params["id"]));
        if (intent === undefined) {
          return stripeError(404, "invalid_request_error", "resource_missing");
        }
        return HttpResponse.json(this.intentView(intent, true));
      }),

      http.post(
        `${base}/payment_intents/:id/capture`,
        async ({ request, params }) => {
          const recorded = await this.read(request);
          return this.once(recorded, () => {
            const intent = this.intents.get(String(params["id"]));
            if (intent === undefined) {
              return {
                status: 404,
                body: this.errorBody(
                  "invalid_request_error",
                  "resource_missing",
                ),
              };
            }
            if (intent["status"] !== "requires_capture") {
              return {
                status: 400,
                body: this.errorBody(
                  "invalid_request_error",
                  "payment_intent_unexpected_state",
                ),
              };
            }
            intent["status"] = "succeeded";
            intent["amount_received"] = intent["amount"];
            intent["amount_capturable"] = 0;
            return { status: 200, body: this.intentView(intent, true) };
          });
        },
      ),

      http.post(
        `${base}/payment_intents/:id/cancel`,
        async ({ request, params }) => {
          const recorded = await this.read(request);
          return this.once(recorded, () => {
            const intent = this.intents.get(String(params["id"]));
            if (intent === undefined) {
              return {
                status: 404,
                body: this.errorBody(
                  "invalid_request_error",
                  "resource_missing",
                ),
              };
            }
            const cancellable = [
              "requires_payment_method",
              "requires_capture",
              "requires_confirmation",
              "requires_action",
            ];
            if (!cancellable.includes(String(intent["status"]))) {
              return {
                status: 400,
                body: this.errorBody(
                  "invalid_request_error",
                  "payment_intent_unexpected_state",
                ),
              };
            }
            intent["status"] = "canceled";
            intent["canceled_at"] = this.seconds();
            intent["cancellation_reason"] = "requested_by_customer";
            return { status: 200, body: this.intentView(intent, true) };
          });
        },
      ),

      http.post(`${base}/refunds`, async ({ request }) => {
        const recorded = await this.read(request);
        return this.once(recorded, () => {
          const ref = String(recorded.params["payment_intent"]);
          const intent = this.intents.get(ref);
          if (intent === undefined) {
            return {
              status: 404,
              body: this.errorBody("invalid_request_error", "resource_missing"),
            };
          }
          if (intent["status"] !== "succeeded") {
            return {
              status: 400,
              body: this.errorBody(
                "invalid_request_error",
                "payment_intent_unexpected_state",
              ),
            };
          }
          const amount = Number(recorded.params["amount"] ?? intent["amount"]);
          const already = this.refunded.get(ref) ?? 0;
          if (amount > Number(intent["amount"]) - already) {
            return {
              status: 400,
              body: this.errorBody("invalid_request_error", "amount_too_large"),
            };
          }
          this.refunded.set(ref, already + amount);
          const refund: Json = {
            ...clone(refundFixture),
            id: this.id("re"),
            amount,
            currency: intent["currency"],
            charge: intent["latest_charge"],
            created: this.seconds(),
            metadata: recorded.params["metadata"] ?? {},
            payment_intent: ref,
            status: "succeeded",
          };
          return { status: 200, body: refund };
        });
      }),

      http.get(`${base}/events`, async ({ request }) => {
        const recorded = await this.read(request);
        const params = recorded.params;
        const created = (params["created"] ?? {}) as Json;
        const gte = Number(created["gte"] ?? 0);
        const types = (params["types"] ?? []) as string[];
        const limit = Math.min(
          Number(params["limit"] ?? 10),
          this.options.eventsPageSize ?? 100,
        );
        const newestFirst = this.events
          .filter((event) => Number(event["created"]) >= gte)
          .filter(
            (event) =>
              types.length === 0 || types.includes(String(event["type"])),
          )
          .sort((a, b) => Number(b["created"]) - Number(a["created"]));
        const after = params["starting_after"];
        const start =
          after === undefined
            ? 0
            : newestFirst.findIndex((event) => event["id"] === after) + 1;
        const page = newestFirst.slice(start, start + limit);
        return HttpResponse.json({
          object: "list",
          url: "/v1/events",
          has_more: start + limit < newestFirst.length,
          data: clone(page),
        });
      }),
    ];
  }

  // --- the buyer and the bank -----------------------------------------------------------

  private intent(ref: string): Json {
    const intent = this.intents.get(ref);
    if (intent === undefined) throw new Error(`no emulated intent ${ref}`);
    return intent;
  }

  private newCharge(
    intent: Json,
    paid: boolean,
    failure?: { code: string },
  ): string {
    const id = this.id("ch");
    const fixtureDetails = clone(chargeFixture.payment_method_details);
    const charge: Json = {
      ...clone(chargeFixture),
      id,
      amount: intent["amount"],
      amount_captured: paid ? intent["amount"] : 0,
      currency: intent["currency"],
      captured: paid,
      paid,
      status: paid ? "succeeded" : "failed",
      failure_code: failure?.code ?? null,
      payment_intent: intent["id"],
      livemode: this.options.livemode ?? false,
      outcome: {
        ...clone(chargeFixture.outcome),
        risk_score: 12,
        type: paid ? "authorized" : "issuer_declined",
      },
      payment_method_details: {
        ...fixtureDetails,
        card: {
          ...fixtureDetails.card,
          three_d_secure: {
            ...fixtureDetails.card.three_d_secure,
            result: "authenticated",
          },
          wallet: null,
        },
      },
    };
    this.charges.set(id, charge);
    return id;
  }

  simulateSuccess(ref: string): Promise<void> {
    const intent = this.intent(ref);
    intent["latest_charge"] = this.newCharge(intent, true);
    intent["status"] = "succeeded";
    intent["amount_received"] = intent["amount"];
    intent["last_payment_error"] = null;
    return Promise.resolve();
  }

  simulateHold(ref: string): Promise<void> {
    const intent = this.intent(ref);
    intent["latest_charge"] = this.newCharge(intent, true);
    intent["status"] = "requires_capture";
    intent["amount_capturable"] = intent["amount"];
    return Promise.resolve();
  }

  simulateDecline(ref: string, code: string): Promise<void> {
    const intent = this.intent(ref);
    const declined = DECLINE_CODES.has(code);
    const chargeId = this.newCharge(intent, false, {
      code: declined ? "card_declined" : code,
    });
    intent["latest_charge"] = chargeId;
    intent["status"] = "requires_payment_method";
    intent["last_payment_error"] = {
      type: "card_error",
      code: declined ? "card_declined" : code,
      decline_code: declined ? code : null,
      charge: chargeId,
      message: "Emulated Stripe message; never shown to a buyer.",
      payment_method: {
        id: "pm_card_visa",
        object: "payment_method",
        type: "card",
      },
    };
    return Promise.resolve();
  }

  simulateEvent(type: string, objectRef: string, createdAt: Date) {
    const object = this.intents.get(objectRef) ?? {
      id: objectRef,
      object: "payment_intent",
    };
    const event: Json = {
      ...clone(eventFixture),
      id: this.id("evt"),
      api_version: STRIPE_API_VERSION,
      created: this.seconds(createdAt),
      data: { object: clone(object) },
      livemode: this.options.livemode ?? false,
      type,
    };
    this.events.push(event);
    return {
      id: String(event["id"]),
      type,
      livemode: this.options.livemode ?? false,
      createdAt: new Date(this.seconds(createdAt) * 1000),
      objectRef,
      objectType: String((object as Json)["object"]),
    };
  }

  eventBodyOf(eventId: string): string {
    const event = this.events.find((candidate) => candidate["id"] === eventId);
    if (event === undefined) throw new Error(`no emulated event ${eventId}`);
    return JSON.stringify(event, null, 2);
  }

  /** The `Stripe-Signature` header Stripe sends for `rawBody` at `signedAt`. */
  signatureHeader(rawBody: string, signedAt: Date): string {
    // Computed here, independently of the adapter, as Stripe documents it: HMAC-SHA256 of
    // `<t>.<raw body>` with the endpoint secret, hex encoded.
    const timestamp = this.seconds(signedAt);
    const v1 = createHmac("sha256", this.options.webhookSecret)
      .update(`${String(timestamp)}.${rawBody}`, "utf8")
      .digest("hex");
    return `t=${String(timestamp)},v1=${v1}`;
  }
}
