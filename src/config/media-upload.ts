/**
 * The admin photo upload's limits and the alt-text file-name rule (spec 012b §2.7, AC-22, AC-23;
 * TASK-299).
 *
 *  - `maxBytes`: an upload is at most 15 MiB; the route refuses a larger body before reading it
 *    and stops reading once the body passes it, so nothing larger is ever decoded;
 *  - `maxPixels`: at most 40 megapixels, read from the image header before any pixel is decoded;
 *  - `jpegQuality`, `webpQuality`: the re-encode that drops every metadata block keeps the
 *    original's format at this quality (PNG is lossless);
 *  - `FILE_NAME_ALT`: an alt text that is a file name (`lipa-peonies-15.jpg`) is no alt text: the
 *    image does not render in that locale, and the editor refuses to save it.
 *
 * No database and no zod here: the public image renderer imports the alt rule, and zod must not
 * enter its render path (`src/modules/ui/media/manifest.ts`).
 */
export interface MediaUploadConfig {
  readonly maxBytes: number;
  readonly maxPixels: number;
  readonly jpegQuality: number;
  readonly webpQuality: number;
}

export const MEDIA_UPLOAD_CONFIG: MediaUploadConfig = Object.freeze({
  maxBytes: 15_728_640,
  maxPixels: 40_000_000,
  jpegQuality: 90,
  webpQuality: 90,
});

/** One path-free token ending in an image extension: what a camera or a phone names a file. */
export const FILE_NAME_ALT =
  /^[^\s/\\]+\.(?:jpe?g|png|webp|gif|heic|heif|avif|svg|tiff?|bmp)$/iu;

/** True when `alt` is a file name, or equals one of `names` (the asset's own id, say). */
export function isFileNameAlt(
  alt: string,
  names: readonly string[] = [],
): boolean {
  const value = alt.trim();
  if (FILE_NAME_ALT.test(value)) return true;
  const lower = value.toLocaleLowerCase("en");
  return names.some((name) => name.toLocaleLowerCase("en") === lower);
}
