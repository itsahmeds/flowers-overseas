/**
 * `pnpm check:no-db` (spec 003 AC-2 / T-02, TASK-033).
 *
 * Spec 003 is implementable while spec 002's provisioning is parked precisely because nothing it
 * adds touches Postgres (§1 "No database", §3 "Non-goals"). This script is the assertion behind
 * that claim: for the spec 003 file set it reports
 *
 *  1. any import of the database client, an ORM or a Postgres driver, and
 *  2. any read of `DATABASE_URL`.
 *
 * (2) is how AC-2's "`pnpm build` and `pnpm test` succeed with `DATABASE_URL` unset/placeholder"
 * clause is met **without weakening `src/lib/env.schema.ts`**, which still requires the key for
 * the application as a whole (the CI `build` job builds against `.env.example`): the modules this
 * spec adds never read it, so their behaviour cannot depend on it.
 *
 * `SCANNED_PATHS` is the explicit, extendable file set: a later spec-003 task that adds a
 * directory (or a spec that wants the same guarantee) adds it to this list and nothing else.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The scanned file set. Extend this, not the caller.
 *
 * `src/config` and `src/modules/i18n` are spec 003's (§5.2's file list). `src/modules/catalog` is
 * spec 005's (AC-2, TASK-060): the catalogue and pricing module is written against three provider
 * interfaces precisely so that it is readable, testable and demoable while spec 002's
 * provisioning is parked, and this is the assertion behind that claim. The dataset directory
 * `src/config/catalogue/**` (TASK-061) is covered by the `src/config` entry, which is recursive —
 * listing it again would report every hit in it twice.
 */
export const SCANNED_PATHS = [
  "src/config",
  "src/modules/i18n",
  "src/modules/catalog",
] as const;

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

/**
 * Module specifiers no file in the set may import. `@/lib/db*` and any relative path into a
 * `lib/db` directory cover spec 002's client; the rest are the ORM and the drivers ADR-0008 and
 * ADR-0012 put in play.
 */
export const BANNED_MODULE_PATTERNS: readonly {
  label: string;
  pattern: RegExp;
}[] = [
  {
    label: "src/lib/db",
    pattern: /^(?:@\/|(?:\.\.?\/)+)?(?:src\/)?lib\/db(?:$|[/.])/,
  },
  { label: "drizzle", pattern: /^drizzle(?:$|[-/])/ },
  { label: "pg", pattern: /^pg(?:$|\/)/ },
  { label: "postgres", pattern: /^postgres(?:$|[-./])/ },
  { label: "@neondatabase", pattern: /^@neondatabase(?:$|\/)/ },
];

/** `import … from "x"`, `export … from "x"`, `import("x")` and `require("x")`. */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
  /(?:^|\s)(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/gs,
  /(?:^|\s)import\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const DATABASE_URL_PATTERN = /\bDATABASE_URL\b/;

export interface ImportHit {
  file: string;
  line: number;
  specifier: string;
  banned: string;
}

export interface EnvHit {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

function scannedFiles(
  root: string,
  paths: readonly string[] = SCANNED_PATHS,
): string[] {
  return paths.flatMap((path) => walk(join(root, path)));
}

/** Strip a trailing `.ts`/`.js` extension so `./currencies.ts` and `./currencies` compare alike. */
function normaliseSpecifier(specifier: string): string {
  return specifier.replace(/\.(?:m|c)?(?:ts|js)x?$/, "");
}

export function findDatabaseImports(
  root: string,
  paths: readonly string[] = SCANNED_PATHS,
): ImportHit[] {
  const hits: ImportHit[] = [];
  for (const file of scannedFiles(root, paths)) {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    const seen = new Set<string>();
    for (const pattern of SPECIFIER_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const specifier = match[1];
        if (specifier === undefined) continue;
        const banned = BANNED_MODULE_PATTERNS.find((candidate) =>
          candidate.pattern.test(normaliseSpecifier(specifier)),
        );
        if (banned === undefined) continue;
        const line =
          lines.findIndex((text) => text.includes(specifier)) + 1 || 1;
        const key = `${specifier}:${String(line)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          file: relative(root, file),
          line,
          specifier,
          banned: banned.label,
        });
      }
    }
  }
  return hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function findDatabaseUrlReads(
  root: string,
  paths: readonly string[] = SCANNED_PATHS,
): EnvHit[] {
  const hits: EnvHit[] = [];
  for (const file of scannedFiles(root, paths)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((text, index) => {
        if (DATABASE_URL_PATTERN.test(text)) {
          hits.push({
            file: relative(root, file),
            line: index + 1,
            text: text.trim(),
          });
        }
      });
  }
  return hits;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const imports = findDatabaseImports(root);
  const envReads = findDatabaseUrlReads(root);
  if (imports.length > 0 || envReads.length > 0) {
    for (const hit of imports) {
      process.stderr.write(
        `${hit.file}:${String(hit.line)}: imports \`${hit.specifier}\` (banned: ${hit.banned})\n`,
      );
    }
    for (const hit of envReads) {
      process.stderr.write(
        `${hit.file}:${String(hit.line)}: reads DATABASE_URL: ${hit.text}\n`,
      );
    }
    process.stderr.write(
      `${String(imports.length)} database import(s) and ${String(envReads.length)} DATABASE_URL read(s) in ${SCANNED_PATHS.join(", ")} (spec 003 AC-2 allows none)\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `no database import and no DATABASE_URL read in ${SCANNED_PATHS.join(", ")} (AC-2)\n`,
  );
}
