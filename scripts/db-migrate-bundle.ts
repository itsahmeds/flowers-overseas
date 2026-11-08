/**
 * Bundles the migration runner into one self-contained file for the runtime image (spec 002 §14
 * A-orchestrator-2026-11-08c, spec 040 §14 pointer; TASK-505).
 *
 * Railway runs `config/railway.json`'s `preDeployCommand` in the image that ships. That image is
 * the Next standalone server, whose `node_modules` holds only what the server's trace kept: no
 * `zod`, no `postgres` and no `@next/env` as packages, because the server bundles them. Rather
 * than copy package directories into the image, the Dockerfile's `migrate` stage runs this script,
 * and the runtime stage copies its one output file next to `db/migrations/`:
 *
 *   node scripts/db-migrate-bundle.ts [outfile]      (default `dist/db-migrate.mjs`)
 *
 * The output is plain ESM JavaScript, so Node runs it without type stripping, and it imports Node
 * built-ins only. The banner gives `@next/env`, which is CommonJS, its `require` and `__dirname`.
 * Nothing is read from the environment here: the bundle reads `DATABASE_URL_UNPOOLED` when it
 * runs, never when it is built.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

export const DEFAULT_OUTFILE = "dist/db-migrate.mjs";

/** Where the runtime image keeps the bundle, relative to `/app` (`config/railway.json`). */
export const RUNTIME_PATH = "scripts/db-migrate.mjs";

/** CommonJS globals an ESM bundle lacks, for the CommonJS code inside it (`@next/env`). */
const COMMONJS_BANNER = [
  'import { createRequire as __foCreateRequire } from "node:module";',
  'import { fileURLToPath as __foFileURLToPath } from "node:url";',
  'import { dirname as __foDirname } from "node:path";',
  "const require = __foCreateRequire(import.meta.url);",
  "const __filename = __foFileURLToPath(import.meta.url);",
  "const __dirname = __foDirname(__filename);",
].join("\n");

export interface BundleReport {
  /** Bare imports left in the output; Node built-ins only, or the image cannot run it. */
  readonly external: readonly string[];
  /** Repository files bundled in (outside `node_modules`): the Dockerfile's `migrate` stage copies each. */
  readonly sources: readonly string[];
}

/** Writes the bundle to `outfile` (relative to `repoRoot`, or absolute) and reports what is in it. */
export async function bundleMigrationRunner(
  repoRoot: string,
  outfile: string,
): Promise<BundleReport> {
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [resolve(repoRoot, "scripts/db-migrate.ts")],
    outfile: resolve(repoRoot, outfile),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    banner: { js: COMMONJS_BANNER },
    legalComments: "eof",
    metafile: true,
    logLevel: "warning",
  });
  const external = new Set<string>();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports) {
      if (imported.external) external.add(imported.path);
    }
  }
  const sources = Object.keys(result.metafile.inputs).filter(
    (input) => !input.includes("node_modules/"),
  );
  return { external: [...external].sort(), sources: sources.sort() };
}

/* c8 ignore start -- the CLI shell; `tests/unit/db-migrate-bundle.test.ts` drives the function */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outfile = process.argv[2] ?? DEFAULT_OUTFILE;
  bundleMigrationRunner(repoRoot, outfile).then(
    (report) => {
      console.log(
        `db-migrate-bundle: wrote ${outfile} from ${report.sources.join(", ")} (imports: ${report.external.join(", ")})`,
      );
    },
    (error: unknown) => {
      console.error(
        `db-migrate-bundle: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
