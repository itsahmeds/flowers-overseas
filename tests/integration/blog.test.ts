/**
 * T-01 to T-05 (integration halves) and T-17: the blog on a migrated scratch database (spec 044
 * §2.2 to §2.6, §5.1, AC-1 to AC-5, AC-17; migration `0024_blog`; TASK-321).
 *
 *  - T-01 (AC-1): up, down, up; after the down a `blog_post_revision` ledger row survives and the
 *    restored subject-kind check is `NOT VALID`.
 *  - T-02 (AC-2): as `app_web` (public) and `app_build` over one published post (with a superseded
 *    revision and an open draft), one draft post and one unpublished post, reads return exactly the
 *    published set; `user_id` and `consented_at` return no rows or fail; writes fail.
 *  - T-03 (AC-3): the raw pointer with no ledger row, with a row for an older hash, to another
 *    post's revision, with a withdrawn author: each raises its code; through `attest()` and
 *    `publishPost` it succeeds; a frozen revision and a published slug refuse changes.
 *  - T-04 (AC-4): the trigger's hash equals `blogRevisionHash()`; `attest()` refuses with zero
 *    rows for no grant, an empty name and a stale hash.
 *  - T-05 (AC-5): a refused save writes nothing; the vanished corridor is refused at approval and
 *    at publish with `blog/link-corridor`.
 *  - T-17 (AC-17): withdrawing an author unpublishes, in one transaction, the posts not reassigned
 *    first, each with "author withdrawn"; a forced failure leaves everything as it was; the
 *    reassigned post's new draft cannot be published before approval.
 *
 * The commands run through the real `withAdminContext` and the real `attest()`, pointed at the
 * scratch database; only the link targets are a fake, so a test can make a corridor vanish.
 */
import { randomUUID } from "node:crypto";

import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  approveRevision,
  type BlogDeps,
  confirmOwnName,
  createAuthor,
  createPost,
  publishChanges,
  publishPost,
  reassignAuthor,
  saveRevision,
  unpublishPost,
  withdrawAuthor,
} from "../../src/modules/content/blog/db/commands.ts";
import type { BlogLinkTargets } from "../../src/modules/content/blog/markdown.ts";
import { blogRevisionHash } from "../../src/modules/i18n/attestation.ts";
import { attest } from "../../src/modules/i18n/db/ledger.ts";
import {
  BLOG_LINK_REFS,
  blogBody,
  blogRevisionFields,
  HASH_FIXTURE,
} from "../fixtures/blog.ts";
import { unique } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  runner,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const target = vi.hoisted(() => ({ url: "" }));
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));
vi.mock("@/lib/sentry", () => ({ captureGuardError: () => undefined }));

const server = await probeLocalServer();

/** The references that exist now; a test removes one to make a target vanish. */
const existing = new Set<string>(BLOG_LINK_REFS);
const targets: BlogLinkTargets = {
  pathOf: (ref) =>
    Promise.resolve(
      existing.has(`fo:${ref.kind}/${ref.id}`)
        ? `/en/x/${ref.id.toLowerCase()}`
        : null,
    ),
};
const deps: Partial<BlogDeps> = { targets, guideText: () => undefined };

interface People {
  readonly founder: string;
  readonly writer: string;
  readonly third: string;
  readonly noGrant: string;
  readonly blankName: string;
}

async function person(
  sql: Sql,
  name: string,
  roles: readonly string[],
  locales: readonly string[],
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO users (email) VALUES (${`${unique("blog")}@example.test`}) RETURNING id`;
  const id = row?.id ?? "";
  await sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${id}, ${name})`;
  for (const role of roles) {
    await sql`INSERT INTO user_role (user_id, role) VALUES (${id}, ${role})`;
  }
  for (const locale of locales) {
    await sql`INSERT INTO reviewer_locale (user_id, locale_code) VALUES (${id}, ${locale})`;
  }
  return id;
}

async function referenceData(sql: Sql): Promise<void> {
  await sql`INSERT INTO locale (code, bcp47, name) VALUES
              ('en', 'en', 'English'), ('pl', 'pl-PL', 'Polski'), ('de', 'de-DE', 'Deutsch'),
              ('en-gb', 'en-GB', 'English (UK)')
            ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO currency (code, minor_unit_exponent) VALUES ('PLN', 2), ('EUR', 2)
            ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone) VALUES
              ('PL', 'PLN', 2300, 'Europe/Warsaw'), ('DE', 'EUR', 1900, 'Europe/Berlin')
            ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO occasion (key, kind) VALUES ('name_day', 'evergreen')
            ON CONFLICT DO NOTHING`;
}

/** Hard results' rule ids, in order, once each. */
const ruleIds = (result: {
  readonly results?: readonly { readonly id: string }[];
}): string[] => [...new Set((result.results ?? []).map((r) => r.id))];

/** The guard code a rejected command raised, read through Drizzle's error wrapping. */
async function raisedBy(pending: Promise<unknown>): Promise<string> {
  try {
    await pending;
  } catch (error) {
    for (
      let current: unknown = error;
      current instanceof Error;
      current = current.cause
    ) {
      const code = /^([A-Z][A-Z_]+):/u.exec(current.message)?.[1];
      if (code !== undefined) return code;
    }
    return "other";
  }
  return "none";
}

async function count(sql: Sql | Tx, query: string): Promise<number> {
  const [row] = await sql.unsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM ${query}`,
  );
  return row?.n ?? 0;
}

/** A post written, approved by the founder and published, through the commands. */
async function livePost(
  people: People,
  authorId: string,
  slug: string,
  seed: number,
): Promise<{ postId: string; revisionId: string }> {
  const created = await createPost(
    {
      userId: people.founder,
      locale: "en",
      slug,
      authorId,
      countries: ["PL"],
      occasions: ["name_day"],
      revision: blogRevisionFields({ bodyMd: blogBody(seed) }),
    },
    deps,
  );
  if (!created.result.ok)
    throw new Error(`createPost: ${created.result.refusal}`);
  const { postId, revisionId, valueHash } = created.result;
  const approved = await approveRevision(
    { userId: people.founder, revisionId, valueHash },
    deps,
  );
  if (!approved.result.ok)
    throw new Error(`approve: ${approved.result.refusal}`);
  const published = await publishPost(
    { userId: people.founder, postId, revisionId },
    deps,
  );
  if (!published.result.ok)
    throw new Error(`publish: ${published.result.refusal}`);
  return { postId, revisionId };
}

describe.skipIf(server.url === undefined)(
  `the blog (spec 044 AC-1 to AC-5, AC-17)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let people: People;
    let founderAuthor: string;
    let writerAuthor: string;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "blog");
      target.url = scratch.url;
      await referenceData(scratch.sql);
      people = {
        founder: await person(
          scratch.sql,
          "Founder Test",
          ["admin"],
          ["en", "en-gb"],
        ),
        writer: await person(scratch.sql, "Second Writer", ["content"], ["en"]),
        third: await person(scratch.sql, "Third Writer", ["content"], ["en"]),
        noGrant: await person(scratch.sql, "No Grant", ["content"], ["pl"]),
        blankName: await person(scratch.sql, "   ", ["admin"], ["en"]),
      };
      await Promise.all([
        import("@/lib/db"),
        import("@/modules/admin"),
        import("@/lib/logger"),
        import("@/modules/i18n"),
      ]);
      const own = await createAuthor(
        {
          userId: people.founder,
          authorUserId: people.founder,
          consentedAt: "2026-10-21T09:00:00Z",
        },
        deps,
      );
      if (!own.result.ok) throw new Error("founder author");
      founderAuthor = own.result.authorId;
      const other = await createAuthor(
        {
          userId: people.founder,
          authorUserId: people.writer,
          consentedAt: "2026-10-21T09:00:00Z",
        },
        deps,
      );
      if (!other.result.ok) throw new Error("writer author");
      writerAuthor = other.result.authorId;
    }, 240_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("authors (§2.2)", () => {
      it("the byline is the admin display name, and only the person named confirms it", async () => {
        const [row] = await scratch.sql<
          { display_name: string; confirmed: boolean }[]
        >`
          SELECT display_name, own_name_confirmed_at IS NOT NULL AS confirmed
          FROM blog_author WHERE id = ${writerAuthor}`;
        expect(row).toEqual({
          display_name: "Second Writer",
          confirmed: false,
        });
        const byFounder = await confirmOwnName(
          { userId: people.founder, authorId: writerAuthor },
          deps,
        );
        expect(byFounder.result).toEqual({
          ok: false,
          refusal: "not_own_name",
        });
        const bySelf = await confirmOwnName(
          { userId: people.writer, authorId: writerAuthor },
          deps,
        );
        expect(bySelf.result).toEqual({ ok: true });
        await rolledBack(scratch.sql, async (tx) => {
          await tx`UPDATE admin_profile SET display_name = 'Second Writer Jr' WHERE user_id = ${people.writer}`;
          const [after] = await tx<
            { display_name: string; confirmed: boolean }[]
          >`
            SELECT display_name, own_name_confirmed_at IS NOT NULL AS confirmed
            FROM blog_author WHERE id = ${writerAuthor}`;
          expect(after).toEqual({
            display_name: "Second Writer Jr",
            confirmed: false,
          });
        });
      });
    });

    describe("T-02 — what the public and the build read (AC-2)", () => {
      let published: { postId: string; revisionId: string };
      let current: string;
      let draftPost: string;
      let gonePost: string;

      beforeAll(async () => {
        published = await livePost(people, founderAuthor, "rls-live", 11);
        // A second revision, approved and published: the first is now superseded.
        const saved = await saveRevision(
          {
            userId: people.founder,
            postId: published.postId,
            slug: "rls-live",
            revision: blogRevisionFields({ bodyMd: blogBody(12) }),
            expectedUpdatedAt: null,
          },
          deps,
        );
        if (!saved.result.ok) throw new Error(`save: ${saved.result.refusal}`);
        current = saved.result.revisionId;
        await approveRevision(
          {
            userId: people.founder,
            revisionId: current,
            valueHash: saved.result.valueHash,
          },
          deps,
        );
        const changed = await publishChanges(
          {
            userId: people.founder,
            postId: published.postId,
            revisionId: current,
          },
          deps,
        );
        expect(changed.result).toEqual({ ok: true });
        expect(changed.tags).toEqual([
          `blog:post:${published.postId}`,
          "blog:en",
          "sitemap",
        ]);
        // An open draft on the live post.
        await saveRevision(
          {
            userId: people.founder,
            postId: published.postId,
            slug: "rls-live",
            revision: blogRevisionFields({ bodyMd: blogBody(13) }),
            expectedUpdatedAt: null,
          },
          deps,
        );
        const draft = await createPost(
          {
            userId: people.founder,
            locale: "en",
            slug: "rls-draft",
            authorId: writerAuthor,
            countries: ["DE"],
            occasions: [],
            revision: blogRevisionFields({ bodyMd: blogBody(14) }),
          },
          deps,
        );
        if (!draft.result.ok) throw new Error(`draft: ${draft.result.refusal}`);
        draftPost = draft.result.postId;
        const gone = await livePost(people, founderAuthor, "rls-gone", 15);
        gonePost = gone.postId;
        const unpublished = await unpublishPost(
          {
            userId: people.founder,
            postId: gonePost,
            reason: "test takedown",
            typedSlug: "rls-gone",
          },
          deps,
        );
        expect(unpublished.result).toEqual({ ok: true });
      }, 120_000);

      for (const role of ["app_web", "app_build"] as const) {
        it(`${role} reads exactly the published post, its published revision, its tags and its author's id and name`, async () => {
          await rolledBack(scratch.sql, async (tx) => {
            if (role === "app_web") await asApp(tx, { role: "public" });
            else await tx.unsafe("SET LOCAL ROLE app_build");
            const posts = await tx<{ id: string }[]>`SELECT id FROM blog_post`;
            const mine = posts
              .map((p) => p.id)
              .filter((id) =>
                [published.postId, draftPost, gonePost].includes(id),
              );
            expect(mine).toEqual([published.postId]);
            const revisions = await tx<{ id: string; post_id: string }[]>`
              SELECT id, post_id FROM blog_post_revision WHERE post_id IN (${published.postId}, ${draftPost}, ${gonePost})`;
            expect(revisions.map((r) => r.id)).toEqual([current]);
            const tags = await tx<{ post_id: string }[]>`
              SELECT post_id FROM blog_post_country WHERE post_id IN (${published.postId}, ${draftPost}, ${gonePost})`;
            expect(tags.map((t) => t.post_id)).toEqual([published.postId]);
            const authors = await tx<{ id: string; display_name: string }[]>`
              SELECT id, display_name FROM blog_author_public WHERE id IN (${founderAuthor}, ${writerAuthor})`;
            expect(authors).toEqual([
              { id: founderAuthor, display_name: "Founder Test" },
            ]);
            expect(Object.keys(authors[0] ?? {}).sort()).toEqual([
              "display_name",
              "id",
            ]);
          });
        });

        it(`${role}: blog_author's user_id and consented_at return no rows or fail`, async () => {
          for (const column of ["user_id", "consented_at"]) {
            await rolledBack(scratch.sql, async (tx) => {
              if (role === "app_web") await asApp(tx, { role: "public" });
              else await tx.unsafe("SET LOCAL ROLE app_build");
              if (role === "app_web") {
                const found = await tx.unsafe(
                  `SELECT ${column} FROM blog_author`,
                );
                expect(found.length, column).toBe(0);
              } else {
                const failure = await pgFailure(tx, (sp) =>
                  sp.unsafe(`SELECT ${column} FROM blog_author`),
                );
                expect(failure.code, column).toBe("42501");
              }
            });
          }
        });

        it(`${role}: every INSERT, UPDATE and DELETE on the five tables, and on the view, fails or touches nothing`, async () => {
          const writes: readonly string[] = [
            `INSERT INTO blog_author (user_id, display_name, consented_at) VALUES ('${people.third}', 'x', now())`,
            `INSERT INTO blog_post (locale_code, slug, author_id) VALUES ('en', 'sneaky', '${founderAuthor}')`,
            `INSERT INTO blog_post_revision (post_id, title, excerpt, seo_title, seo_description, body_md, created_by) VALUES ('${published.postId}', 't', 'e', 's', 'd', 'b', '${people.founder}')`,
            `INSERT INTO blog_post_country (post_id, country_id, sort) SELECT '${draftPost}', id, 9 FROM country WHERE iso2 = 'PL'`,
            `INSERT INTO blog_post_occasion (post_id, occasion_id) SELECT '${draftPost}', id FROM occasion LIMIT 1`,
            `INSERT INTO blog_author_public (id, display_name) VALUES ('${randomUUID()}', 'x')`,
          ];
          const changes: readonly string[] = [
            `UPDATE blog_author SET display_name = 'x'`,
            `UPDATE blog_post SET slug = 'changed'`,
            `UPDATE blog_post_revision SET title = 'x'`,
            `UPDATE blog_post_country SET sort = 5`,
            `DELETE FROM blog_post_occasion`,
            `DELETE FROM blog_post_country`,
            `DELETE FROM blog_post_revision`,
            `DELETE FROM blog_post`,
            `DELETE FROM blog_author`,
            `UPDATE blog_author_public SET display_name = 'x'`,
          ];
          await rolledBack(scratch.sql, async (tx) => {
            if (role === "app_web") await asApp(tx, { role: "public" });
            else await tx.unsafe("SET LOCAL ROLE app_build");
            for (const statement of writes) {
              const failure = await pgFailure(tx, (sp) => sp.unsafe(statement));
              expect(["42501", "P0001"], statement).toContain(failure.code);
            }
            for (const statement of changes) {
              let touched = 0;
              try {
                await tx.savepoint(async (sp) => {
                  touched = (await sp.unsafe(statement)).count;
                });
              } catch (error) {
                expect((error as { code?: string }).code, statement).toBe(
                  "42501",
                );
              }
              expect(touched, statement).toBe(0);
            }
          });
        });
      }
    });

    describe("T-03 — the publish guard, the freeze and the slug lock (AC-3)", () => {
      async function draftOf(
        slug: string,
        seed: number,
        authorId = founderAuthor,
      ) {
        const created = await createPost(
          {
            userId: people.founder,
            locale: "en",
            slug,
            authorId,
            countries: ["PL"],
            occasions: [],
            revision: blogRevisionFields({ bodyMd: blogBody(seed) }),
          },
          deps,
        );
        if (!created.result.ok)
          throw new Error(`createPost: ${created.result.refusal}`);
        return created.result;
      }

      it("a raw pointer to a revision with no ledger row raises BLOG_PUBLISH_WITHOUT_ATTESTATION", async () => {
        const draft = await draftOf("guard-none", 21);
        await rolledBack(scratch.sql, async (tx) => {
          const failure = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post SET published_revision_id = ${draft.revisionId}, status = 'published' WHERE id = ${draft.postId}`,
          );
          expect(failure.raised).toBe("BLOG_PUBLISH_WITHOUT_ATTESTATION");
        });
      });

      it("a raw pointer whose ledger row is for an older hash raises BLOG_PUBLISH_WITHOUT_ATTESTATION", async () => {
        const draft = await draftOf("guard-stale", 22);
        const approved = await approveRevision(
          {
            userId: people.founder,
            revisionId: draft.revisionId,
            valueHash: draft.valueHash,
          },
          deps,
        );
        expect(approved.result.ok).toBe(true);
        await rolledBack(scratch.sql, async (tx) => {
          // The slug is hashed: before the first publish it may change, and the approval no longer covers it.
          await tx`UPDATE blog_post SET slug = 'guard-stale-renamed' WHERE id = ${draft.postId}`;
          const failure = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post SET published_revision_id = ${draft.revisionId}, status = 'published' WHERE id = ${draft.postId}`,
          );
          expect(failure.raised).toBe("BLOG_PUBLISH_WITHOUT_ATTESTATION");
        });
        // The same pointer with the hash it was approved under is accepted (the control).
        await rolledBack(scratch.sql, async (tx) => {
          await tx`UPDATE blog_post SET published_revision_id = ${draft.revisionId}, status = 'published', first_published_at = now() WHERE id = ${draft.postId}`;
        });
      });

      it("another post's revision raises BLOG_PUBLISH_FOREIGN_REVISION", async () => {
        const one = await draftOf("guard-one", 23);
        const two = await draftOf("guard-two", 24);
        await approveRevision(
          {
            userId: people.founder,
            revisionId: one.revisionId,
            valueHash: one.valueHash,
          },
          deps,
        );
        await rolledBack(scratch.sql, async (tx) => {
          const failure = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post SET published_revision_id = ${one.revisionId}, status = 'published' WHERE id = ${two.postId}`,
          );
          expect(failure.raised).toBe("BLOG_PUBLISH_FOREIGN_REVISION");
        });
      });

      it("any publish while the author is withdrawn is refused", async () => {
        const [third] = await scratch.sql<{ id: string }[]>`
          INSERT INTO blog_author (user_id, display_name, consented_at)
          VALUES (${people.third}, 'ignored', now()) RETURNING id`;
        const authorId = third?.id ?? "";
        await scratch.sql.begin(async (tx) => {
          await tx`SELECT set_config('app.user_id', ${people.third}, true)`;
          await tx`UPDATE blog_author SET own_name_confirmed_at = now() WHERE id = ${authorId}`;
        });
        const draft = await draftOf("guard-withdrawn", 25, authorId);
        await approveRevision(
          {
            userId: people.founder,
            revisionId: draft.revisionId,
            valueHash: draft.valueHash,
          },
          deps,
        );
        await scratch.sql`UPDATE blog_author SET withdrawn_at = now() WHERE id = ${authorId}`;
        expect(
          await raisedBy(
            publishPost(
              {
                userId: people.founder,
                postId: draft.postId,
                revisionId: draft.revisionId,
              },
              deps,
            ),
          ),
        ).toBe("BLOG_AUTHOR_WITHDRAWN");
        const [post] = await scratch.sql<
          { status: string }[]
        >`SELECT status FROM blog_post WHERE id = ${draft.postId}`;
        expect(post?.status).toBe("draft");
      });

      it("through attest() and publishPost it succeeds; then the frozen revision and the slug refuse changes", async () => {
        const live = await livePost(people, founderAuthor, "guard-live", 26);
        const [row] = await scratch.sql<
          {
            status: string;
            published_revision_id: string;
            first: boolean;
            frozen: boolean;
            published_at: boolean;
          }[]
        >`
          SELECT p.status, p.published_revision_id, p.first_published_at IS NOT NULL AS first,
                 r.frozen_at IS NOT NULL AS frozen, r.published_at IS NOT NULL AS published_at
          FROM blog_post p JOIN blog_post_revision r ON r.id = p.published_revision_id
          WHERE p.id = ${live.postId}`;
        expect(row).toEqual({
          status: "published",
          published_revision_id: live.revisionId,
          first: true,
          frozen: true,
          published_at: true,
        });
        await rolledBack(scratch.sql, async (tx) => {
          const frozen = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post_revision SET title = 'Changed after approval' WHERE id = ${live.revisionId}`,
          );
          expect(frozen.raised).toBe("BLOG_REVISION_FROZEN");
          const deleted = await pgFailure(
            tx,
            (sp) =>
              sp`DELETE FROM blog_post_revision WHERE id = ${live.revisionId}`,
          );
          expect(deleted.raised).toBe("BLOG_REVISION_FROZEN");
          const locked = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post SET slug = 'guard-live-2' WHERE id = ${live.postId}`,
          );
          expect(locked.raised).toBe("BLOG_SLUG_LOCKED");
        });
      });

      it("a revision freezes only through attest(): no flag, then the flag without its ledger row", async () => {
        const draft = await draftOf("guard-freeze", 27);
        await rolledBack(scratch.sql, async (tx) => {
          const direct = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post_revision SET frozen_at = now() WHERE id = ${draft.revisionId}`,
          );
          expect(direct.raised).toBe("REVIEW_DIRECT_WRITE");
          await tx`SELECT set_config('app.allow_review_write', 'on', true)`;
          const flagged = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post_revision SET frozen_at = now() WHERE id = ${draft.revisionId}`,
          );
          expect(flagged.raised).toBe("REVIEW_WITHOUT_ATTESTATION");
        });
      });
    });

    describe("T-04 — the hash and attest() refusals (AC-4)", () => {
      it("the trigger's hash and blogRevisionHash() agree on the fixture", async () => {
        const assetId = HASH_FIXTURE.coverMediaId ?? "";
        await rolledBack(scratch.sql, async (tx) => {
          await tx`INSERT INTO media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
                                            checksum_sha256, visibility, source, depicts, exif_stripped)
                   VALUES (${assetId}, 'brand', 'fo-media-test', ${`blog/${assetId}/original`},
                           'image/jpeg', 1200, 800, 48213, ${"ab".repeat(32)}, 'public', 'ai', 'context', true)`;
          await tx`INSERT INTO users (id, email) VALUES (${HASH_FIXTURE.authorId}, ${`${unique("h")}@example.test`})`;
          await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${HASH_FIXTURE.authorId}, 'Hash Author')`;
          await tx`INSERT INTO blog_author (id, user_id, display_name, consented_at)
                   VALUES (${HASH_FIXTURE.authorId}, ${HASH_FIXTURE.authorId}, 'x', now())`;
          const [post] = await tx<{ id: string }[]>`
            INSERT INTO blog_post (locale_code, slug, author_id)
            VALUES ('en', ${HASH_FIXTURE.slug}, ${HASH_FIXTURE.authorId}) RETURNING id`;
          const [revision] = await tx<{ id: string; value_hash: string }[]>`
            INSERT INTO blog_post_revision (post_id, title, excerpt, seo_title, seo_description, body_md,
                                            cover_media_id, cover_alt, honesty_allow, created_by)
            VALUES (${post?.id ?? ""}, ${HASH_FIXTURE.title}, ${HASH_FIXTURE.excerpt}, ${HASH_FIXTURE.seoTitle},
                    ${HASH_FIXTURE.seoDescription}, ${HASH_FIXTURE.bodyMd}, ${assetId}, ${HASH_FIXTURE.coverAlt},
                    ${tx.json(HASH_FIXTURE.honestyAllow as unknown as postgresJson)}, ${people.founder})
            RETURNING id, value_hash`;
          expect(revision?.value_hash).toBe(blogRevisionHash(HASH_FIXTURE));
          const [subject] = await tx<{ hash: string }[]>`
            SELECT public.review_subject_hash('blog_post_revision', ${revision?.id ?? ""}, 'en') AS hash`;
          expect(subject?.hash).toBe(blogRevisionHash(HASH_FIXTURE));
          // Changing a post-level hashed field re-hashes the open draft.
          await tx`UPDATE blog_post SET slug = 'another-slug' WHERE id = ${post?.id ?? ""}`;
          const [after] = await tx<
            { value_hash: string }[]
          >`SELECT value_hash FROM blog_post_revision WHERE id = ${revision?.id ?? ""}`;
          expect(after?.value_hash).toBe(
            blogRevisionHash({ ...HASH_FIXTURE, slug: "another-slug" }),
          );
        });
      });

      it("attest() refuses with no row written: no locale grant, an empty display name, a stale hash", async () => {
        const created = await createPost(
          {
            userId: people.founder,
            locale: "en",
            slug: "attest-refusals",
            authorId: founderAuthor,
            countries: ["PL"],
            occasions: [],
            revision: blogRevisionFields({ bodyMd: blogBody(31) }),
          },
          deps,
        );
        if (!created.result.ok) throw new Error("createPost");
        const { revisionId, valueHash } = created.result;
        const subject = {
          kind: "blog_post_revision" as const,
          ref: revisionId,
          locale: "en",
        };
        const before = await count(scratch.sql, "review_attestation");
        const cases: readonly [string, string, string][] = [
          [people.noGrant, valueHash, "locale_not_granted"],
          [people.blankName, valueHash, "no_display_name"],
          [people.founder, "f".repeat(64), "stale_hash"],
        ];
        for (const [userId, hash, refusal] of cases) {
          const outcome = await attest({
            channel: "admin",
            input: { userId, subject, decision: "approved", valueHash: hash },
          });
          expect(outcome, refusal).toMatchObject({ ok: false, refusal });
        }
        expect(await count(scratch.sql, "review_attestation")).toBe(before);
        const [frozen] = await scratch.sql<{ frozen: boolean }[]>`
          SELECT frozen_at IS NOT NULL AS frozen FROM blog_post_revision WHERE id = ${revisionId}`;
        expect(frozen?.frozen).toBe(false);
      });
    });

    describe("T-05 — the rules at save, approval and publish (AC-5)", () => {
      it("a refused save writes nothing and names its rule", async () => {
        const posts = await count(scratch.sql, "blog_post");
        const refused = await createPost(
          {
            userId: people.founder,
            locale: "en",
            slug: "refused-save",
            authorId: founderAuthor,
            countries: ["PL"],
            occasions: [],
            revision: blogRevisionFields({ excerpt: "Too short." }),
          },
          deps,
        );
        expect(refused.result.ok).toBe(false);
        expect(!refused.result.ok && refused.result.refusal).toBe("rules");
        expect(
          ruleIds(refused.result as { results?: readonly { id: string }[] }),
        ).toEqual(["blog/length"]);
        expect(await count(scratch.sql, "blog_post")).toBe(posts);

        const live = await livePost(people, founderAuthor, "refused-edit", 41);
        const revisions = await count(
          scratch.sql,
          `blog_post_revision WHERE post_id = '${live.postId}'`,
        );
        const edit = await saveRevision(
          {
            userId: people.founder,
            postId: live.postId,
            slug: "refused-edit",
            revision: blogRevisionFields({
              bodyMd: `${blogBody(41)}\n\nYour order is on hold.`,
            }),
            expectedUpdatedAt: null,
          },
          deps,
        );
        expect(
          ruleIds(edit.result as { results?: readonly { id: string }[] }),
        ).toEqual(["blog/relay"]);
        expect(
          await count(
            scratch.sql,
            `blog_post_revision WHERE post_id = '${live.postId}'`,
          ),
        ).toBe(revisions);
      });

      it("the vanished corridor is refused at approval and at publish with blog/link-corridor", async () => {
        const created = await createPost(
          {
            userId: people.founder,
            locale: "en",
            slug: "vanishing-corridor",
            authorId: founderAuthor,
            countries: ["PL"],
            occasions: [],
            revision: blogRevisionFields({ bodyMd: blogBody(51) }),
          },
          deps,
        );
        if (!created.result.ok) throw new Error("createPost");
        const { postId, revisionId, valueHash } = created.result;
        const ledger = await count(scratch.sql, "review_attestation");
        existing.delete("fo:corridor/PL");
        try {
          const atApproval = await approveRevision(
            { userId: people.founder, revisionId, valueHash },
            deps,
          );
          expect(
            ruleIds(
              atApproval.result as { results?: readonly { id: string }[] },
            ),
          ).toEqual(["blog/link-corridor"]);
          expect(await count(scratch.sql, "review_attestation")).toBe(ledger);
        } finally {
          existing.add("fo:corridor/PL");
        }
        const approved = await approveRevision(
          { userId: people.founder, revisionId, valueHash },
          deps,
        );
        expect(approved.result.ok).toBe(true);
        existing.delete("fo:corridor/PL");
        try {
          const atPublish = await publishPost(
            { userId: people.founder, postId, revisionId },
            deps,
          );
          expect(
            ruleIds(
              atPublish.result as { results?: readonly { id: string }[] },
            ),
          ).toEqual(["blog/link-corridor"]);
          const [post] = await scratch.sql<
            { status: string }[]
          >`SELECT status FROM blog_post WHERE id = ${postId}`;
          expect(post?.status).toBe("draft");
        } finally {
          existing.add("fo:corridor/PL");
        }
      });
    });

    describe("T-17 — withdrawing and reassigning an author (AC-17)", () => {
      it("withdraw unpublishes, in one transaction, the posts not reassigned first; the reassigned draft needs approval", async () => {
        const [row] = await scratch.sql<{ id: string }[]>`
          INSERT INTO users (email) VALUES (${`${unique("leaving")}@example.test`}) RETURNING id`;
        const leavingUser = row?.id ?? "";
        await scratch.sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${leavingUser}, 'Leaving Writer')`;
        const author = await createAuthor(
          {
            userId: leavingUser,
            authorUserId: leavingUser,
            consentedAt: "2026-10-21T09:00:00Z",
          },
          deps,
        );
        if (!author.result.ok) throw new Error("author");
        const leaving = author.result.authorId;
        const stays = await livePost(people, leaving, "leaving-stays", 61);
        const moves = await livePost(people, leaving, "leaving-moves", 62);

        const reassigned = await reassignAuthor(
          {
            userId: people.founder,
            postId: moves.postId,
            authorId: writerAuthor,
          },
          deps,
        );
        if (!reassigned.result.ok)
          throw new Error(`reassign: ${reassigned.result.refusal}`);
        const draftId = reassigned.result.draftRevisionId;

        // A forced failure after the posts are unpublished, inside the same transaction, leaves
        // both the author and the post as they were.
        const { withAdminContext } = await import("@/lib/db");
        const dialect = new PgDialect();
        const failing: Partial<BlogDeps> = {
          ...deps,
          runAdmin: (context, fn) =>
            withAdminContext(context, (db) =>
              fn({
                async execute(query) {
                  const result = await db.execute(query);
                  if (
                    dialect.sqlToQuery(query).sql.includes("unpublish_reason")
                  ) {
                    throw new Error("FORCED_FAILURE: after the posts' update");
                  }
                  return result;
                },
              }),
            ),
        };
        expect(
          await raisedBy(
            withdrawAuthor(
              { userId: people.founder, authorId: leaving },
              failing,
            ),
          ),
        ).toBe("FORCED_FAILURE");
        const [untouched] = await scratch.sql<
          { withdrawn: boolean; status: string }[]
        >`
          SELECT a.withdrawn_at IS NOT NULL AS withdrawn, p.status
          FROM blog_author a JOIN blog_post p ON p.author_id = a.id WHERE a.id = ${leaving}`;
        expect(untouched).toEqual({ withdrawn: false, status: "published" });

        const withdrawn = await withdrawAuthor(
          { userId: people.founder, authorId: leaving },
          deps,
        );
        expect(withdrawn.result).toEqual({
          ok: true,
          unpublished: [stays.postId],
        });
        expect(withdrawn.tags).toEqual([
          `blog:post:${stays.postId}`,
          "blog:en",
          "sitemap",
        ]);
        const states = await scratch.sql<
          { id: string; status: string; unpublish_reason: string | null }[]
        >`
          SELECT id, status, unpublish_reason FROM blog_post WHERE id IN (${stays.postId}, ${moves.postId}) ORDER BY slug`;
        expect(states).toEqual([
          { id: moves.postId, status: "published", unpublish_reason: null },
          {
            id: stays.postId,
            status: "unpublished",
            unpublish_reason: "author withdrawn",
          },
        ]);

        // The reassigned post's new draft is not publishable before its approval.
        const early = await publishChanges(
          { userId: people.founder, postId: moves.postId, revisionId: draftId },
          deps,
        );
        expect(early.result).toEqual({ ok: false, refusal: "not_approved" });
        await rolledBack(scratch.sql, async (tx) => {
          const raw = await pgFailure(
            tx,
            (sp) =>
              sp`UPDATE blog_post SET published_revision_id = ${draftId} WHERE id = ${moves.postId}`,
          );
          expect(raw.raised).toBe("BLOG_PUBLISH_WITHOUT_ATTESTATION");
        });
        const [draft] = await scratch.sql<
          { value_hash: string }[]
        >`SELECT value_hash FROM blog_post_revision WHERE id = ${draftId}`;
        const approved = await approveRevision(
          {
            userId: people.founder,
            revisionId: draftId,
            valueHash: draft?.value_hash ?? "",
          },
          deps,
        );
        expect(approved.result.ok).toBe(true);
        const after = await publishChanges(
          { userId: people.founder, postId: moves.postId, revisionId: draftId },
          deps,
        );
        expect(after.result).toEqual({ ok: true });
      });
    });
  },
);

type postgresJson = Parameters<Sql["json"]>[0];

describe.skipIf(server.url === undefined)(
  `T-01 — 0024_blog up, down, up (AC-1)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "blogrt");
    }, 240_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("the down keeps blog ledger rows and restores the check NOT VALID; the up restores the tables", async () => {
      const tables = async (): Promise<(string | null)[]> =>
        (
          await scratch.sql<{ t: string | null }[]>`
            SELECT to_regclass(name)::text AS t FROM unnest(ARRAY[
              'public.blog_author', 'public.blog_post', 'public.blog_post_revision',
              'public.blog_post_country', 'public.blog_post_occasion', 'public.blog_author_public'
            ]) AS name`
        ).map((row) => row.t);
      expect(await tables()).toEqual([
        "blog_author",
        "blog_post",
        "blog_post_revision",
        "blog_post_country",
        "blog_post_occasion",
        "blog_author_public",
      ]);
      await scratch.sql`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English') ON CONFLICT DO NOTHING`;
      const ref = randomUUID();
      await scratch.sql`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code, value_hash,
                          decision, attester_name, channel)
                        VALUES ('blog_post_revision', ${ref}, 'en', ${"a".repeat(64)}, 'approved', 'founder', 'import')`;

      await runner(scratch.url, ["--down", "--to", "0023"]);
      expect(await tables()).toEqual([null, null, null, null, null, null]);
      const kept = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM review_attestation WHERE subject_kind = 'blog_post_revision' AND subject_ref = ${ref}`;
      expect(kept[0]?.n).toBe(1);
      const [check] = await scratch.sql<{ validated: boolean; def: string }[]>`
        SELECT convalidated AS validated, pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'review_attestation_subject_kind_check'`;
      expect(check?.validated).toBe(false);
      expect(check?.def).not.toContain("blog_post_revision");

      await runner(scratch.url);
      expect(await tables()).toEqual([
        "blog_author",
        "blog_post",
        "blog_post_revision",
        "blog_post_country",
        "blog_post_occasion",
        "blog_author_public",
      ]);
      const [again] = await scratch.sql<{ validated: boolean }[]>`
        SELECT convalidated AS validated FROM pg_constraint WHERE conname = 'review_attestation_subject_kind_check'`;
      expect(again?.validated).toBe(true);
    });
  },
);
