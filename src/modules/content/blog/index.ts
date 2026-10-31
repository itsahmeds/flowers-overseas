/**
 * The blog's database-free surface (spec 044 §5.2; TASK-321): the schemas, the markdown subset,
 * the rules, the link targets and the provider seam. The database provider and the commands are
 * imported from `./db/provider.ts` and `./db/commands.ts` directly, by server code only, so no
 * bundle that reads this barrel reaches the database (`pnpm check:no-db`).
 *
 * @spec 044
 */
export {
  type BlogBlock,
  type BlogInline,
  type BlogLinkTargets,
  type BlogMarkdownWarning,
  blogInlines,
  blogLinksOf,
  blogMarkdownBlocks,
  blogMarkdownWarnings,
  blogPlainText,
  resolveBlogLink,
} from "./markdown.ts";
export {
  BLOG_HARD_RULES,
  BLOG_SOFT_RULES,
  type BlogHardRule,
  type BlogRuleContext,
  type BlogRuleId,
  type BlogRuleInput,
  type BlogRuleResult,
  type BlogSoftRule,
  blogBodyRefs,
  blogRuleMessageKey,
  blogWordCount,
  hardFailures,
  validateBlogRevision,
} from "./rules/index.ts";
export {
  BLOG_INDEX_MAX,
  type BlogIndexEntry,
  type BlogPostRecord,
  type BlogProvider,
  blogContentLocale,
  blogRouteLocales,
  fixtureBlogProvider,
  recordsBlogProvider,
} from "./provider.ts";
export * from "./schemas.ts";
