/**
 * The `fo_checkout` cookie and the draft token it carries (spec 010 §5.2 "Server actions and the
 * route", §8 "Security", AC-6; TASK-203).
 *
 * The cookie holds a 256-bit random token, base64url-encoded (43 characters); the database holds
 * only its SHA-256 (`checkout_draft.token_sha256`), so a copy of the table yields no cookie that
 * opens a draft. The token is a credential: it is never logged, never put in a URL, and every log
 * line names the draft by `draft_id` instead (§8 "Logs and PII").
 *
 * Attributes are fixed by AC-6: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30
 * days after the last change, spec 010 §14 A-founder-2026-10-22 D7). Only the start route and the
 * step actions write it, and both answer `no-store`, so no cached response ever carries a
 * `Set-Cookie` (AC-62).
 *
 * `fo_basket` (item 7, AC-62) holds **only the number of unplaced lines**, digits matching
 * `^[0-9]{1,2}$`, so the header's count island can show it without a request. It is not
 * `HttpOnly` (the island reads it), has the same `Max-Age` as `fo_checkout`, and is deleted
 * (`Max-Age=0`) at zero. It holds no token, id or personal data.
 */
import { createHash, randomBytes } from "node:crypto";

import { BASKET_LIFETIME_DAYS, BASKET_MAX_LINES } from "@/config/checkout";

/** The cookie's name, as the cookie register lists it. */
export const CHECKOUT_COOKIE_NAME = "fo_checkout";

/** 256 bits (§8). */
const TOKEN_BYTES = 32;

/** A base64url token of 32 bytes: 43 characters, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const SECONDS_PER_DAY = 86_400;

/** `Max-Age`: the basket's lifetime, 30 days (D7, AC-6: 2 592 000). */
export const CHECKOUT_COOKIE_MAX_AGE_SECONDS =
  BASKET_LIFETIME_DAYS * SECONDS_PER_DAY;

/** The attributes, in the order AC-6 names them, for `cookies().set()`. */
export const CHECKOUT_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: CHECKOUT_COOKIE_MAX_AGE_SECONDS,
} as const;

/** A fresh draft token from the platform's CSPRNG. */
export function newDraftToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Is `value` shaped like a token this module issued? Anything else is never hashed or looked up. */
export function isDraftToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** The SHA-256 the database stores, lowercase hex. */
export function draftTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The `Set-Cookie` header value the start route answers with. */
export function checkoutCookieHeader(token: string): string {
  if (!isDraftToken(token)) {
    throw new Error("refusing to set a checkout cookie that is not a token");
  }
  return `${CHECKOUT_COOKIE_NAME}=${token}; Path=/; Max-Age=${String(CHECKOUT_COOKIE_MAX_AGE_SECONDS)}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * The token in a `Cookie` request header, or `null` when there is none or it is not shaped like
 * one of ours.
 */
export function draftTokenFromCookieHeader(
  header: string | null | undefined,
): string | null {
  if (header === null || header === undefined) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== CHECKOUT_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    return isDraftToken(value) ? value : null;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* fo_basket                                                                   */
/* -------------------------------------------------------------------------- */

/** The count cookie's name, as the cookie register lists it. */
export const BASKET_COOKIE_NAME = "fo_basket";

/** Its value: the number of unplaced lines, digits only. */
export const BASKET_COOKIE_VALUE_PATTERN = /^[0-9]{1,2}$/u;

/** Its attributes: `fo_checkout`'s, except readable by the header's island (not `HttpOnly`). */
export const BASKET_COOKIE_ATTRIBUTES = {
  httpOnly: false,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: CHECKOUT_COOKIE_MAX_AGE_SECONDS,
} as const;

/**
 * The `Set-Cookie` header value for a basket of `count` unplaced lines: the count, or a deletion
 * (`Max-Age=0`) at zero.
 */
export function basketCookieHeader(count: number): string {
  if (!Number.isInteger(count) || count < 0 || count > BASKET_MAX_LINES) {
    throw new Error(
      "refusing to set a basket count outside 0 to BASKET_MAX_LINES",
    );
  }
  if (count === 0) {
    return `${BASKET_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
  }
  return `${BASKET_COOKIE_NAME}=${String(count)}; Path=/; Max-Age=${String(CHECKOUT_COOKIE_MAX_AGE_SECONDS)}; Secure; SameSite=Lax`;
}
