/**
 * An admin photo upload, from the bytes posted to the bytes stored (spec 012b §2.7, AC-22;
 * TASK-299).
 *
 * In this order, each step refusing before the next one costs anything:
 *
 *  1. **Size**: more than `MEDIA_UPLOAD_CONFIG.maxBytes` (15 MiB) is `too_large`. The route has
 *     already refused a larger declared body and stopped reading a larger stream.
 *  2. **Type by magic bytes**, never by the file name or the client's `Content-Type`: JPEG, PNG
 *     or WebP. An SVG, a HEIC, an AVIF, a GIF or anything else is `type`.
 *  3. **Pixels from the header**: `sharp(...).metadata()` reads the header and decodes no pixel;
 *     more than 40 megapixels is `too_many_pixels`. The decode below carries the same limit
 *     (`limitInputPixels`) a second time.
 *  4. **Decode and re-encode in the same format**, rotated upright by the EXIF orientation. No
 *     `withMetadata`, `keepExif`, `keepIccProfile` or `withXmp`: `sharp` then writes no EXIF,
 *     GPS, XMP or IPTC block and converts to sRGB without embedding a profile. Bytes that do not
 *     decode are `undecodable`.
 *
 * Nothing here logs a byte, a file name or a dimension.
 */
import { createHash } from "node:crypto";

import sharp from "sharp";

import { MEDIA_UPLOAD_CONFIG } from "@/config/media-upload";
import { sniffImageMime } from "@/lib/storage-r2";

/** The three types an admin photo may arrive as (§2.7). */
export const UPLOAD_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadMime = (typeof UPLOAD_MIMES)[number];

export type ImageRefusal =
  "empty" | "too_large" | "type" | "too_many_pixels" | "undecodable";

/** The stored original: metadata-free bytes and their facts. */
export interface CleanImage {
  readonly body: Uint8Array;
  readonly mime: UploadMime;
  readonly width: number;
  readonly height: number;
  readonly checksumSha256: string;
}

export type CleanImageResult =
  | { readonly ok: true; readonly image: CleanImage }
  | { readonly ok: false; readonly reason: ImageRefusal };

function isUploadMime(mime: string | undefined): mime is UploadMime {
  return (UPLOAD_MIMES as readonly (string | undefined)[]).includes(mime);
}

/** Steps 1 to 4 of the header. */
export async function cleanUploadedImage(
  bytes: Uint8Array,
  config = MEDIA_UPLOAD_CONFIG,
): Promise<CleanImageResult> {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > config.maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  const mime = sniffImageMime(bytes);
  if (!isUploadMime(mime)) return { ok: false, reason: "type" };

  let width: number;
  let height: number;
  try {
    const header = await sharp(bytes, { limitInputPixels: false }).metadata();
    width = header.width;
    height = header.height;
  } catch {
    return { ok: false, reason: "undecodable" };
  }
  if (!(width > 0 && height > 0)) return { ok: false, reason: "undecodable" };
  if (width * height > config.maxPixels) {
    return { ok: false, reason: "too_many_pixels" };
  }

  const pipeline = sharp(bytes, {
    failOn: "error",
    limitInputPixels: config.maxPixels,
  }).rotate();
  const encoded =
    mime === "image/jpeg"
      ? pipeline.jpeg({ quality: config.jpegQuality })
      : mime === "image/png"
        ? pipeline.png()
        : pipeline.webp({ quality: config.webpQuality });
  try {
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    const body = new Uint8Array(data);
    return {
      ok: true,
      image: {
        body,
        mime,
        width: info.width,
        height: info.height,
        checksumSha256: createHash("sha256").update(body).digest("hex"),
      },
    };
  } catch {
    return { ok: false, reason: "undecodable" };
  }
}
