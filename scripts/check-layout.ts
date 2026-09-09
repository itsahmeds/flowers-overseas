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
  // spec 004 §2 / §13 Q9 (TASK-045): the design system. A documented addition to `plan/01` §5's
  // domain-shaped module list, because `app/` must stay routes-only while the header and footer
  // are rendered by every route group. Registered here and in `docs/architecture.md` §3 in the
  // same PR, as the rule above requires.
  "ui",
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
  // spec 006 §2.2 (TASK-072): the seed dataset and the schemas it parses under. `seed/schema/`
  // holds every `Seed*Schema` and every `to*Row()` projection onto spec 002 §5.1's columns;
  // `seed/data/` is the versioned, zod-validated dataset spec 002's importer reads (spec 002
  // §14 A1 (d)). Both are required, not optional: without them there is no catalogue to seed.
  "seed/schema",
  "seed/data",
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
  // The authored locale rows as plain constants, imported by `locales.ts` (which validates them)
  // and by the 500 document's copy path (which must reach no zod) — TASK-046.
  "src/config/locales.data.ts",
  "src/config/currencies.ts",
  "src/config/address-formats.ts",
  // The cookie register: every cookie and storage key the app sets or intends to set, with its
  // category, lifetime and purpose message key. The settings panel, spec 007's cookie policy,
  // `docs/compliance/cookie-register.md`'s generated table and AC-22's session check all read it
  // — TASK-050.
  "src/config/cookies.ts",
  // The Phase 0 data registries of spec 004 §2/§5.1 (TASK-047): the destination list with its
  // `toCountryRow()` projection, the header/footer link registry behind `isPublished()`, the
  // category row, and the company identity behind `registered`.
  "src/config/countries.ts",
  "src/config/site-links.ts",
  "src/config/categories.ts",
  "src/config/company.ts",
  // The payment methods the colophon may name, each with `available: false` until spec 013/014
  // configures a processor — spec 004 §8's third-party-trademark and live-method rule as data
  // (TASK-049).
  "src/config/payment-methods.ts",
  // The authored catalogue dataset of spec 005 §2 / §13 Q9 (TASK-061): the single source of the
  // Phase 0 products, tiers, categories, occasions and add-ons, with `projections.ts` projecting
  // each onto spec 002 §5.1's row shapes so the seed (spec 002) and the importer (spec 006) read
  // it rather than restating 84 products (ADR-0017). `prices.data.ts` and `fx.data.ts` join the
  // list with TASK-062.
  "src/config/catalogue/schemas.ts",
  "src/config/catalogue/projections.ts",
  "src/config/catalogue/products.data.ts",
  "src/config/catalogue/tiers.data.ts",
  "src/config/catalogue/categories.data.ts",
  "src/config/catalogue/occasions.data.ts",
  "src/config/catalogue/addons.data.ts",
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
