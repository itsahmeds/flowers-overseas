/**
 * `pnpm seed:check` — the gate that makes `seed/data/**` trustworthy (spec 006 §2.3, §6, §11;
 * AC-7, AC-9, AC-10, AC-30; TASK-075).
 *
 * ```
 * pnpm seed:check            # exit 0 on the merged tree, one line per problem otherwise
 * pnpm seed:check --report   # also append the §11 catalogue-health report to the step summary
 * pnpm seed:check --as-of=2026-12-31T12:00:00Z   # judge the calendar rules at another instant
 * ```
 *
 * ## What it is
 *
 * Ten rule families over the committed dataset — the nine of spec 006 §2.3, in the order it lists
 * them, and the delivery-calendar family spec 009 AC-2 added (TASK-124):
 *
 *  1. **schema** — every file parses under its own schema, carries the `version`/`source` header,
 *     claims the right `origin`, and every projected file is byte-identical to a fresh projection
 *     (ADR-0017's `staleProjections()`, composed rather than restated);
 *  2. **counts** — 84 products in the 40/14/8/10/12 split, 23 categories, 6 add-ons, the occasion
 *     facet whole, and the `plan/02` §6 coverage the PL set must keep;
 *  3. **references** — every facet value, category/occasion edge, price row, media asset and
 *     prompt hash resolves to something that exists;
 *  4. **slugs** — ASCII, lowercase, hyphenated, no trailing slash, the ASCII fold of the name,
 *     and unique per locale **across** products, categories and occasions (AC-7);
 *  5. **prices** — band, integer minor units, currency, psychological ending, tier step and the
 *     single open-ended row, through `checkCatalogue()` (spec 005's 14 modes) over the rows in the
 *     **files**, so no band table is transcribed twice;
 *  6. **copy** — the word band, the closing florist sentence, banned superlatives, duplicate
 *     descriptions, the missing `en` name, and the delivery-timing prohibition of §14 A4, through
 *     `seed/copy.ts`'s functions (TASK-073 owns the definition of correct copy; this composes it);
 *  7. **media** — complete provenance, one primary per product, variants present with matching
 *     checksums *when a variants manifest has entries*, alt text per launch locale *when `alt/`
 *     exists*, no empty alt on a product image, no `delivery` asset;
 *  8. **privacy** — no `@`-shaped, E.164-shaped or postcode-shaped string, no person outside the
 *     allowlist in a person field, no competitor mark, reported with the file **and the JSON
 *     path** (AC-9);
 *  9. **budgets** — every variant in the manifest inside its slot's byte cap, and the bytes
 *     still committed under `public/media/` (since TASK-138, only the site-origin `hero` slot)
 *     under the 6 MB cap (`seed/budgets.ts`). The per-variant caps are read from the manifest
 *     rows, so they fire on a runner that holds no derived image at all.
 * 10. **calendar** (spec 009 AC-2, §5.1 amendment 2) — a published destination whose picker
 *     renders a calendar carries holiday rows for every calendar year its full 366-day horizon
 *     reaches; every holiday row has a `nameKey`; every dated occasion rule is one the evaluator
 *     can date in every year of that horizon. AC-2's fourth rule — a product with no authored
 *     slug where spec 009 §13 Q1 requires one — is family 4's `product-slug-required`, because
 *     every slug rule lives in one family (AC-7).
 *
 * One line per problem, naming the file, the entity key and the rule. Exit 0 on the merged tree.
 *
 * ## Three properties that are design, not accident
 *
 * **It composes; it does not restate.** The price family is `checkCatalogue()`, the copy family is
 * `copyProblems()` / `duplicateDescriptions()` / `deliveryTimingPhrasesIn()`, the slug fold is
 * `asciiFoldSlug()`, the projection check is `staleProjections()`, and every file's shape is its
 * own `Seed*FileSchema`. A gate that carried its own copy of `plan/10` §2.3's bands or of the
 * 60–90-word rule would agree with itself and drift from the dataset — the exact failure ADR-0017
 * exists to prevent.
 *
 * **It is a pure function of a tree value.** `readSeedTree()` does all the I/O and returns a
 * value; `checkSeedDataset()` and `seedHealthReport()` are pure. That is what lets one fixture per
 * family be a small *overlay* on the real dataset (`seed/check-cases.ts`) rather than a rotting
 * 60 KB copy of it, and it is why the unit suite can prove all nine families without a temp
 * directory per case.
 *
 * **One clock, read once, and no network, database or environment** — `pnpm check:no-db` covers
 * this file, and the only `process.env` read is `GITHUB_STEP_SUMMARY` inside `main()` (the
 * precedent of `scripts/catalogue-check.ts`). Until TASK-124 no rule could see the date; family
 * 10's holiday-coverage rule has to, because "in-window" is the picker's horizon **from today**
 * (`/review 97`: with 2027 rows only, the grid offered 1 January 2028 as open). So the instant is
 * a *value on the tree* — `SeedTree.asOf`, read by `readSeedTree()` beside the other I/O, pinned by
 * `--as-of=` and by the unit suite — and the rules stay pure functions of the tree. The verdict can
 * change at midnight exactly when the holiday data runs out under the horizon, and that is the
 * one change it exists to make.
 *
 * ## The one thing this file is *for* (§11)
 *
 * `--report` prints the standing catalogue-health report: product counts by type, the
 * per-(country, category) and per-(country, occasion) coverage table with **both sides** of the
 * six-product threshold visible, price-band outliers, the description word-count distribution,
 * copy review shares per locale, committed image bytes, per-slot maxima, products still on a
 * placeholder and the category/occasion `seoTitle` near-duplicate pairs spec 008 must nominate a
 * primary for. Every readiness verdict in it is computed from the same predicate the application
 * gates on (`isLocaleIndexable()`, `country.status`), because **a locale or a country must not be
 * able to look ready in CI while it is gated in code** (§11) — there is no second rule here to
 * drift from the first.
 *
 * It also prints the **holiday-coverage runway** (TASK-149): for each published destination, the
 * whole days before family 10's `holiday-coverage` goes red, and under
 * `HOLIDAY_COVERAGE_WARNING_DAYS` a warning line CI's step summary repeats. `--as-of=` replays
 * any day, so the warning is tested at 59, 60 and 61 days rather than waited for.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type CatalogueCheckInput,
  type CheckMode,
  catalogueCheckInput,
  checkCatalogue,
} from "../scripts/catalogue-check.ts";
import {
  PRICE_LITERAL_PATTERN,
  shingleDistinctness,
} from "../scripts/corridor-check.ts";
import { floristSentenceFor } from "../scripts/i18n-draft.ts";
import { COUNTRIES, COUNTRY_CODES } from "../src/config/countries.ts";
import {
  NEXT_AVAILABLE_HORIZON_DAYS,
  pickerState,
} from "../src/modules/geo/delivery/state.ts";
import { hasActivePartners } from "../src/modules/geo/partners.ts";
import { occasionDate } from "../src/modules/geo/occasions/evaluate.ts";
import type { OccasionRule } from "./schema/catalogue.ts";
import { zonedClock } from "../src/modules/i18n/format.ts";
import type {
  AddonCountryPriceData,
  AddonData,
  CategoryData,
  CountryPriceData,
  OccasionData,
  ProductData,
  ProductTierGroup,
} from "../src/config/catalogue/schemas.ts";
import { LAUNCH_LOCALE_DATA } from "../src/config/locales.data.ts";
import { launchLocales } from "../src/config/locales.ts";
import { bannedVoiceWordsIn } from "../src/config/voice.ts";
import {
  isLocaleIndexable,
  unreviewedShare,
} from "../src/modules/i18n/review.ts";
import {
  COMMITTED_MEDIA_BYTE_CAP,
  COMMITTED_MEDIA_DIR,
  COMMITTED_MEDIA_SLOTS,
  DERIVED_MEDIA_DIR,
  SLOT_BYTE_CAPS,
} from "./budgets.ts";
import {
  COPY_SOURCE_LOCALE,
  COPY_WORD_MAX,
  COPY_WORD_MIN,
  SEED_COPY_DIR,
  type SeedCopyFileEntity,
  asciiFoldSlug,
  bannedSuperlativesIn,
  copyProblems,
  deliveryTimingPhrasesIn,
  duplicateDescriptions,
  seedCopyPath,
  wordCount,
} from "./copy.ts";
import { staleProjections } from "./project.ts";
import { seedProductTierRecords } from "./schema/catalogue.ts";
import type { SeedCopy } from "./schema/copy.ts";
import {
  AddonPricesFileSchema,
  AddonsFileSchema,
  AltFileSchema,
  CategoriesFileSchema,
  MediaFileSchema,
  MediaVariantsFileSchema,
  OccasionCountryFileSchema,
  OccasionsFileSchema,
  PricesFileSchema,
  ProductTiersFileSchema,
  ProductsFileSchema,
  SEED_COPY_FILES,
  SEED_DATA_DIR,
  HolidaysFileSchema,
  SEED_DATA_FILES,
  TaxonomyFileSchema,
  seedAddonPriceFilePath,
  seedPriceFilePath,
} from "./schema/files.ts";
import type {
  MediaAssetManifest,
  MediaSlot,
  MediaVariantManifest,
} from "./schema/media.ts";
import { mediaSlots, promptHash } from "./schema/index.ts";
import { ImageryPromptFileSchema } from "./schema/prompts.ts";

export const CLI_NAME = "seed:check";

/* -------------------------------------------------------------------------- */
/* Problems.                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The nine rule families of spec 006 §2.3 and spec 009 AC-2's delivery-calendar family, in
 * reporting order.
 */
export const SEED_CHECK_FAMILIES = [
  "schema",
  "counts",
  "references",
  "slugs",
  "prices",
  "copy",
  "media",
  "privacy",
  "budgets",
  "calendar",
] as const;

export type SeedCheckFamily = (typeof SEED_CHECK_FAMILIES)[number];

/**
 * One fault: the family it belongs to, the file to open, the entity key to look for, the rule
 * that was broken and why it matters. `key` is a natural key (`FO-BQ-001`, `category:birthday`,
 * `fo-bq-001-hero`) or a JSON path (family 8, AC-9), never an index into an array.
 */
export interface SeedProblem {
  readonly family: SeedCheckFamily;
  /** Repo-relative path, so a CI log line can be pasted into an editor. */
  readonly file: string;
  readonly key: string;
  readonly rule: string;
  readonly message: string;
}

/** One line per problem, naming file, entity key and rule (spec 006 §2.3). */
export function formatSeedProblems(problems: readonly SeedProblem[]): string {
  return problems
    .map(
      (problem) =>
        `${problem.file}: [${problem.family}/${problem.rule}] \`${problem.key}\` ${problem.message}`,
    )
    .join("\n");
}

/** The families a problem list touches, in `SEED_CHECK_FAMILIES` order. */
export function familiesOf(
  problems: readonly SeedProblem[],
): readonly SeedCheckFamily[] {
  return SEED_CHECK_FAMILIES.filter((family) =>
    problems.some((problem) => problem.family === family),
  );
}

/** The process exit code for a run: 0 on a clean tree, 1 with any problem (AC-10). */
export function seedCheckExitCode(problems: readonly SeedProblem[]): number {
  return problems.length === 0 ? 0 : 1;
}

/* -------------------------------------------------------------------------- */
/* The tree.                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * An image file on disk and its size: a committed site-origin copy under `public/media/`, or a
 * derived file under `.local/media/` where that tree exists (families 7 and 9).
 */
export interface MediaFile {
  /** Repo-relative, POSIX-separated: `public/media/home-hero/1200.avif`. */
  readonly path: string;
  readonly bytes: number;
}

/**
 * The dataset as read from disk, before any schema has run: raw JSON per file plus the facts a
 * parser cannot see (which files exist, which are stale, what bytes are committed).
 *
 * Raw rather than parsed on purpose. Family 1 is "does this parse", so the tree cannot be a tree
 * of parsed values; and family 4 has to see a slug **as written** — `SlugSchema` would have
 * rejected an uppercase one before the slug family could name the rule (AC-7 asks the gate for
 * that message, not zod).
 */
export interface SeedTree {
  readonly root: string;
  /** Raw JSON keyed by path relative to `seed/data/`. */
  readonly raw: ReadonlyMap<string, unknown>;
  /** Dataset files the layout requires that are not on disk. */
  readonly missing: readonly string[];
  /**
   * Paths supplied by a fixture overlay. Excluded from the projection-staleness rule: staleness is
   * a property of the *committed* bytes, and an overlaid file is by definition not committed.
   */
  readonly overlaid: readonly string[];
  /** `staleProjections()` over the committed tree (ADR-0017). */
  readonly stale: readonly string[];
  /** Copy locales found under `seed/data/copy/` (`en` is required; `de`/`pl` may be absent). */
  readonly copyLocales: readonly string[];
  /** Alt-text locales found under `seed/data/alt/`, empty until TASK-077 authors them. */
  readonly altLocales: readonly string[];
  /** `catalog.floristSentence` per copy locale, resolved through the application's fallback. */
  readonly floristSentences: ReadonlyMap<string, string>;
  /** Raw `content/imagery/prompts/{key}.json`, keyed by file stem. */
  readonly prompts: ReadonlyMap<string, unknown>;
  /**
   * Image files under `public/media/` (committed: the site-origin `hero` slot since TASK-138's
   * split, present on every runner) and under `.local/media/` (derived: **empty on a clean clone
   * and in CI**, since every other slot lives in the bucket). One listing, told apart by prefix;
   * the manifest — committed — carries the byte count each file is checked against.
   */
  readonly mediaFiles: readonly MediaFile[];
  /**
   * The instant family 10 judges the holiday horizon from (spec 009 AC-2). Read once by
   * `readSeedTree()`, as the rest of the I/O is; a case or a test pins it, and `--as-of=` replays
   * a CI run. Nothing else in the gate reads it.
   */
  readonly asOf: Date;
}

/** A fixture overlay: raw JSON replacing (or adding) one dataset file. */
export type SeedTreeOverlay = ReadonlyMap<string, unknown>;

const MEDIA_FILE = "media.json";
const VARIANTS_FILE = "media-variants.json";
const ALT_DIR = "alt";

function readJsonIfPresent(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function listJsonStems(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

function listFilesRecursively(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursively(full));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

/** Every dataset file path the layout expects, relative to `seed/data/`. */
export function seedDataFilePaths(tree: {
  readonly copyLocales: readonly string[];
  readonly altLocales: readonly string[];
}): readonly string[] {
  return [
    ...SEED_DATA_FILES.map((file) => file.path),
    VARIANTS_FILE,
    ...tree.copyLocales.flatMap((locale) =>
      SEED_COPY_FILES.map((file) =>
        seedCopyPath(locale, file.entity as SeedCopyFileEntity),
      ),
    ),
    ...tree.altLocales.map((locale) => `${ALT_DIR}/${locale}.json`),
  ];
}

/**
 * Read the dataset. The only I/O in this module, and the only place a path is joined: everything
 * downstream is a pure function of the value returned here (which is what makes a fixture an
 * overlay instead of a temp directory).
 */
export async function readSeedTree(
  root: string,
  overlay: SeedTreeOverlay = new Map(),
  asOf: Date = new Date(),
): Promise<SeedTree> {
  const dataDir = join(root, SEED_DATA_DIR);
  const copyLocales = existsSync(join(dataDir, SEED_COPY_DIR))
    ? readdirSync(join(dataDir, SEED_COPY_DIR), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];
  const altLocales = listJsonStems(join(dataDir, ALT_DIR));

  const raw = new Map<string, unknown>();
  const missing: string[] = [];
  for (const path of seedDataFilePaths({ copyLocales, altLocales })) {
    const value = readJsonIfPresent(join(dataDir, path));
    if (value === undefined) {
      // `media-variants.json` and `alt/` arrive with TASK-078/TASK-077: absent is a legal Phase-0
      // state, and the media family says so explicitly rather than failing on a file nobody has
      // authored yet (spec 006 §2.1's provisioning seam).
      if (path !== VARIANTS_FILE) missing.push(path);
      continue;
    }
    raw.set(path, value);
  }
  for (const [path, value] of overlay) raw.set(path, value);

  const prompts = new Map<string, unknown>();
  const promptsDir = join(root, "content/imagery/prompts");
  for (const stem of listJsonStems(promptsDir)) {
    prompts.set(stem, readJsonIfPresent(join(promptsDir, `${stem}.json`)));
  }

  const mediaFiles = [
    ...listFilesRecursively(join(root, COMMITTED_MEDIA_DIR)),
    ...listFilesRecursively(join(root, DERIVED_MEDIA_DIR)),
  ].map((path) => ({
    path: relative(root, path).split(/[\\/]/u).join(posix.sep),
    bytes: statSync(path).size,
  }));

  const floristSentences = new Map<string, string>();
  for (const locale of copyLocales) {
    try {
      floristSentences.set(locale, floristSentenceFor(root, locale));
    } catch {
      // A locale with no `catalog.floristSentence` anywhere in its fallback chain: the copy family
      // reports it against the copy file rather than throwing out of the whole gate.
    }
  }

  return {
    root,
    raw,
    missing,
    overlaid: [...overlay.keys()],
    stale: await staleProjections(root),
    copyLocales,
    altLocales,
    floristSentences,
    prompts,
    mediaFiles,
    asOf,
  };
}

/* -------------------------------------------------------------------------- */
/* Parsing (family 1) and the typed views the other families read.            */
/* -------------------------------------------------------------------------- */

interface Parsed {
  readonly problems: readonly SeedProblem[];
  readonly taxonomy:
    | {
        readonly facets: Readonly<Record<string, readonly string[]>>;
        readonly substitutionClasses: readonly string[];
      }
    | undefined;
  readonly products: readonly ProductData[];
  readonly tierGroups: readonly ProductTierGroup[];
  readonly categories: readonly CategoryData[];
  readonly occasions: readonly OccasionData[];
  readonly addons: readonly AddonData[];
  readonly occasionCountry: readonly {
    readonly occasionKey: string;
    readonly countryIso2: string;
    readonly observed: boolean;
  }[];
  readonly prices: readonly CountryPriceData[];
  readonly addonPrices: readonly AddonCountryPriceData[];
  readonly media: readonly MediaAssetManifest[];
  readonly variants: readonly MediaVariantManifest[] | undefined;
  readonly copy: ReadonlyMap<string, readonly SeedCopy[]>;
  readonly alt: ReadonlyMap<
    string,
    readonly { assetId: string; alt: string }[]
  >;
}

const dataFile = (path: string): string => `${SEED_DATA_DIR}/${path}`;

/** A raw field as an array, whatever it actually was (see `parseTree`'s note on raw views). */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** The schema each dataset file parses under, by path. */
function schemaFor(
  path: string,
): { parse: (value: unknown) => unknown } | undefined {
  const bySimplePath: Record<string, { parse: (value: unknown) => unknown }> = {
    "taxonomy.json": TaxonomyFileSchema,
    "categories.json": CategoriesFileSchema,
    "occasions.json": OccasionsFileSchema,
    "occasion-country.json": OccasionCountryFileSchema,
    "holidays.json": HolidaysFileSchema,
    "products.json": ProductsFileSchema,
    "product-tiers.json": ProductTiersFileSchema,
    "addons.json": AddonsFileSchema,
    [MEDIA_FILE]: MediaFileSchema,
    [VARIANTS_FILE]: MediaVariantsFileSchema,
  };
  const simple = bySimplePath[path];
  if (simple !== undefined) return simple;
  if (path.startsWith("prices/")) return PricesFileSchema;
  if (path.startsWith("addon-prices/")) return AddonPricesFileSchema;
  if (path.startsWith(`${ALT_DIR}/`)) return AltFileSchema;
  if (path.startsWith(`${SEED_COPY_DIR}/`)) {
    const filename = path.split("/").at(-1);
    return SEED_COPY_FILES.find((file) => file.filename === filename)?.schema;
  }
  return undefined;
}

/** The `origin` a file's header must claim (`SEED_DATA_FILES`), where the layout fixes it. */
function expectedOrigin(path: string): "authored" | "projected" | undefined {
  const declared = SEED_DATA_FILES.find((file) => file.path === path);
  if (declared !== undefined) return declared.origin;
  // Copy, alt and the variant manifest are authored (a reviewer edits a draft in place, and
  // `media:variants` writes a manifest a human then reads) — `seed/schema/files.ts` says why.
  if (
    path.startsWith(`${SEED_COPY_DIR}/`) ||
    path.startsWith(`${ALT_DIR}/`) ||
    path === VARIANTS_FILE
  ) {
    return "authored";
  }
  return undefined;
}

/**
 * Family 1: parse every file, check its declared `origin`, and assert that no projected file has
 * been hand-edited. A file that does not parse is reported once and then **skipped** by the later
 * families rather than guessed at: a second error derived from an unparsed file is noise on top of
 * the one line that matters.
 */
function parseTree(tree: SeedTree): Parsed {
  const problems: SeedProblem[] = [];
  const parsedByPath = new Map<string, Record<string, unknown>>();

  for (const [path, value] of tree.raw) {
    const schema = schemaFor(path);
    if (schema === undefined) {
      problems.push({
        family: "schema",
        file: dataFile(path),
        key: path,
        rule: "unknown-file",
        message:
          "is not part of the dataset layout: add it to `SEED_DATA_FILES` (or its family list) in `seed/schema/files.ts` so it has a schema, or delete it",
      });
      continue;
    }
    try {
      parsedByPath.set(path, schema.parse(value) as Record<string, unknown>);
    } catch (error) {
      const issues = (
        error as { issues?: { path?: unknown[]; message: string }[] }
      ).issues;
      if (issues === undefined) {
        problems.push({
          family: "schema",
          file: dataFile(path),
          key: path,
          rule: "schema",
          message: `could not be parsed: ${String(error)}`,
        });
        continue;
      }
      for (const issue of issues) {
        problems.push({
          family: "schema",
          file: dataFile(path),
          key:
            (issue.path ?? []).map((segment) => String(segment)).join(".") ||
            path,
          rule: "schema",
          message: issue.message,
        });
      }
    }
  }

  for (const path of tree.missing) {
    problems.push({
      family: "schema",
      file: dataFile(path),
      key: path,
      rule: "missing-file",
      message:
        "is required by the `seed/data/` layout of spec 006 §2.2 and is not on disk",
    });
  }

  for (const [path, parsed] of parsedByPath) {
    const expected = expectedOrigin(path);
    const origin = parsed["origin"];
    if (expected !== undefined && origin !== expected) {
      problems.push({
        family: "schema",
        file: dataFile(path),
        key: path,
        rule: "origin",
        message: `claims \`origin: "${String(origin)}"\` but the layout makes it \`${expected}\` (ADR-0017: a projected file is generated, an authored file is edited)`,
      });
    }
  }

  for (const path of tree.stale) {
    const relativePath = path.startsWith(`${SEED_DATA_DIR}/`)
      ? path.slice(SEED_DATA_DIR.length + 1)
      : path;
    if (tree.overlaid.includes(relativePath)) continue;
    problems.push({
      family: "schema",
      file: path,
      key: relativePath,
      rule: "stale-projection",
      message:
        "differs from a fresh projection of `src/config/catalogue/` — run `pnpm seed:project` (ADR-0017: never hand-edit a projected file)",
    });
  }

  // The views the other eight families read are built from the **raw** rows, not from the parsed
  // ones, and that is the single most important decision in this file.
  //
  // Family 1 owns strictness. If the views were the parsed values, then every rule whose fault
  // also violates a schema would be unreachable — a float price, a second open-ended row, a second
  // primary image and an uppercase slug are all rejected by their file schema, so the file would
  // contribute *no rows*, and the gate would answer "83 products have no price in PL" instead of
  // "`FO-BQ-001`'s amount is not an integer". AC-6, AC-7 and AC-10 ask this gate for the second
  // message. Reading raw keeps every rule independently reportable, and the cost — the rules must
  // tolerate a missing or mistyped field — is paid once in `rowsOf`'s guards.
  const rowsOf = <T>(path: string): readonly T[] => {
    const rows = (tree.raw.get(path) as { rows?: unknown } | undefined)?.rows;
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (row) => typeof row === "object" && row !== null,
    ) as readonly T[];
  };

  const copy = new Map<string, readonly SeedCopy[]>();
  for (const path of tree.raw.keys()) {
    if (!path.startsWith(`${SEED_COPY_DIR}/`)) continue;
    copy.set(path, rowsOf<SeedCopy>(path));
  }

  const alt = new Map<string, readonly { assetId: string; alt: string }[]>();
  for (const path of tree.raw.keys()) {
    if (!path.startsWith(`${ALT_DIR}/`)) continue;
    alt.set(
      path.slice(ALT_DIR.length + 1, -".json".length),
      rowsOf<{ assetId: string; alt: string }>(path),
    );
  }

  const taxonomyFile = tree.raw.get("taxonomy.json") as
    Record<string, unknown> | undefined;

  return {
    problems,
    taxonomy:
      taxonomyFile === undefined
        ? undefined
        : {
            facets: taxonomyFile["facets"] as Readonly<
              Record<string, readonly string[]>
            >,
            substitutionClasses: taxonomyFile[
              "substitutionClasses"
            ] as readonly string[],
          },
    // The array facets are defaulted and rows with no natural key are dropped: a raw view has to
    // tolerate the one mistyped field a fixture (or a bad edit) introduces without every downstream
    // rule guarding it. The *reporting* of that mistyped field is family 1's, and it has already
    // happened above.
    products: rowsOf<ProductData>("products.json")
      .filter((product) => typeof product.sku === "string")
      .map((product) => ({
        ...product,
        flowerTypes: asArray(product.flowerTypes),
        colours: asArray(product.colours),
        occasions: asArray(product.occasions),
      })),
    tierGroups: rowsOf<ProductTierGroup>("product-tiers.json")
      .filter((group) => typeof group.sku === "string")
      .map((group) => ({ ...group, tiers: asArray(group.tiers) })),
    categories: rowsOf<CategoryData>("categories.json").filter(
      (category) =>
        typeof category.key === "string" && typeof category.kind === "string",
    ),
    occasions: rowsOf<OccasionData>("occasions.json").filter(
      (occasion) => typeof occasion.key === "string",
    ),
    addons: rowsOf<AddonData>("addons.json").filter(
      (addon) => typeof addon.key === "string",
    ),
    occasionCountry: rowsOf<{
      occasionKey: string;
      countryIso2: string;
      observed: boolean;
    }>("occasion-country.json"),
    prices: [...tree.raw.keys()]
      .filter((path) => path.startsWith("prices/"))
      .sort()
      .flatMap((path) => rowsOf<CountryPriceData>(path)),
    addonPrices: [...tree.raw.keys()]
      .filter((path) => path.startsWith("addon-prices/"))
      .sort()
      .flatMap((path) => rowsOf<AddonCountryPriceData>(path)),
    media: rowsOf<MediaAssetManifest>(MEDIA_FILE),
    variants: tree.raw.has(VARIANTS_FILE)
      ? rowsOf<MediaVariantManifest>(VARIANTS_FILE)
      : undefined,
    copy,
    alt,
  };
}

/* -------------------------------------------------------------------------- */
/* Family 2: counts and split.                                                */
/* -------------------------------------------------------------------------- */

/** `plan/10` §2.1's product split, and the count that follows from it. */
export const PRODUCT_TYPE_SPLIT: Readonly<Record<string, number>> = {
  bouquet: 40,
  arrangement: 14,
  plant: 8,
  funeral: 10,
  gift_set: 12,
};

export const PRODUCT_COUNT = Object.values(PRODUCT_TYPE_SPLIT).reduce(
  (total, count) => total + count,
  0,
);
export const CATEGORY_COUNT = 23;
export const ADDON_COUNT = 6;

/** `plan/02` §6: a country category or country occasion page exists only with ≥6 products. */
export const SIX_PRODUCT_THRESHOLD = 6;

function checkCounts(parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const at = (
    file: string,
    key: string,
    rule: string,
    message: string,
  ): void => {
    problems.push({
      family: "counts",
      file: dataFile(file),
      key,
      rule,
      message,
    });
  };

  if (parsed.products.length > 0 && parsed.products.length !== PRODUCT_COUNT) {
    at(
      "products.json",
      "products",
      "count",
      `has ${String(parsed.products.length)} products, not ${String(PRODUCT_COUNT)} (\`plan/10\` §2.1)`,
    );
  }
  if (parsed.products.length > 0) {
    for (const [type, expected] of Object.entries(PRODUCT_TYPE_SPLIT)) {
      const actual = parsed.products.filter(
        (product) => product.productType === type,
      ).length;
      if (actual !== expected) {
        at(
          "products.json",
          type,
          "split",
          `has ${String(actual)} \`${type}\` products, not ${String(expected)} (\`plan/10\` §2.1's 40/14/8/10/12 split)`,
        );
      }
    }
  }
  if (
    parsed.categories.length > 0 &&
    parsed.categories.length !== CATEGORY_COUNT
  ) {
    at(
      "categories.json",
      "categories",
      "count",
      `has ${String(parsed.categories.length)} categories, not ${String(CATEGORY_COUNT)} (5 product-type roots + 10 occasion categories + 8 flower-type hubs, \`plan/10\` §2.1)`,
    );
  }
  if (parsed.addons.length > 0 && parsed.addons.length !== ADDON_COUNT) {
    at(
      "addons.json",
      "addons",
      "count",
      `has ${String(parsed.addons.length)} add-ons, not ${String(ADDON_COUNT)} (\`plan/10\` §2.1)`,
    );
  }

  // The occasion facet is a closed set and `occasions.json` is its registry: a facet value with no
  // occasion row is a product tagged for an occasion that has no page, and an occasion row outside
  // the facet is a page nothing can be tagged for.
  const facetOccasions = parsed.taxonomy?.facets["occasion"];
  if (facetOccasions !== undefined && parsed.occasions.length > 0) {
    const rows = new Set<string>(
      parsed.occasions.map((occasion) => occasion.key),
    );
    for (const key of facetOccasions) {
      if (!rows.has(key)) {
        at(
          "occasions.json",
          key,
          "occasion-facet",
          "is an `occasion` facet value of `taxonomy.json` with no row here: the occasion facet is seeded whole (spec 006 §2.2)",
        );
      }
    }
    for (const key of rows) {
      if (!facetOccasions.includes(key)) {
        at(
          "occasions.json",
          key,
          "occasion-facet",
          "is not an `occasion` facet value of `taxonomy.json`",
        );
      }
    }
  }

  // spec 006 §6 and spec 002 §6: "the seed provides enough products per (country, category) for at
  // least the PL set to pass so 008 can test both sides of the threshold". The guarantee is
  // asserted, not hoped: PL's product-type roots and its evergreen occasion categories must all
  // clear six. The flower-type hubs and the seasonal occasions deliberately do not, which is the
  // other side of the threshold and is visible in the report.
  if (parsed.products.length > 0 && parsed.categories.length > 0) {
    for (const category of parsed.categories) {
      if (category.kind === "flowerType") continue;
      const count = productsInCategory(parsed.products, category).length;
      if (count < SIX_PRODUCT_THRESHOLD) {
        at(
          "products.json",
          `${category.kind}:${category.key}`,
          "pl-coverage",
          `has ${String(count)} products, below the six-product rule (\`plan/02\` §6): the PL set must pass so spec 008 can test both sides of the threshold (spec 006 §6, spec 002 §6)`,
        );
      }
    }
  }

  return problems;
}

/** The products a category contains, by the facet its `kind` names. */
export function productsInCategory(
  products: readonly ProductData[],
  category: Pick<CategoryData, "key" | "kind">,
): readonly ProductData[] {
  switch (category.kind) {
    case "productType":
      return products.filter((product) => product.productType === category.key);
    case "flowerType":
      return products.filter((product) =>
        product.flowerTypes.includes(category.key as never),
      );
    default:
      return products.filter((product) =>
        product.occasions.includes(category.key as never),
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Family 3: referential integrity.                                           */
/* -------------------------------------------------------------------------- */

function checkReferences(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const at = (
    file: string,
    key: string,
    rule: string,
    message: string,
  ): void => {
    problems.push({
      family: "references",
      file: dataFile(file),
      key,
      rule,
      message,
    });
  };

  const facets = parsed.taxonomy?.facets;
  const skus = new Set<string>(parsed.products.map((product) => product.sku));
  const occasionKeys = new Set<string>(
    parsed.occasions.map((occasion) => occasion.key),
  );
  const addonKeys = new Set<string>(parsed.addons.map((addon) => addon.key));
  const assetIds = new Set<string>(parsed.media.map((asset) => asset.id));

  if (facets !== undefined) {
    const has = (facet: string, value: string): boolean =>
      (facets[facet] ?? []).includes(value);
    for (const product of parsed.products) {
      const values: readonly [string, readonly string[]][] = [
        ["productType", [product.productType]],
        ["flowerType", [product.primaryFlower, ...product.flowerTypes]],
        ["colour", [product.colourPrimary, ...product.colours]],
        ["style", [product.style]],
        ["priceTier", [product.priceTier]],
        ["occasion", product.occasions],
      ];
      for (const [facet, list] of values) {
        for (const value of list) {
          if (!has(facet, value)) {
            at(
              "products.json",
              product.sku,
              "facet",
              `has \`${facet}\` value \`${value}\`, which is not in \`taxonomy.json\``,
            );
          }
        }
      }
      if (
        !(parsed.taxonomy?.substitutionClasses ?? []).includes(
          product.substitutionClass,
        )
      ) {
        at(
          "products.json",
          product.sku,
          "facet",
          `has substitution class \`${product.substitutionClass}\`, which is not in \`taxonomy.json\``,
        );
      }
    }
    for (const category of parsed.categories) {
      if (!has(category.kind, category.key)) {
        at(
          "categories.json",
          `${category.kind}:${category.key}`,
          "category-edge",
          `is not a \`${category.kind}\` facet value of \`taxonomy.json\`: a category is a facet, so the edge to its products cannot be built`,
        );
      }
    }
  }

  for (const group of parsed.tierGroups) {
    if (!skus.has(group.sku)) {
      at("product-tiers.json", group.sku, "tier-owner", "is not a product");
    }
  }
  for (const product of parsed.products) {
    if (!parsed.tierGroups.some((group) => group.sku === product.sku)) {
      at(
        "product-tiers.json",
        product.sku,
        "tier-owner",
        "has no tier group: every product is sold in at least one tier (`plan/10` §2.2)",
      );
    }
  }

  for (const row of parsed.occasionCountry) {
    if (!occasionKeys.has(row.occasionKey)) {
      at(
        "occasion-country.json",
        `${row.occasionKey}/${row.countryIso2}`,
        "occasion-edge",
        "names an occasion that `occasions.json` does not have",
      );
    }
    if (!COUNTRY_CODES.includes(row.countryIso2)) {
      at(
        "occasion-country.json",
        `${row.occasionKey}/${row.countryIso2}`,
        "occasion-edge",
        "names a country that `src/config/countries.ts` does not have",
      );
    }
  }

  // A price row for a product, tier or country nobody authored. The band, the ending and the
  // single-open-ended rule are family 5's (`checkCatalogue`); this is the reference half.
  const tierKeys = new Map(
    parsed.tierGroups.map((group) => [
      group.sku,
      new Set(group.tiers.map((tier) => tier.tierKey)),
    ]),
  );
  for (const row of parsed.prices) {
    const file = seedPriceFilePath(row.countryIso2);
    if (!skus.has(row.sku)) {
      at(file, row.sku, "price-owner", "is priced but is not a product");
      continue;
    }
    if (
      row.tierKey !== null &&
      !(tierKeys.get(row.sku)?.has(row.tierKey) ?? false)
    ) {
      at(
        file,
        `${row.sku}/${row.tierKey}`,
        "price-tier",
        "is priced for a tier the product does not have (`product-tiers.json`)",
      );
    }
  }
  for (const row of parsed.addonPrices) {
    if (!addonKeys.has(row.addonKey)) {
      at(
        seedAddonPriceFilePath(row.countryIso2),
        row.addonKey,
        "price-owner",
        "is priced but is not an add-on",
      );
    }
  }
  // Every seeded (product, country) pair carries a price: a product with no price in a priced
  // destination renders a buy path with no amount (AC-6, spec 005 §11).
  const pricedCountries = [
    ...new Set(parsed.prices.map((row) => row.countryIso2)),
  ].sort();
  for (const iso2 of pricedCountries) {
    const priced = new Set(
      parsed.prices
        .filter((row) => row.countryIso2 === iso2)
        .map((row) => row.sku),
    );
    for (const sku of skus) {
      if (!priced.has(sku)) {
        at(
          seedPriceFilePath(iso2),
          sku,
          "price-coverage",
          `has no price row in \`${iso2}\``,
        );
      }
    }
  }

  // Media: an asset for a product that does not exist, and an `ai` asset whose `promptHash` is not
  // the SHA-256 of the committed prompt record. The second is the join that makes "an image can be
  // regenerated consistently" (spec 006 §2.4) checkable rather than claimed.
  const promptHashes = new Map<string, string>();
  for (const [stem, value] of tree.prompts) {
    const file = ImageryPromptFileSchema.safeParse(value);
    if (!file.success) {
      problems.push({
        family: "references",
        file: `content/imagery/prompts/${stem}.json`,
        key: stem,
        rule: "prompt-file",
        message: `does not parse as a prompt file: ${file.error.issues[0]?.message ?? "unknown"}`,
      });
      continue;
    }
    for (const record of file.data.records) {
      promptHashes.set(record.assetId, promptHash(record));
    }
  }
  for (const asset of parsed.media) {
    if (asset.productSku !== undefined && !skus.has(asset.productSku)) {
      at(
        MEDIA_FILE,
        asset.id,
        "media-owner",
        `names product \`${asset.productSku}\`, which \`products.json\` does not have`,
      );
    }
    if (asset.promptHash === undefined) continue;
    const expected = promptHashes.get(asset.id);
    if (expected === undefined) {
      at(
        MEDIA_FILE,
        asset.id,
        "prompt-hash",
        "carries a `promptHash` but has no record in `content/imagery/prompts/`: the hash cannot be reproduced, so the image cannot be regenerated (spec 006 §2.4)",
      );
    } else if (expected !== asset.promptHash) {
      at(
        MEDIA_FILE,
        asset.id,
        "prompt-hash",
        `has \`promptHash\` \`${asset.promptHash.slice(0, 12)}…\` but its prompt record canonicalises to \`${expected.slice(0, 12)}…\` — one of the two moved`,
      );
    }
  }
  for (const variant of parsed.variants ?? []) {
    if (!assetIds.has(variant.assetId)) {
      at(
        VARIANTS_FILE,
        variant.assetId,
        "variant-owner",
        "is a variant of an asset `media.json` does not have",
      );
    }
  }
  for (const [locale, entries] of parsed.alt) {
    for (const entry of entries) {
      if (!assetIds.has(entry.assetId)) {
        at(
          `${ALT_DIR}/${locale}.json`,
          entry.assetId,
          "alt-owner",
          "is alt text for an asset `media.json` does not have",
        );
      }
    }
  }

  // Copy rows point at entities: a translation for a product that does not exist seeds nothing.
  for (const [path, rows] of parsed.copy) {
    for (const row of rows) {
      const known =
        row.entity === "product"
          ? skus.has(row.key)
          : row.entity === "category"
            ? parsed.categories.some((category) => category.key === row.key)
            : row.entity === "occasion"
              ? occasionKeys.has(row.key)
              : addonKeys.has(row.key);
      if (!known) {
        problems.push({
          family: "references",
          file: dataFile(path),
          key: `${row.entity}:${row.key}`,
          rule: "copy-owner",
          message: "is copy for an entity the dataset does not have",
        });
      }
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Family 4: slugs (AC-7).                                                    */
/* -------------------------------------------------------------------------- */

/** A slug as written in a copy file, before any schema has had a chance to reject it. */
interface RawSlug {
  readonly file: string;
  readonly entity: string;
  readonly key: string;
  readonly locale: string;
  readonly name: string;
  readonly slug: string;
}

/**
 * The slugs of the tree, read from **raw** JSON.
 *
 * Deliberately not from the parsed rows: `SlugSchema` rejects an uppercase or non-ASCII slug, so a
 * parsed tree can never exercise the rules AC-7 asks this gate to name. Reading the raw value is
 * what lets the message be "`Kraków Spring` is not ASCII" rather than a zod regex failure.
 */
function rawSlugs(tree: SeedTree): readonly RawSlug[] {
  const out: RawSlug[] = [];
  for (const [path, value] of tree.raw) {
    if (!path.startsWith(`${SEED_COPY_DIR}/`)) continue;
    const rows = (value as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows as readonly Record<string, unknown>[]) {
      if (typeof row["slug"] !== "string" || typeof row["key"] !== "string")
        continue;
      out.push({
        file: path,
        entity: typeof row["entity"] === "string" ? row["entity"] : "?",
        key: row["key"],
        locale:
          typeof row["locale"] === "string"
            ? row["locale"]
            : (path.split("/")[1] ?? "?"),
        name: typeof row["name"] === "string" ? row["name"] : "",
        slug: row["slug"],
      });
    }
  }
  return out;
}

/**
 * The `translationStatus` a copy row must carry for its slug to route — the catalogue's
 * `AUTHORED_TRANSLATION_STATUS` (`src/modules/catalog/copy.ts`), which plain `node` cannot import
 * (it resolves `@/` aliases). `tests/unit/seed-check.test.ts` pins the two equal.
 */
export const ROUTED_SLUG_TRANSLATION_STATUS = "human";

/**
 * A destination that has pages at all: spec 009 §2's existence rule, `status === 'live' ||
 * guidePublished`, over the registry the application reads.
 */
function isPublishedDestination(country: {
  readonly status: string;
  readonly guidePublished: boolean;
}): boolean {
  return country.status === "live" || country.guidePublished;
}

/**
 * Spec 009 AC-2's fourth rule, `product-slug-required`: **a product that has a page must have an
 * authored slug** (§13 Q1).
 *
 * A PDP exists iff the destination is published, the product is `active`, it has a retail price
 * row there, and it has a slug in the locale. §13 Q1 makes the last term one **shared** slug —
 * authored once in the dataset's source locale (`en`) and used by all four launch locales, with a
 * per-locale override honoured when a translation authors one. So a product that satisfies the
 * first three terms anywhere and has no human-authored `en` slug has no page in *any* locale,
 * silently: `slugFor()` answers `undefined`, which is a routine state there and a data fault here.
 * A machine-drafted row does not count, because a machine slug never routes
 * (`src/modules/catalog/slugs.ts`).
 */
function checkRequiredProductSlugs(
  tree: SeedTree,
  parsed: Parsed,
): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const path = seedCopyPath(COPY_SOURCE_LOCALE, "product");
  const rows = (tree.raw.get(path) as { rows?: unknown } | undefined)?.rows;
  const routed = new Set<string>();
  for (const row of Array.isArray(rows)
    ? (rows as readonly Record<string, unknown>[])
    : []) {
    if (
      typeof row["key"] === "string" &&
      typeof row["slug"] === "string" &&
      row["slug"] !== "" &&
      row["translationStatus"] === ROUTED_SLUG_TRANSLATION_STATUS
    ) {
      routed.add(row["key"]);
    }
  }
  const published = new Set<string>(
    COUNTRIES.filter(isPublishedDestination).map((country) => country.iso2),
  );
  for (const product of parsed.products) {
    if (product.status !== "active") continue;
    const pricedIn = [
      ...new Set(
        parsed.prices
          .filter(
            (row) =>
              row.sku === product.sku &&
              row.surchargeKind === null &&
              published.has(row.countryIso2),
          )
          .map((row) => row.countryIso2),
      ),
    ].sort();
    if (pricedIn.length === 0 || routed.has(product.sku)) continue;
    problems.push({
      family: "slugs",
      file: dataFile(path),
      key: `product:${product.sku} (${COPY_SOURCE_LOCALE})`,
      rule: "product-slug-required",
      message: `is an active product priced in published ${pricedIn.join(", ")} with no human-authored \`${COPY_SOURCE_LOCALE}\` slug: spec 009 §13 Q1 shares that one slug across all four launch locales, so without it the product has no page in any locale`,
    });
  }
  return problems;
}

/** The two listing namespaces spec 008 AC-2's slug rules are about, and their copy file entity. */
const LISTING_SLUG_ENTITIES = [
  ["category", "category"],
  ["occasion", "occasion"],
] as const satisfies readonly (readonly [string, SeedCopyFileEntity])[];

/** The primary language subtag of a locale code: `en-gb` → `en`. */
function primaryLanguage(code: string): string {
  return (code.split("-")[0] ?? code).toLowerCase();
}

/**
 * The locale a launch locale takes its category and occasion slugs from when it authors none, or
 * `undefined`. **The same rule `src/modules/catalog/copy.ts`'s `inheritsCopyFrom()` applies**: a
 * launch locale inherits only along a same-language fallback (`en-gb` → `en`), and `de`/`pl`
 * inherit nothing, because `/de/blumen/roses` is the half-translated URL `plan/02` §12 forbids.
 * Restated rather than imported because plain `node` cannot resolve that module's `@/` aliases;
 * `tests/unit/seed-check.test.ts` pins this rule's verdict to `hasSlug()` over the whole corpus,
 * so the two cannot disagree about a single key.
 */
export function listingSlugSourceLocale(locale: string): string | undefined {
  const config = LAUNCH_LOCALE_DATA.find((row) => row.code === locale);
  const fallback = config?.fallbackCode ?? null;
  if (fallback === null) return undefined;
  return primaryLanguage(fallback) === primaryLanguage(locale)
    ? fallback
    : undefined;
}

/** The keys a locale's own copy file routes a slug for: `human` rows with a non-empty slug. */
function routedSlugKeys(
  tree: SeedTree,
  locale: string,
  entity: SeedCopyFileEntity,
): ReadonlySet<string> {
  const rows = (
    tree.raw.get(seedCopyPath(locale, entity)) as { rows?: unknown } | undefined
  )?.rows;
  const keys = new Set<string>();
  for (const row of Array.isArray(rows)
    ? (rows as readonly Record<string, unknown>[])
    : []) {
    if (
      typeof row["key"] === "string" &&
      typeof row["slug"] === "string" &&
      row["slug"] !== "" &&
      row["translationStatus"] === ROUTED_SLUG_TRANSLATION_STATUS
    ) {
      keys.add(row["key"]);
    }
  }
  return keys;
}

/**
 * Spec 008 AC-2's first rule, `slug-missing`: **every category and every occasion has a routed
 * slug in every launch locale** (§13 Q10).
 *
 * A listing page exists only where its entity has an authored slug in the locale (§2), so a key
 * with none has no category page, no occasion page and no hub there — silently, because
 * `slugFor()` answering `undefined` is a routine state in the route. A machine draft does not
 * count: its slug never routes (`src/modules/catalog/slugs.ts`). An `en-gb` key is satisfied by
 * `en`'s slug, exactly as the route reads it.
 */
function checkRequiredListingSlugs(
  tree: SeedTree,
  parsed: Parsed,
): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const keysOf: Readonly<Record<string, readonly string[]>> = {
    category: parsed.categories.map((category) => category.key),
    occasion: parsed.occasions.map((occasion) => occasion.key),
  };
  for (const locale of launchLocales) {
    const source = listingSlugSourceLocale(locale);
    for (const [entity, file] of LISTING_SLUG_ENTITIES) {
      const own = routedSlugKeys(tree, locale, file);
      const inherited =
        source === undefined
          ? new Set<string>()
          : routedSlugKeys(tree, source, file);
      for (const key of keysOf[entity] ?? []) {
        if (own.has(key) || inherited.has(key)) continue;
        problems.push({
          family: "slugs",
          file: dataFile(seedCopyPath(locale, file)),
          key: `${entity}:${key} (${locale})`,
          rule: "slug-missing",
          message: `has no human-authored slug in launch locale \`${locale}\`${source === undefined ? "" : ` nor in \`${source}\`, which it inherits from`}: without one the ${entity} has no page in that locale (spec 008 AC-2, §13 Q10); a machine draft's slug never routes`,
        });
      }
    }
  }
  return problems;
}

/**
 * Spec 008 AC-2's reserved-word half: a category or occasion slug may not equal a
 * `PATH_SEGMENT_KEYS` value (`path-segment`) or a country slug (`country-slug`) **in its own
 * locale**. The first segment after the locale is a country slug, a page-type segment or a
 * listing slug (§2 "Segment collision is impossible by test"), so `/de/blumen` as a category hub
 * and `/de/blumen` as the shop segment, or `/pl/polska` as an occasion and as the country, would
 * be one URL meaning two pages.
 */
function checkReservedListingSlugs(tree: SeedTree): SeedProblem[] {
  const problems: SeedProblem[] = [];
  for (const slug of rawSlugs(tree)) {
    if (slug.entity !== "category" && slug.entity !== "occasion") continue;
    const config = LAUNCH_LOCALE_DATA.find((row) => row.code === slug.locale);
    if (config === undefined) continue;
    const at = (rule: string, message: string): void => {
      problems.push({
        family: "slugs",
        file: dataFile(slug.file),
        key: `${slug.entity}:${slug.key} (${slug.locale})`,
        rule,
        message,
      });
    };
    for (const [segmentKey, segment] of Object.entries(config.pathSegments)) {
      if (segment !== slug.slug) continue;
      at(
        "path-segment",
        `slug \`${slug.slug}\` equals the \`${segmentKey}\` path segment of \`${slug.locale}\`: a listing slug and a page-type segment cannot share one URL (spec 008 AC-2, §2)`,
      );
    }
    for (const country of COUNTRIES) {
      const countrySlug = (country.slugs as Readonly<Record<string, string>>)[
        slug.locale
      ];
      if (countrySlug !== slug.slug) continue;
      at(
        "country-slug",
        `slug \`${slug.slug}\` equals the country slug of ${country.iso2} in \`${slug.locale}\`: a listing slug and a country cannot share one URL (spec 008 AC-2, §2)`,
      );
    }
  }
  return problems;
}

function checkSlugs(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [
    ...checkRequiredProductSlugs(tree, parsed),
    ...checkRequiredListingSlugs(tree, parsed),
    ...checkReservedListingSlugs(tree),
  ];
  const slugs = rawSlugs(tree);
  const at = (slug: RawSlug, rule: string, message: string): void => {
    problems.push({
      family: "slugs",
      file: dataFile(slug.file),
      key: `${slug.entity}:${slug.key} (${slug.locale})`,
      rule,
      message,
    });
  };

  for (const slug of slugs) {
    const value = slug.slug;
    if (value.endsWith("/")) {
      at(
        slug,
        "trailing-slash",
        `slug \`${value}\` ends with a slash: a slug is a path segment, not a path (\`plan/02\` §4)`,
      );
    }
    if (value.includes("/")) {
      at(
        slug,
        "segment",
        `slug \`${value}\` contains a slash: a slug is one path segment`,
      );
    }
    if (!/^[\x20-\x7e]*$/u.test(value)) {
      at(
        slug,
        "ascii",
        `slug \`${value}\` is not ASCII: it must be the ASCII fold of the name (\`Kraków Spring\` → \`krakow-spring\`, AC-7)`,
      );
    }
    if (value !== value.toLowerCase()) {
      at(
        slug,
        "lowercase",
        `slug \`${value}\` is not lowercase (\`plan/02\` §4)`,
      );
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
      at(
        slug,
        "hyphenated",
        `slug \`${value}\` is not lowercase-ASCII words joined by single hyphens (\`plan/02\` §4)`,
      );
    }
    if (slug.name !== "") {
      const expected = asciiFoldSlug(slug.name);
      if (value !== expected) {
        at(
          slug,
          "fold",
          `slug \`${value}\` is not the ASCII fold of \`${slug.name}\` (\`${expected}\`) — AC-7`,
        );
      }
    }
  }

  // Uniqueness is per locale and **across** products, categories and occasions: they share one URL
  // namespace per locale (`plan/02` §4), so `birthday-flowers` cannot be both a category and an
  // occasion or one of the two canonicals is wrong.
  const byLocale = new Map<string, Map<string, RawSlug[]>>();
  for (const slug of slugs) {
    const locale = byLocale.get(slug.locale) ?? new Map<string, RawSlug[]>();
    const holders = locale.get(slug.slug) ?? [];
    holders.push(slug);
    locale.set(slug.slug, holders);
    byLocale.set(slug.locale, locale);
  }
  for (const [locale, slugMap] of byLocale) {
    for (const [value, holders] of slugMap) {
      if (holders.length < 2) continue;
      const owners = holders
        .map((holder) => `${holder.entity}:${holder.key}`)
        .join(", ");
      for (const holder of holders) {
        at(
          holder,
          "unique",
          `slug \`${value}\` is used by ${String(holders.length)} entities in \`${locale}\` (${owners}): a slug is unique per locale across products, categories and occasions (AC-7)`,
        );
      }
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Family 5: prices, through spec 005's checks.                               */
/* -------------------------------------------------------------------------- */

/**
 * The `checkCatalogue()` modes that are price rules (spec 006 §2.3 rule 5). The others —
 * `facet`, `label-key`, `fx-snapshot`, `projection-columns` — are `pnpm catalogue:check`'s job
 * over the authored modules and are covered here by families 1 and 3; running them twice would
 * report the same fault under two gates.
 */
export const PRICE_CHECK_MODES: readonly CheckMode[] = [
  "no-tier",
  "default-tier",
  "missing-price",
  "ambiguous-price",
  "band",
  "rounding-ending",
  "float-money",
  "addon-price",
  "surcharge-amount",
  "destination-drift",
];

/**
 * Family 5 is spec 005's price rule surface run over the rows in the **files** rather than over
 * the authored modules: `catalogueCheckInput()` is handed the dataset's own products, tiers,
 * add-ons and price rows, so a hand-edited price file is caught by the same band table
 * `catalogue:check` uses and `plan/10` §2.3 is transcribed exactly once in the repository.
 */
function checkPrices(parsed: Parsed): SeedProblem[] {
  if (parsed.products.length === 0 || parsed.prices.length === 0) return [];
  const overrides: Partial<CatalogueCheckInput> = {
    products: parsed.products,
    tiers: seedProductTierRecords(parsed.tierGroups),
    categories: parsed.categories,
    occasions: parsed.occasions,
    addons: parsed.addons,
    countryPrices: parsed.prices,
    addonCountryPrices: parsed.addonPrices,
  };
  let raw: ReturnType<typeof checkCatalogue>;
  try {
    raw = checkCatalogue(catalogueCheckInput(overrides));
  } catch (error) {
    // The rows are raw (see `parseTree`), so a field mistyped badly enough can throw inside spec
    // 005's checks. That is still a price problem and still needs a line — silently returning no
    // problems would turn a broken price file into a green gate.
    return [
      {
        family: "prices" as const,
        file: `${SEED_DATA_DIR}/prices`,
        key: "prices",
        rule: "unreadable",
        message: `could not be checked against \`plan/10\` §2.3's bands: ${String(error)} — fix the parse errors family 1 reported first`,
      },
    ];
  }
  return raw
    .filter((problem) => PRICE_CHECK_MODES.includes(problem.mode))
    .map((problem) => ({
      family: "prices" as const,
      // The authored module is where a price is *fixed*, but the dataset file is what this gate
      // read, so both are named: the file to look at, and the module to edit (ADR-0017).
      file: problem.file,
      key: problem.subject,
      rule: problem.mode,
      // The file named is the authored module, because that is where a price is *fixed*: the
      // dataset file this gate read is a projection of it and hand-editing one is itself a
      // failure (ADR-0017, family 1's `stale-projection`).
      message: `${problem.reason} — read from \`${SEED_DATA_DIR}/prices/**\`, fixed in the authored module and re-projected with \`pnpm seed:project\` (ADR-0017)`,
    }));
}

/* -------------------------------------------------------------------------- */
/* Family 6: copy.                                                            */
/* -------------------------------------------------------------------------- */

/** Spec 008 AC-2: a hub intro is 40–120 words, inclusive on both ends. */
export const HUB_INTRO_WORD_MIN = 40;
export const HUB_INTRO_WORD_MAX = 120;

/**
 * Spec 008 AC-2: a hub intro is at least 60 % token-distinct from every other hub intro in its
 * locale.
 *
 * **Measured as spec 007 §14 A4 measures a corridor guide**: the Jaccard distance between the two
 * texts' sets of contiguous five-token shingles, through `scripts/corridor-check.ts`'s
 * `shingleDistinctness()` — composed, not restated. The literal token-set reading was measured
 * against the committed `en` corpus first and refuses it: `category:sympathy` and
 * `occasion:sympathy` share their vocabulary (white lilies, white roses, a peace lily, a home or an
 * office) and score 0.34 while saying different things, and two unrelated intros sharing the
 * closing florist sentence and English stop-words score near 0.5. A set of shared words measures
 * the language; shared five-word runs measure copying, which is the thin-content failure
 * `plan/02` §1 names. The weakest committed pair under this metric is 0.71.
 */
export const HUB_INTRO_DISTINCTNESS_MIN = 0.6;

/**
 * The delivery-timing claims of spec 006 §14 A4, **in German and Polish**.
 *
 * `DELIVERY_TIMING_PATTERN` (`seed/copy.ts`) names English phrases, which was enough while every
 * `de`/`pl` row was a machine draft of English text. Authored German and Polish intros (TASK-106)
 * would pass it with "Lieferung am nächsten Tag" or "dostawa tego samego dnia", so the intro scan
 * adds the same classes in both languages: next day, same day, today/tomorrow, within N hours or
 * days, working days, delivery time, punctuality, express, and a clock time. The permitted
 * pointer — "vor dem Bestellschluss, der für das Zielland angezeigt wird", "przed terminem
 * podanym dla kraju docelowego" — names no time and passes, exactly as it does in English.
 */
export const NATIVE_DELIVERY_TIMING_PATTERN =
  /(?<![\p{L}\p{N}])(?:am (?:nächsten|selben|gleichen) tag|noch heute|heute (?:geliefert|zugestellt)|morgen (?:geliefert|zugestellt)|innerhalb von \d+ (?:stunden|tagen)|werktag(?:e|en)?|lieferzeit(?:en)?|pünktlich|expresslieferung|bis \d{1,2}(?:[:.]\d{2})? uhr|następnego dnia|tego samego dnia|jeszcze dziś|dostawa (?:dziś|dzisiaj|jutro)|w ciągu \d+ (?:godzin|godziny|dni)|dni robocz|czas dostawy|punktualn|ekspres|do godziny \d{1,2})/iu;

/**
 * `plan/10` §2.2's unbacked superlatives, **in German and Polish** — the heads of
 * `BANNED_SUPERLATIVES`, as whole-word patterns with their inflections spelled out, because both
 * languages inflect them ("die besten Rosen", "najlepsze kwiaty") and a bare stem would fire
 * inside an innocent word ("Bestellung" begins with "beste").
 */
export const NATIVE_BANNED_SUPERLATIVES: readonly string[] = [
  "beste[mnrs]?",
  "günstigste[mnrs]?",
  "schnellste[mnrs]?",
  "schönste[mnrs]?",
  "frischeste[mnrs]?",
  "perfekte?[mnrs]?",
  "unschlagbare?[mnrs]?",
  "garantiert frisch",
  "najlepsz\\p{L}*",
  "najtańsz\\p{L}*",
  "najszybsz\\p{L}*",
  "najpiękniejsz\\p{L}*",
  "najświeższ\\p{L}*",
  "idealn\\p{L}*",
  "niezrównan\\p{L}*",
  "gwarantowan\\p{L}* świeżoś\\p{L}*",
];

/** The native superlatives an intro contains, as written, lowercased. */
export function nativeSuperlativesIn(text: string): readonly string[] {
  const haystack = text.toLowerCase();
  return NATIVE_BANNED_SUPERLATIVES.flatMap((term) => {
    const match = new RegExp(
      `(?<![\\p{L}\\p{N}])${term}(?![\\p{L}\\p{N}])`,
      "u",
    ).exec(haystack);
    return match === null ? [] : [match[0]];
  });
}

/** The native-language delivery-timing phrases a piece of copy contains, lowercased. */
export function nativeDeliveryTimingPhrasesIn(text: string): readonly string[] {
  const pattern = new RegExp(NATIVE_DELIVERY_TIMING_PATTERN.source, "giu");
  return [...text.matchAll(pattern)].map((match) => match[0].toLowerCase());
}

/**
 * A price written number-first, the way German and Polish write it: `49 €`, `49,90 €`, `49,– €`,
 * `149 zł`, `99 lei`. The number may end in a dash for "no cents" (`49,–`), and the currency may
 * be a symbol, an ISO code or the local word (`/break 150` hole 5).
 */
const TRAILING_CURRENCY_PRICE_PATTERN =
  /\d[\d.,]*(?:[.,]?[-–—]+)?\s?(?:[£€$]|(?:zł|zl|złotych|pln|eur|euro|euros|gbp|ron|lei)(?![\p{L}\p{N}]))/iu;

/**
 * A price written currency-first with an ISO code or a currency word: `EUR 49`, `PLN 149`,
 * `RON 99`, `zł 149` (`/break 150` hole 5). The symbol-first form (`€49`) is the corridor gate's.
 */
const LEADING_CODE_PRICE_PATTERN =
  /(?<![\p{L}\p{N}])(?:eur|euro|gbp|pln|ron|lei|zł|zl)\s?\d[\d.,]*/iu;

/**
 * The price literals a piece of copy contains: the corridor gate's pattern, plus the number-first
 * and code-first forms German and Polish copy use.
 */
export function priceLiteralsIn(text: string): readonly string[] {
  return [
    PRICE_LITERAL_PATTERN,
    TRAILING_CURRENCY_PRICE_PATTERN,
    LEADING_CODE_PRICE_PATTERN,
  ]
    .map((pattern) => pattern.exec(text)?.[0].trim())
    .filter(
      (match, index, all): match is string =>
        match !== undefined && all.indexOf(match) === index,
    );
}

/** The intros of one locale's hub pages: `human` category and occasion rows with a description. */
function hubIntroRows(
  parsed: Parsed,
  locale: string,
): readonly { path: string; row: SeedCopy }[] {
  return LISTING_SLUG_ENTITIES.flatMap(([, file]) => {
    const path = seedCopyPath(locale, file);
    return (parsed.copy.get(path) ?? [])
      .filter(
        (row) =>
          row.translationStatus === ROUTED_SLUG_TRANSLATION_STATUS &&
          typeof row.descriptionMd === "string" &&
          typeof row.key === "string",
      )
      .map((row) => ({ path, row }));
  });
}

/**
 * Spec 008 AC-2's three intro rules over every hub intro in every copy locale.
 *
 * A **hub intro** is the `descriptionMd` of a category or occasion row whose slug routes — a
 * `human` row (`listing.ts`'s `authoredIntro()` reads that field for §2 rows 10 and 13). A machine
 * draft is excluded on purpose: its slug never routes, so it is no page's intro; the day a
 * reviewer flips it to `human` it is checked like every other.
 *
 *  - `intro-word-range` — 40–120 words, counted by `wordCount()`, the copy family's own counter;
 *  - `intro-distinct` — at least `HUB_INTRO_DISTINCTNESS_MIN` shingle-distinct from every other
 *    hub intro in the locale, categories and occasions together, because they share one URL
 *    namespace and one reader;
 *  - `intro-banned-word` — a voice-register word (`src/config/voice.ts`) or an unbacked
 *    superlative (`seed/copy.ts`'s English list, `NATIVE_BANNED_SUPERLATIVES` in German and
 *    Polish);
 *  - `intro-price-literal` — a price written into prose; prices are data, formatted by
 *    `formatMoney`, and a hub shows no money at all (§2).
 *
 * The fourth honesty clause, a delivery-timing claim, is the copy family's `delivery-timing`
 * rule: its English half already reads every row in every locale (spec 006 §14 A4) and is not
 * run twice; this function adds the German and Polish half (`NATIVE_DELIVERY_TIMING_PATTERN`)
 * over every hub row's intro, name and SEO pair, under the same rule id.
 */
function checkHubIntros(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];
  for (const locale of tree.copyLocales) {
    const intros = hubIntroRows(parsed, locale);
    for (const { path, row } of intros) {
      const intro = row.descriptionMd ?? "";
      const at = (rule: string, message: string): void => {
        problems.push({
          family: "copy",
          file: dataFile(path),
          key: `${row.entity}:${row.key} (${locale})`,
          rule,
          message,
        });
      };
      const words = wordCount(intro);
      if (words < HUB_INTRO_WORD_MIN || words > HUB_INTRO_WORD_MAX) {
        at(
          "intro-word-range",
          `hub intro is ${String(words)} words, outside ${String(HUB_INTRO_WORD_MIN)}–${String(HUB_INTRO_WORD_MAX)} (spec 008 AC-2)`,
        );
      }
      const banned = [
        ...bannedVoiceWordsIn(intro),
        ...bannedSuperlativesIn(intro),
        ...nativeSuperlativesIn(intro),
      ];
      if (banned.length > 0) {
        at(
          "intro-banned-word",
          `hub intro uses ${banned.map((word) => `\`${word}\``).join(", ")}: a banned voice word or an unbacked superlative (spec 008 AC-2; spec 004 §14 A5; \`plan/10\` §2.2)`,
        );
      }
      for (const [field, value] of [
        ["descriptionMd", row.descriptionMd],
        ["seoTitle", row.seoTitle],
        ["seoDescription", row.seoDescription],
        ["name", row.name],
      ] as const) {
        if (typeof value !== "string") continue;
        const phrases = nativeDeliveryTimingPhrasesIn(value);
        if (phrases.length === 0) continue;
        at(
          "delivery-timing",
          `\`${field}\` states delivery timing (${phrases.map((phrase) => `\`${phrase}\``).join(", ")}): the cutoff and next-available-date sentence is spec 009's per-country block, and copy may only point at it (spec 006 §14 A4; spec 008 AC-2)`,
        );
      }
      const prices = priceLiteralsIn(intro);
      if (prices.length > 0) {
        at(
          "intro-price-literal",
          `hub intro contains a price literal (${prices.map((price) => `\`${price}\``).join(", ")}): prices are data formatted by formatMoney, and a hub shows no money (spec 008 AC-2, §2)`,
        );
      }
    }
    for (let index = 0; index < intros.length; index += 1) {
      for (let other = index + 1; other < intros.length; other += 1) {
        const left = intros[index];
        const right = intros[other];
        if (left === undefined || right === undefined) continue;
        const distinctness = shingleDistinctness(
          left.row.descriptionMd ?? "",
          right.row.descriptionMd ?? "",
        );
        if (distinctness >= HUB_INTRO_DISTINCTNESS_MIN) continue;
        problems.push({
          family: "copy",
          file: dataFile(left.path),
          key: `${left.row.entity}:${left.row.key}, ${right.row.entity}:${right.row.key} (${locale})`,
          rule: "intro-distinct",
          message: `hub intros are ${(distinctness * 100).toFixed(0)} % distinct, under ${String(HUB_INTRO_DISTINCTNESS_MIN * 100)} % (5-gram shingles, spec 008 AC-2; the metric of spec 007 §14 A4): one reads as a copy of the other`,
        });
      }
    }
  }
  return problems;
}

function checkCopy(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];

  if (!tree.copyLocales.includes(COPY_SOURCE_LOCALE)) {
    problems.push({
      family: "copy",
      file: `${SEED_DATA_DIR}/${SEED_COPY_DIR}/${COPY_SOURCE_LOCALE}`,
      key: COPY_SOURCE_LOCALE,
      rule: "source-locale",
      message:
        "has no copy files: `en` is the source of truth every other locale is drafted from (`plan/03` §6 step 1)",
    });
  }

  for (const [path, rows] of parsed.copy) {
    const locale = path.split("/")[1] ?? "";
    const sentence = tree.floristSentences.get(locale);
    if (sentence === undefined) {
      problems.push({
        family: "copy",
        file: dataFile(path),
        key: locale,
        rule: "florist-sentence-key",
        message:
          "has no `catalog.floristSentence` anywhere in its message fallback chain, so the closing sentence of every description in it is unverifiable (spec 006 §7)",
      });
      continue;
    }
    // TASK-073 owns the definition of correct copy; this composes it. The `slug` rule is family 4's
    // (AC-7 puts every slug rule in one place), so it is filtered out here rather than reported
    // twice under two families.
    for (const problem of copyProblems(rows, {
      file: path,
      floristSentence: sentence,
      source: locale === COPY_SOURCE_LOCALE,
    })) {
      if (problem.rule === "slug") continue;
      problems.push({
        family: "copy",
        file: dataFile(problem.file),
        key: problem.key,
        rule: problem.rule,
        message: problem.message,
      });
    }

    // spec 006 §14 A4: no copy states a lead time, a "next day"/"same day" claim or a punctuality
    // promise. There is no such data (`src/config/countries.ts` carries no `delivery_days`) and the
    // cutoff sentence is spec 009's server-rendered per-country block.
    for (const row of rows) {
      for (const [field, value] of [
        ["descriptionMd", row.descriptionMd],
        ["seoTitle", row.seoTitle],
        ["seoDescription", row.seoDescription],
        ["name", row.name],
      ] as const) {
        if (value === undefined) continue;
        const phrases = deliveryTimingPhrasesIn(value);
        if (phrases.length === 0) continue;
        problems.push({
          family: "copy",
          file: dataFile(path),
          key: `${row.entity}:${row.key}`,
          rule: "delivery-timing",
          message: `\`${field}\` states delivery timing (${phrases.map((phrase) => `\`${phrase}\``).join(", ")}): the cutoff and next-available-date sentence is spec 009's per-country block, and copy may only point at it (spec 006 §14 A4)`,
        });
      }
    }
  }

  problems.push(...checkHubIntros(tree, parsed));

  // The thin-content guard of §6, across the whole locale: two products sharing a description is
  // the failure `plan/02` §4.2 names as the real ranking risk of a programmatic catalogue.
  for (const locale of tree.copyLocales) {
    const rows = [...parsed.copy.entries()]
      .filter(([path]) => path.startsWith(`${SEED_COPY_DIR}/${locale}/`))
      .flatMap(([, value]) => value);
    for (const duplicate of duplicateDescriptions(rows)) {
      problems.push({
        family: "copy",
        file: `${SEED_DATA_DIR}/${SEED_COPY_DIR}/${locale}`,
        key: duplicate.keys.join(", "),
        rule: "duplicate-description",
        message: `share one description in \`${locale}\`: no two entities may (the thin-content guard of spec 006 §6)`,
      });
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Family 7: media.                                                           */
/* -------------------------------------------------------------------------- */

function checkMedia(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const at = (
    file: string,
    key: string,
    rule: string,
    message: string,
  ): void => {
    problems.push({
      family: "media",
      file: dataFile(file),
      key,
      rule,
      message,
    });
  };

  // Provenance and `depicts: "delivery"` are `MediaAssetManifestSchema`'s refinements (AC-8) and
  // are reported by family 1. What is left here is everything one asset cannot see.
  const primaries = new Map<string, string[]>();
  for (const asset of parsed.media) {
    if (asset.productSku === undefined || !asset.isPrimary) continue;
    const owners = primaries.get(asset.productSku) ?? [];
    owners.push(asset.id);
    primaries.set(asset.productSku, owners);
  }
  for (const [sku, owners] of primaries) {
    if (owners.length > 1) {
      at(
        MEDIA_FILE,
        sku,
        "one-primary",
        `has ${String(owners.length)} primary images (${owners.join(", ")}): spec 002 §5.1 permits one per product, and two would render two \`priority\` images (AC-19)`,
      );
    }
  }
  for (const asset of parsed.media) {
    if (asset.depicts === "delivery") {
      at(
        MEDIA_FILE,
        asset.id,
        "no-delivery-asset",
        "depicts a delivery: a real delivery photograph carries consent and is spec 018/027 data, so Phase 0 has none (spec 006 §2.4, `plan/07` §1.2)",
      );
    }
  }

  // The variant half is conditional by design: `media-variants.json` arrives with TASK-078, and a
  // gate that failed on its absence would block the dataset on a task that reads it.
  const variants = parsed.variants ?? [];
  if (variants.length > 0) {
    const derivedFiles = tree.mediaFiles.filter((file) =>
      file.path.startsWith(`${DERIVED_MEDIA_DIR}/`),
    );
    const committedFiles = tree.mediaFiles.filter((file) =>
      file.path.startsWith(`${COMMITTED_MEDIA_DIR}/`),
    );
    const derived = new Map(
      derivedFiles.map((file) => [file.path, file.bytes]),
    );
    // The file half runs **where the files are** (TASK-138). The derived bytes are git-ignored
    // now that they live in the media bucket, so a clean clone and every CI runner hold none of
    // them, and a rule that reported 118 missing files there would be noise that hides the one
    // real miss. Where a derived tree does exist — the founder's machine, and every upload,
    // because `scripts/media-upload.ts` runs the same check before it writes a single object —
    // the rule is exactly as strict as it was.
    for (const variant of derived.size === 0 ? [] : variants) {
      const path = `${DERIVED_MEDIA_DIR}/${variant.assetId}/${String(variant.width)}.${variant.format}`;
      const bytes = derived.get(path);
      if (bytes === undefined) {
        at(
          VARIANTS_FILE,
          `${variant.assetId}/${String(variant.width)}.${variant.format}`,
          "variant-file",
          `is in the manifest with no file at \`${path}\`: a 404 on a variant degrades to the placeholder, and \`pnpm media:variants --check\` is what makes that impossible before an upload (AC-14)`,
        );
        continue;
      }
      if (bytes !== variant.bytes) {
        at(
          VARIANTS_FILE,
          `${variant.assetId}/${String(variant.width)}.${variant.format}`,
          "variant-bytes",
          `records ${String(variant.bytes)} B but the file is ${String(bytes)} B: the manifest is the only source of widths, bytes and checksums for both loaders (AC-14)`,
        );
      }
    }
    const inManifest = new Set(
      variants.map(
        (variant) =>
          `${DERIVED_MEDIA_DIR}/${variant.assetId}/${String(variant.width)}.${variant.format}`,
      ),
    );
    for (const file of derivedFiles) {
      if (!inManifest.has(file.path)) {
        at(
          VARIANTS_FILE,
          file.path,
          "variant-orphan",
          "is derived under `.local/media/` with no manifest entry: every file has an entry and every entry has a file, or an unlisted byte reaches the bucket (AC-14)",
        );
      }
    }

    // The committed half (TASK-138's split, founder 2026-10-03): the `hero` slot is served from
    // this origin by `staticVariantLoader`, so its variants must be committed under
    // `public/media/` — on **every** runner, because they are in the repository — and nothing
    // else may be. A missing file is a 404 on the home page's LCP image; an extra one is bytes
    // under the repository cap that no page requests.
    const committed = new Map(
      committedFiles.map((file) => [file.path, file.bytes]),
    );
    const committedSlots = new Set<string>(COMMITTED_MEDIA_SLOTS);
    const expectedCommitted = new Set<string>();
    for (const variant of variants) {
      const slot = slotOfAsset(variant.assetId, parsed.media);
      if (slot === undefined || !committedSlots.has(slot)) continue;
      const leaf = `${variant.assetId}/${String(variant.width)}.${variant.format}`;
      const path = `${COMMITTED_MEDIA_DIR}/${leaf}`;
      expectedCommitted.add(path);
      const bytes = committed.get(path);
      if (bytes === undefined) {
        at(
          VARIANTS_FILE,
          leaf,
          "variant-file",
          `is in the manifest with no file at \`${path}\`: the \`${slot}\` slot is served from the site's own origin, so a missing committed file is a 404 on the page's LCP image (TASK-138)`,
        );
      } else if (bytes !== variant.bytes) {
        at(
          VARIANTS_FILE,
          leaf,
          "variant-bytes",
          `records ${String(variant.bytes)} B but the committed file \`${path}\` is ${String(bytes)} B: the manifest is the only source of widths, bytes and checksums for both loaders (AC-14)`,
        );
      }
    }
    for (const file of committedFiles) {
      if (expectedCommitted.has(file.path)) continue;
      // An asset `media.json` does not know is family 9's `unknown-slot`; reporting it here as
      // well would make one stray file two problems.
      const assetId = file.path.split("/").at(-2) ?? "";
      if (slotOfAsset(assetId, parsed.media) === undefined) continue;
      at(
        VARIANTS_FILE,
        file.path,
        "committed-slot",
        `is committed under \`${COMMITTED_MEDIA_DIR}/\` but is not a manifest variant of a site-origin slot (${[...committedSlots].join(", ")}): every other slot is served from the media bucket, so a committed copy is weight under the repository cap that no page requests (TASK-138)`,
      );
    }

    // **No asset ships AVIF only** (TASK-080, closing the `/review 49` carry-forward).
    // `src/modules/ui/media/resolve.ts` picks the `<img>`'s own `src` as the largest **WebP** step
    // and falls through to the AVIF step when there is none — a sensible last resort in a resolver
    // and a silent failure in a dataset: a browser that cannot decode AVIF would be served an AVIF
    // and draw the alt text instead of the photograph. Trimming a ladder to fit a per-slot byte cap
    // is exactly how an asset loses its fallback, so the gate refuses it here, before the bytes are
    // committed, rather than leaving it to a browser nobody on the team uses.
    const formatsByAsset = new Map<string, Set<string>>();
    for (const variant of variants) {
      const seen = formatsByAsset.get(variant.assetId) ?? new Set<string>();
      seen.add(variant.format);
      formatsByAsset.set(variant.assetId, seen);
    }
    for (const [assetId, formats] of formatsByAsset) {
      if (formats.has("avif") && !formats.has("webp")) {
        at(
          VARIANTS_FILE,
          assetId,
          "avif-only",
          "ships AVIF with no WebP step: the resolver falls through to the AVIF file, so a browser without AVIF is served a format it cannot decode and draws the alt text instead of the photograph (spec 006 §2.5, AC-18)",
        );
      }
    }
  }

  // Alt text is per-locale data, required for a rendered product image, and never generated at
  // render (`plan/01` §6). Conditional on alt text **existing**, exactly as the variant rules
  // above are conditional on the manifest having an entry rather than on the manifest file being
  // present: TASK-079 commits `alt/{locale}.json` for all four launch locales with `rows: []`,
  // because `src/modules/ui/media/manifest.ts` imports them at build time and the renderer needs
  // the files from the moment the loader ships, while the strings arrive with the founder's
  // imagery (TASK-080). Until then every asset resolves to the captioned placeholder — which is
  // `plan/10` §3's honesty rule, not a gap — and the rules below bite on the first row written.
  const altRowCount = [...parsed.alt.values()].reduce(
    (total, entries) => total + entries.length,
    0,
  );
  if (altRowCount > 0) {
    for (const locale of launchLocales) {
      const entries = parsed.alt.get(locale);
      if (entries === undefined) {
        at(
          `${ALT_DIR}/${locale}.json`,
          locale,
          "alt-locale",
          "is a launch locale with no alt-text file while other locales have one: a missing alt makes that locale non-indexable for the product (spec 002 §8) and `Photo` renders the placeholder instead (AC-18)",
        );
        continue;
      }
      const byAsset = new Map(
        entries.map((entry) => [entry.assetId, entry.alt]),
      );
      for (const asset of parsed.media) {
        if (asset.depicts !== "product") continue;
        const alt = byAsset.get(asset.id);
        // Only an `approved` asset can render an `<img>`; a `pending` or `rejected` one renders the
        // placeholder, so it needs no alt text (spec 006 §14 A9). Approval adds the alt with it.
        if (alt === undefined && asset.reviewState === "approved") {
          at(
            `${ALT_DIR}/${locale}.json`,
            asset.id,
            "alt-missing",
            `is a product image with no \`${locale}\` alt text`,
          );
        } else if (alt !== undefined && alt.trim() === "") {
          at(
            `${ALT_DIR}/${locale}.json`,
            asset.id,
            "alt-empty",
            "is a product image with an empty alt: an informative image announced as nothing fails WCAG 1.1.1, and the honest fallback is the placeholder (AC-8, AC-18)",
          );
        }
      }
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* Family 8: no PII, no third-party marks (AC-9).                             */
/* -------------------------------------------------------------------------- */

/**
 * The personal-data shapes rule 8 names, over **string** values only.
 *
 * Strings only, and the reason is worth stating: `generatorSeed` is an eight-digit integer and
 * `retailMinor` a five-digit one, so scanning numbers for a phone shape would report the whole
 * dataset. Every field that could carry a person, an address or a contact detail is a string.
 */
export const PII_PATTERNS: readonly {
  readonly rule: string;
  readonly pattern: RegExp;
  readonly what: string;
}[] = [
  {
    rule: "email",
    pattern: /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/iu,
    what: "an email address",
  },
  {
    rule: "phone",
    // E.164: a leading `+` and 8–15 digits, separators allowed. `+48 22 123 45 67` and
    // `+48221234567` both match; a version string like `1.2+3` does not.
    pattern: /\+\d[\d\s()-]{7,17}\d/u,
    what: "an E.164-shaped telephone number",
  },
  {
    rule: "postcode",
    // The destination countries' shapes: PL `00-001`, NL `1012 AB`, UK `SW1A 1AA`, and the
    // DE/FR/ES/IT five-digit form when it precedes a capitalised place name (`10115 Berlin`).
    pattern:
      /\b(?:\d{2}-\d{3}|\d{4}\s?[A-Z]{2}|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}|\d{5}\s+[A-Z][a-zà-ÿ]+)\b/u,
    what: "a postcode-shaped string",
  },
];

/**
 * The fields that may name a human at all, and the only values they may hold.
 *
 * spec 006 §8's "real-person-name allowlist": the dataset contains no buyer, recipient, partner or
 * staff information, and the *only* human-shaped values in it are the reviewer of a copy row or an
 * asset and the credit on a free-licence photograph. Anything else in one of those fields is a
 * person who did not consent to being in a git repository, so the allowlist is a closed set of the
 * roles that review this dataset — not a list of names, because a name in a role field is exactly
 * what must not be there while one founder is the only human on the project.
 *
 * A `photo` asset's `credit` is the one exception the licence classes of §13 Q1 require (CC0 and
 * the Unsplash licence ask for attribution); it is matched by the `credit:` prefix so the value
 * reads as an attribution rather than as a person we hold data about.
 */
export const PERSON_FIELDS = ["reviewedBy", "credit"] as const;

export const ALLOWED_PERSON_REFERENCES: readonly string[] = [
  "founder",
  "orchestrator",
  "reviewer",
  "spec-writer",
  "backend-implementer",
  "frontend-implementer",
  "seo-auditor",
  "system:seed",
  "credit:",
];

/**
 * Competitor and third-party marks, every one of them traceable to `docs/research/competitors-*.md`
 * (spec 006 §2.3 rule 8) and asserted so by `tests/unit/seed-check.test.ts`.
 *
 * Common nouns the studies happen to contain — `Blumen`, `kwiaty`, `blumenversand` — are
 * deliberately **not** here: they are German and Polish for "flowers" and banning them would ban
 * the `de` and `pl` copy. What is banned is a *brand*: naming one in our own catalogue is the
 * competitor wording `plan/10` §2.2 forbids and, on a page, a third-party mark we have no right
 * to use.
 */
export const COMPETITOR_MARKS: readonly string[] = [
  "interflora",
  "floraqueen",
  "euroflorist",
  "fleurop",
  "bloom & wild",
  "bloomandwild",
  "internetflorist",
  "1800flowers",
  "1-800-flowers",
  "netflorist",
  "floristsonline",
  "giftbasketsoverseas",
  "colvin",
  "bergamotte",
  "blume2000",
  "bonita blomster",
  "flora nordica",
  "delejos",
  "aquarelle",
  "universal flower",
];

/** Every string in a JSON value, with the JSON path that reaches it (AC-9's "and JSON path"). */
export function stringsWithPaths(
  value: unknown,
  path = "$",
): readonly { readonly path: string; readonly value: string }[] {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      stringsWithPaths(item, `${path}[${String(index)}]`),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) =>
      stringsWithPaths(item, `${path}.${key}`),
    );
  }
  return [];
}

function checkPrivacy(tree: SeedTree): SeedProblem[] {
  const problems: SeedProblem[] = [];
  for (const [file, value] of tree.raw) {
    for (const { path, value: text } of stringsWithPaths(value)) {
      for (const { rule, pattern, what } of PII_PATTERNS) {
        const match = pattern.exec(text);
        if (match === null) continue;
        problems.push({
          family: "privacy",
          file: dataFile(file),
          key: path,
          rule,
          message: `contains ${what} (\`${match[0]}\`): the dataset holds no personal data, and \`docs/compliance/ropa.md\` records that as a fact rather than an aspiration (spec 006 §8, AC-9)`,
        });
      }
      const lower = text.toLowerCase();
      for (const mark of COMPETITOR_MARKS) {
        if (!lower.includes(mark)) continue;
        problems.push({
          family: "privacy",
          file: dataFile(file),
          key: path,
          rule: "competitor-mark",
          message: `names \`${mark}\`, a competitor mark from \`docs/research/competitors-*.md\`: our copy is our own (\`plan/10\` §2.2) and a third-party mark on a page is not ours to use (spec 006 §8)`,
        });
      }
      const field = path.split(".").at(-1) ?? "";
      if (!(PERSON_FIELDS as readonly string[]).includes(field)) continue;
      if (
        ALLOWED_PERSON_REFERENCES.some((allowed) => lower.startsWith(allowed))
      ) {
        continue;
      }
      problems.push({
        family: "privacy",
        file: dataFile(file),
        key: path,
        rule: "person-allowlist",
        message: `\`${field}\` is \`${text}\`, which is not one of the roles spec 006 §8 allows to appear in the dataset (${ALLOWED_PERSON_REFERENCES.join(", ")}): a person's name in a committed file is personal data nobody consented to`,
      });
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Family 9: byte budgets.                                                    */
/* -------------------------------------------------------------------------- */

/** The slot an asset renders in, from its row in `media.json`. */
function slotOfAsset(
  assetId: string,
  media: readonly MediaAssetManifest[],
): MediaSlot | undefined {
  return media.find((asset) => asset.id === assetId)?.slot;
}

/**
 * Family 9: the per-slot caps **read from the manifest**, and the committed total (TASK-138).
 *
 * The rule the founder cares about is unchanged and is the one spec 006 §6 states: *a 900 KB hero
 * fails a gate rather than a Lighthouse run*. The per-slot caps read the byte count from
 * `media-variants.json`'s `bytes` column — the same row the loader builds the URL from, the same
 * row the uploader uploads, and a committed, reviewable line in a diff — because most of those
 * bytes are objects in `flowersoverseas-media` and no runner holds them. Nothing can be served
 * that has no row (both loaders address files by the manifest's own rows), and the committed
 * copies are tied to their rows by family 7 here and by `pnpm media:variants --check`.
 *
 * The 6 MB total still caps what is committed to the repository: since the split (founder,
 * 2026-10-03, option (a)) that is the `hero` slot's ladder alone, so the cap stopped governing
 * the catalogue — which is what lets all 84 products be photographed — without going away. Page
 * weight is still bounded per *page* in a real browser by `tests/e2e/media-budgets.spec.ts`,
 * which counts every image response whatever origin serves it.
 */
function checkBudgets(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const committedFiles = tree.mediaFiles.filter((file) =>
    file.path.startsWith(`${COMMITTED_MEDIA_DIR}/`),
  );
  const total = committedFiles.reduce((sum, file) => sum + file.bytes, 0);
  if (total > COMMITTED_MEDIA_BYTE_CAP) {
    problems.push({
      family: "budgets",
      file: COMMITTED_MEDIA_DIR,
      key: "total",
      rule: "total-bytes",
      message: `holds ${String(total)} B of committed imagery, above the ${String(COMMITTED_MEDIA_BYTE_CAP)} B cap (spec 006 §13 Q4; since TASK-138 only the site-origin slots are committed, and only capped)`,
    });
  }
  for (const file of committedFiles) {
    const assetId = file.path.split("/").at(-2) ?? "";
    if (slotOfAsset(assetId, parsed.media) === undefined) {
      problems.push({
        family: "budgets",
        file: file.path,
        key: file.path,
        rule: "unknown-slot",
        message:
          "is committed under `public/media/` but its asset id is not in `media.json`, so no per-slot cap applies to it",
      });
    }
  }
  for (const variant of parsed.variants ?? []) {
    const leaf = `${variant.assetId}/${String(variant.width)}.${variant.format}`;
    const slot = slotOfAsset(variant.assetId, parsed.media);
    if (slot === undefined) {
      problems.push({
        family: "budgets",
        file: VARIANTS_FILE,
        key: leaf,
        rule: "unknown-slot",
        message:
          "is a variant of an asset that is not in `media.json`, so no per-slot cap applies to it",
      });
      continue;
    }
    const cap = SLOT_BYTE_CAPS[slot];
    if (variant.bytes > cap) {
      problems.push({
        family: "budgets",
        file: VARIANTS_FILE,
        key: leaf,
        rule: "slot-bytes",
        message: `is ${String(variant.bytes)} B, above the ${String(cap)} B cap for the \`${slot}\` slot: an oversized image must fail a gate before the bytes are uploaded, not a Lighthouse run after they are served (spec 006 §2.5, §6)`,
      });
    }
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Family 10: the delivery calendar (spec 009 AC-2).                          */
/* -------------------------------------------------------------------------- */

const HOLIDAYS_FILE = "holidays.json";
const OCCASION_COUNTRY_FILE = "occasion-country.json";
const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` plus whole days, on the calendar rather than on a clock (no zone involved). */
function addCalendarDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** The calendar day it is in `timeZone` at `instant` — the destination's today, not the host's. */
function zonedIsoDate(instant: Date, timeZone: string): string {
  const clock = zonedClock(instant, timeZone);
  return `${String(clock.year).padStart(4, "0")}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")}`;
}

/** One destination's picker horizon, as family 10 and the report read it. */
export interface CalendarHorizon {
  readonly iso2: string;
  readonly timeZone: string;
  /** Today in the destination, at `SeedTree.asOf`. */
  readonly from: string;
  /** The last day the picker can reach: `from` + `NEXT_AVAILABLE_HORIZON_DAYS`. */
  readonly through: string;
  /** Every calendar year in `[from, through]`, ascending. */
  readonly years: readonly number[];
}

/**
 * The destinations whose picker **renders a calendar** — published (spec 009 §2's existence rule)
 * and not `unavailable` — with the horizon that calendar can reach from `asOf`.
 *
 * `pickerState()` is the application's own answer, so a destination cannot need holiday rows here
 * while its picker shows no dates, or show dates while this rule ignores it. The horizon is
 * `NEXT_AVAILABLE_HORIZON_DAYS` from today in the destination's zone — the full distance
 * `nextAvailableDate` scans (its earliest start is tomorrow, plus 365 more steps) — and not "this
 * year" or "the 14-day grid", because the finding this rule answers was a date 366 days out.
 */
export function calendarHorizons(tree: SeedTree): readonly CalendarHorizon[] {
  const out: CalendarHorizon[] = [];
  for (const country of COUNTRIES) {
    if (!isPublishedDestination(country)) continue;
    if (pickerState(country.iso2) === "unavailable") continue;
    const operations = country.operations;
    if (operations === undefined) continue;
    const from = zonedIsoDate(tree.asOf, operations.ianaZone);
    const through = addCalendarDays(from, NEXT_AVAILABLE_HORIZON_DAYS);
    const years: number[] = [];
    for (
      let year = Number(from.slice(0, 4));
      year <= Number(through.slice(0, 4));
      year += 1
    ) {
      years.push(year);
    }
    out.push({
      iso2: country.iso2,
      timeZone: operations.ianaZone,
      from,
      through,
      years,
    });
  }
  return out;
}

/** The raw `holidays.json` rows, tolerant of a mistyped field (family 1 reports those). */
function rawHolidayRows(tree: SeedTree): readonly Record<string, unknown>[] {
  const rows = (tree.raw.get(HOLIDAYS_FILE) as { rows?: unknown } | undefined)
    ?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null,
  );
}

/** Under this many days left, `--report` warns that `holiday-coverage` is about to go red. */
export const HOLIDAY_COVERAGE_WARNING_DAYS = 60;

/** The prefix of every warning line; CI's `seed-check` summary step greps the log for it. */
export const HOLIDAY_COVERAGE_WARNING_MARKER =
  "holiday coverage early warning:";

/** How long one destination's committed holiday rows keep `holiday-coverage` green. */
export interface HolidayCoverageRunway {
  readonly iso2: string;
  readonly timeZone: string;
  /** Today in the destination, at `SeedTree.asOf`. */
  readonly from: string;
  /** The earliest year from `from`'s on that has no holiday row for this destination. */
  readonly firstUncoveredYear: number;
  /** The first destination day on which the rule is red: `from` itself when it already is. */
  readonly redOn: string;
  /** Whole calendar days from `from` to `redOn`; 0 means the rule is red today. */
  readonly daysLeft: number;
}

/**
 * TASK-149: **how many days until `holiday-coverage` goes red**, per destination that renders a
 * calendar. Read-only, like the rest of `--report`: it never changes the verdict, and it reads
 * the same rows the same way as family 10 (raw rows, a `YYYY-` date prefix, the row's `iso2`)
 * over the same `calendarHorizons()`, so "0 days left" and a red rule are the same instant.
 *
 * The horizon from day D covers the years of D through D + `NEXT_AVAILABLE_HORIZON_DAYS`. Every
 * year from today's up to the first uncovered one is covered, so the rule first goes red on the
 * day the horizon's far end reaches 1 January of that year — or today, if it already has.
 */
export function holidayCoverageRunway(
  tree: SeedTree,
): readonly HolidayCoverageRunway[] {
  const covered = new Map<string, Set<number>>();
  for (const row of rawHolidayRows(tree)) {
    const iso2 = row["iso2"];
    const date = row["date"];
    if (typeof iso2 !== "string") continue;
    if (typeof date !== "string" || !/^\d{4}-/u.test(date)) continue;
    const years = covered.get(iso2) ?? new Set<number>();
    years.add(Number(date.slice(0, 4)));
    covered.set(iso2, years);
  }
  return calendarHorizons(tree).map((horizon) => {
    const years = covered.get(horizon.iso2) ?? new Set<number>();
    let firstUncoveredYear = Number(horizon.from.slice(0, 4));
    while (years.has(firstUncoveredYear)) firstUncoveredYear += 1;
    const edge = addCalendarDays(
      `${String(firstUncoveredYear)}-01-01`,
      -NEXT_AVAILABLE_HORIZON_DAYS,
    );
    const redOn = edge > horizon.from ? edge : horizon.from;
    return {
      iso2: horizon.iso2,
      timeZone: horizon.timeZone,
      from: horizon.from,
      firstUncoveredYear,
      redOn,
      daysLeft:
        (Date.parse(`${redOn}T00:00:00.000Z`) -
          Date.parse(`${horizon.from}T00:00:00.000Z`)) /
        MS_PER_DAY,
    };
  });
}

/** One warning line; it starts with `HOLIDAY_COVERAGE_WARNING_MARKER`, which CI greps for. */
function holidayCoverageWarning(runway: HolidayCoverageRunway): string {
  const year = String(runway.firstUncoveredYear);
  const horizon = `${String(NEXT_AVAILABLE_HORIZON_DAYS)}-day picker horizon`;
  // Red today may be the first red day or any day after it, so it names today, not "the first".
  const when =
    runway.daysLeft === 0
      ? `is red today, ${runway.redOn} (${runway.timeZone}): its ${horizon} reaches ${year}, which has no holiday row`
      : `goes red in ${String(runway.daysLeft)} ${runway.daysLeft === 1 ? "day" : "days"}, on ${runway.redOn} (${runway.timeZone}), the first day its ${horizon} reaches ${year} with no holiday row`;
  return `${HOLIDAY_COVERAGE_WARNING_MARKER} ${runway.iso2} ${when}; author ${runway.iso2}'s ${year} rows in ${dataFile(HOLIDAYS_FILE)} (spec 009 AC-2).`;
}

/**
 * The runway as a section of the step summary: one row per **published** destination (one with
 * no calendar says so rather than vanishing), then either the all-clear line or one warning per
 * destination under `HOLIDAY_COVERAGE_WARNING_DAYS`.
 */
export function holidayCoverageReport(tree: SeedTree): readonly string[] {
  const runways = holidayCoverageRunway(tree);
  const byIso2 = new Map(runways.map((runway) => [runway.iso2, runway]));
  const lines: string[] = [
    "#### holiday coverage runway (spec 009 AC-2)",
    "",
    `Whole days, counted from today in each destination, before \`calendar/holiday-coverage\` goes red: the first day the picker's ${String(NEXT_AVAILABLE_HORIZON_DAYS)}-day horizon reaches a year with no holiday row. Under ${String(HOLIDAY_COVERAGE_WARNING_DAYS)} days the line below the table is a warning, and CI's \`seed-check\` step summary repeats it. Judged at ${tree.asOf.toISOString()}.`,
    "",
    "| destination | today | first year with no rows | goes red on | days left |",
    "|---|---|---|---|---|",
  ];
  for (const country of COUNTRIES) {
    if (!isPublishedDestination(country)) continue;
    const runway = byIso2.get(country.iso2);
    lines.push(
      runway === undefined
        ? `| ${country.iso2} | — | — | — | no calendar |`
        : `| ${runway.iso2} | ${runway.from} | ${String(runway.firstUncoveredYear)} | ${runway.redOn} (${runway.timeZone}) | ${String(runway.daysLeft)} |`,
    );
  }
  const warnings = runways
    .filter((runway) => runway.daysLeft < HOLIDAY_COVERAGE_WARNING_DAYS)
    .map(holidayCoverageWarning);
  lines.push("");
  if (warnings.length === 0) {
    lines.push(
      `No destination is within ${String(HOLIDAY_COVERAGE_WARNING_DAYS)} days of going red.`,
      "",
    );
  } else {
    for (const warning of warnings) lines.push(warning, "");
  }
  return lines;
}

/**
 * Family 10. Three rules, each reading **raw** rows so that a fault the file schema also rejects
 * (a missing `nameKey`, an unknown `rule_type`) is still named by the rule that owns it rather
 * than by a zod path — the reason family 4 reads raw slugs.
 *
 *  - **`holiday-coverage`** — every calendar year a rendering destination's horizon reaches has
 *    at least one holiday row for that destination. The line names the country and the **first
 *    uncovered date**, which is the day the grid would wrongly offer as open.
 *  - **`holiday-name-key`** — every holiday row carries a `nameKey`, because a closed date renders
 *    its reason in words (AC-7) and a holiday with no name has nothing to say.
 *  - **`undatable-rule`** — every occasion row whose `rule_type` is not `none` is dated by
 *    `occasionDate()` in every year of the horizon. `none` is the honest blank (a Polish name day,
 *    AC-11: it marks nothing); any other type that yields no date — a kind the evaluator has no
 *    branch for, or a `fixed` 30 February the schema's `day ≤ 31` cannot see — would drop an
 *    occasion marker silently.
 */
function checkCalendar(tree: SeedTree): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const holidays = rawHolidayRows(tree);
  const horizons = calendarHorizons(tree);

  for (const row of holidays) {
    const nameKey = row["nameKey"];
    if (typeof nameKey === "string" && nameKey.trim() !== "") continue;
    problems.push({
      family: "calendar",
      file: dataFile(HOLIDAYS_FILE),
      key: `${String(row["iso2"])}/${String(row["date"])}`,
      rule: "holiday-name-key",
      message:
        "is a holiday row with no `nameKey`: a closed date renders its reason in words beside the date (spec 009 AC-7), and `delivery.holiday.{iso2}.{name}` is those words",
    });
  }

  for (const horizon of horizons) {
    const covered = new Set<number>();
    for (const row of holidays) {
      if (row["iso2"] !== horizon.iso2) continue;
      const date = row["date"];
      if (typeof date !== "string" || !/^\d{4}-/u.test(date)) continue;
      covered.add(Number(date.slice(0, 4)));
    }
    for (const year of horizon.years) {
      if (covered.has(year)) continue;
      const firstUncovered =
        `${String(year)}-01-01` > horizon.from
          ? `${String(year)}-01-01`
          : horizon.from;
      problems.push({
        family: "calendar",
        file: dataFile(HOLIDAYS_FILE),
        key: `${horizon.iso2}/${String(year)}`,
        rule: "holiday-coverage",
        message: `has no holiday row for ${String(year)}, and \`${horizon.iso2}\` renders a delivery calendar whose ${String(NEXT_AVAILABLE_HORIZON_DAYS)}-day horizon runs from ${horizon.from} to ${horizon.through} (${horizon.timeZone}): the first uncovered date is ${firstUncovered}, and the picker would offer that year's holidays as open days (spec 009 AC-2)`,
      });
    }
  }

  const years = [...new Set(horizons.flatMap((horizon) => horizon.years))].sort(
    (a, b) => a - b,
  );
  // With no rendering destination there is no horizon; the rule still has to date the rules,
  // so it falls back to the years `asOf` and its horizon span in UTC.
  if (years.length === 0) {
    const from = tree.asOf.toISOString().slice(0, 10);
    const through = addCalendarDays(from, NEXT_AVAILABLE_HORIZON_DAYS);
    for (
      let year = Number(from.slice(0, 4));
      year <= Number(through.slice(0, 4));
      year += 1
    ) {
      years.push(year);
    }
  }
  const occasionRows = (
    tree.raw.get(OCCASION_COUNTRY_FILE) as { rows?: unknown } | undefined
  )?.rows;
  for (const row of Array.isArray(occasionRows)
    ? (occasionRows as readonly Record<string, unknown>[])
    : []) {
    if (typeof row !== "object" || row === null) continue;
    const ruleType = row["ruleType"];
    if (ruleType === "none") continue;
    const rule = row["rule"];
    const key = `${String(row["occasionKey"])}/${String(row["countryIso2"])}`;
    // The row is dated by its `rule_type` column — the value the importer projects onto
    // `occasion_country.rule_type` — with the parameters of its `rule`.
    const asRule = {
      ...(typeof rule === "object" && rule !== null ? rule : {}),
      kind: ruleType,
    } as unknown as OccasionRule;
    for (const year of years) {
      let failure: string | undefined;
      try {
        if (occasionDate(asRule, year) === null) {
          failure = `yields no date in ${String(year)}`;
        }
      } catch (error) {
        failure = `cannot be evaluated for ${String(year)} (${error instanceof Error ? error.message : String(error)})`;
      }
      if (failure === undefined) continue;
      problems.push({
        family: "calendar",
        file: dataFile(OCCASION_COUNTRY_FILE),
        key,
        rule: "undatable-rule",
        message: `\`rule_type: ${String(ruleType)}\` ${failure}: only \`none\` may be undated (a name day, spec 009 AC-11), and any other rule the evaluator cannot date drops its occasion marker from the calendar silently`,
      });
      break;
    }
  }

  return problems;
}

/* -------------------------------------------------------------------------- */
/* The gate.                                                                  */
/* -------------------------------------------------------------------------- */

/** Every family, in `SEED_CHECK_FAMILIES` order. Pure: a function of the tree value alone. */
export function checkSeedDataset(tree: SeedTree): readonly SeedProblem[] {
  const parsed = parseTree(tree);
  return [
    ...parsed.problems,
    ...checkCounts(parsed),
    ...checkReferences(tree, parsed),
    ...checkSlugs(tree, parsed),
    ...checkPrices(parsed),
    ...checkCopy(tree, parsed),
    ...checkMedia(tree, parsed),
    ...checkPrivacy(tree),
    ...checkBudgets(tree, parsed),
    ...checkCalendar(tree),
  ];
}

/* -------------------------------------------------------------------------- */
/* The §11 report.                                                            */
/* -------------------------------------------------------------------------- */

/** One row of the six-product-rule coverage table. */
export interface CoverageRow {
  readonly countryIso2: string;
  readonly countryStatus: string;
  readonly kind: "category" | "occasion";
  readonly key: string;
  readonly products: number;
  /** ≥6 products available in that country (`plan/02` §6's counting half). */
  readonly meetsThreshold: boolean;
  /**
   * Would the page exist today? The threshold **and** the gates that live in code: the country's
   * `status` and, for an occasion, `observed`. This is the column that stops a country looking
   * ready in CI while it is gated in code (§11).
   */
  readonly pageExists: boolean;
}

/**
 * The per-(country, category) and per-(country, occasion) coverage `plan/02` §6 needs, both sides
 * of the threshold included (spec 006 §6: "so 008 can test both sides").
 */
export function coverageRows(tree: SeedTree): readonly CoverageRow[] {
  const parsed = parseTree(tree);
  const rows: CoverageRow[] = [];
  const pricedCountries = [
    ...new Set(parsed.prices.map((row) => row.countryIso2)),
  ].sort();
  for (const iso2 of pricedCountries) {
    const status =
      COUNTRIES.find((country) => country.iso2 === iso2)?.status ?? "unknown";
    const available = new Set(
      parsed.prices
        .filter((row) => row.countryIso2 === iso2 && row.activeTo === null)
        .map((row) => row.sku),
    );
    const inCountry = parsed.products.filter((product) =>
      available.has(product.sku),
    );
    for (const category of parsed.categories) {
      const count = productsInCategory(inCountry, category).length;
      rows.push({
        countryIso2: iso2,
        countryStatus: status,
        kind: "category",
        key: `${category.kind}:${category.key}`,
        products: count,
        meetsThreshold: count >= SIX_PRODUCT_THRESHOLD,
        pageExists: count >= SIX_PRODUCT_THRESHOLD && status === "live",
      });
    }
    for (const occasion of parsed.occasions) {
      // An evergreen occasion is observed everywhere and carries no `occasion_country` row: it has
      // no date to localise (`plan/03` §9, `plan/02` §6 "Evergreen, same URL year-round"). A
      // seasonal one exists in a country only when the calendar says the country observes it.
      const observed =
        occasion.kind === "evergreen" ||
        parsed.occasionCountry.some(
          (row) =>
            row.occasionKey === occasion.key &&
            row.countryIso2 === iso2 &&
            row.observed,
        );
      const count = inCountry.filter((product) =>
        product.occasions.includes(occasion.key as never),
      ).length;
      rows.push({
        countryIso2: iso2,
        countryStatus: status,
        kind: "occasion",
        key: occasion.key,
        products: count,
        meetsThreshold: count >= SIX_PRODUCT_THRESHOLD,
        pageExists:
          count >= SIX_PRODUCT_THRESHOLD && status === "live" && observed,
      });
    }
  }
  return rows;
}

/** One locale's copy readiness, from the dataset **and** from the predicate code gates on. */
export interface LocaleReadiness {
  readonly locale: string;
  readonly rows: number;
  readonly machine: number;
  readonly reviewed: number;
  /** Share of the locale's dataset rows that are machine drafts, in `[0, 1]`. */
  readonly machineShare: number;
  /** `unreviewedShare()` over the message catalogue — the number spec 003 §11 reports. */
  readonly messageUnreviewedShare: number;
  /** `isLocaleIndexable()` itself: there is no second copy of the rule here. */
  readonly indexable: boolean;
  /**
   * "Ready" means every dataset row is human-reviewed **and** the locale passes the application's
   * own indexability predicate. A locale cannot read ready here while it is gated in code (§11).
   */
  readonly ready: boolean;
}

export function localeReadiness(tree: SeedTree): readonly LocaleReadiness[] {
  const parsed = parseTree(tree);
  return tree.copyLocales.map((locale) => {
    const rows = [...parsed.copy.entries()]
      .filter(([path]) => path.startsWith(`${SEED_COPY_DIR}/${locale}/`))
      .flatMap(([, value]) => value);
    const machine = rows.filter(
      (row) => row.translationStatus === "machine",
    ).length;
    const reviewed = rows.filter((row) => row.reviewed).length;
    const indexable = isLocaleIndexable(locale);
    const machineShare = rows.length === 0 ? 1 : machine / rows.length;
    return {
      locale,
      rows: rows.length,
      machine,
      reviewed,
      machineShare,
      messageUnreviewedShare: unreviewedShare(locale),
      indexable,
      ready: indexable && rows.length > 0 && reviewed === rows.length,
    };
  });
}

/**
 * Category/occasion `seoTitle` pairs that share a topic — the same key on two entities, which is
 * what happens when a facet is both a category and an occasion (`birthday` is both).
 *
 * Not a failure: both pages are legitimate and the copy is not duplicated word for word. It is a
 * *decision* spec 008 has to make — which of the two is the primary for "birthday flowers" and
 * which canonicalises or internally links to it (`plan/02` §7) — and an unmade decision is only
 * visible if something counts the pairs on every run (`/review 41`).
 */
export function seoTitleNearDuplicates(tree: SeedTree): readonly {
  readonly key: string;
  readonly categoryTitle: string;
  readonly occasionTitle: string;
}[] {
  const parsed = parseTree(tree);
  const rowsOf = (entity: SeedCopyFileEntity): readonly SeedCopy[] =>
    parsed.copy.get(seedCopyPath(COPY_SOURCE_LOCALE, entity)) ?? [];
  const occasions = new Map(
    rowsOf("occasion").map((row) => [row.key, row] as const),
  );
  const pairs: {
    key: string;
    categoryTitle: string;
    occasionTitle: string;
  }[] = [];
  for (const category of rowsOf("category")) {
    const occasion = occasions.get(category.key);
    if (occasion === undefined) continue;
    pairs.push({
      key: category.key,
      categoryTitle: category.seoTitle ?? "",
      occasionTitle: occasion.seoTitle ?? "",
    });
  }
  return pairs;
}

const percent = (share: number): string => `${(share * 100).toFixed(0)} %`;

/**
 * Spec 009 §11's second line: **which destinations currently promise a delivery date**, as one
 * glance rather than an audit. Every column is the application's own predicate —
 * `pickerState()`, `hasActivePartners()`, the registry's `operations` — so a destination cannot
 * read `live` here while the picker shows it closed, and the holiday column is family 10's own
 * horizon, so "covered" here and a green `holiday-coverage` rule are the same fact.
 */
export function pickerStateReport(tree: SeedTree): readonly string[] {
  const horizons = new Map(
    calendarHorizons(tree).map((horizon) => [horizon.iso2, horizon]),
  );
  const holidayYears = new Map<string, Set<number>>();
  for (const row of rawHolidayRows(tree)) {
    const iso2 = row["iso2"];
    const date = row["date"];
    if (typeof iso2 !== "string" || typeof date !== "string") continue;
    const years = holidayYears.get(iso2) ?? new Set<number>();
    years.add(Number(date.slice(0, 4)));
    holidayYears.set(iso2, years);
  }
  const lines: string[] = [
    "#### delivery picker state per destination (spec 009 §11)",
    "",
    `\`unavailable\` renders no dates and no cutoff; \`preview\` renders the whole calendar with every date closed; \`live\` takes orders. Judged at ${tree.asOf.toISOString()}; the horizon is ${String(NEXT_AVAILABLE_HORIZON_DAYS)} days from today in the destination.`,
    "",
    "| destination | published | operations | active partners | picker state | holiday years | horizon | covered |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const country of COUNTRIES) {
    const horizon = horizons.get(country.iso2);
    const years = [...(holidayYears.get(country.iso2) ?? [])].sort(
      (a, b) => a - b,
    );
    const covered =
      horizon === undefined
        ? "—"
        : horizon.years.every((year) => years.includes(year))
          ? "yes"
          : "**no**";
    const operations = country.operations;
    lines.push(
      `| ${country.iso2} | ${isPublishedDestination(country) ? "yes" : "no"} | ${operations === undefined ? "none" : `${operations.ianaZone} · ${operations.sameDayCutoffLocal} · days ${operations.deliveryDays.join(",")} · Sunday ${operations.sundayDelivery}`} | ${hasActivePartners(country.iso2) ? "yes" : "no"} | **${pickerState(country.iso2)}** | ${years.length === 0 ? "—" : years.join(", ")} | ${horizon === undefined ? "—" : `${horizon.from} → ${horizon.through}`} | ${covered} |`,
    );
  }
  const promising = COUNTRIES.filter(
    (country) => pickerState(country.iso2) === "live",
  ).map((country) => country.iso2);
  lines.push(
    "",
    `Destinations promising a delivery date today: ${promising.length === 0 ? "**none**" : promising.join(", ")}.`,
    "",
  );
  return lines;
}

/**
 * The standing catalogue-health report of spec 006 §11 and AC-30, as Markdown for the step
 * summary. Read-only: it never changes the verdict, and every readiness column in it comes from
 * the predicate the application gates on.
 */
export function seedHealthReport(tree: SeedTree): string {
  const parsed = parseTree(tree);
  const lines: string[] = [];
  const coverage = coverageRows(tree);

  lines.push(...pickerStateReport(tree));
  lines.push(...holidayCoverageReport(tree));

  lines.push("#### products by type", "");
  lines.push("| product type | products | expected |", "|---|---|---|");
  for (const [type, expected] of Object.entries(PRODUCT_TYPE_SPLIT)) {
    const actual = parsed.products.filter(
      (product) => product.productType === type,
    ).length;
    lines.push(`| ${type} | ${String(actual)} | ${String(expected)} |`);
  }
  lines.push(
    `| **total** | **${String(parsed.products.length)}** | **${String(PRODUCT_COUNT)}** |`,
    "",
    `${String(parsed.categories.length)} categories · ${String(parsed.occasions.length)} occasions · ${String(parsed.addons.length)} add-ons · ${String(parsed.prices.length)} price rows · ${String(parsed.media.length)} media assets`,
    "",
  );

  lines.push(
    `#### six-product rule (\`plan/02\` §6, threshold ${String(SIX_PRODUCT_THRESHOLD)})`,
    "",
    "`page` is the threshold **and** the gates that live in code — the country's `status`, and `observed` for an occasion — so a country cannot look ready here while it is gated in code (§11).",
    "",
    "| country | status | set | ≥6 | below 6 | pages today |",
    "|---|---|---|---|---|---|",
  );
  const countries = [...new Set(coverage.map((row) => row.countryIso2))];
  for (const iso2 of countries) {
    for (const kind of ["category", "occasion"] as const) {
      const rows = coverage.filter(
        (row) => row.countryIso2 === iso2 && row.kind === kind,
      );
      const status = rows[0]?.countryStatus ?? "unknown";
      lines.push(
        `| ${iso2} | ${status} | ${kind} | ${String(rows.filter((row) => row.meetsThreshold).length)} | ${String(rows.filter((row) => !row.meetsThreshold).length)} | ${String(rows.filter((row) => row.pageExists).length)} |`,
      );
    }
  }
  const below = coverage.filter(
    (row) => row.countryIso2 === "PL" && !row.meetsThreshold,
  );
  lines.push(
    "",
    `Below the threshold in PL (${String(below.length)}): ${below.length === 0 ? "none" : below.map((row) => `\`${row.key}\` ${String(row.products)}`).join(", ")}.`,
    "",
  );

  lines.push("#### price bands", "");
  const retail = parsed.prices.filter((row) => row.surchargeKind === null);
  if (retail.length > 0) {
    const sorted = [...retail].sort((a, b) => a.retailMinor - b.retailMinor);
    const label = (row: CountryPriceData): string =>
      `\`${row.sku}\`/${row.tierKey ?? "-"} ${String(row.retailMinor)} ${row.currency} (${row.countryIso2})`;
    lines.push(
      `${String(retail.length)} retail rows. Cheapest: ${sorted.slice(0, 3).map(label).join(", ")}. Dearest: ${sorted.slice(-3).reverse().map(label).join(", ")}.`,
      "",
      "Every row is inside its `plan/10` §2.3 band and on its currency's psychological ending, or rule family 5 would have failed: this is the distribution, not a verdict.",
      "",
    );
  }

  lines.push("#### description word counts (`en`)", "");
  const descriptions = (
    parsed.copy.get(seedCopyPath(COPY_SOURCE_LOCALE, "product")) ?? []
  )
    .map((row) =>
      row.descriptionMd === undefined ? 0 : wordCount(row.descriptionMd),
    )
    .sort((a, b) => a - b);
  if (descriptions.length > 0) {
    const buckets = new Map<string, number>();
    for (const count of descriptions) {
      const bucket =
        count < COPY_WORD_MIN
          ? `< ${String(COPY_WORD_MIN)}`
          : count > COPY_WORD_MAX
            ? `> ${String(COPY_WORD_MAX)}`
            : `${String(Math.floor(count / 10) * 10)}–${String(Math.floor(count / 10) * 10 + 9)}`;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    lines.push("| words | descriptions |", "|---|---|");
    for (const [bucket, count] of [...buckets.entries()].sort()) {
      lines.push(`| ${bucket} | ${String(count)} |`);
    }
    lines.push(
      "",
      `min ${String(descriptions[0])} · median ${String(descriptions[Math.floor(descriptions.length / 2)])} · max ${String(descriptions[descriptions.length - 1])} (band ${String(COPY_WORD_MIN)}–${String(COPY_WORD_MAX)})`,
      "",
    );
  }

  lines.push(
    "#### copy review per locale",
    "",
    "`ready` is `isLocaleIndexable()` **and** every dataset row human-reviewed — the same predicates spec 007 gates hreflang and sitemap membership with.",
    "",
    "| locale | rows | machine | reviewed | machine share | messages unreviewed | indexable | ready |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const locale of localeReadiness(tree)) {
    lines.push(
      `| ${locale.locale} | ${String(locale.rows)} | ${String(locale.machine)} | ${String(locale.reviewed)} | ${percent(locale.machineShare)} | ${percent(locale.messageUnreviewedShare)} | ${locale.indexable ? "yes" : "no"} | ${locale.ready ? "yes" : "**no**"} |`,
    );
  }
  const missingLocales = launchLocales.filter(
    (locale) => !tree.copyLocales.includes(locale),
  );
  lines.push(
    "",
    missingLocales.length === 0
      ? "Every launch locale has copy files."
      : `Launch locales with no copy files: ${missingLocales.join(", ")}.`,
    "",
  );

  lines.push("#### imagery in the manifest", "");
  const rows = parsed.variants ?? [];
  const storedBytes = rows.reduce((sum, variant) => sum + variant.bytes, 0);
  const committedFiles = tree.mediaFiles.filter((file) =>
    file.path.startsWith(`${COMMITTED_MEDIA_DIR}/`),
  );
  const committedBytes = committedFiles.reduce(
    (sum, file) => sum + file.bytes,
    0,
  );
  lines.push(
    // The manifest total is the bucket's growth curve and the reviewer's sense of scale: reported,
    // not capped, since the per-slot cap in each row is what is enforced. The committed total is
    // capped: since TASK-138 it is the site-origin `hero` ladder alone.
    `${String(rows.length)} variant(s), ${String(storedBytes)} B in all (reported, not capped: the per-slot caps below are enforced per variant).`,
    "",
    `Committed under \`${COMMITTED_MEDIA_DIR}/\` (site origin: ${COMMITTED_MEDIA_SLOTS.join(", ")}): ${String(committedFiles.length)} files, ${String(committedBytes)} B of ${String(COMMITTED_MEDIA_BYTE_CAP)} B (${percent(committedBytes / COMMITTED_MEDIA_BYTE_CAP)} of the spec 006 §13 Q4 cap).`,
    "",
    "| slot | cap (B) | largest variant (B) | variants |",
    "|---|---|---|---|",
  );
  for (const slot of mediaSlots) {
    const ofSlot = rows.filter(
      (variant) => slotOfAsset(variant.assetId, parsed.media) === slot,
    );
    const largest = ofSlot.reduce(
      (max, variant) => Math.max(max, variant.bytes),
      0,
    );
    lines.push(
      `| ${slot} | ${String(SLOT_BYTE_CAPS[slot])} | ${ofSlot.length === 0 ? "—" : String(largest)} | ${String(ofSlot.length)} |`,
    );
  }
  const withVariants = new Set(
    (parsed.variants ?? []).map((variant) => variant.assetId),
  );
  const placeholders = parsed.products.filter((product) => {
    const assets = parsed.media.filter(
      (asset) => asset.productSku === product.sku,
    );
    return (
      assets.length === 0 || !assets.some((asset) => withVariants.has(asset.id))
    );
  });
  lines.push(
    "",
    `Products still rendering the placeholder (no asset, or no derived variant): **${String(placeholders.length)}** of ${String(parsed.products.length)}. That is the honesty rule of \`plan/10\` §3, not a gap: a product with no picture renders the captioned placeholder and no \`<img>\`.`,
    "",
  );

  const pairs = seoTitleNearDuplicates(tree);
  lines.push(
    `#### \`seoTitle\` near-duplicates (${String(pairs.length)} pairs)`,
    "",
    "A category and an occasion that share a facet key share a topic. Both pages are legitimate; spec 008 has to nominate the primary for the query and link the other to it (`plan/02` §7).",
    "",
    "| key | category `seoTitle` | occasion `seoTitle` |",
    "|---|---|---|",
  );
  for (const pair of pairs) {
    lines.push(
      `| ${pair.key} | ${pair.categoryTitle} | ${pair.occasionTitle} |`,
    );
  }
  lines.push("");

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* CLI.                                                                       */
/* -------------------------------------------------------------------------- */

async function main(argv: readonly string[]): Promise<number> {
  const root = resolve(
    argv.find((argument) => !argument.startsWith("--")) ??
      fileURLToPath(new URL("..", import.meta.url)),
  );
  const asOfFlag = argv.find((argument) => argument.startsWith("--as-of="));
  const asOf =
    asOfFlag === undefined
      ? new Date()
      : new Date(asOfFlag.slice("--as-of=".length));
  if (Number.isNaN(asOf.getTime())) {
    console.error(
      `${CLI_NAME}: \`${String(asOfFlag)}\` is not an instant; pass \`--as-of=2026-12-31T12:00:00Z\``,
    );
    return 2;
  }
  const tree = await readSeedTree(root, new Map(), asOf);
  const problems = checkSeedDataset(tree);

  if (problems.length > 0) {
    console.error(
      `${CLI_NAME} failed with ${String(problems.length)} problem(s) in ${familiesOf(problems).length.toString()} rule family/families (${familiesOf(problems).join(", ")}):`,
    );
    console.error(formatSeedProblems(problems));
  } else {
    console.log(
      `${CLI_NAME}: ${String(tree.raw.size)} dataset file(s), all ten rule families clean.`,
    );
  }

  if (argv.includes("--report")) {
    const report = seedHealthReport(tree);
    console.log(report);
    const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
    if (summaryPath !== undefined && summaryPath !== "") {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(
        summaryPath,
        [
          "",
          `### \`${CLI_NAME}\` — ${problems.length === 0 ? "clean" : `${String(problems.length)} problem(s)`}`,
          "",
          report,
          "",
          ...(problems.length > 0
            ? ["```", formatSeedProblems(problems), "```", ""]
            : []),
        ].join("\n"),
      );
    }
  }

  return seedCheckExitCode(problems);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = await main(process.argv.slice(2));
}
