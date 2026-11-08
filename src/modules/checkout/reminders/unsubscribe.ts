/**
 * `unsubscribeBasketReminders` (spec 034 §2 "Stopping it", §5.2 "Unsubscribe"; AC-19, AC-20;
 * TASK-451), in the caller's transaction, before the response: the reminder found by its
 * unsubscribe token hash; its address's hash suppressed (`unsubscribed`, never weakening a
 * `bounced` or `complained`); one `consent_log` withdrawal with the channel; the source draft's
 * consent cleared if it still exists. An unknown token, or one cleared at 60 days, writes nothing.
 * The caller answers both cases with the same body. Works with the flag off.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { appendContactConsent } from "@/modules/customers";
import type { OrderExecutor } from "@/modules/orders";

import { ReminderTokenSchema, reminderTokenHash } from "./tokens";

const Row = z.object({
  id: z.uuid(),
  draft_id: z.uuid().nullable(),
  email_hmac: z.string().regex(/^[0-9a-f]{64}$/u),
  locale_code: z.string(),
});

/**
 * Upserts a suppression keeping the strongest reason (`complained` > `bounced` > `unsubscribed`,
 * §5.1 C). A weaker reason never overwrites a stronger one; the same or a stronger one refreshes
 * `updated_at`, which check 6 of the send compares with a later consent.
 */
export async function suppressAddress(
  executor: OrderExecutor,
  emailHmac: string,
  reason: "unsubscribed" | "bounced" | "complained",
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO email_suppression (email_hmac, scope, reason)
    VALUES (${emailHmac}, 'basket_reminder', ${reason})
    ON CONFLICT (email_hmac, scope) DO UPDATE
       SET reason = EXCLUDED.reason, updated_at = now()
     WHERE array_position(ARRAY['unsubscribed', 'bounced', 'complained'], EXCLUDED.reason)
        >= array_position(ARRAY['unsubscribed', 'bounced', 'complained'], email_suppression.reason)`);
}

export async function unsubscribeBasketReminders(input: {
  readonly token: string;
  readonly channel: "header" | "page";
  readonly now: Date;
  readonly executor: OrderExecutor;
}): Promise<boolean> {
  const parsed = ReminderTokenSchema.safeParse(input.token);
  if (!parsed.success) return false;
  const [raw] = await input.executor.execute(sql`
    SELECT id, draft_id, email_hmac, locale_code FROM basket_reminder
     WHERE unsubscribe_token_sha256 = ${reminderTokenHash(parsed.data)}
       AND email_hmac IS NOT NULL`);
  if (raw === undefined) return false;
  const row = Row.parse(raw);
  await suppressAddress(input.executor, row.email_hmac, "unsubscribed");
  await appendContactConsent(input.executor, {
    subjectHmac: row.email_hmac,
    given: false,
    locale: row.locale_code,
    channel: input.channel,
    now: input.now,
  });
  if (row.draft_id !== null) {
    await input.executor.execute(sql`
      UPDATE checkout_draft SET reminder_consent_at = NULL, reminder_consent_version = NULL
       WHERE id = ${row.draft_id}`);
  }
  return true;
}
