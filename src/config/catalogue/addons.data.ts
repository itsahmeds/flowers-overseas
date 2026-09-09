/**
 * The six Phase 0 add-ons (`plan/10` §2.1 "6 (chocolates, vase, balloon, plush, wine [flag],
 * card) with country prices"; spec 005 §2 "Tiers and add-ons", AC-19; TASK-061).
 *
 * Four properties of this file are the compliance content of spec 005 §8, and each is structural:
 *
 *  - **No add-on can default to selected.** There is no `defaultSelected`/`preselected` field and
 *    `AddonDataSchema` is `.strict()`, so adding one is a parse error. CRD Art. 22 forbids a
 *    pre-ticked extra (`plan/07` §2.1) and AC-19 pins both halves of that.
 *  - **Add-ons are priced per destination country with their own VAT rate** (spec 005 §13 Q3,
 *    spec 002 §14 A1 (a)): in Poland chocolates are 23% while flowers are 8% (`plan/06` §4 item
 *    4), so a single country-level rate would produce a wrong invoice on the first mixed order.
 *    The amounts themselves are `addon_country_price` rows authored by TASK-062 — nothing here
 *    carries money.
 *  - **`wine` is flagged, not conditional in code.** `flagPrefix` yields `addon.wine.{country}`
 *    (`plan/10` §1.1 "disabled where unlicensed"); TASK-064 owns the flag seam and Phase 0 reads
 *    a static implementation, so enabling wine in a country stays a data flip.
 *  - **`card` is priced 0 and is still a line**, so the summary, the invoice and the confirmation
 *    email all show the same set of lines (spec 005 §2).
 *
 * **`cake` is deliberately absent.** `plan/10` §1.1 lists it as partner-sourced only and §2.1's
 * seeded set is the six above; AC-6 counts six. The `partnerOnly` field exists so that adding
 * `cake` later is one row rather than a schema change, which is what spec 005 §2's "`cake` is
 * `partner_only`" needs from this dataset (TASK-064 reads the flag).
 */
import {
  type AddonData,
  AddonRegistrySchema,
  scopedFlagKey,
} from "./schemas.ts";

const addons = [
  {
    key: "chocolates",
    kind: "confectionery",
    allergenNoteRequired: true,
    partnerOnly: false,
    flagPrefix: null,
    nameKey: "catalog.addon.chocolates.name",
    descriptionKey: "catalog.addon.chocolates.description",
    sort: 0,
  },
  {
    key: "vase",
    kind: "vessel",
    allergenNoteRequired: false,
    partnerOnly: false,
    flagPrefix: null,
    nameKey: "catalog.addon.vase.name",
    descriptionKey: "catalog.addon.vase.description",
    sort: 1,
  },
  {
    key: "balloon",
    kind: "balloon",
    allergenNoteRequired: false,
    partnerOnly: false,
    flagPrefix: null,
    nameKey: "catalog.addon.balloon.name",
    descriptionKey: "catalog.addon.balloon.description",
    sort: 2,
  },
  {
    key: "plush",
    kind: "plush",
    allergenNoteRequired: false,
    partnerOnly: false,
    flagPrefix: null,
    nameKey: "catalog.addon.plush.name",
    descriptionKey: "catalog.addon.plush.description",
    sort: 3,
  },
  {
    key: "wine",
    kind: "alcohol",
    allergenNoteRequired: false,
    partnerOnly: false,
    flagPrefix: "addon.wine",
    nameKey: "catalog.addon.wine.name",
    descriptionKey: "catalog.addon.wine.description",
    sort: 4,
  },
  {
    key: "card",
    kind: "stationery",
    allergenNoteRequired: false,
    partnerOnly: false,
    flagPrefix: null,
    nameKey: "catalog.addon.card.name",
    descriptionKey: "catalog.addon.card.description",
    sort: 5,
  },
] as const;

/** Parsed at module load. */
export const ADDONS: readonly AddonData[] = AddonRegistrySchema.parse(addons);

/** Look an add-on up by key. Throws on an unknown key: the set is closed data. */
export function addonByKey(key: string): AddonData {
  const addon = ADDONS.find((candidate) => candidate.key === key);
  if (addon === undefined) {
    throw new Error(`unknown add-on key: ${key}`);
  }
  return addon;
}

/**
 * The feature-flag key that decides whether an add-on may be offered in a destination country, or
 * `null` for an unflagged add-on. One builder, so no caller string-builds `addon.wine.PL`
 * (`plan/10` §1.1). Whether the flag is *on* is TASK-064's seam and, from spec 002, a
 * `feature_flag_scope` row — never a code change.
 */
export function addonFlagKey(key: string, countryIso2: string): string | null {
  const { flagPrefix } = addonByKey(key);
  return flagPrefix === null ? null : scopedFlagKey(flagPrefix, countryIso2);
}
