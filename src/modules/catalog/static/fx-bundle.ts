/**
 * Which FX snapshot this deployment serves: the ECB daily file fetched at build, or the committed
 * fallback, never a mix (spec 005 §14 A7 Corrected 2 (iii)–(vi), AC-30, AC-31, AC-33; TASK-181).
 *
 * The build step (`scripts/fx-snapshot.ts`, run by `scripts/build.ts` before `next build`) fetches
 * `eurofxref-daily.xml`, validates it, and hands the result to the build as one JSON string in
 * `FX_BUILD_SNAPSHOT`. `next.config.ts` inlines that string into the server bundle (`env`), so a
 * request reads **bundled data** and makes no network call (AC-31), and every page of one
 * deployment converts at one rate. This file is the boundary that string crosses: zod-parsed, and
 * checked against the committed snapshot with the **same** rule the build step applied
 * (`checkAgainstCommitted`), so the build and the bundle cannot disagree on what a usable fetched
 * snapshot is. Anything unusable — absent, malformed, a missing currency, a rate outside the band —
 * serves the **whole** committed snapshot, never a partial one: a mixed snapshot would have two
 * `as_of` dates.
 *
 * Pure and clock-free: it takes the raw string and the committed rows as arguments. Only
 * `static/index.ts` reads the authored dataset (AC-2), so it is the caller. It imports nothing but
 * zod, so the build step can load it on plain Node (type stripping, no path aliases).
 *
 * **Exit:** TASK-071 deletes this bridge when `dbFxRateProvider` goes live (A7 Corrected 6).
 */
import { z } from "zod";

/** The build-time channel's name: set by `scripts/build.ts`, inlined by `next.config.ts`. */
export const FX_BUILD_SNAPSHOT_ENV = "FX_BUILD_SNAPSHOT";

/**
 * Where the served rates came from, as `/api/health` reports it (A7 Corrected 2 (vi)):
 * `ecb-build` — the ECB daily file this build fetched; `committed` — the fallback in `fx.data.ts`.
 */
export const FX_BUNDLE_SOURCES = ["ecb-build", "committed"] as const;
export type FxBundleSource = (typeof FX_BUNDLE_SOURCES)[number];

/**
 * How far a fetched rate may sit from the committed row for the same currency: ±15%
 * (A7 Corrected 2 (ii)). It guards against a mis-parse becoming a 1000× price, not against
 * market movement.
 */
export const FX_BAND_PERCENT = 15;

/** Each reason a fetched snapshot is refused, by name (AC-30: "rejects … with a named reason"). */
export const FX_REJECTIONS = [
  // transport (build step)
  "network",
  "timeout",
  "http-status",
  // the body (build step)
  "empty-body",
  "not-ecb-xml",
  "missing-date",
  "future-date",
  "date-too-old",
  "duplicate-currency",
  "bad-rate-format",
  // against the committed snapshot (both sides)
  "missing-currency",
  "rate-out-of-band",
  // the bundled string itself (runtime side)
  "malformed-bundle",
  // the build was told not to fetch (`FX_SNAPSHOT_FETCH=off`, CI's deterministic test builds)
  "fetch-off",
] as const;
export type FxRejection = (typeof FX_REJECTIONS)[number];

/** The one shape the build step hands to `next build`: a date and integer ppm per currency. */
export const FxBuildSnapshotSchema = z
  .object({
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    rates: z.record(
      z.string().regex(/^[A-Z]{3}$/u),
      z.number().int().positive(),
    ),
  })
  .strict();
export type FxBuildSnapshot = z.infer<typeof FxBuildSnapshotSchema>;

/** The fields of a committed row this file reads; `FxRateData` satisfies it. */
interface CommittedRate {
  readonly quote: string;
  readonly ratePpm: number;
  readonly asOf: string;
}

/**
 * Is `candidate` within ±`FX_BAND_PERCENT` of `reference`? Integer arithmetic only: both are
 * ppm integers, so `|c − r| × 100 ≤ r × 15` is exact (`fo/no-float-money`).
 */
export function withinBand(candidate: number, reference: number): boolean {
  return Math.abs(candidate - reference) * 100 <= reference * FX_BAND_PERCENT;
}

/**
 * The checks a fetched snapshot must pass against the committed one (A7 Corrected 2 (ii)):
 * exactly the committed currencies, each within the band. `null` when it passes.
 */
export function checkAgainstCommitted(
  rates: Readonly<Record<string, number>>,
  committed: readonly CommittedRate[],
): FxRejection | null {
  const expected = new Set(committed.map((row) => row.quote));
  for (const quote of Object.keys(rates)) {
    if (!expected.has(quote)) return "malformed-bundle";
  }
  for (const row of committed) {
    const rate = rates[row.quote];
    if (rate === undefined) return "missing-currency";
    if (!withinBand(rate, row.ratePpm)) return "rate-out-of-band";
  }
  return null;
}

/** What one deployment serves: its source, its date, its rows, and why it fell back if it did. */
export interface BundledFx<Row extends CommittedRate> {
  readonly source: FxBundleSource;
  readonly asOf: string;
  readonly rows: readonly Row[];
  readonly reason?: FxRejection;
}

/**
 * The snapshot this deployment serves, from the inlined build string and the committed rows.
 *
 * `raw` empty or absent (every `next dev`, every test, and every build whose fetch failed): the
 * committed snapshot, `committed`. Otherwise the string must parse, carry exactly the committed
 * currencies within the band, and be dated no earlier than the committed snapshot; then every
 * committed row is served with the fetched rate and the fetched `as_of`, keeping its
 * `source = "ecb-reference"` (A7 Corrected 2 (iv): `FxRateProvider` and `toFxRateRow()` do not
 * change). Any failure: the whole committed snapshot.
 */
export function resolveBundledFx<Row extends CommittedRate>(
  raw: string | undefined,
  committed: readonly Row[],
): BundledFx<Row> {
  const committedAsOf = committed[0]?.asOf ?? "";
  const fallback = (reason?: FxRejection): BundledFx<Row> => ({
    source: "committed",
    asOf: committedAsOf,
    rows: committed,
    ...(reason === undefined ? {} : { reason }),
  });
  if (raw === undefined || raw === "") return fallback();

  let parsed: FxBuildSnapshot;
  try {
    parsed = FxBuildSnapshotSchema.parse(JSON.parse(raw));
  } catch {
    return fallback("malformed-bundle");
  }
  if (parsed.asOf < committedAsOf) return fallback("malformed-bundle");
  const rejection = checkAgainstCommitted(parsed.rates, committed);
  if (rejection !== null) return fallback(rejection);

  return {
    source: "ecb-build",
    asOf: parsed.asOf,
    rows: committed.map((row) => ({
      ...row,
      ratePpm: parsed.rates[row.quote] ?? row.ratePpm,
      asOf: parsed.asOf,
    })),
  };
}
