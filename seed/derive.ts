/**
 * The deterministic `sharp` ladder of one asset, shared by `pnpm media:variants` and the
 * `media.derive_variants` worker (spec 006 §2.4, §2.6, AC-13, AC-25; TASK-078, TASK-082).
 *
 * Moved verbatim out of `seed/media-variants.ts` (which re-exports every name, so the CLI and its
 * tests are unchanged) for one reason: the CLI also imports `prettier` and the filesystem, and the
 * worker runs in the web process through the minute tick, where neither belongs. Keeping **one**
 * `deriveVariants` is what makes AC-25's "the same ladder and the same checksums as the local
 * CLI" true by construction rather than by two copies agreeing: the worker calls this function with
 * the committed pipeline header, as the CLI does.
 *
 * `ladderFor()` is the one new function: the (width, format) list `deriveVariants` encodes, as
 * data, so the worker can tell which rows an asset *should* have — and that it already has all of
 * them — without decoding a byte (AC-25: "a second run … re-encodes nothing").
 */
import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  type MediaFormat,
  type MediaSlot,
  type MediaVariantManifest,
  mediaFormats,
} from "./schema/media.ts";
import {
  PINNED_LIBVIPS_VERSION,
  PINNED_SHARP_VERSION,
  type MediaVariantPipeline,
  avifOptionsFor,
  variantDimensions,
  variantPipeline,
} from "./schema/variants.ts";
import { watermarkSvg } from "./watermark.ts";

/** `{assetId}/{width}.{fmt}` — the one place the file name is decided. */
export function variantLeaf(
  assetId: string,
  width: number,
  format: MediaFormat,
): string {
  return `${assetId}/${String(width)}.${format}`;
}

/** The `object_key` of one variant: the `public/` path and the URL agree by construction. */
export function variantObjectKey(
  assetId: string,
  width: number,
  format: MediaFormat,
): string {
  return `media/${variantLeaf(assetId, width, format)}`;
}

/* -------------------------------------------------------------------------- */
/* Deriving.                                                                  */
/* -------------------------------------------------------------------------- */

/** One derived file: its manifest row and the bytes that produced the row's checksum. */
export interface DerivedVariant {
  readonly row: MediaVariantManifest;
  readonly data: Buffer;
}

/** The format order inside one width, and the order rows are written in. */
const FORMAT_ORDER: readonly MediaFormat[] = mediaFormats;

/** A lowercase hex SHA-256 of a buffer — the `checksum_sha256` of spec 002 §5.1. */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Whether the original's XMP carries a C2PA claim. Spec 006 §8 asks that any C2PA marking the
 * generator embedded be preserved while EXIF/GPS is stripped unconditionally, and XMP is the only
 * container a `sharp` re-encode can carry across formats: an XMP-embedded claim survives, a
 * JUMBF-boxed one cannot and is reported per asset. Provenance stays authoritative in
 * `seed/data/media.json` either way, which is what §8's "provenance is data" already relies on.
 */
export function hasC2paXmp(xmp: Buffer | undefined): boolean {
  if (xmp === undefined) return false;
  return xmp.toString("latin1").toLowerCase().includes("c2pa");
}

/** Refuse to encode with anything but the pinned encoder (AC-13). */
export function assertPinnedEncoder(): void {
  const versions = sharp.versions;
  if (versions.sharp !== PINNED_SHARP_VERSION) {
    throw new Error(
      `sharp ${versions.sharp} is loaded but ${PINNED_SHARP_VERSION} is pinned: every checksum in seed/data/media-variants.json was produced by the pinned build, so a different one must not write over them (spec 006 AC-13). Run \`pnpm install\`, or bump PINNED_SHARP_VERSION in seed/schema/variants.ts and re-derive every asset in one commit`,
    );
  }
  if (versions.vips !== PINNED_LIBVIPS_VERSION) {
    throw new Error(
      `libvips ${String(versions.vips)} is loaded but ${PINNED_LIBVIPS_VERSION} is pinned (sharp ${PINNED_SHARP_VERSION} ships it as a prebuilt binary): a globally installed libvips encodes different bytes (spec 006 AC-13). Unset SHARP_FORCE_GLOBAL_LIBVIPS and re-install`,
    );
  }
}

/**
 * Derive the whole ladder of one asset: AVIF + WebP at each width **the slot ships** in its
 * declared aspect ratio, plus the single OG/email JPEG where the slot is one of `ogJpegSlots`.
 *
 * The widths come from the pipeline header's `aspects[slot]` rather than from its `widths`
 * (TASK-080). `widths` is the §13 Q5 vocabulary; `aspects[slot]` is the Phase-0 ladder
 * `PHASE0_SLOT_WIDTHS` chose for this slot, and deriving from the same field `--check` verifies is
 * what keeps "the manifest describes the bytes" true by construction rather than by agreement.
 *
 * Pure in the sense that matters: buffer in, buffers out, no filesystem and no clock. That is what
 * lets T-12/T-13 assert the ladder, the ratios, the stripped metadata and the byte-identity of two
 * runs without writing anything, and what TASK-082's worker will call with the same options to
 * reproduce these checksums (AC-25).
 */
export async function deriveVariants(
  asset: {
    readonly id: string;
    readonly slot: MediaSlot;
    readonly depicts?: string;
  },
  original: Buffer,
  pipeline: MediaVariantPipeline = variantPipeline(),
  options: { readonly demo?: boolean } = {},
): Promise<readonly DerivedVariant[]> {
  sharp.concurrency(pipeline.concurrency);
  const keepXmp = hasC2paXmp((await sharp(original).metadata()).xmp);

  // The demo watermark of §2.5, baked into the bytes rather than painted on with CSS, and applied
  // to `depicts: "context"` assets only — the in-home shots that could be mistaken for a delivery
  // photograph. §13 Q12 keeps the mechanism and ships nothing marked: `--demo` is off by default
  // and the Phase-0 dataset has no `context` asset, so this branch is unreachable today and
  // `tests/unit/media-watermark.test.ts` asserts both halves rather than trusting the sentence.
  const watermark = options.demo === true && asset.depicts === "context";

  const jobs = ladderFor(asset.slot, pipeline);

  const derived: DerivedVariant[] = [];
  for (const job of jobs) {
    const box = variantDimensions(asset.slot, job.width);
    // Metadata: `sharp` writes none unless asked, so EXIF and GPS are gone by construction
    // (`plan/01` §6, AC-12 — asserted by reading the output's metadata in the test, not trusted
    // here); the ICC profile is kept because a colour-accurate bouquet is the point of the style
    // guide; XMP only when it carries the C2PA claim of spec 006 §8.
    let pipe = sharp(original)
      .resize({
        width: box.width,
        height: box.height,
        fit: pipeline.resize.fit as "cover",
        position: pipeline.resize.position,
        kernel: pipeline.resize.kernel as "lanczos3",
        withoutEnlargement: pipeline.resize.withoutEnlargement,
      })
      .keepIccProfile();
    if (keepXmp) pipe = pipe.keepXmp();
    if (watermark) {
      pipe = pipe.composite([
        { input: Buffer.from(watermarkSvg(box.width, box.height)) },
      ]);
    }

    const data =
      job.format === "avif"
        ? await pipe
            .avif({
              ...avifOptionsFor(pipeline, asset.slot, job.width),
              // The schema types the pinned options as plain numbers (it is a JSON header, and a
              // hand-edited `bitdepth: 9` must fail the gate with a message rather than fail to
              // compile); `sharp` types this one as the 8 | 10 | 12 union, so the narrowing
              // happens once, here, at the call.
              bitdepth: pipeline.encoders.avif.bitdepth as 8 | 10 | 12,
            })
            .toBuffer()
        : job.format === "webp"
          ? await pipe.webp(pipeline.encoders.webp).toBuffer()
          : await pipe.jpeg(pipeline.encoders.jpeg).toBuffer();

    derived.push({
      data,
      row: {
        assetId: asset.id,
        // The ladder step's name is the width as a string — spec 006 §5.2, so that
        // `objectKey(kind, id, variant)` needs no second vocabulary.
        variant: String(job.width),
        width: box.width,
        height: box.height,
        format: job.format,
        bytes: data.byteLength,
        checksumSha256: sha256(data),
        objectKey: variantObjectKey(asset.id, job.width, job.format),
      },
    });
  }
  return sortVariants(derived, [asset.id]);
}

/** Rows in `media.json` asset order, then width ascending, then AVIF, WebP, JPEG. */
export function sortVariants(
  derived: readonly DerivedVariant[],
  assetOrder: readonly string[],
): DerivedVariant[] {
  return [...derived].sort((left, right) => {
    const byAsset =
      assetOrder.indexOf(left.row.assetId) -
      assetOrder.indexOf(right.row.assetId);
    if (byAsset !== 0) return byAsset;
    if (left.row.width !== right.row.width)
      return left.row.width - right.row.width;
    return (
      FORMAT_ORDER.indexOf(left.row.format) -
      FORMAT_ORDER.indexOf(right.row.format)
    );
  });
}

/** One encode of the ladder: a width and a format. */
export interface LadderStep {
  readonly width: number;
  readonly format: MediaFormat;
}

/**
 * The encodes `deriveVariants` performs for a slot, in its order: AVIF + WebP at each width the
 * slot ships (from the pipeline header's `aspects[slot]`, de-duplicated and ascending), then the
 * single OG/email JPEG where the slot is one of `ogJpegSlots`. Pure.
 */
export function ladderFor(
  slot: MediaSlot,
  pipeline: MediaVariantPipeline = variantPipeline(),
): readonly LadderStep[] {
  const widths = [
    ...new Set((pipeline.aspects[slot] ?? []).flatMap((step) => step.widths)),
  ].sort((left, right) => left - right);
  return [
    ...widths.flatMap((width) =>
      (["avif", "webp"] as const).map((format) => ({ width, format })),
    ),
    ...(pipeline.ogJpegSlots.includes(slot)
      ? [{ width: pipeline.ogJpegWidth, format: "jpeg" as const }]
      : []),
  ];
}
