/**
 * Shared blog fixtures (spec 044 §10 T-03 to T-07, T-17; TASK-321): a deterministic body that
 * passes every hard rule, and the revision fields around it.
 *
 * `blogProse(seed, words)` writes plain, varied English sentences about flowers from a seeded
 * generator, so two seeds share almost no five-word run (rule 3's distinctness) and no sentence
 * trips a claim, price, scale, relay, voice, freshness, competitor or contact pattern.
 */
import type { BlogRevisionFields } from "../../src/modules/content/blog/schemas.ts";
import type { BlogRevisionContent } from "../../src/modules/i18n/attestation.ts";

const ADJECTIVES = [
  "bright", "soft", "pale", "deep", "warm", "cool", "simple", "generous", "seasonal",
  "fragrant", "tall", "low", "loose", "tidy", "wild", "classic", "golden", "dusky", "early",
  "late", "humble", "lavish", "gentle", "bold",
] as const;
const FLOWERS = [
  "tulips", "roses", "lilies", "peonies", "carnations", "gerberas", "sunflowers", "freesias",
  "ranunculus", "anemones", "hydrangeas", "daisies", "orchids", "irises", "asters",
  "chrysanthemums", "sweet peas", "cornflowers", "snapdragons", "dahlias",
] as const;
const VERBS = [
  "suit", "brighten", "welcome", "honour", "mark", "celebrate", "comfort", "cheer", "greet",
  "thank", "surprise", "remember", "charm", "please",
] as const;
const PEOPLE = [
  "a grandmother", "an old friend", "a new neighbour", "a favourite teacher", "a younger sister",
  "a godchild", "a colleague", "a distant cousin", "a proud father", "a busy aunt",
  "a retired uncle", "a school friend",
] as const;
const PLACES = [
  "in Kraków", "in Gdańsk", "in Warsaw", "in Poznań", "in Wrocław", "in Lublin", "in Toruń",
  "in Katowice", "in Szczecin", "in Białystok", "near the Tatras", "by the Baltic",
] as const;
const MOMENTS = [
  "on a spring morning", "on a winter evening", "after a long week", "before a family lunch",
  "on a quiet Sunday", "at the end of summer", "during the autumn rains", "for a name day",
  "on a birthday", "for a christening", "after an exam", "for a new home",
] as const;

/** A small linear congruential generator: the same seed always writes the same text. */
function generator(seed: number): () => number {
  let state = (seed * 2_654_435_761) % 4_294_967_296;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function pick<T>(next: () => number, list: readonly T[]): T {
  return list[Math.floor(next() * list.length)] as T;
}

/** At least `words` words of distinct prose, in paragraphs of five sentences. */
export function blogProse(seed: number, words: number): string {
  const next = generator(seed);
  const sentences: string[] = [];
  let count = 0;
  while (count < words) {
    const adjective = pick(next, ADJECTIVES);
    const sentence = `${adjective[0]?.toUpperCase() ?? ""}${adjective.slice(1)} ${pick(next, FLOWERS)} ${pick(next, VERBS)} ${pick(next, PEOPLE)} ${pick(next, PLACES)} ${pick(next, MOMENTS)}.`;
    sentences.push(sentence);
    count += sentence.split(/\s+/u).length;
  }
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 5) {
    paragraphs.push(sentences.slice(index, index + 5).join(" "));
  }
  return paragraphs.join("\n\n");
}

/** The two links every post needs (rule 2), with descriptive anchors. */
export const BLOG_LINKS_PARAGRAPH =
  "Read [our guide to sending flowers to Poland](fo:corridor/PL) and browse [flowers for a name day](fo:occasion-hub/name_day) before you choose.";

/** The `fo:` references `BLOG_LINKS_PARAGRAPH` uses, as `existingRefs` holds them. */
export const BLOG_LINK_REFS = ["fo:corridor/PL", "fo:occasion-hub/name_day"] as const;

/** A body that passes every hard rule: a heading, distinct prose and the two links. */
export function blogBody(seed = 1, words = 540): string {
  return `## Choosing flowers\n\n${blogProse(seed, words)}\n\n${BLOG_LINKS_PARAGRAPH}`;
}

/** Revision fields that pass every hard rule. */
export function blogRevisionFields(
  overrides: Partial<BlogRevisionFields> = {},
): BlogRevisionFields {
  return {
    title: "How to send flowers to Poland from the UK",
    excerpt:
      "A plain guide to choosing flowers for someone in Poland: which stems suit which moment, how name days work, and what to write on the card.",
    seoTitle: "Sending flowers to Poland from the UK",
    seoDescription:
      "Which flowers suit which moment in Poland, how name days work, and what to write on the card.",
    bodyMd: blogBody(),
    coverMediaId: null,
    coverAlt: null,
    honestyAllow: [],
    ...overrides,
  };
}

/** The ten hashed fields of one revision, with non-ASCII text (T-04). */
export const HASH_FIXTURE: BlogRevisionContent = {
  title: "How to send flowers to Poland from the UK",
  slug: "send-flowers-to-poland",
  excerpt: "A plain guide to choosing flowers for someone in Poland (imieniny, żółte róże).",
  seoTitle: "Sending flowers to Poland",
  seoDescription: "Which flowers suit which moment in Poland.",
  bodyMd: "## Name days\n\nRead [our guide](fo:corridor/PL).",
  coverMediaId: "5f0c3b1e-7a8d-4c2e-9b1a-2d3e4f5a6b7c",
  coverAlt: "Yellow tulips on a kitchen table",
  honestyAllow: [
    { sentence: "Read the reviews.", rule: "review", reason: "names a page" },
  ],
  authorId: "0b6e1d2c-3a4f-4e5d-8c7b-6a5f4e3d2c1b",
};
