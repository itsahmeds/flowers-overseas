/**
 * The info-page content schemas (spec 041 §2 "The content model", §5.2; TASK-182).
 *
 * `content/pages/{locale}/{pageId}.md` (the trust family) and `content/legal/{locale}/{docId}.md`
 * (the legal family) are markdown with zod-parsed YAML frontmatter: the corridor model of spec 007
 * §2 applied again. A file that does not parse fails `pnpm pages:check` and the unit suite, naming
 * the file and the field (AC-3), so a half-authored page cannot render.
 *
 * Trust pages keep their copy in the frontmatter (`sections[]`, `faq[]`), because each section is
 * a heading with a short body or a short list, and a list of `{ title, text }` items is data a
 * component renders without any markup parser. One addition to §2's field list, recorded in the
 * PR: a section may carry `items[]` (the four steps, the three promises) and `ordered` (the steps
 * are an `<ol>`, design round 2), and `block` (where a section holds a data block the view model
 * builds: the company block, the destination table, the payment methods).
 */
import { z } from "zod";

import { INFO_PAGE_IDS } from "../../config/info-pages.ts";

/** `seoTitle` ≤ 60 and `seoDescription` ≤ 155 characters (spec 041 §2, AC-18). */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** The help page's question band (spec 041 §2: 10–14 items). */
export const INFO_FAQ_MIN = 10;
export const INFO_FAQ_MAX = 14;

/**
 * One sentence a trust page may keep although it trips a claim pattern, with the rule it trips
 * and a one-line reason (spec 041 §2). An entry that matches no sentence fails `pages:check`, so
 * the list cannot rot into a blanket licence. It never exempts a relay match (AC-30).
 */
export const HonestyAllowSchema = z
  .object({
    sentence: z.string().min(1),
    rule: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();
export type HonestyAllow = z.infer<typeof HonestyAllowSchema>;

/** What an in-body link may point at: another info page, or the all-destinations hub. */
export const infoLinkTargets = [...INFO_PAGE_IDS, "destinations"] as const;
export type InfoLinkTarget = (typeof infoLinkTargets)[number];

export const InfoLinkSchema = z
  .object({
    to: z.enum(infoLinkTargets),
    /** The link text, as authored copy in the same file. */
    label: z.string().min(1),
  })
  .strict();
export type InfoLink = z.infer<typeof InfoLinkSchema>;

/** The data blocks a section may hold; the view model fills each one. */
export const infoSectionBlocks = [
  "company",
  "destinations",
  "payment",
] as const;
export type InfoSectionBlock = (typeof infoSectionBlocks)[number];

export const InfoSectionItemSchema = z
  .object({
    title: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export const InfoSectionSchema = z
  .object({
    /** The section's anchor: lowercase, hyphenated, unique within the page. */
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    heading: z.string().min(1),
    /** Paragraphs, separated by a blank line. */
    body: z.string().min(1).optional(),
    items: z.array(InfoSectionItemSchema).min(1).optional(),
    /** The items are a sequence (an `<ol>`), not a set. */
    ordered: z.boolean().optional(),
    block: z.enum(infoSectionBlocks).optional(),
  })
  .strict()
  .refine(
    (section) =>
      section.body !== undefined ||
      section.items !== undefined ||
      section.block !== undefined,
    { message: "a section needs a `body`, `items` or a `block`" },
  );
export type InfoSection = z.infer<typeof InfoSectionSchema>;

const ReviewFieldsSchema = z.object({
  source: z.enum(["human", "machine"]),
  reviewed: z.boolean(),
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.iso.date().optional(),
  updatedAt: z.iso.date(),
});

/** The trust family's frontmatter (spec 041 §2). */
export const InfoPageContentSchema = ReviewFieldsSchema.extend({
  seoTitle: z.string().min(1).max(SEO_TITLE_MAX),
  seoDescription: z.string().min(1).max(SEO_DESCRIPTION_MAX),
  h1: z.string().min(1),
  intro: z.string().min(1).optional(),
  sections: z.array(InfoSectionSchema),
  faq: z
    .array(z.object({ q: z.string().min(1), a: z.string().min(1) }).strict())
    .optional(),
  links: z.array(InfoLinkSchema),
  honestyAllow: z.array(HonestyAllowSchema),
})
  .strict()
  .superRefine((page, ctx) => {
    if (
      page.reviewed &&
      (page.reviewedBy === undefined || page.reviewedAt === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewedBy"],
        message:
          "`reviewed: true` needs `reviewedBy` and `reviewedAt` (spec 041 §2)",
      });
    }
    const ids = new Set<string>();
    page.sections.forEach((section, index) => {
      if (ids.has(section.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: `duplicate section id \`${section.id}\``,
        });
      }
      ids.add(section.id);
    });
  });
export type InfoPageContent = z.infer<typeof InfoPageContentSchema>;

/**
 * The legal family's frontmatter (spec 041 §2, §5.2). Its documents are TASK-183's; the schema
 * lives here because AC-3 names both and `pages:check` parses both families.
 */
export const LegalDocumentSchema = ReviewFieldsSchema.extend({
  seoTitle: z.string().min(1).max(SEO_TITLE_MAX),
  seoDescription: z.string().min(1).max(SEO_DESCRIPTION_MAX),
  h1: z.string().min(1),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/u, "must be a semver string such as `0.1.0`"),
  effectiveFrom: z.iso.date().nullable(),
  inForce: z.boolean(),
  lawyerReviewed: z.boolean(),
  lawyerReviewedAt: z.iso.date().nullable().optional(),
  regime: z.enum(["eu", "uk"]),
  changeLog: z
    .array(
      z
        .object({
          version: z.string().min(1),
          date: z.iso.date(),
          summary: z.string().min(1),
        })
        .strict(),
    )
    .min(1),
  honestyAllow: z.array(HonestyAllowSchema).optional(),
})
  .strict()
  .superRefine((doc, ctx) => {
    if (doc.inForce && doc.effectiveFrom === null) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveFrom"],
        message:
          "`inForce: true` needs an `effectiveFrom` date (spec 041 §5.2)",
      });
    }
  });
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

/**
 * An `en-gb` file that differs in nothing from `en` (spec 041 §2): it names its parent and carries
 * nothing else, so every field is the parent's.
 */
export const ExtendsEnSchema = z.object({ extends: z.literal("en") }).strict();
