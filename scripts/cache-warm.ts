/**
 * @purpose `pnpm cache:warm`: request each given URL once so the edge holds its HTML (spec 012b §2.3)
 * @spec 012b
 *
 * `pnpm cache:warm --base=<https origin> [--manifest=<existence-manifest.json>] [path ...]`
 * (spec 012b §5.2 "`scripts/`", §5.4 "CWV"; TASK-296). The publish job warms every added URL
 * itself after a run is `verified` (AC-7); this is the same function by hand: after a release,
 * or to re-warm a list. The paths are the arguments, or every URL of a manifest file
 * (`.next/existence-manifest.json`, validated by its schema). `--base` defaults to
 * `NEXT_PUBLIC_SITE_URL`.
 *
 * Prints one JSON line, `cache.warm`, with the counts and never a URL. Exit 0 when every path
 * answered 2xx, 1 when any did not, 2 on a usage error.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { warmUrls } from "../src/lib/cache-warm.ts";
import { ExistenceManifestSchema } from "../src/lib/existence.ts";

const CLI_NAME = "cache:warm";

/** The outcome of one invocation: the exit code and the lines it prints. */
export interface CacheWarmRun {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `pnpm cache:warm` over `argv`, reading files with `readFile` and fetching with `fetchImpl`. */
export async function runCacheWarm(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): Promise<CacheWarmRun> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }
  const base = parsed.values.base ?? environment["NEXT_PUBLIC_SITE_URL"];
  if (base === undefined || !/^https?:\/\/[^\s/]+/u.test(base)) {
    return usage("--base (or NEXT_PUBLIC_SITE_URL) must be an http(s) origin");
  }
  const paths = [...parsed.positionals];
  if (parsed.values.manifest !== undefined) {
    const manifest = ExistenceManifestSchema.safeParse(
      JSON.parse(readFile(parsed.values.manifest)),
    );
    if (!manifest.success) {
      return usage("--manifest is not an existence manifest");
    }
    paths.push(...manifest.data.urls);
  }
  if (paths.length === 0) {
    return usage("no path to warm: pass paths or --manifest");
  }
  const outcome = await warmUrls(paths, fetchImpl, base);
  return {
    code: outcome.failed === 0 ? 0 : 1,
    stdout: `${JSON.stringify({ msg: "cache.warm", ok: outcome.ok, failed: outcome.failed })}\n`,
    stderr: "",
  };
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: {
      base: { type: "string" },
      manifest: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
}

function usage(message: string): CacheWarmRun {
  return { code: 2, stdout: "", stderr: `${CLI_NAME}: ${message}\n` };
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  runCacheWarm(process.argv.slice(2), process.env, fetch).then(
    (run) => {
      process.stdout.write(run.stdout);
      process.stderr.write(run.stderr);
      process.exitCode = run.code;
    },
    (error: unknown) => {
      process.stderr.write(
        `${CLI_NAME}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
