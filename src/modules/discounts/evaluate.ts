/**
 * `evaluateCode` (spec 047 §5.2, §14 A-orchestrator-2026-10-25 item 2; AC-29; TASK-445).
 *
 * Pure: the caller hands in the code and its scope rows, the clock, the purchase and the counts
 * `lockAndCount` returned, and gets back the amount and its allocation, or one refusal reason.
 *
 * **A code applies to the purchase.** Eligible lines are every line of every order whose product
 * and destination are in the code's scope; a bouquet's add-ons and date surcharge carry the
 * bouquet's product and destination, so they follow it (§13 Q2). `below_minimum` compares the
 * minimum with the eligible subtotal, and `wrong_destination` and `wrong_product` are returned
 * only when no line is eligible.
 *
 * **Order of checks** (§5.2): `locked` first, because a locked field looks nothing up (§2 "Abuse
 * limits"), then `unknown` (which also covers a disabled code), `not_started`, `ended`,
 * `wrong_destination`, `wrong_product`, `wrong_currency`, `below_minimum`, `used_up`,
 * `already_used_by_you`. A percent amount that rounds to zero is `below_minimum`.
 *
 * **Geo-blocking (ADR-0006, AC-29):** the context has no field for the buyer's country, IP,
 * locale or user agent. A code may be limited by destination, never by who the buyer is.
 */
import {
  type AllocatedLine,
  allocateDiscount,
  discountAmount,
  type Money,
  type PricedLine,
} from "./allocate";
import type {
  DiscountKind,
  DiscountRefusalReason,
  DiscountStoredStatus,
} from "./schemas";

/** The `discount_code` row as evaluation reads it. */
export interface EvaluableCode {
  readonly id: string;
  readonly codeNormalised: string;
  readonly kind: DiscountKind;
  readonly percentBp: number | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly maxRedemptions: number | null;
  readonly maxPerEmail: number | null;
  readonly status: DiscountStoredStatus;
}

/** One `discount_code_currency` row. */
export interface EvaluableCurrency {
  readonly currency: string;
  readonly amountOffMinor: number | null;
  readonly minOrderMinor: number;
}

/** One line of the purchase: its price, and the bouquet and destination it belongs to. */
export interface PurchaseLine extends PricedLine {
  readonly destinationCountryId: string;
  readonly productId: string;
}

/** Distinct purchases already using the code in this mode, in total and for this email key. */
export interface DiscountCounts {
  readonly uses: number;
  readonly usesForEmail: number;
}

/** Everything `evaluateCode` reads. No buyer country, IP, locale or user agent (AC-29). */
export interface EvaluationContext {
  /** Null when the typed text normalised to nothing or matched no code. */
  readonly code: EvaluableCode | null;
  readonly currencies: readonly EvaluableCurrency[];
  /** Destinations in scope; empty means all. */
  readonly countryIds: readonly string[];
  /** Products in scope; empty means all. */
  readonly productIds: readonly string[];
  readonly now: Date;
  readonly purchase: {
    readonly currency: string;
    readonly lines: readonly PurchaseLine[];
  };
  /** `emailKey()` of the buyer's email, or null before step 3 saves it. */
  readonly emailKey: string | null;
  readonly counts: DiscountCounts;
  /** The per-checkout guessing lock (`attempts.ts`, TASK-447). */
  readonly locked: boolean;
}

export type Evaluation<L extends PurchaseLine = PurchaseLine> =
  | {
      readonly ok: true;
      readonly amount: Money;
      /** Every purchase line, in order, with its share (zero for a line out of scope). */
      readonly allocation: readonly AllocatedLine<L>[];
    }
  | { readonly ok: false; readonly reason: DiscountRefusalReason };

function refuse(reason: DiscountRefusalReason): {
  readonly ok: false;
  readonly reason: DiscountRefusalReason;
} {
  return { ok: false, reason };
}

/** The amount and allocation of a code on a purchase, or why it is refused. */
export function evaluateCode<L extends PurchaseLine>(
  context: Omit<EvaluationContext, "purchase"> & {
    readonly purchase: {
      readonly currency: string;
      readonly lines: readonly L[];
    };
  },
): Evaluation<L> {
  if (context.locked) return refuse("locked");
  const code = context.code;
  if (code === null || code.status !== "active") return refuse("unknown");
  if (context.now.getTime() < code.startsAt.getTime())
    return refuse("not_started");
  if (code.endsAt !== null && context.now.getTime() >= code.endsAt.getTime()) {
    return refuse("ended");
  }

  const inDestination = (line: PurchaseLine) =>
    context.countryIds.length === 0 ||
    context.countryIds.includes(line.destinationCountryId);
  const inProducts = (line: PurchaseLine) =>
    context.productIds.length === 0 ||
    context.productIds.includes(line.productId);
  const lines = context.purchase.lines;
  if (!lines.some(inDestination)) return refuse("wrong_destination");
  const eligible = lines.map((line) => inDestination(line) && inProducts(line));
  if (!eligible.includes(true)) return refuse("wrong_product");

  const currency = context.purchase.currency;
  const row = context.currencies.find((entry) => entry.currency === currency);
  if (code.kind === "fixed" && (row?.amountOffMinor ?? null) === null) {
    return refuse("wrong_currency");
  }

  const subtotalMinor = lines.reduce(
    (sum, line, index) =>
      eligible[index] === true ? sum + line.grossMinor : sum,
    0,
  );
  if (subtotalMinor < (row?.minOrderMinor ?? 0)) return refuse("below_minimum");
  const amount = discountAmount(
    {
      kind: code.kind,
      percentBp: code.percentBp,
      currencies: context.currencies,
    },
    { amountMinor: subtotalMinor, currency },
  );
  if (amount.amountMinor <= 0) return refuse("below_minimum");

  if (
    code.maxRedemptions !== null &&
    context.counts.uses >= code.maxRedemptions
  ) {
    return refuse("used_up");
  }
  if (
    context.emailKey !== null &&
    code.maxPerEmail !== null &&
    context.counts.usesForEmail >= code.maxPerEmail
  ) {
    return refuse("already_used_by_you");
  }

  const shares = allocateDiscount(
    lines.filter((_line, index) => eligible[index] === true),
    amount,
  );
  let next = 0;
  const allocation = lines.map((line, index) => {
    if (eligible[index] !== true) {
      return { ...line, shareMinor: 0, paidMinor: line.grossMinor };
    }
    const share = shares[next];
    next += 1;
    if (share === undefined) throw new RangeError("allocation lost a line");
    return share;
  });
  return { ok: true, amount, allocation };
}
