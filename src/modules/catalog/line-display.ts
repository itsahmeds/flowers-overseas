/**
 * What a basket line shows about its bouquet (spec 010 §14 A-founder-2026-10-22 item 6, AC-57;
 * TASK-349): the product's name in the locale, the chosen size's label key, the add-ons' name
 * keys and the photograph the thumbnail shows.
 *
 * A read of the catalogue only. It decides nothing about the line (whether it is still offered,
 * what it costs: `assessBasket()` in `src/modules/checkout` re-derives that) and never throws for
 * a line whose product, size or add-on has since left the catalogue: an unavailable line stays
 * visible (D8), so it shows what is still known and leaves out the rest.
 *
 * The photograph is the first approved asset of the product with alt text in this locale, the
 * listing card's rule (`spec 006` AC-18): no asset, no `<img>`, the token placeholder instead.
 */
import type { CountryIso2 } from "@/config/countries";
import type { LocaleCode } from "@/config/locales";
import { altFor, assetsForProduct, isDisplayable } from "@/modules/ui";

import { copyRow } from "./copy";
import { getProduct, listAddons, listTiers } from "./read";

export interface LineDisplay {
  /** The product's name in this locale; `null` when the product left the catalogue. */
  readonly name: string | null;
  /** The chosen size: its label key and stem count, or `null` when the size is gone. */
  readonly tier: {
    readonly labelKey: string;
    readonly stems: number | null;
  } | null;
  /** The add-ons still offered for the destination, in the line's order, by name key. */
  readonly addOnNameKeys: readonly string[];
  /** The thumbnail's asset and alt text, or `null` for the placeholder. */
  readonly photo: { readonly assetId: string; readonly alt: string } | null;
}

/** The photograph a line shows: the first displayable asset with alt text here. */
function linePhoto(sku: string, locale: LocaleCode): LineDisplay["photo"] {
  for (const asset of assetsForProduct(sku)) {
    const alt = altFor(asset.id, locale);
    if (alt !== undefined && isDisplayable(asset.id, locale)) {
      return { assetId: asset.id, alt };
    }
  }
  return null;
}

export async function lineDisplay(input: {
  readonly sku: string;
  readonly tierKey: string;
  readonly addonKeys: readonly string[];
  readonly countryIso: CountryIso2;
  readonly locale: LocaleCode;
}): Promise<LineDisplay> {
  const product = await getProduct(input.sku).catch(() => null);
  if (product === null) {
    return { name: null, tier: null, addOnNameKeys: [], photo: null };
  }
  const tiers = await listTiers(input.sku).catch(() => []);
  const tier = tiers.find((candidate) => candidate.tierKey === input.tierKey);
  const addons = await listAddons(input.countryIso).catch(() => []);
  return {
    name: copyRow("product", input.sku, input.locale)?.name ?? product.name,
    tier:
      tier === undefined
        ? null
        : { labelKey: tier.labelKey, stems: tier.stems },
    addOnNameKeys: input.addonKeys.flatMap((key) => {
      const addon = addons.find((candidate) => candidate.key === key);
      return addon === undefined ? [] : [addon.nameKey];
    }),
    photo: linePhoto(input.sku, input.locale),
  };
}
