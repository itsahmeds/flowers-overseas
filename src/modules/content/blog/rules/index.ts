/**
 * The blog's hard and soft rules (spec 044 §2.3, §5.2 `validateBlogRevision`, AC-5, AC-6;
 * TASK-321). Run on every save, again on approval and again on publish, so a reference whose
 * target stopped existing between save and publish is refused at publish (`blog/link-corridor`).
 *
 * Each result carries a stable rule id under `blog/` (spec 012b §2.5's pattern), the field it is
 * about and the parameters its admin message names (`admin.blog.rule.*` in
 * the admin catalogue); a relay refusal names the pattern id, the matched word as written and
 * the whole sentence (advisor fix 1 (a)).
 *
 * The honesty lists are imported, never copied: `src/config/honesty.ts`, `src/config/voice.ts`,
 * `src/config/freshness-claim.ts`, `src/config/competitors.ts`; the distinctness measure is
 * `corridor:check`'s (`src/lib/distinctness.ts`). Pure: everything that needs the database or the
 * route registry arrives in `BlogRuleContext`.
 */
import { COMPETITOR_MARKS } from "@/config/competitors";
import { guaranteeTextViolations } from "@/config/freshness-claim";
import {
  CLAIM_PATTERNS,
  PRICE_LITERAL_PATTERN,
  proseRelayPatterns,
  relayMatches,
  SCALE_CLAIM_PATTERN,
  sentencesOf,
} from "@/config/honesty";
import { bannedVoiceWordsIn } from "@/config/voice";
import { shingleDistinctness } from "@/lib/distinctness";

import {
  blogLinksOf,
  blogMarkdownBlocks,
  blogMarkdownWarnings,
  blogPlainText,
} from "../markdown.ts";
import {
  BLOG_ANCHOR_WORDS_MIN,
  BLOG_BODY_WORDS_MIN,
  BLOG_BODY_WORDS_SOFT_MAX,
  BLOG_DISTINCTNESS_MIN,
  BLOG_EXCERPT_MAX,
  BLOG_EXCERPT_MIN,
  BLOG_GENERIC_ANCHORS,
  BLOG_HEADING_EXPECTED_ABOVE_WORDS,
  BLOG_RESERVED_SLUGS,
  BLOG_SEO_DESCRIPTION_MAX,
  BLOG_SEO_TITLE_MAX,
  BLOG_SLUG_PATTERN,
  BLOG_TITLE_MAX,
  BLOG_TITLE_SOFT_MAX,
  blogLinkRefText,
  type BlogRevisionFields,
} from "../schemas.ts";

/** The hard rules: each refuses the save, the approval and the publish (§2.3). */
export const BLOG_HARD_RULES = [
  "blog/slug-shape",
  "blog/slug-reserved",
  "blog/length",
  "blog/country-tag",
  "blog/link-corridor",
  "blog/link-occasion-or-category",
  "blog/anchor-generic",
  "blog/min-words",
  "blog/distinct",
  "blog/raw-contact",
  "blog/price-literal",
  "blog/scale-claim",
  "blog/relay",
  "blog/voice",
  "blog/freshness",
  "blog/competitor",
  "blog/claim",
  "blog/allow-stale",
  "blog/h1-in-body",
] as const;

/** The soft rules: each warns and saves (§2.3), shown on the preview. */
export const BLOG_SOFT_RULES = [
  "blog/title-long",
  "blog/body-long",
  "blog/no-heading",
  "blog/unknown-construct",
] as const;

export type BlogHardRule = (typeof BLOG_HARD_RULES)[number];
export type BlogSoftRule = (typeof BLOG_SOFT_RULES)[number];
export type BlogRuleId = BlogHardRule | BlogSoftRule;

/** The fields a rule is about: the revision's, the slug, the tags, or an allow entry. */
export type BlogRuleField =
  | "title"
  | "excerpt"
  | "seoTitle"
  | "seoDescription"
  | "bodyMd"
  | "coverAlt"
  | "slug"
  | "countries"
  | `honestyAllow.${number}`;

export interface BlogRuleResult {
  readonly id: BlogRuleId;
  readonly severity: "hard" | "soft";
  readonly field: BlogRuleField;
  /** The values the admin message names (`admin.blog.rule.<name>`). */
  readonly params: Readonly<Record<string, string | number>>;
}

/** What a rule reads about the post beside the revision. */
export interface BlogRuleInput {
  /** The post's locale (slice A: `en`). */
  readonly locale: string;
  readonly slug: string;
  /** Destination country tags (ISO alpha-2), in tag order. */
  readonly countries: readonly string[];
  readonly revision: BlogRevisionFields;
}

/** What the rules need from outside: link existence now, and the texts to stay distinct from. */
export interface BlogRuleContext {
  /** `fo:<kind>/<id>` of every reference whose target exists in the post's locale now. */
  readonly existingRefs: ReadonlySet<string>;
  /** The bodies of the locale's other posts (their latest revision), by post id. */
  readonly otherPosts: readonly {
    readonly postId: string;
    readonly bodyMd: string;
  }[];
  /** The corridor guide text of each tagged country in the post's locale, where one exists. */
  readonly corridorGuides: readonly {
    readonly iso2: string;
    readonly text: string;
  }[];
}

/** Whitespace-separated tokens holding a letter or a digit (`seed/copy.ts`'s `wordCount`). */
export function blogWordCount(text: string): number {
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}

const normalise = (sentence: string): string =>
  sentence.replaceAll(/\s+/gu, " ").trim();

/** URL-, email- and phone-shaped strings (§2.3 rule 4; spec 012b §2.5). */
const RAW_CONTACT: readonly {
  readonly kind: string;
  readonly pattern: RegExp;
}[] = [
  {
    kind: "email",
    pattern: /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/iu,
  },
  { kind: "url", pattern: /\b(?:https?:\/\/|www\.)\S+/iu },
  {
    kind: "url",
    pattern:
      /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|eu|pl|de|uk|co|io|info|shop|fr|it|es|nl|be|at|ch|ie)\b/iu,
  },
  { kind: "phone", pattern: /\+\d[\d\s()-]{7,17}\d/u },
  { kind: "phone", pattern: /(?<!\d)\d{3}[\s-]\d{3}[\s-]\d{3,4}(?!\d)/u },
];

/** Every hard and soft rule result for one revision (§2.3). An empty array saves cleanly. */
export function validateBlogRevision(
  input: BlogRuleInput,
  context: BlogRuleContext,
): readonly BlogRuleResult[] {
  const results: BlogRuleResult[] = [];
  const hard = (
    id: BlogHardRule,
    field: BlogRuleField,
    params: Readonly<Record<string, string | number>> = {},
  ): void => {
    results.push({ id, severity: "hard", field, params });
  };
  const soft = (
    id: BlogSoftRule,
    field: BlogRuleField,
    params: Readonly<Record<string, string | number>> = {},
  ): void => {
    results.push({ id, severity: "soft", field, params });
  };
  const { revision } = input;

  /* 1. Shape ---------------------------------------------------------------- */
  if (!BLOG_SLUG_PATTERN.test(input.slug)) hard("blog/slug-shape", "slug");
  if ((BLOG_RESERVED_SLUGS as readonly string[]).includes(input.slug)) {
    hard("blog/slug-reserved", "slug", { slug: input.slug });
  }
  const lengths: readonly [BlogRuleField, number, number, number][] = [
    ["title", revision.title.length, 1, BLOG_TITLE_MAX],
    ["excerpt", revision.excerpt.length, BLOG_EXCERPT_MIN, BLOG_EXCERPT_MAX],
    ["seoTitle", revision.seoTitle.length, 1, BLOG_SEO_TITLE_MAX],
    [
      "seoDescription",
      revision.seoDescription.length,
      1,
      BLOG_SEO_DESCRIPTION_MAX,
    ],
  ];
  for (const [field, length, min, max] of lengths) {
    if (length < min || length > max) {
      hard("blog/length", field, { length, min, max });
    }
  }
  if (input.countries.length === 0) hard("blog/country-tag", "countries");

  /* 2. Link flow -------------------------------------------------------------- */
  const blocks = blogMarkdownBlocks(revision.bodyMd);
  const links = blogLinksOf(blocks);
  const resolves = (kinds: readonly string[]): boolean =>
    links.some(
      ({ ref }) =>
        kinds.includes(ref.kind) &&
        context.existingRefs.has(blogLinkRefText(ref)),
    );
  if (!resolves(["corridor"])) hard("blog/link-corridor", "bodyMd");
  if (!resolves(["occasion-hub", "category-hub"])) {
    hard("blog/link-occasion-or-category", "bodyMd");
  }
  const generic = BLOG_GENERIC_ANCHORS.en;
  for (const { anchor } of links) {
    const bare = anchor
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}\s]/gu, "")
      .replaceAll(/\s+/gu, " ")
      .trim();
    if (
      blogWordCount(anchor) < BLOG_ANCHOR_WORDS_MIN ||
      generic.includes(bare)
    ) {
      hard("blog/anchor-generic", "bodyMd", { anchor });
    }
  }

  /* 3. Substance ------------------------------------------------------------- */
  const body = blogPlainText(blocks);
  const words = blogWordCount(body);
  if (words < BLOG_BODY_WORDS_MIN) {
    hard("blog/min-words", "bodyMd", { words, min: BLOG_BODY_WORDS_MIN });
  }
  const others: readonly { readonly against: string; readonly text: string }[] =
    [
      ...context.otherPosts.map((post) => ({
        against: `post:${post.postId}`,
        text: blogPlainText(blogMarkdownBlocks(post.bodyMd)),
      })),
      ...context.corridorGuides.map((guide) => ({
        against: `corridor:${guide.iso2}`,
        text: guide.text,
      })),
    ];
  for (const other of others) {
    const score = shingleDistinctness(body, other.text);
    if (score < BLOG_DISTINCTNESS_MIN) {
      hard("blog/distinct", "bodyMd", {
        against: other.against,
        score: Math.round(score * 1000) / 1000,
        min: BLOG_DISTINCTNESS_MIN,
      });
    }
  }

  /* 4. Raw links and contact data ------------------------------------------- */
  // The body as written, without its references (links exist only as references).
  const rawBody = revision.bodyMd.replaceAll(
    /\]\(fo:[a-z-]+\/[^)\s]+\)/gu,
    "]",
  );
  const rawFields: readonly [BlogRuleField, string][] = [
    ["title", revision.title],
    ["excerpt", revision.excerpt],
    ["seoTitle", revision.seoTitle],
    ["seoDescription", revision.seoDescription],
    ["bodyMd", rawBody],
    ["coverAlt", revision.coverAlt ?? ""],
  ];
  for (const [field, text] of rawFields) {
    for (const { kind, pattern } of RAW_CONTACT) {
      const found = pattern.exec(text);
      if (found !== null) {
        hard("blog/raw-contact", field, { kind, match: found[0] });
        break;
      }
    }
  }

  /* 5. The honesty gate ------------------------------------------------------ */
  const prose: readonly [BlogRuleField, string][] = [
    ["title", revision.title],
    ["excerpt", revision.excerpt],
    ["seoTitle", revision.seoTitle],
    ["seoDescription", revision.seoDescription],
    ["bodyMd", body],
    ["coverAlt", revision.coverAlt ?? ""],
  ];
  const allowed = new Set(
    revision.honestyAllow.map((entry) => normalise(entry.sentence)),
  );
  const allowUsed = new Set<string>();
  const relayPatterns = proseRelayPatterns();
  for (const [field, text] of prose) {
    if (text === "") continue;
    const price = PRICE_LITERAL_PATTERN.exec(text);
    if (price !== null) {
      hard("blog/price-literal", field, { match: price[0].trim() });
    }
    const scale = SCALE_CLAIM_PATTERN.exec(text);
    if (scale !== null) {
      hard("blog/scale-claim", field, { match: scale[0].trim() });
    }
    for (const match of relayMatches(text, input.locale, relayPatterns)) {
      hard("blog/relay", field, {
        pattern: match.id,
        match: match.match,
        sentence: match.sentence,
      });
    }
    for (const word of bannedVoiceWordsIn(text)) {
      hard("blog/voice", field, { word });
    }
    for (const violation of guaranteeTextViolations(text)) {
      hard("blog/freshness", field, {
        check: violation.check,
        detail: violation.detail,
      });
    }
    const lower = text.toLowerCase();
    for (const mark of COMPETITOR_MARKS) {
      if (lower.includes(mark)) hard("blog/competitor", field, { mark });
    }
    for (const sentence of sentencesOf(text)) {
      const key = normalise(sentence);
      for (const claim of CLAIM_PATTERNS) {
        const found = claim.pattern.exec(sentence);
        if (found === null) continue;
        if (allowed.has(key)) {
          allowUsed.add(key);
          continue;
        }
        hard("blog/claim", field, {
          label: claim.label,
          match: found[0].trim(),
          sentence: key,
        });
      }
    }
  }
  revision.honestyAllow.forEach((entry, index) => {
    if (!allowUsed.has(normalise(entry.sentence))) {
      hard("blog/allow-stale", `honestyAllow.${index}`, {
        sentence: entry.sentence,
      });
    }
  });

  /* The body's own constructs ---------------------------------------------- */
  for (const warning of blogMarkdownWarnings(revision.bodyMd)) {
    if (warning.construct === "h1") {
      hard("blog/h1-in-body", "bodyMd", { line: warning.line });
    } else {
      soft("blog/unknown-construct", "bodyMd", {
        line: warning.line,
        construct: warning.construct,
      });
    }
  }

  /* Soft rules ---------------------------------------------------------------- */
  if (revision.title.length > BLOG_TITLE_SOFT_MAX) {
    soft("blog/title-long", "title", {
      length: revision.title.length,
      max: BLOG_TITLE_SOFT_MAX,
    });
  }
  if (words > BLOG_BODY_WORDS_SOFT_MAX) {
    soft("blog/body-long", "bodyMd", {
      words,
      max: BLOG_BODY_WORDS_SOFT_MAX,
    });
  }
  if (
    words > BLOG_HEADING_EXPECTED_ABOVE_WORDS &&
    !blocks.some((block) => block.kind === "h2")
  ) {
    soft("blog/no-heading", "bodyMd", { words });
  }
  return results;
}

/** The hard results only: a non-empty list refuses the save, the approval or the publish. */
export function hardFailures(
  results: readonly BlogRuleResult[],
): readonly BlogRuleResult[] {
  return results.filter((result) => result.severity === "hard");
}

/** Every `fo:` reference in a body (the caller resolves them into `existingRefs`). */
export function blogBodyRefs(bodyMd: string): readonly string[] {
  return [
    ...new Set(
      blogLinksOf(blogMarkdownBlocks(bodyMd)).map(({ ref }) =>
        blogLinkRefText(ref),
      ),
    ),
  ];
}

/**
 * The admin message a result is shown with: `blog/slug-shape` reads `admin.blog.rule.slugShape`
 * in the admin catalogue, formatted with the result's `params` (spec 044 §5.3).
 */
export function blogRuleMessageKey(id: BlogRuleId): string {
  const name = id
    .slice("blog/".length)
    .replaceAll(/-([a-z0-9])/gu, (_, letter: string) => letter.toUpperCase());
  return `admin.blog.rule.${name}`;
}
