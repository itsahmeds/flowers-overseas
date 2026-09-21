/**
 * The demo watermark: the mechanism works, and **nothing shipped carries it** (spec 006 §2.5,
 * §13 Q12, **AC-16**; T-16; TASK-080).
 *
 * AC-16 is two claims joined by an "and", and a test that asserted only one of them would be
 * worthless in both directions. A pixel check that never runs against a marked image proves
 * nothing about the mechanism; a mechanism that is never checked against the shipped bytes proves
 * nothing about the demo. So:
 *
 *  1. `applyWatermark()` on a fixture produces bytes the check finds the mark in — asserted
 *     through the same lossy AVIF and WebP encoders the ladder uses, because a mark that only
 *     survives a PNG round trip is not a mark on anything we serve;
 *  2. **every one of the derived variants** is checked and none carries it — the whole set, not
 *     a sample, because "no watermarked asset ships" is a statement about all of them. Since
 *     TASK-138 the bytes live in `flowersoverseas-media` rather than in the repository, so this
 *     runs against `.local/media/` where that tree exists and is enforced for real by
 *     `scripts/media-upload.ts`, which checks every file it is about to upload and refuses a
 *     marked one;
 *  3. the dataset has no `depicts: "context"` asset, which is the only class the CLI would mark,
 *     so the branch is unreachable as well as unused (§13 Q12's "the mechanism is kept and no
 *     watermarked asset ships in Phase 0").
 *
 * **On AC-16's "no watermarked asset appears on a production-rendered page".** The production
 * render has exactly one image origin — the media bucket, and every URL on a page comes from the
 * manifest rows the uploader uploaded — so
 * (2) *is* that assertion: there is no other file a page could serve. The one nuance the
 * orchestrator's 2026-09-18 carry-forward records is that the live site is `noindex` and behind a
 * preview domain, so "production-rendered" is read against the real domain; the invariant asserted
 * here is stronger and domain-independent, because it is about the bytes rather than the host.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { loadUploadSet } from "../../scripts/media-upload.ts";
import { DERIVED_MEDIA_DIR } from "../../seed/budgets.ts";
import { AVIF_OPTIONS, WEBP_OPTIONS } from "../../seed/schema/variants.ts";
import {
  WATERMARK_MARKER_RGB,
  WATERMARK_WORD,
  applyWatermark,
  isWatermarked,
  markerMean,
  watermarkSvg,
} from "../../seed/watermark.ts";
import {
  removeDerivedTrees,
  variantBox,
  writeDerivedTree,
} from "./support/derived-tree.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const ENCODE_TIMEOUT = 60_000;

/** The fixture asset: `occasionTile`, a single 384 px width, the tightest cap in the dataset. */
const TILE_ASSET = "home-occasion-birthday";
const TILE_WIDTH = 384;

afterAll(removeDerivedTrees);

/** A plausible stand-in for a style-guide frame: warm grey, no magenta anywhere in it. */
async function warmGreyFrame(width = 640, height = 640): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 214, g: 209, b: 201 },
    },
  })
    .png()
    .toBuffer();
}

describe("T-16: the watermark mechanism exists and is checkable (AC-16)", () => {
  it(
    "marks a frame, and the check finds the mark through both lossy encoders",
    async () => {
      const clean = await warmGreyFrame();
      expect(await isWatermarked(clean)).toBe(false);

      const marked = await applyWatermark(clean);
      expect(await isWatermarked(marked)).toBe(true);

      // The mark has to survive the pipeline, not a lossless copy of it: these are the pinned
      // encoder options the committed ladder was written with.
      for (const encode of [
        (input: Buffer) => sharp(input).avif(AVIF_OPTIONS).toBuffer(),
        (input: Buffer) => sharp(input).webp(WEBP_OPTIONS).toBuffer(),
      ]) {
        expect(await isWatermarked(await encode(marked))).toBe(true);
        expect(await isWatermarked(await encode(clean))).toBe(false);
      }
    },
    ENCODE_TIMEOUT,
  );

  it(
    "is a reference crop, not a guess: the marker reads as the reserved colour",
    async () => {
      const marked = await applyWatermark(await warmGreyFrame());
      const mean = await markerMean(marked);
      // Within a few units of the reserved colour on every channel — the check's tolerance is 28,
      // and the measured distance being far inside it is what makes the tolerance a margin rather
      // than the thing that makes the test pass.
      expect(Math.abs(mean.r - WATERMARK_MARKER_RGB.r)).toBeLessThan(8);
      expect(Math.abs(mean.g - WATERMARK_MARKER_RGB.g)).toBeLessThan(8);
      expect(Math.abs(mean.b - WATERMARK_MARKER_RGB.b)).toBeLessThan(8);
    },
    ENCODE_TIMEOUT,
  );

  it("bakes the word into the bytes rather than overlaying it with CSS", () => {
    // §2.5's requirement, asserted where it is decided: the mark is an SVG composited into the
    // raster, so it is in the file a florist saves, screenshots or opens directly.
    const svg = watermarkSvg(640, 800);
    expect(svg).toContain(WATERMARK_WORD);
    expect(svg).toContain("<rect");
    // Deterministic: the same box produces the same overlay, byte for byte.
    expect(watermarkSvg(640, 800)).toBe(svg);
  });
});

describe("T-16: no watermarked asset ships in Phase 0 (§13 Q12)", () => {
  // TASK-138 moved the derived bytes out of the repository and into `flowersoverseas-media`, so
  // the files this claim is about are on no runner at all. The test below therefore builds one,
  // and asserts AC-16 where it is actually enforced: `scripts/media-upload.ts` is the only path
  // by which a byte reaches the bucket, and a marked file has to die there.
  //
  // `/review 94` round 2 is why it is written this way rather than branching. The stand-in for a
  // runner with no tree used to be `expect(uploader).toContain("isWatermarked")` — a grep over
  // the uploader's source, which catches deleting the refusal and nothing else. The reviewer left
  // the text in place, put the branch behind `items.length < 0`, and the whole 4 357-case unit
  // suite stayed green. A fixture tree closes that: the guard is exercised, not read. The loop
  // over this machine's own derived tree stays, as the stronger statement where it can be made,
  // but it is no longer the part the claim rests on.
  it(
    "is refused by the only path bytes take to the bucket, and marks none of the variants this machine holds",
    async () => {
      const box = variantBox(TILE_ASSET, TILE_WIDTH);
      const frame = await warmGreyFrame(box.width, box.height);
      const encode = async (input: Buffer): Promise<Buffer> =>
        await sharp(input).avif(AVIF_OPTIONS).toBuffer();
      const clean = await encode(frame);
      const marked = await encode(await applyWatermark(frame));
      expect(await isWatermarked(clean)).toBe(false);
      expect(await isWatermarked(marked)).toBe(true);

      // The clean twin loads, so the refusal below is the watermark refusal and not the fixture.
      await expect(
        loadUploadSet({
          root: writeDerivedTree([
            {
              assetId: TILE_ASSET,
              width: TILE_WIDTH,
              format: "avif",
              data: clean,
            },
          ]),
        }),
      ).resolves.toHaveLength(1);
      await expect(
        loadUploadSet({
          root: writeDerivedTree([
            {
              assetId: TILE_ASSET,
              width: TILE_WIDTH,
              format: "avif",
              data: marked,
            },
          ]),
        }),
      ).rejects.toThrow(/carries the demo watermark, which never ships/u);

      // And, where this machine has just derived the real ladder, every one of those files too.
      const root = join(repoRoot, DERIVED_MEDIA_DIR);
      for (const assetDir of existsSync(root) ? await readdir(root) : []) {
        for (const leaf of await readdir(join(root, assetDir))) {
          const bytes = await readFile(join(root, assetDir, leaf));
          expect(await isWatermarked(bytes), `${assetDir}/${leaf}`).toBe(false);
        }
      }
    },
    5 * ENCODE_TIMEOUT,
  );

  it("has no `context` asset, so the marking branch is unreachable as well as unused", async () => {
    const media = JSON.parse(
      await readFile(join(repoRoot, "seed/data/media.json"), "utf8"),
    ) as { rows: { id: string; slot: string; depicts: string }[] };
    expect(media.rows.length).toBeGreaterThan(0);
    for (const row of media.rows) {
      expect(row.depicts, row.id).not.toBe("context");
      expect(row.slot, row.id).not.toBe("context");
    }
  });
});
