/**
 * The root redirect: `/` answers one permanent 308 to the x-default locale home, the same for
 * every request (spec 003 §14 A16 clause 1, AC-7 as A16 restates it; TASK-119).
 *
 * ## Why a `redirects()` rule, and why it is unconditional
 *
 * The founder ruled that nobody sees a chooser page at `/`: everyone is shown the site in English
 * and the language popup offers the other three (A16, 2026-10-04). So `/` has no document. It is
 * one rule in `next.config.ts` `redirects()`, built here beside the other rule builders, and it
 * is the only redirect in the application:
 *
 *  - **No `has`, no `missing`.** The answer depends on nothing about the visitor: no IP, no
 *    country header, no cookie (`fo_locale` included), no `Accept-Language`, no user agent.
 *    Googlebot gets the same 308 as a person in Warsaw. That is what keeps it outside ADR-0006,
 *    which forbids redirecting *by location*, and what keeps the response one cache entry with no
 *    `Vary`. A returning visitor who chose Deutsch and types the bare domain lands on `/en` with
 *    no popup (their cookie is set) and the header switcher one tap away; honouring the cookie
 *    here would be the stored-state routing ADR-0006 keeps out (A16 clause 1, recommendation
 *    accepted).
 *  - **Not in `src/proxy.ts`**, where `fo/no-geo-redirect` keeps refusing a
 *    `NextResponse.redirect`, and not in a Cloudflare rule: one place, testable without the edge,
 *    and the cold Vercel fallback gives the same answer.
 *  - **The destination is the registry's**, through `localePath()`: `documentFallbackLocale()` is
 *    the x-default locale (`plan/02` §3), so a database-backed registry moves the target with it
 *    and no locale literal exists here. Next passes a query string through (`/?ref=x` →
 *    `/en?ref=x`).
 *
 * Deep imports rather than the `@/modules/i18n` barrel: `next.config.ts` loads this file before
 * the application is compiled, and the barrel re-exports Server Components, which the config
 * loader has no business evaluating. `routing.ts` and `registry.ts` are plain functions over
 * `src/config/locales.ts`.
 *
 * `tests/unit/root-redirect.test.ts` deep-equals the rule set to the one rule, so any added
 * condition fails it; `tests/e2e/root-redirect.spec.ts` sends `GET`/`HEAD /` in five variants and
 * asserts the same status and `Location` for each.
 */
import { documentFallbackLocale } from "../modules/i18n/registry.ts";
import { localePath } from "../modules/i18n/routing.ts";

/** One `redirects()` entry, in the shape `next.config` takes, and nothing that could vary it. */
export interface RootRedirectRule {
  readonly source: "/";
  readonly destination: string;
  readonly permanent: true;
}

/** The whole redirect set of the application: exactly one rule. */
export function rootRedirectRules(): RootRedirectRule[] {
  return [
    {
      source: "/",
      destination: localePath(documentFallbackLocale().code, "home"),
      permanent: true,
    },
  ];
}
