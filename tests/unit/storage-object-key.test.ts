/**
 * `objectKey(kind, id, variant)` — T-22's first half (spec 002 §5.2, AC-22; TASK-017).
 *
 * Three properties, each asserted so that removing it turns a case red:
 *
 *  - **determinism** — the same triple gives the same key, from the pure function, from every
 *    `Storage` instance and on every call, and the key equals the committed fixture exactly;
 *  - **collision-freedom** — over an adversarial table of triples (ids that are prefixes of one
 *    another, ids that look like variants, every kind against every id, every format against
 *    every width) the number of distinct keys equals the number of distinct triples;
 *  - **refusal** — a triple outside the convention (an id that is not one path segment, a
 *    variant shape the kind does not take, a date that does not exist) throws instead of
 *    producing a key that would collide with a valid one.
 *
 * And one cross-module agreement: every key satisfies `ObjectKeySchema` (`seed/schema/media.ts`,
 * the alphabet spec 006's manifests validate) and the `media_asset_object_key_check` pattern of
 * migration `0004`, so a key this function mints is a key both the seed and the database accept.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ObjectKeySchema } from "../../seed/schema/media.ts";
import {
  InMemoryStorage,
  OBJECT_KEY_PATTERN,
  objectKey,
  objectKinds,
  StorageKeyError,
  type ObjectKind,
  type VariantRef,
} from "../../src/lib/storage.ts";
import { OBJECT_KEY_FIXTURES } from "../contract/support/object-key-fixtures.ts";

const MEDIA_KINDS = objectKinds.filter(
  (kind): kind is Exclude<ObjectKind, "backup"> => kind !== "backup",
);

describe("objectKey — the convention of spec 002 §5.2 (AC-22, T-22)", () => {
  it("covers the five kinds of §5.2's ObjectKind, in its order", () => {
    expect([...objectKinds]).toEqual([
      "product",
      "delivery_proof",
      "brand",
      "partner",
      "backup",
    ]);
  });

  describe("determinism", () => {
    it.each(OBJECT_KEY_FIXTURES.map((row) => [row.key, row] as const))(
      "maps its fixture triple to exactly %s",
      (_key, row) => {
        expect(objectKey(row.kind, row.id, row.variant)).toBe(row.key);
      },
    );

    it("gives the same key on every call and from every Storage instance", () => {
      const first = new InMemoryStorage();
      const second = new InMemoryStorage();
      for (const row of OBJECT_KEY_FIXTURES) {
        const keys = new Set([
          objectKey(row.kind, row.id, row.variant),
          objectKey(row.kind, row.id, row.variant),
          first.objectKey(row.kind, row.id, row.variant),
          second.objectKey(row.kind, row.id, row.variant),
        ]);
        expect([...keys]).toEqual([row.key]);
      }
    });

    it("does not read the variant object's key order", () => {
      expect(
        objectKey("product", "fo-pl-008-hero", {
          format: "webp",
          variant: "828",
        } as VariantRef),
      ).toBe("media/product/fo-pl-008-hero/828.webp");
    });
  });

  describe("collision-freedom", () => {
    // Ids chosen to break a careless encoding: prefixes of one another, an id that ends in what
    // another id's variant looks like, a uuid, a single character, and an id equal to a kind.
    const ids = [
      "a",
      "a-b",
      "a-b-c",
      "b",
      "640",
      "a-640",
      "product",
      "original",
      "fo-bq-001-hero",
      "fo-bq-001",
      "3f1c6a52-8e0b-4d7a-9b8e-2a1f0c9d4e7b",
    ];
    const variants: VariantRef[] = [
      "original",
      ...["384", "640", "1080", "a", "original"].flatMap((variant) =>
        (["avif", "webp", "jpeg"] as const).map((format) => ({
          variant,
          format,
        })),
      ),
    ];

    it("mints one distinct key per distinct (kind, id, variant) over the media kinds", () => {
      const keys = new Map<string, string>();
      let triples = 0;
      for (const kind of MEDIA_KINDS) {
        for (const id of ids) {
          for (const variant of variants) {
            triples += 1;
            const key = objectKey(kind, id, variant);
            const triple = JSON.stringify([kind, id, variant]);
            expect(keys.get(key), `${triple} collides`).toBeUndefined();
            keys.set(key, triple);
          }
        }
      }
      expect(keys.size).toBe(triples);
      expect(triples).toBe(MEDIA_KINDS.length * ids.length * variants.length);
    });

    it("keeps backups apart from each other and from every media key", () => {
      const media = new Set(
        MEDIA_KINDS.flatMap((kind) =>
          ids.flatMap((id) =>
            variants.map((variant) => objectKey(kind, id, variant)),
          ),
        ),
      );
      const backups = new Set<string>();
      for (const day of ["2026-10-04", "2026-10-05", "2027-01-04"]) {
        for (const file of ["fo.dump", "fo-2.dump", "original"]) {
          const key = objectKey("backup", day, { file });
          expect(media.has(key), key).toBe(false);
          backups.add(key);
        }
      }
      expect(backups.size).toBe(9);
    });

    it("separates every pair of kinds for the same id and variant", () => {
      const keys = MEDIA_KINDS.map((kind) =>
        objectKey(kind, "same-id", { variant: "640", format: "avif" }),
      );
      expect(new Set(keys).size).toBe(MEDIA_KINDS.length);
      const originals = MEDIA_KINDS.map((kind) =>
        objectKey(kind, "same-id", "original"),
      );
      expect(new Set(originals).size).toBe(MEDIA_KINDS.length);
    });
  });

  describe("refusal — a triple outside the convention never becomes a key", () => {
    it.each([
      ["an empty id", "product", "", "original"],
      ["an uppercase id", "product", "Fo-Bq-001", "original"],
      ["an id with a slash", "product", "a/b", "original"],
      ["an id with a dot", "product", "a.b", "original"],
      ["an id with a traversal", "product", "..", "original"],
      ["a leading hyphen", "product", "-a", "original"],
      ["a trailing hyphen", "product", "a-", "original"],
      ["a double hyphen", "product", "a--b", "original"],
      ["a 129-character id", "product", "a".repeat(129), "original"],
      ["an unknown kind", "invoice", "a", "original"],
      ["a backup with an original", "backup", "2026-10-04", "original"],
      [
        "a backup with a derived variant",
        "backup",
        "2026-10-04",
        { variant: "640", format: "avif" },
      ],
      ["a media file reference", "product", "a", { file: "x.dump" }],
      ["a backup with a slug id", "backup", "nightly", { file: "x.dump" }],
      ["a backup on 30 February", "backup", "2026-02-30", { file: "x.dump" }],
      ["a backup on month 13", "backup", "2026-13-01", { file: "x.dump" }],
      ["a backup file with a slash", "backup", "2026-10-04", { file: "a/b" }],
      ["a backup file with ..", "backup", "2026-10-04", { file: "a..dump" }],
      ["an unknown format", "product", "a", { variant: "640", format: "png" }],
      [
        "a variant with a dot",
        "product",
        "a",
        { variant: "640.avif", format: "avif" },
      ],
      ["an empty variant", "product", "a", { variant: "", format: "avif" }],
      [
        "an extra variant field",
        "product",
        "a",
        { variant: "640", format: "avif", file: "x" },
      ],
    ] as const)("rejects %s", (_label, kind, id, variant) => {
      expect(() =>
        objectKey(kind as ObjectKind, id, variant as unknown as VariantRef),
      ).toThrow(StorageKeyError);
    });

    it("accepts the longest id the convention allows", () => {
      expect(objectKey("brand", "a".repeat(128), "original")).toBe(
        `originals/brand/${"a".repeat(128)}`,
      );
    });

    it("names the offending field and never echoes the value", () => {
      let message = "";
      try {
        objectKey("product", "Secret/Value", "original");
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message).toContain("id");
      expect(message).not.toContain("Secret/Value");
    });
  });

  describe("agreement with the seed schema and migration 0004", () => {
    const forward = readFileSync(
      join(process.cwd(), "db", "migrations", "0004_media.sql"),
      "utf8",
    );

    it("uses the same key alphabet as media_asset_object_key_check", () => {
      expect(forward).toContain(
        `media_asset_object_key_check CHECK (object_key ~ '${OBJECT_KEY_PATTERN}')`,
      );
      expect(forward).toContain(
        `media_variant_object_key_check CHECK (object_key ~ '${OBJECT_KEY_PATTERN}')`,
      );
    });

    it("mints only keys that ObjectKeySchema and the database pattern accept", () => {
      const pattern = new RegExp(OBJECT_KEY_PATTERN);
      for (const row of OBJECT_KEY_FIXTURES) {
        expect(ObjectKeySchema.safeParse(row.key).success, row.key).toBe(true);
        expect(pattern.test(row.key), row.key).toBe(true);
      }
    });
  });
});
