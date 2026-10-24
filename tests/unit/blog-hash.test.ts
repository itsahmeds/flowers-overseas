/**
 * T-04, unit half (spec 044 §2.4, AC-4; TASK-321): the `blog_post_revision` subject hash changes
 * when, and only when, one of the ten hashed fields changes. The integration suite holds it equal
 * to the database trigger's `review_blog_revision_hash()` on the same fixture.
 */
import { describe, expect, it } from "vitest";

import {
  type BlogRevisionContent,
  blogRevisionHash,
  subjectHash,
} from "../../src/modules/i18n/attestation.ts";
import { HASH_FIXTURE } from "../fixtures/blog.ts";

/** One changed value per hashed field. */
const CHANGES: readonly [
  keyof BlogRevisionContent,
  BlogRevisionContent[keyof BlogRevisionContent],
][] = [
  ["title", "How to send flowers to Poland"],
  ["slug", "send-flowers-poland"],
  ["excerpt", "Another excerpt."],
  ["seoTitle", "Another SEO title"],
  ["seoDescription", "Another SEO description."],
  ["bodyMd", "## Name days\n\nRead [our guide](fo:corridor/DE)."],
  ["coverMediaId", null],
  ["coverAlt", null],
  [
    "honestyAllow",
    [
      {
        sentence: "Read the reviews.",
        rule: "review",
        reason: "another reason",
      },
    ],
  ],
  ["authorId", "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"],
];

describe("blogRevisionHash (T-04)", () => {
  const base = blogRevisionHash(HASH_FIXTURE);

  it("covers exactly the ten fields", () => {
    expect(CHANGES.map(([field]) => field).sort()).toEqual(
      Object.keys(HASH_FIXTURE).sort(),
    );
  });

  for (const [field, value] of CHANGES) {
    it(`changes when ${field} changes`, () => {
      expect(blogRevisionHash({ ...HASH_FIXTURE, [field]: value })).not.toBe(
        base,
      );
    });
  }

  it("does not change for the same content, an upper-case id, or a re-ordered object", () => {
    expect(blogRevisionHash({ ...HASH_FIXTURE })).toBe(base);
    expect(
      blogRevisionHash({
        ...HASH_FIXTURE,
        authorId: HASH_FIXTURE.authorId.toUpperCase(),
      }),
    ).toBe(base);
    const { title, ...rest } = HASH_FIXTURE;
    expect(blogRevisionHash({ ...rest, title })).toBe(base);
  });

  it("no field can imitate a boundary with another (length-prefixed parts)", () => {
    expect(
      blogRevisionHash({ ...HASH_FIXTURE, title: "a|5:b", seoTitle: "" }),
    ).not.toBe(
      blogRevisionHash({ ...HASH_FIXTURE, title: "a", seoTitle: "b" }),
    );
  });

  it("is subjectHash() for the kind, as 64 lower-case hex digits", () => {
    expect(subjectHash({ kind: "blog_post_revision", ...HASH_FIXTURE })).toBe(
      base,
    );
    expect(base).toMatch(/^[0-9a-f]{64}$/u);
  });
});
