/**
 * @purpose The payouts pages' outcome in the query string: codes, ids and counts only (030a §8)
 * @spec 030a
 *
 * An action redirects back with `done` (what happened) or `refused` (a refusal code), `open` (the
 * dialog to re-open after a refused submission) and `err` (the refused fields by name). Extra
 * facts a message needs are a statement number (`n`), a florist code (`florist`), florist codes
 * (`codes`, for `PAYOUT_WISE_RECIPIENT_MISSING`) and a count. Each is parsed with a strict
 * pattern, so a hand-made URL renders nothing it did not earn, and no typed value (a note, a
 * reason, an amount) ever travels in it.
 */
import { z } from "zod";

import { PAYOUT_ERROR_CODES } from "@/modules/partners/payouts";

export const PAYOUTS_PATH = "/admin/payouts";

/** The dialogs a refusal re-opens: per adjustment, per order, or the add-line dialog. */
export type PayoutsDialog =
  | `settle-${string}`
  | `waive-${string}`
  | `waiver-${string}`
  | "add-line"
  | "mark-all"
  | "cancel-export";

export const PAYOUT_DONE = [
  "sent",
  "created",
  "settled",
  "waived",
  "accrued",
  "lineAdded",
  "lineRemoved",
  "reviewed",
  "paid",
  "exportPaid",
  "cancelled",
] as const;
export type PayoutDone = (typeof PAYOUT_DONE)[number];

const FLORIST_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const PAYOUT_FORM_FIELDS = [
  "amountMinor",
  "note",
  "reason",
  "kind",
  "orderId",
  "goodwill",
] as const;
export type PayoutFormField = (typeof PAYOUT_FORM_FIELDS)[number];

export const PayoutOutcomeSchema = z.object({
  done: z.enum(PAYOUT_DONE).optional().catch(undefined),
  refused: z
    .enum([...PAYOUT_ERROR_CODES, "invalid"])
    .optional()
    .catch(undefined),
  open: z
    .string()
    .regex(
      new RegExp(
        `^(?:(?:settle|waive|waiver)-${UUID}|add-line|mark-all|cancel-export)$`,
        "u",
      ),
    )
    .optional()
    .catch(undefined),
  err: z
    .string()
    .max(120)
    .transform((value) =>
      value
        .split(",")
        .filter((field): field is PayoutFormField =>
          (PAYOUT_FORM_FIELDS as readonly string[]).includes(field),
        ),
    )
    .optional()
    .catch(undefined),
  n: z
    .string()
    .regex(/^P-[0-9]{6}$/u)
    .optional()
    .catch(undefined),
  florist: z.string().max(60).regex(FLORIST_CODE).optional().catch(undefined),
  codes: z
    .string()
    .max(600)
    .transform((value) => value.split(","))
    .pipe(z.array(z.string().max(60).regex(FLORIST_CODE)).min(1).max(10))
    .optional()
    .catch(undefined),
  count: z.coerce.number().int().min(0).max(1000).optional().catch(undefined),
});
export type PayoutOutcome = z.infer<typeof PayoutOutcomeSchema>;

/** Parses a page's search parameters (first values only); never throws. */
export function parsePayoutOutcome(
  params: Record<string, string | string[] | undefined>,
): PayoutOutcome {
  const first: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (typeof one === "string" && one !== "") first[key] = one;
  }
  return PayoutOutcomeSchema.parse(first);
}

/** `page` with the outcome's parameters. */
export function outcomeHref(
  page: string,
  params: Readonly<Record<string, string>>,
): string {
  const query = new URLSearchParams(params).toString();
  return query === "" ? page : `${page}?${query}`;
}
