/**
 * The discounts module's zod schemas (spec 047 §5.2 "Zod schemas"; AC-2 form and schema half,
 * AC-30; TASK-445).
 *
 * `DiscountCodeInputSchema` is the admin create and edit input. It repeats every cross-field rule
 * migration `0037_discount_codes` enforces, so the form shows each one on its own field before the
 * database would refuse (AC-2): the percent range, a fixed code's currency amount, the 50 %
 * ceiling, the end after the start, the code's normalised shape. Each issue's `path` is the field.
 * The one rule a schema cannot decide, a second code with the same normalised text, is
 * `issueCode`'s look-up and the unique constraint behind it.
 *
 * `IssueCodeInputSchema` is the same plus the referral hook (`source`, `issuerRef`). Only
 * `source: 'admin'` is reachable from a screen (AC-30).
 */
import { z } from "zod";

import {
  DISCOUNT_CODE_RAW_MAX_LENGTH,
  DISCOUNT_FIXED_CEILING_DIVISOR,
  DISCOUNT_LABEL_MAX_LENGTH,
  DISCOUNT_NOTE_MAX_LENGTH,
  DISCOUNT_PERCENT_MAX_BP,
  DISCOUNT_PERCENT_MIN_BP,
} from "@/config/discounts";
import { type CurrencyCode, isCurrencyCode } from "@/config/currencies";

import { normaliseCode } from "./normalise";

/** `discount_code.kind`. */
export const DISCOUNT_KINDS = ["percent", "fixed"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** `discount_code.status`, the stored half (scheduled, ended and used up are computed). */
export const DISCOUNT_STORED_STATUSES = ["active", "disabled"] as const;
export type DiscountStoredStatus = (typeof DISCOUNT_STORED_STATUSES)[number];

/** `discount_code.source`: the referral hook (§2). */
export const DISCOUNT_SOURCES = ["admin", "referral"] as const;
export type DiscountSource = (typeof DISCOUNT_SOURCES)[number];

/** `order_discount.mode`, the order's mode. */
export const DISCOUNT_MODES = ["demo", "test", "live"] as const;
export type DiscountMode = (typeof DISCOUNT_MODES)[number];

/**
 * Why a code is refused, in the order `evaluateCode` checks them after `locked` (§5.2):
 * `unknown` also covers a disabled code, so the field cannot tell which codes exist.
 */
export const DISCOUNT_REFUSAL_REASONS = [
  "unknown",
  "not_started",
  "ended",
  "wrong_destination",
  "wrong_product",
  "wrong_currency",
  "below_minimum",
  "used_up",
  "already_used_by_you",
  "locked",
] as const;
export type DiscountRefusalReason = (typeof DISCOUNT_REFUSAL_REASONS)[number];

/** The field-level error codes the admin form renders (`admin.discounts.error.*`). */
export const DISCOUNT_FIELD_ERRORS = [
  "required",
  "codeShape",
  "codeTaken",
  "labelLength",
  "percentRange",
  "percentHasAmount",
  "fixedNeedsAmount",
  "amountAboveCeiling",
  "currencyUnknown",
  "currencyTwice",
  "minorUnits",
  "endsBeforeStart",
  "instant",
  "capPositive",
  "noteLength",
  "offerFrozen",
] as const;
export type DiscountFieldError = (typeof DISCOUNT_FIELD_ERRORS)[number];

/** An integer amount of minor units a JavaScript number holds exactly. */
const MinorUnits = z
  .number({ error: "minorUnits" satisfies DiscountFieldError })
  .int({ error: "minorUnits" satisfies DiscountFieldError })
  .nonnegative({ error: "minorUnits" satisfies DiscountFieldError })
  .max(Number.MAX_SAFE_INTEGER, {
    error: "minorUnits" satisfies DiscountFieldError,
  });

const Currency = z
  .string()
  .refine((code): code is CurrencyCode => isCurrencyCode(code), {
    error: "currencyUnknown" satisfies DiscountFieldError,
  });

/** An instant with its zone or offset, as `<input type=datetime-local>` plus the zone becomes. */
const Instant = z.iso.datetime({
  offset: true,
  error: "instant" satisfies DiscountFieldError,
});

const PositiveCap = z
  .number()
  .int({ error: "capPositive" satisfies DiscountFieldError })
  .positive({ error: "capPositive" satisfies DiscountFieldError })
  .max(2_147_483_647, { error: "capPositive" satisfies DiscountFieldError });

export const DiscountCurrencyInputSchema = z
  .object({
    currency: Currency,
    amountOffMinor: MinorUnits.positive({
      error: "minorUnits" satisfies DiscountFieldError,
    }).optional(),
    minOrderMinor: MinorUnits,
  })
  .strict();
export type DiscountCurrencyInput = z.infer<typeof DiscountCurrencyInputSchema>;

const discountCodeFields = {
  code: z
    .string({ error: "required" satisfies DiscountFieldError })
    .max(DISCOUNT_CODE_RAW_MAX_LENGTH, {
      error: "codeShape" satisfies DiscountFieldError,
    }),
  campaignLabel: z
    .string({ error: "required" satisfies DiscountFieldError })
    .trim()
    .min(1, { error: "labelLength" satisfies DiscountFieldError })
    .max(DISCOUNT_LABEL_MAX_LENGTH, {
      error: "labelLength" satisfies DiscountFieldError,
    }),
  kind: z.enum(DISCOUNT_KINDS, {
    error: "required" satisfies DiscountFieldError,
  }),
  percentBp: z
    .number()
    .int({ error: "percentRange" satisfies DiscountFieldError })
    .optional(),
  currencies: z.array(DiscountCurrencyInputSchema),
  startsAt: Instant,
  endsAt: Instant.optional(),
  /** Absent or null: no total cap. */
  maxRedemptions: PositiveCap.nullable().optional(),
  /** Absent: the default of one use per buyer email (§13 Q4); null: no per-email cap. */
  maxPerEmail: PositiveCap.nullable().optional(),
  countryIds: z.array(z.uuid()),
  productIds: z.array(z.uuid()),
  note: z
    .string()
    .trim()
    .max(DISCOUNT_NOTE_MAX_LENGTH, {
      error: "noteLength" satisfies DiscountFieldError,
    })
    .optional(),
};

type DiscountCodeFields = z.infer<z.ZodObject<typeof discountCodeFields>>;

/** The cross-field rules of §5.1, each on its own field (AC-2). */
function crossFieldRules(
  value: DiscountCodeFields,
  context: z.RefinementCtx,
): void {
  const issue = (path: (string | number)[], message: DiscountFieldError) => {
    context.addIssue({ code: "custom", path, message });
  };
  if (normaliseCode(value.code) === null) issue(["code"], "codeShape");
  if (value.kind === "percent") {
    if (
      value.percentBp === undefined ||
      value.percentBp < DISCOUNT_PERCENT_MIN_BP ||
      value.percentBp > DISCOUNT_PERCENT_MAX_BP
    ) {
      issue(["percentBp"], "percentRange");
    }
    value.currencies.forEach((row, index) => {
      if (row.amountOffMinor !== undefined) {
        issue(["currencies", index, "amountOffMinor"], "percentHasAmount");
      }
    });
  } else {
    if (value.percentBp !== undefined) issue(["percentBp"], "percentRange");
    if (!value.currencies.some((row) => row.amountOffMinor !== undefined)) {
      issue(["currencies"], "fixedNeedsAmount");
    }
  }
  value.currencies.forEach((row, index) => {
    if (
      row.amountOffMinor !== undefined &&
      row.amountOffMinor * DISCOUNT_FIXED_CEILING_DIVISOR > row.minOrderMinor
    ) {
      issue(["currencies", index, "amountOffMinor"], "amountAboveCeiling");
    }
    if (
      value.currencies.findIndex((other) => other.currency === row.currency) <
      index
    ) {
      issue(["currencies", index, "currency"], "currencyTwice");
    }
  });
  if (
    value.endsAt !== undefined &&
    Date.parse(value.endsAt) <= Date.parse(value.startsAt)
  ) {
    issue(["endsAt"], "endsBeforeStart");
  }
}

/** Admin create and edit (spec 047 §5.2). */
export const DiscountCodeInputSchema = z
  .object(discountCodeFields)
  .strict()
  .superRefine(crossFieldRules);
export type DiscountCodeInput = z.infer<typeof DiscountCodeInputSchema>;

/** `issueCode`'s input: the admin input plus the referral hook (AC-30). */
export const IssueCodeInputSchema = z
  .object({
    ...discountCodeFields,
    source: z.enum(DISCOUNT_SOURCES),
    issuerRef: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine(crossFieldRules);
export type IssueCodeInput = z.infer<typeof IssueCodeInputSchema>;

/** Step 4's form body (TASK-447): the raw typed value, normalised by the action. */
export const ApplyDiscountSchema = z
  .object({ code: z.string().min(1).max(DISCOUNT_CODE_RAW_MAX_LENGTH) })
  .strict();
export const RemoveDiscountSchema = z.object({}).strict();

/** The `order_discount` row as a type (spec 047 §5.1). */
export const OrderDiscountSchema = z
  .object({
    orderId: z.uuid(),
    discountCodeId: z.uuid(),
    codeSnapshot: z.string().regex(/^[A-Z0-9]{6,32}$/u),
    kind: z.enum(DISCOUNT_KINDS),
    percentBp: z.number().int().nullable(),
    amountMinor: z.number().int().positive(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/u),
    baseAmountMinor: z.number().int().positive(),
    baseCurrencyCode: z.string().regex(/^[A-Z]{3}$/u),
    emailKeySha256: z.string().regex(/^[0-9a-f]{64}$/u),
    mode: z.enum(DISCOUNT_MODES),
  })
  .strict();
export type OrderDiscount = z.infer<typeof OrderDiscountSchema>;

/** One row of spec 030b's finance view (spec 047 §5.2 "Read models"). */
export const DiscountFinanceRowSchema = z
  .object({
    orderId: z.uuid(),
    reference: z.string(),
    placedAt: z.date(),
    mode: z.enum(DISCOUNT_MODES),
    codeId: z.uuid(),
    campaignLabel: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    grossBeforeMinor: z.number().int().nonnegative(),
    discountMinor: z.number().int().positive(),
    chargedMinor: z.number().int().nonnegative(),
    vatMinor: z.number().int().nonnegative(),
    /** Null until a florist is assigned: no estimate is invented (§5.2). */
    payoutMinorInBase: z.number().int().nonnegative().nullable(),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/u),
    grossBeforeBaseMinor: z.number().int().nonnegative(),
    discountBaseMinor: z.number().int().positive(),
    chargedBaseMinor: z.number().int().nonnegative(),
    marginAfterBaseMinor: z.number().int().nullable(),
  })
  .strict();
export type DiscountFinanceRow = z.infer<typeof DiscountFinanceRowSchema>;

/** `discountFinanceRows`' filter. */
export const DiscountFinanceFilterSchema = z
  .object({
    from: z.date(),
    to: z.date(),
    codeId: z.uuid().optional(),
    countryIso: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .optional(),
    mode: z.enum(DISCOUNT_MODES).optional(),
  })
  .strict();
export type DiscountFinanceFilter = z.infer<typeof DiscountFinanceFilterSchema>;
