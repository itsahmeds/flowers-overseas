/**
 * The blog's composition root (spec 044 §5.2, §5.4, §6; spec 012b §2.2 "the swap is one
 * composition root per family"; TASK-322): which `BlogProvider` the public pages, the resolver,
 * the sitemap and the footer read, and the existence rule they share.
 *
 * **Source.** `BLOG_SOURCE=database` reads the published posts through `dbBlogProvider` (as
 * `app_build` while `next build` runs, as `app_web` afterwards, `src/lib/db.ts`); anything else
 * reads none, so the blog does not exist. Absent is none on purpose: until spec 012b's catalogue
 * cutover (TASK-294) no deployed build has a database to read, and a build that cannot read one
 * must produce a site with no blog rather than fail or invent posts. The cutover replaces the key
 * with the environment rule the catalogue follows.
 *
 * **Existence is "the database says so AND the build emitted it"** (spec 012b §2.3, spec 044 §2.5,
 * AC-8). While `next build` runs, the database answer is the build's own answer: what it reads is
 * what it emits. At run time every answer is also gated on the running build's manifest
 * (`./manifest.ts`), so a post first published after the build is a 404 **and** absent from the
 * index, the sitemap, the footer and every link until the next build, while an unpublished post
 * leaves all of them at once (the database half). The gate is asked first, so a build that emitted
 * no blog URL never queries the database for one.
 *
 * **Reads.** One query returns every published post (`readPublishedPosts`); every question is
 * answered from it. During the build the answer is kept for the process (each worker reads once);
 * at run time it is kept for one render (`react`'s `cache`).
 */
import { cache } from "react";

import { localePath } from "../../i18n/index.ts";

import { type BuildManifest, runningBuildManifest } from "./manifest.ts";
import {
  type BlogPostRecord,
  type BlogProvider,
  recordsBlogProvider,
} from "./provider.ts";

/** The key that selects the source (`.env.example`, `src/lib/env.schema.ts`). */
export const BLOG_SOURCE_KEY = "BLOG_SOURCE";

export type BlogSourceMode = "database" | "none";

type EnvSource = Readonly<Record<string, string | undefined>>;

/** `"database"` only for the exact value; anything else, absent included, is none. */
export function blogSourceMode(environment: EnvSource): BlogSourceMode {
  return environment[BLOG_SOURCE_KEY]?.trim() === "database"
    ? "database"
    : "none";
}

/** Next's `PHASE_PRODUCTION_BUILD`, the value of `NEXT_PHASE` while `next build` runs. */
const BUILD_PHASE = "phase-production-build";

function isBuildPhase(environment: EnvSource): boolean {
  return environment["NEXT_PHASE"] === BUILD_PHASE;
}

/** No post anywhere: the source when the blog reads none. */
export const NO_BLOG: BlogProvider = recordsBlogProvider([]);

/** The path of a blog index in a route locale (`/en/blog`). */
export function blogIndexPath(locale: string): string {
  return localePath(locale, "blog");
}

/** The path of a post in a route locale (`/en/blog/{slug}`). */
export function blogPostPath(locale: string, slug: string): string {
  return localePath(locale, "blog", slug);
}

/**
 * `inner` with every answer gated on `manifest` (database AND manifest). A post is visible in a
 * route locale only where its URL was emitted, and an index only where its URL was emitted and at
 * least one of its posts is visible. The manifest is asked before `inner`, so a build that emitted
 * no blog URL never reaches the database.
 */
export function manifestGated(
  inner: BlogProvider,
  manifest: BuildManifest,
): BlogProvider {
  const postEmitted = (locale: string, slug: string): boolean =>
    manifest.has(blogPostPath(locale, slug));
  const indexView = async (locale: string) =>
    manifest.has(blogIndexPath(locale))
      ? (await inner.blogIndexView(locale)).filter((entry) =>
          postEmitted(locale, entry.slug),
        )
      : [];
  return {
    blogPostView: async (locale, slug) =>
      postEmitted(locale, slug) ? inner.blogPostView(locale, slug) : undefined,
    blogIndexView: indexView,
    blogPostExists: async (locale, slug) =>
      postEmitted(locale, slug) && (await inner.blogPostExists(locale, slug)),
    blogIndexExists: async (locale) => (await indexView(locale)).length > 0,
    blogStaticParams: async () =>
      (await inner.blogStaticParams()).filter(({ locale, slug }) =>
        postEmitted(locale, slug),
      ),
    editorialSitemapEntries: async (locale) =>
      manifest.has(blogIndexPath(locale))
        ? (await inner.editorialSitemapEntries(locale)).filter((entry) =>
            postEmitted(locale, entry.slug),
          )
        : [],
    postPath: async (postId, locale) => {
      if (!manifest.has(blogIndexPath(locale))) return null;
      const path = await inner.postPath(postId, locale);
      return path !== null && manifest.has(path) ? path : null;
    },
  };
}

/** The published posts, read through the database provider's one query. */
async function readFromDatabase(): Promise<readonly BlogPostRecord[]> {
  const { readPublishedPosts } = await import("./db/provider.ts");
  return readPublishedPosts();
}

let buildRead: Promise<readonly BlogPostRecord[]> | undefined;

/** The build reads once per process: what it reads is what it emits. */
function buildRecords(): Promise<readonly BlogPostRecord[]> {
  buildRead ??= readFromDatabase();
  return buildRead;
}

/** At run time, once per render. */
const runtimeRecords = cache(readFromDatabase);

/** A provider whose every answer reads `load()` first. */
function loadingProvider(
  load: () => Promise<readonly BlogPostRecord[]>,
): BlogProvider {
  const provider = async (): Promise<BlogProvider> =>
    recordsBlogProvider(await load());
  return {
    blogPostView: async (locale, slug) =>
      (await provider()).blogPostView(locale, slug),
    blogIndexView: async (locale) => (await provider()).blogIndexView(locale),
    blogPostExists: async (locale, slug) =>
      (await provider()).blogPostExists(locale, slug),
    blogIndexExists: async (locale) =>
      (await provider()).blogIndexExists(locale),
    blogStaticParams: async () => (await provider()).blogStaticParams(),
    editorialSitemapEntries: async (locale) =>
      (await provider()).editorialSitemapEntries(locale),
    postPath: async (postId, locale) =>
      (await provider()).postPath(postId, locale),
  };
}

/** `manifestGated`, with the manifest read on the first question. */
function lazilyGated(
  inner: BlogProvider,
  manifest: () => Promise<BuildManifest>,
): BlogProvider {
  const gated = async (): Promise<BlogProvider> =>
    manifestGated(inner, await manifest());
  return {
    blogPostView: async (locale, slug) =>
      (await gated()).blogPostView(locale, slug),
    blogIndexView: async (locale) => (await gated()).blogIndexView(locale),
    blogPostExists: async (locale, slug) =>
      (await gated()).blogPostExists(locale, slug),
    blogIndexExists: async (locale) => (await gated()).blogIndexExists(locale),
    blogStaticParams: async () => (await gated()).blogStaticParams(),
    editorialSitemapEntries: async (locale) =>
      (await gated()).editorialSitemapEntries(locale),
    postPath: async (postId, locale) =>
      (await gated()).postPath(postId, locale),
  };
}

/** What `blogSource()` is built from; tests pass their own. */
export interface BlogSourceDeps {
  readonly environment: EnvSource;
  readonly manifest: () => Promise<BuildManifest>;
  readonly buildRecords: () => Promise<readonly BlogPostRecord[]>;
  readonly runtimeRecords: () => Promise<readonly BlogPostRecord[]>;
}

/** The source for an environment (pure over `deps`). */
export function blogSourceFor(deps: BlogSourceDeps): BlogProvider {
  if (blogSourceMode(deps.environment) !== "database") return NO_BLOG;
  if (isBuildPhase(deps.environment)) {
    return loadingProvider(deps.buildRecords);
  }
  // `next dev` renders every path on request and writes no manifest of its own: nothing to gate.
  if (deps.environment["NODE_ENV"] === "development") {
    return loadingProvider(deps.runtimeRecords);
  }
  return lazilyGated(loadingProvider(deps.runtimeRecords), deps.manifest);
}

/** The provider every public reader uses: chosen by the environment, never by a caller. */
export function blogSource(): BlogProvider {
  return blogSourceFor({
    environment: process.env,
    manifest: () => runningBuildManifest(),
    buildRecords,
    runtimeRecords,
  });
}

/** `blogIndexExists(locale)` of the one source (the footer link's and the resolver's answer). */
export function blogIndexExists(locale: string): Promise<boolean> {
  return blogSource().blogIndexExists(locale);
}

/** `blogPostExists(locale, slug)` of the one source. */
export function blogPostExists(locale: string, slug: string): Promise<boolean> {
  return blogSource().blogPostExists(locale, slug);
}

/**
 * The index's path in every route locale where it exists (its hreflang cluster and the language
 * links, §6): `en` and `en-gb` in slice A, never `de` or `pl`.
 */
export async function blogIndexAlternatePaths(
  locales: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const source = blogSource();
  const paths: Record<string, string> = {};
  for (const locale of locales) {
    if (await source.blogIndexExists(locale)) {
      paths[locale] = blogIndexPath(locale);
    }
  }
  return paths;
}

/**
 * A post's path in every route locale it is served at (§2.2: an `en` post at `/en` and `/en-gb`),
 * restricted to the locales where it exists now (§6 "restricted to the locales where the post
 * exists").
 */
export async function blogPostAlternatePaths(
  locales: readonly string[],
  slug: string,
): Promise<Readonly<Record<string, string>>> {
  const source = blogSource();
  const paths: Record<string, string> = {};
  for (const locale of locales) {
    if (await source.blogPostExists(locale, slug)) {
      paths[locale] = blogPostPath(locale, slug);
    }
  }
  return paths;
}
