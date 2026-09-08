/**
 * Address rendering and postcode normalisation (spec 003 §2, §5.2, §7 "Address/phone formats",
 * AC-19; `plan/03` §8; TASK-037).
 *
 * Three pure functions over `src/config/address-formats.ts`. **No country is named in this file**
 * — the field order, the required set, the postcode pattern and the normaliser are all data, so
 * `plan/03` §8's "data-driven" promise means a new destination is a row in the config plus its
 * four label keys, exactly as `plan/09` says ("a new country is data"). A `switch (country)`
 * anywhere below would quietly turn that into a code change.
 *
 * What each function is for:
 *
 *  - `formatAddressBlock(address, countryIso)` renders the **display block** — the lines a
 *    confirmation page, a florist brief and an email print. It renders *values only*: the
 *    `labelKeys` in the config are for spec 010's form, not for this block, so no label and no
 *    literal copy can leak in (`fo/no-literal-strings` has nothing to flag here because there is
 *    nothing to translate: a rendered address is the recipient's own words).
 *  - `postcodeRegex(countryIso)` is the anchored, cached pattern for the destination.
 *  - `normalisePostcode(raw, countryIso)` applies the country's named normaliser and then the
 *    pattern, returning a discriminated result rather than throwing: a buyer's typo is an
 *    expected outcome at a form boundary, not an exception. `reason` is a **code**, never copy;
 *    spec 010 maps it to a message key.
 *
 * Two deliberate choices worth stating:
 *
 *  1. **Which fields share a line is data-derived, not per country.** `LINE_PAIRS` lists the two
 *     pairs that share a line *when the country's `fieldOrder` puts them next to each other*:
 *     `street` + `houseNumber` (DE/AT "Kastanienallee 12") and `postcode` + `city`
 *     (PL "00-001 Warszawa", DE "10115 Berlin"). GB orders `city` *before* `postcode`, so the
 *     pair never matches and the postcode gets its own line after the town — which is precisely
 *     `plan/03` §8's GB row, produced by the ordering rather than by a special case. No other
 *     separator is invented: fields the config does not order are not rendered at all.
 *  2. **A malformed country argument throws; an unauthored one falls back.** `SI` has no row yet
 *     and renders through the generic format (a usable block before its format is authored),
 *     but `"pl"`, `"POL"`, `"Poland"` and `"generic"` are programming errors — a lowercase code
 *     is how a URL segment reaches a formatter by accident — and fail loudly at the call site.
 */
import { z } from "zod";

import {
  type AddressField,
  type AddressFormat,
  addressFields,
  addressFormat,
} from "../../config/address-formats.ts";

/* -------------------------------------------------------------------------- */
/* Boundary schema                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The address values a caller hands in: every field of `addressFields`, each an optional trimmed
 * string. `.strict()`, so a typo'd key (`postCode`, `zip`) is a parse error rather than a
 * silently missing line.
 *
 * A blank value is **absent**, not invalid: an HTML form posts `""` for every untouched optional
 * input, and rejecting that would push a cleaning step into every caller. `formatAddressBlock`
 * therefore skips empty and whitespace-only values, and "is this field filled in?" stays spec
 * 010's per-country question.
 *
 * It is deliberately *not* the per-country required set: "which fields must be filled" is a form
 * concern (spec 010) that depends on the destination, while this schema is the shape every caller
 * shares. `formatAddressBlock` renders what it is given and skips the rest.
 */
export const AddressInputSchema = z
  .object(
    Object.fromEntries(
      addressFields.map((field) => [field, z.string().trim().optional()]),
    ) as Record<AddressField, z.ZodOptional<z.ZodString>>,
  )
  .strict();

export type AddressInput = z.infer<typeof AddressInputSchema>;

/** Why a postcode was rejected. A code for spec 010 to map to a message key, never copy. */
export type PostcodeRejection = "empty" | "format";

/** `normalisePostcode`'s result: the canonical postcode, or the reason it is not one. */
export type PostcodeResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: PostcodeRejection };

/* -------------------------------------------------------------------------- */
/* Country argument                                                            */
/* -------------------------------------------------------------------------- */

/** ISO 3166-1 alpha-2, uppercase. `generic` is a config key, never a caller's country. */
const COUNTRY_ISO = /^[A-Z]{2}$/;

/**
 * The format for a destination, after checking the argument is an ISO 3166-1 alpha-2 code.
 * @throws if `countryIso` is not one (a lowercase or three-letter code is a caller bug).
 */
function formatFor(countryIso: string): AddressFormat {
  if (!COUNTRY_ISO.test(countryIso)) {
    throw new Error(
      `country must be an ISO 3166-1 alpha-2 code (uppercase), received: ${JSON.stringify(countryIso)}`,
    );
  }
  return addressFormat(countryIso);
}

/* -------------------------------------------------------------------------- */
/* Address block                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Field pairs that share one line when a country's `fieldOrder` places them adjacently. See the
 * module docblock: this is what makes DE's house number sit after the street and GB's postcode
 * sit on its own line, without either country being named.
 */
const LINE_PAIRS: readonly (readonly [AddressField, AddressField])[] = [
  ["street", "houseNumber"],
  ["postcode", "city"],
];

/** The separator inside a shared line. A space, because the config defines no other. */
const PAIR_SEPARATOR = " ";

const isPair = (first: AddressField, second: AddressField): boolean =>
  LINE_PAIRS.some(([left, right]) => left === first && right === second);

/**
 * The recipient's address as ordered display lines, per the destination country's format.
 *
 * Empty, whitespace-only and absent fields are skipped (an optional c/o or address line 2 leaves
 * no blank line),
 * and a field the country's `fieldOrder` does not list is not rendered at all. The recipient
 * phone is part of every configured format (`plan/03` §8: florists call ahead), so every block
 * ends with it when it is supplied.
 *
 * @param address field values, parsed by `AddressInputSchema`
 * @param countryIso ISO 3166-1 alpha-2 destination country
 */
export function formatAddressBlock(
  address: Readonly<Record<string, string>>,
  countryIso: string,
): string[] {
  const format = formatFor(countryIso);
  const values = AddressInputSchema.parse(address);
  const order = format.fieldOrder;
  const lines: string[] = [];

  for (let index = 0; index < order.length; index += 1) {
    const field = order[index];
    const next = order[index + 1];
    if (field === undefined) continue;
    if (next !== undefined && isPair(field, next)) {
      const parts = [values[field], values[next]].filter(
        (value): value is string => value !== undefined && value !== "",
      );
      if (parts.length > 0) lines.push(parts.join(PAIR_SEPARATOR));
      index += 1;
      continue;
    }
    const value = values[field];
    if (value !== undefined && value !== "") lines.push(value);
  }

  return lines;
}

/* -------------------------------------------------------------------------- */
/* Postcodes                                                                   */
/* -------------------------------------------------------------------------- */

/** Compiled patterns, keyed by pattern source: the same country asks repeatedly. */
const patterns = new Map<string, RegExp>();

/**
 * The postcode pattern for a destination, anchored as authored in
 * `src/config/address-formats.ts` and never global (a shared `RegExp` with `g` carries
 * `lastIndex` between calls, which is a class of bug this cache would otherwise introduce).
 */
export function postcodeRegex(countryIso: string): RegExp {
  const source = formatFor(countryIso).postcodePattern;
  const cached = patterns.get(source);
  if (cached !== undefined) return cached;
  const created = new RegExp(source);
  patterns.set(source, created);
  return created;
}

/** Digits only: `D-10115` → `10115` (DE 5, AT 4). */
const digitsOnly = (raw: string): string => raw.replace(/\D/gu, "");

/**
 * The named normalisers of `src/config/address-formats.ts`. Adding a normaliser is a new entry
 * here plus a new name in the config's `postcodeNormalisers` tuple, which `tsc` then requires —
 * the two lists cannot drift.
 */
const NORMALISERS: Record<
  AddressFormat["postcodeNormaliser"],
  (raw: string) => string
> = {
  digits: digitsOnly,
  /** PL: five digits become `NN-NNN`; any other digit count is left to fail the pattern. */
  "digits-hyphen-2-3": (raw) => {
    const digits = digitsOnly(raw);
    return digits.length === 5
      ? `${digits.slice(0, 2)}-${digits.slice(2)}`
      : digits;
  },
  /** GB: uppercase, then exactly one space before the three-character inward code. */
  "uk-outward-inward": (raw) => {
    const compact = raw.replace(/[\s ]+/gu, "").toUpperCase();
    return compact.length >= 5
      ? `${compact.slice(0, -3)} ${compact.slice(-3)}`
      : compact;
  },
  /** Fallback: uppercase, collapse internal whitespace, trim. */
  "upper-trim": (raw) =>
    raw
      .trim()
      .replace(/[\s ]+/gu, " ")
      .toUpperCase(),
};

/**
 * A buyer-typed postcode, normalised to the destination's canonical form and checked against its
 * pattern.
 *
 * Returns a result rather than throwing for a bad postcode — that is a form outcome, not a bug —
 * but throws for a malformed country argument, which is. `reason` is a code (`empty`, `format`);
 * the message a buyer reads is spec 010's, from the catalogue.
 */
export function normalisePostcode(
  raw: string,
  countryIso: string,
): PostcodeResult {
  const format = formatFor(countryIso);
  if (raw.trim() === "") return { ok: false, reason: "empty" };
  const value = NORMALISERS[format.postcodeNormaliser](raw);
  if (value === "" || !postcodeRegex(countryIso).test(value)) {
    return { ok: false, reason: "format" };
  }
  return { ok: true, value };
}
