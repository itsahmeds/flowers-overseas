/**
 * `contactHmac` (spec 034 §5.1 D, §5.2; AC-8; TASK-449): an email address known only as
 * HMAC-SHA256 under `CONTACT_HMAC_SECRET` over the address normalised as checkout normalises it
 * (trimmed, lower-cased), as lowercase hex. The basket reminder's consent proof, suppression list
 * and per-address gap store this, never the address.
 *
 * The secret is read at call time, never at import. The value is personal data in effect: it is in
 * `src/lib/logger.ts`'s redaction list (`email_hmac`) and is never logged.
 */
import { createHmac } from "node:crypto";

import {
  basketReminderEnv,
  CONTACT_HMAC_SECRET_KEY,
} from "./env.basket-reminders";
import type { EnvSource } from "./env.schema";

/** Thrown when the key is not configured; names the key, never a value. */
export class ContactHmacUnavailableError extends Error {
  constructor() {
    super(`${CONTACT_HMAC_SECRET_KEY} is not configured`);
    this.name = "ContactHmacUnavailableError";
  }
}

/** The shape every `contactHmac` value has (the migration's checks hold the same pattern). */
export const CONTACT_HMAC_PATTERN = /^[0-9a-f]{64}$/u;

/** HMAC-SHA256 of the normalised address under `secret`, lowercase hex. */
export function contactHmacWith(secret: Buffer, email: string): string {
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
}

/** `contactHmac(email)` under the environment's key (throws when it is not configured). */
export function contactHmac(
  email: string,
  source: EnvSource = process.env,
): string {
  const config = basketReminderEnv(source);
  if (!config.configured) throw new ContactHmacUnavailableError();
  return contactHmacWith(config.hmacSecret, email);
}
