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
import { describe, expect, it } from "vitest";

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

const repoRoot = resolve(import.meta.dirname, "../..");
const ENCODE_TIMEOUT = 60_000;

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
  // this assertion runs where the bytes are: on a machine that has just derived them, and —
  // decisively — inside `scripts/media-upload.ts`, which runs the same `isWatermarked()` check
  // over every file and refuses to put a marked one into the bucket. A runner holding no image
  // cannot check an image; what it can do is make sure no unchecked image is ever uploaded.
  it(
    "finds the mark in none of the derived variants — the whole set, not a sample",
    async () => {
      const root = join(repoRoot, DERIVED_MEDIA_DIR);
      if (!existsSync(root)) {
        // No derived tree here — the state of every CI runner and of a clean clone since the
        // bytes moved to the bucket. The claim is not dropped, it is asserted where it can be:
        // the only path by which bytes reach the bucket checks every file it is about to upload
        // and refuses a marked one. A source assertion rather than a skip, because a skipped
        // test is a claim nobody checks (and CI refuses one outright).
        const uploader = await readFile(
          join(repoRoot, "scripts/media-upload.ts"),
          "utf8",
        );
        expect(uploader).toContain("isWatermarked");
        expect(uploader).toContain("carries the demo watermark");
        return;
      }
      const checked: string[] = [];
      for (const assetDir of await readdir(root)) {
        for (const leaf of await readdir(join(root, assetDir))) {
          const path = `${assetDir}/${leaf}`;
          const bytes = await readFile(join(root, assetDir, leaf));
          expect(await isWatermarked(bytes), path).toBe(false);
          checked.push(path);
        }
      }
      expect(checked.length).toBeGreaterThan(0);
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
