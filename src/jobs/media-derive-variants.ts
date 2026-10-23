/**
 * The `media.derive_variants` worker (spec 006 §2.6, §5.2, AC-25; spec 002 §5.2; ADR-0015 "size
 * variants generated once by a job"; TASK-082).
 *
 * Given a `media_asset` id it reads the original from storage, derives the slot's ladder with
 * **the CLI's own function and the committed pipeline header** (`deriveVariants` in
 * `seed/derive.ts`, which `pnpm media:variants` calls too), puts each variant object, and writes
 * one `media_variant` row per (asset, variant, format). So the ladder and the checksums equal the
 * CLI's for the same original by construction, and `tests/integration/media-derive-variants.test.ts`
 * holds the two side by side.
 *
 * ## Once, and idempotent
 *
 *  - Before any download, the rows the slot's ladder needs (`ladderFor`) are compared with the
 *    rows the asset already has. When none is missing the job ends `current`: nothing fetched,
 *    nothing decoded, nothing encoded, nothing inserted (AC-25's second run).
 *  - An object is `head`ed before it is put and skipped when its stored SHA-256 already matches,
 *    and every object is put **before** its row is inserted, so a row never names a missing object.
 *  - The insert is `ON CONFLICT (media_asset_id, variant, format) DO NOTHING` on the table's
 *    primary key, so two deliveries of one job (pg-boss is at-least-once) write each row once.
 *  - The `reason` (`upload` | `backfill` | `reencode`) changes nothing here. A variant URL is
 *    served `immutable` for a year, so "re-encode" can never mean rewriting a published key: a
 *    changed image is a new asset (spec 006 §2.5 "Cache headers").
 *
 * ## Where the variants go
 *
 * Public bucket only when the asset is `visibility = 'public'`, of a public kind (`product`,
 * `brand`) **and `approved`**: a pending or rejected photograph is never published, because a
 * public object is readable by anyone with its URL and cached for a year (the rule `pnpm
 * media:upload` already keeps, spec 006 §14 A10 clause 3). Every other asset derives into the
 * private bucket, and with no private bucket configured the job refuses rather than falling back
 * to the public one. `R2Storage` enforces the same rule a second time at `put`.
 *
 * ## The slot
 *
 * `media_asset` has no slot column (spec 002 §5.1): the slot is a render decision kept in the
 * seed manifest. The key's id segment of the original (`originals/{kind}/{id}`, `objectKey()`) is
 * the asset's stable name — the seed id for seeded imagery, so its variant keys do not change when
 * a database is re-seeded and its uuids with it — and the slot is read from
 * `seed/data/media.json` by that id. An asset the manifest does not know is refused
 * `slot_unknown`; uploads outside the seed (spec 012b's admin photos, spec 011's delivery photos)
 * name their slot in their own tasks (recorded in `docs/tasks/TASK-082.md`).
 *
 * ## Refusals and logging
 *
 * A refusal is a closed-set `reason` returned to the handler, which completes the job and logs the
 * reason: retrying an asset that is missing, unapproved or unknown cannot succeed. A storage or
 * network failure throws, so pg-boss retries it. Nothing here logs, and nothing returned carries an
 * object key, an asset id or a URL (spec 002 §8; the brief's "no object key … or asset id logged
 * at `info`").
 */
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import mediaFile from "../../seed/data/media.json" with { type: "json" };
import {
  type DerivedVariant,
  assertPinnedEncoder,
  deriveVariants,
  ladderFor,
  sha256,
} from "../../seed/derive.ts";
import {
  type MediaFormat,
  type MediaSlot,
  mediaSlots,
} from "../../seed/schema/media.ts";
import {
  type MediaVariantPipeline,
  variantPipeline,
} from "../../seed/schema/variants.ts";
import { PUBLIC_OBJECT_KINDS } from "../lib/storage-r2.ts";
import { type Storage, objectKey } from "../lib/storage.ts";

/** What the worker runs its statements through (Drizzle's transaction handle in production). */
export interface DeriveDb {
  execute(query: SQL): Promise<unknown>;
}

export interface DeriveDeps {
  /** One short transaction as `system` (`withSystemContext` in production). Called twice. */
  readonly transaction: <T>(fn: (db: DeriveDb) => Promise<T>) => Promise<T>;
  readonly storage: Storage;
  /** Reads a URL `storage` signed: global `fetch` for R2, the fake's own for the fake. */
  readonly fetch: (url: string) => Promise<Response>;
  /** `R2_BUCKET`: where approved public variants go. */
  readonly publicBucket: string;
  /** `R2_PRIVATE_BUCKET`, when configured. */
  readonly privateBucket: string | undefined;
  /** Slot by the original's key id; the seed manifest by default. */
  readonly slotOf?: (keyId: string) => MediaSlot | undefined;
  /** The committed pipeline header by default. */
  readonly pipeline?: MediaVariantPipeline;
  /** Injected in tests to count encodes; `deriveVariants` by default. */
  readonly derive?: typeof deriveVariants;
}

/** Why a job ended without deriving. Closed set: this is what is logged. */
export const deriveRefusals = [
  "asset_id_invalid",
  "asset_missing",
  "original_key_unrecognised",
  "not_approved",
  "private_bucket_unconfigured",
  "slot_unknown",
  "original_missing",
  "original_checksum_mismatch",
] as const;
export type DeriveRefusal = (typeof deriveRefusals)[number];

export type DeriveOutcome =
  | {
      readonly status: "derived" | "current";
      /** `media_variant` rows this run inserted. */
      readonly inserted: number;
      /** Objects this run put (an object already holding the bytes is not put again). */
      readonly uploaded: number;
      /** Files encoded: 0 when the asset was already `current`. */
      readonly encoded: number;
    }
  | { readonly status: "refused"; readonly reason: DeriveRefusal };

/** A signed read of the original lives this long: one download, not a shareable link. */
export const ORIGINAL_READ_TTL_SECONDS = 300;

const MIME_BY_FORMAT: Readonly<Record<MediaFormat, string>> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

const AssetRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["product", "delivery_proof", "brand", "partner"]),
  bucket: z.string(),
  object_key: z.string(),
  checksum_sha256: z.string(),
  visibility: z.enum(["public", "private"]),
  review_state: z.enum(["pending", "approved", "rejected"]),
  depicts: z.string(),
});
type AssetRow = z.infer<typeof AssetRowSchema>;

const ExistingRowSchema = z.object({ variant: z.string(), format: z.string() });

const SeedSlotsSchema = z.object({
  rows: z.array(z.object({ id: z.string(), slot: z.enum(mediaSlots) })),
});

let seedSlots: ReadonlyMap<string, MediaSlot> | undefined;

/** The slot `seed/data/media.json` gives an asset id, or `undefined` for an unknown one. */
export function seedSlotOf(keyId: string): MediaSlot | undefined {
  seedSlots ??= new Map(
    SeedSlotsSchema.parse(mediaFile).rows.map((row) => [row.id, row.slot]),
  );
  return seedSlots.get(keyId);
}

/** `originals/{kind}/{id}` → `id`, only for the asset's own kind; anything else is `undefined`. */
export function originalKeyId(kind: string, key: string): string | undefined {
  const match = /^originals\/([a-z_]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(key);
  return match?.[1] === kind ? match[2] : undefined;
}

async function rows(db: DeriveDb, query: SQL): Promise<unknown[]> {
  return Array.from((await db.execute(query)) as Iterable<unknown>);
}

const stepKey = (variant: string, format: string): string =>
  `${variant}.${format}`;

/**
 * One run of `media.derive_variants` for one asset. Returns what happened; throws only for a
 * failure worth retrying (storage, network, a database error).
 */
export async function deriveAssetVariants(
  deps: DeriveDeps,
  payload: { readonly assetId: string },
): Promise<DeriveOutcome> {
  const refused = (reason: DeriveRefusal): DeriveOutcome => ({
    status: "refused",
    reason,
  });
  const assetId = z.uuid().safeParse(payload.assetId);
  if (!assetId.success) return refused("asset_id_invalid");
  const pipeline = deps.pipeline ?? variantPipeline();

  const loaded = await deps.transaction(async (db) => {
    const [found] = await rows(
      db,
      sql`SELECT id, kind, bucket, object_key, checksum_sha256, visibility, review_state, depicts
          FROM media_asset WHERE id = ${assetId.data}`,
    );
    if (found === undefined) return undefined;
    const existing = await rows(
      db,
      sql`SELECT variant, format FROM media_variant WHERE media_asset_id = ${assetId.data}`,
    );
    return {
      asset: AssetRowSchema.parse(found),
      have: new Set(
        existing
          .map((row) => ExistingRowSchema.parse(row))
          .map((row) => stepKey(row.variant, row.format)),
      ),
    };
  });
  if (loaded === undefined) return refused("asset_missing");
  const { asset, have } = loaded;

  const keyId = originalKeyId(asset.kind, asset.object_key);
  if (keyId === undefined) return refused("original_key_unrecognised");
  const published =
    asset.visibility === "public" &&
    (PUBLIC_OBJECT_KINDS as readonly string[]).includes(asset.kind);
  if (published && asset.review_state !== "approved") {
    return refused("not_approved");
  }
  const target = published ? deps.publicBucket : deps.privateBucket;
  if (target === undefined) return refused("private_bucket_unconfigured");
  const slot = (deps.slotOf ?? seedSlotOf)(keyId);
  if (slot === undefined) return refused("slot_unknown");

  const missing = ladderFor(slot, pipeline).filter(
    (step) => !have.has(stepKey(String(step.width), step.format)),
  );
  if (missing.length === 0) {
    return { status: "current", inserted: 0, uploaded: 0, encoded: 0 };
  }

  const original = await readOriginal(deps, asset);
  if (original === "missing") return refused("original_missing");
  if (sha256(original) !== asset.checksum_sha256) {
    return refused("original_checksum_mismatch");
  }

  // The checksums AC-25 compares are the pinned encoder's; any other build must not write them.
  if (deps.derive === undefined) assertPinnedEncoder();
  const derived = await (deps.derive ?? deriveVariants)(
    { id: keyId, slot, depicts: asset.depicts },
    original,
    pipeline,
  );

  const written: { readonly variant: DerivedVariant; readonly key: string }[] =
    [];
  let uploaded = 0;
  for (const variant of derived) {
    const { row } = variant;
    if (have.has(stepKey(row.variant, row.format))) continue;
    const key = objectKey(asset.kind, keyId, {
      variant: row.variant,
      format: row.format,
    });
    const location = { bucket: target, objectKey: key };
    const stored = await deps.storage.head(location);
    if (stored?.checksumSha256 !== row.checksumSha256) {
      await deps.storage.put({
        ...location,
        body: variant.data,
        mime: MIME_BY_FORMAT[row.format],
        checksumSha256: row.checksumSha256,
      });
      uploaded += 1;
    }
    written.push({ variant, key });
  }

  const inserted = await deps.transaction(async (db) => {
    let count = 0;
    for (const { variant, key } of written) {
      const { row } = variant;
      const result = await rows(
        db,
        sql`INSERT INTO media_variant
              (media_asset_id, variant, object_key, format, width, height, bytes, checksum_sha256)
            VALUES (${asset.id}, ${row.variant}, ${key}, ${row.format}, ${row.width},
                    ${row.height}, ${row.bytes}, ${row.checksumSha256})
            ON CONFLICT (media_asset_id, variant, format) DO NOTHING
            RETURNING variant`,
      );
      count += result.length;
    }
    return count;
  });

  return { status: "derived", inserted, uploaded, encoded: derived.length };
}

/** The original's bytes through a short-lived signed read, or `"missing"` on a 404. */
async function readOriginal(
  deps: DeriveDeps,
  asset: AssetRow,
): Promise<Buffer | "missing"> {
  const url = await deps.storage.getSignedUrl(
    { bucket: asset.bucket, objectKey: asset.object_key },
    ORIGINAL_READ_TTL_SECONDS,
  );
  const response = await deps.fetch(url);
  if (response.status === 404) return "missing";
  if (response.status !== 200) {
    throw new MediaDeriveReadError(response.status);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** The original could not be read for a reason worth retrying. Names the status, never the URL. */
export class MediaDeriveReadError extends Error {
  override readonly name = "MediaDeriveReadError";
  readonly status: number;

  constructor(status: number) {
    super(
      `media.derive_variants: the original read answered ${String(status)}`,
    );
    this.status = status;
  }
}
