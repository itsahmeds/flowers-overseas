/**
 * Spec 018 T-19 (AC-19, adapter half; TASK-342): the NBP table A adapter on **recorded**
 * responses. `tests/fixtures/nbp/*.response.txt` are NBP's own bodies, byte for byte
 * (`api.nbp.pl/api/exchangerates/rates/a/gbp/{start}/{end}/?format=json`, fetched 2026-11-04),
 * kept as `.txt` so the formatter cannot rewrite `4.8950` as `4.895`. The fake `fetch` answers a
 * range request the way NBP does: the recorded entries inside the range, or 404 when there are
 * none. So a request that reached past the tax point would get the tax point's own table, and the
 * Monday case below would read Monday's rate.
 *
 *  - Monday 2 Nov 2026 → Friday 30 Oct (212/A, 5.2701), not Monday's own 213/A.
 *  - Friday 5 Jun 2026, the day after Corpus Christi (Thursday 4 Jun, a Polish public holiday,
 *    no table) → Wednesday 3 Jun (106/A, 4.9138).
 *  - A tax point on the holiday itself → the day before it.
 *  - The published digits survive: 27 May's `4.8950` is stored as `4.8950`.
 *  - Failures alert `invoice.nbp_failed` and throw `NbpRateUnavailable`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createNbpRateProvider,
  NbpRateUnavailable,
  shiftIsoDate,
  VatRateSnapshotSchema,
} from "@/modules/invoices";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "nbp");

interface Recorded {
  readonly body: string;
  readonly entries: { effectiveDate: string; raw: string }[];
}

/** The recorded entries as raw JSON text, so a filtered answer keeps NBP's digits. */
function recorded(file: string): Recorded {
  const body = readFileSync(path.join(FIXTURES, file), "utf8");
  const entries = [
    ...body.matchAll(
      /\{"no":"[^"]+","effectiveDate":"([^"]+)","mid":[0-9.]+\}/g,
    ),
  ].map((match) => ({ effectiveDate: match[1] ?? "", raw: match[0] }));
  return { body, entries };
}

const AUTUMN = recorded("gbp-2026-10-14-2026-11-03.response.txt");
const SPRING = recorded("gbp-2026-05-18-2026-06-12.response.txt");

/** NBP's range endpoint over the recorded entries. */
function nbp(source: Recorded, seen: string[] = []) {
  return async (url: string): Promise<Response> => {
    seen.push(url);
    const match =
      /\/rates\/a\/gbp\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/\?format=json$/.exec(
        url,
      );
    if (match === null) return new Response("400 BadRequest", { status: 400 });
    const [, start = "", end = ""] = match;
    const inside = source.entries.filter(
      (entry) => entry.effectiveDate >= start && entry.effectiveDate <= end,
    );
    if (inside.length === 0) {
      return new Response("404 NotFound - Not Found - Brak danych", {
        status: 404,
      });
    }
    const head = source.body.slice(
      0,
      source.body.indexOf('"rates":[') + '"rates":['.length,
    );
    return new Response(
      `${head}${inside.map((entry) => entry.raw).join(",")}]}`,
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  };
}

function alerts() {
  const raised: { alert: string; fields: Record<string, unknown> }[] = [];
  return {
    raised,
    raise: (alert: string, fields: Readonly<Record<string, unknown>> = {}) => {
      raised.push({ alert, fields: { ...fields } });
    },
  };
}

describe("NBP table A adapter (T-19)", () => {
  it("a Monday tax point takes Friday's table, never Monday's own", async () => {
    const seen: string[] = [];
    const provider = createNbpRateProvider({ fetch: nbp(AUTUMN, seen) });
    const rate = await provider.rateFor({
      from: "GBP",
      to: "PLN",
      taxPointDate: "2026-11-02",
    });
    expect(rate).toEqual({
      from: "GBP",
      to: "PLN",
      rate: "5.2701",
      source: "nbp_table_a",
      table: "212/A/NBP/2026",
      effectiveDate: "2026-10-30",
    });
    expect(VatRateSnapshotSchema.parse(rate)).toEqual(rate);
    expect(seen).toEqual([
      "https://api.nbp.pl/api/exchangerates/rates/a/gbp/2026-10-19/2026-11-01/?format=json",
    ]);
  });

  it("the day after a Polish public holiday (Corpus Christi, Thu 4 Jun 2026) takes the day before it", async () => {
    const provider = createNbpRateProvider({ fetch: nbp(SPRING) });
    const rate = await provider.rateFor({
      from: "GBP",
      to: "PLN",
      taxPointDate: "2026-06-05",
    });
    expect(rate.effectiveDate).toBe("2026-06-03");
    expect(rate.table).toBe("106/A/NBP/2026");
    expect(rate.rate).toBe("4.9138");
  });

  it("a tax point on the holiday itself takes the business day before it", async () => {
    const provider = createNbpRateProvider({ fetch: nbp(SPRING) });
    const rate = await provider.rateFor({
      from: "GBP",
      to: "PLN",
      taxPointDate: "2026-06-04",
    });
    expect(rate.effectiveDate).toBe("2026-06-03");
  });

  it("keeps the published digits: 4.8950 stays 4.8950", async () => {
    const provider = createNbpRateProvider({ fetch: nbp(SPRING) });
    const rate = await provider.rateFor({
      from: "GBP",
      to: "PLN",
      taxPointDate: "2026-05-28",
    });
    expect(rate).toMatchObject({
      rate: "4.8950",
      table: "101/A/NBP/2026",
      effectiveDate: "2026-05-27",
    });
  });

  it("a tax point on 1 January reads the year before", async () => {
    expect(shiftIsoDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftIsoDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("a window with no table: alert and NbpRateUnavailable", async () => {
    const spy = alerts();
    const provider = createNbpRateProvider({
      fetch: nbp(SPRING),
      alert: spy.raise,
    });
    await expect(
      provider.rateFor({ from: "GBP", to: "PLN", taxPointDate: "2026-04-01" }),
    ).rejects.toBeInstanceOf(NbpRateUnavailable);
    expect(spy.raised).toEqual([
      {
        alert: "invoice.nbp_failed",
        fields: { reason: "no_table", status: 404 },
      },
    ]);
  });

  it("a network error, a 5xx, a malformed body and another currency's table each alert and throw", async () => {
    const cases: [string, (url: string) => Promise<Response>][] = [
      ["fetch_error", () => Promise.reject(new TypeError("fetch failed"))],
      ["http_error", () => Promise.resolve(new Response("", { status: 503 }))],
      [
        "malformed_body",
        () => Promise.resolve(new Response("<html>", { status: 200 })),
      ],
      [
        "wrong_currency",
        () =>
          Promise.resolve(
            new Response(
              '{"table":"A","currency":"euro","code":"EUR","rates":[{"no":"212/A/NBP/2026","effectiveDate":"2026-10-30","mid":4.2433}]}',
              { status: 200 },
            ),
          ),
      ],
    ];
    for (const [reason, fetchFn] of cases) {
      const spy = alerts();
      const provider = createNbpRateProvider({
        fetch: fetchFn,
        alert: spy.raise,
      });
      await expect(
        provider.rateFor({
          from: "GBP",
          to: "PLN",
          taxPointDate: "2026-11-02",
        }),
      ).rejects.toBeInstanceOf(NbpRateUnavailable);
      expect(spy.raised.map((entry) => entry.fields["reason"])).toEqual([
        reason,
      ]);
    }
  });

  it("answers only X to PLN", async () => {
    const spy = alerts();
    const provider = createNbpRateProvider({
      fetch: nbp(AUTUMN),
      alert: spy.raise,
    });
    await expect(
      provider.rateFor({ from: "GBP", to: "EUR", taxPointDate: "2026-11-02" }),
    ).rejects.toBeInstanceOf(NbpRateUnavailable);
    expect(spy.raised[0]?.fields["reason"]).toBe("unsupported_pair");
  });
});
