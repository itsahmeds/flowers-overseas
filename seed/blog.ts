/**
 * The blog's seed fixtures (spec 044 §5.1 "Seed", §12 "Environments"; TASK-321's carry-forward,
 * built by TASK-322): one author, one published post and one draft post, every row
 * `source = 'seed'`, so local, CI and preview builds have a real index and a real post for the
 * e2e and visual suites. **Never written by `db:seed --insert-only`**, which is the only mode
 * production allows (spec 012b AC-1): production gets no seeded post and no fixture author.
 *
 * The rows go through the same database guards as a real post: the author's own-name
 * confirmation is given as that person (`app.user_id`), the revision is approved through
 * `attest()`'s import channel (which freezes it), and the pointer moves only to an approved
 * revision (`blog_publish_guard()`). The dates are fixed, so the published page and its
 * screenshots do not change from run to run.
 *
 * Idempotent: a second run finds the author and both posts by their natural keys and writes
 * nothing (`db:seed`'s CI check: the second run reports 0 inserted, 0 updated).
 */
import { attest, executorOf } from "../src/modules/i18n/db/ledger.ts";

import type { SeedTableReport, SeedTx } from "./index.ts";

type Tx = SeedTx;

/** The fixture person: an admin profile with no role, so it can sign in to nothing. */
export const BLOG_FIXTURE_USER = {
  email: "blog-fixture@example.invalid",
  displayName: "Sample Author",
} as const;

/** When the fixture agreed to be named and when its post went live: fixed, never "now". */
export const BLOG_FIXTURE_DATES = {
  consentedAt: "2026-10-01T09:00:00Z",
  approvedAt: "2026-10-20T09:00:00Z",
  publishedAt: "2026-10-21T09:00:00Z",
} as const;

export interface BlogFixturePost {
  readonly slug: string;
  readonly status: "published" | "draft";
  readonly countries: readonly string[];
  readonly occasions: readonly string[];
  readonly title: string;
  readonly excerpt: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly bodyMd: string;
}

const PUBLISHED_BODY = [
  "A name day is a small celebration with a long memory. In Poland many people mark the feast of the saint whose name they carry, and friends and family often remember it with a call, a card or a few stems chosen with care. If you live elsewhere and want to take part, our guide to [sending flowers to Poland](fo:corridor/PL) explains how ordering works from abroad.",
  "## Why name days still matter",
  "For many families a name day feels closer than a birthday. The date is printed in calendars, colleagues mention it at work, and an older relative may expect a visit in the afternoon. A bunch of flowers says that you noticed the day, which is often all the person wanted. The gesture does not need to be grand. A simple wrap of seasonal blooms, carried to the door or sent with a short message, fits the occasion well.",
  "## Choosing the flowers",
  "Most people choose by colour and by the person rather than by strict rules. Bright mixed bunches suit a cheerful friend, while soft whites and creams suit someone who likes quiet things. Roses remain a familiar choice, and our pages on **rose bouquets** and their colours, under [roses for every kind of greeting](fo:category-hub/roses), show the shades people tend to pick for a warm, personal message.",
  "- Think about the person first: their favourite colour, the season and the room the flowers will stand in.",
  "- Keep the message short and personal; a first name and one warm line are enough.",
  "- Avoid very strong scents for someone who spends long hours at home with the windows closed.",
  "### A note on numbers",
  "In parts of Central Europe people follow an old custom about the number of stems in a gift. Odd counts are usual for happy occasions, while even counts are kept for remembrance. Nobody will check your arithmetic at the door, but it is a thoughtful detail, and it shows that you know the customs of the family you are writing to.",
  "## When the day is a sad one",
  "Sometimes a name day falls in a difficult year, after a loss in the family. In that case a calm arrangement in white or deep green may say more than a bright bunch. Our page about [flowers for sympathy and remembrance](fo:occasion-hub/sympathy) describes what people usually send when words are hard to find, and how a short note can stay gentle and plain.",
  "1. Check the date in a Polish calendar, since one name can have several feast days in a year.",
  "2. Choose a bunch that suits the person and the season, and keep the card short.",
  "3. Send it in good time, and add a call on the day itself if you can.",
  "## Writing the card",
  "The words on the card matter as much as the flowers. Many people write in Polish even when they are not fluent, because a familiar phrase in the recipient's own language feels close and kind. A simple wish for health and happiness is traditional, and nobody expects poetry. If you prefer to write in English, a warm sentence in plain words works just as well, and it will be read more than once.",
  "Whatever you choose, the point of a name day gift is attention. A few well chosen stems, a short line in a friendly hand and a call later in the day tell someone far away that they are remembered, and that is the custom at its heart.",
].join("\n\n");

const DRAFT_BODY = [
  "This draft is a seed fixture. It exists so that the suites can prove a draft never answers at a public address, and it is never published by the seed.",
  "## A heading in the draft",
  "The rest of the text is plain prose about choosing seasonal flowers for a friend, with a link to our guide on [sending flowers to Germany](fo:corridor/DE).",
].join("\n\n");

export const BLOG_FIXTURE_POSTS: readonly BlogFixturePost[] = [
  {
    slug: "choosing-flowers-for-a-polish-name-day",
    status: "published",
    countries: ["PL"],
    occasions: ["name_day"],
    title: "Choosing flowers for a Polish name day",
    excerpt:
      "Name days are a warm tradition in Poland. Here is how people choose flowers for the day, what the old custom about the number of stems means, and how to write a short card that will be read more than once.",
    seoTitle: "Choosing flowers for a Polish name day",
    seoDescription:
      "How people in Poland mark a name day with flowers: colours, the custom about the number of stems, and a short card.",
    bodyMd: PUBLISHED_BODY,
  },
  {
    slug: "seed-fixture-draft",
    status: "draft",
    countries: ["DE"],
    occasions: [],
    title: "A draft that never goes live",
    excerpt:
      "This draft exists so that the suites can prove a draft has no public address. It stays a draft in every environment, and the seed never approves or publishes it, so its URL is a 404.",
    seoTitle: "A draft that never goes live",
    seoDescription:
      "A seed fixture draft: it has no public address and the seed never approves or publishes it.",
    bodyMd: DRAFT_BODY,
  },
];

async function one<T>(
  tx: Tx,
  query: string,
  parameters: readonly unknown[],
): Promise<T | undefined> {
  const rows = (await tx.unsafe(
    query,
    parameters as never[],
  )) as unknown as T[];
  return rows[0];
}

async function run(
  tx: Tx,
  query: string,
  parameters: readonly unknown[] = [],
): Promise<void> {
  await tx.unsafe(query, parameters as never[]);
}

/** The seed's own user and admin profile, by email; returns the user id and whether it wrote. */
async function fixtureUser(tx: Tx): Promise<{ id: string; inserted: number }> {
  const existing = await one<{ id: string }>(
    tx,
    "SELECT id FROM public.users WHERE email = $1",
    [BLOG_FIXTURE_USER.email],
  );
  if (existing !== undefined) return { id: existing.id, inserted: 0 };
  const user = await one<{ id: string }>(
    tx,
    "INSERT INTO public.users (email, name) VALUES ($1, $2) RETURNING id",
    [BLOG_FIXTURE_USER.email, BLOG_FIXTURE_USER.displayName],
  );
  const id = user?.id ?? "";
  await run(
    tx,
    "INSERT INTO public.admin_profile (user_id, display_name) VALUES ($1, $2)",
    [id, BLOG_FIXTURE_USER.displayName],
  );
  return { id, inserted: 2 };
}

/** The author, with the person's own-name confirmation given as that person. */
async function fixtureAuthor(
  tx: Tx,
  userId: string,
): Promise<{ id: string; inserted: number }> {
  const existing = await one<{ id: string }>(
    tx,
    "SELECT id FROM public.blog_author WHERE user_id = $1",
    [userId],
  );
  if (existing !== undefined) return { id: existing.id, inserted: 0 };
  await run(tx, "SELECT set_config('app.user_id', $1, true)", [userId]);
  const author = await one<{ id: string }>(
    tx,
    `INSERT INTO public.blog_author (user_id, display_name, consented_at, own_name_confirmed_at, source)
     VALUES ($1, $2, $3::timestamptz, $3::timestamptz, 'seed') RETURNING id`,
    [userId, BLOG_FIXTURE_USER.displayName, BLOG_FIXTURE_DATES.consentedAt],
  );
  await run(tx, "SELECT set_config('app.user_id', '', true)");
  return { id: author?.id ?? "", inserted: 1 };
}

/**
 * The seed's twin of the `publishPost` command (`src/modules/content/blog/db/commands.ts`), which
 * the seed cannot import (it reads the site's link predicates through the `@/` alias): the same
 * two statements, with the fixture's fixed dates. `blog_publish_guard()` still refuses a revision
 * with no approval for its current hash, an unconfirmed name or a withdrawn author.
 */
async function publishPost(
  tx: Tx,
  postId: string,
  revisionId: string,
): Promise<void> {
  await run(
    tx,
    `UPDATE public.blog_post
        SET published_revision_id = $2::uuid, status = 'published',
            first_published_at = $3::timestamptz
      WHERE id = $1::uuid`,
    [postId, revisionId, BLOG_FIXTURE_DATES.publishedAt],
  );
  await run(
    tx,
    `UPDATE public.blog_post_revision SET published_at = $2::timestamptz
      WHERE id = $1::uuid AND published_at IS NULL`,
    [revisionId, BLOG_FIXTURE_DATES.publishedAt],
  );
}

async function fixturePost(
  tx: Tx,
  authorId: string,
  userId: string,
  post: BlogFixturePost,
): Promise<number> {
  const existing = await one<{ id: string }>(
    tx,
    "SELECT id FROM public.blog_post WHERE locale_code = 'en' AND slug = $1",
    [post.slug],
  );
  if (existing !== undefined) return 0;
  const row = await one<{ id: string }>(
    tx,
    `INSERT INTO public.blog_post (locale_code, slug, author_id, source)
     VALUES ('en', $1, $2::uuid, 'seed') RETURNING id`,
    [post.slug, authorId],
  );
  const postId = row?.id ?? "";
  for (const [sort, iso2] of post.countries.entries()) {
    await run(
      tx,
      `INSERT INTO public.blog_post_country (post_id, country_id, sort)
       SELECT $1::uuid, id, $3 FROM public.country WHERE iso2 = $2`,
      [postId, iso2, sort],
    );
  }
  for (const key of post.occasions) {
    await run(
      tx,
      `INSERT INTO public.blog_post_occasion (post_id, occasion_id)
       SELECT $1::uuid, id FROM public.occasion WHERE key = $2`,
      [postId, key],
    );
  }
  const revision = await one<{ id: string; value_hash: string }>(
    tx,
    `INSERT INTO public.blog_post_revision (post_id, title, excerpt, seo_title, seo_description,
                                            body_md, created_by)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid) RETURNING id, value_hash`,
    [
      postId,
      post.title,
      post.excerpt,
      post.seoTitle,
      post.seoDescription,
      post.bodyMd,
      userId,
    ],
  );
  if (post.status === "published" && revision !== undefined) {
    const outcome = await attest({
      channel: "import",
      entry: {
        subjectKind: "blog_post_revision",
        subjectRef: revision.id,
        localeCode: "en",
        valueHash: revision.value_hash,
        sourceHash: null,
        decision: "approved",
        attesterName: BLOG_FIXTURE_USER.displayName,
        attestedAt: BLOG_FIXTURE_DATES.approvedAt,
        channel: "import",
      },
      db: executorOf((text, parameters) =>
        tx.unsafe(text, parameters as never[]),
      ),
      mirror: true,
    });
    if (!outcome.ok)
      throw new Error(`db:seed: blog fixture approval: ${outcome.refusal}`);
    await publishPost(tx, postId, revision.id);
  }
  return 1;
}

/**
 * Write the fixtures unless `insertOnly` (production's only mode): one author, the published post
 * and the draft. Returns one report row for `db:seed`'s summary.
 */
export async function seedBlogFixtures(
  tx: Tx,
  insertOnly: boolean,
): Promise<SeedTableReport> {
  if (insertOnly) {
    return {
      table: "blog_fixtures",
      rows: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      real: 0,
      underReal: 0,
    };
  }
  const user = await fixtureUser(tx);
  const author = await fixtureAuthor(tx, user.id);
  let posts = 0;
  for (const post of BLOG_FIXTURE_POSTS) {
    posts += await fixturePost(tx, author.id, user.id, post);
  }
  const rows = 3 + BLOG_FIXTURE_POSTS.length;
  const inserted = user.inserted + author.inserted + posts;
  return {
    table: "blog_fixtures",
    rows,
    inserted,
    updated: 0,
    unchanged: rows - inserted,
    real: 0,
    underReal: 0,
  };
}
