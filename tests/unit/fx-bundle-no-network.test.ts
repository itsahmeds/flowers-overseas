/**
 * No rate is fetched at request time, the ECB URL lives in the build step only, nothing generated
 * is tracked, and `/api/health` reports the bundled snapshot (spec 005 §14 A7 Corrected 2 (i),
 * (v), (vi); AC-31, AC-33; T-31, T-33; TASK-181).
 *
 * T-31: the unit project's MSW server already errors on an unhandled request; this file also
 * **counts** every request MSW sees while a fixture PDP view and a listing view are rendered, in a
 * module graph whose bundled snapshot is the build's fetch, and expects zero. A source scan finds
 * the ECB URL only in `scripts/fx-snapshot.ts`, no `fetch(` anywhere in the catalogue module, and
 * `git ls-files` lists no generated snapshot.
 *
 * T-33: the real route handler, `GET /api/health`, returns exactly two keys more than spec 040's
 * six — `fxAsOf` and `fxSource` — equal to the bundled module's, with no outbound request.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { parseEcbDaily } from "../../scripts/fx-snapshot.ts";
import { server } from "../msw/server.ts";

vi.mock("server-only", () => ({}));

const repoRoot = resolve(__dirname, "../..");
const read = (path: string): string =>
  readFileSync(resolve(repoRoot, path), "utf8");

const daily = parseEcbDaily(
  read("tests/fixtures/fx/ecb-eurofxref-daily-2026-10-02.xml"),
  "2026-10-04",
);
if (!daily.ok)
  throw new Error(`the captured daily file must parse: ${daily.reason}`);
const BUNDLE = JSON.stringify(daily.snapshot);

/** Every request MSW saw, handled or not. */
let requests: string[] = [];
const onRequest = ({ request }: { request: Request }): void => {
  requests.push(request.url);
};

beforeAll(() => {
  server.events.on("request:start", onRequest);
});
afterAll(() => {
  server.events.removeListener("request:start", onRequest);
});

/** A fresh module graph with the build's fetched snapshot inlined, as a Railway build has it. */
async function withBuildSnapshot<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.stubEnv("FX_BUILD_SNAPSHOT", BUNDLE);
  try {
    return await load();
  } finally {
    vi.unstubAllEnvs();
  }
}

describe("rendering a price-bearing page makes zero outbound requests (AC-31, T-31)", () => {
  it("renders a fixture PDP view and a listing view with no request at all", async () => {
    const catalog = await withBuildSnapshot(
      () => import("../../src/modules/catalog/index.ts"),
    );
    expect(catalog.fxSnapshotStatus()).toEqual({
      fxAsOf: "2026-10-02",
      fxSource: "ecb-build",
    });
    // Monday 2026-10-05, noon: the 2026-10-02 rate is fresh, so every conversion happens.
    const now = new Date("2026-10-05T12:00:00Z");
    requests = [];

    const projection = await catalog.priceProjection("en-gb", {
      productId: "FO-BQ-001",
      tierKey: "stems_18",
      countryIso: "PL",
      now,
    });
    const listing = await catalog.listingView(
      { locale: "en", pageType: "countryShopRoot", country: "poland" },
      { from: "2026-10-05", now },
    );

    // The control: the rate was used, so a request-time fetch would have had a reason to happen.
    expect(projection.fxAsOf).toBe("2026-10-02");
    expect(listing?.items.length).toBeGreaterThan(0);
    expect(requests).toEqual([]);
  });
});

/** Every file under `dir`, recursively, as repository-relative paths. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(resolve(repoRoot, dir))) {
    const path = join(dir, name);
    if (statSync(resolve(repoRoot, path)).isDirectory())
      out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

describe("the ECB is reached from the build step only (AC-31, T-31)", () => {
  it("names the ECB URL in `scripts/fx-snapshot.ts` and nowhere else in code or workflows", () => {
    const scanned = [
      ...filesUnder("src"),
      ...filesUnder("scripts"),
      ...filesUnder(".github"),
      "next.config.ts",
      "Dockerfile",
    ];
    const naming = scanned.filter((path) =>
      read(path).includes("ecb.europa.eu/stats/eurofxref"),
    );
    expect(naming).toEqual(["scripts/fx-snapshot.ts"]);
  });

  it("has no `fetch(` anywhere in the catalogue module, so no Next data-cache entry can hold a rate", () => {
    for (const path of filesUnder("src/modules/catalog")) {
      const code = read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, "");
      expect(code, path).not.toMatch(/\bfetch\(/u);
    }
  });

  it("tracks no generated snapshot, and the build writes none", () => {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).split("\n");
    expect(
      tracked.filter((path) => /fx[^/]*\.(?:json|generated\.ts)$/iu.test(path)),
    ).toEqual([]);
    for (const path of ["scripts/build.ts", "scripts/fx-snapshot.ts"]) {
      expect(read(path), path).not.toMatch(
        /writeFile|createWriteStream|appendFile/u,
      );
    }
  });
});

describe("GET /api/health reports the bundled FX snapshot (AC-33, T-33)", () => {
  /** The synthetic env fixture of spec 001 T-12: every key, every value valid. */
  function validEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of read("tests/fixtures/env/valid.env").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
      if (match?.[1] !== undefined) env[match[1]] = match[2] ?? "";
    }
    return env;
  }

  it("adds exactly fxAsOf and fxSource, equal to the bundled module's, with no request", async () => {
    const env = validEnv();
    const { GET, fxSnapshotStatus } = await withBuildSnapshot(async () => {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      const route = await import("../../src/app/api/health/route.ts");
      const fx = await import("../../src/modules/catalog/pricing/fx.ts");
      return { GET: route.GET, fxSnapshotStatus: fx.fxSnapshotStatus };
    });
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    try {
      requests = [];
      const response = GET(new Request("https://example.test/api/health"));
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(Object.keys(body).sort()).toEqual([
        "appEnv",
        "commit",
        // TASK-058 (`/review 196` item 4): the CSP enforcement state, a closed-set value.
        "cspEnforce",
        "env",
        "fxAsOf",
        "fxSource",
        "region",
        "status",
        "version",
      ]);
      // `tests/fixtures/env/valid.env` sets `CSP_REPORT_ONLY=true`.
      expect(body["cspEnforce"]).toBe("report-only");
      expect(fxSnapshotStatus()).toEqual({
        fxAsOf: "2026-10-02",
        fxSource: "ecb-build",
      });
      expect({ fxAsOf: body.fxAsOf, fxSource: body.fxSource }).toEqual(
        fxSnapshotStatus(),
      );
      expect(requests).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports `committed` and the committed date when the build fetched nothing", async () => {
    vi.resetModules();
    const { fxSnapshotStatus } =
      await import("../../src/modules/catalog/pricing/fx.ts");
    const { FX_SNAPSHOT_AS_OF } =
      await import("../../src/config/catalogue/fx.data.ts");
    expect(fxSnapshotStatus()).toEqual({
      fxAsOf: FX_SNAPSHOT_AS_OF,
      fxSource: "committed",
    });
  });
});

describe("the fetched snapshot is inlined at build, not read at runtime (AC-31)", () => {
  it("has next.config.ts inline FX_BUILD_SNAPSHOT, read by its literal name in the static provider", () => {
    // `env` in next.config replaces the literal member access `process.env.FX_BUILD_SNAPSHOT` in
    // the bundle; any other spelling (a destructure, a computed key) would be read at runtime,
    // where the running container has no such variable and would serve the committed snapshot.
    expect(read("next.config.ts")).toContain(
      'env: { FX_BUILD_SNAPSHOT: process.env.FX_BUILD_SNAPSHOT ?? "" }',
    );
    expect(read("src/modules/catalog/static/index.ts")).toContain(
      "resolveBundledFx(process.env.FX_BUILD_SNAPSHOT, FX_SNAPSHOT)",
    );
    expect(read("scripts/build.ts")).toContain(
      "[FX_BUILD_SNAPSHOT_ENV]: outcome.bundle",
    );
  });
});
