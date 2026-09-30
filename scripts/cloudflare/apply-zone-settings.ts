/**
 * `pnpm cloudflare:apply` and `pnpm cloudflare:check` — the Cloudflare zone as code (spec 040
 * §5.4, §12 step 4, AC-15, AC-17, AC-23, AC-24; TASK-100).
 *
 * Reads `config/cloudflare/zone-settings.json` and compares it with the live zone:
 *
 *  - `--check` (CI mode, `pnpm cloudflare:check`) reads every declared value, prints one line per
 *    difference (`setting · declared · live · feature`) and exits 1 on drift. It performs **no
 *    write**: its client refuses every verb but `GET` before a request leaves the process.
 *  - Default mode (`pnpm cloudflare:apply`) writes each difference it can and is idempotent: a
 *    second run prints `cloudflare:apply: 0 changes`. A difference it will not write — a
 *    `bot_management` field, Under Attack mode, a setting the plan makes read-only — is printed as
 *    `manual:` and exits 1.
 *
 * Credentials: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`, from the environment only (the
 * founder's shell or the CI secret store; `docs/runbooks/railway-cloudflare-setup.md` "Cloudflare zone settings"). With
 * both absent the run prints `skipped: no token` and exits 0, so a contributor's local run is never
 * a failure (§5.4); with `--require-token`, as the `cloudflare-check` CI job runs it, it exits 2
 * naming them instead. With one of the two absent it always exits 2 naming the missing one. The
 * token is never printed.
 *
 * `--fixture <path>` replaces the API with recorded responses (`tests/fixtures/cloudflare/`); an
 * apply against a fixture writes to an in-memory copy only. That is how the contract tests run
 * the whole comparison without a token, and how a reviewer reproduces a failure.
 *
 * Exit codes: 0 match (or skipped) · 1 drift · 2 missing credentials · 3 the API refused or the
 * request was not allow-listed (a 403 names the missing token scope).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDFLARE_API_BASE,
  CloudflareApiError,
  EndpointNotAllowedError,
  MissingScopeError,
  type Transport,
  WriteInCheckModeError,
  ZONE_SETTINGS_PATH,
  type ZoneSettings,
  applyZone,
  checkZone,
  createRecordedTransport,
  createZoneClient,
  recordedZoneSchema,
  zoneSettingsSchema,
} from "../../src/lib/cloudflare-zone.ts";

export const TOKEN_KEY = "CLOUDFLARE_API_TOKEN";
export const ZONE_ID_KEY = "CLOUDFLARE_ZONE_ID";

/** Parse `config/cloudflare/zone-settings.json`. Throws a zod error naming the offending field. */
export function loadDeclaredZone(repoRoot: string): ZoneSettings {
  const path = resolve(repoRoot, ZONE_SETTINGS_PATH);
  return zoneSettingsSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** The live API. The only `fetch` in the Cloudflare scripts, and the only holder of the token. */
export function fetchTransport(token: string): Transport {
  return async (request) => {
    const init: RequestInit = {
      method: request.method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    };
    if (request.body !== undefined) init.body = JSON.stringify(request.body);
    const response = await fetch(`${CLOUDFLARE_API_BASE}${request.path}`, init);
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
}

export interface CliOptions {
  readonly check: boolean;
  readonly requireToken: boolean;
  readonly fixture: string | undefined;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const fixtureIndex = argv.indexOf("--fixture");
  return {
    check: argv.includes("--check"),
    requireToken: argv.includes("--require-token"),
    fixture: fixtureIndex === -1 ? undefined : argv[fixtureIndex + 1],
  };
}

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

function command(options: CliOptions): string {
  return options.check ? "cloudflare:check" : "cloudflare:apply";
}

/** The source of the answers: a recorded file, the live API, or a reason not to run. */
function resolveTransport(
  options: CliOptions,
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): { transport: Transport; zoneId: string } | CliResult {
  if (options.fixture !== undefined) {
    const recorded = recordedZoneSchema.parse(
      JSON.parse(readFileSync(resolve(cwd, options.fixture), "utf8")),
    );
    return {
      transport: createRecordedTransport(recorded).transport,
      zoneId: recorded.zoneId,
    };
  }
  const token = env[TOKEN_KEY];
  const zoneId = env[ZONE_ID_KEY];
  const runbook =
    "docs/runbooks/railway-cloudflare-setup.md, section Cloudflare zone settings";
  if (!present(token) && !present(zoneId)) {
    if (options.requireToken) {
      return {
        code: 2,
        stdout: "",
        stderr: `${command(options)} needs ${TOKEN_KEY} and ${ZONE_ID_KEY}, and neither is set. In CI they are the repository secrets of the same names (${runbook}); this run must not pass without them.\n`,
      };
    }
    return { code: 0, stdout: "skipped: no token\n", stderr: "" };
  }
  if (!present(token) || !present(zoneId)) {
    const missing = present(token) ? ZONE_ID_KEY : TOKEN_KEY;
    return {
      code: 2,
      stdout: "",
      stderr: `${command(options)} needs ${missing}: ${present(token) ? TOKEN_KEY : ZONE_ID_KEY} is set and ${missing} is not (${runbook})\n`,
    };
  }
  return { transport: fetchTransport(token), zoneId };
}

/** The whole run, without touching `process`: what the CLI prints and the code it exits with. */
export async function run(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): Promise<CliResult> {
  const options = parseArgs(argv);
  const source = resolveTransport(options, env, cwd);
  if ("code" in source) return source;

  const declared = loadDeclaredZone(cwd);
  const client = createZoneClient({
    zoneId: source.zoneId,
    mode: options.check ? "check" : "apply",
    transport: source.transport,
  });
  try {
    const report = options.check
      ? await checkZone(declared, client)
      : await applyZone(declared, client);
    const stdout = `${report.lines.join("\n")}\n`;
    if (report.ok) return { code: 0, stdout, stderr: "" };
    return {
      code: 1,
      stdout,
      stderr: `${command(options)} failed: each line above names a setting that differs from ${ZONE_SETTINGS_PATH}.\n`,
    };
  } catch (error) {
    if (
      error instanceof MissingScopeError ||
      error instanceof CloudflareApiError ||
      error instanceof EndpointNotAllowedError ||
      error instanceof WriteInCheckModeError
    ) {
      return {
        code: 3,
        stdout: "",
        stderr: `${command(options)}: ${error.message}\n`,
      };
    }
    throw error;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const result = await run(process.argv.slice(2), process.env, process.cwd());
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}
