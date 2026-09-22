/**
 * A throwaway repository root holding a **derived media tree** and the two seed manifests that
 * describe it (spec 006 §2.5, §2.6, AC-14/AC-15/AC-16; TASK-138).
 *
 * Why this exists. Since TASK-138 the derived bytes are git-ignored — they live in
 * `flowersoverseas-media`, not in the repository — so every gate over those bytes has two halves:
 * a manifest half that runs everywhere, and a **file** half that runs only where a tree exists.
 * On a CI runner, and on any clean clone, the file half has no subject. `/review 94`'s round 2
 * showed what that does to a test suite: the three places that stood in for the file half were a
 * source grep, a `length > 0` tautology and nothing at all, and the uploader's two refusals could
 * both be made unreachable with 4 357 unit tests still green.
 *
 * A fixture tree fixes that properly. The subject is no longer "the tree this machine happens to
 * hold" but a tree the test builds, so the file half of every gate runs **identically on every
 * machine** — including the runner that holds no image — and a neutered guard fails.
 *
 * The tree is real in the ways the gates read it: `seed/data/media.json` is the repository's own
 * asset manifest (so slots, ids and caps are the shipped ones), the variant rows are computed from
 * the bytes actually written, and the box comes from `variantDimensions()`. Nothing here decodes
 * an image — `checkVariants()` does not either; it is checksums and byte counts — so a caller that
 * needs a *picture* (a watermarked one, an oversized one) encodes it with `sharp` and hands the
 * buffer over.
 */
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  MEDIA_MANIFEST_PATH,
  VARIANT_MANIFEST_PATH,
  readMediaAssets,
  sha256,
  variantFilePath,
  variantManifestValue,
  variantObjectKey,
} from "../../../seed/media-variants.ts";
import type {
  MediaFormat,
  MediaSlot,
  MediaVariantManifest,
} from "../../../seed/schema/media.ts";
import { variantDimensions } from "../../../seed/schema/variants.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");

/** One file in the fixture tree, and the row that will describe it. */
export interface FixtureVariant {
  /** An asset id from the repository's own `seed/data/media.json`. */
  readonly assetId: string;
  /** A ladder width the asset's slot ships; the height follows from the slot's aspect ratio. */
  readonly width: number;
  readonly format: MediaFormat;
  /** The bytes written to `.local/media/{assetId}/{width}.{format}`. */
  readonly data: Buffer;
  /**
   * Describe the row as if the file held *these* bytes instead. The one way to build a tree whose
   * manifest disagrees with its files, which is what AC-14's file half exists to catch.
   */
  readonly recordAs?: Buffer;
}

/** The slot the repository's asset manifest gives an asset id. */
export function slotOfAsset(assetId: string): MediaSlot {
  const asset = readMediaAssets(repoRoot).find((row) => row.id === assetId);
  if (asset === undefined) {
    throw new Error(
      `${assetId} is not an asset in ${MEDIA_MANIFEST_PATH} — the fixture must name a real asset so the real slot cap applies`,
    );
  }
  return asset.slot;
}

/** The pixel box one variant of an asset must have, per its slot's declared aspect ratio. */
export function variantBox(
  assetId: string,
  width: number,
): { readonly width: number; readonly height: number } {
  return variantDimensions(slotOfAsset(assetId), width);
}

const trees: string[] = [];

/**
 * Write a temporary repository root: the repository's `seed/data/media.json`, a variant manifest
 * describing exactly the files given, and those files under `.local/media/`.
 *
 * The returned root is accepted by `checkVariants({ root })`, `loadUploadSet({ root })` and every
 * other gate that takes one. Call `removeDerivedTrees()` from `afterAll`.
 */
export function writeDerivedTree(variants: readonly FixtureVariant[]): string {
  const root = mkdtempSync(join(tmpdir(), "fo-derived-tree-"));
  trees.push(root);

  mkdirSync(join(root, "seed/data"), { recursive: true });
  copyFileSync(
    join(repoRoot, MEDIA_MANIFEST_PATH),
    join(root, MEDIA_MANIFEST_PATH),
  );

  const rows: MediaVariantManifest[] = [];
  // `.local/media/` is created even for an empty set: "no tree" and "an empty tree" are different
  // states to `checkVariants()`, and a caller asking for a tree means the former must not happen.
  mkdirSync(join(root, ".local/media"), { recursive: true });

  for (const variant of variants) {
    const path = variantFilePath(
      variant.assetId,
      variant.width,
      variant.format,
    );
    mkdirSync(join(root, ".local/media", variant.assetId), { recursive: true });
    writeFileSync(join(root, path), variant.data);

    const recorded = variant.recordAs ?? variant.data;
    const box = variantBox(variant.assetId, variant.width);
    rows.push({
      assetId: variant.assetId,
      variant: String(variant.width),
      width: box.width,
      height: box.height,
      format: variant.format,
      bytes: recorded.byteLength,
      checksumSha256: sha256(recorded),
      objectKey: variantObjectKey(
        variant.assetId,
        variant.width,
        variant.format,
      ),
    });
  }

  writeFileSync(
    join(root, VARIANT_MANIFEST_PATH),
    `${JSON.stringify(variantManifestValue(rows), null, 2)}\n`,
  );
  return root;
}

/** Remove every tree this process built. */
export function removeDerivedTrees(): void {
  for (const root of trees.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
