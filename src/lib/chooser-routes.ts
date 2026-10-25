/**
 * The country chooser's addresses (spec 004 §14 A-founder-2026-10-24a item 3, "Rendering", "SEO",
 * AC-77, AC-78; TASK-385).
 *
 * Two routes serve `/{locale}/{chooseSegment}/...`:
 *
 *  - **the chooser page** (`src/app/[locale]/-choose/-next/[[...rest]]/page.tsx`): the form, and the
 *    states a choice can come back to (no match, not live, not available). Rendered per request,
 *    `noindex, nofollow`, never a redirect and never a cookie;
 *  - **the choice route** (`src/app/api/choose/[locale]/[[...rest]]/route.ts`): every choice, the
 *    form's GET with `to` (the form's `action`) and the path form
 *    `/{locale}/{chooseSegment}/{iso2}/{next}` (the island's and the selector's link). It answers
 *    `303` with one `Set-Cookie: fo_dest`, or `303` back to the page with what was typed.
 *
 * A page render can set no cookie and pick no `303`, and only code that runs before the route can
 * send one address to a page or to a route handler, so `src/proxy.ts` **rewrites** a chooser
 * address (it never redirects: `fo/no-geo-redirect`): the path form to the choice route, anything
 * else to the page. The split reads the path and the country registry and nothing else, because the
 * proxy's graph may not reach the catalogue (whose graph reaches `next/font`, which the proxy's
 * build refuses); the choice route asks the catalogue everything else. The browser's address never
 * changes until the `303`.
 *
 * No catalogue data here and no header read, so `next.config.ts` and the proxy can import it.
 */
import { CHOICE_ROUTE_PREFIX } from "../config/commerce.ts";
import { isCountryIso2 } from "../config/countries.ts";
import { LOCALES, type LocaleCode } from "../config/locales.ts";

import { type HeaderRule, NOINDEX_HEADER_NAME } from "./robots-headers.ts";

/** The chooser page's internal first segment (`src/app/[locale]/-choose`), as `-product`'s. */
export const CHOOSER_ROUTE_SEGMENT = "-choose";

/**
 * A fixed second segment before `next` (`src/app/[locale]/-choose/-next/[[...rest]]`). Without
 * it, `/{locale}/-choose/product/{slug}` has the product page's shape and `next.config.ts`'s
 * `beforeFiles` rewrites (which run after the proxy's) would send it to the product route; no rule
 * there has a word starting with a hyphen in third place, and no slug starts with one.
 */
export const CHOOSER_ROUTE_NEXT = "-next";

/** A request's path, read as a chooser address. */
export interface ChooserAddress {
  readonly locale: LocaleCode;
  /** Everything after `/{locale}/{chooseSegment}/`, as the path spells it (still encoded). */
  readonly segments: readonly string[];
}

/**
 * `pathname` as a chooser address, or `undefined` when it is not one. The locale and the segment
 * must match exactly (a mis-cased address is not rewritten and 404s as any other would).
 */
export function chooserAddress(pathname: string): ChooserAddress | undefined {
  const [empty, code, segment, ...rest] = pathname.split("/");
  if (empty !== "" || code === undefined || segment === undefined) {
    return undefined;
  }
  const locale = LOCALES.find((entry) => entry.code === code);
  if (locale === undefined || locale.chooseSegment !== segment) {
    return undefined;
  }
  // A trailing slash leaves one empty segment; any other empty one stays, and the parser drops it.
  const segments = rest.at(-1) === "" ? rest.slice(0, -1) : rest;
  return { locale: locale.code as LocaleCode, segments };
}

/**
 * Is this address the path form, `/{locale}/{chooseSegment}/{iso2}/{next}`? Its first segment is a
 * registry country's code in lowercase; no `next` shape starts with a two-letter word.
 */
export function isPathForm(address: ChooserAddress): boolean {
  const [first] = address.segments;
  return (
    first !== undefined &&
    /^[a-z]{2}$/u.test(first) &&
    isCountryIso2(first.toUpperCase())
  );
}

/** Where `src/proxy.ts` serves a chooser address from (the query is the caller's to keep). */
export function chooserTargetPath(address: ChooserAddress): string {
  return isPathForm(address)
    ? [CHOICE_ROUTE_PREFIX, address.locale, ...address.segments].join("/")
    : [
        "",
        address.locale,
        CHOOSER_ROUTE_SEGMENT,
        CHOOSER_ROUTE_NEXT,
        ...address.segments,
      ].join("/");
}

/** Every chooser response's robots header: never indexed, its links never followed. */
export const CHOOSER_ROBOTS = "noindex, nofollow";

/** A literal for a path-to-regexp parameter group. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Every chooser response is one visitor's: never stored by a shared or a browser cache. */
export const CHOOSER_CACHE_CONTROL = "private, no-store";

/**
 * `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store` on every chooser address
 * in every locale, on the choice route and on a direct request to the internal page route.
 *
 * **After every other rule, so its values win.** Header sources match the address the visitor
 * asked for, and a chooser address has the listing pages' shape: `/en/choose-country/flowers/roses`
 * matches the country listings' edge-cache rule (`public, s-maxage=3600`, with `choose-country` read
 * as the country), which would let the edge serve one visitor's "Continue to {country}" to the next
 * (measured on a local `next start`, TASK-385). Last in `next.config.ts`, these two replace it.
 */
export function chooserHeaderRules(): HeaderRule[] {
  const header = [
    { key: NOINDEX_HEADER_NAME, value: CHOOSER_ROBOTS },
    { key: "Cache-Control", value: CHOOSER_CACHE_CONTROL },
  ];
  return [
    ...LOCALES.map((locale) => ({
      source: `/:locale(${literal(locale.code)})/:segment(${literal(
        locale.chooseSegment,
      )})/:path*`,
      headers: header,
    })),
    { source: `/:locale/${CHOOSER_ROUTE_SEGMENT}/:path*`, headers: header },
    { source: `${CHOICE_ROUTE_PREFIX}/:path*`, headers: header },
  ];
}
