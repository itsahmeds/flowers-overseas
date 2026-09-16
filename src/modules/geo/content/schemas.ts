/**
 * The corridor content model (spec 007 §2 "The content model", §5.1, §5.2, AC-1; TASK-087).
 *
 * One human-authored markdown file per (country, locale, state) under
 * `content/corridors/{locale}/{iso2}-{state}.md`: YAML frontmatter carries the structured half,
 * the markdown body is the guide. This file is the frontmatter's schema, and it is the only place
 * the shape of a corridor page's copy is written down — spec 002 §5.1's `country_locale_content`
 * is the same shape in a table, and `projections.ts` is the proof that they cannot drift.
 *
 * Three decisions are worth defending:
 *
 *  - **The file path is data, not decoration.** `locale`, `iso2` and `state` are *derived from the
 *    path* and parsed with everything else, so a file called `pl-guide.md` cannot declare itself
 *    to be the German live page. `parse.ts` does the deriving; this file refuses anything the
 *    registries do not know (`COUNTRY_CODES`, `launchLocales`).
 *  - **The structural rules are here; the editorial rules are in the gate.** Anything a *type*
 *    can express — the FAQ band, exactly three distinct related countries, "reviewed needs its
 *    reviewer" — refines the schema, so a build cannot render a half-authored page (AC-1). Word
 *    counts, uniqueness, banned words and claim greps are `pnpm corridor:check`'s eighteen rules
 *    (AC-2): they need the whole corpus, and a build that failed on them would be a build that
 *    fails for a sentence.
 *  - **`source` must be `human`.** `plan/02` §12 forbids machine-drafted corridor copy even
 *    noindexed, so the value is a literal rather than an enum with a second member: there is no
 *    way to write a machine-drafted corridor file that parses.
 *
 * `CountryLocaleContentBaseSchema` is the same shape **without** the refinements, and exists so
 * the gate can report "your FAQ has seven items" as its own named rule instead of as a parse
 * failure. The application never uses it; `pnpm corridor:check` does.
 */
import { z } from "zod";

import { COUNTRY_CODES } from "../../../config/countries.ts";
import { launchLocales } from "../../../config/locales.ts";

/** `country_locale_content.state` of spec 002 §5.1, verbatim. */
export const corridorStates = ["guide", "live"] as const;
export type CorridorState = (typeof corridorStates)[number];

/** `plan/02` §5.3: an authored per-country title, ≤60 characters. */
export const SEO_TITLE_MAX = 60;
/** `plan/02` §5.3: an authored meta description, ≤155 characters. */
export const SEO_DESCRIPTION_MAX = 155;
/** `plan/02` §5.2: 8–12 question-and-answer pairs, visible and server-rendered. */
export const FAQ_MIN = 8;
export const FAQ_MAX = 12;
/** `plan/02` §5.2: the intro is 120–200 words. Inclusive on both ends. */
export const INTRO_WORD_MIN = 120;
export const INTRO_WORD_MAX = 200;
/** `plan/02` §5.1: the guide body is at least 600 country-specific words. */
export const BODY_WORD_MIN = 600;
/**
 * `plan/02` §5.2 as corrected by spec 007 §14 A3: **two or three** related destinations, authored
 * per country.
 *
 * It was "exactly three" until TASK-088 tried to build the corpus. AC-18 wants every edge
 * reciprocated, which makes the graph undirected; seven destinations each naming exactly three
 * others is 7 × 3 = 21 edge-ends, and an undirected graph's edge-ends are even because every edge
 * has two. No such graph exists (the handshake lemma), so "exactly three" and "fully reciprocal"
 * could not both hold over an odd-sized set. The band is the correction: a page in an odd-sized
 * set may carry two, and rule 18 requires reciprocation only where the target has a free slot.
 */
export const RELATED_MIN = 2;
export const RELATED_MAX = 3;

const Iso2Schema = z.enum([...COUNTRY_CODES] as [string, ...string[]]);
const LocaleSchema = z.enum([...launchLocales] as [string, ...string[]]);

/** One visible question and its answer. Both are rendered as text; neither may be empty. */
export const FaqItemSchema = z
  .object({
    q: z.string().trim().min(1),
    a: z.string().trim().min(1),
  })
  .strict();

export type FaqItem = z.infer<typeof FaqItemSchema>;

/**
 * The operational facts a live corridor page renders, re-exported from the country registry that
 * owns them (spec 007 §5.1). The *content* gate is what refuses a `live` file for a country whose
 * operations are not authored: a cutoff that was never written down can never be rendered.
 */
export {
  CountryOperationsSchema,
  type CountryOperations,
} from "../../../config/countries.ts";

/**
 * The shape, with no refinement. `body` is the markdown after the frontmatter; everything else is
 * the frontmatter, plus the three fields the file's path carries.
 */
export const CountryLocaleContentBaseSchema = z
  .object({
    iso2: Iso2Schema,
    locale: LocaleSchema,
    state: z.enum(corridorStates),
    /**
     * Optional **in the base shape only**, so `pnpm corridor:check` can report "seoTitle is
     * absent" as its own rule rather than as a parse failure (AC-2's rule 8/9 name both halves of
     * "absent or too long"). The full schema below requires it.
     */
    seoTitle: z.string().trim().min(1).optional(),
    seoDescription: z.string().trim().min(1).optional(),
    h1: z.string().trim().min(1),
    intro: z.string().trim().min(1),
    faq: z.array(FaqItemSchema),
    localFlowers: z.string().trim().min(1),
    taboos: z.string().trim().min(1),
    relatedIso2: z.array(Iso2Schema),
    /**
     * `en-gb` inherits the `en` guide body and must override title, description and at least two
     * FAQ answers (`plan/02` §4.2, spec 007 §6 (b); the override rule is gate rule 17).
     */
    extends: LocaleSchema.optional(),
    /**
     * `human` or `machine` in the base shape, `human` only in the full schema: the gate reports
     * "this file says `source: machine`" as its own rule (`plan/02` §12), and the application
     * cannot parse one at all.
     */
    source: z.enum(["human", "machine"]),
    reviewed: z.boolean(),
    reviewedBy: z.string().trim().min(1).optional(),
    reviewedAt: z.iso.date().optional(),
    version: z.number().int().min(1),
    updatedAt: z.iso.date(),
    body: z.string().trim().min(1),
  })
  .strict();

export type CountryLocaleContentBase = z.infer<
  typeof CountryLocaleContentBaseSchema
>;

/**
 * The refinements a *build* enforces (AC-1). Each one is a claim that cannot be made without its
 * evidence, which is the `CompanySchema` pattern of spec 004 §5.1:
 *
 *  - the SEO fields fit the slots `plan/02` §5.3 gives them;
 *  - the FAQ is inside the 8–12 band a `FAQPage` is allowed to describe;
 *  - `relatedIso2` is two or three distinct other countries — never the file's own (spec 007 §14
 *    A3; the band, not "exactly three", is what makes AC-18's reciprocity satisfiable);
 *  - `reviewed: true` requires a reviewer and a date, so "a native speaker read this" cannot be
 *    asserted by a boolean alone (it is the input to indexability, spec 007 §6);
 *  - `extends` only ever means "this `en-gb` file inherits `en`".
 */
export const CountryLocaleContentSchema = CountryLocaleContentBaseSchema.extend(
  {
    seoTitle: z.string().trim().min(1),
    seoDescription: z.string().trim().min(1),
    /** `plan/02` §12: corridor copy is never machine-drafted, not even noindexed. */
    source: z.literal("human"),
  },
).superRefine((content, ctx) => {
  if (content.seoTitle.length > SEO_TITLE_MAX) {
    ctx.addIssue({
      code: "custom",
      path: ["seoTitle"],
      message: `seoTitle is ${String(content.seoTitle.length)} characters; the limit is ${String(SEO_TITLE_MAX)} (plan/02 §5.3)`,
    });
  }
  if (content.seoDescription.length > SEO_DESCRIPTION_MAX) {
    ctx.addIssue({
      code: "custom",
      path: ["seoDescription"],
      message: `seoDescription is ${String(content.seoDescription.length)} characters; the limit is ${String(SEO_DESCRIPTION_MAX)} (plan/02 §5.3)`,
    });
  }
  if (content.faq.length < FAQ_MIN || content.faq.length > FAQ_MAX) {
    ctx.addIssue({
      code: "custom",
      path: ["faq"],
      message: `faq has ${String(content.faq.length)} item(s); ${String(FAQ_MIN)}–${String(FAQ_MAX)} are required (plan/02 §5.2)`,
    });
  }
  if (
    content.relatedIso2.length < RELATED_MIN ||
    content.relatedIso2.length > RELATED_MAX
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["relatedIso2"],
      message: `relatedIso2 names ${String(content.relatedIso2.length)} countries; ${String(RELATED_MIN)}–${String(RELATED_MAX)} are required (spec 007 §14 A3)`,
    });
  }
  if (new Set(content.relatedIso2).size !== content.relatedIso2.length) {
    ctx.addIssue({
      code: "custom",
      path: ["relatedIso2"],
      message: "relatedIso2 repeats a country",
    });
  }
  if (content.relatedIso2.includes(content.iso2)) {
    ctx.addIssue({
      code: "custom",
      path: ["relatedIso2"],
      message: `relatedIso2 names the file's own country \`${content.iso2}\``,
    });
  }
  if (content.reviewed && content.reviewedBy === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["reviewedBy"],
      message:
        "reviewed: true requires reviewedBy — a review claim needs its reviewer (spec 007 §5.2)",
    });
  }
  if (content.reviewed && content.reviewedAt === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["reviewedAt"],
      message:
        "reviewed: true requires reviewedAt — a review claim needs its date (spec 007 §5.2)",
    });
  }
  if (!content.reviewed && content.reviewedBy !== undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["reviewedBy"],
      message: "reviewedBy is set while reviewed is false",
    });
  }
  if (content.extends !== undefined && content.locale === content.extends) {
    ctx.addIssue({
      code: "custom",
      path: ["extends"],
      message: `extends names the file's own locale \`${content.locale}\``,
    });
  }
});

/** A parsed corridor content file: the frontmatter, the path facts and the markdown body. */
export type CountryLocaleContent = z.infer<typeof CountryLocaleContentSchema>;
