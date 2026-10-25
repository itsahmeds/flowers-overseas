/**
 * The locale home's view model, products first (spec 004 §14 A-founder-2026-10-24a items 2 to 4;
 * TASK-386, TASK-387). `homeView()` in the catalogue builds it and parses it here, so the
 * components can rely on its shape and on what it cannot carry.
 *
 * **No field for money.** Every card is the country-less form (`CountryLessCardViewSchema`) with a
 * required chooser link: a price, a currency, an equivalents line or a delivery slot has nowhere to
 * arrive, because none may show before a country is chosen (the founder's "b", 2026-10-24). The
 * price bands are words and a link, never an amount.
 */
import { z } from "zod";

import { PRICE_BAND_KEYS } from "../../../config/commerce.ts";
import { CountryLessCardViewSchema } from "../shop/viewModel.ts";

const NonEmpty = z.string().min(1);

/** A home card: the country-less card, always a link (to the chooser, `next=product/{slug}`). */
export const HomeCardViewSchema = CountryLessCardViewSchema.extend({
  href: NonEmpty,
}).strict();
export type HomeCardView = z.infer<typeof HomeCardViewSchema>;

/** The inline picker: the chooser's form with an empty `next` (item 4.2). */
export const HomePickerViewSchema = z
  .object({
    /** The form's `action`: the choice route of the empty `next`. */
    action: NonEmpty,
    /** The first `PICKER_CHIPS` shop countries: lowercase code (the form value) and name. */
    chips: z
      .array(z.object({ code: NonEmpty, name: NonEmpty }).strict())
      .readonly(),
    /** Every registry country's name, in the one country order (the `<datalist>`). */
    datalist: z.array(NonEmpty).readonly(),
  })
  .strict();

export const HomeViewSchema = z
  .object({
    picker: HomePickerViewSchema,
    /** No destination takes orders yet: spec 043 AC-8's state line shows in the first screen. */
    notOpen: z.boolean(),
    /** "Our selection": the whole core range, and "See all" to the chooser (item 4.3). */
    selection: z
      .object({
        cards: z.array(HomeCardViewSchema).readonly(),
        seeAllHref: NonEmpty,
      })
      .strict(),
    /** "Shop by occasion": one tab per qualifying occasion, its cards and its hub (item 4.4). */
    occasions: z
      .array(
        z
          .object({
            key: NonEmpty,
            labelKey: NonEmpty,
            cards: z.array(HomeCardViewSchema).min(1).max(4).readonly(),
            /** How many core products carry the occasion: "See all {count}". */
            total: z.number().int().positive(),
            hubHref: NonEmpty.optional(),
          })
          .strict(),
      )
      .readonly(),
    /** "Shop by price": the three bands, words only, each a chooser link (item 4.5). */
    priceBands: z
      .array(
        z.object({ band: z.enum(PRICE_BAND_KEYS), href: NonEmpty }).strict(),
      )
      .length(PRICE_BAND_KEYS.length)
      .readonly(),
    /** "Coming up": at most three dated occasions, earliest first (item 4.6). */
    comingUp: z
      .array(
        z
          .object({
            key: NonEmpty,
            labelKey: NonEmpty,
            /** `YYYY-MM-DD`, the earliest date across the shop countries. */
            dateIso: z.iso.date(),
            /** The same date, formatted (`formatDate`). */
            date: NonEmpty,
            /** At most two country names, formatted as a list (`Intl.ListFormat`). */
            countries: NonEmpty,
            /** How many more countries keep it that day: `home.comingUp.more` when above 0. */
            more: z.number().int().nonnegative(),
            cards: z.array(HomeCardViewSchema).min(1).max(3).readonly(),
            hubHref: NonEmpty.optional(),
          })
          .strict(),
      )
      .max(3)
      .readonly(),
  })
  .strict();
export type HomeView = z.infer<typeof HomeViewSchema>;

/** One `ItemList` entry: the name a card prints and the link it carries, nothing else. */
export interface HomeItemListEntry {
  readonly name: string;
  readonly href: string;
}

/**
 * Each product section's `ItemList` entries (AC-107): "Our selection", the checked (first)
 * occasion panel, and "Coming up", each equal to the cards that section displays by default, by
 * count, order, name and URL. The entry type has no field for a price, so none can be emitted.
 * A section with no cards gives an empty list, which the builder turns into no node.
 */
export function homeItemListEntries(
  view: HomeView,
): readonly (readonly HomeItemListEntry[])[] {
  const entries = (cards: readonly HomeCardView[]): HomeItemListEntry[] =>
    cards.map((card) => ({ name: card.name, href: card.href }));
  return [
    entries(view.selection.cards),
    entries(view.occasions[0]?.cards ?? []),
    entries(view.comingUp.flatMap((occasion) => occasion.cards)),
  ];
}
