/**
 * The 23 seeded categories (`plan/10` §2.1 "5 product types + 10 occasion categories + 8
 * flower-type hubs"; spec 005 §2 "Taxonomy"; TASK-061).
 *
 * A category here is a **taxonomy row**: which categories exist, which facet each one's key is
 * drawn from, and the order they are listed in. That is everything `toCategoryRow()`, the
 * six-product-rule counters of `plan/02` §6 (TASK-063) and `catalogue:check` need.
 *
 * **Names, slugs and intros are deliberately not here.** `category_translation` is per-locale URL
 * and copy data and ADR-0017 assigns `seed/data/categories.json` to spec 006 (TASK-072);
 * authoring a slug in two places is the drift that ADR exists to prevent. `labelKey` is the facet
 * label key of spec 005 §7, so a category's visible name resolves through the message catalogue
 * exactly as the facet filter's does — one string, not two.
 *
 * The ten occasion categories are `plan/10` §1.1's first ten evergreen occasions, which are the
 * ones with seeded product coverage; the eight flower-type hubs are the flower facets the 84
 * products actually use as a primary flower (`orchids` through the potted plants). A category with
 * fewer than six products is not renderable as an indexable page — that threshold is spec 008's
 * (`plan/02` §6) and 005 only supplies the count (§2).
 */
import {
  type CategoryData,
  CategoryRegistrySchema,
  categoryKinds,
} from "./schemas.ts";

const categories = [
  {
    key: "bouquet",
    kind: "productType",
    labelKey: "catalog.facet.productType.bouquet",
    sort: 0,
  },
  {
    key: "arrangement",
    kind: "productType",
    labelKey: "catalog.facet.productType.arrangement",
    sort: 1,
  },
  {
    key: "plant",
    kind: "productType",
    labelKey: "catalog.facet.productType.plant",
    sort: 2,
  },
  {
    key: "funeral",
    kind: "productType",
    labelKey: "catalog.facet.productType.funeral",
    sort: 3,
  },
  {
    key: "gift_set",
    kind: "productType",
    labelKey: "catalog.facet.productType.giftSet",
    sort: 4,
  },
  {
    key: "birthday",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.birthday",
    sort: 5,
  },
  {
    key: "anniversary",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.anniversary",
    sort: 6,
  },
  {
    key: "romance",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.romance",
    sort: 7,
  },
  {
    key: "congratulations",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.congratulations",
    sort: 8,
  },
  {
    key: "new_baby",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.newBaby",
    sort: 9,
  },
  {
    key: "get_well",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.getWell",
    sort: 10,
  },
  {
    key: "sympathy",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.sympathy",
    sort: 11,
  },
  {
    key: "thank_you",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.thankYou",
    sort: 12,
  },
  {
    key: "apology",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.apology",
    sort: 13,
  },
  {
    key: "just_because",
    kind: "occasion",
    labelKey: "catalog.facet.occasion.justBecause",
    sort: 14,
  },
  {
    key: "roses",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.roses",
    sort: 15,
  },
  {
    key: "tulips",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.tulips",
    sort: 16,
  },
  {
    key: "lilies",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.lilies",
    sort: 17,
  },
  {
    key: "orchids",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.orchids",
    sort: 18,
  },
  {
    key: "sunflowers",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.sunflowers",
    sort: 19,
  },
  {
    key: "peonies",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.peonies",
    sort: 20,
  },
  {
    key: "gerberas",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.gerberas",
    sort: 21,
  },
  {
    key: "mixed",
    kind: "flowerType",
    labelKey: "catalog.facet.flowerType.mixed",
    sort: 22,
  },
] as const;

/** Parsed at module load. */
export const CATEGORIES: readonly CategoryData[] =
  CategoryRegistrySchema.parse(categories);

/** The categories of one kind, in `sort` order — the three navigation groups of `plan/10` §2.1. */
export function categoriesOfKind(
  kind: (typeof categoryKinds)[number],
): readonly CategoryData[] {
  return CATEGORIES.filter((category) => category.kind === kind);
}

/** Look a category up by key. Throws on an unknown key: the set is closed data. */
export function categoryByKey(key: string): CategoryData {
  const category = CATEGORIES.find((candidate) => candidate.key === key);
  if (category === undefined) {
    throw new Error(`unknown category key: ${key}`);
  }
  return category;
}
