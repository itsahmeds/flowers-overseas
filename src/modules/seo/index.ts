/** Public barrel for `seo` (hreflang, canonical, JSON-LD builders, sitemap generators, robots). Owned by: spec 007. */

/**
 * @purpose Indexability rule engine, canonical builder, robots policy, page metadata, JSON-LD builders (spec 007)
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

export {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  type PageMetadataInput,
  hreflangLanguages,
  pageMetadata,
  robotsMeta,
} from "./metadata.ts";

/**
 * The JSON-LD builders and the element that serialises them (spec 007 §5.2 L65, AC-15, AC-16;
 * TASK-093). Each builder is a projection of a view model: it fetches nothing, decides nothing
 * about indexability, and returns `undefined` when the page has nothing honest to announce.
 */
export {
  JsonLd,
  SCHEMA_CONTEXT,
  type JsonLdNode,
  type JsonLdProps,
  jsonLdDocument,
  jsonLdScript,
  schemaOptions,
} from "./schema/JsonLd.tsx";

export {
  BREADCRUMB_MIN_ITEMS,
  type BreadcrumbCrumb,
  type BreadcrumbLabel,
  breadcrumbList,
} from "./schema/breadcrumbList.ts";

export {
  FAQ_MAX_ITEMS,
  FAQ_MIN_ITEMS,
  type FaqEntry,
  faqPage,
} from "./schema/faqPage.ts";

export {
  ORGANIZATION_LOGO_PATH,
  type OrganizationOptions,
  organization,
} from "./schema/organization.ts";

export { webSite } from "./schema/webSite.ts";
