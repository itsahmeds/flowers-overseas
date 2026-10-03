/**
 * Minimal row builders for the schema suites (spec 002 §10; TASK-017 … TASK-023).
 *
 * Each builder inserts the fewest columns its table's constraints allow and returns the id, so a
 * test reads as the property it checks rather than as a page of `INSERT`s. They run as whatever
 * role the transaction is in — normally the server's owner role, before `asApp()` narrows it.
 * Values are fixed and obviously fake: no real person, address or phone number appears here
 * (`CLAUDE.md`: no PII), and phone numbers are from the reserved drama ranges.
 */
import { randomUUID } from "node:crypto";

import type { Tx } from "./scratch-db.ts";

let counter = 0;
/** A short unique token for natural keys inside one database. */
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${String(counter)}${randomUUID().slice(0, 6)}`;
}

/** The two-row currency/locale base most tables need. Idempotent within a database. */
export async function base(tx: Tx): Promise<void> {
  await tx`INSERT INTO currency (code, minor_unit_exponent) VALUES ('EUR', 2), ('PLN', 2), ('GBP', 2)
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English'), ('pl', 'pl-PL', 'Polski')
           ON CONFLICT DO NOTHING`;
}

export async function country(tx: Tx, iso2?: string): Promise<string> {
  await base(tx);
  const code =
    iso2 ??
    String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
      String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO country (iso2, currency_code, vat_rate_bp, iana_zone)
    VALUES (${code}, 'PLN', 800, 'Europe/Warsaw')
    ON CONFLICT (iso2) DO UPDATE SET iso2 = EXCLUDED.iso2
    RETURNING id`;
  return row?.id ?? "";
}

export async function city(tx: Tx, countryId: string): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO city (country_id) VALUES (${countryId}) RETURNING id`;
  return row?.id ?? "";
}

export async function product(tx: Tx): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${unique("SKU-")}, 'bouquet', 'rose', 'red', 'classic', 'classic', 'roses', 7)
    RETURNING id`;
  return row?.id ?? "";
}

export interface AssetOptions {
  readonly kind?: string;
  readonly visibility?: "public" | "private";
  readonly exifStripped?: boolean;
  readonly depicts?: string;
  readonly source?: string;
}

export async function mediaAsset(
  tx: Tx,
  options: AssetOptions = {},
): Promise<string> {
  const id = randomUUID();
  const kind = options.kind ?? "product";
  const prefix = kind === "delivery_proof" ? "delivery-proof" : kind;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
                             checksum_sha256, visibility, source, depicts, exif_stripped)
    VALUES (${id}, ${kind}, 'fo-media-test', ${`${prefix}/${id}/original`}, 'image/jpeg', 1200, 1500,
            48213, ${"a".repeat(64)}, ${options.visibility ?? "public"},
            ${options.source ?? "photo"}, ${options.depicts ?? "product"},
            ${options.exifStripped ?? true})
    RETURNING id`;
  return row?.id ?? "";
}
