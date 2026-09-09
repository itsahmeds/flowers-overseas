/**
 * The occasion facet as rows (`plan/10` §1.1; spec 002 §5.1 `occasion(id, key, kind)`; TASK-061).
 *
 * Every occasion `plan/10` §1.1 lists is here — fourteen evergreen, then the eighteen seasonal
 * ones (eleven pan-European plus the seven market-specific ones) — because the dataset *is* the
 * closed facet value set: `OccasionRegistrySchema` fails if a facet value has no row or a row has
 * no facet value, so a product cannot reference an occasion that the taxonomy does not have and
 * the taxonomy cannot grow a value nothing can use.
 *
 * **No dates here.** The per-country calendar is `occasion_country` with the `rule_type`/`rule`
 * shapes of `plan/03` §9, authored by spec 006 and evaluated by spec 009; 005 owns no calendar
 * and no date arithmetic (spec 005 §3). **No slugs either**, for the reason `categories.data.ts`
 * gives: `occasion_translation` is per-locale URL data and ADR-0017 assigns
 * `seed/data/occasions.json` to spec 006.
 */
import {
  type OccasionData,
  OccasionRegistrySchema,
  occasionKinds,
} from "./schemas.ts";

const occasions = [
  {
    key: "birthday",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.birthday",
    sort: 0,
  },
  {
    key: "anniversary",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.anniversary",
    sort: 1,
  },
  {
    key: "romance",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.romance",
    sort: 2,
  },
  {
    key: "congratulations",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.congratulations",
    sort: 3,
  },
  {
    key: "new_baby",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.newBaby",
    sort: 4,
  },
  {
    key: "get_well",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.getWell",
    sort: 5,
  },
  {
    key: "sympathy",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.sympathy",
    sort: 6,
  },
  {
    key: "thank_you",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.thankYou",
    sort: 7,
  },
  {
    key: "apology",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.apology",
    sort: 8,
  },
  {
    key: "just_because",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.justBecause",
    sort: 9,
  },
  {
    key: "wedding",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.wedding",
    sort: 10,
  },
  {
    key: "graduation",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.graduation",
    sort: 11,
  },
  {
    key: "housewarming",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.housewarming",
    sort: 12,
  },
  {
    key: "retirement",
    kind: "evergreen",
    labelKey: "catalog.facet.occasion.retirement",
    sort: 13,
  },
  {
    key: "valentines",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.valentines",
    sort: 14,
  },
  {
    key: "womens_day",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.womensDay",
    sort: 15,
  },
  {
    key: "mothers_day",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.mothersDay",
    sort: 16,
  },
  {
    key: "fathers_day",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.fathersDay",
    sort: 17,
  },
  {
    key: "grandparents_day",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.grandparentsDay",
    sort: 18,
  },
  {
    key: "easter",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.easter",
    sort: 19,
  },
  {
    key: "all_saints",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.allSaints",
    sort: 20,
  },
  {
    key: "christmas",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.christmas",
    sort: 21,
  },
  {
    key: "new_year",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.newYear",
    sort: 22,
  },
  {
    key: "name_day",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.nameDay",
    sort: 23,
  },
  {
    key: "teachers_day",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.teachersDay",
    sort: 24,
  },
  {
    key: "sant_jordi",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.santJordi",
    sort: 25,
  },
  {
    key: "fete_des_grands_meres",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.feteDesGrandsMeres",
    sort: 26,
  },
  {
    key: "muguet",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.muguet",
    sort: 27,
  },
  {
    key: "konfirmation",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.konfirmation",
    sort: 28,
  },
  {
    key: "student",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.student",
    sort: 29,
  },
  {
    key: "omatag",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.omatag",
    sort: 30,
  },
  {
    key: "17_mai",
    kind: "seasonal",
    labelKey: "catalog.facet.occasion.17Mai",
    sort: 31,
  },
] as const;

/** Parsed at module load; the parse also asserts the rows and the facet cover each other. */
export const OCCASIONS: readonly OccasionData[] =
  OccasionRegistrySchema.parse(occasions);

/** Evergreen or seasonal occasions, in `sort` order (spec 002 §5.1's `occasion.kind`). */
export function occasionsOfKind(
  kind: (typeof occasionKinds)[number],
): readonly OccasionData[] {
  return OCCASIONS.filter((occasion) => occasion.kind === kind);
}

/** Look an occasion up by key. Throws on an unknown key: the set is closed data. */
export function occasionByKey(key: string): OccasionData {
  const occasion = OCCASIONS.find((candidate) => candidate.key === key);
  if (occasion === undefined) {
    throw new Error(`unknown occasion key: ${key}`);
  }
  return occasion;
}
