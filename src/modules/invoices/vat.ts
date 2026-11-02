/**
 * The invoice's VAT arithmetic (spec 018 §5.2 "VAT arithmetic", AC-17, AC-21; TASK-341).
 *
 * Pure and integer: amounts are minor units of one currency, rates are basis points, and the one
 * division is an exact `BigInt` one with **round half to even** (§5.2: "VAT per rate is
 * `round_half_even(gross × rate / (10 000 + rate))` on the group total; net is gross minus VAT").
 * No float touches a figure.
 *
 *  - `invoiceByRate` groups the order's lines by `vat_rate_bp`, checks the gross per rate against
 *    `order.vat_breakdown` and the sum against `order.buyer_total_minor` (else
 *    `INVOICE_TOTAL_MISMATCH`), and splits the gross of the VAT-bearing lines per rate. A line
 *    whose kind the profile does not list in `vat_bearing_line_kinds` is printed outside VAT
 *    (AC-18's agent profile); under `principal/PL` every kind bears VAT.
 *  - `creditByRate` is the credit note: negative per-rate amounts summing to the refund. A refund
 *    equal to what is left of the invoice nets every rate to zero exactly (the remainder per rate
 *    is negated, never re-rounded); a smaller one is split only when one rate is left (see
 *    `./errors.ts`, `INVOICE_CREDIT_SPLIT_OPEN`).
 *
 * Why half-even never differs from the order's half-up on Poland's rates: VAT lands on exactly
 * half a minor unit only when `2 × gross × rate` is an odd multiple of `10 000 + rate`. At 800 bp
 * that is `4 × gross = 27 × odd` and at 2 300 bp `46 × gross = 123 × odd`: an even number equal
 * to an odd one, so never. At 2 000 bp (gross 3, 9, 15, …) it happens, which is why the rule is
 * written once, here, and tested on 2 000 bp as well.
 */
import { InvoiceRefusal } from "./errors";

const BASIS_POINTS = 10_000n;

/** `numerator / denominator` rounded half to even. Both non-negative; `denominator > 0`. */
export function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError("divideHalfEven takes a non-negative numerator");
  }
  const quotient = numerator / denominator;
  const twiceRemainder = (numerator % denominator) * 2n;
  if (twiceRemainder > denominator) return quotient + 1n;
  if (twiceRemainder < denominator) return quotient;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

/** The VAT inside a gross amount at `rateBp`, half to even. Sign follows the gross. */
export function vatOfGross(grossMinor: number, rateBp: number): number {
  if (!Number.isSafeInteger(grossMinor) || !Number.isSafeInteger(rateBp)) {
    throw new RangeError(
      "vatOfGross takes integer minor units and basis points",
    );
  }
  if (rateBp < 0 || rateBp > 10_000) {
    throw new RangeError("a VAT rate is 0 to 10 000 basis points");
  }
  const magnitude = divideHalfEven(
    BigInt(Math.abs(grossMinor)) * BigInt(rateBp),
    BASIS_POINTS + BigInt(rateBp),
  );
  return grossMinor < 0 ? -Number(magnitude) : Number(magnitude);
}

/** One rate's split. `netMinor + vatMinor === grossMinor` always. */
export interface RateSplit {
  readonly rateBp: number;
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
}

/** A gross amount at a rate, split by §5.2's rule. */
export function splitGross(grossMinor: number, rateBp: number): RateSplit {
  const vatMinor = vatOfGross(grossMinor, rateBp);
  return { rateBp, netMinor: grossMinor - vatMinor, vatMinor, grossMinor };
}

/** An order line as the arithmetic reads it. */
export interface PricedLine {
  readonly kind: "product" | "addon" | "surcharge";
  readonly qty: number;
  readonly unitRetailMinor: number;
  readonly vatRateBp: number;
}

/** `order.vat_breakdown`, one entry per rate. */
export interface BreakdownEntry {
  readonly rateBp: number;
  readonly grossMinor: number;
}

export interface InvoiceArithmetic {
  /** The VAT-bearing lines per rate, ascending rate. */
  readonly byRate: readonly RateSplit[];
  /** The gross of the lines the profile prints outside VAT (0 under `principal/PL`). */
  readonly outsideVatMinor: number;
  readonly totals: {
    readonly netMinor: number;
    readonly vatMinor: number;
    readonly grossMinor: number;
  };
}

function groupByRate(
  entries: readonly { readonly rateBp: number; readonly grossMinor: number }[],
): Map<number, number> {
  const grouped = new Map<number, number>();
  for (const entry of entries) {
    grouped.set(
      entry.rateBp,
      (grouped.get(entry.rateBp) ?? 0) + entry.grossMinor,
    );
  }
  return grouped;
}

function sameGrossPerRate(
  left: ReadonlyMap<number, number>,
  right: ReadonlyMap<number, number>,
): boolean {
  const rates = new Set([...left.keys(), ...right.keys()]);
  for (const rate of rates) {
    if ((left.get(rate) ?? 0) !== (right.get(rate) ?? 0)) return false;
  }
  return true;
}

/**
 * The invoice's per-rate figures from the order (§5.2). Throws `INVOICE_TOTAL_MISMATCH` when the
 * lines' gross per rate differs from `vat_breakdown`'s, or either sum differs from
 * `buyer_total_minor`: the invoice never prints a number the buyer was not charged.
 */
export function invoiceByRate(input: {
  readonly orderId: string;
  readonly buyerTotalMinor: number;
  readonly lines: readonly PricedLine[];
  readonly breakdown: readonly BreakdownEntry[];
  readonly vatBearingKinds: readonly string[];
}): InvoiceArithmetic {
  const lineGross = input.lines.map((line) => ({
    rateBp: line.vatRateBp,
    grossMinor: line.unitRetailMinor * line.qty,
    bearing: input.vatBearingKinds.includes(line.kind),
  }));
  const fromLines = groupByRate(lineGross);
  const fromOrder = groupByRate(input.breakdown);
  const sum = (values: Iterable<number>) =>
    [...values].reduce((total, value) => total + value, 0);
  if (
    input.lines.length === 0 ||
    !sameGrossPerRate(fromLines, fromOrder) ||
    sum(fromLines.values()) !== input.buyerTotalMinor ||
    sum(fromOrder.values()) !== input.buyerTotalMinor
  ) {
    throw new InvoiceRefusal("INVOICE_TOTAL_MISMATCH", {
      orderId: input.orderId,
    });
  }
  const bearing = groupByRate(lineGross.filter((line) => line.bearing));
  const byRate = [...bearing.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rateBp, grossMinor]) => splitGross(grossMinor, rateBp));
  const outsideVatMinor = sum(
    lineGross.filter((line) => !line.bearing).map((line) => line.grossMinor),
  );
  const vatMinor = sum(byRate.map((split) => split.vatMinor));
  return {
    byRate,
    outsideVatMinor,
    totals: {
      netMinor: input.buyerTotalMinor - vatMinor,
      vatMinor,
      grossMinor: input.buyerTotalMinor,
    },
  };
}

export interface CreditArithmetic {
  /** Negative per rate, ascending rate. */
  readonly byRate: readonly RateSplit[];
  /** Negative: the part of the refund outside VAT. */
  readonly outsideVatMinor: number;
  readonly totals: {
    readonly netMinor: number;
    readonly vatMinor: number;
    readonly grossMinor: number;
  };
}

function totalsOf(
  byRate: readonly RateSplit[],
  outsideVatMinor: number,
): CreditArithmetic["totals"] {
  const netMinor =
    byRate.reduce((total, split) => total + split.netMinor, 0) +
    outsideVatMinor;
  const vatMinor = byRate.reduce((total, split) => total + split.vatMinor, 0);
  return { netMinor, vatMinor, grossMinor: netMinor + vatMinor };
}

/**
 * A credit note's figures (AC-21): `remaining` is the invoice per rate plus every earlier credit
 * note of it (so, what is left), `refundMinor` the refund's positive amount, in the invoice's
 * currency (the caller checks the currency).
 *
 *  - refund = what is left → each rate's remainder negated: the invoice and its credit notes net
 *    to zero per rate, net, VAT and gross alike;
 *  - refund < what is left, one rate (or only the outside-VAT part) left → that rate, split by
 *    §5.2's rule, negative;
 *  - refund < what is left across two or more parts → `INVOICE_CREDIT_SPLIT_OPEN` (escalated);
 *  - refund > what is left, or nothing is left → `INVOICE_TOTAL_MISMATCH`.
 */
export function creditByRate(input: {
  readonly orderId: string;
  readonly refundId: string;
  readonly refundMinor: number;
  readonly remaining: readonly RateSplit[];
  readonly remainingOutsideVatMinor: number;
}): CreditArithmetic {
  const left =
    input.remaining.reduce((total, split) => total + split.grossMinor, 0) +
    input.remainingOutsideVatMinor;
  const ids = { orderId: input.orderId, refundId: input.refundId };
  if (
    !Number.isSafeInteger(input.refundMinor) ||
    input.refundMinor <= 0 ||
    input.refundMinor > left
  ) {
    throw new InvoiceRefusal("INVOICE_TOTAL_MISMATCH", ids);
  }
  if (input.refundMinor === left) {
    const byRate = input.remaining
      .filter((split) => split.grossMinor !== 0)
      .map((split) => ({
        rateBp: split.rateBp,
        netMinor: -split.netMinor,
        vatMinor: -split.vatMinor,
        grossMinor: -split.grossMinor,
      }));
    const outsideVatMinor = -input.remainingOutsideVatMinor;
    return {
      byRate,
      outsideVatMinor,
      totals: totalsOf(byRate, outsideVatMinor),
    };
  }
  const open = input.remaining.filter((split) => split.grossMinor > 0);
  const parts = open.length + (input.remainingOutsideVatMinor > 0 ? 1 : 0);
  if (parts !== 1) {
    throw new InvoiceRefusal("INVOICE_CREDIT_SPLIT_OPEN", ids);
  }
  const [only] = open;
  if (only === undefined) {
    const outsideVatMinor = -input.refundMinor;
    return {
      byRate: [],
      outsideVatMinor,
      totals: totalsOf([], outsideVatMinor),
    };
  }
  const byRate = [splitGross(-input.refundMinor, only.rateBp)];
  return { byRate, outsideVatMinor: 0, totals: totalsOf(byRate, 0) };
}

/** `remaining` after `notes`: the invoice per rate plus each (negative) credit note, per rate. */
export function remainingByRate(
  invoice: readonly RateSplit[],
  notes: readonly (readonly RateSplit[])[],
): RateSplit[] {
  const byRate = new Map<number, RateSplit>();
  for (const split of [...invoice, ...notes.flat()]) {
    const current = byRate.get(split.rateBp) ?? {
      rateBp: split.rateBp,
      netMinor: 0,
      vatMinor: 0,
      grossMinor: 0,
    };
    byRate.set(split.rateBp, {
      rateBp: split.rateBp,
      netMinor: current.netMinor + split.netMinor,
      vatMinor: current.vatMinor + split.vatMinor,
      grossMinor: current.grossMinor + split.grossMinor,
    });
  }
  return [...byRate.values()].sort((left, right) => left.rateBp - right.rateBp);
}
