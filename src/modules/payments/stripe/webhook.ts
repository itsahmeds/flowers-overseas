/**
 * Stripe webhook verification and parsing (spec 013 §5.2 "Webhook inbox", AC-8; TASK-255).
 *
 * The `Stripe-Signature` header is `t=<unix seconds>,v1=<hex HMAC-SHA256>[,v1=…]`, the HMAC taken
 * over `<t>.<raw body>` with the endpoint's signing secret. The **raw** body is verified, before
 * any parse, against every `v1` entry in constant time; then the timestamp must sit inside
 * Stripe's 300-second tolerance. Anything else is a `SignatureInvalid` the route answers 400 with
 * nothing stored. Only after both checks is the body parsed, with `StripeEventSchema`.
 *
 * `livemode` is reported, not judged: storing a mismatched event as `ignored` is the inbox's
 * (TASK-260, AC-10's event half).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  ProviderEvent,
  SignatureInvalid,
  SignatureInvalidReason,
  WebhookHeaders,
} from "../provider.ts";
import { StripeEventSchema } from "./schemas.ts";

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";

/** Stripe's default tolerance, in seconds (spec 013 §5.2). */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

function invalid(reason: SignatureInvalidReason): SignatureInvalid {
  return { kind: "signature_invalid", reason };
}

export function headerValue(
  headers: WebhookHeaders,
  name: string,
): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/** The hex signature Stripe computes for `rawBody` at `timestamp` (seconds). */
export function stripeSignature(
  rawBody: string,
  timestamp: number,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${String(timestamp)}.${rawBody}`, "utf8")
    .digest("hex");
}

function parseHeader(
  header: string,
): { timestamp: number; signatures: string[] } | undefined {
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value);
  }
  if (timestamp === undefined || signatures.length === 0) return undefined;
  return { timestamp, signatures };
}

function equalHex(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyStripeWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
  now: Date,
): ProviderEvent | SignatureInvalid {
  const header = headerValue(headers, STRIPE_SIGNATURE_HEADER);
  if (header === undefined || header.trim() === "") {
    return invalid("missing_header");
  }
  const parsed = parseHeader(header);
  if (parsed === undefined) return invalid("malformed_header");

  const expected = stripeSignature(rawBody, parsed.timestamp, secret);
  if (!parsed.signatures.some((candidate) => equalHex(expected, candidate))) {
    return invalid("bad_signature");
  }
  const ageSeconds = Math.abs(now.getTime() / 1000 - parsed.timestamp);
  if (ageSeconds > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return invalid("stale_timestamp");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return invalid("unparseable_body");
  }
  const event = StripeEventSchema.safeParse(body);
  if (!event.success) return invalid("unparseable_body");
  return toProviderEvent(event.data);
}

export function toProviderEvent(event: {
  readonly id: string;
  readonly type: string;
  readonly livemode: boolean;
  readonly created: number;
  readonly data: {
    readonly object: { readonly id: string; readonly object: string };
  };
}): ProviderEvent {
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    createdAt: new Date(event.created * 1000),
    objectRef: event.data.object.id,
    objectType: event.data.object.object,
  };
}
