/**
 * Price resolution (spec 005 §5.2 `pricing/resolve.ts`, §2 "Pricing", §8, AC-8/AC-16; TASK-065).
 *
 * The one place in the codebase that answers *what does this tier cost, to this destination, on
 * this date* — and the reason spec 005 calls itself the phase's highest-consequence spec. Five
 * properties are structural here rather than reviewed for, and each one is a law or a plan rule:
 *
 *  1. **A price is whole or it does not exist.** Every function below returns a `PricePoint`:
 *     gross, VAT- and delivery-inclusive, with its own net/VAT decomposition and the date's
 *     surcharge rows already inside `amountMinor`. There is no variant that returns a price
 *     without VAT, without delivery or without the surcharges, and `PricePointSchema` refuses one
 *     (`deliveryIncluded` is the literal `true`; `netAmountMinor + vatAmountMinor === amountMinor`
 *     is refined). That is how `plan/07` §4's drip-pricing prohibition — CRD Art. 6 as amended by
 *     Omnibus, the Price Indication Directive, the UK DMCC ban — becomes *unexpressible* instead
 *     of a review item (AC-8).
 *  2. **The destination is the only geography.** `resolvePrice({ productId, tierKey, countryIso,
 *     deliveryDate? })` takes no buyer country, no IP, no header, no session, no customer and no
 *     locale (EU 2018/302, ADR-0006, `plan/07` §3): "a French buyer and a German buyer sending to
 *     Warsaw see the same price" is a property of the signature. Display currency is a
 *     presentation choice made from the locale's default over these destination-currency rows
 *     (TASK-068), never a second price.
 *  3. **Surcharges are dated rows, never a multiplier.** A Sunday or peak-day amount is a
 *     `country_price` row with a `surcharge_kind` and date bounds (§13 Q7). Nothing here
 *     multiplies an amount by a rate or a percentage — `dateSurcharges()` hands the exact amount
 *     and its label key to spec 009 so the figure is legible on the date chip **before** the date
 *     is chosen, which `plan/07` §4 requires and a percentage could neither show nor supersede
 *     (AC-16).
 *  4. **One active row, or a throw.** Spec 002 §5.1's partial unique index allows exactly one
 *     active `country_price` per (product, country, tier, surcharge) and `pnpm catalogue:check`
 *     enforces the same in the dataset; so zero rows and two rows are both **data errors that
 *     throw**, never a silent pick and never a fake zero (spec 005 §5.2, §5.3: "a page with no
 *     resolvable price must not render a buy path").
 *  5. **This module owns no calendar.** The only date fact used here is which weekday a calendar
 *     day falls on, for the `sunday` surcharge kind — a property of the day itself, with no time
 *     zone, no cutoff, no holiday list and no occasion rule in it. Cutoff, capacity, holidays and
 *     occasion dates are spec 009's and 024/031's (spec 005 §3).
 *
 * Reads go through `catalogProviders()`, never a dataset import, so TASK-070's Postgres swap
 * changes no line here; and the *history* the provider hands over is deliberate — the superseded
 * rows are what makes the Omnibus Art. 6a 30-day-lowest figure derivable (TASK-068), so this file
 * filters for the active row itself instead of being handed a pre-filtered list.
 */
import type { CountryIso2 } from "@/config/countries";

import { catalogProviders, type CountryPriceRecord } from "../providers";
import { listTiers } from "../read";
import {
  DestinationIsoSchema,
  FromPriceQuerySchema,
  IsoDateSchema,
  PricePointSchema,
  ResolvePriceQuerySchema,
  SurchargeDateRangeSchema,
  SurchargeSchema,
  TierPricesQuerySchema,
  daysBetween,
} from "../schemas";
import type {
  DatedSurcharge,
  IsoDate,
  PricePoint,
  Surcharge,
  SurchargeKind,
  TierPrice,
} from "../types";

import { sumMoney } from "./money";
import { netFromGross } from "./vat";

/**
 * Message keys for the two surcharge kinds (spec 005 §7; the date chip of `plan/07` §4).
 *
 * The dataset authors the same map for its rows; both name `messages/en.json` keys, and
 * `pnpm catalogue:check`'s `label-key` mode fails if a key here is absent from the catalogue. A
 * key, never a label: the amount is data and the wording is the message catalogue's.
 */
const SURCHARGE_LABEL_KEYS: Readonly<Record<SurchargeKind, string>> = {
  sunday: "catalog.surcharge.sunday",
  peak_day: "catalog.surcharge.peakDay",
};

/* -------------------------------------------------------------------------- */
/* Row selection: the "exactly one active row" rule, in one place.            */
/* -------------------------------------------------------------------------- */

/** A row is active when it has not been superseded — the mirror of `active_to IS NULL`. */
function isActive(row: CountryPriceRecord): boolean {
  return row.activeTo === null;
}

/**
 * The one active retail row for a (product, tier, destination), or a throw.
 *
 * The **active** row is the current price, which is the price a buyer is charged today; the
 * superseded rows are history, and the only thing that reads them is TASK-068's
 * `lowestPriceInLast30Days()` (`plan/07` §2.1). A delivery date therefore selects *surcharge*
 * rows, not a historic retail row: an order placed today is priced today whatever day it is
 * delivered.
 */
function activeRetailRow(
  rows: readonly CountryPriceRecord[],
  productId: string,
  tierKey: string,
  countryIso: string,
): CountryPriceRecord {
  const matches = rows.filter(
    (row) =>
      row.sku === productId &&
      row.countryIso2 === countryIso &&
      row.tierKey === tierKey &&
      row.surchargeKind === null &&
      isActive(row),
  );
  if (matches.length === 0) {
    throw new Error(
      `no active \`country_price\` row for \`${productId}\` tier \`${tierKey}\` in \`${countryIso}\`: a price hole on a destination is a data error, and a page with no resolvable price must not render a buy path (spec 005 §5.2, §5.3; \`pnpm catalogue:check\` mode \`missing-price\`)`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `${String(matches.length)} active \`country_price\` rows for \`${productId}\` tier \`${tierKey}\` in \`${countryIso}\`; spec 002 §5.1's partial unique index allows exactly one — an ambiguous price is never picked silently (spec 005 §5.2, \`pnpm catalogue:check\` mode \`ambiguous-price\`)`,
    );
  }
  // `matches.length === 1`, so the row is present; the check keeps `noUncheckedIndexedAccess`
  // honest without an assertion.
  const [row] = matches;
  if (row === undefined) throw new Error("unreachable");
  return row;
}

/**
 * Does a surcharge row apply to one delivery date?
 *
 * Two conditions, both of them data: the date falls inside the row's half-open window
 * `[activeFrom, activeTo)` — the shape the dataset authors and `catalogue:check` refuses overlaps
 * in — and the row's kind matches the day. A `sunday` row applies to Sundays; a `peak_day` row
 * applies to every day of its own window, because the window *is* the named day (14 Feb, 8 Mar).
 */
function surchargeAppliesOn(row: CountryPriceRecord, date: IsoDate): boolean {
  if (row.surchargeKind === null) return false;
  if (date < row.activeFrom) return false;
  if (row.activeTo !== null && date >= row.activeTo) return false;
  return row.surchargeKind === "sunday" ? isSunday(date) : true;
}

/**
 * Is this calendar day a Sunday?
 *
 * `Date.UTC` on the parsed parts: a calendar day carries no time zone, so reading its weekday
 * involves none either — which is why this is not the "date arithmetic" spec 005 §3 assigns to
 * spec 009 (cutoff times, holiday lists, occasion rules and IANA zones are all still there).
 */
function isSunday(date: IsoDate): boolean {
  const [year, month, day] = IsoDateSchema.parse(date).split("-").map(Number);
  return (
    new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay() === 0
  );
}

/**
 * A surcharge row as the read model carries it, for the delivery date it applies to: an amount,
 * an **inclusive** window and a label key.
 *
 * The window is what a caller renders, so it is stated in delivery days rather than in the row's
 * storage bounds:
 *
 *  - a **closed** row is a named day (Valentine's, Women's Day) and reports `activeFrom` to the
 *    day before `activeTo` — the dataset's `activeTo` is the *exclusive* end of the window (spec
 *    002 §5.1's `CHECK (active_to > active_from)`), and a caller must never show an exclusive
 *    bound as a date a buyer can pick;
 *  - an **open-ended** row (the Sunday one) has no last day at all, and a `SurchargeSchema` window
 *    has to be two dates, so it reports the delivery date it applies to. "This amount applies on
 *    this day" is both true and the thing the date chip states; reporting the row's own start
 *    date instead would put a September date on an October Sunday.
 */
function toSurcharge(row: CountryPriceRecord, date: IsoDate): Surcharge {
  if (row.surchargeKind === null) {
    throw new Error(
      `\`${row.sku}\` in \`${row.countryIso2}\` was read as a surcharge row but carries no \`surcharge_kind\``,
    );
  }
  return SurchargeSchema.parse({
    kind: row.surchargeKind,
    amountMinor: row.retailMinor,
    currency: row.currency,
    appliesFrom: row.activeTo === null ? date : row.activeFrom,
    appliesTo: row.activeTo === null ? date : previousDay(row.activeTo),
    labelKey: SURCHARGE_LABEL_KEYS[row.surchargeKind],
  });
}

/** The calendar day before a `YYYY-MM-DD` day. No zone, for `isSunday()`'s reason. */
function previousDay(date: IsoDate): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  const stepped = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - 1),
  );
  return stepped.toISOString().slice(0, 10);
}

/**
 * The surcharge rows of one (product, destination) that apply on one delivery date.
 *
 * Every match is returned: two live surcharges on one date would both be charged, which is why
 * `catalogue:check`'s `ambiguous-price` mode refuses overlapping windows in the dataset rather
 * than this function picking one.
 */
function surchargesOn(
  rows: readonly CountryPriceRecord[],
  productId: string,
  countryIso: string,
  date: IsoDate,
): readonly Surcharge[] {
  return rows
    .filter(
      (row) =>
        row.sku === productId &&
        row.countryIso2 === countryIso &&
        surchargeAppliesOn(row, date),
    )
    .map((row) => toSurcharge(row, date))
    .sort((left, right) => left.kind.localeCompare(right.kind));
}

/**
 * The `PricePoint` of one retail row plus the surcharges that apply, VAT split included.
 *
 * The gross is the retail amount **plus** the surcharge amounts — added, never multiplied — and
 * the VAT split is taken from that gross at the row's rate. A surcharge whose row carries a
 * different rate throws: a `PricePoint` states one `vatRateBp`, so a mixed-rate price could only
 * be represented by dropping part of it, and `vatBreakdown()` is where more than one rate lives
 * (spec 005 §5.2, AC-13).
 */
function pricePointFrom(
  retail: CountryPriceRecord,
  surcharges: readonly Surcharge[],
): PricePoint {
  for (const surcharge of surcharges) {
    if (surcharge.currency !== retail.currency) {
      throw new Error(
        `surcharge \`${surcharge.kind}\` for \`${retail.sku}\` in \`${retail.countryIso2}\` is in ${surcharge.currency} but the retail row is in ${retail.currency}`,
      );
    }
  }
  const gross = sumMoney([
    { amountMinor: retail.retailMinor, currency: retail.currency },
    ...surcharges.map((surcharge) => ({
      amountMinor: surcharge.amountMinor,
      currency: surcharge.currency,
    })),
  ]);
  const { netMinor, vatMinor } = netFromGross(
    gross.amountMinor,
    retail.vatRateBp,
  );

  return PricePointSchema.parse({
    amountMinor: gross.amountMinor,
    currency: gross.currency,
    vatRateBp: retail.vatRateBp,
    vatAmountMinor: vatMinor,
    netAmountMinor: netMinor,
    deliveryIncluded: true,
    surcharges,
    activeFrom: retail.activeFrom,
    activeTo: retail.activeTo,
    priceVersion: priceVersionFor(retail, surcharges),
  });
}

/**
 * The opaque version of the priced row set (spec 005 §5.2 `PricePoint.priceVersion`).
 *
 * It identifies the rows the buyer's price came from — the retail row by its natural key and
 * `activeFrom`, plus each applied surcharge by kind and start date — so spec 010's quote and spec
 * 013's charge can be traced to the rows the page showed, and `verifyQuote()` can refuse a quote
 * whose version no longer resolves (AC-17, TASK-068). **No caller parses it**; it carries no
 * personal data and no amount, so it is safe in a form field or a log (spec 005 §8).
 */
function priceVersionFor(
  retail: CountryPriceRecord,
  surcharges: readonly Surcharge[],
): string {
  const base = [
    "cp",
    retail.sku,
    retail.countryIso2,
    retail.tierKey ?? "-",
    retail.activeFrom,
  ].join(":");
  const applied = surcharges
    .map((surcharge) => `${surcharge.kind}@${surcharge.appliesFrom}`)
    .sort((left, right) => left.localeCompare(right));
  return applied.length === 0 ? base : `${base}+${applied.join("+")}`;
}

/* -------------------------------------------------------------------------- */
/* The exported surface.                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The whole price of one tier of one product, delivered to one destination, on one date.
 *
 * The returned `amountMinor` is what the page shows, what the quote carries and what the buyer is
 * charged: VAT included at the destination's rate, delivery included by definition, and the
 * date's surcharge rows already added. Nothing else in the module returns a price, and this one
 * cannot return a partial one (AC-8).
 *
 * Throws — rather than returning a fake zero or picking a row — when the (product, tier,
 * destination) has no active price or more than one (spec 005 §5.2, §5.3).
 */
export async function resolvePrice(query: {
  readonly productId: string;
  readonly tierKey: string;
  readonly countryIso: CountryIso2;
  readonly deliveryDate?: IsoDate;
}): Promise<PricePoint> {
  const { productId, tierKey, countryIso, deliveryDate } =
    ResolvePriceQuerySchema.parse(query);
  const rows = await catalogProviders().price.countryPrices();
  const retail = activeRetailRow(rows, productId, tierKey, countryIso);
  const surcharges =
    deliveryDate === undefined
      ? []
      : surchargesOn(rows, productId, countryIso, deliveryDate);
  return pricePointFrom(retail, surcharges);
}

/**
 * Every tier of a product priced for a destination, in the authored ladder order (spec 005 §5.2).
 *
 * One call gives the PDP its whole tier ladder with the preselected tier marked, so the page never
 * derives a step from a percentage (a float and a rounding bug — spec 005 §5.2) and never renders
 * a tier whose price it could not resolve: a tier with no active row throws here exactly as it
 * does in `resolvePrice()`.
 */
export async function tierPrices(query: {
  readonly productId: string;
  readonly countryIso: CountryIso2;
  readonly deliveryDate?: IsoDate;
}): Promise<readonly TierPrice[]> {
  const { productId, countryIso, deliveryDate } =
    TierPricesQuerySchema.parse(query);
  const tiers = await listTiers(productId);
  const rows = await catalogProviders().price.countryPrices();
  const surcharges =
    deliveryDate === undefined
      ? []
      : surchargesOn(rows, productId, countryIso, deliveryDate);

  return tiers.map((tier) => ({
    tierKey: tier.tierKey,
    isDefault: tier.isDefault,
    price: pricePointFrom(
      activeRetailRow(rows, productId, tier.tierKey, countryIso),
      surcharges,
    ),
  }));
}

/**
 * The cheapest tier's whole price for a destination — the "from" figure of a category or
 * collection page (spec 005 §6, §13 Q10).
 *
 * It is a **`PricePoint`**, not a bare amount, so the "from" text on a card is the price of a real
 * purchasable configuration rather than an indicative number no `Offer` could match; spec 008
 * renders it as visible text only and emits no `Offer` for it (spec 005 §6). There is no date
 * parameter: a from-price with a Sunday surcharge in it would be the price of a configuration the
 * card does not describe.
 *
 * A destination-**less** hub shows no money at all in Phase 0 (§13 Q10), which is why this
 * function has no variant without a `countryIso`: there is no price without a destination.
 */
export async function fromPrice(query: {
  readonly productId: string;
  readonly countryIso: CountryIso2;
}): Promise<PricePoint> {
  const { productId, countryIso } = FromPriceQuerySchema.parse(query);
  const prices = await tierPrices({ productId, countryIso });
  const cheapest = [...prices].sort(
    (left, right) => left.price.amountMinor - right.price.amountMinor,
  )[0];
  if (cheapest === undefined) {
    throw new Error(
      `\`${productId}\` has no priced tier in \`${countryIso}\`: a "from" figure with no configuration behind it is the price of nothing (spec 005 §6)`,
    );
  }
  return cheapest.price;
}

/**
 * Every surcharge that applies on every day of a date range, for one destination (spec 005 §5.2,
 * AC-16).
 *
 * This is the function `plan/07` §4 requires: spec 009 asks it for the weeks its date picker
 * shows and puts each amount **on the date chip before the date is selected**, so a Sunday or a
 * Women's Day delivery is never a surprise discovered at checkout. Each entry carries the exact
 * amount, its currency, its window and its message key — nothing to compute, nothing to
 * multiply, nothing to translate at the call site.
 *
 * The range is over **delivery dates**, so the result is one entry per (date, surcharge) rather
 * than one per row: a caller holding a chip for 14 Feb 2027 wants that day's amount, not a
 * window to intersect. The amount for a destination is one amount per kind — every product's rows
 * carry it (`catalogue:check`'s `surcharge-amount` mode ties each row to the destination's
 * authored figure), so a disagreement between two products' rows **throws** here rather than one
 * of them being shown on a chip that applies to the whole catalogue.
 */
export async function dateSurcharges(
  countryIso: CountryIso2,
  dateRange: { readonly from: IsoDate; readonly to: IsoDate },
): Promise<readonly DatedSurcharge[]> {
  const destination = DestinationIsoSchema.parse(countryIso);
  const range = SurchargeDateRangeSchema.parse(dateRange);
  const rows = (await catalogProviders().price.countryPrices()).filter(
    (row) => row.countryIso2 === destination && row.surchargeKind !== null,
  );

  const dated: DatedSurcharge[] = [];
  const span = daysBetween(range.from, range.to);
  for (let offset = 0; offset <= span; offset += 1) {
    const date = dayAfter(range.from, offset);
    const byKind = new Map<SurchargeKind, Surcharge>();
    for (const row of rows) {
      if (!surchargeAppliesOn(row, date)) continue;
      const surcharge = toSurcharge(row, date);
      const seen = byKind.get(surcharge.kind);
      if (seen === undefined) {
        byKind.set(surcharge.kind, surcharge);
        continue;
      }
      if (
        seen.amountMinor !== surcharge.amountMinor ||
        seen.currency !== surcharge.currency
      ) {
        throw new Error(
          `\`${destination}\` prices the \`${surcharge.kind}\` surcharge on ${date} at both ${String(seen.amountMinor)} and ${String(surcharge.amountMinor)}: the amount on a date chip is one amount per destination (spec 005 §13 Q7, plan/07 §4)`,
        );
      }
    }
    for (const surcharge of [...byKind.values()].sort((left, right) =>
      left.kind.localeCompare(right.kind),
    )) {
      dated.push({ ...surcharge, date });
    }
  }
  return dated;
}

/** The calendar day `offset` days after a `YYYY-MM-DD` day. No zone, for `isSunday()`'s reason. */
function dayAfter(date: IsoDate, offset: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number);
  const stepped = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + offset),
  );
  return stepped.toISOString().slice(0, 10);
}
