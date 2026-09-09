/**
 * The pinned variant pipeline: the widths, the aspect ratios, the metadata policy and the exact
 * encoder options `pnpm media:variants` calls `sharp` with (spec 006 §2.4, §13 Q5, AC-12/AC-13;
 * TASK-078).
 *
 * **Why this is a schema module and not part of the CLI.** Determinism is the contract (AC-13):
 * the `sharp` version and every encoder option are recorded in the manifest header, two runs are
 * byte-identical, and changing one option is a manifest-wide diff rather than a silent re-encode.
 * That only works if one module owns the numbers, the manifest header *is* that module's output,
 * and the gate compares the two. So the constants live here, `variantPipeline()` is what gets
 * written into `seed/data/media-variants.json`, and `pnpm media:variants --check` fails a manifest
 * whose header no longer equals it — the diff a reviewer sees when somebody edits a quality
 * setting without re-deriving the bytes.
 *
 * The module imports **no `sharp` and touches no filesystem**, which is what lets the aspect-ratio
 * table be read by `seed/check.ts` (TASK-075), by the loader and slot vocabulary of
 * `src/modules/ui/media/` (TASK-079) and by the `media.derive_variants` worker (TASK-082, which
 * must reproduce these checksums exactly — AC-25) without any of them depending on the encoder.
 */
import { z } from "zod";

import { type MediaSlot, mediaFormats, mediaSlots } from "./media.ts";

/* -------------------------------------------------------------------------- */
/* Pinned versions.                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The pinned `sharp` version — the same exact string as `package.json`'s devDependency, asserted
 * by `tests/unit/media-variants.test.ts`. `pnpm media:variants` refuses to derive anything when
 * the loaded `sharp` reports a different version, because a minor bump re-encodes every file: a
 * refusal is a one-line fix, a silent re-encode is 465 changed checksums nobody asked for.
 */
export const PINNED_SHARP_VERSION = "0.35.4";

/**
 * The libvips build the pinned `sharp` ships as a prebuilt binary. It is recorded and asserted for
 * the same reason: the encoders are libvips', so its version is part of "what produced these
 * bytes". A machine that forces a global libvips (`SHARP_FORCE_GLOBAL_LIBVIPS`) is refused rather
 * than allowed to write subtly different files.
 */
export const PINNED_LIBVIPS_VERSION = "8.18.6";

/* -------------------------------------------------------------------------- */
/* The width ladder (spec 006 §13 Q5).                                        */
/* -------------------------------------------------------------------------- */

/** The seven page widths of spec 006 §13 Q5, ascending; both page formats exist at each. */
export const VARIANT_WIDTHS = [384, 640, 828, 1080, 1200, 1600, 1920] as const;

/**
 * The one JPEG per asset, for OG/email/social where AVIF and WebP are still unreliable
 * (spec 006 §13 Q5). It is a single width, not a ladder: nothing responsive consumes it.
 */
export const OG_JPEG_WIDTH = 1200;

/**
 * The width at which the hero band changes crop. Spec 006 §13 Q5 declares the band **16:9 on
 * desktop and 4:3 on mobile**, and the ladder is one list of widths, so the two ratios have to be
 * assigned to width ranges or an asset would need two files at the same width — which the
 * `(assetId, width, format)` uniqueness of §5.2 forbids. The split is at 1080: 384/640/828 are the
 * mobile widths `plan/01` §6's `sizes` strings request at a phone viewport (1x–3x of 320–414 px),
 * 1080 and above are only ever requested by a tablet or a desktop. `[agent-inferred]` — the spec
 * names the two ratios and not the boundary; it is recorded in the manifest header, so moving it
 * is a visible, whole-manifest change.
 */
export const HERO_DESKTOP_MIN_WIDTH = 1080;

/* -------------------------------------------------------------------------- */
/* Aspect ratios per slot (spec 006 §13 Q5).                                  */
/* -------------------------------------------------------------------------- */

/** An aspect ratio: the label that goes in the manifest header plus its two integer terms. */
export interface AspectRatio {
  /** `"4:5"`, `"16:9"` … — the label a human reads in the header and in a review comment. */
  readonly ratio: string;
  readonly widthTerm: number;
  readonly heightTerm: number;
}

const RATIO_4_5: AspectRatio = { ratio: "4:5", widthTerm: 4, heightTerm: 5 };
const RATIO_1_1: AspectRatio = { ratio: "1:1", widthTerm: 1, heightTerm: 1 };
const RATIO_16_9: AspectRatio = { ratio: "16:9", widthTerm: 16, heightTerm: 9 };
const RATIO_4_3: AspectRatio = { ratio: "4:3", widthTerm: 4, heightTerm: 3 };
const RATIO_3_2: AspectRatio = { ratio: "3:2", widthTerm: 3, heightTerm: 2 };
/**
 * The Open Graph / `summary_large_image` ratio, for an asset authored **as** a share image.
 * `[agent-inferred]`: spec 006 §13 Q5 assigns ratios to the product, occasion-tile, hero-band and
 * context slots and says nothing about the `og` slot, which no Phase-0 asset uses
 * (`seed/data/media.json` is 12 × productHero/productDetail, 6 × occasionTile and 1 × hero). 1200
 * × 630 is the ratio every consumer of an `og:image` crops to, so it is the only value that does
 * not waste pixels. Recorded here and in the manifest header rather than decided at a call site,
 * and stated in the PR body as a derived reading rather than a spec quotation.
 */
const RATIO_OG: AspectRatio = {
  ratio: "1.91:1",
  widthTerm: 191,
  heightTerm: 100,
};

/**
 * One step of a slot's ladder: a ratio and the widths derived at it. A slot has one step unless
 * the spec gives it two crops (the hero band), which is the only reason this is a list.
 */
export interface AspectStep {
  readonly ratio: string;
  readonly widths: readonly number[];
}

/** Every width of the page ladder, as a plain array (the manifest header is JSON). */
const ALL_WIDTHS: readonly number[] = [...VARIANT_WIDTHS];

/**
 * Slot → the aspect ratio(s) its variants are cropped to (spec 006 §13 Q5: 4:5 product, 1:1
 * occasion tile, 16:9 desktop / 4:3 mobile hero band, 3:2 context).
 *
 * `productThumb` is a product slot and takes the product ratio: a thumbnail of a 4:5 hero that
 * cropped differently would not be a thumbnail of it. The table is total over `mediaSlots` on
 * purpose — an unmapped slot would be an asset the CLI could not derive, discovered at the moment
 * somebody authored it.
 */
export const SLOT_ASPECTS: Readonly<Record<MediaSlot, readonly AspectRatio[]>> =
  {
    hero: [RATIO_4_3, RATIO_16_9],
    occasionTile: [RATIO_1_1],
    productHero: [RATIO_4_5],
    productDetail: [RATIO_4_5],
    productThumb: [RATIO_4_5],
    context: [RATIO_3_2],
    og: [RATIO_OG],
  };

/**
 * The aspect ratio one (slot, width) pair is cropped to. Single-ratio slots ignore the width; the
 * hero band takes 4:3 below `HERO_DESKTOP_MIN_WIDTH` and 16:9 from it upwards.
 */
export function aspectFor(slot: MediaSlot, width: number): AspectRatio {
  const ratios = SLOT_ASPECTS[slot];
  if (ratios.length === 1) return ratios[0] as AspectRatio;
  return width < HERO_DESKTOP_MIN_WIDTH
    ? (ratios[0] as AspectRatio)
    : (ratios[1] as AspectRatio);
}

/**
 * The pixel box one (slot, width) pair is resized to. `Math.round` on the height is the whole rule
 * — a ratio with a non-integral height at some width (16:9 at 1080 is 607.5) must round the same
 * way in the CLI, in the `--check` gate and in TASK-082's worker or the three disagree.
 */
export function variantDimensions(
  slot: MediaSlot,
  width: number,
): { readonly width: number; readonly height: number } {
  const aspect = aspectFor(slot, width);
  return {
    width,
    height: Math.round((width * aspect.heightTerm) / aspect.widthTerm),
  };
}

/** The slot's ladder as it is written into the manifest header: ratio → the widths derived at it. */
export function aspectLadderFor(slot: MediaSlot): readonly AspectStep[] {
  const ratios = SLOT_ASPECTS[slot];
  if (ratios.length === 1) {
    return [{ ratio: (ratios[0] as AspectRatio).ratio, widths: ALL_WIDTHS }];
  }
  return ratios.map((aspect, index) => ({
    ratio: aspect.ratio,
    widths: ALL_WIDTHS.filter((width) =>
      index === 0
        ? width < HERO_DESKTOP_MIN_WIDTH
        : width >= HERO_DESKTOP_MIN_WIDTH,
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/* Encoder options and the metadata policy.                                   */
/* -------------------------------------------------------------------------- */

/**
 * The AVIF options of spec 006 §13 Q5 (quality 50, effort 4) plus the three settings that would
 * otherwise be a `sharp` default we do not control: 4:4:4 chroma (a bouquet is saturated colour
 * detail, and 4:2:0 smears petal edges), 8-bit depth and lossy.
 */
export const AVIF_OPTIONS = {
  quality: 50,
  effort: 4,
  chromaSubsampling: "4:4:4",
  lossless: false,
  bitdepth: 8,
} as const;

/** The WebP options of spec 006 §13 Q5 (quality 72), with every other lever pinned explicitly. */
export const WEBP_OPTIONS = {
  quality: 72,
  effort: 4,
  alphaQuality: 100,
  lossless: false,
  nearLossless: false,
  smartSubsample: false,
} as const;

/**
 * The single OG/email JPEG. Spec 006 §13 Q5 pins the AVIF and WebP qualities and says only "one
 * JPEG at 1200 px per asset" about this one, so the four values here are a **stated decision**
 * rather than a quotation: quality 82 is the usual "no visible artefact on a photograph" setting,
 * progressive + `optimiseCoding` costs nothing at encode time and saves bytes, and 4:2:0 is what
 * every mail client and social scraper expects. Recorded in the manifest header like the rest, so
 * changing it is a visible diff and not a silent re-encode.
 */
export const JPEG_OPTIONS = {
  quality: 82,
  progressive: true,
  chromaSubsampling: "4:2:0",
  optimiseCoding: true,
} as const;

/**
 * The resize options. `cover` + `centre` is what makes the declared aspect ratio a fact about the
 * output rather than a hope about the input, `lanczos3` is pinned because the default kernel is a
 * `sharp` default we do not control, and enlargement is **allowed**: the ladder is complete for
 * every asset or the `srcset` has holes, and an original below 1920 px is a review problem
 * (`plan/01` §6 requires ≥ 2000 px) that the intake checklist catches, not something to paper over
 * with a missing file.
 */
/**
 * The thread count `sharp` is held to while deriving, and the least obvious half of the
 * determinism contract. libvips encodes AVIF through libaom, and libaom's output **depends on the
 * number of threads it is given** — the same image at the same quality encodes to 86 062 bytes at
 * one thread and 88 980 at eight, with a different checksum each time. Left at the default
 * (`sharp` uses the core count), the manifest would change with the machine that wrote it, two
 * runs on two laptops would disagree, and TASK-082's worker on a Fly/Vercel container could never
 * reproduce these checksums (AC-25). One thread is the only value that is the same everywhere.
 */
export const ENCODER_CONCURRENCY = 1;

export const RESIZE_OPTIONS = {
  fit: "cover",
  position: "centre",
  kernel: "lanczos3",
  withoutEnlargement: false,
} as const;

/**
 * The metadata policy (`plan/01` §6, spec 006 §2.4, AC-12) — unconditional, which is why it is a
 * constant and not an argument:
 *
 *  - **EXIF, including GPS, is stripped.** `sharp` strips everything by default; nothing here asks
 *    for it back. Asserted by reading the output's metadata, not by trusting the default.
 *  - **The ICC profile is kept** (`keepIccProfile`), because dropping it is how a colour-accurate
 *    bouquet turns into a differently-coloured bouquet in a wide-gamut browser — and the colour
 *    facet is data a buyer chose on (`content/imagery/style-guide.md`).
 *  - **XMP is kept only when the original carries a C2PA claim in it.** Spec 006 §8 asks us to
 *    preserve any C2PA marking the generator embeds while stripping EXIF/GPS and personal fields;
 *    XMP is the only container `sharp` can carry across a re-encode, so an XMP-embedded claim
 *    survives and a JUMBF-boxed one cannot. The CLI reports per asset when it finds a claim it
 *    cannot carry, and provenance stays authoritative in `seed/data/media.json` either way — which
 *    is what §8's "we keep provenance in data" already relies on.
 */
export const METADATA_POLICY = {
  exif: "strip",
  gps: "strip",
  iccProfile: "keep",
  xmp: "keep-if-c2pa",
} as const;

/* -------------------------------------------------------------------------- */
/* The manifest header.                                                       */
/* -------------------------------------------------------------------------- */

/** A ratio label: two integer-or-decimal terms, as `SLOT_ASPECTS` writes them. */
const RatioSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, "an aspect ratio label reads `w:h`");

const AspectStepSchema = z
  .object({
    ratio: RatioSchema,
    widths: z.array(z.number().int().positive()).nonempty(),
  })
  .strict();

/**
 * The `pipeline` header of `seed/data/media-variants.json`: everything that decides the bytes.
 *
 * `.strict()` and fully enumerated, so the comparison the gate makes ("the manifest was written by
 * this pipeline") is a comparison of the whole record and not of the fields somebody remembered.
 */
export const MediaVariantPipelineSchema = z
  .object({
    sharp: z.string().min(1),
    libvips: z.string().min(1),
    widths: z.array(z.number().int().positive()).nonempty(),
    ogJpegWidth: z.number().int().positive(),
    concurrency: z.number().int().positive(),
    formats: z.array(z.enum(mediaFormats)).nonempty(),
    aspects: z.record(z.enum(mediaSlots), z.array(AspectStepSchema)),
    resize: z
      .object({
        fit: z.string(),
        position: z.string(),
        kernel: z.string(),
        withoutEnlargement: z.boolean(),
      })
      .strict(),
    metadata: z
      .object({
        exif: z.literal("strip"),
        gps: z.literal("strip"),
        iccProfile: z.literal("keep"),
        xmp: z.literal("keep-if-c2pa"),
      })
      .strict(),
    encoders: z
      .object({
        avif: z
          .object({
            quality: z.number().int(),
            effort: z.number().int(),
            chromaSubsampling: z.string(),
            lossless: z.boolean(),
            bitdepth: z.number().int(),
          })
          .strict(),
        webp: z
          .object({
            quality: z.number().int(),
            effort: z.number().int(),
            alphaQuality: z.number().int(),
            lossless: z.boolean(),
            nearLossless: z.boolean(),
            smartSubsample: z.boolean(),
          })
          .strict(),
        jpeg: z
          .object({
            quality: z.number().int(),
            progressive: z.boolean(),
            chromaSubsampling: z.string(),
            optimiseCoding: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type MediaVariantPipeline = z.infer<typeof MediaVariantPipelineSchema>;

/**
 * The pinned pipeline, as it is written into the manifest header and compared against it.
 *
 * A fresh object every call (a shared frozen constant spread into a JSON writer is one accidental
 * mutation away from a wrong header) and no clock, no environment and no machine name anywhere in
 * it: a header with a `generatedAt` would make every regeneration a diff, which is precisely how a
 * "deterministic" artefact stops being one (`seed/schema/header.ts` makes the same argument).
 */
export function variantPipeline(): MediaVariantPipeline {
  return {
    sharp: PINNED_SHARP_VERSION,
    libvips: PINNED_LIBVIPS_VERSION,
    widths: [...VARIANT_WIDTHS],
    ogJpegWidth: OG_JPEG_WIDTH,
    concurrency: ENCODER_CONCURRENCY,
    formats: [...mediaFormats],
    aspects: Object.fromEntries(
      mediaSlots.map((slot) => [slot, [...aspectLadderFor(slot)]]),
    ) as MediaVariantPipeline["aspects"],
    resize: { ...RESIZE_OPTIONS },
    metadata: { ...METADATA_POLICY },
    encoders: {
      avif: { ...AVIF_OPTIONS },
      webp: { ...WEBP_OPTIONS },
      jpeg: { ...JPEG_OPTIONS },
    },
  };
}
