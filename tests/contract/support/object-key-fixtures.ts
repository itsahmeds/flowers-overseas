/**
 * The object-key convention of spec 002 §5.2, written down as data (AC-22, T-22; TASK-017).
 *
 * `objectKey(kind, id, variant)` is the one place an R2 key is decided. These rows are the
 * convention's fixtures: `tests/unit/storage-object-key.test.ts` asserts the pure function
 * against them, and spec 006's T-24 ("`objectKey()` matches spec 002's fixtures") asserts the R2
 * implementation against the same rows, so the two cannot drift apart.
 *
 * The convention, one line per shape:
 *
 *   originals/{kind}/{id}                       an original, as uploaded (`variant: "original"`)
 *   media/{kind}/{id}/{variant}.{format}        a derived variant (`{ variant, format }`)
 *   backups/{yyyy}/{mm}/{dd}/{file}             a database dump (`kind: "backup"`, `id` a date)
 *
 * Three roots, so a bucket rule or a public-access policy can address originals, derived media
 * and dumps separately; the kind is a path segment, so two kinds never share a key.
 */
import type { ObjectKind, VariantRef } from "../../../src/lib/storage.ts";

export interface ObjectKeyFixture {
  readonly kind: ObjectKind;
  readonly id: string;
  readonly variant: VariantRef;
  readonly key: string;
}

export const OBJECT_KEY_FIXTURES: readonly ObjectKeyFixture[] = [
  {
    kind: "product",
    id: "fo-bq-001-hero",
    variant: "original",
    key: "originals/product/fo-bq-001-hero",
  },
  {
    kind: "product",
    id: "fo-bq-001-hero",
    variant: { variant: "640", format: "avif" },
    key: "media/product/fo-bq-001-hero/640.avif",
  },
  {
    kind: "product",
    id: "fo-bq-001-hero",
    variant: { variant: "640", format: "webp" },
    key: "media/product/fo-bq-001-hero/640.webp",
  },
  {
    kind: "brand",
    id: "home-hero",
    variant: { variant: "1200", format: "jpeg" },
    key: "media/brand/home-hero/1200.jpeg",
  },
  {
    kind: "delivery_proof",
    id: "3f1c6a52-8e0b-4d7a-9b8e-2a1f0c9d4e7b",
    variant: "original",
    key: "originals/delivery_proof/3f1c6a52-8e0b-4d7a-9b8e-2a1f0c9d4e7b",
  },
  {
    kind: "partner",
    id: "kwiaciarnia-roza-krakow",
    variant: { variant: "384", format: "webp" },
    key: "media/partner/kwiaciarnia-roza-krakow/384.webp",
  },
  {
    kind: "backup",
    id: "2026-10-04",
    variant: { file: "flowers-overseas-20261004t021500z.dump" },
    key: "backups/2026/10/04/flowers-overseas-20261004t021500z.dump",
  },
];
