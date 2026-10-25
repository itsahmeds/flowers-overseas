/**
 * The country chooser's addresses (spec 004 §14 A-founder-2026-10-24a item 3, "Rendering", "SEO",
 * AC-77, AC-78; TASK-385).
 *
 * `/{locale}/{chooseSegment}/...` is the one new dynamic route, and one address answers two ways:
 * a **choice** (a shop country by the form's `to` or by the path form) is a `303` with one
 * `Set-Cookie: fo_dest`; anything else is the chooser page (200). A page render cannot set a cookie
 * or pick a `303`, and a route handler cannot render a page, so `src/proxy.ts` decides and
 * **rewrites** (it never redirects: `fo/no-geo-redirect` and `tests/unit/root-redirect.test.ts`
 * keep every redirect out of it):
 *
 *  - a choice to `CHOICE_ROUTE_PREFIX` (`src/app/api/choose/[locale]/[iso2]/[[...next]]/route.ts`),
 *    which re-checks the country and answers the `303` with the cookie;
 *  - everything else to the page route `CHOOSER_ROUTE_SEGMENT`
 *    (`src/app/[locale]/-choose/[[...rest]]/page.tsx`), rendered per request (it reads `to` and
 *    `fo_dest`), `noindex, nofollow`.
 *
 * The browser's address never changes until the `303`. The segment is matched exactly, per locale,
 * from `src/config/locales.ts`: no catalogue data here, so `next.config.ts` can import this file.
 */
import { LOCALES, type LocaleCode } from "../config/locales.ts";

import { type HeaderRule, NOINDEX_HEADER_NAME } from "./robots-headers.ts";

/** The chooser page's internal first segment (`src/app/[locale]/-choose`), as `-product`'s. */
export const CHOOSER_ROUTE_SEGMENT = "-choose";

/** The choice route's prefix: `/api/choose/{locale}/{iso2}/{next}`. Under `/api/`, disallowed. */
export const CHOICE_ROUTE_PREFIX = "/api/choose";

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

/** The chooser page's internal path for an address (the query is the caller's to keep). */
export function chooserPagePath(address: ChooserAddress): string {
  return ["", address.locale, CHOOSER_ROUTE_SEGMENT, ...address.segments].join(
    "/",
  );
}

/** The choice route's path for a chosen country and a `next` (no leading slash). */
export function choiceRoutePath(
  locale: LocaleCode,
  iso2: string,
  next: string,
): string {
  return [
    CHOICE_ROUTE_PREFIX,
    locale,
    iso2.toLowerCase(),
    ...(next === "" ? [] : [next]),
  ].join("/");
}

/** Every chooser response's robots header: never indexed, its links never followed. */
export const CHOOSER_ROBOTS = "noindex, nofollow";

/** A literal for a path-to-regexp parameter group. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * `X-Robots-Tag: noindex, nofollow` on every chooser address, in every locale, and on a direct
 * request to the internal page route. After the environment-wide rule, so its value wins.
 */
export function chooserHeaderRules(): HeaderRule[] {
  const header = [{ key: NOINDEX_HEADER_NAME, value: CHOOSER_ROBOTS }];
  return [
    ...LOCALES.map((locale) => ({
      source: `/:locale(${literal(locale.code)})/:segment(${literal(
        locale.chooseSegment,
      )})/:path*`,
      headers: header,
    })),
    {
      source: `/:locale/${CHOOSER_ROUTE_SEGMENT}/:path*`,
      headers: header,
    },
  ];
}
