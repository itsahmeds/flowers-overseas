/**
 * The blog's commands (spec 044 §2.3 to §2.6, §5.2; AC-3, AC-5, AC-17; TASK-321).
 *
 * Each command parses its input (`../schemas.ts`), runs in **one** admin transaction
 * (`withAdminContext`, so every row it writes is an `audit_log` row through `0016`'s trigger) and
 * returns `{ result, tags }`: what happened, and the cache tags to purge (spec 012b §5.2's rule;
 * §5.4's table). A refusal writes nothing.
 *
 *  - `createPost`, `saveRevision` and `setTags` write drafts. The hard rules
 *    (`validateBlogRevision`) refuse a save; the soft ones are returned as warnings.
 *  - `approveRevision` runs the rules again and then calls `attest()` (spec 012b), the only
 *    writer of an approval, which freezes the revision in the same transaction (migration `0024`).
 *  - `publishPost` and `publishChanges` are the only code that moves `published_revision_id`
 *    (`fo/no-direct-review-write`); each runs the rules a third time, so a reference whose target
 *    vanished after the approval is refused here (AC-5), and `blog_publish_guard()` refuses a
 *    revision with no approval for its current hash (AC-3). Requesting spec 012b's publish run for
 *    a first publish is the admin action's (TASK-323, AC-15); `publishPost` reports whether one
 *    is due.
 *  - `unpublishPost` (reason and typed slug), `withdrawAuthor` (one transaction: the author, then
 *    every published post still theirs, each with the reason "author withdrawn"; AC-17) and
 *    `reassignAuthor` (opens a new draft, which needs its own approval; AC-17).
 *  - `createAuthor` and `confirmOwnName` (§2.2: only the person named confirms their own name).
 *
 * The permission each action needs (`blog.edit`, `blog.publish`, `blog.unpublish`,
 * `blog.authors`) is checked by the admin action before it calls a command (spec 012's
 * `requirePermission`; TASK-323).
 */
import { type SQL, sql } from "drizzle-orm";

import type { AttestInput, AttestOutcome } from "@/modules/i18n";

import { blogRuleContextFor, siteBlogLinkTargets } from "../links.ts";
import type { BlogLinkTargets } from "../markdown.ts";
import {
  type BlogRuleContext,
  type BlogRuleResult,
  hardFailures,
  validateBlogRevision,
} from "../rules/index.ts";
import {
  BLOG_AUTHOR_WITHDRAWN_REASON,
  BlogApproveSchema,
  type BlogApproveInput,
  BlogAuthorConfirmNameSchema,
  type BlogAuthorConfirmNameInput,
  BlogAuthorCreateSchema,
  type BlogAuthorCreateInput,
  BlogAuthorReassignSchema,
  type BlogAuthorReassignInput,
  BlogAuthorWithdrawSchema,
  type BlogAuthorWithdrawInput,
  BlogPostCreateSchema,
  type BlogPostCreateInput,
  BlogPublishChangesSchema,
  type BlogPublishChangesInput,
  BlogPublishSchema,
  type BlogPublishInput,
  BlogRevisionSaveSchema,
  type BlogRevisionSaveInput,
  type BlogRevisionFields,
  BlogTagsSchema,
  type BlogTagsInput,
  BlogUnpublishSchema,
  type BlogUnpublishInput,
} from "../schemas.ts";
import { dbBlogProvider } from "./provider.ts";

/** What the commands run their statements through: a Drizzle transaction, or any SQL runner. */
export interface LedgerExecutor {
  execute(query: SQL): Promise<unknown>;
}

/** Why a command wrote nothing. */
export type BlogRefusal =
  | "rules"
  | "unknown_post"
  | "unknown_revision"
  | "unknown_author"
  | "unknown_tag"
  | "author_withdrawn"
  | "conflict"
  | "slug_locked"
  | "slug_taken"
  | "not_published"
  | "already_published"
  | "not_approved"
  | "typed_slug_mismatch"
  | "not_own_name"
  | "not_admin";

export type BlogOutcome<T> =
  | ({ readonly ok: true } & T)
  | {
      readonly ok: false;
      readonly refusal: BlogRefusal;
      /** The hard rule results, for `rules`. */
      readonly results?: readonly BlogRuleResult[];
    };

/** Every command's return: what happened and the cache tags to purge (§5.4). */
export interface BlogCommandResult<T> {
  readonly result: BlogOutcome<T>;
  readonly tags: readonly string[];
}

/** What the commands need from the application; tests replace any of it. */
export interface BlogDeps {
  /** One admin transaction (default: `withAdminContext`). */
  readonly runAdmin: <T>(
    context: {
      readonly userId: string;
      readonly action: string;
      readonly reason?: string;
      readonly requestId?: string;
    },
    fn: (db: LedgerExecutor) => Promise<T>,
  ) => Promise<T>;
  /** Where references resolve (default: the site's predicates, posts from `dbBlogProvider`). */
  readonly targets: BlogLinkTargets;
  /** A tagged country's corridor guide text in a locale (default: spec 007's content). */
  readonly guideText?: (iso2: string, locale: string) => string | undefined;
  /** Spec 012b's `attest()` (default: the `src/modules/i18n` barrel's). */
  readonly attest: (input: AttestInput) => Promise<AttestOutcome>;
  /** One `info` line per event, ids only (§11). */
  readonly log: (event: string, fields: Readonly<Record<string, unknown>>) => void;
}

async function defaultDeps(): Promise<BlogDeps> {
  const [{ withAdminContext }, { attest }, { logger }] = await Promise.all([
    import("@/lib/db"),
    import("@/modules/i18n"),
    import("@/lib/logger"),
  ]);
  const provider = dbBlogProvider();
  return {
    runAdmin: (context, fn) =>
      withAdminContext(
        {
          userId: context.userId,
          action: context.action,
          ...(context.reason === undefined ? {} : { reason: context.reason }),
          ...(context.requestId === undefined
            ? {}
            : { requestId: context.requestId }),
        },
        (db) => fn(db),
      ),
    targets: siteBlogLinkTargets((postId, locale) =>
      provider.postPath(postId, locale),
    ),
    attest: (input) => attest(input),
    log: (event, fields) => {
      logger.info(fields, event);
    },
  };
}

async function depsWith(overrides: Partial<BlogDeps>): Promise<BlogDeps> {
  if (
    overrides.runAdmin !== undefined &&
    overrides.targets !== undefined &&
    overrides.attest !== undefined &&
    overrides.log !== undefined
  ) {
    return overrides as BlogDeps;
  }
  return { ...(await defaultDeps()), ...overrides };
}

async function rows<T>(db: LedgerExecutor, query: SQL): Promise<T[]> {
  return Array.from((await db.execute(query)) as Iterable<T>);
}

/** A refusal that rolls the admin transaction back: nothing it wrote survives. */
class Refused extends Error {
  readonly refusal: BlogRefusal;
  readonly results: readonly BlogRuleResult[] | undefined;
  constructor(refusal: BlogRefusal, results?: readonly BlogRuleResult[]) {
    super(refusal);
    this.refusal = refusal;
    this.results = results;
  }
}

async function refusable<T>(
  run: () => Promise<BlogCommandResult<T>>,
): Promise<BlogCommandResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Refused) {
      return {
        result: {
          ok: false,
          refusal: error.refusal,
          ...(error.results === undefined ? {} : { results: error.results }),
        },
        tags: [],
      };
    }
    throw error;
  }
}

const ISO = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);

/* -------------------------------------------------------------------------- */
/* Reads inside a command.                                                     */
/* -------------------------------------------------------------------------- */

interface PostRow {
  id: string;
  locale_code: string;
  slug: string;
  author_id: string;
  status: "draft" | "published" | "unpublished";
  published_revision_id: string | null;
  first_published_at: string | null;
  countries: string[];
}

async function postIn(db: LedgerExecutor, postId: string): Promise<PostRow> {
  const [post] = await rows<PostRow>(
    db,
    sql`SELECT p.id, p.locale_code, p.slug, p.author_id, p.status, p.published_revision_id,
               p.first_published_at,
               coalesce((SELECT array_agg(c.iso2 ORDER BY pc.sort)
                           FROM public.blog_post_country pc
                           JOIN public.country c ON c.id = pc.country_id
                          WHERE pc.post_id = p.id), '{}') AS countries
          FROM public.blog_post p WHERE p.id = ${postId}::uuid
          FOR UPDATE OF p`,
  );
  if (post === undefined) throw new Refused("unknown_post");
  return post;
}

interface RevisionRow {
  id: string;
  post_id: string;
  title: string;
  excerpt: string;
  seo_title: string;
  seo_description: string;
  body_md: string;
  cover_media_id: string | null;
  cover_alt: string | null;
  honesty_allow: BlogRevisionFields["honestyAllow"];
  frozen_at: string | null;
  updated_at: string;
}

async function revisionIn(
  db: LedgerExecutor,
  revisionId: string,
): Promise<RevisionRow> {
  const [revision] = await rows<RevisionRow>(
    db,
    sql`SELECT id, post_id, title, excerpt, seo_title, seo_description, body_md,
               cover_media_id, cover_alt, honesty_allow,
               to_char(frozen_at AT TIME ZONE 'UTC', ${ISO}) AS frozen_at,
               to_char(updated_at AT TIME ZONE 'UTC', ${ISO}) AS updated_at
          FROM public.blog_post_revision WHERE id = ${revisionId}::uuid`,
  );
  if (revision === undefined) throw new Refused("unknown_revision");
  return revision;
}

function fieldsOf(revision: RevisionRow): BlogRevisionFields {
  return {
    title: revision.title,
    excerpt: revision.excerpt,
    seoTitle: revision.seo_title,
    seoDescription: revision.seo_description,
    bodyMd: revision.body_md,
    coverMediaId: revision.cover_media_id,
    coverAlt: revision.cover_alt,
    honestyAllow: revision.honesty_allow,
  };
}

/** The latest revision body of every other post in the locale (rule 3). */
async function otherPostsIn(
  db: LedgerExecutor,
  locale: string,
  postId: string | null,
): Promise<BlogRuleContext["otherPosts"]> {
  const found = await rows<{ post_id: string; body_md: string }>(
    db,
    sql`SELECT DISTINCT ON (r.post_id) r.post_id, r.body_md
          FROM public.blog_post_revision r
          JOIN public.blog_post p ON p.id = r.post_id
         WHERE p.locale_code = ${locale}
           AND (${postId}::uuid IS NULL OR p.id <> ${postId}::uuid)
         ORDER BY r.post_id, r.created_at DESC, r.id DESC`,
  );
  return found.map((row) => ({ postId: row.post_id, bodyMd: row.body_md }));
}

/** The rules over one revision of one post, with the site and the locale's other posts. */
async function rulesFor(
  db: LedgerExecutor,
  deps: BlogDeps,
  post: {
    readonly id: string | null;
    readonly locale: string;
    readonly slug: string;
    readonly countries: readonly string[];
  },
  revision: BlogRevisionFields,
): Promise<readonly BlogRuleResult[]> {
  const context = await blogRuleContextFor(
    { locale: post.locale, countries: post.countries, bodyMd: revision.bodyMd },
    deps.targets,
    await otherPostsIn(db, post.locale, post.id),
    deps.guideText,
  );
  return validateBlogRevision(
    {
      locale: post.locale,
      slug: post.slug,
      countries: post.countries,
      revision,
    },
    context,
  );
}

function refuseOnHard(results: readonly BlogRuleResult[]): void {
  const hard = hardFailures(results);
  if (hard.length > 0) throw new Refused("rules", hard);
}

async function writeTags(
  db: LedgerExecutor,
  postId: string,
  countries: readonly string[],
  occasions: readonly string[],
): Promise<void> {
  const countryIds = await rows<{ id: string; iso2: string }>(
    db,
    sql`SELECT id, iso2 FROM public.country WHERE iso2 = ANY(${[...countries]}::text[])`,
  );
  const occasionIds = await rows<{ id: string; key: string }>(
    db,
    sql`SELECT id, key FROM public.occasion WHERE key = ANY(${[...occasions]}::text[])`,
  );
  if (
    countryIds.length !== new Set(countries).size ||
    occasionIds.length !== new Set(occasions).size ||
    new Set(countries).size !== countries.length ||
    new Set(occasions).size !== occasions.length
  ) {
    throw new Refused("unknown_tag");
  }
  await db.execute(
    sql`DELETE FROM public.blog_post_country WHERE post_id = ${postId}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM public.blog_post_occasion WHERE post_id = ${postId}::uuid`,
  );
  for (const [sort, iso2] of countries.entries()) {
    const id = countryIds.find((row) => row.iso2 === iso2)?.id;
    await db.execute(
      sql`INSERT INTO public.blog_post_country (post_id, country_id, sort)
          VALUES (${postId}::uuid, ${id}::uuid, ${sort})`,
    );
  }
  for (const row of occasionIds) {
    await db.execute(
      sql`INSERT INTO public.blog_post_occasion (post_id, occasion_id)
          VALUES (${postId}::uuid, ${row.id}::uuid)`,
    );
  }
}

async function insertRevision(
  db: LedgerExecutor,
  postId: string,
  userId: string,
  fields: BlogRevisionFields,
): Promise<{ id: string; value_hash: string; updated_at: string }> {
  const [row] = await rows<{ id: string; value_hash: string; updated_at: string }>(
    db,
    sql`INSERT INTO public.blog_post_revision (
          post_id, title, excerpt, seo_title, seo_description, body_md, cover_media_id,
          cover_alt, honesty_allow, created_by)
        VALUES (${postId}::uuid, ${fields.title}, ${fields.excerpt}, ${fields.seoTitle},
          ${fields.seoDescription}, ${fields.bodyMd}, ${fields.coverMediaId}::uuid,
          ${fields.coverAlt}::text, ${JSON.stringify(fields.honestyAllow)}::jsonb,
          ${userId}::uuid)
        RETURNING id, value_hash, to_char(updated_at AT TIME ZONE 'UTC', ${ISO}) AS updated_at`,
  );
  if (row === undefined) throw new Error("blog: the revision insert returned no row");
  return row;
}

function softOf(results: readonly BlogRuleResult[]): readonly BlogRuleResult[] {
  return results.filter((result) => result.severity === "soft");
}

const liveTags = (postId: string, locale: string): readonly string[] => [
  `blog:post:${postId}`,
  `blog:${locale}`,
  "sitemap",
];

/* -------------------------------------------------------------------------- */
/* Drafts.                                                                     */
/* -------------------------------------------------------------------------- */

export async function createPost(
  input: BlogPostCreateInput,
  overrides: Partial<BlogDeps> = {},
): Promise<
  BlogCommandResult<{
    readonly postId: string;
    readonly revisionId: string;
    readonly valueHash: string;
    readonly warnings: readonly BlogRuleResult[];
  }>
> {
  const parsed = BlogPostCreateSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      {
        userId: parsed.userId,
        action: "blog.post.created",
        ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }),
      },
      async (db) => {
        const [author] = await rows<{ withdrawn_at: string | null }>(
          db,
          sql`SELECT withdrawn_at FROM public.blog_author WHERE id = ${parsed.authorId}::uuid`,
        );
        if (author === undefined) throw new Refused("unknown_author");
        if (author.withdrawn_at !== null) throw new Refused("author_withdrawn");
        const results = await rulesFor(
          db,
          deps,
          {
            id: null,
            locale: parsed.locale,
            slug: parsed.slug,
            countries: parsed.countries,
          },
          parsed.revision,
        );
        refuseOnHard(results);
        const [taken] = await rows<{ id: string }>(
          db,
          sql`SELECT id FROM public.blog_post
              WHERE locale_code = ${parsed.locale} AND slug = ${parsed.slug}`,
        );
        if (taken !== undefined) throw new Refused("slug_taken");
        const [post] = await rows<{ id: string }>(
          db,
          sql`INSERT INTO public.blog_post (locale_code, slug, author_id)
              VALUES (${parsed.locale}, ${parsed.slug}, ${parsed.authorId}::uuid)
              RETURNING id`,
        );
        if (post === undefined) throw new Error("blog: the post insert returned no row");
        await writeTags(db, post.id, parsed.countries, parsed.occasions);
        const revision = await insertRevision(
          db,
          post.id,
          parsed.userId,
          parsed.revision,
        );
        deps.log("blog.revision.saved", {
          post_id: post.id,
          revision_id: revision.id,
          warned: softOf(results).map((result) => result.id),
        });
        return {
          result: {
            ok: true as const,
            postId: post.id,
            revisionId: revision.id,
            valueHash: revision.value_hash,
            warnings: softOf(results),
          },
          tags: [],
        };
      },
    ),
  );
}

export async function saveRevision(
  input: BlogRevisionSaveInput,
  overrides: Partial<BlogDeps> = {},
): Promise<
  BlogCommandResult<{
    readonly revisionId: string;
    readonly valueHash: string;
    readonly updatedAt: string;
    readonly warnings: readonly BlogRuleResult[];
  }>
> {
  const parsed = BlogRevisionSaveSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      {
        userId: parsed.userId,
        action: "blog.revision.saved",
        ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }),
      },
      async (db) => {
        const post = await postIn(db, parsed.postId);
        if (post.slug !== parsed.slug && post.first_published_at !== null) {
          throw new Refused("slug_locked");
        }
        const results = await rulesFor(
          db,
          deps,
          {
            id: post.id,
            locale: post.locale_code,
            slug: parsed.slug,
            countries: post.countries,
          },
          parsed.revision,
        );
        refuseOnHard(results);
        const [draft] = await rows<{ id: string; updated_at: string }>(
          db,
          sql`SELECT id, to_char(updated_at AT TIME ZONE 'UTC', ${ISO}) AS updated_at
                FROM public.blog_post_revision
               WHERE post_id = ${post.id}::uuid AND frozen_at IS NULL
               FOR UPDATE`,
        );
        // Spec 012's concurrency rule: a save against a newer row changes nothing.
        const expected =
          parsed.expectedUpdatedAt === null
            ? null
            : new Date(parsed.expectedUpdatedAt).getTime();
        const current =
          draft === undefined ? null : new Date(draft.updated_at).getTime();
        if (expected !== current) throw new Refused("conflict");
        if (post.slug !== parsed.slug) {
          const [taken] = await rows<{ id: string }>(
            db,
            sql`SELECT id FROM public.blog_post
                WHERE locale_code = ${post.locale_code} AND slug = ${parsed.slug}
                  AND id <> ${post.id}::uuid`,
          );
          if (taken !== undefined) throw new Refused("slug_taken");
          await db.execute(
            sql`UPDATE public.blog_post SET slug = ${parsed.slug} WHERE id = ${post.id}::uuid`,
          );
        }
        const fields = parsed.revision;
        let saved: { id: string; value_hash: string; updated_at: string };
        if (draft === undefined) {
          saved = await insertRevision(db, post.id, parsed.userId, fields);
        } else {
          const [row] = await rows<{
            id: string;
            value_hash: string;
            updated_at: string;
          }>(
            db,
            sql`UPDATE public.blog_post_revision
                   SET title = ${fields.title}, excerpt = ${fields.excerpt},
                       seo_title = ${fields.seoTitle},
                       seo_description = ${fields.seoDescription},
                       body_md = ${fields.bodyMd},
                       cover_media_id = ${fields.coverMediaId}::uuid,
                       cover_alt = ${fields.coverAlt}::text,
                       honesty_allow = ${JSON.stringify(fields.honestyAllow)}::jsonb,
                       updated_at = clock_timestamp()
                 WHERE id = ${draft.id}::uuid
                RETURNING id, value_hash,
                          to_char(updated_at AT TIME ZONE 'UTC', ${ISO}) AS updated_at`,
          );
          if (row === undefined) throw new Refused("conflict");
          saved = row;
        }
        deps.log("blog.revision.saved", {
          post_id: post.id,
          revision_id: saved.id,
          warned: softOf(results).map((result) => result.id),
        });
        return {
          result: {
            ok: true as const,
            revisionId: saved.id,
            valueHash: saved.value_hash,
            updatedAt: saved.updated_at,
            warnings: softOf(results),
          },
          tags: [],
        };
      },
    ),
  );
}

export async function setTags(
  input: BlogTagsInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<Record<never, never>>> {
  const parsed = BlogTagsSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.post.tagged" },
      async (db) => {
        const post = await postIn(db, parsed.postId);
        if (parsed.countries.length === 0) {
          throw new Refused("rules", [
            {
              id: "blog/country-tag",
              severity: "hard",
              field: "countries",
              params: {},
            },
          ]);
        }
        await writeTags(db, post.id, parsed.countries, parsed.occasions);
        return {
          result: { ok: true as const },
          tags: post.status === "published" ? [`blog:post:${post.id}`] : [],
        };
      },
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Approval and publishing.                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The rules again, then spec 012b's `attest()` (the only writer of an approval), which freezes
 * the revision. The reviewer's grant, display name and the hash's freshness are `attest()`'s
 * refusals (AC-4), returned as they are.
 */
export async function approveRevision(
  input: BlogApproveInput,
  overrides: Partial<BlogDeps> = {},
): Promise<
  BlogCommandResult<{ readonly attestation: AttestOutcome }>
> {
  const parsed = BlogApproveSchema.parse(input);
  const deps = await depsWith(overrides);
  const checked = await refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.revision.checked" },
      async (db) => {
        const revision = await revisionIn(db, parsed.revisionId);
        const post = await postIn(db, revision.post_id);
        const results = await rulesFor(
          db,
          deps,
          {
            id: post.id,
            locale: post.locale_code,
            slug: post.slug,
            countries: post.countries,
          },
          fieldsOf(revision),
        );
        refuseOnHard(results);
        return {
          result: { ok: true as const, locale: post.locale_code },
          tags: [] as readonly string[],
        };
      },
    ),
  );
  if (!checked.result.ok) return { result: checked.result, tags: [] };
  const attestation = await deps.attest({
    userId: parsed.userId,
    subject: {
      kind: "blog_post_revision",
      ref: parsed.revisionId,
      locale: checked.result.locale,
    },
    decision: "approved",
    valueHash: parsed.valueHash,
    ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }),
  });
  if (!attestation.ok) {
    return { result: { ok: false, refusal: "not_approved" }, tags: [] };
  }
  return { result: { ok: true, attestation }, tags: [] };
}

/** Moves the pointer, after the rules once more; the database refuses an unapproved revision. */
async function movePointer(
  db: LedgerExecutor,
  deps: BlogDeps,
  post: PostRow,
  revisionId: string,
): Promise<void> {
  const revision = await revisionIn(db, revisionId);
  if (revision.post_id !== post.id) throw new Refused("unknown_revision");
  if (revision.frozen_at === null) throw new Refused("not_approved");
  const results = await rulesFor(
    db,
    deps,
    {
      id: post.id,
      locale: post.locale_code,
      slug: post.slug,
      countries: post.countries,
    },
    fieldsOf(revision),
  );
  refuseOnHard(results);
}

/** Publish post (§2.5): a first publish, or a republish after an unpublish. */
export async function publishPost(
  input: BlogPublishInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<{ readonly firstPublish: boolean }>> {
  const parsed = BlogPublishSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.post.published" },
      async (db) => {
        const post = await postIn(db, parsed.postId);
        if (post.status === "published") throw new Refused("already_published");
        await movePointer(db, deps, post, parsed.revisionId);
        await db.execute(
          sql`UPDATE public.blog_post
                 SET published_revision_id = ${parsed.revisionId}::uuid,
                     status = 'published',
                     first_published_at = coalesce(first_published_at, now()),
                     unpublished_at = NULL,
                     unpublish_reason = NULL
               WHERE id = ${post.id}::uuid`,
        );
        await db.execute(
          sql`UPDATE public.blog_post_revision
                 SET published_at = now()
               WHERE id = ${parsed.revisionId}::uuid AND published_at IS NULL`,
        );
        const firstPublish = post.first_published_at === null;
        deps.log("blog.post.published", {
          post_id: post.id,
          locale: post.locale_code,
          first_publish: firstPublish,
        });
        // §5.4: no tags until spec 012b's run is verified; the admin action requests the run.
        return { result: { ok: true as const, firstPublish }, tags: [] };
      },
    ),
  );
}

/** Publish changes (§2.6): a live post's pointer moves to a newer approved revision. */
export async function publishChanges(
  input: BlogPublishChangesInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<Record<never, never>>> {
  const parsed = BlogPublishChangesSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.post.changes_published" },
      async (db) => {
        const post = await postIn(db, parsed.postId);
        if (post.status !== "published") throw new Refused("not_published");
        if (post.published_revision_id === parsed.revisionId) {
          throw new Refused("already_published");
        }
        await movePointer(db, deps, post, parsed.revisionId);
        await db.execute(
          sql`UPDATE public.blog_post
                 SET published_revision_id = ${parsed.revisionId}::uuid
               WHERE id = ${post.id}::uuid`,
        );
        await db.execute(
          sql`UPDATE public.blog_post_revision
                 SET published_at = now()
               WHERE id = ${parsed.revisionId}::uuid AND published_at IS NULL`,
        );
        deps.log("blog.post.changes_published", {
          post_id: post.id,
          revision_id: parsed.revisionId,
        });
        return {
          result: { ok: true as const },
          tags: liveTags(post.id, post.locale_code),
        };
      },
    ),
  );
}

/** Unpublish (§2.6): reason and the typed slug; the URL answers 404 at once. */
export async function unpublishPost(
  input: BlogUnpublishInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<Record<never, never>>> {
  const parsed = BlogUnpublishSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      {
        userId: parsed.userId,
        action: "blog.post.unpublished",
        reason: parsed.reason,
      },
      async (db) => {
        const post = await postIn(db, parsed.postId);
        if (post.status !== "published") throw new Refused("not_published");
        if (parsed.typedSlug !== post.slug) {
          throw new Refused("typed_slug_mismatch");
        }
        await db.execute(
          sql`UPDATE public.blog_post
                 SET status = 'unpublished', unpublished_at = now(),
                     unpublish_reason = ${parsed.reason}
               WHERE id = ${post.id}::uuid`,
        );
        deps.log("blog.post.unpublished", {
          post_id: post.id,
          locale: post.locale_code,
          reason_category: "manual",
        });
        return {
          result: { ok: true as const },
          tags: liveTags(post.id, post.locale_code),
        };
      },
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Authors.                                                                    */
/* -------------------------------------------------------------------------- */

export async function createAuthor(
  input: BlogAuthorCreateInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<{ readonly authorId: string }>> {
  const parsed = BlogAuthorCreateSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.author.created" },
      async (db) => {
        const [profile] = await rows<{ display_name: string }>(
          db,
          sql`SELECT display_name FROM public.admin_profile
               WHERE user_id = ${parsed.authorUserId}::uuid AND deactivated_at IS NULL`,
        );
        if (profile === undefined || profile.display_name.trim() === "") {
          throw new Refused("not_admin");
        }
        const self = parsed.authorUserId === parsed.userId;
        const [author] = await rows<{ id: string }>(
          db,
          sql`INSERT INTO public.blog_author (user_id, display_name, consented_at,
                                              own_name_confirmed_at)
              VALUES (${parsed.authorUserId}::uuid, ${profile.display_name},
                      ${parsed.consentedAt}::timestamptz,
                      ${self ? sql`now()` : sql`NULL`})
              RETURNING id`,
        );
        if (author === undefined) throw new Error("blog: the author insert returned no row");
        return { result: { ok: true as const, authorId: author.id }, tags: [] };
      },
    ),
  );
}

/** The person named, signed in, confirms the byline is their own name (§2.2). */
export async function confirmOwnName(
  input: BlogAuthorConfirmNameInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<Record<never, never>>> {
  const parsed = BlogAuthorConfirmNameSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.author.name_confirmed" },
      async (db) => {
        const [row] = await rows<{ id: string }>(
          db,
          sql`UPDATE public.blog_author SET own_name_confirmed_at = now()
               WHERE id = ${parsed.authorId}::uuid AND user_id = ${parsed.userId}::uuid
               RETURNING id`,
        );
        if (row === undefined) throw new Refused("not_own_name");
        return { result: { ok: true as const }, tags: [] };
      },
    ),
  );
}

/**
 * Withdraw an author (§2.6, AC-17): in one transaction, the author is withdrawn and every post of
 * theirs that is still published (not reassigned first) is unpublished with the reason "author
 * withdrawn". Any failure rolls back both.
 */
export async function withdrawAuthor(
  input: BlogAuthorWithdrawInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<{ readonly unpublished: readonly string[] }>> {
  const parsed = BlogAuthorWithdrawSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      {
        userId: parsed.userId,
        action: "blog.author.withdrawn",
        reason: BLOG_AUTHOR_WITHDRAWN_REASON,
      },
      async (db) => {
        const [author] = await rows<{ id: string }>(
          db,
          sql`UPDATE public.blog_author SET withdrawn_at = coalesce(withdrawn_at, now())
               WHERE id = ${parsed.authorId}::uuid
               RETURNING id`,
        );
        if (author === undefined) throw new Refused("unknown_author");
        const posts = await rows<{ id: string; locale_code: string }>(
          db,
          sql`UPDATE public.blog_post
                 SET status = 'unpublished', unpublished_at = now(),
                     unpublish_reason = ${BLOG_AUTHOR_WITHDRAWN_REASON}
               WHERE author_id = ${parsed.authorId}::uuid AND status = 'published'
               RETURNING id, locale_code`,
        );
        deps.log("blog.author.withdrawn", {
          author_id: parsed.authorId,
          posts_unpublished: posts.length,
        });
        const locales = [...new Set(posts.map((post) => post.locale_code))];
        return {
          result: {
            ok: true as const,
            unpublished: posts.map((post) => post.id),
          },
          tags:
            posts.length === 0
              ? []
              : [
                  ...posts.map((post) => `blog:post:${post.id}`),
                  ...locales.map((locale) => `blog:${locale}`),
                  "sitemap",
                ],
        };
      },
    ),
  );
}

/**
 * Reassign a post to another author (§2.6, AC-17). The author id is hashed, so the post's open
 * draft is re-hashed (or a new draft is opened from its latest revision) and needs its own
 * approval before `publishChanges` or `publishPost` can serve it.
 */
export async function reassignAuthor(
  input: BlogAuthorReassignInput,
  overrides: Partial<BlogDeps> = {},
): Promise<BlogCommandResult<{ readonly draftRevisionId: string }>> {
  const parsed = BlogAuthorReassignSchema.parse(input);
  const deps = await depsWith(overrides);
  return refusable(() =>
    deps.runAdmin(
      { userId: parsed.userId, action: "blog.post.reassigned" },
      async (db) => {
        const post = await postIn(db, parsed.postId);
        const [author] = await rows<{ withdrawn_at: string | null }>(
          db,
          sql`SELECT withdrawn_at FROM public.blog_author WHERE id = ${parsed.authorId}::uuid`,
        );
        if (author === undefined) throw new Refused("unknown_author");
        if (author.withdrawn_at !== null) throw new Refused("author_withdrawn");
        await db.execute(
          sql`UPDATE public.blog_post SET author_id = ${parsed.authorId}::uuid
               WHERE id = ${post.id}::uuid`,
        );
        const [draft] = await rows<{ id: string }>(
          db,
          sql`SELECT id FROM public.blog_post_revision
               WHERE post_id = ${post.id}::uuid AND frozen_at IS NULL`,
        );
        let draftId = draft?.id;
        if (draftId === undefined) {
          const [latest] = await rows<{ id: string }>(
            db,
            sql`SELECT id FROM public.blog_post_revision
                 WHERE post_id = ${post.id}::uuid
                 ORDER BY created_at DESC, id DESC LIMIT 1`,
          );
          if (latest === undefined) throw new Refused("unknown_revision");
          const source = await revisionIn(db, latest.id);
          draftId = (
            await insertRevision(db, post.id, parsed.userId, fieldsOf(source))
          ).id;
        }
        return {
          result: { ok: true as const, draftRevisionId: draftId },
          tags:
            post.status === "published"
              ? [`blog:post:${post.id}`, `blog:${post.locale_code}`]
              : [],
        };
      },
    ),
  );
}
