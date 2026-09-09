/**
 * The header every `seed/data/**.json` file carries, and the one place its shape is decided
 * (spec 006 §2.2 "JSON with a `$schema`-style `version` and `source: \"seed\"` header on every
 * file"; TASK-072).
 *
 * Three fields do real work and none of them is decoration:
 *
 *  - **`version`** is the dataset version, not a file version. `pnpm seed:check` fails a file
 *    whose header is missing or whose version it does not know (spec 006 §2.3 rule 1), so a
 *    dataset reshaped by a later task cannot be half-read by an older importer.
 *  - **`source: "seed"`** is the value that ends up in `product.source` / `country_price.source`
 *    and is what makes the importer non-destructive: it never touches a row whose `source` is
 *    `real` (`plan/10` §4). It is in the file rather than only in the projection so that a human
 *    reading `seed/data/products.json` can see what the 84 rows are.
 *  - **`origin`** distinguishes a file a human authors from one `pnpm seed:project` generates.
 *    ADR-0017 makes `src/config/catalogue/*.data.ts` the single authored source of catalogue
 *    entities and `seed/data/`'s catalogue files **projections** of it, so "never hand-edit this
 *    file" has to be machine-readable: the generator writes `origin: "projected"` with the module
 *    it came from, and `tests/unit/seed-dataset.test.ts` re-projects and compares byte-for-byte.
 *
 * No timestamp, no generator version and no machine name appear in a header. A projected file
 * must be byte-identical across runs and machines (ADR-0017, AC-3's sibling guarantee), and a
 * `generatedAt` would make every regeneration a diff — the classic way a "deterministic"
 * artefact stops being one.
 */
import { z } from "zod";

/**
 * The dataset version. Bump it when a file's *shape* changes in a way an importer must notice;
 * adding rows is not a shape change. Kept a literal in the schema so an unknown version is a
 * parse error rather than a silently ignored field.
 */
export const SEED_DATASET_VERSION = 1;

/** `source` on every seed row and in every header (`plan/10` §4). */
export const SEED_SOURCE = "seed" as const;

/**
 * `authored` — a human owns this file (spec 006 exclusively owns `taxonomy.json`'s companion
 * calendar, `copy/`, `media.json`, `media-variants.json` and `alt/`).
 * `projected` — `pnpm seed:project` writes it from `src/config/catalogue/*.data.ts` through spec
 * 005's `to*Row()` projections; editing it by hand is a failing gate, not a review comment
 * (ADR-0017 "must never hand-edit a projected file").
 */
export const SEED_ORIGINS = ["authored", "projected"] as const;
export type SeedOrigin = (typeof SEED_ORIGINS)[number];

/** The module a projected file was generated from, as a repo-relative path. */
const ProjectedFromSchema = z
  .string()
  .regex(
    /^src\/config\/catalogue\/[a-z-]+\.(?:data|ts)[a-z.]*$/,
    "projectedFrom names the authored module under src/config/catalogue/ (ADR-0017)",
  );

/**
 * The header fields, as a raw shape so each file schema can spread them into its own
 * `.strict()` object. Returned by a function because zod schema objects are mutable references
 * and a shared constant spread into eleven files is a footgun waiting for one `.optional()`.
 */
export function seedHeaderShape(entity: string) {
  return {
    version: z.literal(SEED_DATASET_VERSION),
    source: z.literal(SEED_SOURCE),
    entity: z.literal(entity),
    origin: z.enum(SEED_ORIGINS),
    projectedFrom: ProjectedFromSchema.optional(),
  } as const;
}

/**
 * A seed data file: the header of `entity` plus that file's own payload keys.
 *
 * `.strict()` everywhere. An unknown key in a seed file is either a typo the gate should catch or
 * a field somebody added without a spec 002 column to project it into, and both are worth a
 * parse error (the `.strict()` precedent of spec 005 §5.2 and spec 003's message manifests).
 */
export function seedFileSchema<Shape extends z.ZodRawShape>(
  entity: string,
  payload: Shape,
) {
  return z
    .object({ ...seedHeaderShape(entity), ...payload })
    .strict()
    .superRefine((value, ctx) => {
      // The spread of `payload` into the header shape widens zod's inferred output type, so the
      // two header fields this refinement reads are narrowed here rather than inferred. They are
      // both guaranteed present by the schema above.
      const file = value as {
        readonly origin: SeedOrigin;
        readonly projectedFrom?: string;
      };
      const projected = file.origin === "projected";
      if (projected === (file.projectedFrom === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["projectedFrom"],
          message: projected
            ? `\`${entity}\` is projected and must name the module it came from (ADR-0017)`
            : `\`${entity}\` is authored here and must not claim a projection source`,
        });
      }
    });
}

/** The header any seed file carries, for a reader that only needs the version and the origin. */
export const SeedFileHeaderSchema = z
  .object({
    version: z.literal(SEED_DATASET_VERSION),
    source: z.literal(SEED_SOURCE),
    entity: z.string().min(1),
    origin: z.enum(SEED_ORIGINS),
    projectedFrom: ProjectedFromSchema.optional(),
  })
  .loose();

export type SeedFileHeader = z.infer<typeof SeedFileHeaderSchema>;
