/**
 * The VAT split (spec 005 §5.2 `pricing/vat.ts`, §8 "VAT", AC-13; TASK-065).
 *
 * Two functions, both integer, both stateless. This is the input to `order.vat_breakdown`
 * (spec 015) and to the per-rate lines of the invoice `plan/07` §4 requires ("net, VAT rate(s) and
 * amounts by rate — PL 8% flowers / 23% add-ons"), and spec 005 **stores none of it**: the
 * arithmetic lives here so that the invoice, the order record and the page cannot each derive it
 * slightly differently.
 *
 * Three properties matter, and each is a rule rather than a preference:
 *
 *  - **Gross is the input, never the output.** Every amount in this codebase is gross — VAT and
 *    delivery included, the price shown is the price charged (`CLAUDE.md`, `plan/07` §4, CRD
 *    Art. 6 as amended by Omnibus, the UK DMCC drip-pricing ban) — so the split is derived *from*
 *    the gross with `gross x rateBp / (10 000 + rateBp)` and never the gross from a net. A
 *    function that built a gross from a net would be a function that could produce a
 *    VAT-exclusive price to display, which AC-8 exists to make unreachable.
 *  - **The rate lines sum to the basket total exactly.** Per entry
 *    `netMinor + vatMinor === grossMinor` (a schema refinement), and the entries' gross amounts
 *    are the lines' own gross amounts re-grouped, so their sum is the basket total *by
 *    construction* rather than by luck of rounding — which is what AC-13's 1 000 randomised
 *    property-test baskets check, including baskets that mix 0 %, 8 % and 23 % lines.
 *  - **Mixed rates are the normal case.** PL flowers are 800 bp while PL chocolates are 2 300 bp
 *    (`plan/06` §4 item 4, spec 005 §13 Q3), and a free `card` line at any rate contributes a
 *    zero to its rate's group rather than disappearing — the invoice and the order summary show
 *    the same set of lines (spec 005 §2).
 *
 * No float, no `Math.round` on money, no percentage: the rate is basis points end to end and the
 * one division is `divideMinorHalfUp()`'s exact `BigInt` one (spec 005 §8: "no float touches a tax
 * figure").
 */
import { GrossAtRateSchema, VatLineSchema, VatSplitSchema } from "../schemas";
import type { VatLine, VatSplit } from "../types";

import { assertSameCurrency, divideMinorHalfUp } from "./money";

/** Basis points of the whole: 10 000 bp = 100 %, the unit spec 002 §5.1 stores rates in. */
const BASIS_POINTS_SCALE = 10_000;

/**
 * The net and VAT parts of a **gross** amount at a rate in basis points.
 *
 * `vatMinor = round_half_up(grossMinor x rateBp / (10 000 + rateBp))` — the rate applies to the
 * net, so the fraction of the *gross* that is VAT has the rate in its denominator too; getting
 * that backwards is the classic 8 %-of-gross error that under-reports the tax on every line.
 * `netMinor` is then `grossMinor - vatMinor`, so the two parts add up to the gross exactly
 * whichever way the rounded cent went (AC-13).
 *
 * A 0 bp line (a zero-rated supply) yields `{ netMinor: grossMinor, vatMinor: 0 }`, and a 0
 * amount yields two zeroes — a free `card` line is still a line (spec 005 §2).
 */
export function netFromGross(
  grossMinor: number,
  vatRateBp: number,
): { readonly netMinor: number; readonly vatMinor: number } {
  const line = GrossAtRateSchema.parse({ rateBp: vatRateBp, grossMinor });
  const vatMinor = divideMinorHalfUp(
    line.grossMinor * line.rateBp,
    BASIS_POINTS_SCALE + line.rateBp,
  );
  return { netMinor: line.grossMinor - vatMinor, vatMinor };
}

/**
 * The basket's gross amounts grouped by rate, each split into net and VAT (spec 005 §5.2).
 *
 * Entries come back in ascending `rateBp`, so two callers computing the same basket produce
 * byte-identical breakdowns (an invoice is a document: its line order cannot depend on a map's
 * insertion order). Every line must be in one currency — a mixed-currency basket is a caller
 * defect, and converting one silently would be a converted amount with no rate stamped on it
 * (spec 005 §5.4).
 *
 * An empty basket is `[]` rather than a throw: a basket with no lines has no rate to report, and
 * its total is zero in the currency the caller already knows.
 */
export function vatBreakdown(lines: readonly VatLine[]): readonly VatSplit[] {
  const parsed = lines.map((line) => VatLineSchema.parse(line));
  if (parsed.length === 0) return [];
  assertSameCurrency(
    parsed.map((line) => ({
      amountMinor: line.grossMinor,
      currency: line.currency,
    })),
  );

  const grossByRate = new Map<number, number>();
  for (const line of parsed) {
    grossByRate.set(
      line.rateBp,
      (grossByRate.get(line.rateBp) ?? 0) + line.grossMinor,
    );
  }

  return [...grossByRate.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rateBp, grossMinor]) => {
      const { netMinor, vatMinor } = netFromGross(grossMinor, rateBp);
      return VatSplitSchema.parse({ rateBp, netMinor, vatMinor, grossMinor });
    });
}
