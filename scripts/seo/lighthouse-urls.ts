/**
 * `lighthouse-urls` (spec 001 §2 "CI", AC-23 / T-24, TASK-009).
 *
 * Prints one `--collect.url=<absolute url>` argument per line for every path in
 * `tests/fixtures/seo/lighthouse-urls.json`, resolved against the base URL of the run:
 *
 * ```sh
 * pnpm exec lhci autorun $(node scripts/seo/lighthouse-urls.ts)
 * ```
 *
 * Lighthouse CI cannot read a URL list out of a JSON file of our shape, and `lighthouserc.json`
 * cannot interpolate the preview URL, so the list stays data (spec 007 extends it without
 * touching CI) and this script is the only place that joins it to a base URL.
 *
 * Base URL: `LHCI_BASE_URL`, else `PLAYWRIGHT_BASE_URL` (the preview URL the `preview` CI job
 * resolved — same variable the Playwright suites use), else `http://localhost:3000`.
 *
 * Usage: `node scripts/seo/lighthouse-urls.ts [--file <path>] [--base <url>]`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

import { exitWith, formatZodError, isMainModule } from "./lib.ts";

export const DEFAULT_FILE = "tests/fixtures/seo/lighthouse-urls.json";
export const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * The URL list: non-empty, root-relative paths only. Root-relative because the same list is
 * measured against localhost, a preview and (from spec 007) production.
 */
export const lighthouseUrlsSchema = z
  .array(
    z
      .string()
      .min(1)
      .refine((path) => path.startsWith("/"), {
        message: "must be a root-relative path starting with '/'",
      })
      .refine((path) => !path.startsWith("//"), {
        message: "must not start with '//' (that is a protocol-relative URL)",
      }),
  )
  .min(1);

export function parseUrlList(raw: string): string[] {
  const parsed = lighthouseUrlsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${DEFAULT_FILE} is not a non-empty array of root-relative paths (${formatZodError(parsed.error)})`,
    );
  }
  return [...parsed.data];
}

export function resolveBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const base =
    env["LHCI_BASE_URL"] ?? env["PLAYWRIGHT_BASE_URL"] ?? DEFAULT_BASE_URL;
  const trimmed = base.trim().replace(/\/+$/, "");
  if (trimmed === "") throw new Error("the Lighthouse base URL is empty");
  return trimmed;
}

export function collectUrlArgs(
  baseUrl: string,
  paths: readonly string[],
): string[] {
  return paths.map((path) => `--collect.url=${baseUrl}${path}`);
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value === "" ? undefined : value;
}

export function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  out: { write: (chunk: string) => unknown } = process.stdout,
  err: { write: (chunk: string) => unknown } = process.stderr,
): number {
  try {
    const file = resolve(
      process.cwd(),
      argValue(argv, "--file") ?? DEFAULT_FILE,
    );
    const baseUrl = argValue(argv, "--base") ?? resolveBaseUrl(env);
    const args = collectUrlArgs(
      baseUrl,
      parseUrlList(readFileSync(file, "utf8")),
    );
    out.write(`${args.join("\n")}\n`);
    return 0;
  } catch (error) {
    err.write(`lighthouse-urls: ${(error as Error).message}\n`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) exitWith(main(process.argv.slice(2)));
