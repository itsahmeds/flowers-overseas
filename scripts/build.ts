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
 *  3. Between them, `countryRegistryBuildStep()` (`scripts/country-registry-build-step.ts`): where
 *     the deployment reads the database (spec 012b AC-3), the `country` registry read once
 *     through the build login, handed to `next build` in `COUNTRY_REGISTRY_BUILD_SNAPSHOT`; a
 *     failed read fails the build before `next build` starts (AC-4; TASK-294).
 * The exit status is `next build`'s: the FX step cannot change it. Extra arguments are passed to
 * `next build` unchanged. No generated snapshot file is written anywhere (AC-31): the snapshot
 * travels in the child's environment and ends in the bundle.
 */
import { spawnSync } from "node:child_process";

import { COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV } from "../src/config/countries.ts";
import { FX_BUILD_SNAPSHOT_ENV } from "../src/modules/catalog/static/fx-bundle.ts";
import { countryRegistryBuildStep } from "./country-registry-build-step.ts";
import { fxBuildStep } from "./fx-snapshot.ts";

const outcome = await fxBuildStep();
// Throws when the database is required and unreachable: the build fails (spec 012b AC-4).
const registry = await countryRegistryBuildStep();
const result = spawnSync("next", ["build", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    [FX_BUILD_SNAPSHOT_ENV]: outcome.bundle,
    [COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV]: registry,
  },
});
if (result.error !== undefined) {
  console.error(`next build did not start: ${result.error.message}`);
}
process.exit(result.status ?? 1);
