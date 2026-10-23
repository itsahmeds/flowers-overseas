/**
 * T-25 — `media.derive_variants` on a fixture asset (spec 006 AC-25; TASK-082).
 *
 * The worker (`src/jobs/media-derive-variants.ts`) runs for real: on a scratch database migrated by
 * the real runner, inside transactions that enter `app_web` as `system` exactly as
 * `withSystemContext` does (so RLS applies), against `R2Storage` talking to the in-process S3
 * endpoint of the contract suite (so the public/private placement rules apply too). What is
 * asserted, case by case:
 *
 *  - the ladder and every checksum equal what the CLI's `deriveVariants` produces from the same
 *    original with the committed pipeline header — one row per (asset, variant, format);
 *  - a second run inserts nothing, downloads nothing, encodes nothing and puts nothing;
 *  - two deliveries of one job at once still write each row once;
 *  - a lost row is restored without rewriting the object that is already there;
 *  - each refusal writes nothing: an unapproved public asset (never published), an unknown slot,
 *    an original whose bytes are not its recorded checksum, a missing asset, a private asset with
 *    no private bucket configured; a private asset with one derives into it and never into the
 *    public bucket.
 *
 * Local, disposable server only (`support/scratch-db.ts`); no real bucket, no credential.
 */
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deriveVariants, readMediaAssets } from "../../seed/media-variants.ts";
import {
  type DeriveDb,
  type DeriveDeps,
  deriveAssetVariants,
} from "../../src/jobs/media-derive-variants.ts";
import { MEDIA_CACHE_CONTROL } from "../../src/lib/media-headers.ts";
import { R2Storage } from "../../src/lib/storage-r2.ts";
import { FakeS3 } from "../contract/support/fake-s3.ts";
import {
  asApp,
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";

const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const dialect = new PgDialect();

const HOST = "fixture.eu.r2.cloudflarestorage.com";
const PUBLIC = "fo-media-test";
const PRIVATE = "fo-private-test";

/** Real seed ids of the `productHero` slot, so the worker's own slot lookup is exercised. */
const HERO_IDS = readMediaAssets(REPO_ROOT)
  .filter((asset) => asset.slot === "productHero")
  .map((asset) => asset.id);

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** A deterministic 4:5 original carrying the EXIF and GPS the ladder must strip. */
async function fixtureOriginal(): Promise<Buffer> {
  const width = 900;
  const height = 1125;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3;
      raw[index] = (x * 7 + y * 3) % 256;
      raw[index + 1] = (x * x + y) % 256;
      raw[index + 2] = (x + y * 11) % 256;
    }
  }
  return await sharp(raw, { raw: { width, height, channels: 3 } })
    .withExif({
      IFD0: { Artist: "fixture-studio" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
    })
    .jpeg({ quality: 92 })
    .toBuffer();
}

function runnerOf(tx: Tx): DeriveDb {
  return {
    async execute(query: SQL) {
      const { sql, params } = dialect.sqlToQuery(query);
      return tx.unsafe(sql, params as never[]);
    },
  };
}

interface VariantRow {
  variant: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  checksum_sha256: string;
  object_key: string;
}

describe.skipIf(server.url === undefined)(
  `T-25 — media.derive_variants writes the CLI's ladder once${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let original: Buffer;
    let s3: FakeS3;
    let storage: R2Storage;
    let ids: string[];

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "derive");
      original = await fixtureOriginal();
      s3 = new FakeS3({
        host: HOST,
        accessKeyId: "fixture-key",
        secretAccessKey: "fixture-secret",
        buckets: [PUBLIC, PRIVATE],
        now: () => new Date(),
      });
      storage = new R2Storage({
        endpoint: `https://${HOST}`,
        accessKeyId: "fixture-key",
        secretAccessKey: "fixture-secret",
        publicBuckets: [PUBLIC],
        privateBuckets: [PRIVATE],
        fetch: s3.fetch,
      });
      ids = [...HERO_IDS];
    }, 240_000);

    afterAll(async () => {
      await scratch.drop();
    });

    /** The next unused seed id, so each case owns its original's key. */
    function nextSeedId(): string {
      const id = ids.shift();
      if (id === undefined) throw new Error("ran out of productHero seed ids");
      return id;
    }

    async function insertAsset(options: {
      readonly keyId: string;
      readonly visibility?: "public" | "private";
      readonly reviewState?: "pending" | "approved" | "rejected";
      readonly kind?: "product" | "delivery_proof";
      readonly checksum?: string;
    }): Promise<string> {
      const id = randomUUID();
      const kind = options.kind ?? "product";
      const objectKey = `originals/${kind}/${options.keyId}`;
      await storage.put({
        bucket: PRIVATE,
        objectKey,
        body: original,
        mime: "image/jpeg",
      });
      const approved = (options.reviewState ?? "approved") === "approved";
      await scratch.sql`
        INSERT INTO media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
          checksum_sha256, visibility, source, review_state, depicts, credit, licence,
          reviewed_by, reviewed_at)
        VALUES (${id}, ${kind}, ${PRIVATE}, ${objectKey}, 'image/jpeg', 900, 1125,
          ${original.byteLength}, ${options.checksum ?? sha256(original)},
          ${options.visibility ?? "public"}, 'photo', ${options.reviewState ?? "approved"},
          ${kind === "product" ? "product" : "delivery"}, 'fixture', 'fixture-licence',
          ${approved ? "founder" : null}, ${approved ? new Date() : null})`;
      return id;
    }

    function deps(overrides: Partial<DeriveDeps> = {}): DeriveDeps & {
      readonly counts: { derives: number; reads: number };
    } {
      const counts = { derives: 0, reads: 0 };
      return {
        counts,
        transaction: async <T>(fn: (db: DeriveDb) => Promise<T>) =>
          (await scratch.sql.begin(async (tx) => {
            await asApp(tx, { role: "system" });
            return await fn(runnerOf(tx));
          })) as T,
        storage,
        fetch: async (url) => {
          counts.reads += 1;
          return await s3.fetch(url);
        },
        publicBucket: PUBLIC,
        privateBucket: PRIVATE,
        derive: async (...args) => {
          counts.derives += 1;
          return await deriveVariants(...args);
        },
        ...overrides,
      };
    }

    async function variantRows(assetId: string): Promise<VariantRow[]> {
      return await scratch.sql<VariantRow[]>`
        SELECT variant, format, width, height, bytes::int AS bytes, checksum_sha256, object_key
        FROM media_variant WHERE media_asset_id = ${assetId}
        ORDER BY width, format`;
    }

    const putsTo = (bucket: string): number =>
      s3.requests.filter(
        (request) =>
          request.method === "PUT" &&
          request.path.startsWith(`/${bucket}/media/`),
      ).length;

    it("AC-25 — the ladder and every checksum equal the CLI's for the same original, one row each", async () => {
      const keyId = nextSeedId();
      const assetId = await insertAsset({ keyId });
      const cli = await deriveVariants(
        { id: keyId, slot: "productHero", depicts: "product" },
        original,
      );

      const outcome = await deriveAssetVariants(deps(), { assetId });
      expect(outcome).toEqual({
        status: "derived",
        inserted: cli.length,
        uploaded: cli.length,
        encoded: cli.length,
      });

      const rows = await variantRows(assetId);
      const expected = cli
        .map(({ row }) => ({
          variant: row.variant,
          format: row.format,
          width: row.width,
          height: row.height,
          bytes: row.bytes,
          checksum_sha256: row.checksumSha256,
          object_key: `media/product/${keyId}/${row.variant}.${row.format}`,
        }))
        .sort((a, b) => a.width - b.width || a.format.localeCompare(b.format));
      expect(rows).toEqual(expected);
      // The CLI's productHero ladder, spelled out: four widths, AVIF and WebP, no JPEG.
      expect(rows.map((row) => `${row.variant}.${row.format}`)).toEqual([
        "384.avif",
        "384.webp",
        "480.avif",
        "480.webp",
        "640.avif",
        "640.webp",
        "828.avif",
        "828.webp",
      ]);

      for (const row of rows) {
        const object = s3.stored(PUBLIC, row.object_key);
        expect(object && sha256(object.body)).toBe(row.checksum_sha256);
        expect(object?.headers["cache-control"]).toBe(MEDIA_CACHE_CONTROL);
        expect(s3.stored(PRIVATE, row.object_key)).toBeUndefined();
      }
      const first = s3.stored(PUBLIC, rows[0]?.object_key ?? "");
      const metadata = await sharp(Buffer.from(first?.body ?? [])).metadata();
      expect(metadata.exif).toBeUndefined();
    }, 180_000);

    it("AC-25 — a second run inserts nothing, reads nothing, encodes nothing and puts nothing", async () => {
      const keyId = nextSeedId();
      const assetId = await insertAsset({ keyId });
      await deriveAssetVariants(deps(), { assetId });
      const before = await variantRows(assetId);
      const putsBefore = putsTo(PUBLIC);

      const again = deps();
      const outcome = await deriveAssetVariants(again, { assetId });
      expect(outcome).toEqual({
        status: "current",
        inserted: 0,
        uploaded: 0,
        encoded: 0,
      });
      expect(again.counts).toEqual({ derives: 0, reads: 0 });
      expect(putsTo(PUBLIC)).toBe(putsBefore);
      expect(await variantRows(assetId)).toEqual(before);
    }, 180_000);

    it("two deliveries of one job at once write each row exactly once", async () => {
      const keyId = nextSeedId();
      const assetId = await insertAsset({ keyId });
      const [left, right] = await Promise.all([
        deriveAssetVariants(deps(), { assetId }),
        deriveAssetVariants(deps(), { assetId }),
      ]);
      const inserted =
        (left.status === "refused" ? 0 : left.inserted) +
        (right.status === "refused" ? 0 : right.inserted);
      expect(inserted).toBe(8);
      const [{ n } = { n: -1 }] = await scratch.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM media_variant WHERE media_asset_id = ${assetId}`;
      expect(n).toBe(8);
    }, 180_000);

    it("a lost row is restored, and the object already in the bucket is not put again", async () => {
      const keyId = nextSeedId();
      const assetId = await insertAsset({ keyId });
      await deriveAssetVariants(deps(), { assetId });
      await scratch.sql`
        DELETE FROM media_variant
        WHERE media_asset_id = ${assetId} AND variant = '640' AND format = 'webp'`;
      const putsBefore = putsTo(PUBLIC);

      const outcome = await deriveAssetVariants(deps(), { assetId });
      expect(outcome).toEqual({
        status: "derived",
        inserted: 1,
        uploaded: 0,
        encoded: 8,
      });
      expect(putsTo(PUBLIC)).toBe(putsBefore);
      expect((await variantRows(assetId)).length).toBe(8);
    }, 180_000);

    it.each(["pending", "rejected"] as const)(
      "an unapproved (%s) public asset is refused and nothing is published",
      async (reviewState) => {
        const keyId = nextSeedId();
        const assetId = await insertAsset({ keyId, reviewState });
        const run = deps();
        expect(await deriveAssetVariants(run, { assetId })).toEqual({
          status: "refused",
          reason: "not_approved",
        });
        expect(run.counts).toEqual({ derives: 0, reads: 0 });
        expect(
          s3.keys(PUBLIC).filter((key) => key.includes(`/${keyId}/`)),
        ).toEqual([]);
        expect(await variantRows(assetId)).toEqual([]);
      },
    );

    it("an asset the seed manifest does not know is refused slot_unknown, with nothing written", async () => {
      const assetId = await insertAsset({ keyId: "not-in-the-manifest" });
      const run = deps();
      expect(await deriveAssetVariants(run, { assetId })).toEqual({
        status: "refused",
        reason: "slot_unknown",
      });
      expect(run.counts.derives).toBe(0);
      expect(await variantRows(assetId)).toEqual([]);
    });

    it("an original whose bytes are not its recorded checksum is refused before encoding", async () => {
      const keyId = nextSeedId();
      const assetId = await insertAsset({
        keyId,
        checksum: sha256(new TextEncoder().encode("some other original")),
      });
      const run = deps();
      expect(await deriveAssetVariants(run, { assetId })).toEqual({
        status: "refused",
        reason: "original_checksum_mismatch",
      });
      expect(run.counts).toEqual({ derives: 0, reads: 1 });
      expect(await variantRows(assetId)).toEqual([]);
    });

    it("a missing asset and a malformed id are refused without a read", async () => {
      const run = deps();
      expect(await deriveAssetVariants(run, { assetId: randomUUID() })).toEqual(
        { status: "refused", reason: "asset_missing" },
      );
      expect(
        await deriveAssetVariants(run, { assetId: "fo-bq-001-hero" }),
      ).toEqual({ status: "refused", reason: "asset_id_invalid" });
      expect(run.counts).toEqual({ derives: 0, reads: 0 });
    });

    it("a private asset derives into the private bucket only, and is refused when none is configured", async () => {
      const keyId = nextSeedId();
      const assetId = await insertAsset({ keyId, visibility: "private" });
      expect(
        await deriveAssetVariants(deps({ privateBucket: undefined }), {
          assetId,
        }),
      ).toEqual({ status: "refused", reason: "private_bucket_unconfigured" });

      const outcome = await deriveAssetVariants(deps(), { assetId });
      expect(outcome).toMatchObject({ status: "derived", inserted: 8 });
      const rows = await variantRows(assetId);
      for (const row of rows) {
        expect(s3.stored(PRIVATE, row.object_key)).toBeDefined();
        expect(s3.stored(PUBLIC, row.object_key)).toBeUndefined();
      }
    }, 180_000);
  },
);
