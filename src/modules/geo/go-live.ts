/**
 * Country go-live: the rules, without the database (spec 012b §2.8, §5.2 `src/modules/geo`,
 * AC-25, AC-39 preflight half, §14 A-orchestrator-2026-10-20a; TASK-300).
 *
 *  - `GoLiveFiscalFieldsSchema`, `CountryStatusFlipSchema`, `PreflightResultSchema`: the three
 *    boundaries §5.2 names;
 *  - `evaluatePreflight(facts)`: one named reason per unmet condition of §2.8, in the order the
 *    go-live card lists them. Read-only and status-blind: a `live` country gets the conditions
 *    that no longer hold, a `demo` country the ones that still stand in the way;
 *  - `flipRefusal(from, to)`: the status graph (`demo ↔ live`, `demo ↔ disabled`; `live →
 *    disabled` refused until spec 007's 410 page exists, §13 Q10);
 *  - `fiscalInputsFor(country)`: exactly the go-live fiscal fields whose stored value is null.
 *
 * The facts are gathered, and the commands run, in `src/modules/admin/countries.ts`: the
 * saleable-products count reads `saleable_offer` and the catalogue's floor, and the catalogue
 * module already imports this one, so the database half cannot live here without a cycle. This
 * file stays database-free (`pnpm check:no-db` scans it).
 *
 * Countries are data: nothing here names a country. The sanctions list is
 * `src/config/sanctions.ts`.
 */
import { z } from "zod";

import { countryStatuses } from "@/config/countries";

const Iso2Schema = z.string().regex(/^[A-Z]{2}$/u);

/** The two supply models of `plan/06` §4 (the accountant's answer). */
export const supplyModels = ["principal", "agent"] as const;
export type SupplyModel = (typeof supplyModels)[number];

/** VAT in basis points: an integer from 0 to 10 000 (`country_vat_rate_bp_check`, `0002`). */
export const VatRateBpSchema = z.number().int().min(0).max(10_000);

/**
 * The go-live fiscal fields (§14 A-orchestrator-2026-10-20a): either or both, each set only while
 * its stored value is null, with the accountant's answer as the reason.
 */
export const GoLiveFiscalFieldsSchema = z
  .strictObject({
    iso2: Iso2Schema,
    vatRateBp: VatRateBpSchema.optional(),
    supplyModel: z.enum(supplyModels).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (input) => input.vatRateBp !== undefined || input.supplyModel !== undefined,
    { message: "set the VAT rate, the supply model, or both" },
  );
export type GoLiveFiscalFields = z.infer<typeof GoLiveFiscalFieldsSchema>;

/**
 * A status flip from the country page. `from` is the status the page showed (a flip against a
 * row that moved since is a conflict and changes nothing, §5.2 "Concurrency"); `confirmCode` is
 * the typed ISO code, which going live requires (§2.8 "The flip asks for the ISO code to be
 * typed").
 */
export const CountryStatusFlipSchema = z.strictObject({
  iso2: Iso2Schema,
  from: z.enum(countryStatuses),
  to: z.enum(countryStatuses),
  confirmCode: z.string().max(10).optional(),
});
export type CountryStatusFlip = z.infer<typeof CountryStatusFlipSchema>;

/** The unmet conditions of §2.8, each one named, in the go-live card's order. */
export const preflightReasons = [
  /** Delivery days, time zone and same-day cutoff: spec 009 needs all three. */
  "operationsIncomplete",
  "vatRateMissing",
  "supplyModelMissing",
  /** No `active`, non-demo florist with coverage in the country. */
  "noRealFlorist",
  /** Fewer than spec 008's floor of products that can be bought there. */
  "tooFewSaleableProducts",
  /** No reviewed `en` corridor text in its live state. */
  "corridorNotReviewed",
  /** The country is on the sanctions list (`plan/07` §9). */
  "sanctioned",
] as const;
export type PreflightReason = (typeof preflightReasons)[number];

/** What the preflight reads about one country. Gathered by the admin module. */
export interface PreflightFacts {
  readonly iso2: string;
  readonly operationsComplete: boolean;
  readonly vatRateBp: number | null;
  readonly supplyModel: string | null;
  /** `active` (never `demo`) florists whose coverage is in the country. */
  readonly realFlorists: number;
  /** `active` products with an open price, an approved primary photo, in `saleable_offer`. */
  readonly saleableProducts: number;
  /** Spec 008's `PRODUCT_COUNT_FLOOR`, read from the catalogue. */
  readonly productFloor: number;
  readonly corridorReviewed: boolean;
  readonly sanctioned: boolean;
}

export const PreflightResultSchema = z.strictObject({
  iso2: Iso2Schema,
  reasons: z.array(z.enum(preflightReasons)),
  realFlorists: z.number().int().min(0),
  saleableProducts: z.number().int().min(0),
  productFloor: z.number().int().min(1),
});
export type PreflightResult = z.infer<typeof PreflightResultSchema>;

/** One reason per unmet condition; an empty list means the flip may be offered. */
export function evaluatePreflight(facts: PreflightFacts): PreflightResult {
  const unmet: Record<PreflightReason, boolean> = {
    operationsIncomplete: !facts.operationsComplete,
    vatRateMissing: facts.vatRateBp === null,
    supplyModelMissing: facts.supplyModel === null,
    noRealFlorist: facts.realFlorists < 1,
    tooFewSaleableProducts: facts.saleableProducts < facts.productFloor,
    corridorNotReviewed: !facts.corridorReviewed,
    sanctioned: facts.sanctioned,
  };
  return PreflightResultSchema.parse({
    iso2: facts.iso2,
    reasons: preflightReasons.filter((reason) => unmet[reason]),
    realFlorists: facts.realFlorists,
    saleableProducts: facts.saleableProducts,
    productFloor: facts.productFloor,
  });
}

/** Why a flip is refused by the graph alone, or `undefined` when the move is allowed. */
export type FlipRefusal = "unchanged" | "liveToDisabled" | "disabledToLive";

/**
 * The status graph of §2.8: `demo → live` (behind the preflight and the typed code), `live →
 * demo` (the rollback), `demo ↔ disabled`. `live → disabled` waits for spec 007's 410 page
 * (§13 Q10); `disabled → live` goes through `demo`, so it meets the preflight on the way.
 */
export function flipRefusal(
  from: (typeof countryStatuses)[number],
  to: (typeof countryStatuses)[number],
): FlipRefusal | undefined {
  if (from === to) return "unchanged";
  if (from === "live" && to === "disabled") return "liveToDisabled";
  if (from === "disabled" && to === "live") return "disabledToLive";
  return undefined;
}

/** Whether the typed code confirms going live in `iso2`: the ISO code itself, spaces aside. */
export function confirmsCode(iso2: string, typed: string | undefined): boolean {
  return typed !== undefined && typed.trim() === iso2;
}

/** The fiscal inputs the go-live screen offers: exactly the fields still null, in this order. */
export function fiscalInputsFor(country: {
  readonly vatRateBp: number | null;
  readonly supplyModel: string | null;
}): readonly ("vatRateBp" | "supplyModel")[] {
  return [
    ...(country.vatRateBp === null ? (["vatRateBp"] as const) : []),
    ...(country.supplyModel === null ? (["supplyModel"] as const) : []),
  ];
}
