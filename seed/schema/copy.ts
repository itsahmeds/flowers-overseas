/**
 * `seed/data/copy/{locale}/{entity}.json` — the per-locale catalogue copy schema and its
 * projection onto spec 002 §5.1's `product_translation` (spec 006 §2.2, §5.2's `SeedCopySchema`,
 * §7; TASK-072).
 *
 * **Schema only. Every value is TASK-073's** (84 `en` descriptions, `en-gb` overrides, category
 * and occasion intros) and the `de`/`pl` machine drafts are `pnpm i18n:draft`'s. What this file
 * fixes is the shape that makes spec 006 AC-5's "never present, unreviewed and unflagged"
 * unexpressible: the review triple of `plan/03` §6 — `translationStatus`, `reviewed`,
 * `sourceHash`, plus the reviewer and the date — is the *same* triple `messages/*.meta.json`
 * carries for UI strings (`src/modules/i18n/schemas.ts`) and the same one spec 002 §5.1 gives
 * `product_translation`, so one rule governs both and `isLocaleIndexable()`-style gating reads one
 * vocabulary. A machine-drafted description that claimed `reviewed: true` would need a reviewer
 * and a date, which a network-free draft provider cannot invent.
 *
 * The consequence, stated so nobody "fixes" it later: a German or Polish product page whose copy
 * is `translationStatus: "machine", reviewed: false` is **non-indexable** until a native reviewer
 * approves it (`plan/03` §6 gate 4, `plan/02` §12, spec 002 §6). That is the intended state of
 * the Phase-0 dataset, not a gap.
 *
 * **Why `toProductTranslationRow()` exists here as well as in
 * `src/config/catalogue/projections.ts`.** Spec 005's function projects the *authored skeleton* —
 * the `en` name and slug with `description_md`, `seo_title` and `seo_description` deliberately
 * `null`, which is what keeps every product non-indexable until copy arrives. This one projects a
 * **copy row**: the same twelve columns, filled. They are two inputs onto one table, not two
 * copies of one projection, and `tests/unit/seed-projections.test.ts` pins the column list of
 * both against a transcription of spec 002 §5.1.
 */
import { z } from "zod";

import { SlugSchema } from "../../src/config/catalogue/schemas.ts";

/**
 * Which catalogue entity a copy row describes. `product` rows land in `product_translation`,
 * `category` and `occasion` rows in `category_translation`/`occasion_translation` (spec 002 §5.1,
 * "same translation shape"), and `addon` rows in `addon_translation`.
 */
export const seedCopyEntities = [
  "product",
  "category",
  "occasion",
  "addon",
] as const;
export type SeedCopyEntity = (typeof seedCopyEntities)[number];

/** `product_translation.translation_status` — spec 002 §5.1's CHECK list. */
export const seedTranslationStatuses = ["human", "machine"] as const;
export type SeedTranslationStatus = (typeof seedTranslationStatuses)[number];

/** sha256 of the `en` source value, lowercase hex: the drift record of `plan/03` §6 step 5. */
const SourceHashSchema = z
  .string()
  .regex(
    /^[0-9a-f]{64}$/,
    "sourceHash is a lowercase hex sha256 of the `en` source value (plan/03 §6)",
  );

/** A reviewer: a named person or role, never an email address (spec 006 §8, AC-9). */
const ReviewerSchema = z
  .string()
  .min(2)
  .refine((value) => !value.includes("@"), {
    error:
      "a reviewer is named, not emailed: no address may enter the dataset (spec 006 §8, AC-9)",
  });

/**
 * One copy row (spec 006 §5.2's `SeedCopySchema`, field for field).
 *
 * `name` and `slug` are required in every locale a file exists for: a translation with no name is
 * not a translation, and a slug is authored or ASCII-folded from an authored name and then
 * human-checked — never machine-drafted (`plan/03` §5, spec 006 §6). `descriptionMd` is optional
 * because a category intro is a description and an add-on is not, and because a null description
 * is exactly the state that keeps a product page out of the index (spec 002 §6). Word-count,
 * closing-sentence, banned-superlative and cross-product duplication rules are `pnpm seed:check`'s
 * (spec 006 §2.3 rule 6, TASK-075): they are dataset-wide facts a single row cannot see.
 */
export const SeedCopySchema = z
  .object({
    entity: z.enum(seedCopyEntities),
    /** The entity's natural key: `product.sku`, `category.key`, `occasion.key`, `addon.key`. */
    key: z.string().min(2),
    locale: z.string().min(2),
    name: z.string().min(2),
    slug: SlugSchema,
    descriptionMd: z.string().min(1).optional(),
    seoTitle: z.string().min(1).max(70).optional(),
    seoDescription: z.string().min(1).max(180).optional(),
    translationStatus: z.enum(seedTranslationStatuses),
    reviewed: z.boolean(),
    reviewedBy: ReviewerSchema.optional(),
    reviewedAt: z.iso.datetime().optional(),
    sourceHash: SourceHashSchema,
  })
  .strict()
  .superRefine((copy, ctx) => {
    if (copy.reviewed) {
      for (const field of ["reviewedBy", "reviewedAt"] as const) {
        if (copy[field] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `\`${copy.entity}:${copy.key}\` (${copy.locale}) is reviewed and must record \`${field}\`: a review with no reviewer and no date is not an audit trail (plan/03 §5)`,
          });
        }
      }
    }
    if (copy.translationStatus === "machine" && copy.reviewed) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewed"],
        message: `\`${copy.entity}:${copy.key}\` (${copy.locale}) is a machine draft and cannot be reviewed in the same edit: a reviewer flips \`translationStatus\` to \`human\` (plan/03 §6 gate 4, spec 006 AC-5)`,
      });
    }
  });

export type SeedCopy = z.infer<typeof SeedCopySchema>;

/**
 * A whole copy file: one locale, one entity, and its rows. Uniqueness is per key, which is spec
 * 002 §5.1's `UNIQUE (product_id, locale_code)`; slug uniqueness *across* entities in a locale is
 * `seed:check`'s (spec 006 AC-7), because it spans three files.
 */
export const SeedCopyRegistrySchema = z
  .array(SeedCopySchema)
  .min(1)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const key = `${row.entity}:${row.key}:${row.locale}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `duplicate copy row \`${key}\` (spec 002 §5.1 UNIQUE (product_id, locale_code))`,
        });
      }
      seen.add(key);
    });
  });

/* -------------------------------------------------------------------------- */
/* product_translation projection (AC-3).                                     */
/* -------------------------------------------------------------------------- */

/** Spec 002 §5.1 `product_translation` columns, in declaration order. */
export const PRODUCT_TRANSLATION_COPY_ROW_COLUMNS = [
  "product_id",
  "locale_code",
  "name",
  "slug",
  "description_md",
  "seo_title",
  "seo_description",
  "translation_status",
  "reviewed",
  "reviewed_by",
  "reviewed_at",
  "source_hash",
] as const;

export interface ProductTranslationCopyRow {
  product_id: string;
  locale_code: string;
  name: string;
  slug: string;
  description_md: string | null;
  seo_title: string | null;
  seo_description: string | null;
  translation_status: string;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  source_hash: string;
}

/**
 * Project one copy row onto spec 002 §5.1's `product_translation` row. Absent optional fields
 * become explicit `null`s so the projected key list is the column list whatever the row carries
 * (AC-3), and the caller passes the product id it resolved from the SKU (`plan/10` §4).
 */
export function toProductTranslationRow(
  copy: SeedCopy,
  ref: { readonly productId: string },
): ProductTranslationCopyRow {
  return {
    product_id: ref.productId,
    locale_code: copy.locale,
    name: copy.name,
    slug: copy.slug,
    description_md: copy.descriptionMd ?? null,
    seo_title: copy.seoTitle ?? null,
    seo_description: copy.seoDescription ?? null,
    translation_status: copy.translationStatus,
    reviewed: copy.reviewed,
    reviewed_by: copy.reviewedBy ?? null,
    reviewed_at: copy.reviewedAt ?? null,
    source_hash: copy.sourceHash,
  };
}
