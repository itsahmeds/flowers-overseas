/**
 * The query keys our own URLs carry (spec 001 §14 A20, AC-55; TASK-160).
 *
 * One list, read by the schemas that honour a query string, so the list is the schemas' own: the
 * listing schema (`ListingSearchParamsSchema`, `src/modules/catalog/schemas.ts`) honours exactly
 * these keys and neutralises every other. `tests/unit/url-pii.test.ts` fails when a key here is a
 * PII key name (`isRedactedKey`), when the code names a query key outside this list, and when a
 * query-string schema honours a key outside it.
 *
 * Keys of URLs we do not route (a third party's loader, a map link, a payment redirect) are not
 * here: they are `EXTERNAL_QUERY_KEYS` in the test file, so no schema of ours can read one and
 * start honouring it.
 */

/**
 * Every query key a URL we build or route may carry, in the order the listing honours them.
 * `price` is the price band of a country page (spec 004 §14 A-founder-2026-10-24a item 3: the
 * chooser's 303 to `?price={band}`; spec 008's band facet): built by TASK-381's
 * `countryVersionOf()`, honoured by TASK-390, and until then neutralised like any unhonoured key
 * (the parameter route renders the base listing, `noindex`).
 */
export const QUERY_KEYS = ["page", "sort", "price"] as const;

export type QueryKey = (typeof QUERY_KEYS)[number];

/** Each key by name, so a reader writes `QUERY_KEY.page` rather than retyping the string. */
export const QUERY_KEY: { readonly [K in QueryKey]: K } = {
  page: QUERY_KEYS[0],
  sort: QUERY_KEYS[1],
  price: QUERY_KEYS[2],
};

/**
 * The product page's two query keys (spec 009 §5.2 `ProductSearchParamsSchema`, §14 A10, AC-15;
 * TASK-128): the size and the delivery date its `GET` form submits (`TierSelector`'s and
 * `DateChip`'s field names). Not in `QUERY_KEYS`, because that list is the listing's and the
 * listing rewrites read it: a listing does not honour `?tier=` or `?date=`, and learning them
 * would send a listing request that carries one to the listing's parameter route. Neither is
 * personal data; `tests/unit/product-params.test.ts` holds both to `isRedactedKey()` as
 * `tests/unit/url-pii.test.ts` holds `QUERY_KEYS`.
 */
export const PRODUCT_QUERY_KEYS = ["tier", "date"] as const;

export type ProductQueryKey = (typeof PRODUCT_QUERY_KEYS)[number];

/** Each product key by name. */
export const PRODUCT_QUERY_KEY: { readonly [K in ProductQueryKey]: K } = {
  tier: PRODUCT_QUERY_KEYS[0],
  date: PRODUCT_QUERY_KEYS[1],
};
