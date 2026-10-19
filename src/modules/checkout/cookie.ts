/**
 * The `fo_checkout` cookie and the draft token it carries (spec 010 §5.2 "Server actions and the
 * route", §8 "Security", AC-6; TASK-203).
 *
 * The cookie holds a 256-bit random token, base64url-encoded (43 characters); the database holds
 * only its SHA-256 (`checkout_draft.token_sha256`), so a copy of the table yields no cookie that
 * opens a draft. The token is a credential: it is never logged, never put in a URL, and every log
 * line names the draft by `draft_id` instead (§8 "Logs and PII").
 *
 * Attributes are fixed by AC-6: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`. Only the
 * start route and the step actions write it, and both answer `no-store`, so no cached response
 * ever carries a `Set-Cookie`.
 */
import { createHash, randomBytes } from "node:crypto";

import { DRAFT_LIFETIME_HOURS } from "@/config/checkout";

/** The cookie's name, as the cookie register lists it. */
export const CHECKOUT_COOKIE_NAME = "fo_checkout";

/** 256 bits (§8). */
const TOKEN_BYTES = 32;

/** A base64url token of 32 bytes: 43 characters, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const SECONDS_PER_HOUR = 3600;

/** `Max-Age`: the draft's lifetime, 24 hours (§2 "Retention", AC-6: 86 400). */
export const CHECKOUT_COOKIE_MAX_AGE_SECONDS =
  DRAFT_LIFETIME_HOURS * SECONDS_PER_HOUR;

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
