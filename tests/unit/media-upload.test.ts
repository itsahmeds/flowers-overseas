/**
 * `pnpm media:upload` — the no-database, no-queue put of the derived variants into the media
 * bucket (spec 006 §2.6, AC-27; TASK-138).
 *
 * What a unit test can and cannot prove here is worth stating, because the honest answer shapes
 * the file. It **can** prove the whole decision layer without a network: which objects a run
 * would touch, that an object whose stored digest already matches is not re-sent, that a
 * credential never reaches a message, that the request is signed over the bytes rather than
 * beside them, and that the script refuses to upload anything the gates have not seen. It
 * **cannot** prove that Cloudflare accepts the signature — only a real request can, and the run
 * that put these 118 objects into `flowersoverseas-media` is recorded in the PR and in
 * `docs/tasks/TASK-138.md`.
 */
import { mkdtempSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  EMPTY_SHA256,
  type Fetcher,
  type R2Config,
  type UploadItem,
  amzDates,
  assertOriginAgrees,
  canonicalUri,
  contentTypeFor,
  loadUploadSet,
  parseArgs,
  readR2Config,
  signRequest,
} from "../../scripts/media-upload.ts";
import { MEDIA_CACHE_CONTROL } from "../../src/lib/media-headers.ts";
import { MEDIA_ORIGIN } from "../../src/lib/media-origin.ts";

const repoRoot = resolve(import.meta.dirname, "../..");

const SECRET = "not-a-real-secret-value-0000";

const CONFIG: R2Config = {
  R2_BUCKET: "flowersoverseas-media",
  R2_S3_ENDPOINT: "https://abc123.eu.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: SECRET,
  R2_PUBLIC_BASE_URL: MEDIA_ORIGIN,
};

const NOW = new Date("2026-09-21T10:15:30.000Z");

const item = (
  checksum: string,
  bytes = Buffer.from("derived bytes"),
): UploadItem => ({
  row: {
    assetId: "fo-bq-001-hero",
    variant: "384",
    width: 384,
    height: 480,
    format: "avif",
    bytes: bytes.byteLength,
    checksumSha256: checksum,
    objectKey: "media/fo-bq-001-hero/384.avif",
  },
  path: ".local/media/fo-bq-001-hero/384.avif",
  bytes,
});

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: Buffer;
}

function fakeFetcher(
  responses: readonly {
    status: number;
    headers?: Record<string, string>;
    body?: string;
  }[],
): { fetcher: Fetcher; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  const fetcher: Fetcher = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    const response = responses[index] ?? { status: 200 };
    index += 1;
    return await Promise.resolve({
      status: response.status,
      headers: {
        get: (name: string): string | null =>
          response.headers?.[name.toLowerCase()] ?? null,
      },
      text: async (): Promise<string> =>
        await Promise.resolve(response.body ?? ""),
    });
  };
  return { fetcher, calls };
}

const temporary: string[] = [];
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */

describe("configuration", () => {
  it("names the keys it is missing and prints no value", () => {
    let message = "";
    try {
      readR2Config({ R2_BUCKET: "", R2_SECRET_ACCESS_KEY: SECRET });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("R2_ACCESS_KEY_ID");
    expect(message).toContain("R2_S3_ENDPOINT");
    expect(message).not.toContain(SECRET);
  });

  it("parses the R2 half alone, so no database is needed to upload an image", () => {
    expect(readR2Config({ ...CONFIG })).toEqual(CONFIG);
  });

  it("refuses to publish to an origin the site does not read from", () => {
    expect(() => {
      assertOriginAgrees(`${MEDIA_ORIGIN}/`);
    }).not.toThrow();
    expect(() => {
      assertOriginAgrees("https://pub-somewhere-else.r2.dev");
    }).toThrow(/MEDIA_ORIGIN/u);
  });

  it("stores each format under its own content type", () => {
    expect(contentTypeFor("avif")).toBe("image/avif");
    expect(contentTypeFor("webp")).toBe("image/webp");
    expect(contentTypeFor("jpeg")).toBe("image/jpeg");
    expect(() => contentTypeFor("gif")).toThrow(/content type/u);
  });

  it("reads the flags the runbook documents", () => {
    expect(parseArgs(["--dry-run"])).toEqual({ dryRun: true, force: false });
    expect(parseArgs(["--only", "home-hero", "--force"])).toEqual({
      dryRun: false,
      force: true,
      only: ["home-hero"],
    });
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/u);
  });
});

describe("SigV4", () => {
  it("signs path-style, over the payload hash, with the clock as an argument", () => {
    const signed = signRequest({
      method: "PUT",
      endpoint: CONFIG.R2_S3_ENDPOINT,
      bucket: CONFIG.R2_BUCKET,
      objectKey: "media/fo-bq-001-hero/384.avif",
      payloadSha256: "a".repeat(64),
      headers: { "content-type": "image/avif" },
      accessKeyId: CONFIG.R2_ACCESS_KEY_ID,
      secretAccessKey: SECRET,
      now: NOW,
    });

    expect(signed.url).toBe(
      "https://abc123.eu.r2.cloudflarestorage.com/flowersoverseas-media/media/fo-bq-001-hero/384.avif",
    );
    expect(signed.headers["x-amz-date"]).toBe("20260921T101530Z");
    expect(signed.headers["x-amz-content-sha256"]).toBe("a".repeat(64));
    expect(signed.headers["authorization"]).toContain(
      "Credential=AKIDEXAMPLE/20260921/auto/s3/aws4_request",
    );
    expect(signed.headers["authorization"]).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date",
    );
    // The secret signs; it never travels.
    expect(JSON.stringify(signed)).not.toContain(SECRET);
  });

  it("is deterministic for the same request and different for different bytes", () => {
    const base = {
      method: "PUT" as const,
      endpoint: CONFIG.R2_S3_ENDPOINT,
      bucket: CONFIG.R2_BUCKET,
      objectKey: "media/a/384.avif",
      accessKeyId: CONFIG.R2_ACCESS_KEY_ID,
      secretAccessKey: SECRET,
      now: NOW,
    };
    const one = signRequest({ ...base, payloadSha256: "a".repeat(64) });
    const same = signRequest({ ...base, payloadSha256: "a".repeat(64) });
    const other = signRequest({ ...base, payloadSha256: "b".repeat(64) });

    expect(one.headers["authorization"]).toBe(same.headers["authorization"]);
    expect(one.headers["authorization"]).not.toBe(
      other.headers["authorization"],
    );
  });

  it("encodes a key segment by segment and knows the empty-body hash", () => {
    expect(canonicalUri("/bucket/media/a b/384.avif")).toBe(
      "/bucket/media/a%20b/384.avif",
    );
    expect(amzDates(NOW)).toEqual({
      amzDate: "20260921T101530Z",
      dateStamp: "20260921",
    });
    expect(EMPTY_SHA256).toHaveLength(64);
  });
});

describe("idempotence by checksum", () => {
  const digest = "c".repeat(64);

  it("sends nothing when the bucket already holds exactly these bytes", async () => {
    const { fetcher, calls } = fakeFetcher([
      { status: 200, headers: { "x-amz-meta-sha256": digest } },
    ]);
    const { syncObject } = await import("../../scripts/media-upload.ts");

    const outcome = await syncObject({
      item: item(digest),
      config: CONFIG,
      fetcher,
    });

    expect(outcome.action).toBe("skipped");
    expect(calls.map((call) => call.method)).toEqual(["HEAD"]);
  });

  it("uploads when the stored digest differs, and when the object is absent", async () => {
    const { syncObject } = await import("../../scripts/media-upload.ts");

    const stale = fakeFetcher([
      { status: 200, headers: { "x-amz-meta-sha256": "d".repeat(64) } },
      { status: 200 },
    ]);
    expect(
      (
        await syncObject({
          item: item(digest),
          config: CONFIG,
          fetcher: stale.fetcher,
        })
      ).action,
    ).toBe("uploaded");
    expect(stale.calls.map((call) => call.method)).toEqual(["HEAD", "PUT"]);

    const absent = fakeFetcher([{ status: 404 }, { status: 200 }]);
    expect(
      (
        await syncObject({
          item: item(digest),
          config: CONFIG,
          fetcher: absent.fetcher,
        })
      ).action,
    ).toBe("uploaded");
  });

  it("stores the year-long immutable cache header and the digest on the object", async () => {
    const { syncObject } = await import("../../scripts/media-upload.ts");
    const { fetcher, calls } = fakeFetcher([{ status: 404 }, { status: 200 }]);

    await syncObject({ item: item(digest), config: CONFIG, fetcher });

    const put = calls[1];
    expect(put?.headers["cache-control"]).toBe(MEDIA_CACHE_CONTROL);
    expect(put?.headers["content-type"]).toBe("image/avif");
    expect(put?.headers["x-amz-meta-sha256"]).toBe(digest);
    // The signature is over the manifest's checksum, so bytes that are not the bytes the
    // manifest recorded cannot be uploaded under a clean row: R2 verifies the hash.
    expect(put?.headers["x-amz-content-sha256"]).toBe(digest);
    expect(put?.body?.toString()).toBe("derived bytes");
  });

  it("reports an unexpected status rather than carrying on", async () => {
    const { syncObject } = await import("../../scripts/media-upload.ts");
    const { fetcher } = fakeFetcher([{ status: 500, body: "boom" }]);

    await expect(
      syncObject({ item: item(digest), config: CONFIG, fetcher }),
    ).rejects.toThrow(/status 500/u);
  });

  it("skips the HEAD with `--force`, and sends nothing with `--dry-run`", async () => {
    const { syncObject } = await import("../../scripts/media-upload.ts");

    const forced = fakeFetcher([{ status: 200 }]);
    await syncObject({
      item: item(digest),
      config: CONFIG,
      fetcher: forced.fetcher,
      force: true,
    });
    expect(forced.calls.map((call) => call.method)).toEqual(["PUT"]);

    const dry = fakeFetcher([{ status: 404 }]);
    const outcome = await syncObject({
      item: item(digest),
      config: CONFIG,
      fetcher: dry.fetcher,
      dryRun: true,
    });
    expect(outcome.action).toBe("uploaded");
    expect(dry.calls.map((call) => call.method)).toEqual(["HEAD"]);
  });
});

describe("nothing reaches the bucket that the gates have not seen", () => {
  it("refuses a tree whose manifest is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "fo-media-upload-"));
    temporary.push(root);
    mkdirSync(join(root, "seed/data"), { recursive: true });

    await expect(loadUploadSet({ root })).rejects.toThrow(
      /media-variants\.json/u,
    );
  });

  it("refuses to upload when nothing has been derived", async () => {
    const root = mkdtempSync(join(tmpdir(), "fo-media-upload-"));
    temporary.push(root);
    mkdirSync(join(root, "seed/data"), { recursive: true });
    for (const file of ["media.json", "media-variants.json"]) {
      copyFileSync(
        join(repoRoot, "seed/data", file),
        join(root, "seed/data", file),
      );
    }

    // The manifest is clean — that half of `checkVariants()` runs everywhere — but there are no
    // bytes, and uploading nothing while reporting success is how a bucket ends up half full.
    await expect(loadUploadSet({ root })).rejects.toThrow(/no derived tree/u);
  });
});
