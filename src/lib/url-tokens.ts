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

/** `text` with every tracking-path token and every `t` query value replaced by `:token`. */
export function scrubUrlTokens(text: string): string {
  return text
    .replace(TRACK_PATH_TOKEN, `$1${TOKEN_PLACEHOLDER}`)
    .replace(QUERY_TOKEN, `$1${TOKEN_PLACEHOLDER}`);
}
