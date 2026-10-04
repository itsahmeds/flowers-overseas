/**
 * @purpose Build-time ECB fetch: the day's euro reference rates, or the committed fallback (spec 005 §14 A7)
 *
 * The build step of spec 005 §14 A7 Corrected 2 (AC-30, AC-31; T-29, T-30; TASK-181). Run once per
 * build by `scripts/build.ts`, before `next build`, never at request time, in ISR, in `next dev` or
 * on the client:
 *
 *  1. `GET https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` — one attempt and one
 *     retry, at most 10 s each, no key, no request body. Node's own `fetch`, outside Next, so no
 *     Next data-cache entry can hold the result; the Docker build layer cannot either, because
 *     the `Dockerfile` declares `ARG FX_REFRESH_AT` immediately before `RUN pnpm build` and every
 *     scheduled rebuild sets it to a new value (A7 Corrected 2 (i)).
 *  2. Validate (A7 Corrected 2 (ii)): the envelope date is a `YYYY-MM-DD` no later than the build
 *     date and no more than five days before it; exactly one rate per currency the committed
 *     snapshot covers; each a decimal with at most six fractional digits, turned into integer ppm
 *     by **string arithmetic** (`decimalToPpm`, no float anywhere — `fo/no-float-money`); each
 *     within ±15% of the committed row (`checkAgainstCommitted`, shared with the runtime side).
 *  3. All or nothing (A7 Corrected 2 (iii)): any failure serves the **whole** committed snapshot.
 *     The step never throws and never fails the build, and it prints exactly one line,
 *     `fx.snapshot`, with the source, `fx_as_of` and, on a fallback, the reason. No PII: the
 *     request carries nothing and the answer is public data.
 *
 * `FX_SNAPSHOT_FETCH=off` skips step 1 and serves the committed snapshot with the reason
 * `fetch-off`. CI's test builds set it, so the browser suites photograph and assert one stable
 * state instead of a rate that moves every weekday. The `Dockerfile` declares no `ARG` for it, so a
 * Railway build cannot receive it and always fetches.
 *
 * The ECB URL is written in this file only (T-31's source scan): `scripts/fx-refresh.ts` imports it.
 */
import {
  FX_SNAPSHOT,
  FX_SNAPSHOT_AS_OF,
} from "../src/config/catalogue/fx.data.ts";
import {
  type FxBuildSnapshot,
  type FxBundleSource,
  type FxRejection,
  checkAgainstCommitted,
  isCalendarDay,
} from "../src/modules/catalog/static/fx-bundle.ts";

/** The ECB's daily euro reference rates: public, keyless, about 16:00 CET on TARGET days. */
export const ECB_DAILY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** At most 10 s per attempt (A7 Corrected 2 (i)). */
export const ECB_TIMEOUT_MS = 10_000;

/** One attempt and one retry. */
export const ECB_ATTEMPTS = 2;

/** The envelope date may be at most this many days before the build date. */
export const MAX_ECB_AGE_DAYS = 5;

/** The opt-out CI's test builds set (see the header); any other value fetches. */
export const FX_SNAPSHOT_FETCH_ENV = "FX_SNAPSHOT_FETCH";

const MS_PER_DAY = 86_400_000;

/** Six fractional digits: the ppm scale (spec 002 §5.1 `fx_rate.rate_ppm`). */
const PPM_DIGITS = 6;

/**
 * A decimal rate as integer parts per million, by string arithmetic only, or `null` when the
 * string is not a plain decimal with at most six fractional digits.
 *
 * `"0.8574"` → `"0"` + `"857400"` → `857400`. No `Number()` of a fractional string, no
 * multiplication of a float: the digits are joined and read as one integer.
 */
export function decimalToPpm(decimal: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,6}))?$/u.exec(decimal);
  if (match === null) return null;
  const whole = match[1] ?? "";
  const fraction = (match[2] ?? "").padEnd(PPM_DIGITS, "0");
  const ppm = Number.parseInt(`${whole}${fraction}`, 10);
  return Number.isSafeInteger(ppm) && ppm > 0 ? ppm : null;
}

/** The validated result of one daily file, or the named reason it was refused. */
export type EcbParseResult =
  | { readonly ok: true; readonly snapshot: FxBuildSnapshot }
  | { readonly ok: false; readonly reason: FxRejection };

/** A real `YYYY-MM-DD` calendar day's UTC start, or `null` (`isCalendarDay`, shared). */
function calendarDay(day: string): number | null {
  return isCalendarDay(day) ? Date.parse(`${day}T00:00:00Z`) : null;
}

/**
 * Parse and validate the ECB daily file's body against the committed snapshot and the build date
 * (A7 Corrected 2 (ii)). Reads both the daily file's single-quoted attributes and the 90-day
 * history's double-quoted ones, so one parser reads the captured fixture and the live file.
 */
export function parseEcbDaily(
  body: string,
  buildDate: string,
  committed: readonly {
    readonly quote: string;
    readonly ratePpm: number;
    readonly asOf: string;
  }[] = FX_SNAPSHOT,
): EcbParseResult {
  if (body.trim() === "") return { ok: false, reason: "empty-body" };
  if (!body.includes("<gesmes:Envelope") || !body.includes("eurofxref")) {
    return { ok: false, reason: "not-ecb-xml" };
  }

  const dates = [...body.matchAll(/<Cube\s+time=["']([^"']*)["']/gu)].map(
    (match) => match[1] ?? "",
  );
  const asOf = dates[0];
  if (dates.length !== 1 || asOf === undefined) {
    return { ok: false, reason: "missing-date" };
  }
  const asOfStart = calendarDay(asOf);
  const buildStart = calendarDay(buildDate);
  if (asOfStart === null || buildStart === null) {
    return { ok: false, reason: "missing-date" };
  }
  if (asOfStart > buildStart) return { ok: false, reason: "future-date" };
  if (buildStart - asOfStart > MAX_ECB_AGE_DAYS * MS_PER_DAY) {
    return { ok: false, reason: "date-too-old" };
  }

  const covered = new Set(committed.map((row) => row.quote));
  const rates: Record<string, number> = {};
  for (const match of body.matchAll(
    /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([^"']*)["']\s*\/>/gu,
  )) {
    const [, code = "", decimal = ""] = match;
    if (!covered.has(code)) continue;
    if (code in rates) return { ok: false, reason: "duplicate-currency" };
    const ppm = decimalToPpm(decimal);
    if (ppm === null) return { ok: false, reason: "bad-rate-format" };
    rates[code] = ppm;
  }

  const rejection = checkAgainstCommitted(rates, committed);
  if (rejection !== null) return { ok: false, reason: rejection };
  return { ok: true, snapshot: { asOf, rates } };
}

/** The transport half: the body, or why there is none. */
type FetchResult =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly reason: FxRejection };

async function fetchOnce(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<FetchResult> {
  try {
    const response = await fetchImpl(ECB_DAILY_URL, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, reason: "http-status" };
    return { ok: true, body: await response.text() };
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    return {
      ok: false,
      reason:
        name === "TimeoutError" || name === "AbortError"
          ? "timeout"
          : "network",
    };
  }
}

/** One attempt and one retry, after any failed attempt: a transport error, a timeout or an HTTP status. */
export async function fetchEcbDaily(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = ECB_TIMEOUT_MS,
): Promise<FetchResult> {
  let result: FetchResult = { ok: false, reason: "network" };
  for (let attempt = 0; attempt < ECB_ATTEMPTS; attempt += 1) {
    result = await fetchOnce(fetchImpl, timeoutMs);
    if (result.ok) return result;
  }
  return result;
}

/** What the build step decided: the source, the date, the string for `next build`, the reason. */
export interface FxBuildOutcome {
  readonly source: FxBundleSource;
  readonly fxAsOf: string;
  /** The `FX_BUILD_SNAPSHOT` value: the validated snapshot as JSON, or `""` for the fallback. */
  readonly bundle: string;
  readonly reason?: FxRejection;
}

/** The one `fx.snapshot` line: source, `fx_as_of` and, on a fallback, the reason. No PII. */
export function fxSnapshotLine(outcome: FxBuildOutcome): string {
  return JSON.stringify({
    msg: "fx.snapshot",
    source: outcome.source,
    fx_as_of: outcome.fxAsOf,
    ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
  });
}

export interface FxBuildStepOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly log?: (line: string) => void;
}

/**
 * The whole step: fetch, validate, decide, print one line. **Never throws**: every failure becomes
 * the committed snapshot and a reason, so the build always proceeds (A7 Corrected 2 (iii)).
 */
export async function fxBuildStep(
  options: FxBuildStepOptions = {},
): Promise<FxBuildOutcome> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.log(line));
  const committed = (reason: FxRejection): FxBuildOutcome => ({
    source: "committed",
    fxAsOf: FX_SNAPSHOT_AS_OF,
    bundle: "",
    reason,
  });

  let outcome: FxBuildOutcome;
  try {
    if (env[FX_SNAPSHOT_FETCH_ENV] === "off") {
      outcome = committed("fetch-off");
    } else {
      const fetched = await fetchEcbDaily(
        options.fetchImpl ?? fetch,
        options.timeoutMs ?? ECB_TIMEOUT_MS,
      );
      if (!fetched.ok) {
        outcome = committed(fetched.reason);
      } else {
        const buildDate = (options.now ?? new Date())
          .toISOString()
          .slice(0, 10);
        const parsed = parseEcbDaily(fetched.body, buildDate);
        outcome = parsed.ok
          ? {
              source: "ecb-build",
              fxAsOf: parsed.snapshot.asOf,
              bundle: JSON.stringify(parsed.snapshot),
            }
          : committed(parsed.reason);
      }
    }
  } catch {
    outcome = committed("network");
  }
  log(fxSnapshotLine(outcome));
  return outcome;
}
