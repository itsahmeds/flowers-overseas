/**
 * The blog's boundaries: the editor's limits, the command schemas and the internal link reference
 * (spec 044 §2.3, §5.2; TASK-321). Every admin action parses its input with one of these before a
 * rule runs or a row is written (CLAUDE.md "Zod at every boundary").
 *
 * No database here: `pnpm check:no-db` scans `src/modules/content` except `blog/db/`.
 */
import { z } from "zod";

import { INFO_PAGE_IDS } from "@/config/info-pages";

import { HonestyAllowSchema } from "../schemas.ts";

/* -------------------------------------------------------------------------- */
/* The editor's limits (§2.3).                                                 */
/* -------------------------------------------------------------------------- */

/** The `<h1>`: at most 110 characters. */
export const BLOG_TITLE_MAX = 110;
/** The excerpt: 120 to 300 characters (rendered under the title, `BlogPosting.description`). */
export const BLOG_EXCERPT_MIN = 120;
export const BLOG_EXCERPT_MAX = 300;
/** The SEO title and description limits, as spec 012b's product copy. */
export const BLOG_SEO_TITLE_MAX = 60;
export const BLOG_SEO_DESCRIPTION_MAX = 155;
/** Child names under `/{locale}/blog/` a post slug may never take (§2.3 rule 1, slices B and C). */
export const BLOG_RESERVED_SLUGS = [
  "topic",
  "feed",
  "page",
  "authors",
  "rss",
] as const;
/** Rule 3: the body has at least this many words. */
export const BLOG_BODY_WORDS_MIN = 500;
/** Rule 3: at least this shingle distinctness from every other post and tagged corridor guide. */
export const BLOG_DISTINCTNESS_MIN = 0.7;
/** Soft rules: the title is truncated in results above 60 characters. */
export const BLOG_TITLE_SOFT_MAX = 60;
/** Soft rules: a body above 3,000 words. */
export const BLOG_BODY_WORDS_SOFT_MAX = 3000;
/** Soft rules: a body above 800 words with no `##` heading. */
export const BLOG_HEADING_EXPECTED_ABOVE_WORDS = 800;
/** Rule 2: an anchor has at least two words. */
export const BLOG_ANCHOR_WORDS_MIN = 2;

/**
 * Rule 2's generic anchors, per pattern-list locale. Slice A writes `en` only; slice B adds the
 * `de` and `pl` sets before a post in either language can be approved (§7).
 */
export const BLOG_GENERIC_ANCHORS: Readonly<Record<"en", readonly string[]>> = {
  en: ["here", "click here", "read more", "this page", "link", "more"],
};

/** Slice A writes posts in `en` only (§2.2); `en-gb` serves the same text. */
export const BLOG_AUTHORING_LOCALES = ["en"] as const;
export type BlogAuthoringLocale = (typeof BLOG_AUTHORING_LOCALES)[number];

/** A post slug: ASCII, lowercase, hyphenated (the migration's CHECK, restated for the rule). */
export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/* -------------------------------------------------------------------------- */
/* Internal references (§2.3): `fo:<kind>/<id>`.                               */
/* -------------------------------------------------------------------------- */

export const BLOG_LINK_KINDS = [
  "corridor",
  "occasion-hub",
  "category-hub",
  "info",
  "post",
] as const;
export type BlogLinkKind = (typeof BLOG_LINK_KINDS)[number];

const CatalogueKeySchema = z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/u);

/** One parsed reference: what a link in a post points at, never a URL. */
export const BlogLinkRefObjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("corridor"),
      id: z.string().regex(/^[A-Z]{2}$/u),
    })
    .strict(),
  z.object({ kind: z.literal("occasion-hub"), id: CatalogueKeySchema }).strict(),
  z.object({ kind: z.literal("category-hub"), id: CatalogueKeySchema }).strict(),
  z.object({ kind: z.literal("info"), id: z.enum(INFO_PAGE_IDS) }).strict(),
  z.object({ kind: z.literal("post"), id: z.uuid() }).strict(),
]);
export type BlogLinkRef = z.infer<typeof BlogLinkRefObjectSchema>;

/** `fo:<kind>/<id>` as written in the body, parsed into a `BlogLinkRef`. */
export const BlogLinkRefSchema = z
  .string()
  .regex(/^fo:[a-z-]+\/[^/\s]+$/u, "a reference such as fo:corridor/PL")
  .transform((text, ctx) => {
    const [kind, id] = text.slice("fo:".length).split("/");
    const parsed = BlogLinkRefObjectSchema.safeParse({ kind, id });
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "an unknown reference" });
      return z.NEVER;
    }
    return parsed.data;
  });

/** The reference's written form, `fo:<kind>/<id>`. */
export function blogLinkRefText(ref: BlogLinkRef): string {
  return `fo:${ref.kind}/${ref.id}`;
}

/* -------------------------------------------------------------------------- */
/* Commands (§5.2).                                                            */
/* -------------------------------------------------------------------------- */

const ActorSchema = z.object({
  /** The signed-in admin (`withAdminContext`'s `userId`). */
  userId: z.uuid(),
  requestId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9.:_-]+$/u)
    .optional(),
});

const Iso2Schema = z.string().regex(/^[A-Z]{2}$/u);

/** The text of one revision, as the editor submits it. */
export const BlogRevisionFieldsSchema = z
  .object({
    title: z.string().trim().min(1),
    excerpt: z.string().trim().min(1),
    seoTitle: z.string().trim().min(1),
    seoDescription: z.string().trim().min(1),
    bodyMd: z.string().min(1),
    coverMediaId: z.uuid().nullable(),
    coverAlt: z.string().trim().min(1).nullable(),
    honestyAllow: z.array(HonestyAllowSchema),
  })
  .strict()
  .refine((fields) => (fields.coverMediaId === null) === (fields.coverAlt === null), {
    message: "a cover needs its alt text, and alt text needs a cover",
    path: ["coverAlt"],
  });
export type BlogRevisionFields = z.infer<typeof BlogRevisionFieldsSchema>;

export const BlogPostCreateSchema = ActorSchema.extend({
  locale: z.enum(BLOG_AUTHORING_LOCALES),
  slug: z.string(),
  authorId: z.uuid(),
  countries: z.array(Iso2Schema),
  occasions: z.array(CatalogueKeySchema),
  revision: BlogRevisionFieldsSchema,
}).strict();
export type BlogPostCreateInput = z.input<typeof BlogPostCreateSchema>;

export const BlogRevisionSaveSchema = ActorSchema.extend({
  postId: z.uuid(),
  /** The slug, editable until the first publish (§2.3). */
  slug: z.string(),
  revision: BlogRevisionFieldsSchema,
  /** The `updated_at` of the revision the form was loaded from; `null` for the first save after a publish. */
  expectedUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();
export type BlogRevisionSaveInput = z.input<typeof BlogRevisionSaveSchema>;

export const BlogTagsSchema = ActorSchema.extend({
  postId: z.uuid(),
  countries: z.array(Iso2Schema),
  occasions: z.array(CatalogueKeySchema),
}).strict();
export type BlogTagsInput = z.input<typeof BlogTagsSchema>;

/** An approval: the reviewer, the revision and the hash of the exact text they read. */
export const BlogApproveSchema = ActorSchema.extend({
  revisionId: z.uuid(),
  valueHash: z.string().regex(/^[0-9a-f]{64}$/u),
}).strict();
export type BlogApproveInput = z.input<typeof BlogApproveSchema>;

export const BlogPublishSchema = ActorSchema.extend({
  postId: z.uuid(),
  revisionId: z.uuid(),
}).strict();
export type BlogPublishInput = z.input<typeof BlogPublishSchema>;

export const BlogPublishChangesSchema = BlogPublishSchema;
export type BlogPublishChangesInput = z.input<typeof BlogPublishChangesSchema>;

export const BlogUnpublishSchema = ActorSchema.extend({
  postId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
  /** The post's slug typed again to confirm (§2.6). */
  typedSlug: z.string(),
}).strict();
export type BlogUnpublishInput = z.input<typeof BlogUnpublishSchema>;

export const BlogAuthorCreateSchema = ActorSchema.extend({
  /** The person named: a user with an admin profile and a display name. */
  authorUserId: z.uuid(),
  /** When the person agreed to be named (§2.2). */
  consentedAt: z.iso.datetime({ offset: true }),
}).strict();
export type BlogAuthorCreateInput = z.input<typeof BlogAuthorCreateSchema>;

export const BlogAuthorWithdrawSchema = ActorSchema.extend({
  authorId: z.uuid(),
}).strict();
export type BlogAuthorWithdrawInput = z.input<typeof BlogAuthorWithdrawSchema>;

export const BlogAuthorReassignSchema = ActorSchema.extend({
  postId: z.uuid(),
  authorId: z.uuid(),
}).strict();
export type BlogAuthorReassignInput = z.input<typeof BlogAuthorReassignSchema>;

/** The person named confirms "this is my own name" (§2.2, advisor fix 2). */
export const BlogAuthorConfirmNameSchema = ActorSchema.extend({
  authorId: z.uuid(),
}).strict();
export type BlogAuthorConfirmNameInput = z.input<
  typeof BlogAuthorConfirmNameSchema
>;

/** The unpublish reason `withdrawAuthor` records (§2.6). */
export const BLOG_AUTHOR_WITHDRAWN_REASON = "author withdrawn";
