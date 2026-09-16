/**
 * `robots.txt`, in its two environments (spec 007 §2 "Indexability, canonical, hreflang, robots",
 * §6, §12, AC-12 / T-13; `plan/02` §7, §10; supersedes spec 001 AC-15's blanket `Disallow: /`
 * **in the indexing environment only**; TASK-090).
 *
 * Two policies, one predicate:
 *
 *  - **Non-indexing** (everything until the §12 flip: local, CI, previews, and production on a
 *    `*.vercel.app` alias) — `Disallow: /`, byte-for-byte what spec 001 shipped, together with the
 *    environment-level `X-Robots-Tag: noindex` of `src/lib/robots-headers.ts`. Nothing is
 *    announced, so nothing can be indexed by accident while the site is being built.
 *  - **Indexing** (production on the canonical host) — `Allow: /` plus the `plan/02` §7 disallow
 *    list, and exactly one `Sitemap:` line pointing at `/sitemap.xml` (`plan/02` §10: "robots.txt
 *    lists only /sitemap.xml").
 *
 * ## What is disallowed, and what deliberately is not
 *
 * `DISALLOWED_PATHS` is the `plan/02` §7 row "Account, checkout, track, admin, vendor, api →
 * noindex header + robots disallow", plus `/search` (§7 "Search: noindex") and the `(dev)` group
 * of spec 004 AC-28. It is one exported array so the list is auditable and so adding a path is a
 * one-line change rather than a string edit.
 *
 * **Facets are not blocked**, and that is the point of the rule rather than an omission: a facet
 * URL (`?colour=red`) is `noindex,follow` **and must be crawled for that `noindex` to be seen**
 * (`plan/02` §7 "not blocked in robots so the noindex is seen"). Blocking it would leave Google
 * with a URL it may not fetch and may still index from links. The one `?`-parameter shape that is
 * blocked is `sort=`: `plan/02` §7 puts sort parameters in no indexable URL at all, so there is
 * nothing for a crawler to learn by fetching one, and an unbounded sort space is pure crawl waste.
 * UTM/`gclid`/`fbclid` are handled by the canonical (they are stripped from it), not here —
 * blocking them would block real landing traffic from being crawled.
 *
 * ## Known gap, recorded rather than guessed
 *
 * `/checkout/`, `/search` and `/track/` are **locale-prefixed** in `plan/02` §4.1
 * (`/en-gb/checkout/*`), and their localised segments do not exist yet (specs 008/010/013 own
 * them, `src/config/locales.data.ts` has no `checkout`/`search`/`track` key today). The unprefixed
 * forms of spec 007 §2 are what ships here; the locale-prefixed forms are added by the spec that
 * creates the segment, to this array. `/account/`, `/admin/`, `/vendor/` and `/api/` carry no
 * locale prefix (`plan/02` §4.1) and are complete as written.
 */
import type { MetadataRoute } from "next";

import { absoluteUrl } from "./canonical.ts";
import {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  isIndexingEnvironment,
} from "./environment.ts";

/** The one sitemap `robots.txt` names (`plan/02` §10; TASK-094 serves it). */
export const SITEMAP_PATH = "/sitemap.xml";

/**
 * The `plan/02` §7 disallow list. Order is the order the file prints; see the header for why
 * facet parameters are absent and `sort=` is present.
 */
export const DISALLOWED_PATHS: readonly string[] = [
  "/api/",
  "/admin/",
  "/vendor/",
  "/account/",
  "/checkout/",
  "/track/",
  "/search",
  "/dev/",
  "/*?*sort=",
];

/** A `robots.txt` policy, before it is printed or handed to Next's metadata route. */
export interface RobotsPolicy {
  /** `true` in the indexing environment: the site is open with an exclusion list. */
  readonly open: boolean;
  readonly userAgent: "*";
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
  /** Absolute sitemap URL, or `undefined` while the site is closed (nothing to announce). */
  readonly sitemap: string | undefined;
}

/** The policy for a deployment. The single decision `robotsTxt()` and the route both read. */
export function robotsPolicy(deployment: DeploymentDescriptor): RobotsPolicy {
  if (!isIndexingEnvironment(deployment)) {
    return {
      open: false,
      userAgent: "*",
      allow: [],
      disallow: ["/"],
      sitemap: undefined,
    };
  }
  return {
    open: true,
    userAgent: "*",
    allow: ["/"],
    disallow: DISALLOWED_PATHS,
    // The canonical host, not `deployment.siteUrl`: the gate has already established that the
    // two are the same site, and `https://www.flowersoverseas.com/...` would announce the form
    // that 301s to the apex (`plan/02` §7 "`www` → apex").
    sitemap: absoluteUrl(SITEMAP_PATH, {
      baseUrl: `https://${CANONICAL_HOST}`,
    }),
  };
}

/**
 * The exact body served at `/robots.txt`. T-13 asserts both strings byte for byte.
 *
 * The format is Next's — `User-Agent:` capitalised the way it capitalises it, one blank line
 * closing the rule block, `Sitemap:` last — because `src/app/robots.ts` hands the same policy to
 * Next's metadata route and *its* serialiser writes the file. A test pins the two against Next's
 * real `resolveRobots()`, so this string is what a crawler receives rather than a second opinion
 * about it, and a Next release that changed the format fails the suite instead of the site.
 */
export function robotsTxt(deployment: DeploymentDescriptor): string {
  const policy = robotsPolicy(deployment);
  const lines = [
    `User-Agent: ${policy.userAgent}`,
    ...policy.allow.map((path) => `Allow: ${path}`),
    ...policy.disallow.map((path) => `Disallow: ${path}`),
  ];
  const body = `${lines.join("\n")}\n\n`;
  return policy.sitemap === undefined
    ? body
    : `${body}Sitemap: ${policy.sitemap}\n`;
}

/**
 * The same policy in Next's `MetadataRoute.Robots` shape, for `src/app/robots.ts`. The closed
 * form is spec 001's object unchanged (`{ userAgent: "*", disallow: "/" }`), so the 001 assertion
 * keeps its meaning.
 */
export function robotsMetadataRoute(
  deployment: DeploymentDescriptor,
): MetadataRoute.Robots {
  const policy = robotsPolicy(deployment);
  if (!policy.open) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: policy.userAgent,
        allow: [...policy.allow],
        disallow: [...policy.disallow],
      },
    ],
    sitemap: policy.sitemap,
  };
}
