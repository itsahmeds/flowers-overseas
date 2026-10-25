/**
 * The mega menu's model as the header renders it (spec 004 §14 A-founder-2026-10-24a item 5;
 * spec 043 AC-2, AC-3, AC-50; TASK-383).
 *
 * `megaMenuModel(locale, iso2 | null)` in `src/modules/catalog/mega-menu.ts` builds it from the
 * existence functions, the taxonomy and the registries, and parses it through
 * `MegaMenuModelSchema` (Zod at the boundary). This file is the shape only, with no catalogue
 * import, because `src/modules/ui` may not read the catalogue (`plan/01` §5): the `@header` slot
 * composes the two in `app/`.
 *
 * Three kinds of entry, and the kind is the whole rule of item 3's link classes, so the template
 * has no branch of its own to get wrong:
 *
 *  - `link`: a plain `<a href>` to a page that names no price or names its country (a hub out of
 *    context, a country page in context, a corridor guide, an index);
 *  - `chooser`: an `<a href rel="nofollow">` to the chooser, `/{locale}/{chooseSegment}/{next}`,
 *    path only (a shop entry out of context: a colour, a price band, "All flowers");
 *  - `facet`: a GET form with one hidden field to a country's shop root, in context (spec 008
 *    AC-15: no parameterised `<a href>`).
 *
 * An entry exists exactly when its page does (A20): the model never carries a disabled or textual
 * stand-in, and a column or panel left empty is absent.
 */
import { z } from "zod";

import { MEGA_MENU_ITEMS } from "../../../config/mega-menu.ts";
import { ListingCardViewSchema } from "../shop/viewModel.ts";

const NonEmpty = z.string().min(1);

/** A dotted message key (`nav.mega.byType`, `catalog.facet.colour.white`, `destinations.fr.name`). */
const LabelKey = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+$/,
    "must be a dotted message key",
  );

/** A same-site absolute path with no query string and no fragment: every `<a href>` here. */
const PathOnly = z
  .string()
  .regex(/^\/[^?#\s]*$/, "must be a same-site path with no query string");

export const MegaEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("link"),
      id: NonEmpty,
      labelKey: LabelKey,
      /**
       * A category hub's own name in this locale, as its page and the chip rows print it
       * ("Hand-tied bouquets"); the board names a hub this way, and the facet key (`labelKey`,
       * singular) is the fallback. Catalogue copy, not a message: it is reviewed with the hub.
       */
      label: NonEmpty.optional(),
      href: PathOnly,
      /** A dated occasion's earliest date (Coming up), formatted by the template. */
      date: z.iso.date().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("chooser"),
      id: NonEmpty,
      labelKey: LabelKey,
      href: PathOnly,
    })
    .strict(),
  z
    .object({
      kind: z.literal("facet"),
      id: NonEmpty,
      labelKey: LabelKey,
      action: PathOnly,
      name: NonEmpty,
      value: NonEmpty,
    })
    .strict(),
]);
export type MegaEntry = z.infer<typeof MegaEntrySchema>;

export const MegaColumnSchema = z
  .object({
    id: NonEmpty,
    headingKey: LabelKey,
    entries: z.array(MegaEntrySchema).min(1),
    /** A long list drawn in two sub-columns (the board's `.cm-col.two`). */
    wide: z.boolean(),
  })
  .strict();
export type MegaColumn = z.infer<typeof MegaColumnSchema>;

/** A featured card: a country-less card through the chooser, or the country's at its price. */
export const MegaFeaturedSchema = z
  .object({
    card: ListingCardViewSchema,
    /** The card's link; the chooser's (`rel="nofollow"`) when `chooser` is true. */
    href: PathOnly,
    chooser: z.boolean(),
  })
  .strict();
export type MegaFeatured = z.infer<typeof MegaFeaturedSchema>;

export const MegaPanelSchema = z
  .object({
    id: z.enum(MEGA_MENU_ITEMS),
    labelKey: LabelKey,
    columns: z.array(MegaColumnSchema),
    /** The panel's "All …" link under its columns. */
    all: MegaEntrySchema.nullable(),
    /** Plain text naming things that have no page (Plants & gifts' add-ons). */
    extras: z
      .object({
        headingKey: LabelKey,
        labelKeys: z.array(LabelKey).min(1),
      })
      .strict()
      .nullable(),
    featured: MegaFeaturedSchema.nullable(),
  })
  .strict();
export type MegaPanel = z.infer<typeof MegaPanelSchema>;

export const MegaMenuModelSchema = z
  .object({
    /** The URL's country with a shop (in context), or `null` (out of context). */
    context: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    panels: z.array(MegaPanelSchema),
  })
  .strict();
export type MegaMenuModel = z.infer<typeof MegaMenuModelSchema>;

/** Every entry of a panel, in drawing order: its columns, then its "All …" link. */
export function panelEntries(panel: MegaPanel): readonly MegaEntry[] {
  return [
    ...panel.columns.flatMap((column) => column.entries),
    ...(panel.all === null ? [] : [panel.all]),
  ];
}
