/**
 * The `Storage` contract (spec 002 §5.2, AC-22, T-22's second half; TASK-017).
 *
 * Written as a function, as `catalog-provider-contract.ts` is, because it has two callers:
 * `storage-in-memory.test.ts` runs it against `InMemoryStorage` today, and spec 006's T-24 runs the
 * same function against the R2 implementation and a real bucket (TASK-082). A suite written twice
 * could not claim the two implementations are observably the same.
 *
 * The round trip is put → head → signed URL → delete, plus the failure cases a caller relies on:
 * an absent object, a checksum that does not match the body, a signed URL that was edited, an
 * out-of-range TTL, a key outside the convention. Expiry needs a clock the suite controls, so it
 * runs only where the harness supplies `advanceSeconds` — the fake does, a real bucket cannot.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MAX_SIGNED_URL_TTL_SECONDS,
  type ObjectLocation,
  type Storage,
  StorageIntegrityError,
} from "../../../src/lib/storage.ts";

export interface StorageContractHarness {
  /** A fresh, empty implementation per case. */
  readonly storage: Storage;
  /** Fetch a URL the implementation signed: global `fetch` for R2, the fake's own for the fake. */
  readonly fetch: (url: string) => Promise<Response>;
  /** The bucket the cases write to. */
  readonly bucket: string;
  /** A second bucket, for the isolation case; omitted where only one exists. */
  readonly otherBucket?: string;
  /** Move the implementation's clock forward; omitted where the clock is not ours. */
  readonly advanceSeconds?: (seconds: number) => void;
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

export function describeStorageContract(
  name: string,
  makeHarness: () => StorageContractHarness,
): void {
  describe(`Storage contract — ${name} (spec 002 §5.2, AC-22)`, () => {
    const at = (
      harness: StorageContractHarness,
      objectKey: string,
    ): ObjectLocation => ({ bucket: harness.bucket, objectKey });

    it("put returns the stored object's facts, and head reads the same facts back", async () => {
      const harness = makeHarness();
      const body = bytesOf("a rose by any other name");
      const location = at(harness, "media/product/fo-bq-001-hero/640.avif");

      const stored = await harness.storage.put({
        ...location,
        body,
        mime: "image/avif",
      });
      const expected = {
        bucket: harness.bucket,
        objectKey: "media/product/fo-bq-001-hero/640.avif",
        mime: "image/avif",
        bytes: body.byteLength,
        checksumSha256: sha256(body),
      };
      expect(stored).toEqual(expected);
      expect(await harness.storage.head(location)).toEqual(expected);
    });

    it("head is null for a key that was never written", async () => {
      const harness = makeHarness();
      expect(
        await harness.storage.head(at(harness, "originals/product/absent")),
      ).toBeNull();
    });

    it("accepts a declared checksum that matches the body", async () => {
      const harness = makeHarness();
      const body = bytesOf("tulips");
      const location = at(harness, "originals/product/tulips");
      const stored = await harness.storage.put({
        ...location,
        body,
        mime: "image/png",
        checksumSha256: sha256(body),
      });
      expect(stored.checksumSha256).toBe(sha256(body));
    });

    it("rejects a declared checksum that does not match, and stores nothing", async () => {
      const harness = makeHarness();
      const location = at(harness, "originals/product/peonies");
      await expect(
        harness.storage.put({
          ...location,
          body: bytesOf("peonies"),
          mime: "image/png",
          checksumSha256: sha256(bytesOf("not peonies")),
        }),
      ).rejects.toBeInstanceOf(StorageIntegrityError);
      expect(await harness.storage.head(location)).toBeNull();
    });

    it("overwrites on a second put, and head reports the new bytes", async () => {
      const harness = makeHarness();
      const location = at(harness, "media/brand/logo/384.webp");
      await harness.storage.put({
        ...location,
        body: bytesOf("first"),
        mime: "image/webp",
      });
      const second = bytesOf("second, longer");
      await harness.storage.put({
        ...location,
        body: second,
        mime: "image/webp",
      });
      expect(await harness.storage.head(location)).toMatchObject({
        bytes: second.byteLength,
        checksumSha256: sha256(second),
      });
    });

    it("serves exactly the stored bytes, with their type, through a signed URL", async () => {
      const harness = makeHarness();
      const body = bytesOf("gerberas in a jar");
      const location = at(harness, "media/product/fo-bq-002-hero/828.webp");
      await harness.storage.put({ ...location, body, mime: "image/webp" });

      const url = await harness.storage.getSignedUrl(location, 300);
      const response = await harness.fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
    });

    it("signs a URL that reads nothing when the object does not exist", async () => {
      const harness = makeHarness();
      const url = await harness.storage.getSignedUrl(
        at(harness, "originals/partner/absent"),
        60,
      );
      expect((await harness.fetch(url)).status).toBe(404);
    });

    it("refuses a signed URL whose key was edited to point at another object", async () => {
      const harness = makeHarness();
      const open = at(harness, "media/product/public-one/384.webp");
      const other = at(harness, "media/product/other-one/384.webp");
      await harness.storage.put({
        ...open,
        body: bytesOf("a"),
        mime: "image/webp",
      });
      await harness.storage.put({
        ...other,
        body: bytesOf("b"),
        mime: "image/webp",
      });

      const url = await harness.storage.getSignedUrl(open, 300);
      expect((await harness.fetch(url)).status).toBe(200);
      const edited = url.replace("public-one", "other-one");
      expect(edited).not.toBe(url);
      expect((await harness.fetch(edited)).status).toBe(403);
    });

    it("bounds the TTL to 1 s … 7 days, in whole seconds", async () => {
      const harness = makeHarness();
      const location = at(harness, "originals/brand/ttl");
      for (const ttl of [
        0,
        -1,
        1.5,
        Number.NaN,
        MAX_SIGNED_URL_TTL_SECONDS + 1,
      ]) {
        await expect(
          harness.storage.getSignedUrl(location, ttl),
          String(ttl),
        ).rejects.toBeInstanceOf(RangeError);
      }
      expect(MAX_SIGNED_URL_TTL_SECONDS).toBe(604_800);
      await expect(
        harness.storage.getSignedUrl(location, MAX_SIGNED_URL_TTL_SECONDS),
      ).resolves.toEqual(expect.any(String));
      await expect(harness.storage.getSignedUrl(location, 1)).resolves.toEqual(
        expect.any(String),
      );
    });

    it("delete removes the object, the signed URL stops reading it, and a second delete is a no-op", async () => {
      const harness = makeHarness();
      const location = at(harness, "originals/delivery_proof/one");
      await harness.storage.put({
        ...location,
        body: bytesOf("doorstep"),
        mime: "image/jpeg",
      });
      const url = await harness.storage.getSignedUrl(location, 300);

      await harness.storage.delete(location);
      expect(await harness.storage.head(location)).toBeNull();
      expect((await harness.fetch(url)).status).toBe(404);
      await expect(harness.storage.delete(location)).resolves.toBeUndefined();
    });

    it("refuses a location outside the key and bucket alphabets before touching storage", async () => {
      const harness = makeHarness();
      for (const objectKey of ["/leading-slash", "Upper/case", "", "a b"]) {
        await expect(
          harness.storage.put({
            bucket: harness.bucket,
            objectKey,
            body: bytesOf("x"),
            mime: "image/png",
          }),
          objectKey,
        ).rejects.toThrow();
      }
      await expect(
        harness.storage.put({
          bucket: "Not_A_Bucket",
          objectKey: "originals/product/x",
          body: bytesOf("x"),
          mime: "image/png",
        }),
      ).rejects.toThrow();
      await expect(
        harness.storage.put({
          bucket: harness.bucket,
          objectKey: "originals/product/x",
          body: bytesOf("x"),
          mime: "not a mime",
        }),
      ).rejects.toThrow();
    });

    it("keeps buckets apart: the same key in two buckets is two objects", async (context) => {
      const harness = makeHarness();
      if (harness.otherBucket === undefined) {
        context.skip();
        return;
      }
      const key = "originals/product/shared";
      await harness.storage.put({
        bucket: harness.bucket,
        objectKey: key,
        body: bytesOf("one"),
        mime: "image/png",
      });
      expect(
        await harness.storage.head({
          bucket: harness.otherBucket,
          objectKey: key,
        }),
      ).toBeNull();
    });

    it("stops serving a signed URL once its TTL has passed", async (context) => {
      const harness = makeHarness();
      if (harness.advanceSeconds === undefined) {
        context.skip();
        return;
      }
      const location = at(harness, "media/product/expiring/384.avif");
      await harness.storage.put({
        ...location,
        body: bytesOf("x"),
        mime: "image/avif",
      });
      const url = await harness.storage.getSignedUrl(location, 60);

      harness.advanceSeconds(60);
      expect((await harness.fetch(url)).status).toBe(200);
      harness.advanceSeconds(1);
      expect((await harness.fetch(url)).status).toBe(403);
    });
  });
}
