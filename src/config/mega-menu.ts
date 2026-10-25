/**
 * The mega menu's shape as config (spec 004 §14 A-founder-2026-10-24a item 5, "Data model";
 * TASK-383).
 *
 * The menu is built by `megaMenuModel()` in `src/modules/catalog/mega-menu.ts` from the existence
 * functions, the taxonomy and the registries; what is left for config is which taxonomy keys each
 * panel reads, in which order, and the handful of numbers the panels agree on. Nothing here names
 * a country, a product or a currency (AC-73), and no database is read here (`pnpm check:no-db`).
 * Every label is a message key, never a literal.
 */

/** The six top items, in the row's order (item 5's table). */
export const MEGA_MENU_ITEMS = [
  "flowers",
  "occasions",
  "sympathy",
  "plantsGifts",
  "byPrice",
  "destinations",
] as const;
export type MegaMenuItemId = (typeof MEGA_MENU_ITEMS)[number];

/**
 * Each top item's label. Occasions, Sympathy and Destinations keep the reviewed labels the old
 * category row used (the amendment's "Reused, reviewed"); the other three are the amendment's new
 * `nav.mega.*` keys.
 */
export const MEGA_MENU_ITEM_LABEL_KEYS: Readonly<
  Record<MegaMenuItemId, string>
> = {
  flowers: "nav.mega.flowers",
  occasions: "nav.category.occasions",
  sympathy: "nav.category.sympathy",
  plantsGifts: "nav.mega.plantsGifts",
  byPrice: "nav.mega.byPrice",
  destinations: "nav.category.destinations",
};

/**
 * The menu row's landmark name, `<nav aria-label="Categories">` on both chrome boards. The key is
 * the one the retired category row used (reviewed), moved here with the row it names.
 */
export const MEGA_MENU_NAV_LABEL_KEY = "nav.categories.label";

/** The `<details name>` every top item shares: one panel open at a time where supported. */
export const MEGA_MENU_GROUP = "fo-mega";

/**
 * Flowers, "By type": the category hubs of kind `productType`, except these, which have panels of
 * their own (Sympathy's `funeral`, Plants & gifts' `plant`).
 */
export const MEGA_FLOWERS_TYPE_EXCLUDED: readonly string[] = [
  "funeral",
  "plant",
];

/** Occasions, "Every day": the evergreen occasion hubs, except Sympathy's (it has its own panel). */
export const MEGA_EVERY_DAY_EXCLUDED: readonly string[] = ["sympathy"];

/**
 * Occasions, "For whom" (item 5's `RECIPIENT_GROUPS`): a recipient mapped to the occasion hub that
 * serves it, each drawn only where that hub exists. The amendment's fifth group (a partner, to
 * `romance`) is not here: its label text fails the voice scan (`src/config/voice.ts`), the board
 * draws it as a `[slot]` for the founder's wording, and an entry with no approved label cannot be
 * drawn (TASK-383 brief, carry-forward and escalation). It is one line here once the key exists.
 */
export const RECIPIENT_GROUPS: readonly {
  readonly id: string;
  readonly occasionKey: string;
  readonly labelKey: string;
}[] = [
  {
    id: "mum",
    occasionKey: "mothers_day",
    labelKey: "nav.mega.recipient.mum",
  },
  {
    id: "grandparents",
    occasionKey: "grandparents_day",
    labelKey: "nav.mega.recipient.grandparents",
  },
  {
    id: "newParents",
    occasionKey: "new_baby",
    labelKey: "nav.mega.recipient.newParents",
  },
  {
    id: "colleague",
    occasionKey: "thank_you",
    labelKey: "nav.mega.recipient.colleague",
  },
];

/** Occasions, "Coming up": this many dated occasions, by their earliest date. */
export const MEGA_COMING_UP_COUNT = 5;

/** How far ahead "Coming up" and the Occasions featured card look, in months. */
export const MEGA_COMING_UP_MONTHS = 12;

/** Flowers, "By colour": a colour is listed when at least this many products carry it. */
export const MEGA_COLOUR_MIN_PRODUCTS = 2;

/** The Sympathy panel's hubs, in order: occasion hubs and category hubs. */
export const MEGA_SYMPATHY_HUBS: readonly {
  readonly kind: "category" | "occasion";
  readonly key: string;
}[] = [
  { kind: "occasion", key: "sympathy" },
  { kind: "category", key: "funeral" },
  { kind: "occasion", key: "all_saints" },
];

/** The occasion key whose core products the Sympathy panel features. */
export const MEGA_SYMPATHY_OCCASION = "sympathy";

/** The Plants & gifts panel's hubs, in order (`gift_set` while it exists). */
export const MEGA_PLANTS_GIFTS_HUBS: readonly {
  readonly kind: "category";
  readonly key: string;
}[] = [
  { kind: "category", key: "plant" },
  { kind: "category", key: "orchids" },
  { kind: "category", key: "gift_set" },
];

/** The product type whose first core product the Plants & gifts panel features. */
export const MEGA_PLANTS_FEATURED_TYPE = "plant";

/** The column headings, by column id. */
export const MEGA_COLUMN_HEADING_KEYS = {
  byType: "nav.mega.byType",
  byFlower: "nav.mega.byFlower",
  byColour: "nav.mega.byColour",
  everyDay: "nav.mega.everyDay",
  forWhom: "nav.mega.forWhom",
  comingUp: "nav.mega.comingUp",
  sympathy: "nav.category.sympathy",
  plantsGifts: "nav.mega.plantsGifts",
  byPrice: "nav.mega.byPrice",
  open: "nav.mega.open",
  soon: "nav.mega.soon",
} as const;
export type MegaColumnId = keyof typeof MEGA_COLUMN_HEADING_KEYS;

/** The "All …" link under a panel's columns, by panel. */
export const MEGA_ALL_LABEL_KEYS = {
  flowers: "nav.mega.allFlowers",
  occasions: "nav.mega.allOccasions",
  destinations: "nav.mega.allDestinations",
} as const;

/** The plain-text add-on line's heading (no page, so no link). */
export const MEGA_EXTRAS_HEADING_KEY = "nav.mega.extras";

/** The word labels of the three price bands (item 4.5), never an amount before a country. */
export const MEGA_PRICE_BAND_LABEL_KEYS = {
  low: "shop.price.bandWord.low",
  mid: "shop.price.bandWord.mid",
  high: "shop.price.bandWord.high",
} as const;
