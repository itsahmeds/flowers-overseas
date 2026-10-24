/**
 * The public blog's database half on a migrated scratch database (spec 044 §5.1 "Seed", §5.4,
 * §6; AC-8, AC-10, AC-16 purge half; TASK-322).
 *
 *  - **The seed fixtures** (TASK-321's carry-forward): one author, one published post, one draft,
 *    `source = 'seed'`, through the database's own guards; a second run writes nothing; the
 *    production mode (`--insert-only`) writes none of them.
 *  - **The public read** (`readPublishedPosts`) as `app_web` and as `app_build`: exactly the
 *    published fixture, `reviewed` true; a reassignment to another author makes it read
 *    `reviewed: false` (§6's term, TASK-321's carry-forward) until a new revision is approved.
 *  - **The cache tags** resolve to the post's URLs whatever its status, so an unpublish purges
 *    the URL it took down.
 */
import { sql as drizzleSql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { seedBlogFixtures } from "../../seed/blog.ts";
import { readPublishedPosts } from "../../src/modules/content/blog/db/provider.ts";
import { blogTagPaths } from "../../src/modules/content/blog/db/tags.ts";
import {
  asApp,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
} from "./support/scratch-db.ts";

vi.mock("@/lib/sentry", () => ({ captureGuardError: () => undefined }));

const server = await probeLocalServer();
const dialect = new PgDialect();

const PUBLISHED = "choosing-flowers-for-a-polish-name-day";
const DRAFT = "seed-fixture-draft";

async function referenceData(sql: Sql): Promise<void> {
  await sql`INSERT INTO locale (code, bcp47, name) VALUES
              ('en', 'en', 'English'), ('en-gb', 'en-GB', 'English (UK)')
            ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO currency (code, minor_unit_exponent) VALUES ('PLN', 2), ('EUR', 2)
            ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone) VALUES
              ('PL', 'PLN', 2300, 'Europe/Warsaw'), ('DE', 'EUR', 1900, 'Europe/Berlin')
            ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO occasion (key, kind) VALUES ('name_day', 'evergreen')
            ON CONFLICT DO NOTHING`;
}

/** `readPublishedPosts`' reader, running its statement as `role` in one rolled-back transaction. */
function readerAs(sql: Sql, role: "app_web" | "app_build") {
  return <T>(
    fn: (db: { execute(query: SQL): Promise<unknown> }) => Promise<T>,
  ): Promise<T> =>
    rolledBack(sql, async (tx) => {
      if (role === "app_web") await asApp(tx, { role: "public" });
      else await tx.unsafe("SET LOCAL ROLE app_build");
      return fn({
        execute: async (query: SQL) => {
          const compiled = dialect.sqlToQuery(query);
          return tx.unsafe(compiled.sql, compiled.params as never[]);
        },
      });
    });
}

describe.skipIf(server.url === undefined)(
  `the public blog's database half (spec 044 AC-8, AC-10, AC-16)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "blogpages");
      await referenceData(scratch.sql);
      await scratch.sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE app_owner");
        await seedBlogFixtures(tx, false);
      });
    });

    afterAll(async () => {
      await scratch.drop();
    });

    it("seeds one author, a published post and a draft, all `source = 'seed'`, and is idempotent", async () => {
      const posts = await scratch.sql<
        {
          slug: string;
          status: string;
          source: string;
          first_published_at: Date | null;
        }[]
      >`SELECT slug, status, source, first_published_at FROM blog_post ORDER BY slug`;
      expect(
        posts.map((post) => [post.slug, post.status, post.source]),
      ).toEqual([
        [PUBLISHED, "published", "seed"],
        [DRAFT, "draft", "seed"],
      ]);
      expect(posts[0]?.first_published_at?.toISOString()).toBe(
        "2026-10-21T09:00:00.000Z",
      );
      const [author] = await scratch.sql<
        { display_name: string; source: string; confirmed: boolean }[]
      >`SELECT display_name, source, own_name_confirmed_at IS NOT NULL AS confirmed FROM blog_author`;
      expect(author).toEqual({
        display_name: "Sample Author",
        source: "seed",
        confirmed: true,
      });
      const again = await scratch.sql.begin(async (tx) => {
        await tx.unsafe("SET LOCAL ROLE app_owner");
        return seedBlogFixtures(tx, false);
      });
      expect(again.inserted).toBe(0);
      expect(again.updated).toBe(0);
    });

    it("writes nothing in production's insert-only mode", async () => {
      const { report, before, after } = await rolledBack(
        scratch.sql,
        async (tx) => {
          await tx.unsafe("SET LOCAL ROLE app_owner");
          // An empty blog, as a production database starts (TRUNCATE fires no row trigger).
          await tx.unsafe(
            "TRUNCATE blog_post_occasion, blog_post_country, blog_post_revision, blog_post, blog_author CASCADE",
          );
          const count = async () =>
            (
              await tx<{ n: number }[]>`
              SELECT ((SELECT count(*) FROM blog_post) + (SELECT count(*) FROM blog_author))::int AS n`
            )[0]?.n;
          const before = await count();
          const report = await seedBlogFixtures(tx, true);
          return { report, before, after: await count() };
        },
      );
      expect(before).toBe(0);
      expect(after).toBe(0);
      expect(report.inserted).toBe(0);
    });

    for (const role of ["app_web", "app_build"] as const) {
      it(`reads exactly the published fixture as ${role}, reviewed, with its tags and byline`, async () => {
        const records = await readPublishedPosts(readerAs(scratch.sql, role));
        expect(records.map((record) => record.slug)).toEqual([PUBLISHED]);
        expect(records[0]).toMatchObject({
          locale: "en",
          authorName: "Sample Author",
          countries: ["PL"],
          occasions: ["name_day"],
          firstPublishedAt: "2026-10-21T09:00:00.000Z",
          revisionPublishedAt: "2026-10-21T09:00:00.000Z",
          reviewed: true,
        });
      });
    }

    it("reads `reviewed: false` once the post is reassigned to another author (§6)", async () => {
      const reviewed = await rolledBack(scratch.sql, async (tx) => {
        await tx.unsafe("SET LOCAL ROLE app_owner");
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('second-author@example.invalid') RETURNING id`;
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${user?.id ?? ""}, 'Second Author')`;
        const [author] = await tx<{ id: string }[]>`
          INSERT INTO blog_author (user_id, display_name, consented_at)
          VALUES (${user?.id ?? ""}, 'Second Author', now()) RETURNING id`;
        await tx`UPDATE blog_post SET author_id = ${author?.id ?? ""} WHERE slug = ${PUBLISHED}`;
        await asApp(tx, { role: "public" });
        const [row] = await tx<{ reviewed: boolean }[]>`
          SELECT r.value_hash = public.review_blog_revision_current_hash(r.id) AS reviewed
            FROM blog_post p JOIN blog_post_revision r ON r.id = p.published_revision_id
           WHERE p.slug = ${PUBLISHED}`;
        return row?.reviewed;
      });
      expect(reviewed).toBe(false);
    });

    it("resolves a post's tag to both English URLs, also after an unpublish", async () => {
      const read = (query: SQL) =>
        rolledBack(scratch.sql, async (tx) => {
          await asApp(tx, { role: "system" });
          const compiled = dialect.sqlToQuery(query);
          return (await tx.unsafe(
            compiled.sql,
            compiled.params as never[],
          )) as unknown as {
            locale_code: string;
            slug: string;
          }[];
        });
      const [post] = await scratch.sql<{ id: string }[]>`
        SELECT id FROM blog_post WHERE slug = ${PUBLISHED}`;
      const id = post?.id ?? "";
      expect(await blogTagPaths(`blog:post:${id}`, read)).toEqual([
        `/en/blog/${PUBLISHED}`,
        `/en-gb/blog/${PUBLISHED}`,
      ]);
      // The draft was never published: the locale tag names the index and the live post only.
      expect(await blogTagPaths("blog:en", read)).toEqual([
        "/en/blog",
        "/en-gb/blog",
        `/en/blog/${PUBLISHED}`,
        `/en-gb/blog/${PUBLISHED}`,
      ]);
      const afterUnpublish = await rolledBack(scratch.sql, async (tx) => {
        await tx.unsafe("SET LOCAL ROLE app_owner");
        await tx`UPDATE blog_post SET status = 'unpublished', unpublished_at = now(),
                   unpublish_reason = 'takedown test' WHERE id = ${id}`;
        await asApp(tx, { role: "system" });
        const compiled = dialect.sqlToQuery(
          drizzleSql`SELECT locale_code, slug FROM public.blog_post WHERE id = ${id}::uuid`,
        );
        return tx.unsafe(compiled.sql, compiled.params as never[]);
      });
      expect(afterUnpublish).toHaveLength(1);
    });
  },
);
