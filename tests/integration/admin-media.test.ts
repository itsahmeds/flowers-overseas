/**
 * T-22 and T-23: the admin photos against a migrated scratch database (spec 012b §2.7, AC-22,
 * AC-23; TASK-299).
 *
 *  - T-22 (AC-22): a JPEG carrying EXIF and GPS uploads as a florist's photo: the one stored
 *    object (`originals/product/{assetId}`, private bucket) has no metadata block, one
 *    `media_asset` row carries the provenance of its source (`partner`, the florist, its code as
 *    credit and its `terms_version` as licence), and one `media.derive_variants` job is enqueued.
 *    An SVG, a HEIC, 16 MB, 41 MP, a missing provenance field, a `partner` photo without a
 *    florist and `depicts = 'delivery'` are each refused with no object, no row and no job.
 *  - T-23 (AC-23): a pending and a rejected photo are refused as the main photo; a florist's
 *    photo is not approved while the florist has no `terms_version` and is once it has one,
 *    through `attest()` (the ledger row is there); a second main photo is refused; an alt that is
 *    a file name is refused and an empty one removes the row, so the photo shows only in the
 *    language with a real alt.
 *  - T-09's photo rows: an attach and an alt save on a product priced in Poland invalidate
 *    `catalog:PL`, `product:{sku}` and `sitemap`, once each.
 *
 * The commands run through the real `withAdminContext` and `attest()`, pointed at the scratch
 * database; storage is the in-memory fake and the queue a recorder.
 */
import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  InMemoryStorage,
  type PutInput,
  type Storage,
} from "../../src/lib/storage.ts";
import {
  type MediaActor,
  type MediaDeps,
  attachPhoto,
  photoRendersIn,
  productPhotos,
  reviewPhoto,
  savePhotoAlt,
  uploadPhoto,
} from "../../src/modules/admin/media.ts";
import * as make from "./support/rows.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const target = vi.hoisted(() => ({ url: "" }));
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));
vi.mock("@/lib/sentry", () => ({ captureGuardError: () => undefined }));

const server = await probeLocalServer();

const BUCKET = "fo-media-private-test";

/** A 1200 x 800 JPEG with a camera model and GPS in its EXIF. */
async function gpsJpeg(shade = 90): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: shade, g: 255 - shade, b: (shade * 7) % 256 },
      },
    })
      .jpeg()
      .withExif({
        IFD0: { Model: "TestCam 1" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "50/1 3/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "19/1 56/1 0/1",
        },
      })
      .toBuffer(),
  );
}

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width, height, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .png()
      .toBuffer(),
  );
}

/** Records every put and delete and passes them on to the fake. */
class RecordingStorage extends InMemoryStorage implements Storage {
  readonly puts: string[] = [];
  readonly deletes: string[] = [];
  override async put(input: PutInput) {
    this.puts.push(input.objectKey);
    return super.put(input);
  }
  override async delete(location: { bucket: string; objectKey: string }) {
    this.deletes.push(location.objectKey);
    return super.delete(location);
  }
  get stored(): number {
    return this.puts.length - this.deletes.length;
  }
}

describe.skipIf(server.url === undefined)(
  `the admin photos (spec 012b AC-22, AC-23)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let storage: RecordingStorage;
    const jobs: string[] = [];
    const invalidated: string[][] = [];
    let deps: Partial<MediaDeps>;
    let admin: MediaActor;
    let floristNoTerms: string;
    let floristWithTerms: string;
    let floristCode: string;
    let productId: string;

    const counts = async (): Promise<{ assets: number; pm: number }> => {
      const [row] = await scratch.sql<{ assets: number; pm: number }[]>`
        SELECT (SELECT count(*)::int FROM media_asset) AS assets,
               (SELECT count(*)::int FROM product_media) AS pm`;
      return row ?? { assets: -1, pm: -1 };
    };

    const version = async (): Promise<string> => {
      const [row] = await scratch.sql<{ version: string }[]>`
        SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version
          FROM product WHERE id = ${productId}`;
      return row?.version ?? "";
    };

    const checksumOf = async (assetId: string): Promise<string> => {
      const [row] = await scratch.sql<{ checksum: string }[]>`
        SELECT checksum_sha256 AS checksum FROM media_asset WHERE id = ${assetId}`;
      return row?.checksum ?? "";
    };

    const stateOf = async (assetId: string): Promise<string> => {
      const [row] = await scratch.sql<{ state: string }[]>`
        SELECT review_state AS state FROM media_asset WHERE id = ${assetId}`;
      return row?.state ?? "";
    };

    const upload = async (fields: Record<string, string>, bytes: Uint8Array) =>
      uploadPhoto(admin, fields, bytes, deps);

    const ALL = ["people", "address", "brand", "matches"];

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "adminmedia");
      target.url = scratch.url;
      await scratch.sql.begin(async (tx) => {
        await tx`INSERT INTO locale (code, bcp47, name) VALUES
                   ('en', 'en', 'English'), ('pl', 'pl-PL', 'Polski'), ('de', 'de-DE', 'Deutsch'),
                   ('en-gb', 'en-GB', 'English (UK)')
                 ON CONFLICT DO NOTHING`;
        const plId = await make.country(tx, "PL");
        floristNoTerms = await make.partner(tx, plId, "onboarding");
        floristWithTerms = await make.partner(tx, plId, "onboarding");
        await tx`UPDATE fulfillment_partner SET terms_version = '2026-10', terms_signed_at = '2026-10-20'
                  WHERE id = ${floristWithTerms}`;
        const [code] = await tx<{ code: string }[]>`
          SELECT code FROM fulfillment_partner WHERE id = ${floristWithTerms}`;
        floristCode = code?.code ?? "";
        const [product] = await tx<{ id: string }[]>`
          INSERT INTO product (sku, product_type, primary_flower, colour_primary, style,
                               price_tier, substitution_class, freshness_days)
          VALUES ('FO-BQ-990', 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
          RETURNING id`;
        productId = product?.id ?? "";
        // Priced in Poland, so a photo change carries T-09's copy-row tags.
        await tx`INSERT INTO product_tier (product_id, tier_key, label_key, stems, sort, is_default)
                 VALUES (${productId}, 'stems_15', 'catalog.tier.stems', 15, 0, true)`;
        await tx`INSERT INTO country_price (product_id, country_id, tier_key, retail_minor,
                   currency_code, vat_rate_bp, active_from)
                 VALUES (${productId}, ${plId}, 'stems_15', 22900, 'PLN', 800, '2026-10-01')`;
        const [user] = await tx<{ id: string }[]>`
          INSERT INTO users (email) VALUES ('founder-media@example.test') RETURNING id`;
        const userId = user?.id ?? "";
        await tx`INSERT INTO admin_profile (user_id, display_name) VALUES (${userId}, 'Founder Test')`;
        await tx`INSERT INTO user_role (user_id, role) VALUES (${userId}, 'admin')`;
        admin = { userId, roles: ["admin"] };
      });
      storage = new RecordingStorage();
      deps = {
        store: () => Promise.resolve({ storage, bucket: BUCKET }),
        enqueueDerive: (assetId) => {
          jobs.push(assetId);
          return Promise.resolve();
        },
        invalidate: (tags) => {
          invalidated.push([...tags]);
          return Promise.resolve();
        },
      };
      // `attest()` and the admin runner load their defaults on first use; load them here.
      await Promise.all([
        import("@/lib/db"),
        import("@/modules/admin"),
        import("@/lib/logger"),
      ]);
    }, 300_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-22: upload (AC-22)", () => {
      it("stores one metadata-free original, one row with the florist's provenance, one job", async () => {
        const before = await counts();
        const result = await upload(
          {
            source: "partner",
            supplierPartnerId: floristWithTerms,
            depicts: "product",
            productSku: "FO-BQ-990",
          },
          await gpsJpeg(),
        );
        if (!result.ok) throw new Error(result.reason);
        const assetId = result.assetId;

        const key = `originals/product/${assetId}`;
        expect(storage.puts).toEqual([key]);
        expect(storage.stored).toBe(1);
        const response = await storage.fetch(
          await storage.getSignedUrl({ bucket: BUCKET, objectKey: key }, 60),
        );
        const stored = new Uint8Array(await response.arrayBuffer());
        const meta = await sharp(stored).metadata();
        expect(meta.format).toBe("jpeg");
        expect(meta.exif).toBeUndefined();
        expect(meta.xmp).toBeUndefined();
        expect(meta.iptc).toBeUndefined();
        expect(Buffer.from(stored).toString("latin1")).not.toContain("TestCam");

        const [row] = await scratch.sql<
          {
            kind: string;
            bucket: string;
            object_key: string;
            source: string;
            depicts: string;
            supplier_partner_id: string;
            credit: string;
            licence: string;
            exif_stripped: boolean;
            review_state: string;
            visibility: string;
            width: number;
            height: number;
          }[]
        >`SELECT kind, bucket, object_key, source, depicts, supplier_partner_id, credit, licence,
                 exif_stripped, review_state, visibility, width, height
            FROM media_asset WHERE id = ${assetId}`;
        expect(row).toEqual({
          kind: "product",
          bucket: BUCKET,
          object_key: key,
          source: "partner",
          depicts: "product",
          supplier_partner_id: floristWithTerms,
          credit: floristCode,
          licence: "2026-10",
          exif_stripped: true,
          review_state: "pending",
          visibility: "public",
          width: 1200,
          height: 800,
        });
        expect(await counts()).toEqual({
          assets: before.assets + 1,
          pm: before.pm + 1,
        });
        const [attached] = await scratch.sql<{ is_primary: boolean }[]>`
          SELECT is_primary FROM product_media WHERE media_asset_id = ${assetId}`;
        expect(attached?.is_primary).toBe(false);
        expect(jobs).toEqual([assetId]);
      });

      it("records an AI image's and a stock photo's provenance", async () => {
        const ai = await upload(
          {
            source: "ai",
            generator: "OpenAI ChatGPT",
            generatorModel: "gpt-image 2.0",
            promptHash: "c".repeat(64),
            generatorSeed: "42",
            depicts: "context",
          },
          await png(60, 40),
        );
        const stock = await upload(
          {
            source: "photo",
            credit: "Jan Nowak, Unsplash",
            licence: "Unsplash licence",
            depicts: "brand",
          },
          await png(61, 40),
        );
        if (!ai.ok || !stock.ok) throw new Error("refused");
        const rows = await scratch.sql<
          {
            id: string;
            kind: string;
            source: string;
            credit: string | null;
            licence: string | null;
            generator_model: string | null;
            generator_prompt_hash: string | null;
            generator_seed: string | null;
          }[]
        >`SELECT id, kind, source, credit, licence, generator_model, generator_prompt_hash,
                 generator_seed::text
            FROM media_asset WHERE id IN (${ai.assetId}, ${stock.assetId}) ORDER BY source`;
        expect(rows).toEqual([
          {
            id: ai.assetId,
            kind: "brand",
            source: "ai",
            credit: "OpenAI ChatGPT",
            licence: null,
            generator_model: "gpt-image 2.0",
            generator_prompt_hash: "c".repeat(64),
            generator_seed: "42",
          },
          {
            id: stock.assetId,
            kind: "brand",
            source: "photo",
            credit: "Jan Nowak, Unsplash",
            licence: "Unsplash licence",
            generator_model: null,
            generator_prompt_hash: null,
            generator_seed: null,
          },
        ]);
      });

      it("refuses each bad upload with no object, no row and no job", async () => {
        const florist = {
          source: "partner",
          supplierPartnerId: floristWithTerms,
          depicts: "product",
        };
        const svg = new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>',
        );
        const heic = new Uint8Array([
          0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0,
          0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
        ]);
        const sixteenMb = new Uint8Array(16 * 1000 * 1000);
        sixteenMb.set([0xff, 0xd8, 0xff]);
        const cases: [Record<string, string>, Uint8Array, string][] = [
          [florist, svg, "type"],
          [florist, heic, "type"],
          [florist, sixteenMb, "too_large"],
          [florist, await png(8200, 5000), "too_many_pixels"],
          [
            { source: "photo", credit: "Jan Nowak", depicts: "product" },
            await gpsJpeg(91),
            "provenance",
          ],
          [
            { source: "partner", depicts: "product" },
            await gpsJpeg(92),
            "supplier_required",
          ],
          [{ ...florist, depicts: "delivery" }, await gpsJpeg(93), "delivery"],
          [
            { ...florist, supplierPartnerId: randomUUID() },
            await gpsJpeg(94),
            "supplier_unknown",
          ],
          [
            { ...florist, productSku: "FO-BQ-999" },
            await gpsJpeg(95),
            "product_unknown",
          ],
        ];
        const before = await counts();
        const stored = storage.stored;
        const queued = jobs.length;
        for (const [fields, bytes, reason] of cases) {
          expect(await upload(fields, bytes)).toMatchObject({
            ok: false,
            reason,
          });
        }
        expect(await counts()).toEqual(before);
        expect(storage.stored).toBe(stored);
        expect(jobs.length).toBe(queued);
      }, 120_000);

      it("refuses the same photo twice, naming the stored one", async () => {
        const first = await upload(
          {
            source: "partner",
            supplierPartnerId: floristWithTerms,
            depicts: "product",
          },
          await gpsJpeg(120),
        );
        if (!first.ok) throw new Error(first.reason);
        const again = await upload(
          {
            source: "partner",
            supplierPartnerId: floristWithTerms,
            depicts: "product",
          },
          await gpsJpeg(120),
        );
        expect(again).toEqual({
          ok: false,
          reason: "duplicate",
          assetId: first.assetId,
        });
      });
    });

    describe("T-23: review, main photo and alt text (AC-23)", () => {
      let unlicensed: string;
      let stock: string;
      let rejected: string;

      beforeAll(async () => {
        const a = await upload(
          {
            source: "partner",
            supplierPartnerId: floristNoTerms,
            depicts: "product",
          },
          await gpsJpeg(20),
        );
        const b = await upload(
          {
            source: "photo",
            credit: "Jan Nowak, Unsplash",
            licence: "Unsplash licence",
            depicts: "product",
          },
          await gpsJpeg(160),
        );
        const c = await upload(
          {
            source: "photo",
            credit: "Jan Nowak, Unsplash",
            licence: "Unsplash licence",
            depicts: "product",
          },
          await gpsJpeg(240),
        );
        if (!a.ok || !b.ok || !c.ok) {
          throw new Error(`upload refused: ${JSON.stringify([a, b, c])}`);
        }
        unlicensed = a.assetId;
        stock = b.assetId;
        rejected = c.assetId;
      }, 60_000);

      const decide = async (
        assetId: string,
        decision: "approved" | "rejected",
        extra: Record<string, unknown> = {},
      ) =>
        reviewPhoto(
          admin,
          {
            assetId,
            checksum: await checksumOf(assetId),
            decision,
            checks: decision === "approved" ? ALL : [],
            ...extra,
          },
          deps,
        );

      it("a pending photo is refused as the main photo", async () => {
        expect(
          await attachPhoto(
            admin,
            {
              productId,
              updatedAt: await version(),
              assetId: unlicensed,
              primary: true,
            },
            deps,
          ),
        ).toEqual({ ok: false, reason: "not_approved" });
      });

      it("a florist's photo is not approved without the florist's terms, and is with them", async () => {
        expect(await decide(unlicensed, "approved")).toEqual({
          ok: false,
          reason: "no_supplier_terms",
        });
        expect(await stateOf(unlicensed)).toBe("pending");
        const [none] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM review_attestation
           WHERE subject_ref = ${await checksumOf(unlicensed)}`;
        expect(none?.n).toBe(0);

        await scratch.sql`UPDATE fulfillment_partner
                             SET terms_version = '2026-11', terms_signed_at = '2026-11-01'
                           WHERE id = ${floristNoTerms}`;
        const queued = jobs.length;
        expect(await decide(unlicensed, "approved")).toEqual({
          ok: true,
          value: { assetId: unlicensed },
        });
        expect(await stateOf(unlicensed)).toBe("approved");
        const [ledger] = await scratch.sql<
          { decision: string; attester_name: string; channel: string }[]
        >`SELECT decision, attester_name, channel FROM review_attestation
           WHERE subject_kind = 'media_asset' AND subject_ref = ${await checksumOf(unlicensed)}`;
        expect(ledger).toEqual({
          decision: "approved",
          attester_name: "Founder Test",
          channel: "admin",
        });
        // The approval asks for the public ladder.
        expect(jobs.slice(queued)).toEqual([unlicensed]);
      });

      it("approval needs the four checks; a rejection needs a note", async () => {
        expect(
          await decide(stock, "approved", { checks: ["people", "brand"] }),
        ).toEqual({ ok: false, reason: "invalid" });
        expect(await decide(rejected, "rejected")).toEqual({
          ok: false,
          reason: "invalid",
        });
        expect(
          await decide(rejected, "rejected", {
            note: "The shop's sign is readable in the corner.",
          }),
        ).toMatchObject({ ok: true });
        expect(await stateOf(rejected)).toBe("rejected");
      });

      it("a rejected photo is refused as the main photo; one main photo per product", async () => {
        expect(
          await attachPhoto(
            admin,
            {
              productId,
              updatedAt: await version(),
              assetId: rejected,
              primary: true,
            },
            deps,
          ),
        ).toEqual({ ok: false, reason: "not_approved" });
        const calls = invalidated.length;
        const main = await attachPhoto(
          admin,
          {
            productId,
            updatedAt: await version(),
            assetId: unlicensed,
            primary: true,
          },
          deps,
        );
        expect(main.ok).toBe(true);
        // T-09's photo row: the product's tag, its countries' and the sitemap, once.
        expect(invalidated.slice(calls)).toEqual([
          ["catalog:PL", "product:FO-BQ-990", "sitemap"],
        ]);
        expect(await decide(stock, "approved")).toMatchObject({ ok: true });
        expect(
          await attachPhoto(
            admin,
            {
              productId,
              updatedAt: await version(),
              assetId: stock,
              primary: true,
            },
            deps,
          ),
        ).toEqual({ ok: false, reason: "primary_taken" });
        expect(
          await attachPhoto(
            admin,
            {
              productId,
              updatedAt: await version(),
              assetId: stock,
              primary: false,
            },
            deps,
          ),
        ).toMatchObject({ ok: true });
        const [primaries] = await scratch.sql<{ n: number }[]>`
          SELECT count(*)::int AS n FROM product_media
           WHERE product_id = ${productId} AND is_primary`;
        expect(primaries?.n).toBe(1);
      });

      it("a stale form changes nothing", async () => {
        expect(
          await attachPhoto(
            admin,
            {
              productId,
              updatedAt: "2026-01-01T00:00:00.000Z",
              assetId: rejected,
              primary: false,
            },
            deps,
          ),
        ).toEqual({ ok: false, reason: "conflict" });
      });

      it("shows the photo only in a language with an alt that is not empty or a file name", async () => {
        const view = await productPhotos(admin, productId);
        const main = view.photos.find((photo) => photo.primary);
        if (main === undefined) throw new Error("no main photo");
        const alt = (locale: string, text: string) =>
          version().then((updatedAt) =>
            savePhotoAlt(
              admin,
              {
                productId,
                updatedAt,
                productMediaId: main.productMediaId,
                locale,
                alt: text,
              },
              deps,
            ),
          );
        expect(await alt("en", "peonies-15.jpg")).toEqual({
          ok: false,
          reason: "alt_file_name",
        });
        expect(await alt("en", main.keyId)).toEqual({
          ok: false,
          reason: "alt_file_name",
        });
        expect(
          await alt("en", "Pink peonies hand-tied in kraft paper"),
        ).toEqual({ ok: true, value: { productMediaId: main.productMediaId } });
        expect(invalidated.at(-1)).toEqual([
          "catalog:PL",
          "product:FO-BQ-990",
          "sitemap",
        ]);
        expect(await alt("pl", "Różowe piwonie")).toMatchObject({ ok: true });
        expect(await alt("pl", "")).toMatchObject({ ok: true });

        const after = await productPhotos(admin, productId);
        const shown = after.photos.find((photo) => photo.primary);
        expect(shown?.alts).toEqual({
          en: "Pink peonies hand-tied in kraft paper",
        });
        const renders = (locale: string): boolean =>
          photoRendersIn(shown?.state ?? "", shown?.alts[locale], [
            shown?.keyId ?? "",
          ]);
        expect(renders("en")).toBe(true);
        expect(renders("pl")).toBe(false);
        expect(renders("de")).toBe(false);
        // A rejected or pending photo renders nowhere, whatever its alt.
        expect(photoRendersIn("rejected", "Pink peonies")).toBe(false);
        expect(photoRendersIn("pending", "Pink peonies")).toBe(false);
      });
    });
  },
);
