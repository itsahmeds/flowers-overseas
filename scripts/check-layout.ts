/**
 * Layout manifest for `plan/01-architecture.md` §5 (spec 001 AC-3 / T-03).
 *
 * `checkLayout(root)` reports paths the manifest requires but the tree lacks, and top-level
 * directories under `src/modules/` that the manifest does not know. Run directly with
 * `pnpm check-layout` (Node ≥ 24 strips types natively) or import from the unit test.
 * A spec that adds a module must add it here and to `docs/architecture.md` (TASK-012); the same
 * applies to a file added under `src/config/` (`CONFIG_FILES`, TASK-033).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MODULES = [
  "catalog",
  "geo",
  "orders",
  "payments",
  "partners",
  "customers",
  "notifications",
  "seo",
  "i18n",
  "analytics",
  "admin",
] as const;

export const REQUIRED_DIRS = [
  "src/app",
  "src/modules",
  "src/lib",
  "src/jobs",
  "src/emails",
  "src/config",
  "tests/unit",
  "tests/integration",
  "tests/e2e",
  "tests/contract",
  "tests/visual",
  "tests/fixtures",
  "supabase/migrations",
  "seed",
  "messages",
  "scripts",
] as const;

/**
 * Config modules that other specs read rather than restate (spec 003 §5.2, TASK-033). They are
 * required files, not optional data: `toLocaleRow()`/`toCurrencyRow()` are how spec 002's seed
 * gets the locale and currency sets, and the address formats are how a new destination country
 * becomes data. `docs/architecture.md` §2 lists the same set (`tests/unit/architecture-doc.test.ts`).
 */
export const CONFIG_FILES = [
  "src/config/locales.ts",
  "src/config/currencies.ts",
  "src/config/address-formats.ts",
] as const;

export const REQUIRED_FILES = [
  ...MODULES.map((m) => `src/modules/${m}/index.ts`),
  ...CONFIG_FILES,
];

export interface LayoutReport {
  missing: string[];
  extraModules: string[];
}

function isDir(p: string): boolean {
  return existsSync(p) && statSync(p).isDirectory();
}

function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}

export function checkLayout(root: string): LayoutReport {
  const missing: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    if (!isDir(join(root, dir))) missing.push(`${dir}/`);
  }
  for (const file of REQUIRED_FILES) {
    if (!isFile(join(root, file))) missing.push(file);
  }

  const modulesDir = join(root, "src/modules");
  const known: ReadonlySet<string> = new Set(MODULES);
  const extraModules = isDir(modulesDir)
    ? readdirSync(modulesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !known.has(entry.name))
        .map((entry) => `src/modules/${entry.name}/`)
    : [];

  return { missing, extraModules };
}

export function formatReport(report: LayoutReport): string {
  const lines: string[] = [];
  for (const m of report.missing) lines.push(`missing: ${m}`);
  for (const e of report.extraModules)
    lines.push(
      `unknown module (add to scripts/check-layout.ts manifest): ${e}`,
    );
  return lines.join("\n");
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const report = checkLayout(root);
  const problems = report.missing.length + report.extraModules.length;
  if (problems > 0) {
    process.stderr.write(`${formatReport(report)}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `layout ok: ${String(REQUIRED_DIRS.length)} dirs, ${String(MODULES.length)} module barrels, ${String(CONFIG_FILES.length)} config modules\n`,
  );
}
