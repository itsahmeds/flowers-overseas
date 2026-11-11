/**
 * The shared catalogue rules as pure functions (spec 012b §2.5, AC-15; TASK-297).
 *
 * Extracted from the file gates so the admin save and the gates cannot drift: `pnpm
 * catalogue:check` (tiers, stems, amounts, open rows) and `pnpm seed:check` (slugs, product copy)
 * call these and print the rule id with the problem; the product editor calls the same functions
 * and shows the same id beside the field. No database, no clock, no I/O.
 */
// Relative `.ts` specifiers: `node scripts/catalogue-check.ts` and `node seed/check.ts` load this.
import { COMPETITOR_MARKS } from "../../../config/competitors.ts";
import { endsInRoundingStyle } from "../../../config/catalogue/schemas.ts";
import { isCurrencyCode } from "../../../config/currencies.ts";
import { PRICE_LITERAL_PATTERN } from "../../../config/honesty.ts";
import { bannedVoiceWordsIn } from "../../../config/voice.ts";

import { type Violation, violation } from "./rules.ts";

/* -------------------------------------------------------------------------- */
/* slugs                                                                      */
/* -------------------------------------------------------------------------- */

/** ASCII, lowercase, hyphenated, no slash (`plan/02` §4). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function slugViolations(slug: string, field = "slug"): Violation[] {
  return SLUG_PATTERN.test(slug) ? [] : [violation("slug.shape", field)];
}

/** `slug` against the other slugs of the same locale (this product's own excluded by the caller). */
export function slugUniqueViolations(
  slug: string,
  taken: ReadonlySet<string>,
  field = "slug",
): Violation[] {
  return taken.has(slug) ? [violation("slug.unique", field)] : [];
}

/* -------------------------------------------------------------------------- */
/* sizes                                                                      */
/* -------------------------------------------------------------------------- */

/** The stem count no size may offer: the French guide says thirteen is avoided. */
export const FORBIDDEN_STEM_COUNT = 13;

export interface TierShape {
  readonly tierKey: string;
  readonly stems: number | null;
  readonly isDefault: boolean;
}

/** One size's stem rules (spec 005 §14 A-founder-2026-10-14c, AC-36). */
export function stemViolations(tier: TierShape, field: string): Violation[] {
  if (tier.stems === null) return [];
  const out: Violation[] = [];
  if (tier.stems % 2 === 0) out.push(violation("tier.stem_count_odd", field));
  if (tier.stems === FORBIDDEN_STEM_COUNT) {
    out.push(violation("tier.stem_count_thirteen", field));
  }
  if (tier.tierKey !== `stems_${String(tier.stems)}`) {
    out.push(violation("tier.stem_key", field));
  }
  return out;
}

/** A product's sizes: at least one, exactly one default, each stem rule. */
export function tierViolations(tiers: readonly TierShape[]): Violation[] {
  if (tiers.length === 0) return [violation("tier.none", "tiers")];
  const out: Violation[] = [];
  if (tiers.filter((tier) => tier.isDefault).length !== 1) {
    out.push(violation("tier.default_one", "tiers"));
  }
  tiers.forEach((tier, index) => {
    out.push(...stemViolations(tier, `tiers.${String(index)}.stems`));
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* prices                                                                     */
/* -------------------------------------------------------------------------- */

export interface PriceShape {
  readonly amountMinor: number;
  readonly currency: string;
  /** The destination country's currency. */
  readonly countryCurrency: string;
  /** The `plan/10` §2.3 band the price must sit in, when one is known. */
  readonly band?: { readonly fromMinor: number; readonly toMinor: number };
}

/** Does an amount land on the currency's psychological ending (spec 005 §13 Q1)? */
export const onRoundingStyle = endsInRoundingStyle;

/** One retail amount: integer minor units in the country's currency; band and ending are soft. */
export function priceViolations(
  price: PriceShape,
  field = "amount",
): Violation[] {
  if (!Number.isSafeInteger(price.amountMinor) || price.amountMinor <= 0) {
    return [violation("price.integer_minor", field)];
  }
  if (
    !isCurrencyCode(price.currency) ||
    price.currency !== price.countryCurrency
  ) {
    return [violation("price.currency", field)];
  }
  const out: Violation[] = [];
  if (
    price.band !== undefined &&
    (price.amountMinor < price.band.fromMinor ||
      price.amountMinor > price.band.toMinor)
  ) {
    out.push(violation("price.band", field));
  }
  if (!onRoundingStyle(price.amountMinor, price.currency)) {
    out.push(violation("price.rounding", field));
  }
  return out;
}

/** At most one open row per (product, country, size, surcharge). */
export function openPriceViolations(
  rows: readonly {
    readonly key: string;
    readonly activeTo: string | null;
  }[],
  field = "amount",
): Violation[] {
  const open = new Map<string, number>();
  for (const row of rows) {
    if (row.activeTo !== null) continue;
    open.set(row.key, (open.get(row.key) ?? 0) + 1);
  }
  return [...open.values()].some((count) => count > 1)
    ? [violation("price.one_open", field)]
    : [];
}

/* -------------------------------------------------------------------------- */
/* copy                                                                       */
/* -------------------------------------------------------------------------- */

/** `plan/02` §6: the search title and description limits, in characters. */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;
/** Spec 012b §2.5: the description's word band (soft). */
export const DESCRIPTION_WORDS = { min: 60, max: 90 } as const;

/** A price written number-first: `49 €`, `49,– €`, `149 zł`, `99 lei`. */
const TRAILING_CURRENCY_PRICE_PATTERN =
  /\d[\d.,]*(?:[.,]?[-–—]+)?\s?(?:[£€$]|(?:zł|zl|złotych|pln|eur|euro|euros|gbp|ron|lei)(?![\p{L}\p{N}]))/iu;

/** A price written currency-first with an ISO code or a currency word: `EUR 49`, `zł 149`. */
const LEADING_CODE_PRICE_PATTERN =
  /(?<![\p{L}\p{N}])(?:eur|euro|gbp|pln|ron|lei|zł|zl)\s?\d[\d.,]*/iu;

/** The price literals a piece of copy contains (the corridor gate's forms and the native ones). */
export function priceLiteralsIn(text: string): readonly string[] {
  return [
    PRICE_LITERAL_PATTERN,
    TRAILING_CURRENCY_PRICE_PATTERN,
    LEADING_CODE_PRICE_PATTERN,
  ]
    .map((pattern) => pattern.exec(text)?.[0].trim())
    .filter(
      (match, index, all): match is string =>
        match !== undefined && all.indexOf(match) === index,
    );
}

const EMAIL_SHAPE = /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/iu;
const PHONE_SHAPE = /\+?\d[\d\s()-]{7,17}\d/u;
const URL_SHAPE =
  /(?:https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|eu|pl|de|fr|es|it|ro|nl|uk|io|co)\b)/iu;

/** Is there an email-, phone- or URL-shaped string in `text`? */
export function hasContactShape(text: string): boolean {
  return (
    EMAIL_SHAPE.test(text) || PHONE_SHAPE.test(text) || URL_SHAPE.test(text)
  );
}

export function wordCount(text: string): number {
  return text.split(/\s+/u).filter((word) => word !== "").length;
}

export interface CopyShape {
  readonly name: string;
  readonly description: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

export interface CopyContext {
  /** Legal names and city labels of every non-demo florist (spec 012b §2.5, AC-17). */
  readonly floristTerms: readonly string[];
}

const COPY_FIELDS = [
  "name",
  "description",
  "seoTitle",
  "seoDescription",
] as const;

/** The hard and soft copy rules of one locale's product text. */
export function copyViolations(
  copy: CopyShape,
  context: CopyContext,
): Violation[] {
  const out: Violation[] = [];
  const terms = context.floristTerms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3);
  for (const field of COPY_FIELDS) {
    const text = copy[field];
    if (text === "") continue;
    const lower = text.toLowerCase();
    if (bannedVoiceWordsIn(text).length > 0) {
      out.push(violation("copy.banned_word", field));
    }
    if (terms.some((term) => lower.includes(term))) {
      out.push(violation("copy.florist_name", field));
    }
    if (priceLiteralsIn(text).length > 0) {
      out.push(violation("copy.price_literal", field));
    }
    if (hasContactShape(text)) out.push(violation("copy.contact", field));
    if (COMPETITOR_MARKS.some((mark) => lower.includes(mark))) {
      out.push(violation("copy.competitor", field));
    }
  }
  if ([...copy.seoTitle].length > SEO_TITLE_MAX) {
    out.push(violation("copy.seo_title_length", "seoTitle"));
  }
  if ([...copy.seoDescription].length > SEO_DESCRIPTION_MAX) {
    out.push(violation("copy.seo_description_length", "seoDescription"));
  }
  const words = wordCount(copy.description);
  if (words < DESCRIPTION_WORDS.min || words > DESCRIPTION_WORDS.max) {
    out.push(violation("copy.description_words", "description"));
  }
  return out;
}
