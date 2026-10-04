/**
 * `pnpm build` (`scripts/build.ts`) fetches, then hands the fetched snapshot to `next build`
 * (spec 005 §14 A7 Corrected 2, AC-30, AC-31; `/break 177` round 2 hole 2, N17/N18; TASK-181).
 *
 * Run by behaviour, not by reading the source: the file is imported as the process entry with
 * `spawnSync` captured, the ECB served by MSW and **no** `FX_SNAPSHOT_FETCH` in the environment
 * (CI's workflows set it for their builds, so the test removes it). The child `next build` must
 * receive the snapshot the step fetched. Any way of turning the fetch off inside `build.ts` — an
 * argument to `fxBuildStep`, a write to `process.env` — leaves the child an empty bundle and turns
 * this red. The exit status must be the child's.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ECB_DAILY_URL } from "../../scripts/fx-snapshot.ts";
import { server } from "../msw/server.ts";

const DAILY = readFileSync(
  resolve(__dirname, "../fixtures/fx/ecb-eurofxref-daily-2026-10-02.xml"),
  "utf8",
);
const SCRIPT = resolve(__dirname, "../../scripts/build.ts");

const argv = process.argv;
const savedFetchSwitch = process.env.FX_SNAPSHOT_FETCH;

afterEach(() => {
  process.argv = argv;
  if (savedFetchSwitch === undefined) delete process.env.FX_SNAPSHOT_FETCH;
  else process.env.FX_SNAPSHOT_FETCH = savedFetchSwitch;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("node:child_process");
  vi.resetModules();
});

describe("scripts/build.ts (AC-30, AC-31)", () => {
  it("fetches the ECB file and passes the validated snapshot to `next build`, exiting with its status", async () => {
    delete process.env.FX_SNAPSHOT_FETCH;
    process.argv = [argv[0] ?? "node", SCRIPT];
    vi.useFakeTimers({
      toFake: ["Date"],
      now: new Date("2026-10-04T13:00:00Z"),
    });
    let ecbRequests = 0;
    server.use(
      http.get(ECB_DAILY_URL, () => {
        ecbRequests += 1;
        return HttpResponse.text(DAILY);
      }),
    );
    const spawnSync = vi.fn(() => ({ status: 7, error: undefined }));
    vi.doMock("node:child_process", () => ({ spawnSync }));
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    vi.resetModules();
    await import("../../scripts/build.ts");

    expect(ecbRequests).toBe(1);
    expect(lines).toEqual([
      '{"msg":"fx.snapshot","source":"ecb-build","fx_as_of":"2026-10-02"}',
    ]);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnSync.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string | undefined> },
    ];
    expect(command).toBe("next");
    expect(args).toEqual(["build"]);
    const bundle = JSON.parse(options.env.FX_BUILD_SNAPSHOT ?? "") as {
      asOf: string;
      rates: Record<string, number>;
    };
    expect(bundle.asOf).toBe("2026-10-02");
    expect(bundle.rates.GBP).toBe(850_330);
    expect(bundle.rates.PLN).toBe(4_377_500);
    // `build.ts` adds the bundle and nothing else: no fetch switch reaches the child.
    expect(options.env.FX_SNAPSHOT_FETCH).toBeUndefined();
    expect(exit).toHaveBeenCalledWith(7);
  });
});
