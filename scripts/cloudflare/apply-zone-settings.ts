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
 * The edge (TASK-101: DNS records, cache rules, the `www` redirect, the rate limit, declared in
 * `config/cloudflare/edge.json`, logic in `./edge.ts`):
 *
 *  - The declaration is linted on **every** run, before the token is looked at: a lint problem
 *    exits 1 even where the zone itself is `skipped: no token`.
 *  - With the token, after the zone settings, the live edge is read (GETs only) and diffed. Both
 *    `--check` and the default mode only report it: the token holds no rules scope, so each
 *    difference names the founder step of the runbook that fixes it, and the default mode prints
 *    it as `manual:`. With `--fixture`, the edge is diffed only when `--edge-fixture <path>` names
 *    its own recording (the zone-settings recordings carry no DNS or ruleset answers).
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
import {
  EDGE_PATH,
  type EdgeDeclaration,
  type EdgeReport,
  checkEdge,
  edgeSchema,
  lintEdge,
} from "./edge.ts";

export const TOKEN_KEY = "CLOUDFLARE_API_TOKEN";
export const ZONE_ID_KEY = "CLOUDFLARE_ZONE_ID";

/** Parse `config/cloudflare/zone-settings.json`. Throws a zod error naming the offending field. */
export function loadDeclaredZone(repoRoot: string): ZoneSettings {
  const path = resolve(repoRoot, ZONE_SETTINGS_PATH);
  return zoneSettingsSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** Parse `config/cloudflare/edge.json`. Throws a zod error naming the offending field. */
export function loadDeclaredEdge(repoRoot: string): EdgeDeclaration {
  const path = resolve(repoRoot, EDGE_PATH);
  return edgeSchema.parse(JSON.parse(readFileSync(path, "utf8")));
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
    let response: Response;
    try {
      response = await fetch(`${CLOUDFLARE_API_BASE}${request.path}`, init);
    } catch (error) {
      // The error's message can quote the request's headers, the token among them: only its
      // name is kept (the 2026-10-03 run printed the masked token this way).
      throw new CloudflareApiError(
        0,
        `${request.method} ${request.path.replace(/^\/zones\/[^/]+/, "/zones/{zone_id}")}`,
        `the request failed before Cloudflare answered (${error instanceof Error ? error.name : "unknown error"})`,
      );
    }
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
  readonly edgeFixture: string | undefined;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const valueOf = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    check: argv.includes("--check"),
    requireToken: argv.includes("--require-token"),
    fixture: valueOf("--fixture"),
    edgeFixture: valueOf("--edge-fixture"),
  };
}

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

/**
 * Whitespace or a control character. Neither a Cloudflare token nor a zone id holds one, and a
 * header value with a line break makes `fetch` throw a message that quotes it (the token).
 */
const INVISIBLE = /[\s\p{Cc}]/u;

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

function command(options: CliOptions): string {
  return options.check ? "cloudflare:check" : "cloudflare:apply";
}

/** Where the answers come from: the zone's, and the edge's when there is one to read. */
interface Source {
  readonly transport: Transport;
  readonly zoneId: string;
  readonly edge:
    { readonly transport: Transport; readonly zoneId: string } | undefined;
}

/** The source of the answers: a recorded file, the live API, or a reason not to run. */
function resolveTransport(
  options: CliOptions,
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): Source | CliResult {
  if (options.fixture !== undefined) {
    const recorded = recordedZoneSchema.parse(
      JSON.parse(readFileSync(resolve(cwd, options.fixture), "utf8")),
    );
    let edge: Source["edge"];
    if (options.edgeFixture !== undefined) {
      const edgeRecorded = recordedZoneSchema.parse(
        JSON.parse(readFileSync(resolve(cwd, options.edgeFixture), "utf8")),
      );
      edge = {
        transport: createRecordedTransport(edgeRecorded).transport,
        zoneId: edgeRecorded.zoneId,
      };
    }
    return {
      transport: createRecordedTransport(recorded).transport,
      zoneId: recorded.zoneId,
      edge,
    };
  }
  if (options.edgeFixture !== undefined) {
    return {
      code: 2,
      stdout: "",
      stderr: `${command(options)}: --edge-fixture needs --fixture: a recorded edge is replayed beside a recorded zone, never beside the live one\n`,
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
  for (const [key, value] of [
    [TOKEN_KEY, token],
    [ZONE_ID_KEY, zoneId],
  ] as const) {
    if (INVISIBLE.test(value)) {
      const lines = value.split("\n").length;
      return {
        code: 2,
        stdout: "",
        stderr: `${command(options)}: ${key} holds a line break, a space or another invisible character (${plural(lines, "line")}): it was saved with more than the ${key === TOKEN_KEY ? "token" : "zone id"}. Save the ${key === TOKEN_KEY ? "token" : "zone id"} alone again (${runbook}). Its value is not printed.\n`,
      };
    }
  }
  const live = fetchTransport(token);
  return { transport: live, zoneId, edge: { transport: live, zoneId } };
}

/** The whole run, without touching `process`: what the CLI prints and the code it exits with. */
export async function run(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): Promise<CliResult> {
  const options = parseArgs(argv);
  const edge = loadDeclaredEdge(cwd);
  const problems = lintEdge(edge);
  if (problems.length > 0) {
    return {
      code: 1,
      stdout: `${problems.map((problem) => `${EDGE_PATH} · ${problem}`).join("\n")}\n`,
      stderr: `${command(options)} failed: ${EDGE_PATH} is unsafe to apply; each line above names the rule it breaks.\n`,
    };
  }
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
    const edgeReport =
      source.edge === undefined
        ? undefined
        : await checkEdge(edge, source.edge.transport, source.edge.zoneId);
    const stdout = `${[...report.lines, ...edgeLines(edgeReport, options)].join("\n")}\n`;
    const stderr = [
      report.ok
        ? ""
        : `${command(options)} failed: each line above names a setting that differs from ${ZONE_SETTINGS_PATH}.\n`,
      edgeReport === undefined || edgeReport.ok
        ? ""
        : `${command(options)} failed: the edge differs from ${EDGE_PATH}; the token cannot change it, so each line names the founder step that does.\n`,
    ].join("");
    return { code: stderr === "" ? 0 : 1, stdout, stderr };
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

/** The edge's lines: in the default mode a difference is printed `manual:`, as the zone's are. */
function edgeLines(
  report: EdgeReport | undefined,
  options: CliOptions,
): readonly string[] {
  if (report === undefined) return [];
  if (options.check) return report.lines;
  return [
    ...report.drifts.map((line) => `manual: ${line}`),
    ...report.lines.slice(report.drifts.length),
  ];
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
