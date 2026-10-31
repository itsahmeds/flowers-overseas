/**
 * The commerce structure's numbers (spec 004 §14 A-founder-2026-10-24a items 1, 3, 4 and 12, "Data
 * model"; TASK-381).
 *
 * Countries are data and the core range is data (founder, 2026-10-24: "don't just build the shop
 * around Poland"); what is left for config is the handful of sizes the pages and the gates agree
 * on. Nothing here names a country, a product or a currency, and no database is read here
 * (`pnpm check:no-db`).
 */

/**
 * How many products the core range holds: at least `min`, at most `max` (item 1, the founder's
 * "a fixed curated list of 8 to 12 bouquets"). `pnpm seed:check` refuses a list outside it, naming
 * the count (AC-72), and spec 012b's admin refuses a save that would leave it.
 */
export const CORE_RANGE_SIZE = { min: 8, max: 12 } as const;

/**
 * Florists per core product and shop country below which the coverage matrix and the go-live
 * preflight warn (item 12, AC-113). A cell at 0 hides the product from every country-less page.
 */
export const CORE_MIN_FLORISTS = 2;

/**
 * The picker's and the chooser's country buttons: the first this many shop countries by
 * `sortWeight`, then by name in the reader's collation; every other country is in the searchable
 * field (item 3, item 4.2, Q-24b).
 */
export const PICKER_CHIPS = 6;

/**
 * The three price bands' keys (spec 008 §14 A-founder-2026-10-24a "Price bands"): the chooser's
 * `price/{band}` next and the shop root's band facet (`?price=`, `QUERY_KEY.price` in
 * `src/config/url-keys.ts`). The thresholds are computed per country by
 * `priceBands()`; no amount is configured for any currency.
 */
export const PRICE_BAND_KEYS = ["low", "mid", "high"] as const;
export type PriceBandKey = (typeof PRICE_BAND_KEYS)[number];

/**
 * The `next` shapes of the chooser that are not a locale's path segment (item 3): a price band and
 * the search results. The other shapes (a category hub, an occasion hub, a product) use the
 * locale's own `pathSegments`, so another locale's segment is an unknown shape.
 */
export const CHOOSER_NEXT_WORDS = { price: "price", search: "search" } as const;

/** At most this many characters of `next` (item 3's validation); a longer one falls back. */
export const CHOOSER_NEXT_MAX_CHARS = 256;

/**
 * At most this many characters of the chooser's typed country (`to`), spec 004 §14
 * A-founder-2026-10-24a item 3: no country name in any launch locale comes close, and a longer
 * value is a no match without being compared (TASK-385).
 */
export const CHOOSER_INPUT_MAX_CHARS = 64;

/**
 * The country chooser's choice route (spec 004 §14 A-founder-2026-10-24a item 3; TASK-385):
 * `/api/choose/{locale}/{next}` takes the form's GET (`to`) and, by `src/proxy.ts`'s rewrite, the
 * path form `/{locale}/{chooseSegment}/{iso2}/{next}`, and answers every one with a `303`: to the
 * chosen country's page with one `Set-Cookie: fo_dest`, or back to the chooser page with what was
 * typed. Under `/api/`, which `robots.txt` disallows.
 */
export const CHOICE_ROUTE_PREFIX = "/api/choose";
