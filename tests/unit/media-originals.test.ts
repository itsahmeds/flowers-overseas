/**
 * `pnpm media:upload --originals` (`scripts/media-originals.ts`; spec 006 §2.6, AC-25; TASK-082):
 * originals to the private bucket, idempotent by checksum, one derive job per changed asset.
 *
 * Runs against `R2Storage` talking to the contract suite's in-process S3 endpoint, so the
 * placement rules and the signatures are the real ones; the enqueuer is a recording fake (the
 * pg-boss half is pinned to the runtime's options below, and T-25 covers the worker it feeds).
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import {
  type EnqueueResult,
  type OriginalsArgs,
  type OriginalsEnqueuer,
  originalMime,
  originalObjectKey,
  originalsBossOptions,
  planOriginals,
  runOriginals,
} from "../../scripts/media-originals.ts";
import { parseArgs } from "../../scripts/media-upload.ts";
import { bossOptions } from "../../src/jobs/runtime.ts";
import { R2Storage } from "../../src/lib/storage-r2.ts";
import { FakeS3 } from "../contract/support/fake-s3.ts";

const repoRoot = resolve(import.meta.dirname, "../..");
const HOST = "0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com";
const PUBLIC = "fo-media-test";
const PRIVATE = "fo-private-test";
const BACKUPS = "fo-backups-test";

const ENV = {
  R2_S3_ENDPOINT: `https://${HOST}`,
  R2_ACCESS_KEY_ID: "fixture-key",
  R2_SECRET_ACCESS_KEY: "fixture-secret",
  R2_BUCKET: PUBLIC,
  R2_BACKUPS_BUCKET: BACKUPS,
  R2_PRIVATE_BUCKET: PRIVATE,
};

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface Fixture {
  readonly root: string;
  readonly approved: readonly string[];
  readonly pending: string;
  readonly bytes: ReadonlyMap<string, Buffer>;
}

/**
 * A repository root with three of the real `media.json` rows — two approved, one pending — each
 * with an original under `.local/imagery/originals/` and its `originalSha256` set to that file.
 */
async function fixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), "fo-originals-"));
  roots.push(root);
  const file = JSON.parse(
    readFileSync(join(repoRoot, "seed/data/media.json"), "utf8"),
  ) as { rows: Record<string, unknown>[] } & Record<string, unknown>;
  const [first, second, third] = file.rows.filter(
    (row) => row["reviewState"] === "approved",
  );
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("the manifest has fewer than three approved rows to copy");
  }
  const approvedRows = [first, second];
  // A pending row is an approved one with its sign-off taken away (spec 006 A7 clause 5).
  const unsigned = Object.fromEntries(
    Object.entries(third).filter(
      ([field]) => field !== "reviewedBy" && field !== "reviewedAt",
    ),
  );
  const pendingRow: Record<string, unknown> = {
    ...unsigned,
    reviewState: "pending",
  };
  const rows = [...approvedRows, pendingRow];

  mkdirSync(join(root, ".local/imagery/originals"), { recursive: true });
  const bytes = new Map<string, Buffer>();
  for (const [index, row] of rows.entries()) {
    const id = String(row["id"]);
    const original = await sharp({
      create: {
        width: 40,
        height: 50,
        channels: 3,
        background: { r: 40 * index, g: 120, b: 200 },
      },
    })
      .jpeg()
      .toBuffer();
    writeFileSync(join(root, `.local/imagery/originals/${id}.jpg`), original);
    bytes.set(id, original);
    row["originalSha256"] = sha256(original);
  }
  mkdirSync(join(root, "seed/data"), { recursive: true });
  writeFileSync(
    join(root, "seed/data/media.json"),
    JSON.stringify({ ...file, rows }),
  );
  return {
    root,
    approved: approvedRows.map((row) => String(row["id"])),
    pending: String(pendingRow["id"]),
    bytes,
  };
}

function store(): { readonly s3: FakeS3; readonly storage: R2Storage } {
  const s3 = new FakeS3({
    host: HOST,
    accessKeyId: ENV.R2_ACCESS_KEY_ID,
    secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
    buckets: [PUBLIC, PRIVATE, BACKUPS],
    now: () => new Date(),
  });
  const storage = new R2Storage({
    endpoint: ENV.R2_S3_ENDPOINT,
    accessKeyId: ENV.R2_ACCESS_KEY_ID,
    secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
    publicBuckets: [PUBLIC],
    privateBuckets: [PRIVATE, BACKUPS],
    fetch: s3.fetch,
  });
  return { s3, storage };
}

/** Records every call; every key has a row unless it is listed in `withoutRow`. */
function recordingEnqueuer(withoutRow: readonly string[] = []): {
  readonly enqueue: OriginalsEnqueuer;
  readonly calls: { objectKey: string; reason: string }[][];
} {
  const calls: { objectKey: string; reason: string }[][] = [];
  return {
    calls,
    enqueue: (jobs) => {
      calls.push(jobs.map((job) => ({ ...job })));
      return Promise.resolve(
        new Map<string, EnqueueResult>(
          jobs.map((job) => [
            job.objectKey,
            withoutRow.includes(job.objectKey) ? "no_asset_row" : "enqueued",
          ]),
        ),
      );
    },
  };
}

const ARGS: OriginalsArgs = { dryRun: false, force: false, backfill: false };

const puts = (s3: FakeS3): string[] =>
  s3.requests.filter((request) => request.method === "PUT").map((r) => r.path);

describe("media:upload --originals — private, approved, idempotent by checksum (AC-25)", () => {
  it("puts each approved original in the private bucket under originals/{kind}/{id} and enqueues it", async () => {
    const { root, approved, pending, bytes } = await fixture();
    const { s3, storage } = store();
    const { enqueue, calls } = recordingEnqueuer();
    const summary = await runOriginals({
      root,
      env: ENV,
      args: ARGS,
      enqueue,
      write: () => undefined,
      storage,
    });

    expect(summary).toEqual({
      uploaded: 2,
      unchanged: 0,
      enqueued: 2,
      withoutRow: [],
      absent: 0,
      unapproved: 1,
    });
    const keys = approved.map((id) => `originals/product/${id}`);
    expect(s3.keys(PRIVATE)).toEqual([...keys].sort());
    expect(s3.keys(PUBLIC)).toEqual([]);
    expect(s3.keys(PRIVATE).some((key) => key.includes(pending))).toBe(false);
    for (const id of approved) {
      const object = s3.stored(PRIVATE, `originals/product/${id}`);
      expect(object && sha256(object.body)).toBe(
        sha256(bytes.get(id) ?? Buffer.alloc(0)),
      );
      expect(object?.headers["cache-control"]).toBe("private, no-store");
    }
    expect(calls).toEqual([
      keys.map((objectKey) => ({ objectKey, reason: "upload" })),
    ]);
  });

  it("a second run sends nothing and enqueues nothing", async () => {
    const { root } = await fixture();
    const { s3, storage } = store();
    const first = recordingEnqueuer();
    await runOriginals({
      root,
      env: ENV,
      args: ARGS,
      enqueue: first.enqueue,
      write: () => undefined,
      storage,
    });
    const putsAfterFirst = puts(s3).length;

    const second = recordingEnqueuer();
    const summary = await runOriginals({
      root,
      env: ENV,
      args: ARGS,
      enqueue: second.enqueue,
      write: () => undefined,
      storage,
    });
    expect(summary).toMatchObject({ uploaded: 0, unchanged: 2, enqueued: 0 });
    expect(puts(s3).length).toBe(putsAfterFirst);
    expect(second.calls).toEqual([]);
  });

  it("--backfill enqueues the unchanged originals without sending them again", async () => {
    const { root, approved } = await fixture();
    const { s3, storage } = store();
    await runOriginals({
      root,
      env: ENV,
      args: ARGS,
      enqueue: recordingEnqueuer().enqueue,
      write: () => undefined,
      storage,
    });
    const putsAfterFirst = puts(s3).length;

    const backfill = recordingEnqueuer();
    const summary = await runOriginals({
      root,
      env: ENV,
      args: { ...ARGS, backfill: true },
      enqueue: backfill.enqueue,
      write: () => undefined,
      storage,
    });
    expect(summary).toMatchObject({ uploaded: 0, unchanged: 2, enqueued: 2 });
    expect(puts(s3).length).toBe(putsAfterFirst);
    expect(backfill.calls).toEqual([
      approved.map((id) => ({
        objectKey: `originals/product/${id}`,
        reason: "backfill",
      })),
    ]);
  });

  it("--force sends and enqueues again", async () => {
    const { root } = await fixture();
    const { s3, storage } = store();
    await runOriginals({
      root,
      env: ENV,
      args: ARGS,
      enqueue: recordingEnqueuer().enqueue,
      write: () => undefined,
      storage,
    });
    const putsAfterFirst = puts(s3).length;
    const forced = recordingEnqueuer();
    const summary = await runOriginals({
      root,
      env: ENV,
      args: { ...ARGS, force: true },
      enqueue: forced.enqueue,
      write: () => undefined,
      storage,
    });
    expect(summary).toMatchObject({ uploaded: 2, enqueued: 2 });
    expect(puts(s3).length).toBe(putsAfterFirst + 2);
  });

  it("--dry-run sends nothing and enqueues nothing, and says what it would upload", async () => {
    const { root, approved } = await fixture();
    const { s3, storage } = store();
    const { enqueue, calls } = recordingEnqueuer();
    const written: string[] = [];
    const summary = await runOriginals({
      root,
      env: ENV,
      args: { ...ARGS, dryRun: true },
      enqueue,
      write: (text) => {
        written.push(text);
      },
      storage,
    });
    expect(summary).toMatchObject({ uploaded: 2, enqueued: 0 });
    expect(puts(s3)).toEqual([]);
    expect(calls).toEqual([]);
    expect(written.join("")).toContain(
      `would upload original ${approved[0] ?? ""}`,
    );
  });

  it("reports an original with no media_asset row and enqueues nothing for it", async () => {
    const { root, approved } = await fixture();
    const { storage } = store();
    const missing = `originals/product/${approved[1] ?? ""}`;
    const { enqueue } = recordingEnqueuer([missing]);
    const written: string[] = [];
    const summary = await runOriginals({
      root,
      env: ENV,
      args: ARGS,
      enqueue,
      write: (text) => {
        written.push(text);
      },
      storage,
    });
    expect(summary).toMatchObject({ enqueued: 1, withoutRow: [approved[1]] });
    expect(written.join("")).toContain("--originals --backfill");
  });

  it("refuses with no private bucket configured, before any request", async () => {
    const { root } = await fixture();
    const { s3, storage } = store();
    const withoutPrivate = Object.fromEntries(
      Object.entries(ENV).filter(([key]) => key !== "R2_PRIVATE_BUCKET"),
    );
    await expect(
      runOriginals({
        root,
        env: withoutPrivate,
        args: ARGS,
        enqueue: recordingEnqueuer().enqueue,
        write: () => undefined,
        storage,
      }),
    ).rejects.toThrow(/R2_PRIVATE_BUCKET is not set/u);
    expect(s3.requests).toEqual([]);
  });

  it("refuses a file that is not the recorded original, before any request", async () => {
    const { root, approved } = await fixture();
    writeFileSync(
      join(root, `.local/imagery/originals/${approved[1] ?? ""}.jpg`),
      await sharp({
        create: { width: 4, height: 5, channels: 3, background: "#000" },
      })
        .jpeg()
        .toBuffer(),
    );
    const { s3, storage } = store();
    await expect(
      runOriginals({
        root,
        env: ENV,
        args: ARGS,
        enqueue: recordingEnqueuer().enqueue,
        write: () => undefined,
        storage,
      }),
    ).rejects.toThrow(/not the approved original/u);
    expect(s3.requests).toEqual([]);
  });

  it("counts an approved asset with no original on this machine, and skips it", async () => {
    const { root, approved } = await fixture();
    rmSync(join(root, `.local/imagery/originals/${approved[0] ?? ""}.jpg`));
    expect(planOriginals({ root })).toMatchObject({
      absent: [approved[0]],
      unapproved: 1,
    });
    expect(planOriginals({ root }).items.map((item) => item.assetId)).toEqual([
      approved[1],
    ]);
  });
});

describe("the key, the type and the pg-boss options", () => {
  it("keys an original by spec 002's convention, kind from what it depicts", () => {
    expect(
      originalObjectKey({ id: "fo-bq-001-hero", depicts: "product" }),
    ).toBe("originals/product/fo-bq-001-hero");
    expect(
      originalObjectKey({ id: "fo-home-hero-band", depicts: "context" }),
    ).toBe("originals/brand/fo-home-hero-band");
  });

  it("types an original by its extension", () => {
    expect(originalMime("a/b.JPG")).toBe("image/jpeg");
    expect(originalMime("a/b.png")).toBe("image/png");
    expect(originalMime("a/b.tiff")).toBe("image/tiff");
    expect(() => originalMime("a/b.heic")).toThrow();
  });

  it("opens pg-boss with exactly the runtime's options: no DDL, no timers", () => {
    const url = "postgres://user@127.0.0.1:5432/db";
    expect(originalsBossOptions(url)).toEqual(bossOptions(url));
  });

  it("parses --originals and --backfill, refuses them where they make no sense, and keeps the old shape", () => {
    expect(parseArgs(["--originals"])).toEqual({
      dryRun: false,
      force: false,
      verify: false,
      originals: true,
    });
    expect(parseArgs(["--originals", "--backfill", "--only", "x"])).toEqual({
      dryRun: false,
      force: false,
      verify: false,
      only: ["x"],
      originals: true,
      backfill: true,
    });
    expect(() => parseArgs(["--backfill"])).toThrow(/needs `--originals`/u);
    expect(() => parseArgs(["--originals", "--verify"])).toThrow(
      /two different runs/u,
    );
    expect(parseArgs([])).toEqual({
      dryRun: false,
      force: false,
      verify: false,
    });
  });
});
