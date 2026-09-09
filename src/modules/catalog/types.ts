/**
 * The catalogue module's money types (spec 005 §5.2 `types.ts`; TASK-060).
 *
 * This file carries **only** the types spec 005 fixes for money: a `PricePoint` (the all-in gross
 * price of one tier in one destination country, with its own decomposition) and the `Surcharge`
 * rows that are part of it. The taxonomy types spec §5.2 also lists — `Product`, `Tier`, `Addon`,
 * `Category`, `Occasion`, `Facets`, `PriceProjection`, `PriceTable`, `Availability`, `Quote` —
 * arrive with the tasks that own their data and their arithmetic (TASK-061 … TASK-068); guessing
 * their fields here would put a second, unauthored definition of the dataset in the repository.
 *
 * Two properties of `PricePoint` are the reason it exists at all, and both are enforced by
 * `PricePointSchema` rather than reviewed for (spec 005 §2 "Pricing", AC-8):
 *
 *  1. **The all-in amount is the only amount the type can carry.** `amountMinor` is VAT- *and*
 *     delivery-inclusive, `deliveryIncluded` is the literal `true`, and there is no field for a
 *     price without either. `plan/07` §4's drip-pricing prohibition is therefore not expressible,
 *     which is a stronger guarantee than a code review.
 *  2. **Money is integer minor units.** Every amount here is a whole number of minor units
 *     (`fo/no-float-money`, enabled for `src/` by this task, `plan/12` §2). The one formatter is
 *     spec 003's `formatMoney`; this module adds none.
 */
import type { CurrencyCode } from "@/config/currencies";

/**
 * The `country_price.surcharge_kind` CHECK values of spec 002 §5.1, verbatim. Surcharges are
 * **dated rows**, never a multiplier applied at render (spec 005 §13 Q7): a percentage is a float
 * and a number that cannot be shown on a date chip before the date is picked (`plan/07` §4).
 */
export const surchargeKinds = ["sunday", "peak_day"] as const;
export type SurchargeKind = (typeof surchargeKinds)[number];

/** A calendar day, `YYYY-MM-DD` — the `date` columns of spec 002 §5.1, not a timestamp. */
export type IsoDate = string;

/**
 * One dated surcharge row, in the destination country's own currency (spec 005 §5.2
 * `SurchargeSchema`). `labelKey` is a message key, never a label: the text resolves through the
 * message catalogue (spec 005 §7).
 */
export interface Surcharge {
  readonly kind: SurchargeKind;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly appliesFrom: IsoDate;
  readonly appliesTo: IsoDate;
  readonly labelKey: string;
}

/**
 * The price of one (product, tier, destination country) on one date: gross, all-in, with its own
 * VAT decomposition and the surcharge rows that are already inside `amountMinor`.
 *
 * `netAmountMinor + vatAmountMinor === amountMinor` holds by construction (`PricePointSchema`),
 * so the invoice's decomposition and the displayed price cannot disagree.
 */
export interface PricePoint {
  /** Gross, VAT- and delivery-inclusive, surcharges included. The price shown and charged. */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  /** VAT rate in basis points (PL flowers 800, PL chocolates 2300 — spec 005 §2 "Pricing"). */
  readonly vatRateBp: number;
  readonly vatAmountMinor: number;
  readonly netAmountMinor: number;
  /** Always `true`: delivery is inside `amountMinor` by definition (`CLAUDE.md`, `plan/07` §4). */
  readonly deliveryIncluded: true;
  readonly surcharges: readonly Surcharge[];
  readonly activeFrom: IsoDate;
  /** `null` while the row is the active one; a date once it has been superseded. */
  readonly activeTo: IsoDate | null;
  /**
   * Opaque identifier of the priced row version, carried into a quote and into the `Offer` so a
   * charge can be traced to the row the buyer saw. Minted by the task that resolves prices
   * (TASK-066) from spec 002 §5.1's `country_price` identity; no caller parses it.
   */
  readonly priceVersion: string;
}
