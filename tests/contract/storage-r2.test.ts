/**
 * T-24 — `R2Storage` against the shared `Storage` contract (spec 006 AC-24; spec 002 §5.2; TASK-082).
 *
 * The same `describeStorageContract` that `storage-in-memory.test.ts` runs against the fake runs
 * here against the S3-API implementation, talking to an in-process S3 endpoint (`support/fake-s3.ts`)
 * that verifies every signature itself. No network, no real bucket, no real credential.
 *
 * Because the fake verifies with code written beside it, the signer is also pinned to **AWS's own
 * published examples** (the S3 "Signature Version 4" examples: GET with a range header, PUT with
 * `x-amz-storage-class`, and the presigned GET), and cross-checked against the independent signer
 * that has been uploading to the real bucket since TASK-138 (`scripts/media-upload.ts`). A
 * signing bug that the fake shared would still fail those.
 *
 * Then what this implementation adds over the interface: placement (a public bucket takes only
 * derived images of a public kind, typed by their bytes), undeclared buckets refused, errors that
 * never carry a key, a URL or a secret, and the environment read that names keys only.
 */
import { createHash } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { signRequest } from "../../scripts/media-upload.ts";
import { MEDIA_CACHE_CONTROL } from "../../src/lib/media-headers.ts";
import {
  MAX_PUBLIC_OBJECT_BYTES,
  R2Storage,
  R2_PRIVATE_BUCKET_KEY,
  StoragePlacementError,
  StorageRequestError,
  assertPlacement,
  presignGet,
  r2EnvironmentFrom,
  signHeaders,
  sniffImageMime,
} from "../../src/lib/storage-r2.ts";
import { StorageIntegrityError, type Storage } from "../../src/lib/storage.ts";

import { FakeS3 } from "./support/fake-s3.ts";
import { describeStorageContract } from "./support/storage-contract.ts";

const HOST = "0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com";
const ENDPOINT = `https://${HOST}`;
const ACCESS_KEY_ID = "fixture-access-key-id";
const SECRET = "fixture-secret-access-key-do-not-print";
const PUBLIC = "fo-media-test";
const PRIVATE = "fo-private-test";
const BACKUPS = "fo-backups-test";

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");

interface Rig {
  readonly s3: FakeS3;
  readonly storage: R2Storage;
  readonly advanceSeconds: (seconds: number) => void;
}

function rig(
  options: {
    readonly secret?: string;
    readonly publicBuckets?: readonly string[];
    readonly privateBuckets?: readonly string[];
  } = {},
): Rig {
  let now = Date.parse("2026-10-23T09:00:00Z");
  const clock = (): Date => new Date(now);
  const s3 = new FakeS3({
    host: HOST,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET,
    buckets: [PUBLIC, PRIVATE, BACKUPS],
    now: clock,
  });
  const storage = new R2Storage({
    endpoint: ENDPOINT,
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: options.secret ?? SECRET,
    publicBuckets: [...(options.publicBuckets ?? [PUBLIC])],
    privateBuckets: [...(options.privateBuckets ?? [PRIVATE, BACKUPS])],
    fetch: s3.fetch,
    now: clock,
  });
  return {
    s3,
    storage,
    advanceSeconds: (seconds) => {
      now += seconds * 1000;
    },
  };
}

/*
 * The contract. The suite writes arbitrary bytes under `media/…` with image types, which a public
 * bucket rightly refuses (its bytes are not those images), so both of the contract's buckets are
 * declared private here: the contract is about storage semantics, and placement has its own block.
 */
describeStorageContract(
  "R2Storage over the S3 API (in-process endpoint)",
  () => {
    const { s3, storage, advanceSeconds } = rig({
      publicBuckets: [],
      privateBuckets: [PUBLIC, BACKUPS],
    });
    return {
      storage,
      fetch: (url: string) => s3.fetch(url),
      bucket: PUBLIC,
      otherBucket: BACKUPS,
      advanceSeconds,
    };
  },
);

describe("SigV4 — AWS's published S3 examples (us-east-1, examplebucket)", () => {
  const credentials = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  };
  const now = new Date("2013-05-24T00:00:00Z");
  const host = "examplebucket.s3.amazonaws.com";
  const signatureOf = (authorization: string | undefined): string =>
    /Signature=([0-9a-f]{64})$/u.exec(authorization ?? "")?.[1] ?? "";

  it("GET Object with a Range header", () => {
    const signed = signHeaders({
      method: "GET",
      host,
      path: "/test.txt",
      headers: { range: "bytes=0-9" },
      payloadSha256: sha256(""),
      credentials,
      region: "us-east-1",
      now,
    });
    expect(signed.headers["authorization"]).toContain(
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,",
    );
    expect(signatureOf(signed.headers["authorization"])).toBe(
      "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("PUT Object, with a `$` in the key encoded in the signed path", () => {
    const signed = signHeaders({
      method: "PUT",
      host,
      path: "/test$file.text",
      headers: {
        date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
      },
      payloadSha256: sha256("Welcome to Amazon S3."),
      credentials,
      region: "us-east-1",
      now,
    });
    expect(signed.path).toBe("/test%24file.text");
    expect(signatureOf(signed.headers["authorization"])).toBe(
      "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
    );
  });

  it("a presigned GET valid for 86 400 s", () => {
    const url = new URL(
      presignGet({
        origin: `https://${host}`,
        host,
        path: "/test.txt",
        credentials,
        region: "us-east-1",
        now,
        expiresSeconds: 86_400,
      }),
    );
    expect(url.searchParams.get("X-Amz-Credential")).toBe(
      "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("86400");
    expect(url.searchParams.get("X-Amz-Signature")).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("agrees with the uploader that has been signing for the real bucket since TASK-138", () => {
    const at = new Date("2026-10-23T09:00:00Z");
    const theirs = signRequest({
      method: "PUT",
      endpoint: ENDPOINT,
      bucket: PUBLIC,
      objectKey: "media/product/fo-bq-001-hero/384.avif",
      payloadSha256: sha256("bytes"),
      headers: {
        "content-type": "image/avif",
        "x-amz-meta-sha256": sha256("bytes"),
      },
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET,
      now: at,
    });
    const ours = signHeaders({
      method: "PUT",
      host: HOST,
      path: `/${PUBLIC}/media/product/fo-bq-001-hero/384.avif`,
      headers: {
        "content-type": "image/avif",
        "x-amz-meta-sha256": sha256("bytes"),
      },
      payloadSha256: sha256("bytes"),
      credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET },
      region: "auto",
      now: at,
    });
    expect(ours.headers["authorization"]).toBe(theirs.headers["authorization"]);
    expect(`${ENDPOINT}${ours.path}`).toBe(theirs.url);
  });
});

/** A real image of `format`, so the public bucket's byte sniffing has something true to read. */
async function image(
  format: "avif" | "webp" | "jpeg" | "png",
): Promise<Uint8Array> {
  const base = sharp({
    create: { width: 8, height: 10, channels: 3, background: "#c08040" },
  });
  const encoded =
    format === "avif"
      ? base.avif()
      : format === "webp"
        ? base.webp()
        : format === "jpeg"
          ? base.jpeg()
          : base.png();
  return new Uint8Array(await encoded.toBuffer());
}

describe("placement — a public bucket never takes a private object (AC-24, security)", () => {
  it("publishes a derived product image, typed by its bytes, with the immutable cache rule", async () => {
    const { s3, storage } = rig();
    const body = await image("avif");
    const stored = await storage.put({
      bucket: PUBLIC,
      objectKey: "media/product/fo-bq-001-hero/384.avif",
      body,
      mime: "image/avif",
    });
    expect(stored.checksumSha256).toBe(sha256(body));
    const object = s3.stored(PUBLIC, "media/product/fo-bq-001-hero/384.avif");
    expect(object?.headers["cache-control"]).toBe(MEDIA_CACHE_CONTROL);
    expect(object?.headers["x-amz-meta-sha256"]).toBe(sha256(body));
  });

  it("accepts each allowed type on a public bucket, and brand variants too", async () => {
    const { storage } = rig();
    for (const [format, mime] of [
      ["avif", "image/avif"],
      ["webp", "image/webp"],
      ["jpeg", "image/jpeg"],
      ["png", "image/png"],
    ] as const) {
      await expect(
        storage.put({
          bucket: PUBLIC,
          objectKey: `media/brand/logo/384.${format}`,
          body: await image(format),
          mime,
        }),
        mime,
      ).resolves.toMatchObject({ mime });
    }
  });

  it.each([
    ["an original (pre-strip bytes)", "originals/product/fo-bq-001-hero"],
    ["a delivery photograph's variant", "media/delivery_proof/0b7c/384.avif"],
    ["a partner file's variant", "media/partner/0b7c/384.avif"],
    ["a database dump", "backups/2026/10/23/db.dump"],
  ])("refuses %s on a public bucket and sends nothing", async (_label, key) => {
    const { s3, storage } = rig();
    await expect(
      storage.put({
        bucket: PUBLIC,
        objectKey: key,
        body: await image("avif"),
        mime: "image/avif",
      }),
    ).rejects.toBeInstanceOf(StoragePlacementError);
    expect(s3.requests).toEqual([]);
    expect(s3.keys(PUBLIC)).toEqual([]);
  });

  it.each([
    ["text/html", "<script>alert(1)</script>"],
    ["image/svg+xml", "<svg onload='alert(1)'/>"],
    ["application/octet-stream", "x"],
  ])("refuses the type %s on a public bucket", async (mime, text) => {
    const { s3, storage } = rig();
    await expect(
      storage.put({
        bucket: PUBLIC,
        objectKey: "media/product/fo-bq-001-hero/384.avif",
        body: new TextEncoder().encode(text),
        mime,
      }),
    ).rejects.toBeInstanceOf(StoragePlacementError);
    expect(s3.requests).toEqual([]);
  });

  it("refuses bytes that are not the image type they are declared as", async () => {
    const { s3, storage } = rig();
    await expect(
      storage.put({
        bucket: PUBLIC,
        objectKey: "media/product/fo-bq-001-hero/384.avif",
        body: await image("png"),
        mime: "image/avif",
      }),
    ).rejects.toThrow(/not the image type/u);
    await expect(
      storage.put({
        bucket: PUBLIC,
        objectKey: "media/product/fo-bq-001-hero/384.avif",
        body: new TextEncoder().encode("<html>"),
        mime: "image/avif",
      }),
    ).rejects.toThrow(/not the image type/u);
    expect(s3.requests).toEqual([]);
  });

  it("refuses a public object above the size cap, and takes one at the cap", async () => {
    const jpeg = await image("jpeg");
    const at = new Uint8Array(MAX_PUBLIC_OBJECT_BYTES);
    at.set(jpeg);
    const over = new Uint8Array(MAX_PUBLIC_OBJECT_BYTES + 1);
    over.set(jpeg);
    const input = {
      bucket: PUBLIC,
      objectKey: "media/product/big/1920.jpeg",
      mime: "image/jpeg",
    };
    expect(() => {
      assertPlacement("public", { ...input, body: at });
    }).not.toThrow();
    expect(() => {
      assertPlacement("public", { ...input, body: over });
    }).toThrow(StoragePlacementError);
  });

  it("stores anything well-formed in a private bucket, with a no-store cache rule", async () => {
    const { s3, storage } = rig();
    const body = new TextEncoder().encode("%PDF-1.7 statement");
    await storage.put({
      bucket: PRIVATE,
      objectKey: "originals/partner/0b7c-statement",
      body,
      mime: "application/pdf",
    });
    expect(
      s3.stored(PRIVATE, "originals/partner/0b7c-statement")?.headers[
        "cache-control"
      ],
    ).toBe("private, no-store");
  });

  it("refuses every operation on a bucket it was not configured with, before any request", async () => {
    const { s3, storage } = rig();
    const location = {
      bucket: "fo-someone-else",
      objectKey: "media/product/a/384.avif",
    };
    await expect(
      storage.put({
        ...location,
        body: await image("avif"),
        mime: "image/avif",
      }),
    ).rejects.toBeInstanceOf(StoragePlacementError);
    await expect(storage.head(location)).rejects.toBeInstanceOf(
      StoragePlacementError,
    );
    await expect(storage.getSignedUrl(location, 60)).rejects.toBeInstanceOf(
      StoragePlacementError,
    );
    await expect(storage.delete(location)).rejects.toBeInstanceOf(
      StoragePlacementError,
    );
    expect(s3.requests).toEqual([]);
  });

  it("refuses a configuration that declares one bucket both public and private", () => {
    expect(
      () =>
        new R2Storage({
          endpoint: ENDPOINT,
          accessKeyId: ACCESS_KEY_ID,
          secretAccessKey: SECRET,
          publicBuckets: [PUBLIC],
          privateBuckets: [PUBLIC],
        }),
    ).toThrow(StoragePlacementError);
  });
});

describe("signed URLs — where they point and how long they live", () => {
  it("points at the S3 endpoint, never the public media host, and carries the TTL asked for", async () => {
    const { storage } = rig();
    const url = new URL(
      await storage.getSignedUrl(
        { bucket: PRIVATE, objectKey: "originals/delivery_proof/0b7c" },
        300,
      ),
    );
    expect(url.origin).toBe(ENDPOINT);
    expect(url.pathname).toBe(`/${PRIVATE}/originals/delivery_proof/0b7c`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("a URL signed with the wrong secret reads nothing", async () => {
    const good = rig();
    const location = { bucket: PRIVATE, objectKey: "originals/product/x" };
    await good.storage.put({
      ...location,
      body: new Uint8Array([1]),
      mime: "image/png",
    });
    const forger = new R2Storage({
      endpoint: ENDPOINT,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: "not-the-secret",
      publicBuckets: [],
      privateBuckets: [PRIVATE],
      now: () => new Date("2026-10-23T09:00:00Z"),
    });
    const forged = await forger.getSignedUrl(location, 60);
    expect((await good.s3.fetch(forged)).status).toBe(403);
  });

  it("a URL whose expiry was raised is refused", async () => {
    const { s3, storage } = rig();
    const location = { bucket: PRIVATE, objectKey: "originals/product/x" };
    await storage.put({
      ...location,
      body: new Uint8Array([1]),
      mime: "image/png",
    });
    const url = await storage.getSignedUrl(location, 60);
    const raised = url.replace("X-Amz-Expires=60&", "X-Amz-Expires=604800&");
    expect(raised).not.toBe(url);
    expect((await s3.fetch(url)).status).toBe(200);
    expect((await s3.fetch(raised)).status).toBe(403);
  });
});

describe("idempotence, integrity and failure — what a caller can rely on", () => {
  it("a second put of the same bytes leaves one object with the same facts", async () => {
    const { s3, storage } = rig();
    const input = {
      bucket: PUBLIC,
      objectKey: "media/product/fo-bq-001-hero/384.webp",
      body: await image("webp"),
      mime: "image/webp",
    };
    const first = await storage.put(input);
    const second = await storage.put(input);
    expect(second).toEqual(first);
    expect(s3.keys(PUBLIC)).toEqual(["media/product/fo-bq-001-hero/384.webp"]);
  });

  it("a declared checksum that does not match sends nothing", async () => {
    const { s3, storage } = rig();
    await expect(
      storage.put({
        bucket: PRIVATE,
        objectKey: "originals/product/x",
        body: new Uint8Array([1, 2]),
        mime: "image/png",
        checksumSha256: sha256("other"),
      }),
    ).rejects.toBeInstanceOf(StorageIntegrityError);
    expect(s3.requests).toEqual([]);
  });

  it("head refuses an object that carries no recorded SHA-256 rather than inventing one", async () => {
    const { s3, storage } = rig();
    s3.seed(PRIVATE, "originals/product/foreign", new Uint8Array([1]), {
      "content-type": "image/png",
    });
    await expect(
      storage.head({ bucket: PRIVATE, objectKey: "originals/product/foreign" }),
    ).rejects.toBeInstanceOf(StorageIntegrityError);
  });

  it("a refused request throws with the status and no key, bucket, URL or secret in the message", async () => {
    const { storage } = rig({ secret: "a-wrong-secret-value" });
    const key = "originals/delivery_proof/0b7c-secret-key-name";
    const attempts: Promise<unknown>[] = [
      storage.put({
        bucket: PRIVATE,
        objectKey: key,
        body: new Uint8Array([1]),
        mime: "image/png",
      }),
      storage.head({ bucket: PRIVATE, objectKey: key }),
      storage.delete({ bucket: PRIVATE, objectKey: key }),
    ];
    for (const attempt of attempts) {
      const error = await attempt.then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(StorageRequestError);
      expect((error as StorageRequestError).status).toBe(403);
      const message = (error as Error).message;
      for (const secret of [
        key,
        PRIVATE,
        HOST,
        "a-wrong-secret-value",
        ACCESS_KEY_ID,
      ]) {
        expect(message).not.toContain(secret);
      }
    }
  });

  it("a delete the store refuses is an error, never a quiet success", async () => {
    const { storage } = rig({ secret: "a-wrong-secret-value" });
    await expect(
      storage.delete({ bucket: PRIVATE, objectKey: "originals/product/x" }),
    ).rejects.toMatchObject({ name: "StorageRequestError", status: 403 });
  });

  it("a network failure is a StorageRequestError with status 0 and no URL", async () => {
    const storage = new R2Storage({
      endpoint: ENDPOINT,
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET,
      publicBuckets: [],
      privateBuckets: [PRIVATE],
      fetch: () =>
        Promise.reject(
          new TypeError(
            `fetch failed: ${ENDPOINT}/${PRIVATE}/originals/product/x`,
          ),
        ),
    });
    const error = await storage
      .head({ bucket: PRIVATE, objectKey: "originals/product/x" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );
    expect(error).toBeInstanceOf(StorageRequestError);
    expect((error as StorageRequestError).status).toBe(0);
    expect((error as Error).message).not.toContain(HOST);
  });

  it("refuses a traversal-shaped key before any request is made", async () => {
    const { s3, storage } = rig();
    for (const objectKey of [
      "media/product/../../originals/product/x",
      "media/product/%2e%2e/x",
      "media\\product\\x",
    ]) {
      await expect(
        storage.put({
          bucket: PRIVATE,
          objectKey,
          body: new Uint8Array([1]),
          mime: "image/png",
        }),
        objectKey,
      ).rejects.toThrow();
    }
    expect(s3.requests).toEqual([]);
  });

  it("is a Storage", () => {
    const storage: Storage = rig().storage;
    expect(storage.objectKey("product", "fo-bq-001-hero", "original")).toBe(
      "originals/product/fo-bq-001-hero",
    );
  });
});

describe("sniffImageMime", () => {
  it("names each allowed image type by its bytes and nothing else", async () => {
    expect(sniffImageMime(await image("avif"))).toBe("image/avif");
    expect(sniffImageMime(await image("webp"))).toBe("image/webp");
    expect(sniffImageMime(await image("jpeg"))).toBe("image/jpeg");
    expect(sniffImageMime(await image("png"))).toBe("image/png");
    expect(sniffImageMime(new TextEncoder().encode("<svg/>"))).toBeUndefined();
    expect(sniffImageMime(new Uint8Array(0))).toBeUndefined();
  });
});

describe("r2EnvironmentFrom — the R2 half of the environment", () => {
  const base = {
    R2_S3_ENDPOINT: ENDPOINT,
    R2_ACCESS_KEY_ID: ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: SECRET,
    R2_BUCKET: "flowersoverseas-media",
    R2_BACKUPS_BUCKET: "flowersoverseas-backups",
  };

  it("makes R2_BUCKET the one public bucket and the backups bucket private", () => {
    const env = r2EnvironmentFrom(base);
    expect(env.config.publicBuckets).toEqual(["flowersoverseas-media"]);
    expect(env.config.privateBuckets).toEqual(["flowersoverseas-backups"]);
    expect(env.privateBucket).toBeUndefined();
  });

  it("adds R2_PRIVATE_BUCKET as private when set, and treats blank as absent", () => {
    expect(
      r2EnvironmentFrom({
        ...base,
        [R2_PRIVATE_BUCKET_KEY]: "flowersoverseas-private",
      }).config.privateBuckets,
    ).toEqual(["flowersoverseas-backups", "flowersoverseas-private"]);
    expect(
      r2EnvironmentFrom({ ...base, [R2_PRIVATE_BUCKET_KEY]: "  " })
        .privateBucket,
    ).toBeUndefined();
  });

  it("refuses a private bucket that is the public one", () => {
    expect(() =>
      r2EnvironmentFrom({
        ...base,
        [R2_PRIVATE_BUCKET_KEY]: "flowersoverseas-media",
      }),
    ).toThrow();
  });

  it("names missing or malformed keys and never prints a value", () => {
    const error = (() => {
      try {
        r2EnvironmentFrom({
          ...base,
          R2_SECRET_ACCESS_KEY: "has whitespace in it",
          R2_S3_ENDPOINT: "http://insecure.example/path",
          R2_BUCKET: undefined,
        });
      } catch (caught) {
        return caught as Error;
      }
      return undefined;
    })();
    expect(error?.message).toContain("R2_SECRET_ACCESS_KEY");
    expect(error?.message).toContain("R2_S3_ENDPOINT");
    expect(error?.message).toContain("R2_BUCKET");
    expect(error?.message).not.toContain("has whitespace in it");
    expect(error?.message).not.toContain("insecure.example");
  });
});
