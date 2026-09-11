/**
 * Shared catalogue and pricing fixtures (spec 005 §2 "Tests and fixtures", AC-12; TASK-066).
 *
 * The file spec 005 reserves for "the price-band table of `plan/10` §2.3 as expected values per
 * (tier, country), an FX conversion table with hand-computed integer expectations, and a
 * mixed-VAT basket — the shared corpus 008/009/010/013/018 assert against". **TASK-069 owns the
 * file**; TASK-066 creates it with the one table it needs, additively, so that AC-12's
 * expectations live in the shared corpus from the first day rather than being copied into a test
 * and moved later. The band table and the mixed-VAT basket land with TASK-069.
 *
 * Every expectation below was computed **by hand in integers**, not recorded from the
 * implementation, which is the only way a test of arithmetic can fail usefully. The arithmetic is
 * spec 005 §2's, in two steps:
 *
 *   1. `bufferedMinor = ceil(amountMinor x ratePpm x (10 000 + 250) / (1 000 000 x 10 000))`
 *   2. `displayMinor  = ` the smallest amount `>= bufferedMinor` on the target currency's
 *      psychological ending (`EUR`/`GBP` `x90`, `PLN` `x9` — spec 005 §13 Q1)
 *
 * Both roundings go **up**: a converted amount is a cost to cover, and the 2.5% buffer exists to
 * absorb an intraday move rather than to be eroded by rounding (`plan/06` §2.2).
 *
 * The rates are the committed 2026-09-08 ECB snapshot (`src/config/catalogue/fx.data.ts`):
 * `EUR->GBP 846 500` and `EUR->PLN 4 268 000` parts per million. Only euro-base rates are
 * published, so two of the three directions are **derived**, each rounded up for the reason
 * above:
 *
 *   - `PLN->EUR = ceil(1 000 000 x 1 000 000 / 4 268 000) = ceil(234 301.78…) = 234 302`
 *   - `PLN->GBP = ceil(846 500 x 1 000 000 / 4 268 000) = ceil(198 336.45…) = 198 337`
 *
 * Two worked cases, longhand, so the table is checkable without running anything:
 *
 *   - **149 zł -> GBP.** `14 900 x 198 337 = 2 955 221 300`; `x 10 250 = 30 290 018 325 000`;
 *     `/ 10 000 000 000 = 3 029.0018…` -> `3 030`; up onto GBP's `x90` -> `3 090` = **£30.90**.
 *   - **€35.90 -> PLN.** `3 590 x 4 268 000 = 15 322 120 000`; `x 10 250 = 157 051 730 000 000`;
 *     `/ 10 000 000 000 = 15 705.173` -> `15 706`; up onto PLN's `x9` (a whole złoty ending in
 *     nine, i.e. `≡ 900 (mod 1 000)`) -> `15 900` = **159 zł**.
 *
 * The PLN column is where the ending granularity is visible and it is not a defect: `x9` in a
 * two-decimal currency means a ten-złoty lattice, so `€45.90 -> 200,80 zł` displays as `209 zł`.
 * That is what §13 Q1 chose for Poland (`plan/10` §2.3's own bands are 149 / 199 / 269 / 359 zł),
 * and it is the safe direction. It is also mostly hypothetical in Phase 0: PLN is the currency PL
 * prices are *authored* in, so it is normally the source of a conversion rather than its target.
 */

/** One hand-computed conversion: source amount, rate, buffered result, displayed result. */
export interface FxConversionFixture {
  /** ISO 4217 code the amount is authored in (the destination country's own currency). */
  readonly from: string;
  /** ISO 4217 code the amount is displayed in (the buyer locale's default currency). */
  readonly to: string;
  /** The authored amount, in minor units of `from`. */
  readonly amountMinor: number;
  /** Parts per million, `from -> to`, unbuffered — published or derived as documented above. */
  readonly ratePpm: number;
  /** Step 1: buffered, ceiling-divided, **before** psychological rounding. */
  readonly bufferedMinor: number;
  /** Step 2: `bufferedMinor` lifted onto `to`'s ending — the amount a page displays. */
  readonly displayMinor: number;
}

/** The 2026-09-08 ECB snapshot's `EUR->GBP` rate, in parts per million. */
export const FX_RATE_PPM_EUR_GBP = 846_500;

/** The 2026-09-08 ECB snapshot's `EUR->PLN` rate, in parts per million. */
export const FX_RATE_PPM_EUR_PLN = 4_268_000;

/** `ceil(1 000 000 x 1 000 000 / 4 268 000)` — the inverse of the published euro rate. */
export const FX_RATE_PPM_PLN_EUR = 234_302;

/** `ceil(846 500 x 1 000 000 / 4 268 000)` — the euro cross the first corridor reads (ADR-0002). */
export const FX_RATE_PPM_PLN_GBP = 198_337;

/**
 * The AC-12 table: the four `plan/10` §2.3 PLN bands shown to a GB and a DE buyer, and four euro
 * amounts shown to a PL buyer.
 *
 * `PLN->GBP` is the first corridor's own direction (a London buyer sending to Warsaw, ADR-0002)
 * and is the reason a euro cross exists at all.
 */
export const fxConversions: readonly FxConversionFixture[] = [
  // PLN -> GBP, via the euro cross. 149 / 199 / 269 / 359 zł are `plan/10` §2.3's bands.
  {
    from: "PLN",
    to: "GBP",
    amountMinor: 14_900,
    ratePpm: FX_RATE_PPM_PLN_GBP,
    bufferedMinor: 3_030,
    displayMinor: 3_090,
  },
  {
    from: "PLN",
    to: "GBP",
    amountMinor: 19_900,
    ratePpm: FX_RATE_PPM_PLN_GBP,
    bufferedMinor: 4_046,
    displayMinor: 4_090,
  },
  {
    from: "PLN",
    to: "GBP",
    amountMinor: 26_900,
    ratePpm: FX_RATE_PPM_PLN_GBP,
    bufferedMinor: 5_469,
    displayMinor: 5_490,
  },
  {
    from: "PLN",
    to: "GBP",
    amountMinor: 35_900,
    ratePpm: FX_RATE_PPM_PLN_GBP,
    bufferedMinor: 7_299,
    displayMinor: 7_390,
  },
  // PLN -> EUR, the inverse of the published rate.
  {
    from: "PLN",
    to: "EUR",
    amountMinor: 14_900,
    ratePpm: FX_RATE_PPM_PLN_EUR,
    bufferedMinor: 3_579,
    displayMinor: 3_590,
  },
  {
    from: "PLN",
    to: "EUR",
    amountMinor: 19_900,
    ratePpm: FX_RATE_PPM_PLN_EUR,
    bufferedMinor: 4_780,
    displayMinor: 4_790,
  },
  {
    from: "PLN",
    to: "EUR",
    amountMinor: 26_900,
    ratePpm: FX_RATE_PPM_PLN_EUR,
    bufferedMinor: 6_461,
    displayMinor: 6_490,
  },
  {
    from: "PLN",
    to: "EUR",
    amountMinor: 35_900,
    ratePpm: FX_RATE_PPM_PLN_EUR,
    bufferedMinor: 8_622,
    displayMinor: 8_690,
  },
  // EUR -> PLN, the published rate. The `x9` lattice is ten złoty wide; see the header note.
  {
    from: "EUR",
    to: "PLN",
    amountMinor: 3_590,
    ratePpm: FX_RATE_PPM_EUR_PLN,
    bufferedMinor: 15_706,
    displayMinor: 15_900,
  },
  {
    from: "EUR",
    to: "PLN",
    amountMinor: 4_590,
    ratePpm: FX_RATE_PPM_EUR_PLN,
    bufferedMinor: 20_080,
    displayMinor: 20_900,
  },
  {
    from: "EUR",
    to: "PLN",
    amountMinor: 8_990,
    ratePpm: FX_RATE_PPM_EUR_PLN,
    bufferedMinor: 39_329,
    displayMinor: 39_900,
  },
  // €180.00 is the funeral ceiling of `plan/10` §2.3 outside Poland — the largest amount the
  // Phase 0 catalogue can convert, and the one worth pinning against an overflow.
  {
    from: "EUR",
    to: "PLN",
    amountMinor: 18_000,
    ratePpm: FX_RATE_PPM_EUR_PLN,
    bufferedMinor: 78_745,
    displayMinor: 78_900,
  },
];
