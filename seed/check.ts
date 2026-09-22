/**
 * `pnpm seed:check` — the gate that makes `seed/data/**` trustworthy (spec 006 §2.3, §6, §11;
 * AC-7, AC-9, AC-10, AC-30; TASK-075).
 *
 * ```
 * pnpm seed:check            # exit 0 on the merged tree, one line per problem otherwise
 * pnpm seed:check --report   # also append the §11 catalogue-health report to the step summary
 * ```
 *
 * ## What it is
 *
 * Nine rule families, in the order spec 006 §2.3 lists them, over the committed dataset:
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
 *  9. **budgets** — committed derived bytes under the 6 MB cap and every variant inside its
 *     slot's cap (`seed/budgets.ts`).
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
 * **No clock, no network, no database, no environment** — `pnpm check:no-db` covers this file, the
 * only `process.env` read is `GITHUB_STEP_SUMMARY` inside `main()` (the precedent of
 * `scripts/catalogue-check.ts`), and nothing in the rule families can see the date. A gate whose
 * verdict changes at midnight is not a gate.
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
import { floristSentenceFor } from "../scripts/i18n-draft.ts";
import { COUNTRIES, COUNTRY_CODES } from "../src/config/countries.ts";
import type {
  AddonCountryPriceData,
  AddonData,
  CategoryData,
  CountryPriceData,
  OccasionData,
  ProductData,
  ProductTierGroup,
} from "../src/config/catalogue/schemas.ts";
import { launchLocales } from "../src/config/locales.ts";
import {
  isLocaleIndexable,
  unreviewedShare,
} from "../src/modules/i18n/review.ts";
import {
  COMMITTED_MEDIA_BYTE_CAP,
  COMMITTED_MEDIA_DIR,
  SLOT_BYTE_CAPS,
} from "./budgets.ts";
import {
  COPY_SOURCE_LOCALE,
  COPY_WORD_MAX,
  COPY_WORD_MIN,
  SEED_COPY_DIR,
  type SeedCopyFileEntity,
  asciiFoldSlug,
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

/** The nine rule families of spec 006 §2.3, in reporting order. */
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

/** A committed derived image file and its size, for family 9. */
export interface CommittedMediaFile {
  /** Repo-relative, POSIX-separated: `public/media/home-hero/1920.avif`. */
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
  readonly mediaFiles: readonly CommittedMediaFile[];
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

  const mediaFiles = listFilesRecursively(join(root, COMMITTED_MEDIA_DIR)).map(
    (path) => ({
      path: relative(root, path).split(/[\\/]/u).join(posix.sep),
      bytes: statSync(path).size,
    }),
  );

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

function checkSlugs(tree: SeedTree): SeedProblem[] {
  const problems: SeedProblem[] = [];
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
    const committed = new Map(
      tree.mediaFiles.map((file) => [file.path, file.bytes]),
    );
    for (const variant of variants) {
      const path = `${COMMITTED_MEDIA_DIR}/${variant.assetId}/${String(variant.width)}.${variant.format}`;
      const bytes = committed.get(path);
      if (bytes === undefined) {
        at(
          VARIANTS_FILE,
          `${variant.assetId}/${String(variant.width)}.${variant.format}`,
          "variant-file",
          `is in the manifest with no file at \`${path}\`: a 404 on a variant degrades to the placeholder, and \`pnpm media:variants --check\` is what makes that impossible for committed assets (AC-14)`,
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
          `${COMMITTED_MEDIA_DIR}/${variant.assetId}/${String(variant.width)}.${variant.format}`,
      ),
    );
    for (const file of tree.mediaFiles) {
      if (!inManifest.has(file.path)) {
        at(
          VARIANTS_FILE,
          file.path,
          "variant-orphan",
          "is committed under `public/media/` with no manifest entry: every file has an entry and every entry has a file (AC-14)",
        );
      }
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
        if (alt === undefined) {
          at(
            `${ALT_DIR}/${locale}.json`,
            asset.id,
            "alt-missing",
            `is a product image with no \`${locale}\` alt text`,
          );
        } else if (alt.trim() === "") {
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

/** The slot a committed variant belongs to, via its asset in `media.json`. */
function slotOfPath(
  path: string,
  media: readonly MediaAssetManifest[],
): MediaSlot | undefined {
  const assetId = path.split("/").at(-2);
  return media.find((asset) => asset.id === assetId)?.slot;
}

function checkBudgets(tree: SeedTree, parsed: Parsed): SeedProblem[] {
  const problems: SeedProblem[] = [];
  const total = tree.mediaFiles.reduce((sum, file) => sum + file.bytes, 0);
  if (total > COMMITTED_MEDIA_BYTE_CAP) {
    problems.push({
      family: "budgets",
      file: COMMITTED_MEDIA_DIR,
      key: "total",
      rule: "total-bytes",
      message: `holds ${String(total)} B of derived imagery, above the ${String(COMMITTED_MEDIA_BYTE_CAP)} B cap (spec 006 §13 Q4: derived bytes are committed only until R2 exists, and only capped)`,
    });
  }
  for (const file of tree.mediaFiles) {
    const slot = slotOfPath(file.path, parsed.media);
    if (slot === undefined) {
      problems.push({
        family: "budgets",
        file: file.path,
        key: file.path,
        rule: "unknown-slot",
        message:
          "is committed under `public/media/` but its asset id is not in `media.json`, so no per-slot cap applies to it",
      });
      continue;
    }
    const cap = SLOT_BYTE_CAPS[slot];
    if (file.bytes > cap) {
      problems.push({
        family: "budgets",
        file: file.path,
        key: slot,
        rule: "slot-bytes",
        message: `is ${String(file.bytes)} B, above the ${String(cap)} B cap for the \`${slot}\` slot: an oversized image must fail a gate before the bytes are committed, not a Lighthouse run after they are served (spec 006 §2.5, §6)`,
      });
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
    ...checkSlugs(tree),
    ...checkPrices(parsed),
    ...checkCopy(tree, parsed),
    ...checkMedia(tree, parsed),
    ...checkPrivacy(tree),
    ...checkBudgets(tree, parsed),
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
 * The standing catalogue-health report of spec 006 §11 and AC-30, as Markdown for the step
 * summary. Read-only: it never changes the verdict, and every readiness column in it comes from
 * the predicate the application gates on.
 */
export function seedHealthReport(tree: SeedTree): string {
  const parsed = parseTree(tree);
  const lines: string[] = [];
  const coverage = coverageRows(tree);

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

  lines.push("#### committed imagery", "");
  const total = tree.mediaFiles.reduce((sum, file) => sum + file.bytes, 0);
  lines.push(
    `${String(tree.mediaFiles.length)} files, ${String(total)} B of ${String(COMMITTED_MEDIA_BYTE_CAP)} B (${percent(total / COMMITTED_MEDIA_BYTE_CAP)} of the spec 006 §13 Q4 cap).`,
    "",
    "| slot | cap (B) | largest committed (B) | files |",
    "|---|---|---|---|",
  );
  for (const slot of mediaSlots) {
    const files = tree.mediaFiles.filter(
      (file) => slotOfPath(file.path, parsed.media) === slot,
    );
    const largest = files.reduce((max, file) => Math.max(max, file.bytes), 0);
    lines.push(
      `| ${slot} | ${String(SLOT_BYTE_CAPS[slot])} | ${files.length === 0 ? "—" : String(largest)} | ${String(files.length)} |`,
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
  const tree = await readSeedTree(root);
  const problems = checkSeedDataset(tree);

  if (problems.length > 0) {
    console.error(
      `${CLI_NAME} failed with ${String(problems.length)} problem(s) in ${familiesOf(problems).length.toString()} rule family/families (${familiesOf(problems).join(", ")}):`,
    );
    console.error(formatSeedProblems(problems));
  } else {
    console.log(
      `${CLI_NAME}: ${String(tree.raw.size)} dataset file(s), all nine rule families clean.`,
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
