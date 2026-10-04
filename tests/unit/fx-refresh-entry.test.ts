/**
 * `node scripts/fx-refresh.ts` actually runs (spec 005 §14 A7 Corrected 3, AC-34; `/break 177`
 * round 2 hole 1, N10; TASK-181).
 *
 * The workflow's only step is `node scripts/fx-refresh.ts`. If the file's entry check were never
 * true, importing it would do nothing and the step would exit 0: no rebuild requested, and the
 * 19:30 check never red, with every decision test still green. So the file is imported here **as
 * the entry point**: `process.argv[1]` set to its path, a fresh module graph, `process.exit`
 * captured, the ECB served by MSW, the clock fixed and every input absent. The run must happen
 * (its lines are printed) and exit 1, naming the missing inputs.
 */
import { resolve } from "node:path";

import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import { ECB_DAILY_URL } from "../../scripts/fx-snapshot.ts";
import { server } from "../msw/server.ts";

const SCRIPT = resolve(__dirname, "../../scripts/fx-refresh.ts");
const DAILY = readFileSync(
  resolve(__dirname, "../fixtures/fx/ecb-eurofxref-daily-2026-10-02.xml"),
  "utf8",
);

/** Every input the workflow passes, absent, and no step summary file to write into. */
const INPUTS = [
  "RAILWAY_TOKEN_STAGING",
  "RAILWAY_TOKEN_PRODUCTION",
  "FX_REFRESH_STAGING_URL",
  "FX_REFRESH_PRODUCTION_URL",
  "FX_REFRESH_VERIFY",
  "GITHUB_STEP_SUMMARY",
] as const;

const argv = process.argv;
const saved = Object.fromEntries(INPUTS.map((key) => [key, process.env[key]]));

afterEach(() => {
  process.argv = argv;
  for (const key of INPUTS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("scripts/fx-refresh.ts as the process entry point (AC-34)", () => {
  it("runs the refresh and exits with its exit code when node runs the file", async () => {
    for (const key of INPUTS) delete process.env[key];
    process.argv = [argv[0] ?? "node", SCRIPT];
    // Monday 2026-10-05 15:30 UTC: the captured Friday file is the latest, and valid.
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-05T15:30:00Z"),
    });
    let ecbRequests = 0;
    server.use(
      http.get(ECB_DAILY_URL, () => {
        ecbRequests += 1;
        return HttpResponse.text(DAILY);
      }),
    );
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    vi.resetModules();
    await import("../../scripts/fx-refresh.ts");

    expect(ecbRequests).toBe(1);
    expect(lines[0]).toBe("fx-refresh: ECB daily file dated 2026-10-02");
    expect(lines).toContain(
      "- staging: FAILED, repository variable FX_REFRESH_STAGING_URL is not set",
    );
    expect(lines).toContain(
      "- production: FAILED, repository variable FX_REFRESH_PRODUCTION_URL is not set",
    );
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does nothing when imported by another module (the decision tests' case)", async () => {
    process.argv = [
      argv[0] ?? "node",
      resolve(__dirname, "some-other-entry.ts"),
    ];
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    vi.resetModules();
    await import("../../scripts/fx-refresh.ts");
    expect(exit).not.toHaveBeenCalled();
  });
});
