/**
 * The token scrubber for URLs that leave the process (spec 018 §8, §11; AC-14; T-14; TASK-339).
 *
 * Two kinds of URL carry a credential: the tracking link `/{locale}/track/{token}` (and its
 * `/photo` and `/calendar.ics` children), and the signed links whose token rides in `?t=` (the
 * invoice link, `account/invoices/{id}?t=…`). Neither token may reach GA4's `page_location` or a
 * Sentry event, so both paths replace it with the literal `:token`:
 *
 *  - `scrubUrlTokens(text)`, used by `beforeSend` (`./sentry.ts`) on `request.url`, the
 *    breadcrumbs and the transaction name;
 *  - the consent bootstrap (`./consent-bootstrap.ts`), the inline script that queues GA4's
 *    `config`, passes `page_location` through the same two patterns, built into the script from
 *    the `source` of the expressions below so the two cannot drift.
 *
 * Plain Node and browser-safe: no Next, no React, no import, because `next.config.ts` hashes the
 * bootstrap at build time.
 */

/** `/track/{token}`: the segment after `/track/`, up to the next `/`, `?` or `#`. */
export const TRACK_PATH_TOKEN = /(\/track\/)[^/?#]+/g;

/** `?t={token}` or `&t={token}`: the value of a `t` query parameter. */
export const QUERY_TOKEN = /([?&]t=)[^&#]*/g;

/** What a token is replaced with. */
export const TOKEN_PLACEHOLDER = ":token";

/**
 * `api_secret={secret}`: the GA4 Measurement Protocol secret in the collection URL (spec 023 §8
 * "Logs and PII", AC-28; TASK-491). Not used by the consent bootstrap.
 */
export const API_SECRET_PARAM = /((?:^|[?&])api_secret=)[^&#\s]*/g;

/** What the Measurement Protocol secret is replaced with. */
export const API_SECRET_PLACEHOLDER = "[redacted]";

/**
 * `text` with every tracking-path token and every `t` query value replaced by `:token`, and every
 * `api_secret` query value by `[redacted]`.
 */
export function scrubUrlTokens(text: string): string {
  return text
    .replace(TRACK_PATH_TOKEN, `$1${TOKEN_PLACEHOLDER}`)
    .replace(QUERY_TOKEN, `$1${TOKEN_PLACEHOLDER}`)
    .replace(API_SECRET_PARAM, `$1${API_SECRET_PLACEHOLDER}`);
}

/**
 * `?q={words}`, `&q={words}` or a bare `q={words}` at the start of a string (a span's `url.query`):
 * the value of a `q` query parameter, the site search's words (spec
 * 045 §2.8, AC-23; TASK-403). A buyer may type a name, an address or a phone number into it, so a
 * URL that leaves the process for Sentry carries `q=:q` instead (`scrubSearchTerms`, used by
 * `beforeSend` and `beforeBreadcrumb` in `./sentry.ts`). GA4's `page_location` drops a search
 * address's whole query string instead (`searchLocationPattern`, `./search-routes.ts`).
 */
export const QUERY_SEARCH_TERM = /((?:^|[?&])q=)[^&#]*/g;

/** What the search words are replaced with. */
export const SEARCH_TERM_PLACEHOLDER = ":q";

/** `text` with every `q` query value replaced by `:q`. */
export function scrubSearchTerms(text: string): string {
  return text.replace(QUERY_SEARCH_TERM, `$1${SEARCH_TERM_PLACEHOLDER}`);
}
