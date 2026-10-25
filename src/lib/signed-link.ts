/**
 * Signed links for the buyer (spec 018 §5.2 `src/lib/signed-link.ts`, AC-1, T-01; TASK-337).
 *
 * A token is `base64url(payload) + "." + base64url(mac)`:
 *
 *  - **payload** is a JSON object. When the link expires, `sign` adds the reserved key `exp` (epoch
 *    milliseconds) to it, so the expiry sits **inside** the MAC and cannot be moved without
 *    breaking it. A tracking token carries no `exp` (its expiry is the order's, §13 Q7), so it
 *    decodes to exactly `{ publicToken, version }` (AC-2).
 *  - **mac** is HMAC-SHA-256 under `SIGNED_LINK_SECRET` over `purpose + ":v1:" + <payload segment>`,
 *    truncated to its first 16 bytes. The purpose prefix is the domain separation: a token signed
 *    for `invoice` never verifies as `track`, though the secret is shared.
 *
 * `verify` answers **one failure value** (`SIGNED_LINK_FAILURE`, the same frozen object) for every
 * cause: a malformed token, a non-canonical base64url segment, a wrong MAC, another purpose, a
 * payload that is not a JSON object, an expired link. A caller cannot tell them apart, and neither
 * can whoever holds the token. The MAC is compared with `timingSafeEqual` before the payload is
 * parsed, so an unsigned payload is never read.
 *
 * Both segments must be **canonical** base64url (re-encoding the decoded bytes gives the segment
 * back): the last character of a segment carries unused bits, and without this check two token
 * strings would verify as the same link. So every single-character change of a token fails.
 *
 * Nothing here logs. A token is a credential: it never goes into a log line, Sentry or analytics
 * (spec 018 §8), and this module never sees an order, a name or an address.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { signedLinkSecret } from "./env.signed-link";

/** What a link is for (spec 018 §5.2). Each is its own MAC domain. */
export const SIGNED_LINK_PURPOSES = [
  "track",
  "invoice",
  "privacy",
  "export",
] as const;
export const PurposeSchema = z.enum(SIGNED_LINK_PURPOSES);
export type Purpose = z.infer<typeof PurposeSchema>;

/** The MAC length after truncation: 128 bits. */
export const SIGNED_LINK_MAC_BYTES = 16;

/** The format version inside the MAC input, so a future format cannot be confused with this one. */
export const SIGNED_LINK_VERSION = "v1";

/** The payload key `sign` reserves for the expiry. */
export const EXPIRY_KEY = "exp";

/** A payload: a JSON object. */
export type SignedLinkPayload = Readonly<Record<string, unknown>>;

/** The one failure value, for every cause. Compared by identity in the tests. */
export const SIGNED_LINK_FAILURE: { readonly ok: false } = Object.freeze({
  ok: false,
});

export type VerifyResult =
  | {
      readonly ok: true;
      /** The signed payload without the reserved `exp` key. */
      readonly payload: SignedLinkPayload;
      /** The expiry the link was signed with, or `undefined` for a link with none. */
      readonly expiresAt: Date | undefined;
    }
  | typeof SIGNED_LINK_FAILURE;

/** Seams for the tests; production passes nothing. */
export interface SignedLinkOptions {
  /** The HMAC key. Default: `signedLinkSecret(process.env)`. */
  readonly secret?: string;
  /** The clock `verify` compares the expiry with. Default: now. */
  readonly now?: () => Date;
}

const SEGMENT = /^[A-Za-z0-9_-]+$/u;

function secretOf(options: SignedLinkOptions | undefined): string {
  return options?.secret ?? signedLinkSecret(process.env);
}

function mac(secret: string, purpose: Purpose, segment: string): Buffer {
  return createHmac("sha256", secret)
    .update(`${purpose}:${SIGNED_LINK_VERSION}:${segment}`, "utf8")
    .digest()
    .subarray(0, SIGNED_LINK_MAC_BYTES);
}

/** The bytes of a canonical base64url segment, or `undefined`. */
function decodeSegment(segment: string): Buffer | undefined {
  if (!SEGMENT.test(segment)) return undefined;
  const bytes = Buffer.from(segment, "base64url");
  return bytes.toString("base64url") === segment ? bytes : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Signs `payload` for `purpose`. `expiresAt`, when given, is written into the payload as `exp`
 * and so is covered by the MAC. Throws on a purpose outside the four, on a payload that already
 * uses the reserved key, and on an invalid date: these are programming errors, never input.
 */
export function sign(
  purpose: Purpose,
  payload: SignedLinkPayload,
  expiresAt?: Date,
  options?: SignedLinkOptions,
): string {
  const domain = PurposeSchema.parse(purpose);
  if (!isPlainObject(payload)) {
    throw new TypeError("a signed-link payload is a JSON object");
  }
  if (Object.hasOwn(payload, EXPIRY_KEY)) {
    throw new TypeError(
      `the payload key "${EXPIRY_KEY}" is reserved for the expiry`,
    );
  }
  let body: Record<string, unknown> = { ...payload };
  if (expiresAt !== undefined) {
    const at = expiresAt.getTime();
    if (!Number.isSafeInteger(at)) {
      throw new TypeError("expiresAt is not a valid date");
    }
    body = { ...body, [EXPIRY_KEY]: at };
  }
  const segment = Buffer.from(JSON.stringify(body), "utf8").toString(
    "base64url",
  );
  const tag = mac(secretOf(options), domain, segment).toString("base64url");
  return `${segment}.${tag}`;
}

/**
 * Verifies `token` for `purpose`: the payload it was signed with, or `SIGNED_LINK_FAILURE`. A link
 * is expired from the millisecond of its `expiresAt` on (`now >= expiresAt`).
 */
export function verify(
  purpose: Purpose,
  token: string,
  options?: SignedLinkOptions,
): VerifyResult {
  const domain = PurposeSchema.safeParse(purpose);
  if (!domain.success || typeof token !== "string") return SIGNED_LINK_FAILURE;
  const parts = token.split(".");
  if (parts.length !== 2) return SIGNED_LINK_FAILURE;
  const [segment = "", tagSegment = ""] = parts;
  const body = decodeSegment(segment);
  const tag = decodeSegment(tagSegment);
  if (
    body === undefined ||
    tag === undefined ||
    tag.length !== SIGNED_LINK_MAC_BYTES
  ) {
    return SIGNED_LINK_FAILURE;
  }
  const expected = mac(secretOf(options), domain.data, segment);
  if (!timingSafeEqual(expected, tag)) return SIGNED_LINK_FAILURE;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return SIGNED_LINK_FAILURE;
  }
  if (!isPlainObject(parsed)) return SIGNED_LINK_FAILURE;
  const { [EXPIRY_KEY]: exp, ...rest } = parsed;
  if (exp === undefined) {
    return { ok: true, payload: rest, expiresAt: undefined };
  }
  if (typeof exp !== "number" || !Number.isSafeInteger(exp)) {
    return SIGNED_LINK_FAILURE;
  }
  const now = (options?.now ?? (() => new Date()))().getTime();
  if (now >= exp) return SIGNED_LINK_FAILURE;
  return { ok: true, payload: rest, expiresAt: new Date(exp) };
}
