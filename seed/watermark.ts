/**
 * The demo watermark and its pixel check (spec 006 §2.5 "Honesty label", §13 Q12, **AC-16**;
 * `plan/10` §3, §5; TASK-080).
 *
 * Spec 006 §2.5 says the demo environment's sample photographs carry a "sample" watermark and that
 * it is **baked into the variant at generation time**, not painted on with CSS — because a CSS
 * overlay is removed by a screenshot, by "save image as", by a reader-mode extension and by
 * anybody who opens the file directly, and a mark that comes off is not a mark. §13 Q12 then
 * settled the Phase-0 half: **the mechanism is kept and no watermarked asset ships.** Both halves
 * are asserted (`tests/unit/media-watermark.test.ts`): the mechanism demonstrably marks a fixture,
 * and every one of the committed variants demonstrably carries no mark.
 *
 * **Why a marker swatch as well as the wordmark.** The visible mark is the repeated word for a
 * human; the check has to be a *pixel* check that survives a lossy re-encode, so the mark also
 * lays down one small opaque rectangle of a reserved colour at a fixed, relative position. Pure
 * magenta is the reserved colour for the reason it is reserved in every chroma-key rig: the locked
 * style guide is warm greys, greens, whites and flower colours on a seamless neutral background,
 * and no photograph it admits contains a solid patch of `rgb(255, 0, 255)`. A mean over the
 * swatch, compared within a tolerance wide enough for AVIF quality 50 and narrow enough that a
 * magenta-ish petal cannot reach it, is therefore a decision and not a guess.
 *
 * **What this module deliberately is not.** It is not a provenance signal. C2PA and SynthID live
 * on the originals (`docs/compliance/imagery-generator-terms.md` answer 8) and are recorded per
 * asset as `originalSha256` / `derivativeC2pa` in `seed/data/media.json`, because the AVIF/WebP
 * re-encode strips them. This watermark says one thing only, to a florist looking at a demo: *this
 * picture is a sample*.
 *
 * No filesystem, no clock and no network: buffers in, buffers and numbers out, so the whole
 * mechanism is testable without deriving anything.
 */
import sharp from "sharp";

/** The reserved swatch colour. See the header for why it is this one. */
export const WATERMARK_MARKER_RGB = { r: 255, g: 0, b: 255 } as const;

/**
 * How far a channel mean may sit from the marker colour and still count as the marker.
 *
 * 28 is measured rather than chosen: AVIF at the pinned quality 50 with 4:4:4 chroma moves a solid
 * magenta patch by under 10 per channel, and the nearest thing the style guide admits — a
 * saturated pink peony — sits more than 60 away on the green channel. Anything between those two
 * numbers works; the midpoint is the one that says "neither edge was cut fine".
 */
export const WATERMARK_MARKER_TOLERANCE = 28;

/**
 * The marker's box as a fraction of the image, measured from the top-left. A *relative* box so the
 * same check works at every step of the ladder without a per-width table, and small enough
 * (6 % of each edge, inset 4 %) that it costs a demo tile almost nothing.
 */
export const WATERMARK_MARKER_BOX = {
  left: 0.04,
  top: 0.04,
  width: 0.06,
  height: 0.06,
} as const;

/** The repeated word. A message key would be wrong here: it is burnt into bytes, not rendered. */
export const WATERMARK_WORD = "sample";

/**
 * The SVG overlay for one image size: the marker swatch plus the word repeated on a diagonal.
 *
 * Deterministic by construction — every number is a function of `width`/`height` alone, there is
 * no font file (the text is drawn with the generic `sans-serif` family, which only affects the
 * human-readable half; the pixel check reads the swatch), and no randomness anywhere.
 */
export function watermarkSvg(width: number, height: number): string {
  const box = WATERMARK_MARKER_BOX;
  const markerX = Math.round(width * box.left);
  const markerY = Math.round(height * box.top);
  const markerW = Math.max(4, Math.round(width * box.width));
  const markerH = Math.max(4, Math.round(height * box.height));
  const fontSize = Math.max(10, Math.round(width / 14));
  const step = fontSize * 4;

  const words: string[] = [];
  for (let y = -height; y < height * 2; y += step) {
    for (let x = -width; x < width * 2; x += step * 2) {
      words.push(
        `<text x="${String(x)}" y="${String(y)}" font-family="sans-serif" font-size="${String(fontSize)}" fill="#ffffff" fill-opacity="0.45" transform="rotate(-30 ${String(x)} ${String(y)})">${WATERMARK_WORD}</text>`,
      );
    }
  }

  const { r, g, b } = WATERMARK_MARKER_RGB;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">${words.join("")}<rect x="${String(markerX)}" y="${String(markerY)}" width="${String(markerW)}" height="${String(markerH)}" fill="rgb(${String(r)},${String(g)},${String(b)})"/></svg>`;
}

/**
 * Bake the mark into a raster buffer. The output is the same pixel box as the input, so a
 * watermarked variant is the same file the ladder would otherwise have written, marked.
 */
export async function applyWatermark(image: Buffer): Promise<Buffer> {
  const base = sharp(image);
  const metadata = await base.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error("watermark: the buffer has no pixel dimensions");
  }
  return base
    .composite([{ input: Buffer.from(watermarkSvg(width, height)) }])
    .toBuffer();
}

/** The mean RGB of the marker box — the "reference crop" AC-16 asks the check to be made against. */
export async function markerMean(
  image: Buffer,
): Promise<{ readonly r: number; readonly g: number; readonly b: number }> {
  const box = WATERMARK_MARKER_BOX;
  const metadata = await sharp(image).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error("watermark: the buffer has no pixel dimensions");
  }
  const { data, info } = await sharp(image)
    .extract({
      left: Math.round(width * box.left),
      top: Math.round(height * box.top),
      width: Math.max(4, Math.round(width * box.width)),
      height: Math.max(4, Math.round(height * box.height)),
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixels = data.length / channels;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let index = 0; index < data.length; index += channels) {
    r += data[index] ?? 0;
    g += data[index + 1] ?? 0;
    b += data[index + 2] ?? 0;
  }
  return { r: r / pixels, g: g / pixels, b: b / pixels };
}

/** Does this buffer carry the demo mark? The one question AC-16 asks of every committed file. */
export async function isWatermarked(image: Buffer): Promise<boolean> {
  const mean = await markerMean(image);
  return (
    Math.abs(mean.r - WATERMARK_MARKER_RGB.r) <= WATERMARK_MARKER_TOLERANCE &&
    Math.abs(mean.g - WATERMARK_MARKER_RGB.g) <= WATERMARK_MARKER_TOLERANCE &&
    Math.abs(mean.b - WATERMARK_MARKER_RGB.b) <= WATERMARK_MARKER_TOLERANCE
  );
}
