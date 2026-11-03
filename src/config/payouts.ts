/**
 * @purpose Florist payout settings: prepaid default, alert and waiver delays, the Wise batch file
 * @spec 030a
 *
 * The payouts configuration of spec 030a §5.2 ("Config"; TASK-363). No database here
 * (`pnpm check:no-db` scans `src/config`): the commands in `src/modules/partners/payouts/` read
 * these values, and a florist's own terms (cadence, prepaid limit, Wise recipient id) are data on
 * `fulfillment_partner`, edited in admin.
 *
 * - `prepaidOrderLimitDefault`: the founder's 2026-10-19 rule, "the first five orders are paid up
 *   front", as the default of a new florist's `prepaid_order_limit` (the migration's default is
 *   the same number; `tests/unit/payouts-config.test.ts` holds them together).
 * - `missingLineAlertMinutes`, `waiverListAfterMinutes`: when F3 fires, and when a delivered order
 *   without a photo is listed for a waiver (§2.7, §13 Q11).
 * - `wise`: the bulk-payment file. `sourceCurrency` is the balance we pay from (§13 Q9). `header`
 *   is the header row of Wise's "send to saved recipients" batch template, in the column order
 *   spec 030a §5.2 `wiseExportFile` fills; the founder commits the template's real header row as
 *   `tests/fixtures/wise-batch-header.csv` before the first live export (§13 Q7), and the CSV
 *   task (TASK-366) asserts this list against it.
 */
import { z } from "zod";

import { FLORIST_LANGUAGES, type FloristLanguage } from "./florists";

const WiseHeaderSchema = z
  .array(z.string().min(1).max(64))
  .min(1)
  .refine((header) => new Set(header).size === header.length, {
    message: "a Wise header names each column once",
  });

export const PayoutsConfigSchema = z
  .object({
    prepaidOrderLimitDefault: z.number().int().min(0).max(50),
    missingLineAlertMinutes: z.number().int().positive(),
    waiverListAfterMinutes: z.number().int().positive(),
    wise: z
      .object({
        sourceCurrency: z.string().regex(/^[A-Z]{3}$/u),
        header: WiseHeaderSchema,
        maxRows: z.number().int().min(1).max(1000),
      })
      .strict(),
  })
  .strict();

export type PayoutsConfig = z.infer<typeof PayoutsConfigSchema>;

/** Parsed once at module load: a malformed value fails the first import. */
export const PAYOUTS_CONFIG: PayoutsConfig = Object.freeze(
  PayoutsConfigSchema.parse({
    prepaidOrderLimitDefault: 5,
    missingLineAlertMinutes: 60,
    waiverListAfterMinutes: 120,
    wise: {
      sourceCurrency: "EUR",
      header: [
        "name",
        "recipientId",
        "sourceCurrency",
        "targetCurrency",
        "amountCurrency",
        "amount",
        "paymentReference",
      ],
      maxRows: 1000,
    },
  }),
);

/** `fulfillment_partner.prepaid_order_limit`'s bounds (the migration's check). */
export const PREPAID_ORDER_LIMIT_MIN = 0;
export const PREPAID_ORDER_LIMIT_MAX = 50;

/** `fulfillment_partner.wise_recipient_id`: 1 to 20 digits (the migration's check). */
export const WISE_RECIPIENT_ID_PATTERN = /^[0-9]{1,20}$/u;

/**
 * The statement's language when the florist has no owner member yet (spec 030a §5.2, §13 Q10:
 * "the earliest owner member's language, else the country default (`pl` for Poland)"; TASK-365).
 * Data keyed by the country's ISO code, one entry per florist language's home country; a country
 * not listed falls back to `en`, the florist surface's default. A new country is a row here, not
 * code.
 */
export const STATEMENT_LANGUAGE_BY_COUNTRY: Readonly<
  Record<string, FloristLanguage>
> = Object.freeze(
  z.record(z.string().regex(/^[A-Z]{2}$/u), z.enum(FLORIST_LANGUAGES)).parse({
    PL: "pl",
    DE: "de",
    AT: "de",
  }),
);

/** The statement language of a florist in `iso2` with no owner member. */
export function statementCountryLanguage(iso2: string): FloristLanguage {
  return STATEMENT_LANGUAGE_BY_COUNTRY[iso2] ?? "en";
}
