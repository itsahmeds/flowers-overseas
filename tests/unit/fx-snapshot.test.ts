/**
 * The build-time ECB step and the bundle it hands to `next build` (spec 005 §14 A7 Corrected 2,
 * AC-30, AC-31; T-29, T-30; TASK-181).
 *
 * T-29: the parser over the captured daily file gives exact integer-ppm rows, and every malformed
 * case of A7 Corrected 2 (ii) is refused with its **named** reason. T-30: the step with the ECB
 * mocked by MSW (200, 503, a timeout, a network error) serves `ecb-build` only on a valid 200, and
 * otherwise the **whole** committed snapshot, prints exactly one `fx.snapshot` line, and never
 * throws, so the build proceeds. The bundle boundary (`resolveBundledFx`) never serves a mixed
 * snapshot.
 *
 * Every expected ppm below is read off the captured XML by eye and written as a literal: the
 * ECB's `0.85033` is `850_330` ppm, and so on.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  FX_SNAPSHOT,
  FX_SNAPSHOT_AS_OF,
} from "../../src/config/catalogue/fx.data.ts";
import {
  FX_BAND_PERCENT,
  resolveBundledFx,
  withinBand,
} from "../../src/modules/catalog/static/fx-bundle.ts";
import {
  ECB_ATTEMPTS,
  ECB_DAILY_URL,
  ECB_TIMEOUT_MS,
  decimalToPpm,
  fxBuildStep,
  parseEcbDaily,
} from "../../scripts/fx-snapshot.ts";
import { server } from "../msw/server.ts";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

/** The ECB daily file as served on 2026-10-04 (dated Friday 2026-10-02), verbatim. */
const DAILY = read("tests/fixtures/fx/ecb-eurofxref-daily-2026-10-02.xml");
/** The 2026-09-08 cube, verbatim from the 90-day history, in the daily envelope. */
const SEPT_8 = read("tests/fixtures/fx/ecb-eurofxref-2026-09-08.xml");

/** Sunday 2026-10-04: the build date the captured daily file was fetched on. */
const BUILD_DATE = "2026-10-04";

/** The ten covered rates of the 2026-10-02 file, in ppm, read off the XML. */
const DAILY_PPM = {
  USD: 1_122_500,
  CZK: 24_470_000,
  DKK: 7_473_600,
  GBP: 850_330,
  HUF: 369_180_000,
  PLN: 4_377_500,
  RON: 5_348_800,
  SEK: 11_290_000,
  CHF: 927_900,
  NOK: 10_831_500,
} as const;

/** The daily file with one currency's `rate` attribute replaced. */
function withRate(code: string, rate: string): string {
  return DAILY.replace(
    new RegExp(`(currency='${code}' rate=')[^']*(')`, "u"),
    `$1${rate}$2`,
  );
}

describe("decimalToPpm: string arithmetic, never a float (T-29)", () => {
  it("turns ECB decimals into exact ppm", () => {
    expect(decimalToPpm("0.85033")).toBe(850_330);
    expect(decimalToPpm("4.3178")).toBe(4_317_800);
    expect(decimalToPpm("369.18")).toBe(369_180_000);
    expect(decimalToPpm("24.470")).toBe(24_470_000);
    expect(decimalToPpm("5.25")).toBe(5_250_000);
    expect(decimalToPpm("11")).toBe(11_000_000);
    expect(decimalToPpm("0.123456")).toBe(123_456);
  });

  it("refuses seven fractional digits, signs, exponents and junk", () => {
    for (const bad of [
      "0.8503312",
      "-1.2",
      "1e3",
      "1.",
      ".5",
      "",
      "1,25",
      "0",
    ]) {
      expect(decimalToPpm(bad), bad).toBeNull();
    }
  });

  it("has no float on the decimal → ppm path (source scan)", () => {
    const source = read("scripts/fx-snapshot.ts");
    const body = source.slice(
      source.indexOf("export function decimalToPpm"),
      source.indexOf("export type EcbParseResult"),
    );
    const code = body.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    expect(code).toContain("Number.parseInt(");
    expect(code).not.toMatch(
      /parseFloat|Number\(|Math\.round|toFixed|\*|\s\/\s/u,
    );
  });
});

describe("parseEcbDaily over the captured fixtures (AC-30, T-29)", () => {
  it("gives exactly the expected integer-ppm rows for the daily file", () => {
    expect(parseEcbDaily(DAILY, BUILD_DATE)).toEqual({
      ok: true,
      snapshot: { asOf: "2026-10-02", rates: DAILY_PPM },
    });
  });

  it("reads the 90-day history's cube with the same parser, giving the committed rows", () => {
    const parsed = parseEcbDaily(SEPT_8, "2026-09-09");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.asOf).toBe(FX_SNAPSHOT_AS_OF);
    expect(parsed.snapshot.rates).toEqual(
      Object.fromEntries(FX_SNAPSHOT.map((row) => [row.quote, row.ratePpm])),
    );
  });

  it.each([
    [
      "a missing currency",
      DAILY.replace(/<Cube currency='PLN'[^>]*\/>/u, ""),
      BUILD_DATE,
      "missing-currency",
    ],
    [
      "seven fractional digits",
      withRate("GBP", "0.8503312"),
      BUILD_DATE,
      "bad-rate-format",
    ],
    ["a future date", DAILY, "2026-10-01", "future-date"],
    ["a date six days old", DAILY, "2026-10-08", "date-too-old"],
    [
      "a rate outside ±15%",
      withRate("PLN", "5.1000"),
      BUILD_DATE,
      "rate-out-of-band",
    ],
    [
      "an HTML error body",
      "<!DOCTYPE html><html><body>503 Service Unavailable</body></html>",
      BUILD_DATE,
      "not-ecb-xml",
    ],
    ["an empty body", "", BUILD_DATE, "empty-body"],
    ["a whitespace body", " \n\t", BUILD_DATE, "empty-body"],
    [
      "a duplicated currency",
      DAILY.replace(
        "<Cube currency='GBP'",
        "<Cube currency='GBP' rate='0.85033'/><Cube currency='GBP'",
      ),
      BUILD_DATE,
      "duplicate-currency",
    ],
    [
      "no Cube date",
      DAILY.replace(/time='[^']*'/u, "time=''"),
      BUILD_DATE,
      "missing-date",
    ],
    [
      "two Cube dates",
      DAILY.replace(
        "</Cube>\n\t</Cube>",
        "</Cube><Cube time='2026-10-01'></Cube>\n\t</Cube>",
      ),
      BUILD_DATE,
      "missing-date",
    ],
  ])("refuses %s with its reason", (_name, body, buildDate, reason) => {
    expect(parseEcbDaily(body, buildDate)).toEqual({ ok: false, reason });
  });

  it("accepts a date exactly five days old, the edge of the bound", () => {
    expect(parseEcbDaily(DAILY, "2026-10-07").ok).toBe(true);
  });

  it("holds the band at ±15%, inclusive, in integers", () => {
    expect(FX_BAND_PERCENT).toBe(15);
    expect(withinBand(1_150_000, 1_000_000)).toBe(true);
    expect(withinBand(1_150_001, 1_000_000)).toBe(false);
    expect(withinBand(850_000, 1_000_000)).toBe(true);
    expect(withinBand(849_999, 1_000_000)).toBe(false);
  });
});

describe("the build step against a mocked ECB (AC-30, T-30)", () => {
  function capture(): { lines: string[]; log: (line: string) => void } {
    const lines: string[] = [];
    return { lines, log: (line) => lines.push(line) };
  }
  const NOW = new Date(`${BUILD_DATE}T13:00:00Z`);

  it("serves `ecb-build` on a valid 200 and prints one line", async () => {
    let requests = 0;
    server.use(
      http.get(ECB_DAILY_URL, () => {
        requests += 1;
        return HttpResponse.text(DAILY);
      }),
    );
    const { lines, log } = capture();
    const outcome = await fxBuildStep({ now: NOW, log, env: {} });

    expect(requests).toBe(1);
    expect(outcome.source).toBe("ecb-build");
    expect(outcome.fxAsOf).toBe("2026-10-02");
    expect(JSON.parse(outcome.bundle)).toEqual({
      asOf: "2026-10-02",
      rates: DAILY_PPM,
    });
    expect(lines).toEqual([
      '{"msg":"fx.snapshot","source":"ecb-build","fx_as_of":"2026-10-02"}',
    ]);
  });

  it("retries once on a 503, then serves the whole committed snapshot and resolves", async () => {
    let requests = 0;
    server.use(
      http.get(ECB_DAILY_URL, () => {
        requests += 1;
        return new HttpResponse("unavailable", { status: 503 });
      }),
    );
    const { lines, log } = capture();
    const outcome = await fxBuildStep({ now: NOW, log, env: {} });

    expect(requests).toBe(ECB_ATTEMPTS);
    expect(ECB_ATTEMPTS).toBe(2);
    expect(outcome).toEqual({
      source: "committed",
      fxAsOf: FX_SNAPSHOT_AS_OF,
      bundle: "",
      reason: "http-status",
    });
    expect(lines).toEqual([
      `{"msg":"fx.snapshot","source":"committed","fx_as_of":"${FX_SNAPSHOT_AS_OF}","reason":"http-status"}`,
    ]);
  });

  it("succeeds on the retry when the first attempt fails", async () => {
    let requests = 0;
    server.use(
      http.get(ECB_DAILY_URL, () => {
        requests += 1;
        return requests === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.text(DAILY);
      }),
    );
    const outcome = await fxBuildStep({
      now: NOW,
      log: () => undefined,
      env: {},
    });
    expect(requests).toBe(2);
    expect(outcome.source).toBe("ecb-build");
  });

  it("treats a hung ECB as a timeout and falls back", async () => {
    server.use(
      http.get(ECB_DAILY_URL, async () => {
        await delay(500);
        return HttpResponse.text(DAILY);
      }),
    );
    const { lines, log } = capture();
    const outcome = await fxBuildStep({
      now: NOW,
      log,
      env: {},
      timeoutMs: 20,
    });
    expect(outcome.source).toBe("committed");
    expect(outcome.reason).toBe("timeout");
    expect(outcome.bundle).toBe("");
    expect(lines).toHaveLength(1);
  });

  it("treats a network error as `network` and falls back", async () => {
    server.use(http.get(ECB_DAILY_URL, () => HttpResponse.error()));
    const outcome = await fxBuildStep({
      now: NOW,
      log: () => undefined,
      env: {},
    });
    expect(outcome).toMatchObject({ source: "committed", reason: "network" });
  });

  it("falls back whole on a 200 that fails validation (a rate out of band)", async () => {
    server.use(
      http.get(ECB_DAILY_URL, () =>
        HttpResponse.text(withRate("HUF", "36.918")),
      ),
    );
    const outcome = await fxBuildStep({
      now: NOW,
      log: () => undefined,
      env: {},
    });
    expect(outcome).toMatchObject({
      source: "committed",
      bundle: "",
      reason: "rate-out-of-band",
    });
  });

  it("makes no request at all when CI's test build turns the fetch off", async () => {
    // No handler: an attempted request is an MSW `onUnhandledRequest: "error"` failure.
    const { lines, log } = capture();
    const outcome = await fxBuildStep({
      now: NOW,
      log,
      env: { FX_SNAPSHOT_FETCH: "off" },
    });
    expect(outcome).toMatchObject({ source: "committed", reason: "fetch-off" });
    expect(lines).toHaveLength(1);
  });
});

describe("the bundle boundary never serves a mixed snapshot (AC-30, A7 Corrected 2 (iii))", () => {
  const good = JSON.stringify({ asOf: "2026-10-02", rates: DAILY_PPM });

  it("serves every committed currency at the fetched rate and the fetched date", () => {
    const bundled = resolveBundledFx(good, FX_SNAPSHOT);
    expect(bundled.source).toBe("ecb-build");
    expect(bundled.asOf).toBe("2026-10-02");
    expect(bundled.rows).toHaveLength(FX_SNAPSHOT.length);
    for (const row of bundled.rows) {
      expect(row.asOf, row.quote).toBe("2026-10-02");
      expect(row.ratePpm, row.quote).toBe(
        DAILY_PPM[row.quote as keyof typeof DAILY_PPM],
      );
      // `source` stays the publication's name; `fxSource` is what says "fetched at build".
      expect(row.source).toBe("ecb-reference");
    }
  });

  it.each([
    ["absent", undefined, undefined],
    ["empty (a failed fetch)", "", undefined],
    ["not JSON", "{", "malformed-bundle"],
    [
      "a float rate",
      JSON.stringify({
        asOf: "2026-10-02",
        rates: { ...DAILY_PPM, GBP: 850_330.5 },
      }),
      "malformed-bundle",
    ],
    [
      "a missing currency",
      JSON.stringify({
        asOf: "2026-10-02",
        rates: { ...DAILY_PPM, PLN: undefined },
      }),
      "missing-currency",
    ],
    [
      "an extra currency",
      JSON.stringify({
        asOf: "2026-10-02",
        rates: { ...DAILY_PPM, JPY: 176_990_000 },
      }),
      "malformed-bundle",
    ],
    [
      "a rate out of band",
      JSON.stringify({
        asOf: "2026-10-02",
        rates: { ...DAILY_PPM, PLN: 43_775_000 },
      }),
      "rate-out-of-band",
    ],
    [
      "a date before the committed one",
      JSON.stringify({ asOf: "2026-09-01", rates: DAILY_PPM }),
      "malformed-bundle",
    ],
  ])(
    "serves the whole committed snapshot when the bundle is %s",
    (_name, raw, reason) => {
      const bundled = resolveBundledFx(raw, FX_SNAPSHOT);
      expect(bundled.source).toBe("committed");
      expect(bundled.asOf).toBe(FX_SNAPSHOT_AS_OF);
      expect(bundled.rows).toBe(FX_SNAPSHOT);
      expect(bundled.reason).toBe(reason);
    },
  );
});

describe("where the fetch is off, and where it cannot be (A7 Corrected 2 (i); TASK-181)", () => {
  it("is off for every build of the two workflows that build for browser tests", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".github/workflows/visual-baselines.yml",
    ]) {
      const workflow = parse(read(path)) as { env?: Record<string, string> };
      expect(workflow.env?.FX_SNAPSHOT_FETCH, path).toBe("off");
    }
  });

  it("cannot be turned off in a Railway build: the Dockerfile names it nowhere outside comments", () => {
    // Any instruction, any case, any position (an `ENV` continuation line, a lowercase `env`, a
    // second name on an `ARG` line) would either turn every Railway build into the committed
    // fallback or let a Railway service variable do it (`/break 177` hole 3).
    // Comment lines dropped, then `\` continuations joined with nothing in between, as Docker
    // joins them: a name split across two lines is one name (`/break 177` r2 hole 5, N16).
    const instructions = read("Dockerfile")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n")
      .replace(/\\\r?\n[ \t]*/gu, "");
    expect(instructions).not.toMatch(/FX_SNAPSHOT_FETCH/iu);
    expect(read("config/railway.json")).not.toContain("FX_SNAPSHOT_FETCH");
  });

  it("is run by `pnpm build` before `next build`, with the exit status left to `next build`", () => {
    const manifest = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.build).toBe("node scripts/build.ts");
    const build = read("scripts/build.ts");
    const code = build.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
    // The exact call, present (`indexOf` is -1 when it is rewritten: `/break 177` r2 hole 2).
    const step = code.indexOf("const outcome = await fxBuildStep();");
    const next = code.indexOf('spawnSync("next", ["build"');
    expect(step).toBeGreaterThanOrEqual(0);
    expect(next).toBeGreaterThan(step);
    expect(code.match(/fxBuildStep\(/gu)).toHaveLength(1);
    // `build.ts` never names the fetch switch, in any spelling, and writes no environment key.
    expect(code).not.toMatch(/FX_SNAPSHOT|_FETCH/u);
    expect(code).not.toMatch(/process\.env(?:\.\w+|\[[^\]]*\])\s*=(?!=)/u);
    expect(code).toContain("process.exit(result.status ?? 1)");
  });
});

/* -------------------------------------------------------------------------- */
/* Round 1 of `/break 177`.                                                   */
/* -------------------------------------------------------------------------- */

describe("the boundaries the breaker found open (/break 177 holes 1, 6, 10, 11)", () => {
  it("accepts a file dated the build day itself: the normal 15:30 path (hole 1)", () => {
    expect(parseEcbDaily(DAILY, "2026-10-02")).toEqual({
      ok: true,
      snapshot: { asOf: "2026-10-02", rates: DAILY_PPM },
    });
  });

  it("refuses an impossible Cube date that V8 would roll over (hole 6)", () => {
    const body = DAILY.replace("time='2026-10-02'", "time='2026-02-30'");
    expect(parseEcbDaily(body, "2026-03-02")).toEqual({
      ok: false,
      reason: "missing-date",
    });
  });

  it.each([
    ["an impossible calendar date", { asOf: "2026-02-30", rates: DAILY_PPM }],
    ["a date that is not a date", { asOf: "x", rates: DAILY_PPM }],
    ["a timestamp", { asOf: "2026-10-02T16:00:00Z", rates: DAILY_PPM }],
    ["an extra key", { asOf: "2026-10-02", rates: DAILY_PPM, source: "ecb" }],
  ])(
    "serves the committed snapshot for a bundle with %s (hole 6)",
    (_name, bundle) => {
      const bundled = resolveBundledFx(JSON.stringify(bundle), FX_SNAPSHOT);
      expect(bundled).toMatchObject({
        source: "committed",
        asOf: FX_SNAPSHOT_AS_OF,
        reason: "malformed-bundle",
      });
      expect(bundled.rows).toBe(FX_SNAPSHOT);
    },
  );

  it("bounds each attempt at 10 s by default (hole 10)", () => {
    expect(ECB_TIMEOUT_MS).toBe(10_000);
  });

  it.each([
    ["empty", ""],
    ["on", "on"],
    ["OFF in capitals", "OFF"],
  ])(
    "still fetches when FX_SNAPSHOT_FETCH is %s: only the exact `off` turns it off (hole 11)",
    async (_name, value) => {
      let requests = 0;
      server.use(
        http.get(ECB_DAILY_URL, () => {
          requests += 1;
          return HttpResponse.text(DAILY);
        }),
      );
      const outcome = await fxBuildStep({
        now: new Date(`${BUILD_DATE}T13:00:00Z`),
        log: () => undefined,
        env: { FX_SNAPSHOT_FETCH: value },
      });
      expect(requests).toBe(1);
      expect(outcome.source).toBe("ecb-build");
    },
  );
});
