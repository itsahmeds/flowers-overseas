/**
 * @purpose `pnpm build`: the ECB snapshot step, then `next build` with the result inlined (spec 005 §14 A7)
 *
 * `pnpm build` (spec 005 §14 A7 Corrected 2; TASK-181). Two steps, in this order, every build:
 *
 *  1. `fxBuildStep()` (`scripts/fx-snapshot.ts`): fetch and validate the ECB daily file, or fall
 *     back to the committed snapshot. It never fails the build and prints one `fx.snapshot` line.
 *  2. `next build`, with the validated snapshot in `FX_BUILD_SNAPSHOT` (empty on a fallback).
 *     `next.config.ts` inlines that variable into the server bundle, so the running deployment
 *     serves the rates this build fetched and makes no network call for them.
 *
 * The exit status is `next build`'s: the FX step cannot change it. Extra arguments are passed to
 * `next build` unchanged. No generated snapshot file is written anywhere (AC-31): the snapshot
 * travels in the child's environment and ends in the bundle.
 */
import { spawnSync } from "node:child_process";

import { FX_BUILD_SNAPSHOT_ENV } from "../src/modules/catalog/static/fx-bundle.ts";
import { fxBuildStep } from "./fx-snapshot.ts";

const outcome = await fxBuildStep();
const result = spawnSync("next", ["build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, [FX_BUILD_SNAPSHOT_ENV]: outcome.bundle },
});
if (result.error !== undefined) {
  console.error(`next build did not start: ${result.error.message}`);
}
process.exit(result.status ?? 1);
