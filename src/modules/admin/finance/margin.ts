/**
 * The one calculation of an order's money (spec 030b §2.3, §5.2 "Pure functions, exactly";
 * AC-11 to AC-17, AC-19; TASK-440). Pure: no I/O, no clock, no float.
 *
 *  - `allocateByWeight`: largest remainder, ties to the lower id, the sign applied last; the
 *    parts always add up to the total;
 *  - `toReporting`: an amount in a currency to EUR at an EUR-based `fx_rate` row, half away from
 *    zero, no FX buffer (spec 005's `convert` is a buyer-price function and is not used);
 *  - `rateOn`: the newest ECB row at most `rateLookbackDays` before the date; EUR is 1 000 000;
 *  - `refundVatEstimate`: the VAT of a refund pro rata to the order's gross, per rate;
 *  - `orderMargin`: §5.2's twelve steps, B = buyer currency, C = florist currency, R = EUR;
 *  - `marginBp`, `rollUp`.
 *
 * Every amount is a `bigint` of minor units beside its ISO code. Rates are integer parts per
 * million. The module never forms a float and never divides by a hundred (AC-21).
 */
import { FINANCE_CONFIG, type FinanceConfig } from "@/config/finance";
import { currencyConfig, isCurrencyCode } from "@/config/currencies";

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                  */
/* -------------------------------------------------------------------------- */

const PPM = 1_000_000n;
const BP = 10_000n;

/** `n ÷ d` rounded half away from zero; `d` is positive. */
export function divideRounded(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError("a divisor is positive");
  const negative = n < 0n;
  const magnitude = negative ? -n : n;
  const quotient = (magnitude * 2n + d) / (d * 2n);
  return negative ? -quotient : quotient;
}

/** One part of `allocateByWeight`. */
export interface WeightedPart {
  readonly id: string;
  readonly weight: bigint;
}

/** Thrown by `allocateByWeight` when every weight is zero. */
export class AllocationWeightsZero extends Error {
  readonly code = "ALLOCATION_WEIGHTS_ZERO";
  constructor() {
    super("ALLOCATION_WEIGHTS_ZERO: every weight is zero");
  }
}

/**
 * §5.2: each part gets `floor(|total| × weight ÷ Σweight)`; the units left go one each to the
 * largest fractional remainders, ties to the lower id; the sign of `total` is applied last.
 */
export function allocateByWeight(
  total: bigint,
  parts: readonly WeightedPart[],
): Map<string, bigint> {
  const sum = parts.reduce((acc, part) => {
    if (part.weight < 0n) throw new RangeError("a weight is not negative");
    return acc + part.weight;
  }, 0n);
  if (sum === 0n) throw new AllocationWeightsZero();
  const negative = total < 0n;
  const magnitude = negative ? -total : total;
  const shares = parts.map((part) => {
    const scaled = magnitude * part.weight;
    return { id: part.id, base: scaled / sum, remainder: scaled % sum };
  });
  let left = magnitude - shares.reduce((acc, share) => acc + share.base, 0n);
  const order = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  const extra = new Map<string, bigint>();
  for (const share of order) {
    if (left === 0n) break;
    extra.set(share.id, 1n);
    left -= 1n;
  }
  const result = new Map<string, bigint>();
  for (const share of shares) {
    const value = share.base + (extra.get(share.id) ?? 0n);
    result.set(share.id, negative ? -value : value);
  }
  return result;
}

/**
 * §5.2: `amountMinor × 10^toExponent × 1 000 000 ÷ (eurToFromRatePpm × 10^fromExponent)`, half
 * away from zero, on the EUR-based row directly.
 */
export function toReporting(
  amountMinor: bigint,
  fromExponent: number,
  toExponent: number,
  eurToFromRatePpm: bigint,
): bigint {
  if (eurToFromRatePpm <= 0n) throw new RangeError("a rate is positive");
  return divideRounded(
    amountMinor * 10n ** BigInt(toExponent) * PPM,
    eurToFromRatePpm * 10n ** BigInt(fromExponent),
  );
}

/** §5.2: `M_R × 10 000 ÷ N_R`, half away from zero; `null` when the net sale is not positive. */
export function marginBp(marginMinor: bigint, netMinor: bigint): bigint | null {
  if (netMinor <= 0n) return null;
  return divideRounded(marginMinor * BP, netMinor);
}

/** One VAT rate of an order's `vat_breakdown`. */
export interface VatSplit {
  readonly rateBp: number;
  readonly vatMinor: bigint;
}

/** §5.2: `Σ vat × refundMinor ÷ gross` per rate, half away from zero (no credit note only). */
export function refundVatEstimate(
  refundMinor: bigint,
  grossMinor: bigint,
  vatBreakdown: readonly VatSplit[],
): bigint {
  if (grossMinor <= 0n) return 0n;
  return vatBreakdown.reduce(
    (acc, split) =>
      acc + divideRounded(split.vatMinor * refundMinor, grossMinor),
    0n,
  );
}

/* -------------------------------------------------------------------------- */
/* Rates                                                                       */
/* -------------------------------------------------------------------------- */

/** One dated ECB row, `1 EUR = ratePpm / 1 000 000 quote`. */
export interface RateRow {
  readonly asOf: string;
  readonly ratePpm: bigint;
}

/** Per quote currency, its EUR-based rows newest first. */
export type RateBook = ReadonlyMap<string, readonly RateRow[]>;

/** Builds a `RateBook` from rows in any order. */
export function rateBookOf(
  rows: readonly {
    readonly currency: string;
    readonly asOf: string;
    readonly ratePpm: bigint;
  }[],
): RateBook {
  const book = new Map<string, RateRow[]>();
  for (const row of rows) {
    const list = book.get(row.currency) ?? [];
    list.push({ asOf: row.asOf, ratePpm: row.ratePpm });
    book.set(row.currency, list);
  }
  for (const list of book.values()) {
    list.sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0));
  }
  return book;
}

/** A rate an amount was converted at, with its date and source (AC-21). */
export interface RateUse {
  readonly base: string;
  readonly quote: string;
  readonly ratePpm: bigint;
  readonly asOf: string;
  readonly source: "ecb" | "stripe";
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` plus `days` (negative to go back), on the calendar. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * §5.2: the newest row for `EUR → currency` with `as_of` between `date − lookback` and `date`,
 * else `null`; EUR is rate 1 000 000 on every date.
 */
export function rateOn(
  book: RateBook,
  currency: string,
  date: string,
  lookbackDays: number = FINANCE_CONFIG.rateLookbackDays,
): RateUse | null {
  if (currency === "EUR") {
    return {
      base: "EUR",
      quote: "EUR",
      ratePpm: PPM,
      asOf: date,
      source: "ecb",
    };
  }
  const earliest = addDays(date, -lookbackDays);
  const row = (book.get(currency) ?? []).find(
    (candidate) => candidate.asOf <= date && candidate.asOf >= earliest,
  );
  return row === undefined
    ? null
    : {
        base: "EUR",
        quote: currency,
        ratePpm: row.ratePpm,
        asOf: row.asOf,
        source: "ecb",
      };
}

/** The newest row on or before `date`, however old (an unpaid florist amount, §13 Q6). */
export function newestRate(
  book: RateBook,
  currency: string,
  date: string,
): RateUse | null {
  if (currency === "EUR") return rateOn(book, currency, date);
  const row = (book.get(currency) ?? []).find(
    (candidate) => candidate.asOf <= date,
  );
  return row === undefined
    ? null
    : {
        base: "EUR",
        quote: currency,
        ratePpm: row.ratePpm,
        asOf: row.asOf,
        source: "ecb",
      };
}

/** The ISO 4217 exponent of a configured currency. */
export function exponentOf(currency: string): number {
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `a currency the application does not configure: ${currency}`,
    );
  }
  return currencyConfig(currency).minorUnitExponent;
}

/* -------------------------------------------------------------------------- */
/* Facts in, margin out                                                        */
/* -------------------------------------------------------------------------- */

/** The closed set of reasons a figure is provisional (§2.3). */
export const FINANCE_REASONS = [
  "fees_pending",
  "fees_unsupported_provider",
  "refund_pending",
  "florist_not_assigned",
  "florist_cost_pending",
  "adjustment_open",
  "fx_rate_missing",
] as const;
export type FinanceReason = (typeof FINANCE_REASONS)[number];

/** Statuses that end an order without a florist's work to pay for (§5.2 step 7). */
export const ENDED_WITHOUT_WORK_STATUSES: ReadonlySet<string> = new Set([
  "cancelled",
  "cancelled_refunded",
  "refunded_full",
]);

export const BALANCE_ROW_KINDS = [
  "charge",
  "refund",
  "refund_failure",
  "dispute",
  "dispute_reversal",
  "other",
] as const;
export type BalanceRowKind = (typeof BALANCE_ROW_KINDS)[number];

/** One `payment_balance_txn` row of the order's payment. */
export interface FinanceBalanceRow {
  readonly providerTxnRef: string;
  readonly kind: BalanceRowKind;
  readonly refundId: string | null;
  readonly amountMinor: bigint;
  readonly feeMinor: bigint;
  readonly settlementCurrency: string;
  readonly presentmentCurrency: string | null;
  readonly effectiveRatePpm: bigint | null;
  readonly createdOn: string;
}

/** One refund naming the order. */
export interface FinanceRefund {
  readonly refundId: string;
  readonly status: string;
  readonly amountMinor: bigint;
  readonly succeededOn: string | null;
  /** Spec 018's credit note VAT total, when one is issued for the refund. */
  readonly creditNoteVatMinor: bigint | null;
}

/** One `payout_line` of the order. */
export interface FinancePayoutLine {
  readonly kind: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly payoutStatus: string;
  readonly paidOn: string | null;
}

/** Everything `orderMargin` reads about one order. */
export interface FinanceOrderFacts {
  readonly orderId: string;
  readonly reference: string;
  readonly mode: "live" | "test";
  readonly purchaseId: string;
  readonly paymentId: string;
  readonly provider: string;
  readonly capturedAt: string;
  /** The calendar day of capture (UTC): the ECB rate's date. */
  readonly paidOn: string;
  readonly deliveryDate: string;
  readonly countryIso2: string;
  readonly status: string;
  readonly supplyModel: string | null;
  readonly buyerCurrency: string;
  readonly buyerTotalMinor: bigint;
  readonly vatTotalMinor: bigint;
  readonly vatBreakdown: readonly VatSplit[];
  readonly partnerId: string | null;
  readonly partnerCode: string | null;
  readonly partnerCity: string | null;
  readonly fixedMinor: bigint | null;
  readonly fixedCurrency: string | null;
  readonly payoutLines: readonly FinancePayoutLine[];
  readonly openAdjustments: number;
  readonly refunds: readonly FinanceRefund[];
  /** Every order of the purchase (this one included) with its `buyer_total_minor`. */
  readonly siblings: readonly WeightedPart[];
  /** Every balance row of the purchase's payment. */
  readonly balance: readonly FinanceBalanceRow[];
}

/** The reporting-currency figures of one order (§5.2 steps 1 to 10). */
export interface ReportingFigures {
  readonly gross: bigint;
  readonly settled: bigint;
  readonly fxCost: bigint;
  readonly refunds: bigint;
  readonly vat: bigint;
  readonly net: bigint;
  readonly floristCost: bigint;
  readonly fees: bigint;
  readonly disputes: bigint;
  readonly margin: bigint;
}

/** `orderMargin`'s output. */
export interface OrderMargin {
  readonly orderId: string;
  readonly reference: string;
  readonly mode: "live" | "test";
  readonly capturedAt: string;
  readonly paidOn: string;
  readonly deliveryDate: string;
  readonly countryIso2: string;
  readonly status: string;
  readonly supplyModel: string | null;
  readonly provider: string;
  readonly partnerId: string | null;
  readonly partnerCode: string | null;
  readonly partnerCity: string | null;
  readonly buyerCurrency: string;
  readonly grossMinor: bigint;
  /** VAT in the buyer currency, net of the VAT on succeeded refunds. */
  readonly vatMinor: bigint;
  readonly vatIsEstimate: boolean;
  /** Succeeded refunds in the buyer currency. */
  readonly refundsMinor: bigint;
  readonly floristCurrency: string | null;
  readonly floristCostMinor: bigint;
  /** The day the florist was paid, or `null` while unpaid (the newest rate is used then). */
  readonly floristPaidOn: string | null;
  readonly reporting: ReportingFigures | null;
  readonly marginBp: bigint | null;
  readonly saleRate: RateUse | null;
  readonly settledRate: RateUse | null;
  readonly floristRate: RateUse | null;
  /** True when a `charge` row exists (the settled amount is Stripe's, not the ECB gross). */
  readonly settledFromProvider: boolean;
  readonly balanceRefs: readonly {
    readonly ref: string;
    readonly kind: BalanceRowKind;
  }[];
  readonly reasons: readonly FinanceReason[];
  readonly final: boolean;
  /** True when the supply model needs the accountant (null or `agent`), whatever the config. */
  readonly needsAccountant: boolean;
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

/** The order's share of a purchase-level amount (§5.2 step 2). */
function shareOf(facts: FinanceOrderFacts, total: bigint): bigint {
  if (total === 0n) return 0n;
  const parts =
    facts.siblings.length === 0
      ? [{ id: facts.orderId, weight: facts.buyerTotalMinor }]
      : facts.siblings;
  return allocateByWeight(total, parts).get(facts.orderId) ?? 0n;
}

/**
 * §5.2 `orderMargin(facts, rateBook, config)`; `today` is the date an unpaid florist amount is
 * converted on (the newest rate on or before it).
 */
export function orderMargin(
  facts: FinanceOrderFacts,
  book: RateBook,
  today: string,
  config: FinanceConfig = FINANCE_CONFIG,
): OrderMargin {
  const reasons = new Set<FinanceReason>();
  let rateMissing = false;
  const R = config.reportingCurrency;
  const expR = exponentOf(R);
  const convert = (
    amount: bigint,
    currency: string,
    rate: RateUse | null,
  ): bigint => {
    if (rate === null) {
      rateMissing = true;
      return 0n;
    }
    return toReporting(amount, exponentOf(currency), expR, rate.ratePpm);
  };
  const lookback = config.rateLookbackDays;

  // 1. Gross and gross at ECB.
  const G = facts.buyerTotalMinor;
  const saleRate = rateOn(book, facts.buyerCurrency, facts.paidOn, lookback);
  const G_R = convert(G, facts.buyerCurrency, saleRate);

  // 2. Settled: this order's share of the charge rows.
  const charges = facts.balance.filter((row) => row.kind === "charge");
  let S_R: bigint;
  let settledRate: RateUse | null = null;
  if (charges.length === 0) {
    S_R = G_R;
    reasons.add(
      facts.provider === "mollie"
        ? "fees_unsupported_provider"
        : "fees_pending",
    );
  } else {
    const settledTotal = charges.reduce((acc, row) => {
      const rate =
        row.settlementCurrency === R
          ? null
          : rateOn(book, row.settlementCurrency, row.createdOn, lookback);
      return (
        acc +
        (row.settlementCurrency === R
          ? row.amountMinor
          : convert(row.amountMinor, row.settlementCurrency, rate))
      );
    }, 0n);
    S_R = shareOf(facts, settledTotal);
    const first = charges[0];
    if (
      first !== undefined &&
      first.effectiveRatePpm !== null &&
      first.presentmentCurrency !== null
    ) {
      settledRate = {
        base: first.presentmentCurrency,
        quote: first.settlementCurrency,
        ratePpm: first.effectiveRatePpm,
        asOf: first.createdOn,
        source: "stripe",
      };
    }
  }

  // 3. FX cost.
  const fxCost = G_R - S_R;

  // 4. Refunds; 5. VAT net of refunds.
  let Rf_R = 0n;
  let refundsMinor = 0n;
  let vatB = facts.vatTotalMinor;
  let vatIsEstimate = false;
  const ownRefunds = new Set(facts.refunds.map((refund) => refund.refundId));
  for (const refund of facts.refunds) {
    if (refund.status === "requested" || refund.status === "pending") {
      reasons.add("refund_pending");
      continue;
    }
    if (refund.status !== "succeeded") continue;
    refundsMinor += refund.amountMinor;
    const rows = facts.balance.filter(
      (row) => row.refundId === refund.refundId,
    );
    const refundRows = rows.filter((row) => row.kind === "refund");
    if (refundRows.length === 0) {
      reasons.add("fees_pending");
      Rf_R += convert(
        refund.amountMinor,
        facts.buyerCurrency,
        rateOn(
          book,
          facts.buyerCurrency,
          refund.succeededOn ?? facts.paidOn,
          lookback,
        ),
      );
    } else {
      const refunded = refundRows.reduce(
        (acc, row) => acc + abs(row.amountMinor),
        0n,
      );
      const failed = rows
        .filter((row) => row.kind === "refund_failure")
        .reduce((acc, row) => acc + abs(row.amountMinor), 0n);
      Rf_R += refunded - failed;
    }
    if (refund.creditNoteVatMinor === null) {
      vatIsEstimate = true;
      vatB -= refundVatEstimate(refund.amountMinor, G, facts.vatBreakdown);
    } else {
      vatB -= abs(refund.creditNoteVatMinor);
    }
  }
  const V_R = convert(vatB, facts.buyerCurrency, saleRate);

  // 6. Net sale.
  const N_R = S_R - Rf_R - V_R;

  // 7. Florist cost.
  let floristCurrency: string | null = null;
  let floristCostMinor = 0n;
  let floristPaidOn: string | null = null;
  let floristRate: RateUse | null = null;
  let P_R = 0n;
  if (facts.payoutLines.length > 0) {
    const first = facts.payoutLines[0];
    floristCurrency = first?.currency ?? null;
    const paidDays = facts.payoutLines
      .map((line) => (line.payoutStatus === "paid" ? line.paidOn : null))
      .filter((day): day is string => day !== null)
      .sort();
    for (const line of facts.payoutLines) {
      floristCostMinor +=
        line.currency === floristCurrency ? line.amountMinor : 0n;
      const paid = line.payoutStatus === "paid" && line.paidOn !== null;
      const rate = paid
        ? rateOn(book, line.currency, line.paidOn ?? today, lookback)
        : newestRate(book, line.currency, today);
      P_R += convert(line.amountMinor, line.currency, rate);
      if (
        floristRate === null ||
        (rate !== null && rate.asOf > floristRate.asOf)
      ) {
        floristRate = rate;
      }
    }
    floristPaidOn = paidDays.at(-1) ?? null;
  } else if (ENDED_WITHOUT_WORK_STATUSES.has(facts.status)) {
    floristCostMinor = 0n;
  } else if (facts.partnerId !== null) {
    floristCurrency = facts.fixedCurrency;
    floristCostMinor = facts.fixedMinor ?? 0n;
    reasons.add("florist_cost_pending");
    if (floristCurrency !== null && floristCostMinor !== 0n) {
      floristRate = newestRate(book, floristCurrency, today);
      P_R = convert(floristCostMinor, floristCurrency, floristRate);
    }
  } else {
    reasons.add("florist_not_assigned");
  }
  if (facts.openAdjustments > 0) reasons.add("adjustment_open");

  // 8. Fees: purchase-level rows by weight, refund rows to their order.
  const sharedFees = facts.balance
    .filter((row) => row.refundId === null)
    .reduce((acc, row) => acc + row.feeMinor, 0n);
  const refundFees = facts.balance
    .filter((row) => row.refundId !== null && ownRefunds.has(row.refundId))
    .reduce((acc, row) => acc + row.feeMinor, 0n);
  const F_R = shareOf(facts, sharedFees) + refundFees;

  // 9. Disputes: the net dispute loss, by weight, fees excluded.
  const disputeNet = facts.balance
    .filter((row) => row.kind === "dispute" || row.kind === "dispute_reversal")
    .reduce((acc, row) => acc + row.amountMinor, 0n);
  const D_R = shareOf(facts, disputeNet < 0n ? -disputeNet : 0n);

  // 10. Margin.
  const M_R = N_R - P_R - F_R - D_R;

  // 11. A missing rate nulls every reporting figure.
  if (rateMissing) reasons.add("fx_rate_missing");
  const reporting: ReportingFigures | null = rateMissing
    ? null
    : {
        gross: G_R,
        settled: S_R,
        fxCost,
        refunds: Rf_R,
        vat: V_R,
        net: N_R,
        floristCost: P_R,
        fees: F_R,
        disputes: D_R,
        margin: M_R,
      };

  // 12. Final exactly when no reason is left.
  const ordered = FINANCE_REASONS.filter((reason) => reasons.has(reason));
  return {
    orderId: facts.orderId,
    reference: facts.reference,
    mode: facts.mode,
    capturedAt: facts.capturedAt,
    paidOn: facts.paidOn,
    deliveryDate: facts.deliveryDate,
    countryIso2: facts.countryIso2,
    status: facts.status,
    supplyModel: facts.supplyModel,
    provider: facts.provider,
    partnerId: facts.partnerId,
    partnerCode: facts.partnerCode,
    partnerCity: facts.partnerCity,
    buyerCurrency: facts.buyerCurrency,
    grossMinor: G,
    vatMinor: vatB,
    vatIsEstimate,
    refundsMinor,
    floristCurrency,
    floristCostMinor,
    floristPaidOn,
    reporting,
    marginBp: reporting === null ? null : marginBp(M_R, N_R),
    saleRate,
    settledRate,
    floristRate,
    settledFromProvider: charges.length > 0,
    balanceRefs: facts.balance.map((row) => ({
      ref: row.providerTxnRef,
      kind: row.kind,
    })),
    reasons: ordered,
    final: ordered.length === 0,
    needsAccountant:
      facts.supplyModel === null || facts.supplyModel === "agent",
  };
}

/* -------------------------------------------------------------------------- */
/* Roll-up                                                                     */
/* -------------------------------------------------------------------------- */

/** A roll-up group: sums over orders with figures, native amounts per currency only. */
export interface FinanceGroup {
  readonly key: string;
  readonly orders: number;
  readonly withFigures: number;
  readonly final: number;
  readonly provisional: number;
  readonly rateMissing: number;
  readonly grossByCurrency: ReadonlyMap<string, bigint>;
  readonly vatByCurrency: ReadonlyMap<string, bigint>;
  readonly sums: ReportingFigures;
  readonly marginBp: bigint | null;
}

const ZERO_FIGURES: ReportingFigures = {
  gross: 0n,
  settled: 0n,
  fxCost: 0n,
  refunds: 0n,
  vat: 0n,
  net: 0n,
  floristCost: 0n,
  fees: 0n,
  disputes: 0n,
  margin: 0n,
};

function addFigures(
  a: ReportingFigures,
  b: ReportingFigures,
): ReportingFigures {
  return {
    gross: a.gross + b.gross,
    settled: a.settled + b.settled,
    fxCost: a.fxCost + b.fxCost,
    refunds: a.refunds + b.refunds,
    vat: a.vat + b.vat,
    net: a.net + b.net,
    floristCost: a.floristCost + b.floristCost,
    fees: a.fees + b.fees,
    disputes: a.disputes + b.disputes,
    margin: a.margin + b.margin,
  };
}

/** The group key of an order: `all`, its country, or its florist code (`""` when unassigned). */
function keyOf(order: OrderMargin, by: "all" | "country" | "partner"): string {
  if (by === "all") return "all";
  if (by === "country") return order.countryIso2;
  return order.partnerCode ?? "";
}

/**
 * §5.2 `rollUp(orders, by)`: sums the `_R` figures of orders whose figures are not null, native
 * gross and VAT per currency only, and counts final, provisional and rate-missing orders. Groups
 * come out in the order their first order arrives.
 */
export function rollUp(
  orders: readonly OrderMargin[],
  by: "all" | "country" | "partner",
): readonly FinanceGroup[] {
  const groups = new Map<
    string,
    {
      orders: number;
      withFigures: number;
      final: number;
      provisional: number;
      rateMissing: number;
      gross: Map<string, bigint>;
      vat: Map<string, bigint>;
      sums: ReportingFigures;
    }
  >();
  if (by === "all") {
    groups.set("all", {
      orders: 0,
      withFigures: 0,
      final: 0,
      provisional: 0,
      rateMissing: 0,
      gross: new Map(),
      vat: new Map(),
      sums: ZERO_FIGURES,
    });
  }
  for (const order of orders) {
    const key = keyOf(order, by);
    const group = groups.get(key) ?? {
      orders: 0,
      withFigures: 0,
      final: 0,
      provisional: 0,
      rateMissing: 0,
      gross: new Map<string, bigint>(),
      vat: new Map<string, bigint>(),
      sums: ZERO_FIGURES,
    };
    group.orders += 1;
    group.gross.set(
      order.buyerCurrency,
      (group.gross.get(order.buyerCurrency) ?? 0n) + order.grossMinor,
    );
    group.vat.set(
      order.buyerCurrency,
      (group.vat.get(order.buyerCurrency) ?? 0n) + order.vatMinor,
    );
    if (order.reporting === null) {
      group.rateMissing += 1;
    } else {
      group.withFigures += 1;
      group.sums = addFigures(group.sums, order.reporting);
      if (order.final) group.final += 1;
      else group.provisional += 1;
    }
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    orders: group.orders,
    withFigures: group.withFigures,
    final: group.final,
    provisional: group.provisional,
    rateMissing: group.rateMissing,
    grossByCurrency: group.gross,
    vatByCurrency: group.vat,
    sums: group.sums,
    marginBp: marginBp(group.sums.margin, group.sums.net),
  }));
}
