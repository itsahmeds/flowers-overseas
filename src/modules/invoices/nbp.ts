/**
 * The NBP table A adapter behind `VatRateProvider` (spec 018 §5.2 "NBP adapter", §11, §13 Q5,
 * AC-19; TASK-342).
 *
 * A VAT amount on an invoice in a foreign currency is also stated in złoty, at the National Bank
 * of Poland's average rate (table A) of **the last business day before the tax point** (Polish
 * VAT Act art. 31a). NBP publishes table A on business days only, so "the last business day
 * before" is simply the newest table published before the tax point: the adapter asks for the
 * fourteen days ending the day before the tax point and takes the newest entry. A Monday tax point
 * gets Friday's table; a day after a Polish public holiday gets the table of the day before the
 * holiday. No holiday calendar is kept here, so none can drift from NBP's.
 *
 * The rate is stored as NBP's own decimal text (`5.2701`, `4.8950`): read with `JSON.parse`'s
 * source-text access, so the digits are the published ones and never pass through a float.
 *
 * Failure (§11 "an NBP fetch failure"): a network error, a timeout, a non-200 answer, a 404 for a
 * window with no table, or a body that is not table A for the asked currency each raise
 * `invoice.nbp_failed` (the HTTP status or the error class, never a URL with a date that could
 * identify an order) and throw `NbpRateUnavailable`, so `issueInvoice` refuses before it takes a
 * number and the outbox retries the step.
 */
import { z } from "zod";

import { captureAlert } from "@/lib/sentry";
import type { AlertRaiser } from "@/modules/orders";

import type { VatRateSnapshot } from "./snapshot";
import type { VatRateProvider, VatRateRequest } from "./vat-rate";

/** NBP's public API host. */
export const NBP_API_BASE = "https://api.nbp.pl";

/** How many calendar days before the tax point the adapter looks back: longer than any gap. */
export const NBP_LOOKBACK_DAYS = 14;

/** One request's bound. */
export const NBP_TIMEOUT_MS = 10_000;

/** Table A quotes every currency against the złoty only. */
export const NBP_QUOTE_CURRENCY = "PLN";

export class NbpRateUnavailable extends Error {
  constructor(reason: string) {
    super(`NBP_RATE_UNAVAILABLE: ${reason}`);
    this.name = "NbpRateUnavailable";
  }
}

const IsoDate = z.iso.date();

/** One `rates` entry, with `mid` already replaced by its source text. */
const RateEntry = z
  .object({
    no: z.string().regex(/^\d{1,3}\/A\/NBP\/\d{4}$/),
    effectiveDate: IsoDate,
    mid: z.string().regex(/^\d+\.\d{1,8}$/),
  })
  .strict();

const TableAResponse = z
  .object({
    table: z.literal("A"),
    currency: z.string(),
    code: z.string().regex(/^[A-Z]{3}$/),
    rates: z.array(RateEntry).min(1),
  })
  .strict();

const RequestSchema = z
  .object({
    from: z.string().regex(/^[A-Z]{3}$/),
    to: z.string().regex(/^[A-Z]{3}$/),
    taxPointDate: IsoDate,
  })
  .strict();

type SourceReviver = (
  this: unknown,
  key: string,
  value: unknown,
  context?: { readonly source?: string },
) => unknown;

/** `mid` as the text NBP wrote; every other value as parsed. */
const keepMidText: SourceReviver = (key, value, context) =>
  key === "mid" && typeof value === "number" && context?.source !== undefined
    ? context.source
    : value;

/** `YYYY-MM-DD` plus `days` (negative to go back), in UTC calendar arithmetic. */
export function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${IsoDate.parse(isoDate)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface NbpOptions {
  /** `fetch` in production; the suites pass one that answers from recorded responses. */
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  readonly alert?: AlertRaiser;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

/** The adapter. `rateFor` answers only `X → PLN`; the profile's `vat_currency_code` is `PLN`. */
export function createNbpRateProvider(
  options: NbpOptions = {},
): VatRateProvider {
  const fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
  const alert = options.alert ?? captureAlert;
  const base = options.baseUrl ?? NBP_API_BASE;
  const timeoutMs = options.timeoutMs ?? NBP_TIMEOUT_MS;

  function fail(
    reason: string,
    fields: Readonly<Record<string, unknown>>,
  ): never {
    alert("invoice.nbp_failed", { reason, ...fields });
    throw new NbpRateUnavailable(reason);
  }

  return {
    async rateFor(request: VatRateRequest): Promise<VatRateSnapshot> {
      const { from, to, taxPointDate } = RequestSchema.parse(request);
      if (to !== NBP_QUOTE_CURRENCY || from === NBP_QUOTE_CURRENCY) {
        fail("unsupported_pair", { from, to });
      }
      const end = shiftIsoDate(taxPointDate, -1);
      const start = shiftIsoDate(end, -(NBP_LOOKBACK_DAYS - 1));
      const url = `${base}/api/exchangerates/rates/a/${from.toLowerCase()}/${start}/${end}/?format=json`;
      let response: Response;
      try {
        response = await fetchFn(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        fail("fetch_error", {
          error_class: error instanceof Error ? error.name : "Error",
        });
      }
      if (response.status !== 200) {
        fail(response.status === 404 ? "no_table" : "http_error", {
          status: response.status,
        });
      }
      let parsed: z.infer<typeof TableAResponse>;
      try {
        const body: unknown = JSON.parse(
          await response.text(),
          keepMidText as Parameters<typeof JSON.parse>[1],
        );
        parsed = TableAResponse.parse(body);
      } catch {
        fail("malformed_body", {});
      }
      if (parsed.code !== from) fail("wrong_currency", { from });
      const newest = parsed.rates
        .filter((entry) => entry.effectiveDate <= end)
        .reduce<z.infer<typeof RateEntry> | undefined>(
          (best, entry) =>
            best === undefined || entry.effectiveDate > best.effectiveDate
              ? entry
              : best,
          undefined,
        );
      if (newest === undefined) fail("no_table", {});
      return {
        from,
        to,
        rate: newest.mid,
        source: "nbp_table_a",
        table: newest.no,
        effectiveDate: newest.effectiveDate,
      };
    },
  };
}
