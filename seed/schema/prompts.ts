/**
 * The imagery prompt records of `content/imagery/prompts/*.json` and the canonicalisation that
 * makes `media_asset.generator_prompt_hash` reproducible (spec 006 §2.4, AC-8; TASK-077).
 *
 * Spec 006 §2.4 says two things about prompts that pull in opposite directions, and this file is
 * where they meet: "the prompt text itself is **content**, not code", and "`prompt_hash` in the
 * media manifest is the **SHA-256 of the canonicalised prompt record**". So the text lives under
 * `content/imagery/`, where a non-programmer edits it, and the *canonical form* it is hashed in
 * lives here, where a test can pin it. Without a canonical form the hash would be the hash of
 * whatever byte-level formatting Prettier last applied to the JSON file, and a reflow would
 * invalidate every asset's provenance without a single prompt having changed.
 *
 * **What canonicalisation does, and why each step is not decoration.**
 *
 *  - **Fixed field order.** The canonical string is built from `PROMPT_FIELD_ORDER`, not from the
 *    parsed object's key order, so re-ordering the keys in the JSON file — which a formatter, an
 *    editor or a merge can do — cannot change a hash.
 *  - **Insignificant whitespace collapsed.** A prompt is a sentence; a line wrap inserted to keep
 *    the file readable is not a different prompt. Every run of whitespace — spaces, tabs, LF, CRLF
 *    — collapses to one space, and the ends are trimmed.
 *  - **NFC.** The catalogue carries `Kraków`; the same characters composed two ways would hash two
 *    ways, and one of those files would then be permanently "stale" on the other developer's
 *    machine.
 *  - **Sorted parameters.** The parameter bag is a map, and a map has no order.
 *
 * The hash covers the **whole** record — the asset id, the generator, the model and the seed as
 * well as the text — because provenance's claim is "this asset came from *this* generation run",
 * and a prompt regenerated at a different seed is a different image. Changing the model or the
 * seed is therefore a new hash and a manifest diff, which is exactly the signal a reviewer needs.
 *
 * Nothing here reads a clock, a network, an environment variable or a database (`pnpm check:no-db`
 * covers `seed/**`), so the same record hashes to the same value on every machine forever.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import { SkuSchema } from "../../src/config/catalogue/schemas.ts";

import { AssetIdSchema, Sha256Schema, mediaSlots } from "./media.ts";

/**
 * The prompt-file format version. Bumped when the *record shape* changes — which is also a
 * re-hash of every asset, since the canonical form is built from the field list.
 */
export const IMAGERY_PROMPT_VERSION = 1;

/**
 * What an asset is for, in the language of `plan/10` §3's "one hero angle + one detail + one 'in a
 * home' context shot per product" plus the two homepage roles. It is narrower than `slot` (a place
 * in the layout) on purpose: the role is what the *prompt* describes, and two slots can share one.
 */
export const imageryPromptRoles = [
  "hero",
  "detail",
  "context",
  "brand",
  "occasion",
] as const;
export type ImageryPromptRole = (typeof imageryPromptRoles)[number];

/**
 * The declared aspect ratio the generation runs at, before `pnpm media:variants` (TASK-078) crops
 * to the slot's ratio. `plan/10` §3 fixes 4:5 for a product; §13 Q5 adds 1:1 for an occasion tile
 * and 16:9 for the hero band.
 */
export const imageryAspectRatios = ["4:5", "1:1", "16:9", "3:2"] as const;
export type ImageryAspectRatio = (typeof imageryAspectRatios)[number];

/**
 * One generation run, fully specified: the asset it produces, what it depicts, and everything a
 * second run needs in order to produce the same image (`plan/10` §3 "generation prompt template
 * stored per product with seed so images can be regenerated consistently").
 *
 * `generatorSeed` is **declared here, not discovered afterwards.** A seed chosen by the generator
 * and written down later would make regeneration a matter of trusting a note; a seed fixed in the
 * committed record makes the generation run reproducible by construction, and `promptSeed()` below
 * derives it from the asset id so that adding or removing an asset never renumbers another one.
 */
export const ImageryPromptRecordSchema = z
  .object({
    assetId: AssetIdSchema,
    /** The product this asset depicts, or `null` for a homepage slot that depicts no product. */
    sku: SkuSchema.nullable(),
    slot: z.enum(mediaSlots),
    role: z.enum(imageryPromptRoles),
    aspectRatio: z.enum(imageryAspectRatios),
    generator: z.string().min(2),
    generatorModel: z.string().min(2),
    generatorSeed: z.number().int().nonnegative(),
    /** The positive prompt: one sentence per clause, style-guide vocabulary only. */
    prompt: z.string().min(40),
    /**
     * The exclusions of the review checklist, stated to the generator rather than only to the
     * reviewer: "no hands, no faces, no text" (`plan/10` §3) is cheaper to prevent than to reject.
     */
    negativePrompt: z.string().min(20),
    /** Generator settings that are not the text: guidance, sampler, steps, size. */
    parameters: z.record(z.string(), z.union([z.string(), z.number()])),
  })
  .strict();

export type ImageryPromptRecord = z.infer<typeof ImageryPromptRecordSchema>;

/**
 * A whole `content/imagery/prompts/{key}.json`: the SKU whose assets it describes, or `homepage`
 * for the slots that belong to no product.
 *
 * `key` repeats the file name as data for the same reason `prices/{ISO2}.json` repeats its country
 * (`seed/schema/files.ts`): a file whose records belonged to another product would attach the wrong
 * provenance to a rendered image, and a header field makes that a parse error rather than a review
 * comment.
 */
export const ImageryPromptFileSchema = z
  .object({
    version: z.literal(IMAGERY_PROMPT_VERSION),
    key: z.union([SkuSchema, z.literal("homepage")]),
    records: z.array(ImageryPromptRecordSchema).nonempty(),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.records.forEach((record, index) => {
      if (seen.has(record.assetId)) {
        ctx.addIssue({
          code: "custom",
          path: ["records", index, "assetId"],
          message: `duplicate prompt record for \`${record.assetId}\`: an asset has exactly one generation run (spec 006 §2.4)`,
        });
      }
      seen.add(record.assetId);
      const expected = file.key === "homepage" ? null : file.key;
      if (record.sku !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["records", index, "sku"],
          message: `\`${record.assetId}\` names \`${String(record.sku)}\` in the \`${file.key}\` prompt file: a prompt file describes exactly one product's assets`,
        });
      }
    });
  });

export type ImageryPromptFile = z.infer<typeof ImageryPromptFileSchema>;

/** The record fields, in the order the canonical form serialises them. Never reordered. */
export const PROMPT_FIELD_ORDER = [
  "assetId",
  "sku",
  "slot",
  "role",
  "aspectRatio",
  "generator",
  "generatorModel",
  "generatorSeed",
  "prompt",
  "negativePrompt",
  "parameters",
] as const;

/** One space between words, trimmed, NFC — the text-level half of canonicalisation. */
function canonicalText(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/**
 * The canonical string a prompt record is hashed in: a JSON array of `[field, value]` pairs in
 * `PROMPT_FIELD_ORDER`, text normalised, parameters sorted by key, no insignificant whitespace.
 *
 * An array of pairs rather than an object, so the order is the array's and not an object literal's
 * — a detail that matters because `JSON.stringify` of an object serialises insertion order, which
 * is precisely the thing this function exists to stop mattering.
 */
export function canonicalisePromptRecord(record: ImageryPromptRecord): string {
  const parameters = Object.keys(record.parameters)
    .sort()
    .map((key) => {
      const value = record.parameters[key];
      return [key, typeof value === "string" ? canonicalText(value) : value];
    });
  const pairs = PROMPT_FIELD_ORDER.map((field) => {
    switch (field) {
      case "parameters":
        return [field, parameters];
      case "prompt":
      case "negativePrompt":
        return [field, canonicalText(record[field])];
      default:
        return [field, record[field]];
    }
  });
  return JSON.stringify(pairs);
}

/**
 * `media_asset.generator_prompt_hash` for a prompt record: the SHA-256 of its canonical form,
 * lowercase hex (`Sha256Schema`'s shape, and the manifest's `promptHash`).
 */
export function promptHash(record: ImageryPromptRecord): string {
  return createHash("sha256")
    .update(canonicalisePromptRecord(record), "utf8")
    .digest("hex");
}

/**
 * The generation seed for an asset, derived from its id.
 *
 * Deriving rather than choosing gives three properties at once: the seed is stable across a
 * re-author of the prompt text (so a wording fix does not change which image the run produces
 * beyond the wording itself), it is unique per asset (so two products do not share a composition),
 * and it is reproducible by anyone reading the id — no register of "which seed did we use for
 * `fo-bq-001-hero`" can go missing. Seven hex digits keep it inside every generator's 32-bit seed
 * range and inside `Number.MAX_SAFE_INTEGER` with room to spare.
 */
export function promptSeed(assetId: string): number {
  return Number.parseInt(
    createHash("sha256").update(assetId, "utf8").digest("hex").slice(0, 7),
    16,
  );
}

/** A parsed prompt hash, for a reader that has a hash and wants it validated. */
export const PromptHashSchema = Sha256Schema;
