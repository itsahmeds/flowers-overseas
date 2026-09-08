/**
 * Address formats per destination country (spec 003 §2, §5.2, §7; `plan/03` §8; TASK-033).
 *
 * Data only, and deliberately so: `plan/03` §8 makes address handling "data-driven", so adding a
 * country is a row here plus its label message keys — never a code change. Phase 0 ships the
 * destinations spec 003 needs (PL, DE, AT, GB) and a generic fallback; specs 008/010 add rows.
 *
 * `formatAddressBlock`, `postcodeRegex` and `normalisePostcode` are **TASK-037**
 * (`src/modules/i18n/address.ts`) and are not defined here — this module carries the field order,
 * the required fields, the label **keys** (message keys resolved through the catalogue, so no
 * literal copy lives in config), the postcode pattern, the name of the normaliser the country
 * needs, and the example placeholder a form shows. Phone validation against the destination's
 * numbering plan is spec 010; that the recipient phone is **required everywhere** (florists call
 * ahead, `plan/03` §8) is recorded in the data now and unit-tested.
 *
 * No database is read here and none may be (`pnpm check:no-db`, AC-2).
 */
import { z } from "zod";

/** Every field an address form can render. Order per country comes from `plan/03` §8. */
export const addressFields = [
  "fullName",
  "street",
  "houseNumber",
  "addressLine1",
  "addressLine2",
  "careOf",
  "apartment",
  "postcode",
  "city",
  "region",
  "phone",
] as const;
export type AddressField = (typeof addressFields)[number];

/**
 * Named postcode normalisers TASK-037 implements. A name rather than a function keeps this file
 * pure data (and keeps `src/config` free of behaviour the lint rules would have to police):
 *  - `digits` — strip non-digits (DE 5, AT 4);
 *  - `digits-hyphen-2-3` — strip non-digits, then `NN-NNN` (PL `00-001`);
 *  - `uk-outward-inward` — uppercase, then a single space before the final three characters
 *    (GB `SW1A 1AA`);
 *  - `upper-trim` — uppercase and collapse whitespace (generic fallback).
 */
export const postcodeNormalisers = [
  "digits",
  "digits-hyphen-2-3",
  "uk-outward-inward",
  "upper-trim",
] as const;
export type PostcodeNormaliser = (typeof postcodeNormalisers)[number];

/** A message key such as `checkout.address.postcode` — never a literal label (plan/03 §5). */
const MessageKeySchema = z
  .string()
  .regex(
    /^[a-z][A-Za-z0-9]*(?:\.[a-zA-Z][A-Za-z0-9]*)+$/,
    "must be a namespaced message key such as `checkout.address.postcode`",
  );

export const AddressFormatSchema = z
  .object({
    /** ISO-3166-1 alpha-2 of the destination country, or `generic` for the fallback. */
    country: z.union([z.string().regex(/^[A-Z]{2}$/), z.literal("generic")]),
    fieldOrder: z.array(z.enum(addressFields)).min(2),
    required: z.array(z.enum(addressFields)).min(1),
    labelKeys: z.partialRecord(z.enum(addressFields), MessageKeySchema),
    /** Regex source matched against the **normalised** postcode. */
    postcodePattern: z.string().min(1),
    postcodeNormaliser: z.enum(postcodeNormalisers),
    /** Message key for the form's example/placeholder hint (plan/03 §8). */
    placeholderKey: MessageKeySchema,
    /** Example values, used as placeholder data and as the schema's own postcode fixture. */
    examplePlaceholder: z
      .object({ street: z.string().min(1), postcode: z.string().min(1) })
      .strict(),
    /** Whether apartment/floor is a separate field (PL folds it into the street line). */
    apartmentField: z.boolean(),
  })
  .strict()
  .superRefine((format, ctx) => {
    const order = new Set<AddressField>(format.fieldOrder);
    if (order.size !== format.fieldOrder.length) {
      ctx.addIssue({
        code: "custom",
        path: ["fieldOrder"],
        message: "fieldOrder must not repeat a field",
      });
    }
    for (const field of format.required) {
      if (!order.has(field)) {
        ctx.addIssue({
          code: "custom",
          path: ["required"],
          message: `required field \`${field}\` is not in fieldOrder`,
        });
      }
    }
    for (const field of format.fieldOrder) {
      if (format.labelKeys[field] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["labelKeys", field],
          message: `field \`${field}\` has no label key`,
        });
      }
    }
    if (format.apartmentField && !order.has("apartment")) {
      ctx.addIssue({
        code: "custom",
        path: ["apartmentField"],
        message: "apartmentField is true but `apartment` is not in fieldOrder",
      });
    }
    try {
      new RegExp(format.postcodePattern);
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["postcodePattern"],
        message: "postcodePattern is not a valid regular expression",
      });
    }
  });

export type AddressFormat = z.infer<typeof AddressFormatSchema>;

/** Label keys live in the `checkout.address` namespace spec 010 authors. */
const labelKey = (field: AddressField): string => `checkout.address.${field}`;

const labelKeysFor = (
  fields: readonly AddressField[],
): Record<string, string> =>
  Object.fromEntries(fields.map((field) => [field, labelKey(field)]));

const PL_FIELDS = [
  "fullName",
  "street",
  "postcode",
  "city",
  "phone",
] as const satisfies readonly AddressField[];

const DE_FIELDS = [
  "fullName",
  "street",
  "houseNumber",
  "careOf",
  "postcode",
  "city",
  "phone",
] as const satisfies readonly AddressField[];

const GB_FIELDS = [
  "fullName",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postcode",
  "phone",
] as const satisfies readonly AddressField[];

const GENERIC_FIELDS = [
  "fullName",
  "addressLine1",
  "addressLine2",
  "postcode",
  "city",
  "region",
  "phone",
] as const satisfies readonly AddressField[];

const formats = {
  // PL: street line carries number/apartment (`ul. Marszałkowska 10/5`); postcode `00-001`;
  // voivodeship not needed (`plan/03` §8).
  PL: {
    country: "PL",
    fieldOrder: PL_FIELDS,
    required: PL_FIELDS,
    labelKeys: labelKeysFor(PL_FIELDS),
    postcodePattern: "^\\d{2}-\\d{3}$",
    postcodeNormaliser: "digits-hyphen-2-3",
    placeholderKey: "checkout.address.placeholder.pl",
    examplePlaceholder: {
      street: "ul. Marszałkowska 10/5",
      postcode: "00-001",
    },
    apartmentField: false,
  },
  // DE: house number after the street; optional c/o or floor line; postcode 5 digits.
  DE: {
    country: "DE",
    fieldOrder: DE_FIELDS,
    required: [
      "fullName",
      "street",
      "houseNumber",
      "postcode",
      "city",
      "phone",
    ],
    labelKeys: labelKeysFor(DE_FIELDS),
    postcodePattern: "^\\d{5}$",
    postcodeNormaliser: "digits",
    placeholderKey: "checkout.address.placeholder.de",
    examplePlaceholder: { street: "Kastanienallee", postcode: "10115" },
    apartmentField: false,
  },
  // AT: as DE, postcode 4 digits (`plan/03` §8 "postcode 5 (AT 4)").
  AT: {
    country: "AT",
    fieldOrder: DE_FIELDS,
    required: [
      "fullName",
      "street",
      "houseNumber",
      "postcode",
      "city",
      "phone",
    ],
    labelKeys: labelKeysFor(DE_FIELDS),
    postcodePattern: "^\\d{4}$",
    postcodeNormaliser: "digits",
    placeholderKey: "checkout.address.placeholder.at",
    examplePlaceholder: { street: "Mariahilfer Straße", postcode: "1010" },
    apartmentField: false,
  },
  // GB: postcode after the town; county optional (`plan/03` §8).
  GB: {
    country: "GB",
    fieldOrder: GB_FIELDS,
    required: ["fullName", "addressLine1", "city", "postcode", "phone"],
    labelKeys: labelKeysFor(GB_FIELDS),
    postcodePattern:
      "^(?:[A-Z][A-HJ-Y]?\\d[A-Z\\d]?|[A-Z][A-HJ-Y]?\\d{2}) \\d[A-Z]{2}$",
    postcodeNormaliser: "uk-outward-inward",
    placeholderKey: "checkout.address.placeholder.gb",
    examplePlaceholder: { street: "10 Downing Street", postcode: "SW1A 1AA" },
    apartmentField: false,
  },
  // Generic fallback for a destination with no authored format yet (specs 008/010 add rows).
  generic: {
    country: "generic",
    fieldOrder: GENERIC_FIELDS,
    required: ["fullName", "addressLine1", "city", "phone"],
    labelKeys: labelKeysFor(GENERIC_FIELDS),
    postcodePattern: "^[A-Z0-9][A-Z0-9 -]{1,10}$",
    postcodeNormaliser: "upper-trim",
    placeholderKey: "checkout.address.placeholder.generic",
    examplePlaceholder: { street: "Main Street 1", postcode: "12345" },
    apartmentField: false,
  },
} as const satisfies Record<string, unknown>;

export type AddressFormatKey = keyof typeof formats;

/** Declaration order, so the unit test and any future report read the same list. */
export const ADDRESS_FORMAT_KEYS = Object.keys(
  formats,
) as readonly AddressFormatKey[];

/** Parsed at module load: a malformed format throws on first import, never at request time. */
export const ADDRESS_FORMATS: Readonly<
  Record<AddressFormatKey, AddressFormat>
> = Object.freeze(
  Object.fromEntries(
    ADDRESS_FORMAT_KEYS.map((key) => [
      key,
      AddressFormatSchema.parse(formats[key]),
    ]),
  ) as Record<AddressFormatKey, AddressFormat>,
);

/**
 * The format for a destination country, falling back to `generic` for a country with no authored
 * row — a new destination therefore renders a usable form before its format is authored.
 */
export function addressFormat(countryIso: string): AddressFormat {
  const key = countryIso as AddressFormatKey;
  return key !== "generic" && key in ADDRESS_FORMATS
    ? ADDRESS_FORMATS[key]
    : ADDRESS_FORMATS.generic;
}
