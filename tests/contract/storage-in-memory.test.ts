/**
 * `InMemoryStorage` against the shared `Storage` contract (spec 002 §5.2, AC-22, T-22; TASK-017).
 *
 * The fake is what every test that needs storage uses, so it must behave like R2 in everything a
 * caller can observe: the facts `head` returns, the bytes a signed URL serves, the 403 on an
 * edited or expired URL, the 404 after a delete. TASK-082 calls the same function with the R2
 * implementation (spec 006 T-24). No network: the fake signs URLs it serves itself, on a host
 * under `.invalid` that no resolver answers.
 */
import { describe, expect, it } from "vitest";

import { InMemoryStorage, type Storage } from "../../src/lib/storage.ts";

import { describeStorageContract } from "./support/storage-contract.ts";

function harness() {
  let now = Date.parse("2026-10-04T09:00:00Z");
  const storage = new InMemoryStorage({ now: () => new Date(now) });
  return {
    storage,
    fetch: (url: string) => storage.fetch(url),
    bucket: "fo-media-test",
    otherBucket: "fo-backups-test",
    advanceSeconds: (seconds: number) => {
      now += seconds * 1000;
    },
  };
}

describeStorageContract("InMemoryStorage", harness);

describe("InMemoryStorage — what the fake adds for tests", () => {
  it("is a Storage", () => {
    const storage: Storage = new InMemoryStorage();
    expect(typeof storage.objectKey).toBe("function");
  });

  it("signs on the reserved .invalid host, so a leaked URL can never reach a real bucket", async () => {
    const storage = new InMemoryStorage();
    const url = new URL(
      await storage.getSignedUrl(
        { bucket: "fo-media-test", objectKey: "originals/product/a" },
        60,
      ),
    );
    expect(url.hostname.endsWith(".invalid")).toBe(true);
  });

  it("does not share objects or signing keys between instances", async () => {
    const first = new InMemoryStorage();
    const second = new InMemoryStorage();
    const location = {
      bucket: "fo-media-test",
      objectKey: "originals/product/a",
    };
    await first.put({
      ...location,
      body: new Uint8Array([1]),
      mime: "image/png",
    });
    expect(await second.head(location)).toBeNull();
    // Same object in both, so only the signing key can tell the two apart.
    await second.put({
      ...location,
      body: new Uint8Array([1]),
      mime: "image/png",
    });
    const url = await first.getSignedUrl(location, 60);
    expect((await first.fetch(url)).status).toBe(200);
    expect((await second.fetch(url)).status).toBe(403);
  });

  it("returns a copy of the body, so a caller mutating its buffer cannot change the stored bytes", async () => {
    const storage = new InMemoryStorage();
    const body = new Uint8Array([1, 2, 3]);
    const location = {
      bucket: "fo-media-test",
      objectKey: "originals/product/a",
    };
    const before = await storage.put({ ...location, body, mime: "image/png" });
    body[0] = 9;
    expect(await storage.head(location)).toEqual(before);
    const response = await storage.fetch(
      await storage.getSignedUrl(location, 60),
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("signs the expiry: a URL whose expiry segment was raised is refused", async () => {
    let now = Date.parse("2026-10-04T09:00:00Z");
    const storage = new InMemoryStorage({ now: () => new Date(now) });
    const location = {
      bucket: "fo-media-test",
      objectKey: "originals/product/a",
    };
    await storage.put({
      ...location,
      body: new Uint8Array([1]),
      mime: "image/png",
    });
    const url = await storage.getSignedUrl(location, 60);
    const expires = now + 60_000;
    expect(url).toContain(`/${String(expires)}/`);
    const raised = url.replace(
      `/${String(expires)}/`,
      `/${String(expires + 86_400_000)}/`,
    );
    expect(raised).not.toBe(url);

    expect((await storage.fetch(url)).status).toBe(200);
    expect((await storage.fetch(raised)).status).toBe(403);
    now += 3_600_000;
    expect((await storage.fetch(url)).status).toBe(403);
    expect((await storage.fetch(raised)).status).toBe(403);
  });

  it("signs the bucket: a URL signed for one bucket does not read the same key in another", async () => {
    const storage = new InMemoryStorage();
    const objectKey = "originals/partner/statement-1";
    await storage.put({
      bucket: "fo-media-test",
      objectKey,
      body: new Uint8Array([1]),
      mime: "application/pdf",
    });
    await storage.put({
      bucket: "fo-private-test",
      objectKey,
      body: new Uint8Array([2]),
      mime: "application/pdf",
    });
    const url = await storage.getSignedUrl(
      { bucket: "fo-media-test", objectKey },
      60,
    );
    const swapped = url.replace(
      "//fo-media-test.storage.invalid/",
      "//fo-private-test.storage.invalid/",
    );
    expect(swapped).not.toBe(url);

    const own = await storage.fetch(url);
    expect(own.status).toBe(200);
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(
      new Uint8Array([1]),
    );
    expect((await storage.fetch(swapped)).status).toBe(403);
  });

  it("returns a copy from head, so a caller mutating the facts cannot change the stored ones", async () => {
    const storage = new InMemoryStorage();
    const location = {
      bucket: "fo-media-test",
      objectKey: "originals/product/a",
    };
    const stored = await storage.put({
      ...location,
      body: new Uint8Array([1, 2]),
      mime: "image/png",
    });
    const first = await storage.head(location);
    expect(first).toEqual(stored);
    if (first !== null) first.bytes = 999;
    expect(await storage.head(location)).toEqual(stored);
  });

  it("answers 400 to a URL it did not sign", async () => {
    const storage = new InMemoryStorage();
    expect((await storage.fetch("https://example.com/x")).status).toBe(400);
  });
});
