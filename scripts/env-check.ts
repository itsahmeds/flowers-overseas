/**
 * `pnpm env:check` (spec 001 AC-11 / T-12, TASK-005).
 *
 * Compares the keys of `.env.example` with the keys of the zod schemas in `src/lib/env.schema.ts`
 * in both directions and exits non-zero when they differ, so a new variable cannot be added to
 * one without the other. Values are never printed.
 *
 * Usage: `pnpm env:check` · `pnpm env:check --file tests/fixtures/env/extra-key.env`
 *
 * The schema import carries its `.ts` extension because `pnpm env:check` runs this file directly
 * on Node (type stripping), where ESM does not guess extensions; `allowImportingTsExtensions` in
 * `tsconfig.json` keeps `pnpm typecheck` happy.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ENV_KEYS } from "../src/lib/env.schema.ts";

export interface EnvCheckReport {
  /** In the file, unknown to the schemas. */
  readonly unknownKeys: readonly string[];
  /** In the schemas, missing from the file. */
  readonly missingKeys: readonly string[];
  /** Declared twice in the file. */
  readonly duplicateKeys: readonly string[];
  readonly ok: boolean;
}

const KEY_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/** Keys declared in a dotenv-style file, in file order. Comments and blank lines are ignored. */
export function parseEnvFileKeys(contents: string): string[] {
  const keys: string[] = [];
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const match = KEY_LINE.exec(line);
    if (match?.[1] !== undefined) keys.push(match[1]);
  }
  return keys;
}

export function checkEnvKeys(
  fileKeys: readonly string[],
  schemaKeys: readonly string[] = ENV_KEYS,
): EnvCheckReport {
  const seen = new Set<string>();
  const duplicateKeys: string[] = [];
  for (const key of fileKeys) {
    if (seen.has(key)) duplicateKeys.push(key);
    seen.add(key);
  }
  const schema = new Set(schemaKeys);
  const unknownKeys = [...seen].filter((key) => !schema.has(key)).sort();
  const missingKeys = schemaKeys.filter((key) => !seen.has(key)).sort();
  return {
    unknownKeys,
    missingKeys,
    duplicateKeys: [...new Set(duplicateKeys)].sort(),
    ok:
      unknownKeys.length === 0 &&
      missingKeys.length === 0 &&
      duplicateKeys.length === 0,
  };
}

export function checkEnvFile(path: string): EnvCheckReport {
  return checkEnvKeys(parseEnvFileKeys(readFileSync(path, "utf8")));
}

export function formatEnvCheckReport(
  path: string,
  report: EnvCheckReport,
): string {
  if (report.ok) {
    return `env:check: ${path} and the zod schema agree on ${String(ENV_KEYS.length)} keys`;
  }
  const lines = [`env:check failed for ${path}:`];
  for (const key of report.unknownKeys) {
    lines.push(
      `  - ${key}: in ${path} but not in the zod schema (src/lib/env.schema.ts)`,
    );
  }
  for (const key of report.missingKeys) {
    lines.push(`  - ${key}: in the zod schema but not in ${path}`);
  }
  for (const key of report.duplicateKeys) {
    lines.push(`  - ${key}: declared more than once in ${path}`);
  }
  return lines.join("\n");
}

function fileArg(argv: readonly string[]): string {
  const index = argv.indexOf("--file");
  const value = index === -1 ? undefined : argv[index + 1];
  return value ?? ".env.example";
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const path = fileArg(process.argv.slice(2));
  const report = checkEnvFile(resolve(process.cwd(), path));
  const output = formatEnvCheckReport(path, report);
  if (report.ok) {
    process.stdout.write(`${output}\n`);
  } else {
    process.stderr.write(`${output}\n`);
    process.exit(1);
  }
}
