/**
 * `pnpm seed:project` — regenerate the projected half of `seed/data/**` from the authored
 * catalogue dataset (ADR-0017; spec 006 §2.2; TASK-072).
 *
 * ADR-0017's decision is that `src/config/catalogue/*.data.ts` is the **single authored source**
 * of catalogue entities and that `seed/data/`'s catalogue files are generated projections of it,
 * committed, and asserted equal by a gate — never a second hand-authored copy. This script is
 * that generation step. It is:
 *
 *  - **pure and offline** — it imports the parsed constants of `src/config/catalogue/`, reads no
 *    network, no clock, no environment and no database (`pnpm check:no-db` covers it), so it
 *    produces the same bytes on every machine;
 *  - **byte-deterministic** — no timestamp, no generator version and no ordering that depends on
 *    a hash: the row order is the authored order, and the text is run through Prettier with the
 *    repository's own configuration so the committed file is exactly what `pnpm format:check`
 *    computes. `tests/unit/seed-dataset.test.ts` re-projects and compares byte-for-byte, which is
 *    the assertion ADR-0017 asks for and the reason a hand edit to a projected file fails CI;
 *  - **`--check`-able** — the CI mode prints the stale files and exits non-zero without writing,
 *    which is what `pnpm seed:check` (TASK-075) calls.
 *
 * **Why the projected files carry the authored camelCase records rather than
 * `toProductRow()`'s output.** The row projections drop everything spec 002 §5.1's `product`
 * table has no column for — `occasions`, `flowerTypes`, `colours` beyond the primary,
 * `allergenNote`, a category's `labelKey` and `sort` — and those are exactly the fields the seed
 * needs in order to write `product_occasion` and `product_category` edges and to label a facet
 * (spec 006 §2.3 rule 3). A file of projected rows could not produce the edges the same section
 * demands. So the *file* is the dataset, byte-identical to what `src/config/catalogue/` holds,
 * and the projection onto spec 002's columns happens where the rows are written, through the very
 * same `to*Row()` functions, re-exported by `seed/schema/catalogue.ts` for one import site
 * (spec 006 §5.1's projection table, AC-3).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

import { ADDONS } from "../src/config/catalogue/addons.data.ts";
import { CATEGORIES } from "../src/config/catalogue/categories.data.ts";
import { OCCASIONS } from "../src/config/catalogue/occasions.data.ts";
import {
  ADDON_COUNTRY_PRICES,
  COUNTRY_PRICES,
  PRICED_DESTINATIONS,
} from "../src/config/catalogue/prices.data.ts";
import { PRODUCTS } from "../src/config/catalogue/products.data.ts";
import {
  facetNames,
  facetValues,
  substitutionClasses,
} from "../src/config/catalogue/schemas.ts";
import { PRODUCT_TIER_GROUPS } from "../src/config/catalogue/tiers.data.ts";
import { SEED_DATASET_VERSION, SEED_SOURCE } from "./schema/header.ts";
import {
  SEED_DATA_DIR,
  seedAddonPriceFilePath,
  seedPriceFilePath,
} from "./schema/files.ts";

/** The module a projected file names in its header, so a reader knows what to edit instead. */
const CATALOGUE_SCHEMAS = "src/config/catalogue/schemas.ts";
const CATALOGUE_DATA = (file: string): string =>
  `src/config/catalogue/${file}.data.ts`;

interface ProjectedFile {
  /** Path relative to `seed/data/`. */
  readonly path: string;
  /** The value serialised into the file, header included. */
  readonly value: unknown;
}

function header(entity: string, projectedFrom: string) {
  return {
    version: SEED_DATASET_VERSION,
    source: SEED_SOURCE,
    entity,
    origin: "projected" as const,
    projectedFrom,
  };
}

/**
 * The projected dataset as values, in the dependency order of `SEED_DATA_FILES`: the taxonomy the
 * facets resolve against, then the entities, then the tier groups.
 */
export function projectedFiles(): readonly ProjectedFile[] {
  return [
    {
      path: "taxonomy.json",
      value: {
        ...header("taxonomy", CATALOGUE_SCHEMAS),
        facets: Object.fromEntries(
          facetNames.map((facet) => [facet, [...facetValues[facet]]]),
        ),
        substitutionClasses: [...substitutionClasses],
      },
    },
    {
      path: "categories.json",
      value: {
        ...header("category", CATALOGUE_DATA("categories")),
        rows: CATEGORIES,
      },
    },
    {
      path: "occasions.json",
      value: {
        ...header("occasion", CATALOGUE_DATA("occasions")),
        rows: OCCASIONS,
      },
    },
    {
      path: "products.json",
      value: {
        ...header("product", CATALOGUE_DATA("products")),
        rows: PRODUCTS,
      },
    },
    {
      path: "product-tiers.json",
      value: {
        ...header("product_tier", CATALOGUE_DATA("tiers")),
        rows: PRODUCT_TIER_GROUPS,
      },
    },
    {
      path: "addons.json",
      value: {
        ...header("addon", CATALOGUE_DATA("addons")),
        rows: ADDONS,
      },
    },
    // The per-destination price files, in `PRICED_DESTINATIONS` order (which is
    // `src/config/countries.ts`'s order), retail rows before surcharge rows inside each file
    // because that is the authored order of `COUNTRY_PRICES` — nothing here sorts or groups, so a
    // re-projection diffs empty and the file is legible as the ladder it came from (TASK-074).
    ...PRICED_DESTINATIONS.map((iso2) => ({
      path: seedPriceFilePath(iso2),
      value: {
        ...header("country_price", CATALOGUE_DATA("prices")),
        countryIso2: iso2,
        rows: COUNTRY_PRICES.filter((row) => row.countryIso2 === iso2),
      },
    })),
    ...PRICED_DESTINATIONS.map((iso2) => ({
      path: seedAddonPriceFilePath(iso2),
      value: {
        ...header("addon_country_price", CATALOGUE_DATA("prices")),
        countryIso2: iso2,
        rows: ADDON_COUNTRY_PRICES.filter((row) => row.countryIso2 === iso2),
      },
    })),
  ];
}

/**
 * Serialise one projected file exactly as `pnpm format:check` expects it: `JSON.stringify` with
 * two-space indentation, then Prettier with the repository configuration resolved for that path.
 * Running the formatter here rather than ignoring `seed/data/` is what keeps one gate (`format`)
 * and one generator in agreement instead of exempting generated files from the formatter.
 */
async function serialise(
  root: string,
  file: ProjectedFile,
): Promise<{ path: string; contents: string }> {
  const filepath = join(root, SEED_DATA_DIR, file.path);
  const config = await resolveConfig(filepath);
  const contents = await format(JSON.stringify(file.value, null, 2), {
    ...(config ?? {}),
    filepath,
  });
  return { path: join(SEED_DATA_DIR, file.path), contents };
}

/** The whole projected dataset as `{ path, contents }`, ready to write or to compare. */
export async function projectSeedDataset(
  root: string,
): Promise<readonly { path: string; contents: string }[]> {
  return await Promise.all(
    projectedFiles().map(async (file) => await serialise(root, file)),
  );
}

/** Files whose committed bytes differ from a fresh projection (missing counts as stale). */
export async function staleProjections(root: string): Promise<string[]> {
  const stale: string[] = [];
  for (const file of await projectSeedDataset(root)) {
    let committed: string | null = null;
    try {
      committed = readFileSync(join(root, file.path), "utf8");
    } catch {
      committed = null;
    }
    if (committed !== file.contents) stale.push(file.path);
  }
  return stale;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const root = resolve(
    args.find((arg) => !arg.startsWith("--")) ?? process.cwd(),
  );

  if (check) {
    const stale = await staleProjections(root);
    if (stale.length > 0) {
      for (const path of stale) {
        process.stderr.write(
          `${path}: differs from a fresh projection of src/config/catalogue/ — run \`pnpm seed:project\` (ADR-0017: never hand-edit a projected file)\n`,
        );
      }
      process.exit(1);
    }
    process.stdout.write(
      `seed/data: ${String(projectedFiles().length)} projected file(s) match src/config/catalogue/ byte-for-byte (ADR-0017)\n`,
    );
  } else {
    const files = await projectSeedDataset(root);
    for (const file of files)
      writeFileSync(join(root, file.path), file.contents);
    process.stdout.write(
      `seed/data: wrote ${String(files.length)} projected file(s) from src/config/catalogue/\n`,
    );
  }
}
