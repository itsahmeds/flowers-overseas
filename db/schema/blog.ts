/**
 * Drizzle definitions for the blog — `blog_author`, `blog_post`, `blog_post_revision`,
 * `blog_post_country`, `blog_post_occasion` (spec 044 §5.1; migration `0024_blog.sql`; TASK-321).
 *
 * The typed mirror of the migration, not its source. The guarantees — the revision hash, the
 * freeze, the publish guard, the slug lock, the author's own-name confirmation and the public
 * author view `blog_author_public` — live in the migration's triggers and functions, which this
 * file cannot express; `pnpm db:check`'s catalogue snapshot pins them.
 */
import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { country, occasion } from "./geo.ts";
import { locale } from "./i18n.ts";
import { mediaAsset } from "./media.ts";

export const blogPostStatuses = ["draft", "published", "unpublished"] as const;
export const blogSources = ["seed", "real"] as const;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
};

export const blogAuthor = pgTable(
  "blog_author",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    displayName: text("display_name").notNull(),
    consentedAt: timestamp("consented_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ownNameConfirmedAt: timestamp("own_name_confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true, mode: "date" }),
    source: text("source", { enum: blogSources }).notNull().default("real"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "blog_author_user_id_users_id_fk",
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    unique("blog_author_user_id_key").on(table.userId),
    check(
      "blog_author_display_name_check",
      sql.raw(`length(btrim(display_name)) > 0`),
    ),
    check("blog_author_source_check", sql.raw(`source IN ('seed', 'real')`)),
  ],
);

export const blogPost = pgTable(
  "blog_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    localeCode: text("locale_code").notNull(),
    slug: text("slug").notNull(),
    authorId: uuid("author_id").notNull(),
    status: text("status", { enum: blogPostStatuses })
      .notNull()
      .default("draft"),
    publishedRevisionId: uuid("published_revision_id"),
    firstPublishedAt: timestamp("first_published_at", {
      withTimezone: true,
      mode: "date",
    }),
    unpublishedAt: timestamp("unpublished_at", {
      withTimezone: true,
      mode: "date",
    }),
    unpublishReason: text("unpublish_reason"),
    translationGroupId: uuid("translation_group_id"),
    source: text("source", { enum: blogSources }).notNull().default("real"),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "blog_post_locale_code_locale_code_fk",
      columns: [table.localeCode],
      foreignColumns: [locale.code],
    }).onDelete("restrict"),
    foreignKey({
      name: "blog_post_author_id_blog_author_id_fk",
      columns: [table.authorId],
      foreignColumns: [blogAuthor.id],
    }).onDelete("restrict"),
    unique("blog_post_locale_code_slug_key").on(table.localeCode, table.slug),
    index("blog_post_author_id_idx").on(table.authorId),
    index("blog_post_locale_published_idx")
      .on(table.localeCode, table.firstPublishedAt.desc())
      .where(sql`status = 'published'`),
    check(
      "blog_post_status_check",
      sql.raw(`status IN ('draft', 'published', 'unpublished')`),
    ),
    check(
      "blog_post_published_check",
      sql.raw(`status <> 'published' OR published_revision_id IS NOT NULL`),
    ),
    check(
      "blog_post_unpublished_check",
      sql.raw(`status <> 'unpublished' OR unpublish_reason IS NOT NULL`),
    ),
    check(
      "blog_post_unpublish_reason_check",
      sql.raw(`unpublish_reason IS NULL OR btrim(unpublish_reason) <> ''`),
    ),
    check(
      "blog_post_slug_check",
      sql.raw(`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    ),
    check("blog_post_source_check", sql.raw(`source IN ('seed', 'real')`)),
  ],
);

export const blogPostRevision = pgTable(
  "blog_post_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    seoTitle: text("seo_title").notNull(),
    seoDescription: text("seo_description").notNull(),
    bodyMd: text("body_md").notNull(),
    coverMediaId: uuid("cover_media_id"),
    coverAlt: text("cover_alt"),
    honestyAllow: jsonb("honesty_allow")
      .notNull()
      .default(sql`'[]'::jsonb`),
    valueHash: char("value_hash", { length: 64 }).notNull(),
    createdBy: uuid("created_by").notNull(),
    ...timestamps,
    frozenAt: timestamp("frozen_at", { withTimezone: true, mode: "date" }),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    foreignKey({
      name: "blog_post_revision_post_id_blog_post_id_fk",
      columns: [table.postId],
      foreignColumns: [blogPost.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "blog_post_revision_cover_media_id_media_asset_id_fk",
      columns: [table.coverMediaId],
      foreignColumns: [mediaAsset.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "blog_post_revision_created_by_users_id_fk",
      columns: [table.createdBy],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    uniqueIndex("blog_post_revision_open_draft_key")
      .on(table.postId)
      .where(sql`frozen_at IS NULL`),
    index("blog_post_revision_post_id_idx").on(
      table.postId,
      table.createdAt.desc(),
    ),
    check(
      "blog_post_revision_cover_check",
      sql.raw(`(cover_media_id IS NULL) = (cover_alt IS NULL)`),
    ),
    check(
      "blog_post_revision_published_check",
      sql.raw(`published_at IS NULL OR frozen_at IS NOT NULL`),
    ),
    check(
      "blog_post_revision_honesty_allow_check",
      sql.raw(`jsonb_typeof(honesty_allow) = 'array'`),
    ),
    check(
      "blog_post_revision_value_hash_check",
      sql.raw(`value_hash ~ '^[0-9a-f]{64}$'`),
    ),
  ],
);

export const blogPostCountry = pgTable(
  "blog_post_country",
  {
    postId: uuid("post_id").notNull(),
    countryId: uuid("country_id").notNull(),
    sort: smallint("sort").notNull(),
  },
  (table) => [
    primaryKey({
      name: "blog_post_country_pkey",
      columns: [table.postId, table.countryId],
    }),
    unique("blog_post_country_post_id_sort_key").on(table.postId, table.sort),
    foreignKey({
      name: "blog_post_country_post_id_blog_post_id_fk",
      columns: [table.postId],
      foreignColumns: [blogPost.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "blog_post_country_country_id_country_id_fk",
      columns: [table.countryId],
      foreignColumns: [country.id],
    }).onDelete("restrict"),
    index("blog_post_country_country_id_idx").on(table.countryId),
    check("blog_post_country_sort_check", sql.raw(`sort >= 0`)),
  ],
);

export const blogPostOccasion = pgTable(
  "blog_post_occasion",
  {
    postId: uuid("post_id").notNull(),
    occasionId: uuid("occasion_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "blog_post_occasion_pkey",
      columns: [table.postId, table.occasionId],
    }),
    foreignKey({
      name: "blog_post_occasion_post_id_blog_post_id_fk",
      columns: [table.postId],
      foreignColumns: [blogPost.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "blog_post_occasion_occasion_id_occasion_id_fk",
      columns: [table.occasionId],
      foreignColumns: [occasion.id],
    }).onDelete("restrict"),
    index("blog_post_occasion_occasion_id_idx").on(table.occasionId),
  ],
);
