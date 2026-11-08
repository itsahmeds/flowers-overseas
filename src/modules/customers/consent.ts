/**
 * The basket reminder's consent (spec 034 §5.2 "Consent at step 2", §8.2 "Proof"; AC-8; TASK-449).
 *
 * `recordBasketReminderConsent` keeps the draft's current choice and the proof of each change
 * together, in the caller's transaction: when the posted state differs from the draft's, it sets or
 * clears `reminder_consent_at` and `reminder_consent_version` and appends one `consent_log` row
 * whose subject is a `contact`, known only as `contactHmac(email)`. The address itself is never
 * written to `consent_log`, nor the IP (`source_ip_truncated` stays null, as `ropa.md` row 3
 * requires). The same state writes nothing. A changed email with the box still ticked writes a
 * withdrawal for the old hash and a grant for the new one.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { contactHmac } from "@/lib/contact-hmac";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";
import { messageSourceHash } from "@/modules/i18n";
import { CONSENT_WORDING_KEY } from "@/config/basket-reminders";

import { normaliseEmail, type SqlRunner } from "./writers";

export const BasketReminderConsentInputSchema = z
  .object({
    draftId: z.uuid(),
    given: z.boolean(),
    email: z.string().min(1),
    locale: z.string().min(2),
    wordingVersion: z.number().int().positive(),
    now: z.date(),
    /** How the choice reached us: the step 3 form, or a stop link (`header`, `page`). */
    channel: z.enum(["checkout", "header", "page"]).default("checkout"),
  })
  .strict();
export type BasketReminderConsentInput = z.input<
  typeof BasketReminderConsentInputSchema
>;

/** What changed: the rows appended, by kind. */
export interface BasketReminderConsentResult {
  readonly granted: number;
  readonly withdrawn: number;
}

const DraftConsentRow = z.object({
  consent_set: z.boolean(),
  email: z.string().nullable(),
});

async function rows(db: SqlRunner, query: ReturnType<typeof sql>) {
  const result: unknown = await db.execute(query);
  return result as readonly Record<string, unknown>[];
}

/** Appends one `contact` consent row (never the address). */
export async function appendContactConsent(
  db: SqlRunner,
  input: {
    readonly subjectHmac: string;
    readonly given: boolean;
    readonly locale: string;
    readonly channel: "checkout" | "header" | "page";
    readonly now: Date;
  },
): Promise<void> {
  const choices: Record<string, unknown> = {
    basket_reminder: input.given,
    locale: input.locale,
  };
  if (input.channel === "checkout") {
    choices["wording_key"] = CONSENT_WORDING_KEY;
    choices["wording_hash"] =
      messageSourceHash(input.locale, CONSENT_WORDING_KEY) ?? null;
  } else {
    choices["channel"] = input.channel;
  }
  await db.execute(sql`
    INSERT INTO consent_log (subject_kind, subject_hmac, choices, policy_version, occurred_at)
    VALUES ('contact', ${input.subjectHmac}, (${JSON.stringify(choices)}::text)::jsonb,
            ${CONSENT_POLICY_VERSION}, ${input.now.toISOString()}::timestamptz)`);
}

/**
 * Records the box's state for a draft (AC-8). Run it **before** the buyer is saved, in the same
 * transaction, so the previous email is still on the draft for a change of address.
 */
export async function recordBasketReminderConsent(
  db: SqlRunner,
  raw: BasketReminderConsentInput,
): Promise<BasketReminderConsentResult> {
  const input = BasketReminderConsentInputSchema.parse(raw);
  const found = await rows(
    db,
    sql`SELECT reminder_consent_at IS NOT NULL AS consent_set, buyer ->> 'email' AS email
          FROM checkout_draft WHERE id = ${input.draftId} AND purchase_id IS NULL
         FOR UPDATE`,
  );
  if (found.length === 0) return { granted: 0, withdrawn: 0 };
  const current = DraftConsentRow.parse(found[0]);
  const email = normaliseEmail(input.email);
  const previous =
    current.email === null ? null : normaliseEmail(current.email);
  const append = (address: string, given: boolean) =>
    appendContactConsent(db, {
      subjectHmac: contactHmac(address),
      given,
      locale: input.locale,
      channel: input.channel,
      now: input.now,
    });

  if (input.given) {
    if (current.consent_set && previous === email) {
      return { granted: 0, withdrawn: 0 };
    }
    let withdrawn = 0;
    if (current.consent_set && previous !== null && previous !== email) {
      await append(previous, false);
      withdrawn = 1;
    }
    await append(email, true);
    await db.execute(sql`
      UPDATE checkout_draft
         SET reminder_consent_at = ${input.now.toISOString()}::timestamptz,
             reminder_consent_version = ${input.wordingVersion}
       WHERE id = ${input.draftId}`);
    return { granted: 1, withdrawn };
  }
  if (!current.consent_set) return { granted: 0, withdrawn: 0 };
  await append(previous ?? email, false);
  await db.execute(sql`
    UPDATE checkout_draft
       SET reminder_consent_at = NULL, reminder_consent_version = NULL
     WHERE id = ${input.draftId}`);
  return { granted: 0, withdrawn: 1 };
}
