/**
 * The headers of every basket response (spec 010 §14 A-founder-2026-10-22 items 8 and 12, AC-72;
 * TASK-349), in `next.config.ts`'s `headers()` so that no response class escapes them.
 *
 * `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store, private` on `/{locale}/basket`
 * and on the bare `/basket`. Listed after the environment-wide `noindex` rule, so on a
 * non-production host this value is the one sent, as `./admin-headers.ts` does for `/admin`. The
 * page itself is rendered per request (it reads `fo_checkout`), so Next adds its own `no-store`
 * as well; this rule is what holds when it does not. Cloudflare's bypass of `/basket` is a
 * dashboard rule (spec 040 rule 1), checked on staging by TASK-208.
 */
import {
  TRANSACTIONAL_ROBOTS_HEADER,
  type TransactionalHeaderRule,
} from "../modules/seo/transactional.ts";

export const BASKET_ROBOTS_HEADER = {
  key: "X-Robots-Tag",
  value: TRANSACTIONAL_ROBOTS_HEADER,
} as const;

export const BASKET_CACHE_HEADER = {
  key: "Cache-Control",
  value: "no-store, private",
} as const;

/** Fresh objects on every call, as `adminHeaderRules()` returns them. */
export function basketHeaderRules(): TransactionalHeaderRule[] {
  const headers = [{ ...BASKET_ROBOTS_HEADER }, { ...BASKET_CACHE_HEADER }];
  return [
    { source: "/basket", headers },
    { source: "/:locale/basket", headers },
  ];
}
