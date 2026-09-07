/**
 * Vitest setup for the `integration` project (spec 001 §2 "Testing harness", AC-16, TASK-008).
 *
 * The suite is defined as "node env, Postgres via `DATABASE_URL`". 001 has no schema and no
 * queries (spec 002 owns those), so this file only guarantees the contract every future
 * integration test relies on: `process.env.DATABASE_URL` is set before any test module loads.
 *
 * Resolution order:
 *   1. `DATABASE_URL` from the environment — the `postgres:16` service container in CI, or a
 *      local Postgres.
 *   2. the `DATABASE_URL` placeholder in `.env.example` — so `pnpm test:integration` exits 0 on a
 *      clean clone with no database running. Nothing connects in 001; from spec 002 a test that
 *      needs a live database will fail against the placeholder, loudly and locally.
 * Neither present -> throw, naming the variable and no value (spec 001 §5 "never echo values").
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseEnvFileKeys } from "../../scripts/env-check.ts";

const VARIABLE = "DATABASE_URL";

/** The `KEY=value` line for `key` in a dotenv-style file, or undefined. */
export function readEnvExampleValue(
  contents: string,
  key: string,
): string | undefined {
  if (!parseEnvFileKeys(contents).includes(key)) return undefined;
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const [name, ...rest] = trimmed.replace(/^export\s+/, "").split("=");
    if (name?.trim() === key) return rest.join("=").trim();
  }
  return undefined;
}

export function resolveDatabaseUrl(
  fromEnvironment: string | undefined,
  envExample: string,
): string {
  if (fromEnvironment !== undefined && fromEnvironment !== "") {
    return fromEnvironment;
  }
  const placeholder = readEnvExampleValue(envExample, VARIABLE);
  if (placeholder === undefined || placeholder === "") {
    throw new Error(
      `${VARIABLE} is required by the integration suite and is absent from the environment and from .env.example`,
    );
  }
  return placeholder;
}

process.env[VARIABLE] = resolveDatabaseUrl(
  process.env[VARIABLE],
  readFileSync(resolve(process.cwd(), ".env.example"), "utf8"),
);
