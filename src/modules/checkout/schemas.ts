/**
 * The checkout's boundary schemas (spec 010 §5.2 "Zod schemas", §7, §8, AC-8, AC-9, AC-10,
 * AC-12, AC-18; TASK-200).
 *
 * Every value a buyer or a product page posts into the checkout is parsed here before anything
 * reads it (`plan/12` §2). Four rules shape them:
 *
 *  1. **Strict.** Every object is `.strict()`, so a field the spec does not name is a parse
 *     error rather than a silently stored value. That is how three prohibitions become
 *     unexpressible instead of reviewed: there is no recipient email (`plan/07` §1.3), no
 *     marketing or WhatsApp opt-in (§13 Q7), and no field for a default-selected add-on
 *     (CRD Art. 22). Nor is there a currency a buyer could post: the checkout's currency is the
 *     product page's (AC-18), compared by the server, never chosen by the form.
 *  2. **Graphemes, NFC.** Free text is normalised to NFC, trimmed, and limited in graphemes
 *     through `countGraphemes()` (§13 Q9, AC-10), so "ł", "Ж" and a family emoji count one each.
 *  3. **The destination decides the form.** `RecipientStepSchema(countryIso, locale)` is built
 *     from `addressFormModel()`, so the fields, their order, which are required and the postcode
 *     rule are the destination's row in `src/config/address-formats.ts` (AC-8), and the phone is
 *     parsed against the destination's numbering plan (AC-9).
 *  4. **Errors are message keys.** Every issue a buyer can cause carries a `checkout.error.*`
 *     key as its message (and its arguments in `params`), never copy, so the error summary of
 *     TASK-204 translates what it is given and a raw value never reaches a message.
 */
import { z } from "zod";

import { isCountryIso2 } from "@/config/countries";
import { SkuSchema } from "@/config/catalogue/schemas";
import {
  CHECKOUT_LIMITS,
  CHECKOUT_MAX_CODE_UNITS_PER_GRAPHEME,
  CHECKOUT_SHORT_FIELD_MAX_CODE_UNITS,
  PLACE_KINDS,
  type PlaceKind,
} from "@/config/checkout";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { MoneySchema, countGraphemes } from "@/modules/i18n";

import { type AddressFormModel, addressFormModel } from "./address";
import {
  type PhoneRejection,
  hasNumberingPlan,
  parseBuyerPhone,
  parseRecipientPhone,
} from "./phone";

/* -------------------------------------------------------------------------- */
/* Error keys                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The message key of every issue a buyer can cause. `tooLong` takes `{max}`; `postcodeFormat`
 * takes `{example}`, the destination format's example postcode.
 */
export const CHECKOUT_ERROR_KEYS = {
  required: "checkout.error.required",
  tooLong: "checkout.error.tooLong",
  postcodeFormat: "checkout.error.postcodeFormat",
  phoneInvalid: "checkout.error.phoneInvalid",
  emailInvalid: "checkout.error.emailInvalid",
  dateInvalid: "checkout.error.dateInvalid",
  placeKindInvalid: "checkout.error.placeKindInvalid",
  addonUnavailable: "checkout.error.addonUnavailable",
  countryInvalid: "checkout.error.countryInvalid",
  invalidCharacters: "checkout.error.invalidCharacters",
} as const;

/** The warning a valid non-local recipient phone shows (`plan/03` §8); takes `{country}`. */
export const PHONE_NON_LOCAL_KEY = "checkout.recipient.phoneNonLocal";

/** The message key a phone rejection maps to: an empty required phone is "required". */
const PHONE_REJECTION_KEYS: Readonly<Record<PhoneRejection, string>> = {
  empty: CHECKOUT_ERROR_KEYS.required,
  notANumber: CHECKOUT_ERROR_KEYS.phoneInvalid,
  invalid: CHECKOUT_ERROR_KEYS.phoneInvalid,
};

/* -------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * C0 and C1 controls (`\p{Cc}`, U+0000 included) and lone surrogates (`\p{Cs}`). Refused in every
 * free-text field: Postgres `text` cannot store U+0000, so it would turn into a 500 at the write
 * instead of a field error, and an escape sequence has no business on a printed card. The card
 * message and the delivery note may still carry a line break.
 */
const CONTROL_CHARACTER = /[\p{Cc}\p{Cs}]/u;
const CONTROL_CHARACTER_EXCEPT_LINE_BREAK = /(?![\n\r])[\p{Cc}\p{Cs}]/u;

/** Format characters (`\p{Cf}`: zero-width space, joiners, direction marks) and whitespace. */
const INVISIBLE = /[\p{Cf}\s]/gu;

/** A value with nothing visible in it is blank: a card of only U+200B is no card (§2). */
function isBlank(value: string): boolean {
  return value.replace(INVISIBLE, "") === "";
}

/** The issue a too-long raw value raises, before anything else reads it. */
interface Overflow {
  readonly maxCodeUnits: number;
  readonly message: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * A form posts strings; an absent optional field is the empty string. The raw value is bounded in
 * UTF-16 code units **before** it is normalised or counted (`/break 201` hole 3): a grapheme limit
 * alone admits a 200-grapheme card of a megabyte of combining marks, or one "grapheme" of a
 * 60 000-unit joiner chain.
 */
function formString(overflow: Overflow) {
  return z
    .string({ error: CHECKOUT_ERROR_KEYS.required })
    .optional()
    .transform((raw, ctx) => {
      const value = raw ?? "";
      if (value.length > overflow.maxCodeUnits) {
        ctx.addIssue({
          code: "custom",
          message: overflow.message,
          ...(overflow.params === undefined ? {} : { params: overflow.params }),
        });
        return z.NEVER;
      }
      return value.normalize("NFC").trim();
    });
}

/** A short, machine-shaped field (a phone, a postcode, a country code), bounded at 64 units. */
function shortField(
  message: string,
  params?: Readonly<Record<string, unknown>>,
) {
  return formString({
    maxCodeUnits: CHECKOUT_SHORT_FIELD_MAX_CODE_UNITS,
    message,
    ...(params === undefined ? {} : { params }),
  });
}

/**
 * Free text: at most `max × CHECKOUT_MAX_CODE_UNITS_PER_GRAPHEME` code units raw, then NFC and
 * trimmed, no control character (a line break allowed when `multiline`), blank when nothing
 * visible is left, non-empty when `required`, and at most `max` graphemes. The empty string is
 * the value of a blank optional field ("blank means no card", §2).
 */
function textField(options: {
  readonly required: boolean;
  readonly max: number;
  readonly locale: LocaleCode;
  readonly multiline?: boolean;
}) {
  const tooLong = {
    message: CHECKOUT_ERROR_KEYS.tooLong,
    params: { max: options.max },
  } as const;
  const control =
    options.multiline === true
      ? CONTROL_CHARACTER_EXCEPT_LINE_BREAK
      : CONTROL_CHARACTER;
  return formString({
    maxCodeUnits: options.max * CHECKOUT_MAX_CODE_UNITS_PER_GRAPHEME,
    ...tooLong,
  }).transform((value, ctx) => {
    if (control.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: CHECKOUT_ERROR_KEYS.invalidCharacters,
      });
      return z.NEVER;
    }
    if (isBlank(value)) {
      if (options.required) {
        ctx.addIssue({ code: "custom", message: CHECKOUT_ERROR_KEYS.required });
        return z.NEVER;
      }
      return "";
    }
    if (countGraphemes(value, options.locale) > options.max) {
      ctx.addIssue({ code: "custom", ...tooLong });
      return z.NEVER;
    }
    return value;
  });
}

/** RFC 5321's path limit, which is also the longest address a mail server accepts. */
const EMAIL_MAX_CODE_UNITS = 254;

const LocaleSchema = z.custom<LocaleCode>(
  (value) => typeof value === "string" && isLocaleCode(value),
  { error: "must be a locale configured in src/config/locales.ts" },
);

/** A configured currency: spec 003's money schema owns the list. */
const CurrencySchema = MoneySchema.shape.currency;

/** Integer minor units, from a number or from the decimal-digit string a form posts. */
const MinorUnitsInputSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z
    .string()
    .regex(/^\d{1,15}$/u, "must be integer minor units")
    .transform(Number),
]);

const IsoDateInputSchema = z.iso.date({
  error: CHECKOUT_ERROR_KEYS.dateInvalid,
});

/* -------------------------------------------------------------------------- */
/* The product page's post: CheckoutStartSchema                                */
/* -------------------------------------------------------------------------- */

/**
 * `POST /api/checkout/start`'s body (spec 010 §5.2, AC-6): the selection the product page posted,
 * with the total and currency it **displayed**, so the server can compare its own total and open
 * step 1 with the price-changed notice when they differ (§2 "Money"). Nothing personal.
 */
export const CheckoutStartSchema = z
  .object({
    locale: LocaleSchema,
    countryIso: z
      .string()
      .refine(
        isCountryIso2,
        "must be a destination in src/config/countries.ts",
      ),
    sku: SkuSchema,
    tierKey: z.string().min(1).max(64),
    date: z.iso.date().optional(),
    expectedTotalMinor: MinorUnitsInputSchema,
    expectedCurrency: CurrencySchema,
  })
  .strict();
export type CheckoutStart = z.infer<typeof CheckoutStartSchema>;

/* -------------------------------------------------------------------------- */
/* Step 1: RecipientStepSchema                                                 */
/* -------------------------------------------------------------------------- */

/** Step 1's parsed value. The phone is stored in E.164; the address keeps the format's fields. */
export interface RecipientStep {
  readonly deliveryDate: string;
  readonly fullName: string;
  readonly phone: {
    readonly e164: string;
    readonly national: string;
    readonly nonLocal: boolean;
  };
  /** The destination format's fields other than `fullName` and `phone`, blank ones omitted. */
  readonly address: Readonly<Record<string, string>>;
  readonly placeKind: PlaceKind;
  readonly deliveryNote: string;
}

/**
 * Step 1, "Who are the flowers for?" (spec 010 §2, §5.2, AC-8, AC-9).
 *
 * Built per destination from `addressFormModel(countryIso)`: the format's fields with their
 * required set and limits, the postcode normalised then matched (a failure carries the format's
 * example postcode for the fix-it message), the recipient phone parsed against the destination's
 * plan, the place kind from spec 002's list and a delivery note of at most 120 graphemes.
 *
 * Throws for a destination with only the generic format: it is `closed` (AC-8) and has no form.
 */
export function RecipientStepSchema(countryIso: string, locale: LocaleCode) {
  const model = addressFormModel(countryIso);
  if (model.status === "closed") {
    throw new Error(
      `${countryIso} has only the generic address format, so its checkout is closed and it has no recipient form (spec 010 AC-8)`,
    );
  }
  return recipientStepSchemaFor(model, locale);
}

/**
 * Step 1's schema for a given form model. Not on the barrel: `RecipientStepSchema()` is the
 * caller's entry point, and this exists so a test can hand it a model that lacks a field.
 *
 * **The recipient's full name and phone are fixed fields, whatever the format row says**
 * (`/review 201` change 2): `plan/03` §8 requires the phone for every country because florists
 * call ahead, so a format row that forgot `phone` cannot produce a form without one. The
 * format's other fields are the address.
 */
export function recipientStepSchemaFor(
  model: AddressFormModel,
  locale: LocaleCode,
) {
  const addressShape: Record<string, z.ZodType<string, unknown>> = {};
  for (const field of model.fields) {
    if (field.field === "fullName" || field.field === "phone") continue;
    addressShape[field.field] =
      field.field === "postcode"
        ? postcodeField(model, field.required)
        : textField({
            required: field.required,
            max: field.maxGraphemes ?? CHECKOUT_LIMITS.addressLine,
            locale,
          });
  }

  return z
    .object({
      ...addressShape,
      deliveryDate: IsoDateInputSchema,
      fullName: textField({
        required: true,
        max: CHECKOUT_LIMITS.fullName,
        locale,
      }),
      phone: recipientPhoneField(model.countryIso),
      placeKind: z.enum(PLACE_KINDS, {
        error: CHECKOUT_ERROR_KEYS.placeKindInvalid,
      }),
      deliveryNote: textField({
        required: false,
        max: CHECKOUT_LIMITS.deliveryNote,
        locale,
        multiline: true,
      }),
    })
    .strict()
    .transform((values): RecipientStep => {
      const posted: Readonly<Record<string, unknown>> = values;
      const address: Record<string, string> = {};
      for (const field of Object.keys(addressShape)) {
        const value = posted[field];
        if (typeof value === "string" && value !== "") address[field] = value;
      }
      return {
        deliveryDate: values.deliveryDate,
        fullName: values.fullName,
        phone: values.phone,
        address,
        placeKind: values.placeKind,
        deliveryNote: values.deliveryNote,
      };
    });
}

/** The recipient phone, parsed against the destination's numbering plan (AC-9). */
function recipientPhoneField(countryIso: string) {
  return shortField(CHECKOUT_ERROR_KEYS.phoneInvalid).transform(
    (value, ctx) => {
      const result = parseRecipientPhone(value, countryIso);
      if (!result.ok) {
        ctx.addIssue({
          code: "custom",
          message: PHONE_REJECTION_KEYS[result.reason],
        });
        return z.NEVER;
      }
      return {
        e164: result.e164,
        national: result.national,
        nonLocal: result.nonLocal,
      };
    },
  );
}

/** The postcode, normalised then matched; a failure carries the format's example (AC-8). */
function postcodeField(model: AddressFormModel, required: boolean) {
  const params = { example: model.example.postcode } as const;
  return shortField(CHECKOUT_ERROR_KEYS.postcodeFormat, params).transform(
    (value, ctx) => {
      if (value === "" && !required) return value;
      const result = model.checkPostcode(value);
      if (!result.ok) {
        ctx.addIssue(
          result.reason === "empty"
            ? { code: "custom", message: CHECKOUT_ERROR_KEYS.required }
            : {
                code: "custom",
                message: CHECKOUT_ERROR_KEYS.postcodeFormat,
                params,
              },
        );
        return z.NEVER;
      }
      return result.value;
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2: CardAndBuyerStepSchema                                              */
/* -------------------------------------------------------------------------- */

/**
 * Step 2, "Your card and your details" (spec 010 §2, §5.2, AC-10, AC-11, AC-12).
 *
 * The card message (at most 200 graphemes; blank means no card), "sign as" (at most 40), the
 * add-ons the buyer ticked (only those on offer for the destination, each once; none is ever
 * pre-selected because there is no field that could say so), the buyer's email, full name and
 * optional phone (any country, read in the plan of the country of residence when typed without
 * a country code) and the country of residence (any country with a numbering plan; never used in
 * a price, EU 2018/302).
 *
 * @param context.offeredAddonKeys the add-ons with an active price for the destination
 *   (`listAddons()`), which TASK-205 passes; an add-on outside it is refused.
 */
export function CardAndBuyerStepSchema(context: {
  readonly locale: LocaleCode;
  readonly offeredAddonKeys: readonly string[];
}) {
  const offered = new Set(context.offeredAddonKeys);
  return z
    .object({
      cardMessage: textField({
        required: false,
        max: CHECKOUT_LIMITS.cardMessage,
        locale: context.locale,
        multiline: true,
      }),
      signAs: textField({
        required: false,
        max: CHECKOUT_LIMITS.signAs,
        locale: context.locale,
      }),
      addonKeys: z
        .array(z.string())
        .optional()
        .transform((keys, ctx) => {
          const list = keys ?? [];
          if (
            list.some((key) => !offered.has(key)) ||
            new Set(list).size !== list.length
          ) {
            ctx.addIssue({
              code: "custom",
              message: CHECKOUT_ERROR_KEYS.addonUnavailable,
            });
            return z.NEVER;
          }
          return list;
        }),
      email: formString({
        maxCodeUnits: EMAIL_MAX_CODE_UNITS,
        message: CHECKOUT_ERROR_KEYS.emailInvalid,
      }).pipe(
        z
          .string()
          .min(1, CHECKOUT_ERROR_KEYS.required)
          .max(EMAIL_MAX_CODE_UNITS, CHECKOUT_ERROR_KEYS.emailInvalid)
          .pipe(z.email({ error: CHECKOUT_ERROR_KEYS.emailInvalid })),
      ),
      buyerName: textField({
        required: true,
        max: CHECKOUT_LIMITS.fullName,
        locale: context.locale,
      }),
      buyerPhone: shortField(CHECKOUT_ERROR_KEYS.phoneInvalid),
      residenceCountry: shortField(CHECKOUT_ERROR_KEYS.countryInvalid).refine(
        (value) => /^[A-Z]{2}$/u.test(value) && hasNumberingPlan(value),
        CHECKOUT_ERROR_KEYS.countryInvalid,
      ),
    })
    .strict()
    .transform((values, ctx) => {
      if (values.buyerPhone === "") {
        return { ...values, buyerPhone: null };
      }
      const phone = parseBuyerPhone(values.buyerPhone, values.residenceCountry);
      if (!phone.ok) {
        ctx.addIssue({
          code: "custom",
          path: ["buyerPhone"],
          message: PHONE_REJECTION_KEYS[phone.reason],
        });
        return z.NEVER;
      }
      return { ...values, buyerPhone: phone.e164 };
    });
}

/* -------------------------------------------------------------------------- */
/* Step 3: ReviewStepSchema                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Step 3's post (spec 010 §5.2, AC-17): the total, currency and quote digest the buyer saw on the
 * review. The server compares all three with the draft's current quote before placing; no order
 * is written at an amount other than `confirmedTotalMinor`.
 */
export const ReviewStepSchema = z
  .object({
    confirmedTotalMinor: MinorUnitsInputSchema,
    confirmedCurrency: CurrencySchema,
    quoteDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();
export type ReviewStep = z.infer<typeof ReviewStepSchema>;
