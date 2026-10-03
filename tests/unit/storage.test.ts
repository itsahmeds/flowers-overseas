/**
 * T-22 — the storage seam (spec 002 §5.2, AC-22; TASK-017).
 *
 * `objectKey()` is deterministic and collision-free over a table of (kind, id, variant) triples,
 * and `InMemoryStorage` satisfies the `Storage` contract: put → head → signed URL → read →
 * delete round trip. The same contract is what spec 006's R2 implementation must pass (spec 006
 * AC-24), so the assertions are about observable behaviour, not about the fake's internals.
 */
import { describe, expect, it } from "vitest";

import {
  InMemoryStorage,
  OBJECT_KEY_PREFIX,
  ObjectKey,
  ObjectKind,
  objectKey,
  parseObjectKey,
  sha256Hex,
  type Storage,
} from "../../src/lib/storage";

const ID_A = "3f1b7f0e-8a52-4c1e-9d0a-2b6f0c9e1a11";
const ID_B = "9a0c2d4e-1b3f-4e5a-8c7d-6f5e4d3c2b1a";

/** The table T-22 names: every kind, two ids, three variants, plus spec 006's SKU-style ids. */
const TRIPLES: readonly [ObjectKind, string, string][] = [
  ...ObjectKind.options
    .filter((kind) => kind !== "backup")
    .flatMap((kind) =>
      [ID_A, ID_B, "bq-001-hero", "bq-001"].flatMap((id) =>
        ["original", "640", "1280"].map(
          (variant) => [kind, id, variant] as [ObjectKind, string, string],
        ),
      ),
    ),
  ["backup", "2026-10-03", "fo.dump"],
  ["backup", "2026-10-04", "fo.dump"],
  ["backup", "2026-10-03", "fo-schema.dump"],
];

describe("objectKey() — the key convention (AC-22 / T-22)", () => {
  it("builds the documented key for each kind", () => {
    expect(objectKey("product", ID_A, "640")).toBe(`product/${ID_A}/640`);
    expect(objectKey("delivery_proof", ID_A, "original")).toBe(
      `delivery-proof/${ID_A}/original`,
    );
    expect(objectKey("brand", "logo", "original")).toBe("brand/logo/original");
    expect(objectKey("partner", ID_B, "original")).toBe(
      `partner/${ID_B}/original`,
    );
    expect(objectKey("backup", "2026-10-03", "fo.dump")).toBe(
      "backups/2026/10/03/fo.dump",
    );
  });

  it("is deterministic: the same triple always gives the same key", () => {
    for (const [kind, id, variant] of TRIPLES) {
      expect(objectKey(kind, id, variant)).toBe(objectKey(kind, id, variant));
    }
  });

  it("is collision-free: distinct triples give distinct keys, and each key parses back to its triple", () => {
    const keys = TRIPLES.map(([kind, id, variant]) =>
      objectKey(kind, id, variant),
    );
    expect(new Set(keys).size).toBe(TRIPLES.length);
    for (const [index, [kind, id, variant]] of TRIPLES.entries()) {
      expect(parseObjectKey(keys[index] ?? "")).toEqual({ kind, id, variant });
    }
  });

  it("gives every kind its own first segment", () => {
    const prefixes = Object.values(OBJECT_KEY_PREFIX);
    expect(new Set(prefixes).size).toBe(ObjectKind.options.length);
  });

  it("produces keys inside the alphabet migration 0004 checks", () => {
    const databasePattern = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;
    for (const [kind, id, variant] of TRIPLES) {
      const key = objectKey(kind, id, variant);
      expect(key).toMatch(databasePattern);
      expect(key).not.toContain("..");
      expect(ObjectKey.safeParse(key).success).toBe(true);
    }
  });

  it.each([
    ["an id with a slash", "product", "a/b", "640"],
    ["a variant with a slash", "product", ID_A, "640/x"],
    ["a parent-directory id", "product", "..", "640"],
    ["an id with ..", "product", "a..b", "640"],
    ["an upper-case id", "product", "ABC", "640"],
    ["an empty variant", "product", ID_A, ""],
    ["a leading-dot variant", "product", ID_A, ".hidden"],
    ["a backup id that is not a date", "backup", "latest", "fo.dump"],
    ["a backup id that is not a real date", "backup", "2026-02-30", "fo.dump"],
    ["an unknown kind", "invoice", ID_A, "pdf"],
  ])("refuses %s", (_label, kind, id, variant) => {
    expect(() => objectKey(kind as ObjectKind, id, variant)).toThrow();
  });

  it("returns null when parsing a key the convention cannot have produced", () => {
    expect(parseObjectKey("product/only-two")).toBeNull();
    expect(parseObjectKey("unknown/a/b")).toBeNull();
    expect(parseObjectKey("backups/2026/13/01/fo.dump")).toBeNull();
    expect(parseObjectKey("/product/a/b")).toBeNull();
  });
});

/** The contract any `Storage` must satisfy; run here against the fake, in spec 006 against R2. */
async function contract(storage: Storage): Promise<void> {
  const key = storage.objectKey("product", ID_A, "original");
  const body = new TextEncoder().encode("not really a jpeg");

  expect(await storage.head(key)).toBeNull();

  const stored = await storage.put({
    objectKey: key,
    mime: "image/jpeg",
    body,
  });
  expect(stored).toEqual({
    bucket: storage.bucket,
    objectKey: key,
    mime: "image/jpeg",
    bytes: body.byteLength,
    checksumSha256: await sha256Hex(body),
  });
  expect(await storage.head(key)).toEqual(stored);

  const url = await storage.getSignedUrl(key, 300);
  expect(url).toContain(key);

  await storage.delete(key);
  expect(await storage.head(key)).toBeNull();
  // Deleting an absent key is not an error (S3 semantics).
  await expect(storage.delete(key)).resolves.toBeUndefined();
}

describe("InMemoryStorage — the Storage contract (AC-22 / T-22)", () => {
  it("passes the put → head → signed URL → delete round trip", async () => {
    await contract(new InMemoryStorage("fo-media-test"));
  });

  it("stores a copy: mutating the caller's buffer after put changes nothing", async () => {
    const storage = new InMemoryStorage("fo-media-test");
    const key = storage.objectKey("brand", "logo", "original");
    const body = new Uint8Array([1, 2, 3]);
    const stored = await storage.put({
      objectKey: key,
      mime: "image/png",
      body,
    });
    body[0] = 9;
    expect(storage.read(key)).toEqual(new Uint8Array([1, 2, 3]));
    expect(stored.checksumSha256).toBe(
      await sha256Hex(new Uint8Array([1, 2, 3])),
    );
  });

  it("replaces the object on a second put under the same key", async () => {
    const storage = new InMemoryStorage("fo-media-test");
    const key = storage.objectKey("product", ID_B, "640");
    await storage.put({
      objectKey: key,
      mime: "image/avif",
      body: new Uint8Array([1]),
    });
    const second = await storage.put({
      objectKey: key,
      mime: "image/avif",
      body: new Uint8Array([1, 2]),
    });
    expect(await storage.head(key)).toEqual(second);
    expect(second.bytes).toBe(2);
  });

  it("computes the SHA-256 of the bytes, not of anything else", async () => {
    // The well-known digest of the empty input.
    expect(await sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("signs a URL that expires ttl seconds after now", async () => {
    const storage = new InMemoryStorage("fo-media-test", {
      now: () => 1_000_000,
    });
    const key = storage.objectKey("delivery_proof", ID_A, "original");
    await storage.put({
      objectKey: key,
      mime: "image/jpeg",
      body: new Uint8Array([7]),
    });
    expect(await storage.getSignedUrl(key, 60)).toBe(
      `memory://fo-media-test/${key}?expires=${String(1_000 + 60)}`,
    );
  });

  it("refuses a signed URL for an absent object and a TTL outside 1 s … 7 days", async () => {
    const storage = new InMemoryStorage("fo-media-test");
    const key = storage.objectKey("product", ID_A, "640");
    await expect(storage.getSignedUrl(key, 60)).rejects.toThrow();
    await storage.put({
      objectKey: key,
      mime: "image/webp",
      body: new Uint8Array([1]),
    });
    await expect(storage.getSignedUrl(key, 0)).rejects.toThrow();
    await expect(storage.getSignedUrl(key, 604_801)).rejects.toThrow();
    await expect(storage.getSignedUrl(key, 604_800)).resolves.toContain(key);
  });

  it("refuses a key outside the alphabet at every method", async () => {
    const storage = new InMemoryStorage("fo-media-test");
    await expect(
      storage.put({
        objectKey: "../etc/passwd",
        mime: "image/png",
        body: new Uint8Array(),
      }),
    ).rejects.toThrow();
    await expect(storage.head("/leading-slash")).rejects.toThrow();
    await expect(storage.delete("Upper/Case")).rejects.toThrow();
  });

  it("refuses a bucket name R2 would refuse", () => {
    expect(() => new InMemoryStorage("Not_A_Bucket")).toThrow();
  });
});
