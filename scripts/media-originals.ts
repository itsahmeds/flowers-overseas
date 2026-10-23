/**
 * `pnpm media:upload --originals [--backfill] [--dry-run] [--force] [--only <assetId>]` — put the
 * approved originals into the **private** bucket and enqueue `media.derive_variants` for each one
 * that changed (spec 006 §2.6 "`pnpm media:upload` — uploads originals … and enqueues
 * `media.derive_variants` per asset; idempotent by checksum"; AC-25; TASK-082).
 *
 * The variant half of `pnpm media:upload` (TASK-138) is unchanged and still the Phase 0 path: it
 * publishes the committed manifest's derived files with no database. This half is the Phase 1 path
 * the worker needs: the original in storage, then one job per asset.
 *
 * ## The rules, in the order a run applies them
 *
 *  1. **Private only.** An original is the pre-strip file (EXIF, GPS, a C2PA manifest), so it goes
 *     to `R2_PRIVATE_BUCKET` and nowhere else; with that unset the run refuses before reading a
 *     file. `R2Storage` refuses an `originals/…` key on the public bucket a second time.
 *  2. **Approved only**, as the variant half: a pending or rejected asset is never uploaded.
 *  3. **The file is the recorded file.** Each original present under `.local/imagery/originals/`
 *     must hash to its `originalSha256` in `seed/data/media.json`; one that does not stops the run
 *     before the first request, so a half-uploaded batch of a set that failed a gate cannot exist.
 *  4. **Idempotent by checksum.** Each key is `head`ed; an original whose stored SHA-256 already
 *     matches is not sent again and not enqueued again, so a re-run after nothing changed sends
 *     nothing and enqueues nothing. `--force` re-sends and re-enqueues; `--backfill` enqueues the
 *     unchanged ones too (reason `backfill`) without re-sending — the step after the importer
 *     (TASK-083) has created rows for originals uploaded before it ran. The worker is idempotent,
 *     so a job for an asset already derived ends `current` and writes nothing.
 *  5. **One job per asset with a row.** The job carries the `media_asset` id, looked up by the
 *     original's key. An original with no row yet is reported, never enqueued with a guess.
 *
 * The key is `objectKey(kind, assetId, "original")`, `originals/{kind}/{assetId}` (spec 002 §5.2's
 * convention, which spec 006's "`originals/{assetId}`" names in short), with `kind` from the
 * asset's `depicts` (`mediaAssetKindFor`). `originalObjectKey()` is exported so the importer
 * writes the same key into `media_asset.object_key`.
 *
 * Output names asset ids and counts. It is an operator command run by hand, not a request path;
 * no credential and no URL is ever printed.
 */
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

import {
  ORIGINALS_DIR,
  findOriginal,
  readMediaAssets,
  sha256,
} from "../seed/media-variants.ts";
import {
  type MediaAssetManifest,
  mediaAssetKindFor,
} from "../seed/schema/media.ts";
import { buildJobData } from "../src/jobs/index.ts";
import { R2Storage, r2EnvironmentFrom } from "../src/lib/storage-r2.ts";
import { type Storage, objectKey } from "../src/lib/storage.ts";

/** The storage key of an asset's original. The importer writes the same into `media_asset`. */
export function originalObjectKey(
  asset: Pick<MediaAssetManifest, "id" | "depicts">,
): string {
  return objectKey(mediaAssetKindFor(asset.depicts), asset.id, "original");
}

/** The stored type of an original, by its extension (`ORIGINAL_EXTENSIONS`). */
export function originalMime(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".avif":
      return "image/avif";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`${path}: no content type for this original's extension`);
  }
}

export interface OriginalItem {
  readonly assetId: string;
  readonly objectKey: string;
  readonly path: string;
  readonly mime: string;
  readonly bytes: Buffer;
  readonly checksumSha256: string;
}

export interface OriginalsPlan {
  readonly items: readonly OriginalItem[];
  /** Approved assets in the selection with no original on this machine. */
  readonly absent: readonly string[];
  /** Selected assets that are not approved, never uploaded. */
  readonly unapproved: number;
}

/**
 * Read and check every original a run would send. Throws on the first file that does not hash to
 * its recorded `originalSha256`, before anything is sent.
 */
export function planOriginals(options: {
  readonly root: string;
  readonly only?: readonly string[];
}): OriginalsPlan {
  const selected = readMediaAssets(options.root).filter(
    (asset) => options.only === undefined || options.only.includes(asset.id),
  );
  const approved = selected.filter((asset) => asset.reviewState === "approved");
  const items: OriginalItem[] = [];
  const absent: string[] = [];
  for (const asset of approved) {
    const path = findOriginal(options.root, asset.id);
    if (path === null) {
      absent.push(asset.id);
      continue;
    }
    const bytes = readFileSync(join(options.root, path));
    const checksumSha256 = sha256(bytes);
    if (
      asset.originalSha256 !== undefined &&
      asset.originalSha256 !== checksumSha256
    ) {
      throw new Error(
        `${path}: hashes to ${checksumSha256}, but seed/data/media.json records ${asset.originalSha256} for \`${asset.id}\` — this is not the approved original; nothing was uploaded`,
      );
    }
    items.push({
      assetId: asset.id,
      objectKey: originalObjectKey(asset),
      path,
      mime: originalMime(path),
      bytes,
      checksumSha256,
    });
  }
  return {
    items,
    absent,
    unapproved: selected.length - approved.length,
  };
}

/** What enqueueing one original's key came to. */
export type EnqueueResult = "enqueued" | "no_asset_row";

/**
 * Enqueue `media.derive_variants` for each key, by the `media_asset` row that names it. One call
 * per run, so the production implementation opens one pg-boss instance, not one per asset.
 */
export type OriginalsEnqueuer = (
  jobs: readonly {
    readonly objectKey: string;
    readonly reason: "upload" | "backfill";
  }[],
) => Promise<ReadonlyMap<string, EnqueueResult>>;

export interface OriginalsArgs {
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly backfill: boolean;
  readonly only?: readonly string[];
}

export interface OriginalsSummary {
  readonly uploaded: number;
  readonly unchanged: number;
  readonly enqueued: number;
  readonly withoutRow: readonly string[];
  readonly absent: number;
  readonly unapproved: number;
}

/**
 * The run: environment → private bucket → plan (every file checked) → per original `head`, `put`
 * when it changed → one enqueue call. `storage` is injected in tests; `main()` builds `R2Storage`.
 */
export async function runOriginals(options: {
  readonly root: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly args: OriginalsArgs;
  readonly enqueue: OriginalsEnqueuer;
  readonly write: (text: string) => void;
  readonly storage?: Storage;
}): Promise<OriginalsSummary> {
  const { args, write } = options;
  const r2 = r2EnvironmentFrom(options.env);
  const bucket = r2.privateBucket;
  if (bucket === undefined) {
    throw new Error(
      "R2_PRIVATE_BUCKET is not set: an original is private (it still carries its source's metadata), and the public bucket never takes one. Create the private bucket and set the variable (docs/runbooks/imagery.md)",
    );
  }
  const plan = planOriginals({
    root: options.root,
    ...(args.only === undefined ? {} : { only: args.only }),
  });
  const storage = options.storage ?? new R2Storage(r2.config);

  const jobs: { objectKey: string; reason: "upload" | "backfill" }[] = [];
  const byKey = new Map<string, string>();
  let uploaded = 0;
  let unchanged = 0;
  for (const item of plan.items) {
    byKey.set(item.objectKey, item.assetId);
    const location = { bucket, objectKey: item.objectKey };
    const stored = args.force ? null : await storage.head(location);
    if (stored?.checksumSha256 === item.checksumSha256) {
      unchanged += 1;
      if (args.backfill)
        jobs.push({ objectKey: item.objectKey, reason: "backfill" });
      continue;
    }
    if (!args.dryRun) {
      await storage.put({
        ...location,
        body: item.bytes,
        mime: item.mime,
        checksumSha256: item.checksumSha256,
      });
    }
    uploaded += 1;
    write(
      `${args.dryRun ? "would upload" : "uploaded"} original ${item.assetId} (${String(item.bytes.byteLength)} B)\n`,
    );
    jobs.push({ objectKey: item.objectKey, reason: "upload" });
  }

  let enqueued = 0;
  const withoutRow: string[] = [];
  if (!args.dryRun && jobs.length > 0) {
    const results = await options.enqueue(jobs);
    for (const job of jobs) {
      const assetId = byKey.get(job.objectKey) ?? job.objectKey;
      if (results.get(job.objectKey) === "enqueued") enqueued += 1;
      else withoutRow.push(assetId);
    }
  }

  write(
    `${String(plan.items.length)} original(s) under ${ORIGINALS_DIR}/: ${String(uploaded)} ${args.dryRun ? "to upload" : "uploaded"}, ${String(unchanged)} unchanged; ${String(enqueued)} derive job(s) enqueued. ${String(plan.absent.length)} approved asset(s) have no original on this machine; ${String(plan.unapproved)} unapproved asset(s) skipped.\n`,
  );
  if (withoutRow.length > 0) {
    write(
      `${String(withoutRow.length)} original(s) have no media_asset row yet, so nothing was enqueued for them: ${withoutRow.join(", ")}. Run the importer, then \`pnpm media:upload --originals --backfill\`.\n`,
    );
  }
  return {
    uploaded,
    unchanged,
    enqueued,
    withoutRow,
    absent: plan.absent.length,
    unapproved: plan.unapproved,
  };
}

/** The correlation id an operator's enqueue carries (`JobRequestId`'s alphabet). */
export const ORIGINALS_REQUEST_ID = "system:media.upload";

/**
 * pg-boss's constructor options for this one-shot enqueue: `bossOptions()` of
 * `src/jobs/runtime.ts`, restated because that module's extension-less imports do not resolve
 * under `node scripts/*.ts`. `tests/unit/media-originals.test.ts` pins the two equal, so a switch
 * that keeps pg-boss from issuing DDL or arming a timer cannot be dropped here alone.
 */
export function originalsBossOptions(connectionString: string) {
  return {
    connectionString,
    schema: "pgboss",
    application_name: "fo-jobs",
    max: 2,
    connectionTimeoutMillis: 10_000,
    migrate: false,
    createSchema: false,
    supervise: false,
    schedule: false,
    registerInstance: false,
    persistQueueStats: false,
    persistWarnings: false,
    reindex: false,
    monitorVacuum: false,
    useListenNotify: false,
  } as const;
}

/**
 * The production enqueuer: one pg-boss instance over the **unpooled** URL (spec 002 §13 Q6), the
 * `media_asset` id looked up by the original's key, the payload validated by the job registry
 * (`buildJobData`), and the instance stopped whatever happens.
 */
export function pgBossEnqueuer(connectionString: string): OriginalsEnqueuer {
  return async (jobs) => {
    const { PgBoss } = await import("pg-boss");
    const boss = new PgBoss(originalsBossOptions(connectionString));
    boss.on("error", () => undefined);
    const results = new Map<string, EnqueueResult>();
    try {
      await boss.start();
      await boss.createQueue("media.derive_variants");
      const db = boss.getDb();
      for (const job of jobs) {
        const found = await db.executeSql(
          "SELECT id FROM public.media_asset WHERE object_key = $1",
          [job.objectKey],
        );
        const id: unknown = found.rows[0]?.id;
        if (typeof id !== "string") {
          results.set(job.objectKey, "no_asset_row");
          continue;
        }
        await boss.send(
          "media.derive_variants",
          buildJobData(
            "media.derive_variants",
            { assetId: id, reason: job.reason },
            ORIGINALS_REQUEST_ID,
          ),
        );
        results.set(job.objectKey, "enqueued");
      }
      return results;
    } finally {
      await boss.stop({ graceful: false, close: true, timeout: 1_000 });
    }
  };
}
