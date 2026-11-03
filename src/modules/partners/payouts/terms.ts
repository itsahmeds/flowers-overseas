/**
 * A florist's payout terms (spec 030a §2.1, §5.2 `savePayoutTerms`; AC-1; TASK-363): the cadence
 * after the prepaid orders, the prepaid limit and the Wise recipient id. No bank detail of any
 * kind is accepted or stored (§13 Q7).
 *
 * `PayoutTermsEditSchema` judges the form: a cadence outside `weekly`/`per_order`, a prepaid limit
 * that is not a whole number from 0 to 50, and a Wise recipient id that is not 1 to 20 digits are
 * each refused with a field code and no write. A blank recipient id clears it.
 *
 * `savePayoutTerms` runs in **one admin transaction** carrying `partner.payout_terms`, so `0016`'s
 * `audit_row_change()` writes the one audit row with the before and after values of the columns
 * that changed. It locks the partner row and compares the version the form was rendered from
 * (spec 012 §5.2 "Concurrency"), as every partner command does. The server action that calls it
 * guards with `partner.payout` (admin, finance) first; ops and content get 403 (spec 030a §5.2
 * "Permissions"; the action and its "Payout terms" block are TASK-367's page).
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  PREPAID_ORDER_LIMIT_MAX,
  PREPAID_ORDER_LIMIT_MIN,
  WISE_RECIPIENT_ID_PATTERN,
} from "@/config/payouts";
import type { DbActor } from "@/lib/db";

import {
  fulfillmentPartner,
  payoutCadences,
} from "../../../../db/schema/partners";
import { type PartnerAdminRunner, partnerAdminRunner } from "../admin/commands";
import { PartnerVersionSchema } from "../admin/schemas";

export type PayoutCadence = (typeof payoutCadences)[number];

/** Refusal codes by field. The admin catalogue holds one message per code (TASK-367). */
export const payoutTermsFieldErrors = [
  "cadence",
  "prepaidLimit",
  "wiseRecipient",
] as const;
export type PayoutTermsFieldError = (typeof payoutTermsFieldErrors)[number];
export type PayoutTermsFieldErrors = Readonly<
  Partial<Record<keyof PayoutTerms, PayoutTermsFieldError>>
>;

/** `payout_cadence`: one of the two (the migration's check). */
const CadenceSchema = z.enum(payoutCadences);

/** `prepaid_order_limit`: a whole number 0..50, typed as digits only (no sign, no decimal). */
const PrepaidLimitSchema = z
  .union([z.string().regex(/^[0-9]{1,2}$/u), z.number().int()])
  .transform(Number)
  .pipe(
    z.number().int().min(PREPAID_ORDER_LIMIT_MIN).max(PREPAID_ORDER_LIMIT_MAX),
  );

/** `wise_recipient_id`: 1 to 20 digits, or blank to clear. */
const WiseRecipientSchema = z.union([
  z.literal("").transform(() => null),
  z.null(),
  z.string().regex(WISE_RECIPIENT_ID_PATTERN),
]);

/** The terms a save writes. */
export const PayoutTermsEditSchema = z
  .object({
    cadence: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      CadenceSchema,
    ),
    prepaidOrderLimit: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      PrepaidLimitSchema,
    ),
    wiseRecipientId: z.preprocess(
      (v) => (v === undefined ? "" : typeof v === "string" ? v.trim() : v),
      WiseRecipientSchema,
    ),
  })
  .strip();
export type PayoutTerms = z.infer<typeof PayoutTermsEditSchema>;

const FIELD_CODE: Readonly<Record<keyof PayoutTerms, PayoutTermsFieldError>> = {
  cadence: "cadence",
  prepaidOrderLimit: "prepaidLimit",
  wiseRecipientId: "wiseRecipient",
};

/** The terms, or one refusal code per refused field. No typed value appears in a refusal. */
export function parsePayoutTerms(
  input: unknown,
):
  | { readonly ok: true; readonly value: PayoutTerms }
  | { readonly ok: false; readonly errors: PayoutTermsFieldErrors } {
  const parsed = PayoutTermsEditSchema.safeParse(input ?? {});
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: Partial<Record<keyof PayoutTerms, PayoutTermsFieldError>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && field in FIELD_CODE) {
      const key = field as keyof PayoutTerms;
      errors[key] = FIELD_CODE[key];
    }
  }
  if (Object.keys(errors).length === 0) errors.cadence = "cadence";
  return { ok: false, errors };
}

export type PayoutTermsResult =
  | { readonly ok: true; readonly code: string }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly errors:
        PayoutTermsFieldErrors | { readonly partnerId: "target" };
    }
  | { readonly ok: false; readonly reason: "conflict" | "not_found" };

/** The audit action of a terms save (`audit_log_action_check`). */
export const PAYOUT_TERMS_ACTION = "partner.payout_terms" as const;

/**
 * `savePayoutTerms`: parse, lock the partner and check its version, write the three columns and
 * move the version on. A refusal writes nothing and no audit row.
 */
export async function savePayoutTerms(
  actor: DbActor,
  input: unknown,
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PayoutTermsResult> {
  const terms = parsePayoutTerms(input);
  if (!terms.ok) return { ok: false, reason: "invalid", errors: terms.errors };
  const version = PartnerVersionSchema.safeParse(input);
  if (!version.success) {
    return { ok: false, reason: "invalid", errors: { partnerId: "target" } };
  }
  return run({ ...actor, action: PAYOUT_TERMS_ACTION }, async (db) => {
    const [row] = await db
      .select({
        id: fulfillmentPartner.id,
        code: fulfillmentPartner.code,
        updatedAt: fulfillmentPartner.updatedAt,
      })
      .from(fulfillmentPartner)
      .where(eq(fulfillmentPartner.id, version.data.partnerId))
      .for("update");
    if (row === undefined) return { ok: false, reason: "not_found" } as const;
    if (
      row.updatedAt.getTime() !== new Date(version.data.updatedAt).getTime()
    ) {
      return { ok: false, reason: "conflict" } as const;
    }
    await db
      .update(fulfillmentPartner)
      .set({
        payoutCadence: terms.value.cadence,
        prepaidOrderLimit: terms.value.prepaidOrderLimit,
        wiseRecipientId: terms.value.wiseRecipientId,
        updatedAt: sql`now()`,
      })
      .where(eq(fulfillmentPartner.id, row.id));
    return { ok: true, code: row.code } as const;
  });
}
