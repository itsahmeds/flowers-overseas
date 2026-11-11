/**
 * @purpose `pnpm build`: the ECB snapshot step, `next build`, then the existence manifest (spec 005 §14 A7, spec 012b §2.3)
 *
 * `pnpm build` (spec 005 §14 A7 Corrected 2; TASK-181; spec 012b §2.3, TASK-294, TASK-295). In
 * this order, every build:
 *
 *  1. `fxBuildStep()` (`scripts/fx-snapshot.ts`): fetch and validate the ECB daily file, or fall
 *     back to the committed snapshot. It never fails the build and prints one `fx.snapshot` line.
 *  2. `countryRegistryBuildStep()` (`scripts/country-registry-build-step.ts`): where the
 *     deployment reads the database (spec 012b AC-3), the `country` registry read once through
 *     the build login, handed to `next build` in `COUNTRY_REGISTRY_BUILD_SNAPSHOT`; a failed read
 *     fails the build before `next build` starts (AC-4; TASK-294).
 *  3. `dataAsOf` (spec 012b §2.3, advisor F1): where the build reads the database
 *     (`DATABASE_BUILD_URL` set), the database's `now()`, read before `next build` makes its first
 *     catalogue query. A failed read fails the build (§2.0 item 2: no build without the database).
 *  4. `next build`, with the validated snapshot in `FX_BUILD_SNAPSHOT` (empty on a fallback).
 *     `next.config.ts` inlines that variable into the server bundle, so the running deployment
 *     serves the rates this build fetched and makes no network call for them.
 *  5. The existence manifest (`src/lib/existence.ts`): every public path `next build` prerendered
 *     (`.next/prerender-manifest.json`), with `dataAsOf` and its SHA-256, written to
 *     `.next/existence-manifest.json` and, for the standalone server, beside it. One
 *     `existence.manifest` line with the URL count and the hash.
 *
 * The exit status is `next build`'s, or non-zero when step 2, 3 or 5 fails: a deployment without
 * its manifest could not verify a publish. Extra arguments are passed to `next build` unchanged.
 * No generated snapshot file is written by this entry (AC-31): the snapshots travel in the child's
 * environment and end in the bundle; the manifest is written by `./existence-manifest.ts`.
 */
import { spawnSync } from "node:child_process";

import { COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV } from "../src/config/countries.ts";
import { FX_BUILD_SNAPSHOT_ENV } from "../src/modules/catalog/static/fx-bundle.ts";
import { countryRegistryBuildStep } from "./country-registry-build-step.ts";
import { readDataAsOf, writeExistenceManifest } from "./existence-manifest.ts";
import { fxBuildStep } from "./fx-snapshot.ts";

const outcome = await fxBuildStep();
// Throws when the database is required and unreachable: the build fails (spec 012b AC-4).
const registry = await countryRegistryBuildStep();
const dataAsOf = await readDataAsOf(process.env["DATABASE_BUILD_URL"]);
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
if (result.status === 0) {
  const { count, existenceHash } = writeExistenceManifest(".next", dataAsOf);
  console.log(
    JSON.stringify({
      msg: "existence.manifest",
      urls: count,
      existence_hash: existenceHash,
      data_as_of: dataAsOf,
    }),
  );
}
process.exit(result.status ?? 1);
