/**
 * The canonical URL builder (spec 007 §2, §6 "Canonical", AC-10 / T-11; `plan/02` §7, §8;
 * TASK-090).
 *
 * `plan/02` §7: "Every indexable page self-canonical to its lowercase, trailing-slash-free,
 * parameter-free URL. Never cross-locale canonicals." Four properties, one function, so a page
 * cannot get three of them right.
 *
 *  - **Absolute.** A relative canonical is legal HTML and a bad idea: it re-resolves against the
 *    document URL, so a parameterised or trailing-slash request would canonicalise to itself. The
 *    origin comes from the caller (`NEXT_PUBLIC_SITE_URL` at the call site) for the same purity
 *    reason `alternatesFor()` takes a `baseUrl`, so the builder is testable without an env.
 *  - **Lowercase, trailing-slash-free, parameter-free.** The input is normalised rather than
 *    trusted: `/EN/Send-Flowers-To/Poland/?utm_source=x#faq` and `/en/send-flowers-to/poland` are
 *    the same page and must produce the same string, because the canonical is also what the
 *    sitemap and the hreflang cluster print (`plan/02` §8 "so they cannot disagree"). UTM, `gclid`
 *    and `fbclid` are stripped by construction: **every** query is (`plan/02` §7).
 *  - **Self-referencing, never cross-locale.** `canonicalFor()` takes the locale the page is being
 *    rendered in and **throws** when the path does not begin with that locale segment. A
 *    cross-locale canonical is the one hreflang mistake that de-indexes a whole cluster, and
 *    `alternatesFor()` is structurally incapable of expressing it (spec 003 §6); this is the
 *    equivalent guarantee for the canonical, enforced rather than commented. The throw is a build
 *    failure in a prerendered route, which is where a wrong canonical should be caught.
 *
 * `noindex` does **not** change the answer: spec 007 AC-10 requires a `noindex` page to emit its
 * canonical unchanged (a canonical tells Google which URL of a duplicate set is the original; a
 * `noindex` page still has duplicates, and removing the canonical would let a parameterised copy
 * become the chosen one). That reconciles with spec 004 AC-16 — which says the pages of *that*
 * spec emit no canonical because spec 007 owns the tag, not because a `noindex` page must not have
 * one; see the amendment recorded on this task's brief.
 *
 * The origin is not required to be `https`, unlike `alternatesFor()`: the corridor pages render on
 * `http://localhost:3000` in development and in every unit test, and a canonical on a
 * non-indexing deployment is inert (`isIndexingEnvironment()` is false there, so the page is
 * `noindex` and absent from every sitemap). What the builder does refuse is a base URL that is not
 * a URL at all.
 */

/** The origin of `baseUrl`, without a trailing slash: `https://flowersoverseas.com`. */
export function siteOrigin(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError(
      `canonical URLs need an absolute base URL; got \`${baseUrl}\``,
    );
  }
  return url.origin;
}

export interface CanonicalOptions {
  /** Absolute site origin, e.g. `https://flowersoverseas.com` (`NEXT_PUBLIC_SITE_URL`). */
  readonly baseUrl: string;
}

/**
 * The canonical **path** of a request path: lowercase, no query, no fragment, no trailing slash,
 * no repeated slash. `/` stays `/` — the root is the one path whose slash is not trailing.
 */
export function canonicalPath(path: string): string {
  const withoutFragment = path.split("#")[0] ?? "";
  const withoutQuery = withoutFragment.split("?")[0] ?? "";
  const collapsed = `/${withoutQuery}`.replace(/\/+/g, "/").toLowerCase();
  const trimmed = collapsed.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** `origin` + a canonical path. The `absoluteUrl()` spec 007 §6 names. */
export function absoluteUrl(
  path: string,
  { baseUrl }: CanonicalOptions,
): string {
  return `${siteOrigin(baseUrl)}${canonicalPath(path)}`;
}

/** The first path segment of a canonical path, or `""` for the root. */
function localeSegment(path: string): string {
  return canonicalPath(path).split("/")[1] ?? "";
}

/**
 * The self-referencing canonical URL of `path`, asserted to belong to `locale`.
 *
 * @throws TypeError when `path` is not inside `/{locale}` — the cross-locale canonical of
 * `plan/02` §7, refused at the point it would be built.
 */
export function canonicalFor(
  locale: string,
  path: string,
  options: CanonicalOptions,
): string {
  const expected = locale.toLowerCase();
  const actual = localeSegment(path);
  if (actual !== expected) {
    throw new TypeError(
      `cross-locale canonical refused: \`${path}\` is not inside \`/${expected}\` (plan/02 §7)`,
    );
  }
  return absoluteUrl(path, options);
}
