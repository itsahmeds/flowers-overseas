/**
 * Hashes and tokens of the sign-in core (spec 012 §2.2, §5.2; TASK-217).
 *
 *  - `newSignInToken()` — 32 random bytes, base64url: 43 characters of `[A-Za-z0-9_-]`, which
 *    `ConfirmSignInSchema` accepts.
 *  - `hashSignInToken(token, secret)` — what `verification_tokens.token` stores: the SHA-256 hex of
 *    the token followed by `AUTH_SECRET`, exactly Auth.js's `createHash(`${token}${secret}`)`, so
 *    Auth.js's email callback finds the row the core wrote. The plain token exists only in the
 *    email and in the one request that consumes it.
 *  - `hashIdentifier(email)` — the SHA-256 hex of the normalised address: `auth_email_send` keys
 *    the send limit by it and never stores the address.
 *  - `newSessionToken(surface)` / `isSessionTokenOf(surface, token)` — a session token names the
 *    surface that minted it (`admin.…`, `florist.…`; TASK-212), so one surface's session
 *    authenticates nothing on the other (spec 011 §2).
 */
import { createHash, randomBytes } from "node:crypto";

export function newSignInToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSignInToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

/** The address as Auth.js normalises it before every call: trimmed and lower-cased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashIdentifier(email: string): string {
  return createHash("sha256").update(normaliseEmail(email)).digest("hex");
}

/** A database session token bound to its surface: `{surface}.{32 random bytes, base64url}`. */
export function newSessionToken(surface: string): string {
  return `${surface}.${randomBytes(32).toString("base64url")}`;
}

/** Whether `token` was minted by `surface` (the prefix before the first dot). */
export function isSessionTokenOf(surface: string, token: string): boolean {
  return token.startsWith(`${surface}.`) && token.length > surface.length + 1;
}
