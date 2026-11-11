/**
 * The review link's token (spec 022a §2 "The invitation", §5.1, §8 "Logs and PII"; AC-7; TASK-370).
 *
 * `reviewToken(secret, inviteId)` is `HMAC-SHA256(REVIEW_TOKEN_SECRET, inviteId)`, base64url: the
 * same invite always gives the same token, so a retried send renders a byte-identical body and
 * Resend's idempotency rule never strands a live link. Only `reviewTokenHash(token)` (the token's
 * SHA-256, lower-case hex, `review_invite.token_hash`) is stored; the token itself is never stored
 * and never logged. A token is 43 characters of the base64url alphabet; anything else is refused
 * before a hash is computed.
 */
import { createHash, createHmac } from "node:crypto";

import { z } from "zod";

/** A token as it appears in a URL: 32 bytes, base64url without padding. */
export const ReviewTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

/** The token of one invite. Deterministic in the secret and the invite id. */
export function reviewToken(secret: string, inviteId: string): string {
  return createHmac("sha256", secret)
    .update(z.uuid().parse(inviteId))
    .digest("base64url");
}

/** What `review_invite.token_hash` holds for `token`: its SHA-256, lower-case hex. */
export function reviewTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The hash of a token from a URL, or null when the string cannot be a token. */
export function tokenHashOf(candidate: string): string | null {
  const parsed = ReviewTokenSchema.safeParse(candidate);
  return parsed.success ? reviewTokenHash(parsed.data) : null;
}
