/**
 * The admin photo upload's pure half (spec 012b §2.7, AC-22, AC-23; TASK-299), T-22's unit rows:
 *
 *  - `cleanUploadedImage`: a JPEG carrying EXIF, GPS, XMP and an orientation comes out a JPEG with
 *    no metadata block, upright; PNG and WebP keep their format; an SVG, a HEIC, a body over
 *    15 MiB and an image over 40 megapixels are refused, the last from the header alone;
 *  - `parseUploadFields`: a delivery photo, a florist photo with no florist and each missing
 *    provenance field are refused by name;
 *  - the alt rule: an empty alt or a file name renders nothing (`photoRendersIn`, and the public
 *    renderer's `resolveMedia` through the same `isFileNameAlt`).
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  FILE_NAME_ALT,
  MEDIA_UPLOAD_CONFIG,
  isFileNameAlt,
} from "../../src/config/media-upload.ts";
import { uploadSlotFor } from "../../src/jobs/media-derive-variants.ts";
import { cleanUploadedImage } from "../../src/modules/admin/media-image.ts";
import {
  parseUploadFields,
  photoRendersIn,
} from "../../src/modules/admin/media.ts";

const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Anna Kowalska</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/** A 1200 x 800 JPEG with a camera model, GPS, XMP and orientation 6. */
async function taggedJpeg(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 200, g: 80, b: 90 },
    },
  })
    .jpeg()
    .withExif({
      IFD0: { Model: "TestCam 1", Copyright: "Florist" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "50/1 3/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "19/1 56/1 0/1",
      },
    })
    .withXmp(XMP)
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return new Uint8Array(buffer);
}

async function plain(
  format: "png" | "webp",
  width = 64,
  height = 48,
): Promise<Uint8Array> {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 1, g: 2, b: 3 } },
  });
  return new Uint8Array(
    await (format === "png" ? image.png() : image.webp()).toBuffer(),
  );
}

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);

/** The first 32 bytes of an iPhone HEIC: an ISO-BMFF `ftyp` box with major brand `heic`. */
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00,
  0x00, 0x00, 0x00, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

describe("cleanUploadedImage (AC-22)", () => {
  it("re-encodes a tagged JPEG upright with no EXIF, GPS, XMP, IPTC or ICC block", async () => {
    const input = await taggedJpeg();
    const before = await sharp(input).metadata();
    // The fixture really carries what must be dropped.
    expect(before.exif?.toString("latin1")).toContain("TestCam");
    expect(before.xmp?.toString()).toContain("Anna");
    expect(before.orientation).toBe(6);

    const out = await cleanUploadedImage(input);
    if (!out.ok) throw new Error(out.reason);
    const after = await sharp(out.image.body).metadata();
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect(Buffer.from(out.image.body).toString("latin1")).not.toContain(
      "TestCam",
    );
    // Orientation 6 turned the landscape upright.
    expect({ width: out.image.width, height: out.image.height }).toEqual({
      width: 800,
      height: 1200,
    });
    expect(out.image.mime).toBe("image/jpeg");
    expect(out.image.checksumSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("keeps a PNG a PNG and a WebP a WebP", async () => {
    for (const format of ["png", "webp"] as const) {
      const out = await cleanUploadedImage(await plain(format));
      if (!out.ok) throw new Error(out.reason);
      expect(out.image.mime).toBe(`image/${format}`);
      expect((await sharp(out.image.body).metadata()).format).toBe(format);
    }
  });

  it("refuses an SVG and a HEIC by their bytes", async () => {
    expect(await cleanUploadedImage(SVG)).toEqual({
      ok: false,
      reason: "type",
    });
    expect(await cleanUploadedImage(HEIC)).toEqual({
      ok: false,
      reason: "type",
    });
  });

  it("refuses a 16 MB body before looking at it", async () => {
    expect(MEDIA_UPLOAD_CONFIG.maxBytes).toBe(15 * 1024 * 1024);
    const big = new Uint8Array(16 * 1000 * 1000);
    big.set([0xff, 0xd8, 0xff]);
    expect(await cleanUploadedImage(big)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("refuses 41 megapixels from the header and accepts 40", async () => {
    expect(MEDIA_UPLOAD_CONFIG.maxPixels).toBe(40_000_000);
    const over = await cleanUploadedImage(await plain("png", 8200, 5000));
    expect(over).toEqual({ ok: false, reason: "too_many_pixels" });
    const at = await cleanUploadedImage(await plain("png", 8000, 5000));
    expect(at.ok).toBe(true);
  }, 120_000);

  it("refuses bytes that only look like an image, and an empty body", async () => {
    expect(
      await cleanUploadedImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01])),
    ).toEqual({ ok: false, reason: "undecodable" });
    expect(await cleanUploadedImage(new Uint8Array())).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});

describe("parseUploadFields (AC-22)", () => {
  const florist = "4b0a5f0e-9d34-4f1c-9a64-1d6c1b3f2a10";

  it("accepts each source with its complete provenance", () => {
    expect(
      parseUploadFields({
        source: "partner",
        supplierPartnerId: florist,
        depicts: "product",
        productSku: "FO-BQ-046",
      }),
    ).toEqual({
      ok: true,
      value: {
        depicts: "product",
        productSku: "FO-BQ-046",
        provenance: { source: "partner", supplierPartnerId: florist },
      },
    });
    expect(
      parseUploadFields({
        source: "ai",
        generator: "OpenAI ChatGPT",
        generatorModel: "gpt-image 2.0",
        promptHash: "c".repeat(64),
        generatorSeed: "42",
        depicts: "context",
      }),
    ).toMatchObject({
      ok: true,
      value: { provenance: { source: "ai", generatorSeed: 42 } },
    });
    expect(
      parseUploadFields({
        source: "photo",
        credit: "Jan Nowak, Unsplash",
        licence: "Unsplash licence",
        depicts: "brand",
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a delivery photo, a florist photo with no florist, and each missing field by name", () => {
    expect(
      parseUploadFields({
        source: "partner",
        supplierPartnerId: florist,
        depicts: "delivery",
      }),
    ).toEqual({ ok: false, reason: "delivery", fields: ["depicts"] });
    expect(
      parseUploadFields({ source: "partner", depicts: "product" }),
    ).toEqual({
      ok: false,
      reason: "supplier_required",
      fields: ["supplierPartnerId"],
    });
    expect(
      parseUploadFields({
        source: "photo",
        credit: "Jan Nowak",
        depicts: "product",
      }),
    ).toEqual({ ok: false, reason: "provenance", fields: ["licence"] });
    expect(
      parseUploadFields({
        source: "ai",
        generator: "OpenAI ChatGPT",
        generatorModel: "gpt-image 2.0",
        promptHash: "not-a-hash",
        depicts: "product",
      }),
    ).toEqual({
      ok: false,
      reason: "provenance",
      fields: ["generatorSeed", "promptHash"],
    });
    expect(parseUploadFields({ depicts: "product" })).toMatchObject({
      ok: false,
      reason: "provenance",
    });
  });
});

describe("the alt rule (AC-23)", () => {
  it("a file name or the asset's own id is not alt text", () => {
    for (const name of [
      "lipa-peonies-15.jpg",
      "IMG_2041.JPEG",
      "bouquet.heic",
      "photo.webp",
    ]) {
      expect(isFileNameAlt(name)).toBe(true);
      expect(FILE_NAME_ALT.test(name)).toBe(true);
    }
    expect(isFileNameAlt("fo-bq-001-hero", ["fo-bq-001-hero"])).toBe(true);
    expect(
      isFileNameAlt("Orange roses hand-tied with eucalyptus, in kraft paper."),
    ).toBe(false);
  });

  it("a photo renders in a locale only when approved with a real alt there", () => {
    const alt = "Orange roses in kraft paper";
    expect(photoRendersIn("approved", alt)).toBe(true);
    expect(photoRendersIn("pending", alt)).toBe(false);
    expect(photoRendersIn("rejected", alt)).toBe(false);
    expect(photoRendersIn("approved", undefined)).toBe(false);
    expect(photoRendersIn("approved", "   ")).toBe(false);
    expect(photoRendersIn("approved", "roses-15.jpg")).toBe(false);
    expect(photoRendersIn("approved", "a1b2", ["a1b2"])).toBe(false);
  });
});

describe("the derive ladder of an upload (TASK-082's open question)", () => {
  it("takes the ladder of its depicts for a uuid key and leaves seed ids to the manifest", () => {
    const uuid = "4b0a5f0e-9d34-4f1c-9a64-1d6c1b3f2a10";
    expect(uploadSlotFor(uuid, "product")).toBe("productHero");
    expect(uploadSlotFor(uuid, "brand")).toBe("hero");
    expect(uploadSlotFor(uuid, "context")).toBe("context");
    expect(uploadSlotFor(uuid, "delivery")).toBeUndefined();
    expect(uploadSlotFor("fo-bq-001-hero", "product")).toBeUndefined();
  });
});
