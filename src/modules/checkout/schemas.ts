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
  PLACE_KINDS,
  type PlaceKind,
} from "@/config/checkout";
import { CURRENCY_CODES, type CurrencyCode } from "@/config/currencies";
import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { countGraphemes } from "@/modules/i18n";

import { addressFormModel } from "./address";
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

/** A form posts strings; an absent optional field is the empty string. */
const formString = z
  .string({ error: CHECKOUT_ERROR_KEYS.required })
  .optional()
  .transform((value) => (value ?? "").normalize("NFC").trim());

/**
 * Free text: NFC, trimmed, at most `max` graphemes, and non-empty when `required`. The empty
 * string is the value of a blank optional field ("blank means no card", §2).
 */
function textField(options: {
  readonly required: boolean;
  readonly max: number;
  readonly locale: LocaleCode;
}) {
  return formString.transform((value, ctx) => {
    if (value === "") {
      if (options.required) {
        ctx.addIssue({ code: "custom", message: CHECKOUT_ERROR_KEYS.required });
        return z.NEVER;
      }
      return value;
    }
    if (countGraphemes(value, options.locale) > options.max) {
      ctx.addIssue({
        code: "custom",
        message: CHECKOUT_ERROR_KEYS.tooLong,
        params: { max: options.max },
      });
      return z.NEVER;
    }
    return value;
  });
}

const LocaleSchema = z.custom<LocaleCode>(
  (value) => typeof value === "string" && isLocaleCode(value),
  { error: "must be a locale configured in src/config/locales.ts" },
);

const CurrencySchema = z.enum(CURRENCY_CODES as readonly CurrencyCode[]);

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

  const shape: Record<string, z.ZodType> = {
    deliveryDate: IsoDateInputSchema,
    placeKind: z.enum(PLACE_KINDS, {
      error: CHECKOUT_ERROR_KEYS.placeKindInvalid,
    }),
    deliveryNote: textField({
      required: false,
      max: CHECKOUT_LIMITS.deliveryNote,
      locale,
    }),
  };

  for (const field of model.fields) {
    if (field.field === "phone") {
      shape[field.field] = formString.transform((value, ctx) => {
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
      });
    } else if (field.field === "postcode") {
      shape[field.field] = formString.transform((value, ctx) => {
        if (value === "" && !field.required) return value;
        const result = model.checkPostcode(value);
        if (!result.ok) {
          ctx.addIssue(
            result.reason === "empty"
              ? { code: "custom", message: CHECKOUT_ERROR_KEYS.required }
              : {
                  code: "custom",
                  message: CHECKOUT_ERROR_KEYS.postcodeFormat,
                  params: { example: model.example.postcode },
                },
          );
          return z.NEVER;
        }
        return result.value;
      });
    } else {
      shape[field.field] = textField({
        required: field.required,
        max: field.maxGraphemes ?? CHECKOUT_LIMITS.addressLine,
        locale,
      });
    }
  }

  return z
    .object(shape)
    .strict()
    .transform((values): RecipientStep => {
      const address: Record<string, string> = {};
      for (const { field } of model.fields) {
        if (field === "fullName" || field === "phone") continue;
        const value = values[field];
        if (typeof value === "string" && value !== "") address[field] = value;
      }
      return {
        deliveryDate: values["deliveryDate"] as string,
        fullName: values["fullName"] as string,
        phone: values["phone"] as RecipientStep["phone"],
        address,
        placeKind: values["placeKind"] as PlaceKind,
        deliveryNote: values["deliveryNote"] as string,
      };
    });
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
      email: formString.pipe(
        z
          .string()
          .min(1, CHECKOUT_ERROR_KEYS.required)
          .max(254, CHECKOUT_ERROR_KEYS.emailInvalid)
          .pipe(z.email({ error: CHECKOUT_ERROR_KEYS.emailInvalid })),
      ),
      buyerName: textField({
        required: true,
        max: CHECKOUT_LIMITS.fullName,
        locale: context.locale,
      }),
      buyerPhone: formString,
      residenceCountry: formString.refine(
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
