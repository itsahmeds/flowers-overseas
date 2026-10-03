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
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { SLOT_BYTE_CAPS } from "../../seed/budgets.ts";
import { AVIF_OPTIONS } from "../../seed/schema/variants.ts";
import { applyWatermark, isWatermarked } from "../../seed/watermark.ts";
import {
  removeDerivedTrees,
  variantBox,
  writeDerivedTree,
} from "./support/derived-tree.ts";
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
  runUpload,
  runVerify,
  signRequest,
  verifyPublished,
} from "../../scripts/media-upload.ts";
import type { MediaVariantManifest } from "../../seed/schema/media.ts";
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
  removeDerivedTrees();
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
    expect(parseArgs(["--dry-run"])).toEqual({
      dryRun: true,
      force: false,
      verify: false,
    });
    expect(parseArgs(["--only", "home-hero", "--force"])).toEqual({
      dryRun: false,
      force: true,
      verify: false,
      only: ["home-hero"],
    });
    expect(parseArgs(["--verify"])).toEqual({
      dryRun: false,
      force: false,
      verify: true,
    });
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/u);
  });
});

/**
 * `--verify`, the one check that reads the bucket rather than the machine about to write to it.
 *
 * `/review 94` round 2 found the direction nothing covered: a manifest row's `bytes` can be
 * lowered from 9 911 to 900 and both `pnpm seed:check` and `pnpm media:variants --check` stay
 * clean in the CI condition, because neither has the file. The upload's own gates cannot see it
 * either — they run before the bytes leave. This does, from the published object's own headers,
 * with no credential.
 */
describe("`--verify`: the bucket audited against the manifest (AC-14)", () => {
  const row = (bytes: number): MediaVariantManifest => ({
    ...item("e".repeat(64)).row,
    bytes,
  });

  const head = (
    headers: Record<string, string>,
    status = 200,
  ): { fetcher: Fetcher; calls: Call[] } => fakeFetcher([{ status, headers }]);

  it("passes a published object whose headers match its row, and signs nothing", async () => {
    const { fetcher, calls } = head({
      "content-length": "1234",
      "content-type": "image/avif",
    });

    expect(await verifyPublished({ rows: [row(1234)], fetcher })).toEqual([]);

    expect(calls[0]?.method).toBe("HEAD");
    expect(calls[0]?.url).toBe(`${MEDIA_ORIGIN}/media/fo-bq-001-hero/384.avif`);
    // A public object needs no credential, and a command that asked for one would be one more
    // place a secret could be printed.
    expect(Object.keys(calls[0]?.headers ?? {})).toEqual([]);
    expect(JSON.stringify(calls)).not.toContain(SECRET);
  });

  it("reports a row whose byte count disagrees with the object it names", async () => {
    const { fetcher } = head({
      "content-length": "9911",
      "content-type": "image/avif",
    });

    const problems = await verifyPublished({ rows: [row(900)], fetcher });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("9911 B published but 900 B");
    expect(problems[0]).toContain("media/fo-bq-001-hero/384.avif");
  });

  it("reports an object the manifest lists but the bucket does not publish", async () => {
    const { fetcher } = head({}, 404);

    expect((await verifyPublished({ rows: [row(1234)], fetcher }))[0]).toMatch(
      /the bucket does not publish it \(404/u,
    );
  });

  it("reports a wrong content type and an unexpected status", async () => {
    const wrongType = head({
      "content-length": "1234",
      "content-type": "image/webp",
    });
    expect(
      (
        await verifyPublished({ rows: [row(1234)], fetcher: wrongType.fetcher })
      )[0],
    ).toMatch(/published as `image\/webp`, expected `image\/avif`/u);

    const server = head({}, 503);
    expect(
      (
        await verifyPublished({ rows: [row(1234)], fetcher: server.fetcher })
      )[0],
    ).toMatch(/HEAD returned 503/u);
  });

  it("collects every disagreement in one run rather than stopping at the first", async () => {
    const { fetcher } = fakeFetcher([
      { status: 404 },
      {
        status: 200,
        headers: { "content-length": "1", "content-type": "image/avif" },
      },
      {
        status: 200,
        headers: { "content-length": "1234", "content-type": "image/avif" },
      },
    ]);

    // `concurrency: 1` so the fake's scripted responses line up with the rows in order.
    const problems = await verifyPublished({
      rows: [row(1234), row(1234), row(1234)],
      fetcher,
      concurrency: 1,
    });

    expect(problems).toHaveLength(2);
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
    // A clean clone, exactly: the committed site-origin copies (the `hero` slot) are in the
    // repository, the derived tree is not.
    cpSync(join(repoRoot, "public/media"), join(root, "public/media"), {
      recursive: true,
    });

    // The manifest and the committed copies are clean — those halves of `checkVariants()` run
    // everywhere — but nothing is derived, and uploading nothing while reporting success is how a
    // bucket ends up half full.
    await expect(loadUploadSet({ root })).rejects.toThrow(/no derived tree/u);
  });
});

/* -------------------------------------------------------------------------- */
/* The two refusals AC-15 and AC-16 now rest on, exercised as behaviour.       */
/* -------------------------------------------------------------------------- */

/**
 * `/review 94` round 2, and the reason this block exists at all: the reviewer replaced
 * `const cap = SLOT_BYTE_CAPS[slot]` with `Number.MAX_SAFE_INTEGER || …` and guarded the
 * watermark branch behind `items.length < 0`, leaving both source strings intact — and the whole
 * 4 357-case unit suite stayed green. With the committed tree gone, `scripts/media-upload.ts` is
 * the **only** file-level enforcement of AC-16 and the last per-file enforcement of AC-15, so
 * "the upload refuses" has to be a property something can falsify rather than a sentence in a
 * header.
 *
 * Each case builds a real tree with `writeDerivedTree()` — the repository's own `media.json`, so
 * the slot and therefore the cap are the shipped ones — and drives `loadUploadSet()`, the
 * function `runUpload()` (and so `main()`) calls before it opens a socket. A clean tree of the
 * same shape is asserted to load, so a refusal cannot be passing for some unrelated reason.
 */
describe("the uploader's own refusals (AC-15, AC-16)", () => {
  // `occasionTile` is the tightest cap of any slot the Phase-0 dataset uses: 18 000 B at a single
  // 384 px width, which is small enough that both fixtures encode in well under a second.
  const ASSET = "home-occasion-birthday";
  const WIDTH = 384;

  const encodeAvif = async (input: Buffer): Promise<Buffer> =>
    await sharp(input).avif(AVIF_OPTIONS).toBuffer();

  /** A flat style-guide frame: a few hundred bytes, no magenta, inside every cap. */
  async function cleanFrame(): Promise<Buffer> {
    const box = variantBox(ASSET, WIDTH);
    return await encodeAvif(
      await sharp({
        create: {
          width: box.width,
          height: box.height,
          channels: 3,
          background: { r: 214, g: 209, b: 201 },
        },
      })
        .png()
        .toBuffer(),
    );
  }

  /**
   * Deterministic RGB noise at the same box. Noise is what an encoder cannot compress, so this is
   * how a 384 px tile gets past an 18 000 B cap without inventing a fake byte count: the file is
   * genuinely that big, and the manifest row records the size it genuinely is.
   */
  async function oversizedFrame(): Promise<Buffer> {
    const box = variantBox(ASSET, WIDTH);
    const pixels = Buffer.alloc(box.width * box.height * 3);
    let state = 123_456_789;
    for (let index = 0; index < pixels.length; index += 1) {
      state = (state * 1_103_515_245 + 12_345) >>> 0;
      pixels[index] = state & 0xff;
    }
    return await encodeAvif(
      await sharp(pixels, {
        raw: { width: box.width, height: box.height, channels: 3 },
      })
        .png()
        .toBuffer(),
    );
  }

  it("loads a clean tree, so a refusal below is the refusal and not the fixture", async () => {
    const clean = await cleanFrame();
    const root = writeDerivedTree([
      { assetId: ASSET, width: WIDTH, format: "avif", data: clean },
    ]);

    const items = await loadUploadSet({ root });

    expect(items).toHaveLength(1);
    expect(items[0]?.row.objectKey).toBe(`media/${ASSET}/384.avif`);
    expect(items[0]?.bytes.byteLength).toBe(clean.byteLength);
    expect(clean.byteLength).toBeLessThanOrEqual(
      SLOT_BYTE_CAPS["occasionTile"],
    );
    expect(await isWatermarked(clean)).toBe(false);
  }, 60_000);

  it("refuses a file above its slot's cap, naming the cap (AC-15)", async () => {
    const oversized = await oversizedFrame();
    // The fixture is only a fixture if it is genuinely over the cap.
    expect(oversized.byteLength).toBeGreaterThan(
      SLOT_BYTE_CAPS["occasionTile"],
    );

    const root = writeDerivedTree([
      { assetId: ASSET, width: WIDTH, format: "avif", data: oversized },
    ]);

    await expect(loadUploadSet({ root })).rejects.toThrow(
      new RegExp(
        `${String(oversized.byteLength)} B is above the ${String(SLOT_BYTE_CAPS["occasionTile"])} B cap for the .occasionTile. slot`,
        "u",
      ),
    );
  }, 60_000);

  /**
   * A decodable AVIF of exactly `total` bytes: the clean frame followed by one top-level ISOBMFF
   * `free` box, which every HEIF reader skips by definition. That is how a test reaches the cap
   * to the byte with a real image rather than a byte count it made up (`/review 94` round 2,
   * HOLE 4: the cases above cannot tell `> cap` from `> cap * 2`).
   */
  function paddedTo(image: Buffer, total: number): Buffer {
    const size = total - image.byteLength;
    if (size < 8)
      throw new Error(
        `cannot pad ${String(image.byteLength)} B to ${String(total)} B`,
      );
    const box = Buffer.alloc(size);
    box.writeUInt32BE(size, 0);
    box.write("free", 4, "ascii");
    return Buffer.concat([image, box]);
  }

  it("accepts a file of exactly its slot's cap, and refuses one byte more (AC-15)", async () => {
    const cap = SLOT_BYTE_CAPS["occasionTile"];
    const clean = await cleanFrame();

    const atCap = paddedTo(clean, cap);
    expect(atCap.byteLength).toBe(cap);
    // Still a picture, and still not watermarked, so the only gate it can meet is the cap.
    expect(await isWatermarked(atCap)).toBe(false);
    const accepted = await loadUploadSet({
      root: writeDerivedTree([
        { assetId: ASSET, width: WIDTH, format: "avif", data: atCap },
      ]),
    });
    expect(accepted.map((loaded) => loaded.bytes.byteLength)).toEqual([cap]);

    const overCap = paddedTo(clean, cap + 1);
    await expect(
      loadUploadSet({
        root: writeDerivedTree([
          { assetId: ASSET, width: WIDTH, format: "avif", data: overCap },
        ]),
      }),
    ).rejects.toThrow(
      `${String(cap + 1)} B is above the ${String(cap)} B cap for the \`occasionTile\` slot`,
    );
  }, 60_000);

  it("refuses a file carrying the demo watermark (AC-16)", async () => {
    const marked = await encodeAvif(await applyWatermark(await cleanFrame()));
    // Under the cap, so the refusal below can only be the watermark one: the cap is checked first.
    expect(marked.byteLength).toBeLessThanOrEqual(
      SLOT_BYTE_CAPS["occasionTile"],
    );
    expect(await isWatermarked(marked)).toBe(true);

    const root = writeDerivedTree([
      { assetId: ASSET, width: WIDTH, format: "avif", data: marked },
    ]);

    await expect(loadUploadSet({ root })).rejects.toThrow(
      /carries the demo watermark, which never ships/u,
    );
  }, 60_000);

  it("refuses a row whose bytes disagree with the file it names (AC-14)", async () => {
    const clean = await cleanFrame();
    const root = writeDerivedTree([
      {
        assetId: ASSET,
        width: WIDTH,
        format: "avif",
        data: clean,
        // The row claims a different file. `checkVariants()` compares byte count and SHA-256, so
        // the upload stops before the first socket — this is the gate the bucket-side `--verify`
        // below complements once the bytes have left the machine.
        recordAs: Buffer.concat([clean, Buffer.from("tampered")]),
      },
    ]);

    await expect(loadUploadSet({ root })).rejects.toThrow(
      /does not match the manifest/u,
    );
  }, 60_000);
});

/* -------------------------------------------------------------------------- */
/* The order `main()` runs the gates in, as behaviour (HOLES 5, 6, 7).         */
/* -------------------------------------------------------------------------- */

/**
 * `runUpload()` is `main()` minus `@next/env` and the real `fetch`: the R2 environment, then
 * `assertOriginAgrees()`, then `loadUploadSet()`, then the first request. `/review 94` round 2
 * deleted the origin call from `main()` and every case still passed, because nothing drove the
 * sequence. Each refusal below is asserted together with **zero calls** to the injected fetcher —
 * a gate that throws after a request has gone out is not a gate — and a clean run of the same tree
 * is the control that shows the fetcher is reachable at all.
 */
describe("the upload's gates run before the first request (runUpload)", () => {
  const ASSET = "home-occasion-birthday";
  const ENV = { ...CONFIG };

  /** A flat in-cap 384 px `occasionTile` frame for one asset. */
  async function cleanFrame(assetId: string): Promise<Buffer> {
    const box = variantBox(assetId, 384);
    return await sharp({
      create: {
        width: box.width,
        height: box.height,
        channels: 3,
        background: { r: 214, g: 209, b: 201 },
      },
    })
      .avif(AVIF_OPTIONS)
      .toBuffer();
  }

  async function cleanTree(recordAs?: Buffer): Promise<string> {
    const data = await cleanFrame(ASSET);
    return writeDerivedTree([
      {
        assetId: ASSET,
        width: 384,
        format: "avif",
        data,
        ...(recordAs === undefined ? {} : { recordAs }),
      },
    ]);
  }

  /**
   * Start a run; the caller awaits `outcome`, then reads what the fetcher and stdout saw. `argv`
   * goes through `parseArgs()` exactly as `main()` hands `process.argv.slice(2)` to it, so a flag
   * that `runUpload()` stops forwarding is caught here and not only one level down.
   */
  function run(
    root: string,
    env: Record<string, string>,
    responses: Parameters<typeof fakeFetcher>[0],
    argv: readonly string[] = [],
  ): { outcome: Promise<unknown>; calls: Call[]; written: string[] } {
    const { fetcher, calls } = fakeFetcher(responses);
    const written: string[] = [];
    const outcome = runUpload({
      root,
      env,
      args: parseArgs(argv),
      fetcher,
      write: (text) => {
        written.push(text);
      },
      now: () => NOW,
    });
    return { outcome, calls, written };
  }

  it("uploads a clean tree to the agreed origin: the control the refusals below are measured against", async () => {
    const root = await cleanTree();
    const { outcome, calls, written } = run(root, ENV, [
      { status: 404 },
      { status: 200 },
    ]);

    await expect(outcome).resolves.toMatchObject({ variants: 1, uploaded: 1 });
    expect(calls.map((call) => call.method)).toEqual(["HEAD", "PUT"]);
    expect(written[0]).toMatch(
      new RegExp(`^uploaded media/${ASSET}/384\\.avif \\(\\d+ B\\)\\n$`, "u"),
    );
    expect(written[1]).toMatch(
      /^1 variant\(s\): 1 uploaded, 0 already current/u,
    );
  }, 60_000);

  it.each([
    ["a different host", "https://pub-somewhere-else.r2.dev"],
    // HOLE 6: the two look-alikes a prefix test would let through, one in each direction.
    ["the origin with a suffix host", `${MEDIA_ORIGIN}.evil.example`],
    ["a prefix of the origin", "https://media.flowersoverseas.co"],
  ])(
    "refuses %s before a single request",
    async (_label, publicBaseUrl) => {
      const root = await cleanTree();
      const { outcome, calls, written } = run(
        root,
        { ...ENV, R2_PUBLIC_BASE_URL: publicBaseUrl },
        [{ status: 404 }, { status: 200 }],
      );

      await expect(outcome).rejects.toThrow(
        /R2_PUBLIC_BASE_URL does not match MEDIA_ORIGIN/u,
      );
      expect(calls).toEqual([]);
      expect(written).toEqual([]);
    },
    60_000,
  );

  it("refuses a tree whose files disagree with the manifest before a single request", async () => {
    const root = await cleanTree(Buffer.from("not the bytes on disk"));
    const { outcome, calls, written } = run(root, ENV, [
      { status: 404 },
      { status: 200 },
    ]);

    await expect(outcome).rejects.toThrow(/does not match the manifest/u);
    expect(calls).toEqual([]);
    expect(written).toEqual([]);
  }, 60_000);

  // HOLE 7: a refused PUT is an error, not an upload — nothing printed for it, no summary line.
  it("does not count a 403 PUT as uploaded", async () => {
    const root = await cleanTree();
    const { outcome, calls, written } = run(root, ENV, [
      { status: 404 },
      { status: 403, body: "AccessDenied" },
    ]);

    await expect(outcome).rejects.toThrow(
      /^PUT media\/home-occasion-birthday\/384\.avif: status 403/u,
    );
    expect(calls.map((call) => call.method)).toEqual(["HEAD", "PUT"]);
    expect(written).toEqual([]);
  }, 60_000);

  /** The bucket path a signed request names: `/{bucket}/{objectKey}`, path-style. */
  const putPaths = (calls: readonly Call[]): string[] =>
    calls
      .filter((call) => call.method === "PUT")
      .map((call) => new URL(call.url).pathname);
  const bucketPath = (assetId: string): string =>
    `/${CONFIG.R2_BUCKET}/media/${assetId}/384.avif`;

  // HOLE 10 (`/break 94` round 2): `--dry-run` is how an operator previews what `--only` selects,
  // so a run that forwards `dryRun: false` would publish to the production bucket while saying
  // "would upload". It HEADs (to know what is current) and never writes.
  it("`--dry-run` sends no PUT, and still reports what it would upload (HOLE 10)", async () => {
    const root = await cleanTree();
    const { outcome, calls, written } = run(
      root,
      ENV,
      [{ status: 404 }, { status: 200 }],
      ["--dry-run"],
    );

    await expect(outcome).resolves.toMatchObject({ variants: 1, uploaded: 1 });
    expect(calls.map((call) => call.method)).toEqual(["HEAD"]);
    expect(putPaths(calls)).toEqual([]);
    expect(written[0]).toMatch(
      new RegExp(
        `^would upload media/${ASSET}/384\\.avif \\(\\d+ B\\)\\n$`,
        "u",
      ),
    );
    expect(written[1]).toMatch(
      /^1 variant\(s\): 1 to upload, 0 already current/u,
    );
  }, 60_000);

  // HOLE 11: TASK-168 keeps unapproved photographs out of the public bucket with `--only`; a run
  // that dropped the filter would publish the whole tree, cached `immutable` for a year.
  const THREE = [
    "home-occasion-birthday",
    "home-occasion-name-day",
    "home-occasion-anniversary",
  ] as const;

  async function threeAssetTree(): Promise<string> {
    return writeDerivedTree(
      await Promise.all(
        THREE.map(async (assetId) => ({
          assetId,
          width: 384,
          format: "avif" as const,
          data: await cleanFrame(assetId),
        })),
      ),
    );
  }

  it("`--only <id>` over a three-asset tree uploads that asset's objects and no other (HOLE 11)", async () => {
    const root = await threeAssetTree();
    const { outcome, calls, written } = run(
      root,
      ENV,
      [{ status: 404 }, { status: 200 }],
      ["--only", "home-occasion-name-day"],
    );

    await expect(outcome).resolves.toMatchObject({ variants: 1, uploaded: 1 });
    expect(calls.map((call) => call.method)).toEqual(["HEAD", "PUT"]);
    expect(putPaths(calls)).toEqual([bucketPath("home-occasion-name-day")]);
    expect(written.at(-1)).toMatch(/^1 variant\(s\): 1 uploaded/u);
  }, 60_000);

  it("`--only` given twice uploads exactly those two assets (HOLE 11)", async () => {
    const root = await threeAssetTree();
    const { outcome, calls, written } = run(
      root,
      ENV,
      [{ status: 404 }, { status: 200 }, { status: 404 }, { status: 200 }],
      ["--only", "home-occasion-birthday", "--only=home-occasion-anniversary"],
    );

    await expect(outcome).resolves.toMatchObject({ variants: 2, uploaded: 2 });
    expect(calls.map((call) => call.method)).toEqual([
      "HEAD",
      "PUT",
      "HEAD",
      "PUT",
    ]);
    expect([...putPaths(calls)].sort()).toEqual(
      [
        bucketPath("home-occasion-anniversary"),
        bucketPath("home-occasion-birthday"),
      ].sort(),
    );
    expect(written.at(-1)).toMatch(/^2 variant\(s\): 2 uploaded/u);
  }, 60_000);
});

/**
 * `/break 142` HOLE 5 (TASK-167): the manifest now carries the variants of 142 `pending`
 * photographs. Only an `approved` asset is ever published, with or without `--only`, and
 * `--verify` does not count an unpublished pending object as missing (`publishableRows()`).
 */
describe("only approved assets reach the bucket, and `--verify` checks only those", () => {
  const APPROVED = "home-occasion-birthday";
  const PENDING = "fo-bq-005-detail";
  const ENV = { ...CONFIG };

  async function frame(assetId: string): Promise<Buffer> {
    const box = variantBox(assetId, 384);
    return await sharp({
      create: {
        width: box.width,
        height: box.height,
        channels: 3,
        background: { r: 214, g: 209, b: 201 },
      },
    })
      .avif(AVIF_OPTIONS)
      .toBuffer();
  }

  async function mixedTree(): Promise<string> {
    return writeDerivedTree(
      await Promise.all(
        [APPROVED, PENDING].map(async (assetId) => ({
          assetId,
          width: 384,
          format: "avif" as const,
          data: await frame(assetId),
        })),
      ),
    );
  }

  it("the fixture's subjects are what they claim: one approved asset and one pending", () => {
    const states = new Map(
      (
        JSON.parse(
          readFileSync(join(repoRoot, "seed/data/media.json"), "utf8"),
        ) as { rows: { id: string; reviewState: string }[] }
      ).rows.map((row) => [row.id, row.reviewState]),
    );
    expect(states.get(APPROVED)).toBe("approved");
    expect(states.get(PENDING)).toBe("pending");
  });

  async function upload(
    root: string,
    argv: readonly string[],
  ): Promise<{ summary: unknown; calls: Call[]; written: string[] }> {
    const { fetcher, calls } = fakeFetcher([
      { status: 404 },
      { status: 200 },
      { status: 404 },
      { status: 200 },
    ]);
    const written: string[] = [];
    const summary = await runUpload({
      root,
      env: ENV,
      args: parseArgs(argv),
      fetcher,
      write: (text) => {
        written.push(text);
      },
      now: () => NOW,
    });
    return { summary, calls, written };
  }

  it("never PUTs a pending asset's variants, even with no `--only`, and says how many it skipped", async () => {
    const { summary, calls, written } = await upload(await mixedTree(), []);

    expect(summary).toMatchObject({ variants: 1, uploaded: 1, unapproved: 1 });
    expect(
      calls
        .filter((call) => call.method === "PUT")
        .map((call) => new URL(call.url).pathname),
    ).toEqual([`/${CONFIG.R2_BUCKET}/media/${APPROVED}/384.avif`]);
    expect(calls.some((call) => call.url.includes(PENDING))).toBe(false);
    expect(written.at(-1)).toContain(
      "1 variant(s) of unapproved assets skipped",
    );
  }, 60_000);

  it("publishes nothing for `--only <pending id>`", async () => {
    const { summary, calls } = await upload(await mixedTree(), [
      "--only",
      PENDING,
    ]);

    expect(summary).toMatchObject({ variants: 0, uploaded: 0, unapproved: 1 });
    expect(calls).toEqual([]);
  }, 60_000);

  it("`--verify` does not report a pending asset's unpublished objects as missing", async () => {
    const root = await mixedTree();
    const rows = (
      JSON.parse(
        readFileSync(join(root, "seed/data/media-variants.json"), "utf8"),
      ) as { rows: MediaVariantManifest[] }
    ).rows;
    const published = rows.find((row) => row.assetId === APPROVED);
    if (published === undefined) throw new Error("fixture has no approved row");
    // The bucket as it should be: the approved object published, the pending one absent.
    const heads: string[] = [];
    const fetcher: Fetcher = async (url) => {
      heads.push(url);
      const isPublished = url === `${MEDIA_ORIGIN}/${published.objectKey}`;
      return await Promise.resolve({
        status: isPublished ? 200 : 404,
        headers: {
          get: (name: string): string | null =>
            !isPublished
              ? null
              : name.toLowerCase() === "content-length"
                ? String(published.bytes)
                : name.toLowerCase() === "content-type"
                  ? contentTypeFor(published.format)
                  : null,
        },
        text: async (): Promise<string> => await Promise.resolve(""),
      });
    };
    const written: string[] = [];

    await expect(
      runVerify({
        root,
        fetcher,
        write: (text) => {
          written.push(text);
        },
      }),
    ).resolves.toEqual({ verified: 1, unapproved: 1 });
    expect(heads).toEqual([`${MEDIA_ORIGIN}/${published.objectKey}`]);
    expect(written[0]).toContain("1 row(s) of unapproved assets not checked");
  }, 60_000);
});

describe("the CLI loads under plain `node`, the way `pnpm media:upload` runs it", () => {
  it("reaches its own argument parser rather than failing to resolve a module", () => {
    // Vitest resolves an extensionless relative import; `node` with type stripping does not. An
    // import of `./media-origin` instead of `./media-origin.ts` anywhere in the script's graph
    // passes every case above and leaves the operator command dead on arrival — which is how
    // round 3 left it (TASK-138 round 5). An unknown flag is the cheapest way to prove the whole
    // graph loaded: it is refused by `parseArgs()`, before any env, network or file is read.
    const result = spawnSync(
      process.execPath,
      ["scripts/media-upload.ts", "--not-a-flag"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(result.stderr).toContain("unknown flag `--not-a-flag`");
    expect(result.status).toBe(1);
  });
});
