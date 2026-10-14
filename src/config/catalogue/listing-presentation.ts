/**
 * The listing presentation registry (spec 004 §14 A23 clause 4 **R1** and **R2**, AC-33; spec 008
 * §14 **A15 (b)**, AC-30; TASK-187).
 *
 * One row per occasion and per category: how its listing page is presented, chosen here and never
 * by a component.
 *
 * - **`register`**, R1's closed set of grounds: `warm` (butter), `quiet` (cream, no tilt, no tape),
 *   `dated` (blush), `cream`, `leaf`, `sky` and `ink`. The defaults are R1's: `warm` for the
 *   celebrations, `quiet` for sympathy and funeral, `dated` for every seasonal occasion. The
 *   categories the artboards draw are R1's too (roses `ink`, hand-tied bouquets `cream`, plants
 *   `leaf`); every other category is `cream`, and a celebration category takes its occasion's
 *   `warm`. The country occasion page uses its occasion's register.
 * - **`leadSku`**, R2's hub lead, optional. It must belong to the hub's own product set (the
 *   products the hub's facet selects), or the module **fails to load, naming the key**. The six the
 *   artboards fix are filled (Birthday FO-BQ-023, Sympathy FO-BQ-016, Mother's Day FO-BQ-007,
 *   roses FO-BQ-002, hand-tied bouquets FO-BQ-009, plants FO-PT-002); TASK-188 consumes the field
 *   and sets the other hub leads. The country pages never read it: their lead is `items[0]`.
 * - **`deckSentence`**, optional: the 1-based index of a sentence of the hub's reviewed intro, for
 *   a hub whose deck has no approved string (A23 clause 6). TASK-188 fills and reads it.
 * - **`countNoun`** on a category, spec 008 §14 A15 (b)'s closed set (`bouquet | plant |
 *   arrangement`), which names the shop root's tile count ("8 plants we can make for Poland"). The
 *   rule that fills it: the noun of the category's majority product type, `bouquet` for bouquets
 *   and gift sets, `arrangement` for arrangements and funeral work, `plant` for plants. Every
 *   category fits one of the three; a category that fits none is escalated, never given a fourth.
 *
 * **Why config and not a copy row** (R1): none of the three fields is per locale, and spec 002's
 * category and occasion columns must not drift; this is the bounded config deviation of spec 008
 * §12, and spec 012's admin takes it over with no call-site change.
 *
 * **One row for every category and every occasion of the dataset**, not only those with a hub
 * today: whether an entity has a hub is a data fact (spec 008 AC-5, a category crossing the floor
 * gains its pages with no code change), so a row must already be here the day it does. The load
 * fails on a missing row, a duplicate row, an unknown key, an out-of-set register or noun, and a
 * foreign `leadSku`. Parsed with zod at module load; `pnpm check:no-db` covers this file.
 */
import { z } from "zod";

import { CATEGORIES } from "./categories.data.ts";
import { OCCASIONS } from "./occasions.data.ts";
import { PRODUCTS } from "./products.data.ts";

/** R1's closed set of grounds. */
export const LISTING_REGISTERS = [
  "warm",
  "quiet",
  "dated",
  "cream",
  "leaf",
  "sky",
  "ink",
] as const;
export type ListingRegister = (typeof LISTING_REGISTERS)[number];

/** Spec 008 §14 A15 (b)'s three nouns, the founder's approved set. */
export const COUNT_NOUNS = ["bouquet", "plant", "arrangement"] as const;
export type CountNoun = (typeof COUNT_NOUNS)[number];

const Sku = z.string().regex(/^FO-[A-Z]{2}-\d{3}$/u);

export const OccasionPresentationSchema = z
  .object({
    key: z.string().min(1),
    register: z.enum(LISTING_REGISTERS),
    leadSku: Sku.optional(),
    deckSentence: z.int().positive().optional(),
  })
  .strict();

export const CategoryPresentationSchema = OccasionPresentationSchema.extend({
  countNoun: z.enum(COUNT_NOUNS),
}).strict();

export type OccasionPresentation = z.infer<typeof OccasionPresentationSchema>;
export type CategoryPresentation = z.infer<typeof CategoryPresentationSchema>;

export interface ListingPresentationRegistry {
  readonly categories: readonly CategoryPresentation[];
  readonly occasions: readonly OccasionPresentation[];
}

const categories = [
  {
    key: "bouquet",
    register: "cream",
    countNoun: "bouquet",
    leadSku: "FO-BQ-009",
  },
  { key: "arrangement", register: "cream", countNoun: "arrangement" },
  { key: "plant", register: "leaf", countNoun: "plant", leadSku: "FO-PT-002" },
  { key: "funeral", register: "quiet", countNoun: "arrangement" },
  { key: "gift_set", register: "cream", countNoun: "bouquet" },
  { key: "birthday", register: "warm", countNoun: "bouquet" },
  { key: "anniversary", register: "warm", countNoun: "bouquet" },
  { key: "romance", register: "warm", countNoun: "bouquet" },
  { key: "congratulations", register: "warm", countNoun: "bouquet" },
  { key: "new_baby", register: "warm", countNoun: "bouquet" },
  { key: "get_well", register: "warm", countNoun: "bouquet" },
  { key: "sympathy", register: "quiet", countNoun: "arrangement" },
  { key: "thank_you", register: "warm", countNoun: "bouquet" },
  { key: "apology", register: "warm", countNoun: "bouquet" },
  { key: "just_because", register: "warm", countNoun: "bouquet" },
  { key: "roses", register: "ink", countNoun: "bouquet", leadSku: "FO-BQ-002" },
  { key: "tulips", register: "cream", countNoun: "bouquet" },
  { key: "lilies", register: "cream", countNoun: "bouquet" },
  { key: "orchids", register: "cream", countNoun: "plant" },
  { key: "sunflowers", register: "cream", countNoun: "bouquet" },
  { key: "peonies", register: "cream", countNoun: "bouquet" },
  { key: "gerberas", register: "cream", countNoun: "bouquet" },
  { key: "mixed", register: "cream", countNoun: "bouquet" },
] as const;

/** Every seasonal occasion is `dated` (R1); the evergreen ones are celebrations but sympathy. */
const occasions = [
  { key: "birthday", register: "warm", leadSku: "FO-BQ-023" },
  { key: "anniversary", register: "warm" },
  { key: "romance", register: "warm" },
  { key: "congratulations", register: "warm" },
  { key: "new_baby", register: "warm" },
  { key: "get_well", register: "warm" },
  { key: "sympathy", register: "quiet", leadSku: "FO-BQ-016" },
  { key: "thank_you", register: "warm" },
  { key: "apology", register: "warm" },
  { key: "just_because", register: "warm" },
  { key: "wedding", register: "warm" },
  { key: "graduation", register: "warm" },
  { key: "housewarming", register: "warm" },
  { key: "retirement", register: "warm" },
  { key: "valentines", register: "dated" },
  { key: "womens_day", register: "dated" },
  { key: "mothers_day", register: "dated", leadSku: "FO-BQ-007" },
  { key: "fathers_day", register: "dated" },
  { key: "grandparents_day", register: "dated" },
  { key: "easter", register: "dated" },
  { key: "all_saints", register: "dated" },
  { key: "christmas", register: "dated" },
  { key: "new_year", register: "dated" },
  { key: "name_day", register: "dated" },
  { key: "teachers_day", register: "dated" },
  { key: "sant_jordi", register: "dated" },
  { key: "fete_des_grands_meres", register: "dated" },
  { key: "muguet", register: "dated" },
  { key: "konfirmation", register: "dated" },
  { key: "student", register: "dated" },
  { key: "omatag", register: "dated" },
  { key: "17_mai", register: "dated" },
] as const;

/** The products a hub's facet selects: the product set its `leadSku` must belong to (R2). */
function hubProductSkus(
  kind: "category" | "occasion",
  key: string,
): ReadonlySet<string> {
  if (kind === "occasion") {
    return new Set(
      PRODUCTS.filter((product) =>
        (product.occasions as readonly string[]).includes(key),
      ).map((product) => product.sku),
    );
  }
  const category = CATEGORIES.find((row) => row.key === key);
  return new Set(
    PRODUCTS.filter((product) =>
      category?.kind === "productType"
        ? product.productType === key
        : category?.kind === "occasion"
          ? (product.occasions as readonly string[]).includes(key)
          : (product.flowerTypes as readonly string[]).includes(key),
    ).map((product) => product.sku),
  );
}

/** The whole-registry rules a row schema cannot see, each failure naming the key. */
function checkRows(
  kind: "category" | "occasion",
  rows: readonly OccasionPresentation[],
  expected: readonly string[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.key)) {
      context.addIssue({
        code: "custom",
        path: [`${kind}s`, index, "key"],
        message: `${kind} \`${row.key}\` has two presentation rows`,
      });
    }
    seen.add(row.key);
    if (!expected.includes(row.key)) {
      context.addIssue({
        code: "custom",
        path: [`${kind}s`, index, "key"],
        message: `${kind} \`${row.key}\` is not in the catalogue`,
      });
    }
    if (
      row.leadSku !== undefined &&
      !hubProductSkus(kind, row.key).has(row.leadSku)
    ) {
      context.addIssue({
        code: "custom",
        path: [`${kind}s`, index, "leadSku"],
        message: `${kind} \`${row.key}\`: leadSku ${row.leadSku} is not in its hub's product set`,
      });
    }
  });
  for (const key of expected) {
    if (!seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: [`${kind}s`],
        message: `${kind} \`${key}\` has no presentation row`,
      });
    }
  }
}

export const ListingPresentationRegistrySchema = z
  .object({
    categories: z.array(CategoryPresentationSchema).readonly(),
    occasions: z.array(OccasionPresentationSchema).readonly(),
  })
  .strict()
  .superRefine((registry, context) => {
    checkRows(
      "category",
      registry.categories,
      CATEGORIES.map((row) => row.key),
      context,
    );
    checkRows(
      "occasion",
      registry.occasions,
      OCCASIONS.map((row) => row.key),
      context,
    );
  });

/** Parsed at module load: a malformed row throws on first import, naming its key. */
export const LISTING_PRESENTATION: ListingPresentationRegistry =
  ListingPresentationRegistrySchema.parse({ categories, occasions });

/** One category's row. Throws on an unknown key: the registry covers the whole dataset. */
export function categoryPresentation(key: string): CategoryPresentation {
  const row = LISTING_PRESENTATION.categories.find(
    (entry) => entry.key === key,
  );
  if (row === undefined)
    throw new Error(`no presentation row for category ${key}`);
  return row;
}

/** One occasion's row. Throws on an unknown key: the registry covers the whole dataset. */
export function occasionPresentation(key: string): OccasionPresentation {
  const row = LISTING_PRESENTATION.occasions.find((entry) => entry.key === key);
  if (row === undefined)
    throw new Error(`no presentation row for occasion ${key}`);
  return row;
}
