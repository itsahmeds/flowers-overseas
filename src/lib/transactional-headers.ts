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

/**
 * The headers of the tracking routes (spec 018 §5.4, §6, AC-12; TASK-338).
 *
 * The token page and its calendar file: `X-Robots-Tag: noindex, nofollow`, `Cache-Control:
 * private, no-store` and `Referrer-Policy: no-referrer`, so the credential in the address never
 * leaves in a `Referer` header. The photo route sets its own `private, max-age=300` (AC-6), so its
 * rule carries the robots and referrer headers only. The lookup page, `/{locale}/track`, has no
 * credential and keeps the site's referrer policy. These rules sit **after**
 * `securityHeaderRules()` in `next.config.ts`: for one key, the last matching rule wins, and the
 * site-wide `Referrer-Policy` must lose here.
 */
export const TRACK_CACHE_HEADER = {
  key: "Cache-Control",
  value: "private, no-store",
} as const;

export const TRACK_REFERRER_HEADER = {
  key: "Referrer-Policy",
  value: "no-referrer",
} as const;

/** Fresh objects on every call. */
export function trackHeaderRules(): TransactionalHeaderRule[] {
  const robots = { ...BASKET_ROBOTS_HEADER };
  const full = [
    robots,
    { ...TRACK_CACHE_HEADER },
    { ...TRACK_REFERRER_HEADER },
  ];
  return [
    { source: "/:locale/track", headers: [robots, { ...TRACK_CACHE_HEADER }] },
    { source: "/:locale/track/:token", headers: full },
    { source: "/:locale/track/:token/calendar.ics", headers: full },
    {
      source: "/:locale/track/:token/photo",
      headers: [robots, { ...TRACK_REFERRER_HEADER }],
    },
  ];
}

/**
 * The headers of the buyer account (spec 018 §5.4, §14 A-founder-2026-10-22 C.13, C.14, AC-51;
 * TASK-344): `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store` and
 * `Referrer-Policy: no-referrer` on `/{locale}/account` and every page below it. The bare
 * `/{locale}/account` stays allowed in `robots.txt` so a crawler reads this `noindex` (C.5); the
 * confirm page carries the emailed `t`, so no `Referer` leaves any account page. After
 * `securityHeaderRules()` in `next.config.ts`, so this referrer policy wins.
 */
export function accountHeaderRules(): TransactionalHeaderRule[] {
  const headers = [
    { ...BASKET_ROBOTS_HEADER },
    { ...TRACK_CACHE_HEADER },
    { ...TRACK_REFERRER_HEADER },
  ];
  return [
    { source: "/:locale/account", headers },
    { source: "/:locale/account/:path*", headers },
  ];
}

/**
 * The headers of spec 034's basket reminder routes (§5.4, §6, AC-16, AC-31; TASK-451): the restore
 * route, `link-ended` and the unsubscribe page under `/{locale}/basket/…`, and the one-click
 * `POST /api/basket-reminders/unsubscribe/{token}`. `X-Robots-Tag: noindex, nofollow`,
 * `Cache-Control: no-store, private` and `Referrer-Policy: no-referrer`, so a token never leaves in
 * a `Referer`. After `securityHeaderRules()` in `next.config.ts`, so this referrer policy wins.
 */
export function basketReminderHeaderRules(): TransactionalHeaderRule[] {
  const headers = [
    { ...BASKET_ROBOTS_HEADER },
    { ...BASKET_CACHE_HEADER },
    { ...TRACK_REFERRER_HEADER },
  ];
  return [
    { source: "/:locale/basket/restore/:token", headers },
    { source: "/:locale/basket/link-ended", headers },
    { source: "/:locale/basket/unsubscribe/:token", headers },
    { source: "/api/basket-reminders/unsubscribe/:token", headers },
  ];
}

/**
 * The review form and its opt-out page (spec 022a §5.4, §6, AC-12; TASK-371): `X-Robots-Tag:
 * noindex, nofollow`, `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`, so the
 * token in the path never leaves in a `Referer`. After `securityHeaderRules()` in
 * `next.config.ts`, so this referrer policy wins.
 */
export function reviewHeaderRules(): TransactionalHeaderRule[] {
  const headers = [
    { ...BASKET_ROBOTS_HEADER },
    { ...TRACK_CACHE_HEADER },
    { ...TRACK_REFERRER_HEADER },
  ];
  return [
    { source: "/:locale/review/:token", headers },
    { source: "/:locale/review/:token/stop", headers },
  ];
}
