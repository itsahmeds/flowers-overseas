/**
 * The delivery photo, from the florist's upload to the bytes we store (spec 011 §2 "The delivery
 * photo", §5.2 "Photo", §8 security; AC-30; TASK-215).
 *
 *  - `readPhotoUpload(request, limits)`: the `multipart/form-data` body read **bounded while
 *    streaming** (at most the photo's limit plus the form's framing, so a 2 GB body is never
 *    buffered), then the one `photo` field. Over the bound, or a `photo` over `maxBytes`, is
 *    `too_large`; no file at all is `missing`.
 *  - `DeliveryPhotoUploadSchema`: the MIME **from the magic bytes**, never from the client's
 *    `Content-Type` or file name, among JPEG, PNG and WebP; the size at most `maxBytes`. A GIF,
 *    an AVIF, a PDF or a renamed anything is `wrong_type`.
 *  - `processDeliveryPhoto(bytes)`: `sharp` decodes, rotates by the EXIF orientation, resizes to
 *    at most 2000 px on the long edge and re-encodes to JPEG. No `withMetadata`/`keepExif`/
 *    `keepIccProfile`: `sharp` writes no EXIF, XMP, IPTC or GPS block unless asked, and converts
 *    to sRGB without embedding a profile. Bytes `sharp` cannot decode are `wrong_type`.
 *
 * Nothing here logs a byte, a file name or a dimension of the upload.
 */
import { createHash } from "node:crypto";

import sharp, { type OutputInfo } from "sharp";
import { z } from "zod";

import { floristsConfig } from "@/config/florists";
import { sniffImageMime } from "@/lib/storage-r2";

/** The three types a delivery photo may arrive as (§2). */
export const DELIVERY_PHOTO_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** The form field the photo step posts (`PhotoField`'s `name`). */
export const PHOTO_FIELD = "photo";

/** Room for the multipart boundary and part headers around the one file. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export interface PhotoLimits {
  readonly maxBytes: number;
  readonly maxEdgePx: number;
}

export const DEFAULT_PHOTO_LIMITS: PhotoLimits = {
  maxBytes: floristsConfig.photo.maxBytes,
  maxEdgePx: floristsConfig.photo.maxEdgePx,
};

/** §5.2's schema: `mime` from the magic bytes, `bytes` bounded. */
export function deliveryPhotoUploadSchema(
  maxBytes: number = DEFAULT_PHOTO_LIMITS.maxBytes,
) {
  return z
    .object({
      mime: z.enum(DELIVERY_PHOTO_MIMES),
      bytes: z.number().int().positive().max(maxBytes),
    })
    .strict();
}
export const DeliveryPhotoUploadSchema = deliveryPhotoUploadSchema();

/** Why a photo is refused, each with its own message (Appendix A). */
export const PHOTO_REFUSALS = ["wrong_type", "too_large", "missing"] as const;
export type PhotoRefusal = (typeof PHOTO_REFUSALS)[number];

export class DeliveryPhotoRefused extends Error {
  override readonly name = "DeliveryPhotoRefused";
  readonly reason: PhotoRefusal;

  constructor(reason: PhotoRefusal) {
    super(`delivery photo refused: ${reason}`);
    this.reason = reason;
  }
}

/** The checked upload: its bytes and the type they really are. */
export interface CheckedPhoto {
  readonly body: Uint8Array;
  readonly mime: (typeof DELIVERY_PHOTO_MIMES)[number];
}

/** Type by magic bytes and size, or `DeliveryPhotoRefused`. */
export function checkDeliveryPhoto(
  body: Uint8Array,
  maxBytes: number = DEFAULT_PHOTO_LIMITS.maxBytes,
): CheckedPhoto {
  if (body.byteLength === 0) throw new DeliveryPhotoRefused("missing");
  if (body.byteLength > maxBytes) throw new DeliveryPhotoRefused("too_large");
  const parsed = deliveryPhotoUploadSchema(maxBytes).safeParse({
    mime: sniffImageMime(body),
    bytes: body.byteLength,
  });
  if (!parsed.success) throw new DeliveryPhotoRefused("wrong_type");
  return { body, mime: parsed.data.mime };
}

/** Reads at most `limit` bytes of `stream`; `null` once it goes over (the rest is cancelled). */
async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/**
 * The `photo` field of a `multipart/form-data` request, read bounded while streaming. Throws
 * `DeliveryPhotoRefused` (`too_large`, `missing`); the type is `checkDeliveryPhoto`'s.
 */
export async function readPhotoUpload(
  request: Request,
  limits: Pick<PhotoLimits, "maxBytes"> = DEFAULT_PHOTO_LIMITS,
): Promise<Uint8Array> {
  const bound = limits.maxBytes + MULTIPART_OVERHEAD_BYTES;
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > bound) {
    await request.body?.cancel();
    throw new DeliveryPhotoRefused("too_large");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    await request.body?.cancel();
    throw new DeliveryPhotoRefused("missing");
  }
  if (request.body === null) throw new DeliveryPhotoRefused("missing");
  const raw = await readBounded(request.body, bound);
  if (raw === null) throw new DeliveryPhotoRefused("too_large");
  let form: FormData;
  try {
    form = await new Request("http://upload.invalid/", {
      method: "POST",
      headers: { "content-type": contentType },
      body: raw,
    }).formData();
  } catch {
    throw new DeliveryPhotoRefused("missing");
  }
  const file = form.get(PHOTO_FIELD);
  if (!(file instanceof Blob) || file.size === 0) {
    throw new DeliveryPhotoRefused("missing");
  }
  if (file.size > limits.maxBytes) throw new DeliveryPhotoRefused("too_large");
  return new Uint8Array(await file.arrayBuffer());
}

/** What `processDeliveryPhoto` returns: the JPEG we store and its facts. */
export interface ProcessedPhoto {
  readonly jpeg: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly checksumSha256: string;
}

/** The re-encode's JPEG quality: a doorstep photo, not a print. */
export const DELIVERY_PHOTO_JPEG_QUALITY = 82;

/**
 * Decode, rotate, resize, re-encode with every metadata field dropped (§2). `sharp` failing to
 * decode is `wrong_type`: the magic bytes said image, the body was not one.
 */
export async function processDeliveryPhoto(
  photo: CheckedPhoto,
  limits: Pick<PhotoLimits, "maxEdgePx"> = DEFAULT_PHOTO_LIMITS,
): Promise<ProcessedPhoto> {
  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(photo.body, { failOn: "error" })
      .rotate()
      .resize({
        width: limits.maxEdgePx,
        height: limits.maxEdgePx,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: DELIVERY_PHOTO_JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new DeliveryPhotoRefused("wrong_type");
  }
  const jpeg = new Uint8Array(output.data);
  return {
    jpeg,
    width: output.info.width,
    height: output.info.height,
    bytes: jpeg.byteLength,
    checksumSha256: createHash("sha256").update(jpeg).digest("hex"),
  };
}
