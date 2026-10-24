/**
 * Shared fixtures for the public blog pages (spec 044 §2.7, T-08 to T-14, T-23; TASK-322): one
 * published record, link targets that resolve two references and lose the rest, and the paths a
 * build would have emitted for it.
 */
import type { BlogLinkTargets } from "../../src/modules/content/blog/markdown.ts";
import type { BlogPostRecord } from "../../src/modules/content/blog/provider.ts";

import { blogBody } from "./blog.ts";

export const POST_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_POST_ID = "22222222-2222-4222-8222-222222222222";
export const MISSING_POST_ID = "33333333-3333-4333-8333-333333333333";
export const SLUG = "choosing-flowers-for-a-polish-name-day";

/** A body with the subset, two live references, a vanished one and literal markup. */
export const BODY = [
  blogBody(1),
  `A post we took down: [our older name day note](fo:post/${MISSING_POST_ID}) stays readable.`,
  "<script>alert(1)</script> and ![a picture](https://example.com/a.png)",
  "| a | b |",
  "- One stem for each year of friendship.\n- A short card in the recipient's language.",
  "1. Check the date.\n2. Choose the bunch.",
  "### A small heading",
  "**Bold words** and *a slanted phrase* close the piece.",
].join("\n\n");

export function postRecord(
  overrides: Partial<BlogPostRecord> = {},
): BlogPostRecord {
  return {
    postId: POST_ID,
    revisionId: "44444444-4444-4444-8444-444444444444",
    locale: "en",
    slug: SLUG,
    title: "Choosing flowers for a Polish name day",
    excerpt:
      "Name days are a warm tradition in Poland. Here is how people choose flowers for the day and how to write a short card that will be read more than once.",
    seoTitle: "Flowers for a Polish name day",
    seoDescription:
      "How people in Poland mark a name day with flowers, and how to write the card.",
    bodyMd: BODY,
    coverMediaId: null,
    coverAlt: null,
    authorId: "55555555-5555-4555-8555-555555555555",
    authorName: "Sample Author",
    countries: ["PL", "DE"],
    occasions: ["name_day"],
    firstPublishedAt: "2026-10-21T09:00:00.000Z",
    revisionPublishedAt: "2026-10-21T15:30:00.000Z",
    reviewed: true,
    ...overrides,
  };
}

/** Paths the fake targets resolve; anything else does not exist now. */
export const TARGET_PATHS: Readonly<Record<string, string>> = {
  "corridor/PL": "/en/send-flowers-to/poland",
  "occasion-hub/name_day": "/en/occasions/name-day",
};

export const fakeTargets: BlogLinkTargets = {
  pathOf: (ref) =>
    Promise.resolve(TARGET_PATHS[`${ref.kind}/${ref.id}`] ?? null),
};

/** The fixture post's URLs, as the build would emit them, in both English locales. */
export const EMITTED = [
  "/en/blog",
  `/en/blog/${SLUG}`,
  "/en-gb/blog",
  `/en-gb/blog/${SLUG}`,
] as const;
