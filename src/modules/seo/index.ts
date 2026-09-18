/** Public barrel for `seo` (hreflang, canonical, JSON-LD builders, sitemap generators, robots). Owned by: spec 007. */

/**
 * @purpose Indexability rule engine, canonical builder, robots policy, page metadata (spec 007)
 *
 * The only import path for the `seo` module (spec 007 §2, `plan/01` §5; TASK-090).
 *
 * Functions, types and the two constants a caller genuinely needs to *print* (`SITEMAP_PATH`,
 * `CANONICAL_HOST`) — no provider instance, no setter and no mutable registry, for spec 003 AC-3's
 * reason: a caller able to reach one could move the indexability answer at runtime, and the answer
 * is what decides whether a URL is announced to Google.
 *
 * `PAGE_TYPE_POLICY` and `DISALLOWED_PATHS` are exported because they are the *auditable lists*
 * this spec's tests read (a page type that never states its policy, a facet URL that must stay
 * crawlable), and both are frozen-by-convention `readonly` data with no way back into the engine.
 */
export {
  CANONICAL_HOST,
  type DeploymentDescriptor,
  deploymentDescriptor,
  isIndexingEnvironment,
} from "./environment.ts";

export {
  INDEXABILITY_TERMS,
  INDEX_FOLLOW,
  NOINDEX_FOLLOW,
  OPTIONAL_INDEXABILITY_TERMS,
  PAGE_TYPE_POLICY,
  type IndexabilityTerm,
  type IndexabilityTerms,
  type IndexabilityVerdict,
  type OptionalIndexabilityTerm,
  type PageDescriptor,
  type RobotsDirective,
  type SeoPageType,
  indexability,
  indexabilityVerdict,
  pageIndexability,
} from "./indexability.ts";

export {
  type CanonicalOptions,
  absoluteUrl,
  canonicalFor,
  canonicalPath,
  siteOrigin,
} from "./canonical.ts";

export {
  DISALLOWED_PATHS,
  SITEMAP_PATH,
  type RobotsPolicy,
  robotsMetadataRoute,
  robotsPolicy,
  robotsTxt,
} from "./robots.ts";

// The sitemap tree (spec 007 §2 "Sitemaps", AC-13 / AC-14; TASK-094). Functions, the two caps
// and the child list only: membership is `pageIndexability()`'s verdict, and nothing exported
// here lets a caller add a URL the engine did not announce.
export {
  SITEMAP_CHILDREN,
  SITEMAP_INDEX_PATH,
  SITEMAP_LOCALE_INDEX,
  type SitemapChild,
  type SitemapParams,
  SitemapParamsSchema,
  isSitemapChild,
  localeSitemapChildren,
  localeSitemapDocument,
  localeSitemapIndexPath,
  sitemapChildDocument,
  sitemapChildEntries,
  sitemapChildPath,
  sitemapDocumentFor,
  sitemapIndexDocument,
  sitemapIndexEntries,
  sitemapLocales,
  sitemapNameOf,
} from "./sitemap/index.ts";

export {
  SITEMAP_BYTE_CAP,
  SITEMAP_CACHE_CONTROL,
  SITEMAP_CONTENT_TYPE,
  SITEMAP_URL_CAP,
  type SitemapAlternate,
  SitemapAlternateSchema,
  type SitemapEntry,
  SitemapEntrySchema,
  type SitemapIndexEntry,
  SitemapIndexEntrySchema,
  type LastmodSources,
  escapeXml,
  lastmodOf,
  sitemapIndexXml,
  urlSetXml,
} from "./sitemap/xml.ts";

export { corridorSitemapEntries } from "./sitemap/corridors.ts";

export {
  STATIC_SITEMAP_PAGE_TYPES,
  staticSitemapEntries,
} from "./sitemap/statics.ts";

export {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  type PageMetadataInput,
  hreflangLanguages,
  pageMetadata,
  robotsMeta,
} from "./metadata.ts";
