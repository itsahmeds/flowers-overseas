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

/**
 * The data blocks a section may hold; the view model fills each one. The last four are spec 011's
 * landing (TASK-210): the payout example, the questions (the `faq[]` list under the section's
 * heading), the contact line (`company.ts`) and the country guides that exist (`corridorState()`).
 */
export const infoSectionBlocks = [
  "company",
  "destinations",
  "payment",
  "payout",
  "faq",
  "contact",
  "guides",
] as const;

/**
 * The inbox screen a walkthrough step shows (spec 011 §2 "The walkthrough"): the real component
 * from `src/modules/partners/ui/inbox/`, fed by `exampleFloristOrderView(locale)`.
 */
export const infoSectionScreens = [
  "list",
  "offer",
  "accepted",
  "photo",
] as const;
export type InfoSectionScreen = (typeof infoSectionScreens)[number];
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
    /** A plain list of sentences (spec 011's "what we do", "what you do", "what we never ask"). */
    bullets: z.array(z.string().min(1)).min(1).optional(),
    block: z.enum(infoSectionBlocks).optional(),
    /** A walkthrough step's inbox screen and the `<figcaption>` that says what it shows. */
    screen: z.enum(infoSectionScreens).optional(),
    caption: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (section) =>
      section.body !== undefined ||
      section.items !== undefined ||
      section.bullets !== undefined ||
      section.block !== undefined,
    { message: "a section needs a `body`, `items`, `bullets` or a `block`" },
  )
  .refine(
    (section) =>
      (section.screen === undefined) === (section.caption === undefined),
    {
      message:
        "a screen needs its caption, and a caption its screen (spec 011 AC-3)",
      path: ["caption"],
    },
  );

/**
 * The florists family's labels that are neither a section nor a question (spec 011 Appendix A and
 * the landing artboard): the calls to action, the example docket beside the `<h1>` and the payout
 * card. They are authored copy in the content file, reviewed with the page, so the landing adds
 * no message key a crawler could read unreviewed.
 */
export const FloristLabelsSchema = z
  .object({
    apply: z.string().min(1),
    walkthrough: z.string().min(1),
    screenByScreen: z.string().min(1),
    example: z.string().min(1),
    docket: z
      .object({
        heading: z.string().min(1),
        deliver: z.string().min(1),
        card: z.string().min(1),
        cardText: z.string().min(1),
        payout: z.string().min(1),
        payoutText: z.string().min(1),
      })
      .strict(),
    payout: z
      .object({
        heading: z.string().min(1),
        buyerPays: z.string().min(1),
        youReceive: z.string().min(1),
        note: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type FloristLabels = z.infer<typeof FloristLabelsSchema>;
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
  /** The florists family's landing labels (spec 011, TASK-210); absent on every other page. */
  florists: FloristLabelsSchema.optional(),
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
 * The cookie register's column headings and status words (spec 041 §2 "Cookies", AC-13). They
 * are part of the cookie notice the founder approves as legal batch 2 (TASK-183): the notice is
 * `noindex` until a lawyer signs it, so its labels gate only their own page, like the rest of its
 * text (spec 041 §7 "Two mechanisms").
 */
export const RegisterLabelsSchema = z
  .object({
    caption: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    purpose: z.string().min(1),
    lifetime: z.string().min(1),
    status: z.string().min(1),
    setToday: z.string().min(1),
    planned: z.string().min(1),
    /** "Consent policy version {version}": the line under the re-open button. */
    policyVersion: z.string().min(1),
  })
  .strict();
export type RegisterLabels = z.infer<typeof RegisterLabelsSchema>;

/** The imprint's field labels (spec 041 §5.3 "Imprint", AC-11), approved with the imprint. */
export const FactsLabelsSchema = z
  .object({
    name: z.string().min(1),
    register: z.string().min(1),
    registrationNumber: z.string().min(1),
    address: z.string().min(1),
    vatId: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().min(1),
  })
  .strict();
export type FactsLabels = z.infer<typeof FactsLabelsSchema>;

/**
 * The cookie notice's interim sections (spec 041 §2 "Cookies", AC-29): the section anchors that
 * render only while the privacy notice does not exist in the locale, and the heading of the one
 * section that replaces them with a link to it once it does.
 */
export const InterimSchema = z
  .object({
    sections: z.array(z.string().min(1)).min(1),
    heading: z.string().min(1),
  })
  .strict();

/**
 * The legal family's frontmatter (spec 041 §2, §5.2; TASK-183). Three additions to §2's field
 * list, recorded in the PR: `links` (the in-body links of §6, as on a trust page), `labels` (the
 * register's and the imprint's field labels) and `interim` (the cookie notice's two sections that
 * wait for the privacy notice).
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
  links: z.array(InfoLinkSchema).optional(),
  labels: z
    .object({
      register: RegisterLabelsSchema.optional(),
      facts: FactsLabelsSchema.optional(),
    })
    .strict()
    .optional(),
  interim: InterimSchema.optional(),
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
