/**
 * Stubs `process.env` with every non-empty value of `.env.example` (TASK-024), so a unit test can
 * import a route file whose module graph reads `@/lib/env` — the dummies of spec 001 §13 Q10,
 * accepted in `test` — without a real secret, URL or `.env.local` anywhere near it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { vi } from "vitest";

const EXAMPLE = resolve(import.meta.dirname, "../../../.env.example");

/** The `KEY=value` pairs of `.env.example` whose value is not blank. */
export function exampleEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(EXAMPLE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at <= 0) continue;
    const value = trimmed.slice(at + 1).trim();
    if (value !== "") values[trimmed.slice(0, at).trim()] = value;
  }
  return values;
}

/** `vi.stubEnv` for each pair; undone by `vi.unstubAllEnvs()` (or Vitest's `unstubEnvs`). */
export function stubExampleEnv(): void {
  for (const [key, value] of Object.entries(exampleEnv()))
    vi.stubEnv(key, value);
}
