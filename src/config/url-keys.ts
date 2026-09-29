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

/** Every query key a URL we build or route may carry, in the order the listing honours them. */
export const QUERY_KEYS = ["page", "sort"] as const;

export type QueryKey = (typeof QUERY_KEYS)[number];

/** Each key by name, so a reader writes `QUERY_KEY.page` rather than retyping the string. */
export const QUERY_KEY: { readonly [K in QueryKey]: K } = {
  page: QUERY_KEYS[0],
  sort: QUERY_KEYS[1],
};
