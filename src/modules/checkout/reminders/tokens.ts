/**
 * The reminder's two link tokens (spec 034 §2 "The link back", §5.2; AC-15; TASK-450): 32 random
 * bytes from `crypto.getRandomValues`, base64url (43 characters), stored only as their SHA-256 in
 * lowercase hex. A token appears in the email's two URLs and nowhere else: never in a log line, a
 * redirect's `Location` or a database column.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

/** `ReminderTokenSchema` (§5.2): exactly the shape `mintReminderToken` produces. */
export const ReminderTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

/** A fresh 256-bit token, base64url without padding. */
export function mintReminderToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** The stored form of a token. */
export function reminderTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
