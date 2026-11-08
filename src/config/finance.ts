/**
 * Admin finance settings (spec 030b §5.2 `src/config/finance.ts`; AC-18, AC-20, AC-23; TASK-439,
 * TASK-440).
 *
 *  - `reportingCurrency`: every converted figure is in EUR, our settlement and accounting
 *    currency (§13 Q3);
 *  - `maxRangeDays`, `defaultRangeDays`: the range picker's cap and default (§2.5);
 *  - `rateLookbackDays`: `rateOn` takes the newest ECB row at most this many days old (§5.2);
 *  - `feesMissingAlertHours`: a live payment with no fee row this long after capture raises
 *    `alert=payments.fees_missing` (§5.2 "Jobs");
 *  - `taxQuestions`: the three questions the accountant must answer (`plan/06` §4 items 1 and 8,
 *    spec 030a §13 Q1 and Q2). While any is `open`, every finance page carries the "Accountant to
 *    confirm" banner naming it. A `confirmed` entry names its sign-off file under
 *    `docs/compliance/`, and `tests/unit/finance-config.test.ts` fails when that file is missing;
 *  - the three CSV headers, the first line of each export exactly (§5.4, AC-23). The first column
 *    is the order reference (orders), the florist code or the country, never an invoice number:
 *    these are management figures.
 *
 * No database here (`pnpm check:no-db` scans `src/config`).
 */
import { z } from "zod";

const TaxQuestionSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("open") }).strict(),
  z
    .object({
      state: z.literal("confirmed"),
      evidence: z.string().regex(/^docs\/compliance\/[A-Za-z0-9._/-]+$/),
    })
    .strict(),
]);
export type TaxQuestion = z.infer<typeof TaxQuestionSchema>;

/** The three tax questions, in the order the banner names them. */
export const taxQuestionKeys = [
  "supplyModel",
  "payoutVat",
  "selfBilling",
] as const;
export type TaxQuestionKey = (typeof taxQuestionKeys)[number];

const HeaderSchema = z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(2);

export const FinanceConfigSchema = z
  .object({
    reportingCurrency: z.literal("EUR"),
    maxRangeDays: z.number().int().positive(),
    defaultRangeDays: z.number().int().positive(),
    rateLookbackDays: z.number().int().nonnegative(),
    feesMissingAlertHours: z.number().int().positive(),
    taxQuestions: z
      .object({
        supplyModel: TaxQuestionSchema,
        payoutVat: TaxQuestionSchema,
        selfBilling: TaxQuestionSchema,
      })
      .strict(),
    csvHeaders: z
      .object({
        orders: HeaderSchema,
        florists: HeaderSchema,
        countries: HeaderSchema,
      })
      .strict(),
  })
  .strict()
  .refine((config) => config.defaultRangeDays <= config.maxRangeDays, {
    error: "defaultRangeDays must not exceed maxRangeDays",
  });
export type FinanceConfig = z.infer<typeof FinanceConfigSchema>;

/** The configuration, parsed at module load: a malformed entry fails the first import. */
export const FINANCE_CONFIG: FinanceConfig = FinanceConfigSchema.parse({
  reportingCurrency: "EUR",
  maxRangeDays: 366,
  defaultRangeDays: 30,
  rateLookbackDays: 7,
  feesMissingAlertHours: 24,
  taxQuestions: {
    supplyModel: { state: "open" },
    payoutVat: { state: "open" },
    selfBilling: { state: "open" },
  },
  csvHeaders: {
    orders: [
      "order_reference",
      "mode",
      "paid_on",
      "delivery_date",
      "country",
      "florist_code",
      "florist_city",
      "status",
      "reasons",
      "buyer_currency",
      "gross",
      "sale_rate",
      "sale_rate_date",
      "sale_rate_source",
      "reporting_currency",
      "gross_at_ecb",
      "settled",
      "fx_cost",
      "refunds",
      "vat",
      "vat_reporting",
      "vat_is_estimate",
      "net_sale",
      "florist_currency",
      "florist_cost",
      "florist_rate",
      "florist_rate_date",
      "florist_rate_source",
      "florist_cost_reporting",
      "fees",
      "disputes",
      "margin",
      "margin_percent",
    ],
    florists: [
      "florist_code",
      "florist_city",
      "reporting_currency",
      "orders",
      "orders_with_figures",
      "net_sale",
      "florist_cost",
      "fees",
      "margin",
      "margin_percent",
    ],
    countries: [
      "country",
      "reporting_currency",
      "orders",
      "orders_with_figures",
      "settled",
      "refunds",
      "vat_reporting",
      "net_sale",
      "florist_cost",
      "fees",
      "disputes",
      "margin",
      "margin_percent",
    ],
  },
});

/** The tax questions still open, in banner order. */
export function openTaxQuestions(
  config: FinanceConfig = FINANCE_CONFIG,
): readonly TaxQuestionKey[] {
  return taxQuestionKeys.filter(
    (key) => config.taxQuestions[key].state === "open",
  );
}
