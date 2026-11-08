/**
 * `restoreBasket` (spec 034 §2 "The link back", §5.2 "Restore", §13 Q4; AC-15 to AC-18;
 * TASK-451), in the caller's transaction:
 *
 *  - no reminder with that hash, the link expired, the source draft deleted or placed: `ended`,
 *    the same answer in every case, and nothing written;
 *  - the browser's `fo_checkout` names the unplaced source draft: `pending_notice 'restored'`,
 *    `first_restored_at` if null, `restore_count + 1`; nothing else changes;
 *  - the browser's cookie names an unplaced draft already restored from this reminder: nothing
 *    written (a second click makes no second basket);
 *  - otherwise a new draft with **only the bouquets**: each line's destination, product, tier,
 *    date, add-ons and last-seen amount (no recipient, card, quote or order), the source's
 *    currency, the request's locale, no buyer and no consent, `restored_from_reminder_id` set and
 *    `pending_notice 'restored_details'`. A mistyped address therefore never shows a stranger who
 *    the flowers were for.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { OrderExecutor } from "@/modules/orders";

import { draftTokenHash, isDraftToken, newDraftToken } from "../cookie";
import { draftExpiryAt } from "../draft";
import { ReminderTokenSchema, reminderTokenHash } from "./tokens";

export type RestoreOutcome =
  | { readonly kind: "ended" }
  | { readonly kind: "same"; readonly lineCount: number }
  | {
      readonly kind: "new";
      readonly token: string;
      readonly lineCount: number;
    };

const ReminderRow = z.object({
  id: z.uuid(),
  draft_id: z.uuid().nullable(),
  expires_ms: z.coerce.number(),
});

const DraftRow = z.object({
  id: z.uuid(),
  purchase_id: z.uuid().nullable(),
  mode: z.string(),
  currency_code: z.string().nullable(),
  restored_from_reminder_id: z.uuid().nullable(),
  line_count: z.coerce.number().int(),
});

async function draftByToken(
  executor: OrderExecutor,
  cookieToken: string | null,
) {
  if (!isDraftToken(cookieToken)) return null;
  const [raw] = await executor.execute(sql`
    SELECT d.id, d.purchase_id, d.mode, d.currency_code, d.restored_from_reminder_id,
           (SELECT count(*) FROM checkout_draft_line l WHERE l.draft_id = d.id) AS line_count
      FROM checkout_draft d WHERE d.token_sha256 = ${draftTokenHash(cookieToken)}`);
  return raw === undefined ? null : DraftRow.parse(raw);
}

export async function restoreBasket(input: {
  readonly token: string;
  readonly locale: string;
  readonly cookieToken: string | null;
  readonly now: Date;
  readonly executor: OrderExecutor;
}): Promise<RestoreOutcome> {
  const { executor, now } = input;
  const parsed = ReminderTokenSchema.safeParse(input.token);
  if (!parsed.success) return { kind: "ended" };
  const [rawReminder] = await executor.execute(sql`
    SELECT id, draft_id, (extract(epoch FROM restore_expires_at) * 1000)::bigint AS expires_ms
      FROM basket_reminder WHERE restore_token_sha256 = ${reminderTokenHash(parsed.data)}
       FOR UPDATE`);
  if (rawReminder === undefined) return { kind: "ended" };
  const reminder = ReminderRow.parse(rawReminder);
  if (now.getTime() > reminder.expires_ms || reminder.draft_id === null) {
    return { kind: "ended" };
  }
  const [rawSource] = await executor.execute(sql`
    SELECT d.id, d.purchase_id, d.mode, d.currency_code, d.restored_from_reminder_id,
           (SELECT count(*) FROM checkout_draft_line l WHERE l.draft_id = d.id) AS line_count
      FROM checkout_draft d WHERE d.id = ${reminder.draft_id} FOR UPDATE`);
  if (rawSource === undefined) return { kind: "ended" };
  const source = DraftRow.parse(rawSource);
  if (source.purchase_id !== null) return { kind: "ended" };

  const count = async () => {
    await executor.execute(sql`
      UPDATE basket_reminder
         SET restore_count = restore_count + 1,
             first_restored_at = COALESCE(first_restored_at, ${now.toISOString()}::timestamptz)
       WHERE id = ${reminder.id}`);
  };

  const current = await draftByToken(executor, input.cookieToken);
  if (current !== null && current.purchase_id === null) {
    if (current.id === source.id) {
      await executor.execute(sql`
        UPDATE checkout_draft SET pending_notice = 'restored' WHERE id = ${source.id}`);
      await count();
      return { kind: "same", lineCount: current.line_count };
    }
    if (current.restored_from_reminder_id === reminder.id) {
      return { kind: "same", lineCount: current.line_count };
    }
  }

  const token = newDraftToken();
  const [created] = await executor.execute(sql`
    INSERT INTO checkout_draft (token_sha256, locale_code, mode, currency_code, pending_notice,
                                restored_from_reminder_id, last_activity_at, expires_at)
    VALUES (${draftTokenHash(token)}, ${input.locale}, ${source.mode}, ${source.currency_code},
            'restored_details', ${reminder.id}, ${now.toISOString()}::timestamptz,
            ${draftExpiryAt(now).toISOString()}::timestamptz)
    RETURNING id`);
  const draftId = z.object({ id: z.uuid() }).parse(created).id;
  await executor.execute(sql`
    INSERT INTO checkout_draft_line (draft_id, position, destination_country_id, product_id,
                                     tier_key, delivery_date, addon_keys, last_seen_total_minor,
                                     last_seen_currency_code)
    SELECT ${draftId}, row_number() OVER (ORDER BY l.position), l.destination_country_id,
           l.product_id, l.tier_key, l.delivery_date, l.addon_keys, l.last_seen_total_minor,
           l.last_seen_currency_code
      FROM checkout_draft_line l WHERE l.draft_id = ${source.id}`);
  await count();
  return { kind: "new", token, lineCount: source.line_count };
}
