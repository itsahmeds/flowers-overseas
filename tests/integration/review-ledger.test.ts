/**
 * T-10, T-11 (integration half), T-12: the review ledger on a migrated scratch database (spec
 * 012b §2.4, §5.1 item 2, AC-10, AC-11, AC-12; migration `0019_review_attestation`; TASK-293).
 *
 *  - T-10 (AC-10): `UPDATE`, `DELETE` and `TRUNCATE` on the ledger raise; a raw write of
 *    `product_translation.reviewed` or `media_asset.review_state` raises `REVIEW_DIRECT_WRITE`;
 *    with `app.allow_review_write` on but no matching `approved` row written in the same
 *    transaction it raises `REVIEW_WITHOUT_ATTESTATION`; through `attest()` it succeeds and the
 *    row carries the attester's user id, `display_name`, the server's time, the value hash and the
 *    English source hash.
 *  - T-11 (AC-11): `attest()` refuses with zero rows written for a user without the locale grant
 *    (a `content` user holding `pl` approving `de` copy: 403), a blank `display_name`, a stale
 *    hash, a change request without a note, a photo without `media.review`, and a deactivated
 *    user.
 *  - T-12 (AC-12): the product copy hash changes when, and only when, one of the six hashed parts
 *    changes in that locale; the SQL and the TypeScript hash agree; after such a change the
 *    locale is unreviewed (`edited`), a new approval restores it, and an English-only change keeps
 *    it reviewed but stale.
 *
 * `attest()` runs through the real `withAdminContext` of `src/lib/db.ts`, pointed at the scratch
 * database, so its transaction, role switch and session variables are production's.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { productCopyHash } from "../../src/modules/i18n/attestation.ts";
import { attest, reviewState } from "../../src/modules/i18n/db/ledger.ts";
import { unique } from "./support/rows.ts";
import {
  asApp,
  pgFailure,
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Sql,
  type Tx,
} from "./support/scratch-db.ts";

const target = vi.hoisted(() => ({ url: "" }));
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));
vi.mock("@/lib/sentry", () => ({ captureGuardError: () => undefined }));

const server = await probeLocalServer();

interface Fixture {
  readonly sku: string;
  readonly productId: string;
  readonly checksum: string;
  readonly founder: string;
  readonly nativePl: string;
  readonly opsUser: string;
  readonly blankName: string;
  readonly gone: string;
}

const hex = (seed: string): string =>
  Array.from(
    { length: 64 },
    (_, i) => "0123456789abcdef"[(seed.charCodeAt(i % seed.length) + i) % 16],
  ).join("");

async function user(
  sql: Sql,
  name: string,
  roles: readonly string[],
  locales: readonly string[],
  deactivated = false,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO users (email) VALUES (${`${unique("reviewer")}@example.test`}) RETURNING id`;
  const id = row?.id ?? "";
  await sql`INSERT INTO admin_profile (user_id, display_name, deactivated_at)
            VALUES (${id}, ${name}, ${deactivated ? new Date("2026-01-01T00:00:00Z") : null})`;
  for (const role of roles) {
    await sql`INSERT INTO user_role (user_id, role) VALUES (${id}, ${role})`;
  }
  for (const locale of locales) {
    await sql`INSERT INTO reviewer_locale (user_id, locale_code) VALUES (${id}, ${locale})`;
  }
  return id;
}

async function fixture(sql: Sql): Promise<Fixture> {
  await sql`INSERT INTO locale (code, bcp47, name) VALUES
              ('en', 'en', 'English'), ('pl', 'pl-PL', 'Polski'), ('de', 'de-DE', 'Deutsch'),
              ('en-gb', 'en-GB', 'English (UK)')
            ON CONFLICT DO NOTHING`;
  const sku = unique("ZZ-REV-");
  const [product] = await sql<{ id: string }[]>`
    INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                         substitution_class, freshness_days)
    VALUES (${sku}, 'bouquet', 'roses', 'red', 'classic', 'classic', 'main_flower', 5)
    RETURNING id`;
  const productId = product?.id ?? "";
  for (const [locale, name, slug] of [
    ["en", "Amber Hour", "amber-hour"],
    ["pl", "Bursztynowa godzina żółć", "bursztynowa-godzina"],
    ["de", "Bernsteinstunde", "bernsteinstunde"],
  ] as const) {
    await sql`INSERT INTO product_translation (product_id, locale_code, name, slug, description_md,
                                               seo_title, seo_description, translation_status)
              VALUES (${productId}, ${locale}, ${name}, ${`${slug}-${sku.toLowerCase()}`},
                      ${`${name} — opis 🌹`}, ${`${name} title`}, NULL, 'human')`;
  }
  const checksum = hex(sku);
  const assetId = randomUUID();
  await sql`INSERT INTO media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
                                     checksum_sha256, visibility, source, depicts, exif_stripped)
            VALUES (${assetId}, 'product', 'fo-media-test', ${`products/${assetId}/original`},
                    'image/jpeg', 1200, 1500, 48213, ${checksum}, 'public', 'ai', 'product', true)`;
  const [media] = await sql<{ id: string }[]>`
    INSERT INTO product_media (product_id, media_asset_id, is_primary) VALUES (${productId}, ${assetId}, true)
    RETURNING id`;
  for (const [locale, alt] of [
    ["en", "Orange roses in kraft paper"],
    ["pl", "Pomarańczowe róże w papierze"],
  ] as const) {
    await sql`INSERT INTO product_media_alt (product_media_id, locale_code, alt)
              VALUES (${media?.id ?? ""}, ${locale}, ${alt})`;
  }
  return {
    sku,
    productId,
    checksum,
    founder: await user(sql, "Founder Test", ["admin"], ["en", "en-gb"]),
    nativePl: await user(sql, "Native Reviewer", ["content"], ["pl"]),
    opsUser: await user(sql, "Ops Person", ["ops"], ["pl"]),
    blankName: await user(sql, "   ", ["admin"], ["pl"]),
    gone: await user(sql, "Former Reviewer", ["admin"], ["pl"], true),
  };
}

async function hashOf(
  sql: Sql | Tx,
  kind: string,
  ref: string,
  locale: string | null,
): Promise<string> {
  const [row] = await sql<{ hash: string | null }[]>`
    SELECT public.review_subject_hash(${kind}, ${ref}, ${locale}::text) AS hash`;
  if (row?.hash === null || row?.hash === undefined) {
    throw new Error(`no hash for ${kind} ${ref} ${String(locale)}`);
  }
  return row.hash;
}

async function ledgerCount(sql: Sql): Promise<number> {
  const [row] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM review_attestation`;
  return row?.n ?? 0;
}

/** The copy subject's six parts, read back as the TypeScript hash takes them. */
async function contentOf(sql: Sql, productId: string, locale: string) {
  const [t] = await sql<
    {
      name: string;
      slug: string;
      description_md: string | null;
      seo_title: string | null;
      seo_description: string | null;
    }[]
  >`SELECT name, slug, description_md, seo_title, seo_description FROM product_translation
    WHERE product_id = ${productId} AND locale_code = ${locale}`;
  const alts = await sql<{ checksum: string; alt: string }[]>`
    SELECT a.checksum_sha256 AS checksum, x.alt FROM product_media pm
    JOIN media_asset a ON a.id = pm.media_asset_id
    JOIN product_media_alt x ON x.product_media_id = pm.id AND x.locale_code = ${locale}
    WHERE pm.product_id = ${productId}`;
  if (t === undefined) throw new Error("no translation");
  return {
    name: t.name,
    slug: t.slug,
    descriptionMd: t.description_md,
    seoTitle: t.seo_title,
    seoDescription: t.seo_description,
    alts: alts.map((row) => ({ checksum: row.checksum, alt: row.alt })),
  };
}

describe.skipIf(server.url === undefined)(
  `the review ledger (spec 012b AC-10 – AC-12)${server.url === undefined ? ` — skipped: ${server.reason}` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let f: Fixture;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "review");
      target.url = scratch.url;
      f = await fixture(scratch.sql);
      // `attest()` loads its admin defaults on first use; load them here, outside any test's
      // time limit (the admin barrel is a large first transform).
      await Promise.all([
        import("@/lib/db"),
        import("@/modules/admin"),
        import("@/lib/logger"),
      ]);
    }, 120_000);

    afterAll(async () => {
      await scratch.drop();
    });

    describe("T-10 — the ledger is append-only and the review columns have one writer (AC-10)", () => {
      it("UPDATE, DELETE and TRUNCATE on review_attestation raise, for the server's own role too", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          await tx`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code, value_hash,
                     decision, attester_name, channel)
                   VALUES ('product_translation', ${f.sku}, 'en', ${"c".repeat(64)}, 'approved',
                           'founder', 'import')`;
          for (const statement of [
            (sp: Tx) => sp`UPDATE review_attestation SET decision = 'rejected'`,
            (sp: Tx) =>
              sp`UPDATE review_attestation SET attester_name = 'Reviewer 1'`,
            (sp: Tx) => sp`DELETE FROM review_attestation`,
            (sp: Tx) => sp`TRUNCATE review_attestation`,
          ]) {
            expect((await pgFailure(tx, statement)).raised).toBe(
              "REVIEW_LEDGER_APPEND_ONLY",
            );
          }
          // Not even the retention sweep's context may change anything but a signed-in
          // attester's name (this row has no user id).
          await asApp(tx, { role: "system" });
          await tx`SELECT set_config('app.retention_policy', 'review_attestation', true)`;
          expect(
            (
              await pgFailure(
                tx,
                (sp) =>
                  sp`UPDATE review_attestation SET attester_name = 'Reviewer 1'`,
              )
            ).raised,
          ).toBe("REVIEW_LEDGER_APPEND_ONLY");
        });
      });

      it("a raw write of reviewed or review_state raises REVIEW_DIRECT_WRITE, as the owner and as admin", async () => {
        await rolledBack(scratch.sql, async (tx) => {
          const direct = [
            (sp: Tx) =>
              sp`UPDATE product_translation SET reviewed = true WHERE product_id = ${f.productId} AND locale_code = 'en'`,
            (sp: Tx) =>
              sp`UPDATE product_translation SET reviewed_by = 'x' WHERE product_id = ${f.productId} AND locale_code = 'en'`,
            (sp: Tx) =>
              sp`UPDATE product_translation SET reviewed_at = now() WHERE product_id = ${f.productId} AND locale_code = 'en'`,
            (sp: Tx) =>
              sp`UPDATE media_asset SET review_state = 'approved', reviewed_by = 'x', reviewed_at = now()
                 WHERE checksum_sha256 = ${f.checksum}`,
            (sp: Tx) =>
              sp`UPDATE media_asset SET review_state = 'rejected' WHERE checksum_sha256 = ${f.checksum}`,
            (sp: Tx) =>
              sp`INSERT INTO media_asset (kind, bucket, object_key, mime, width, height, bytes,
                   checksum_sha256, visibility, source, depicts, review_state, reviewed_by, reviewed_at)
                 VALUES ('product', 'fo-media-test', ${`products/${randomUUID()}/o`}, 'image/jpeg',
                   10, 10, 10, ${"d".repeat(64)}, 'public', 'ai', 'product', 'approved', 'x', now())`,
          ];
          for (const statement of direct) {
            expect((await pgFailure(tx, statement)).raised).toBe(
              "REVIEW_DIRECT_WRITE",
            );
          }
          await asApp(tx, { role: "admin", userId: f.founder });
          for (const statement of direct.slice(0, 1)) {
            expect((await pgFailure(tx, statement)).raised).toBe(
              "REVIEW_DIRECT_WRITE",
            );
          }
        });
      });

      it("with the flag on, an approval needs an approved row for the current hash written in this transaction", async () => {
        const hash = await hashOf(
          scratch.sql,
          "product_translation",
          f.sku,
          "en",
        );
        // An approved row for the right hash, committed by an earlier transaction.
        await scratch.sql`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code,
                            value_hash, decision, attester_name, channel)
                          VALUES ('product_translation', ${f.sku}, 'en', ${hash}, 'approved',
                                  'earlier', 'import')`;
        await rolledBack(scratch.sql, async (tx) => {
          await tx`SELECT set_config('app.allow_review_write', 'on', true)`;
          const approve = (sp: Tx) =>
            sp`UPDATE product_translation SET reviewed = true, reviewed_by = 'x', reviewed_at = now()
               WHERE product_id = ${f.productId} AND locale_code = 'en'`;
          // No row in this transaction (only the earlier one).
          expect((await pgFailure(tx, approve)).raised).toBe(
            "REVIEW_WITHOUT_ATTESTATION",
          );
          // A row in this transaction, for another hash.
          await tx`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code,
                     value_hash, decision, attester_name, channel)
                   VALUES ('product_translation', ${f.sku}, 'en', ${"e".repeat(64)}, 'approved',
                           'x', 'import')`;
          expect((await pgFailure(tx, approve)).raised).toBe(
            "REVIEW_WITHOUT_ATTESTATION",
          );
          // A row in this transaction for the right hash, but a rejection.
          await tx`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code,
                     value_hash, decision, attester_name, channel)
                   VALUES ('product_translation', ${f.sku}, 'en', ${hash}, 'rejected', 'x', 'import')`;
          expect((await pgFailure(tx, approve)).raised).toBe(
            "REVIEW_WITHOUT_ATTESTATION",
          );
          // A photo approval with the flag and no row.
          expect(
            (
              await pgFailure(
                tx,
                (sp) =>
                  sp`UPDATE media_asset SET review_state = 'approved', reviewed_by = 'x', reviewed_at = now()
                     WHERE checksum_sha256 = ${f.checksum}`,
              )
            ).raised,
          ).toBe("REVIEW_WITHOUT_ATTESTATION");
          // The right row, written in a savepoint of this transaction, is accepted (the guard
          // reads "this transaction" through savepoints).
          await tx.savepoint(async (sp) => {
            await sp`INSERT INTO review_attestation (subject_kind, subject_ref, locale_code,
                       value_hash, decision, attester_name, channel)
                     VALUES ('product_translation', ${f.sku}, 'en', ${hash}, 'approved', 'x', 'import')`;
          });
          await approve(tx);
          // Un-reviewing needs the flag only.
          await tx`UPDATE product_translation SET reviewed = false, reviewed_by = 'x'
                   WHERE product_id = ${f.productId} AND locale_code = 'en'`;
        });
      });

      it("attest() succeeds and its row carries user id, display_name, server time, value hash and source hash", async () => {
        const valueHash = await hashOf(
          scratch.sql,
          "product_translation",
          f.sku,
          "pl",
        );
        const sourceHash = await hashOf(
          scratch.sql,
          "product_translation",
          f.sku,
          "en",
        );
        const [before] = await scratch.sql<
          { now: Date }[]
        >`SELECT clock_timestamp() AS now`;
        const outcome = await attest({
          channel: "admin",
          input: {
            userId: f.nativePl,
            subject: { kind: "product_translation", ref: f.sku, locale: "pl" },
            decision: "approved",
            valueHash,
          },
        });
        const [after] = await scratch.sql<
          { now: Date }[]
        >`SELECT clock_timestamp() AS now`;
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const [row] = await scratch.sql<
          {
            attester_user_id: string;
            attester_name: string;
            attested_at: Date;
            value_hash: string;
            source_hash: string;
            channel: string;
            locale_code: string;
            subject_ref: string;
          }[]
        >`SELECT attester_user_id, attester_name, attested_at, value_hash, source_hash, channel,
                 locale_code, subject_ref
          FROM review_attestation WHERE id = ${outcome.id}`;
        expect(row?.attester_user_id).toBe(f.nativePl);
        expect(row?.attester_name).toBe("Native Reviewer");
        expect(row?.value_hash).toBe(valueHash);
        expect(row?.source_hash).toBe(sourceHash);
        expect(row?.channel).toBe("admin");
        expect(row?.subject_ref).toBe(f.sku);
        expect(row?.locale_code).toBe("pl");
        expect(row?.attested_at.getTime()).toBeGreaterThanOrEqual(
          (before?.now.getTime() ?? 0) - 1,
        );
        expect(row?.attested_at.getTime()).toBeLessThanOrEqual(
          (after?.now.getTime() ?? 0) + 1,
        );
        const [mirror] = await scratch.sql<
          { reviewed: boolean; reviewed_by: string; reviewed_at: Date }[]
        >`SELECT reviewed, reviewed_by, reviewed_at FROM product_translation
          WHERE product_id = ${f.productId} AND locale_code = 'pl'`;
        expect(mirror?.reviewed).toBe(true);
        expect(mirror?.reviewed_by).toBe("Native Reviewer");
        expect(mirror?.reviewed_at.getTime()).toBe(row?.attested_at.getTime());
      });

      it("attest() approves a photo for a media.review holder, and its English copy carries no source hash", async () => {
        const photo = await attest({
          channel: "admin",
          input: {
            userId: f.founder,
            subject: { kind: "media_asset", ref: f.checksum },
            decision: "approved",
            valueHash: f.checksum,
          },
        });
        expect(photo.ok).toBe(true);
        const [asset] = await scratch.sql<
          { review_state: string; reviewed_by: string }[]
        >`
          SELECT review_state, reviewed_by FROM media_asset WHERE checksum_sha256 = ${f.checksum}`;
        expect(asset).toEqual({
          review_state: "approved",
          reviewed_by: "Founder Test",
        });

        const en = await attest({
          channel: "admin",
          input: {
            userId: f.founder,
            subject: { kind: "product_translation", ref: f.sku, locale: "en" },
            decision: "approved",
            valueHash: await hashOf(
              scratch.sql,
              "product_translation",
              f.sku,
              "en",
            ),
          },
        });
        expect(en.ok).toBe(true);
        if (!en.ok) return;
        const [row] = await scratch.sql<{ source_hash: string | null }[]>`
          SELECT source_hash FROM review_attestation WHERE id = ${en.id}`;
        expect(row?.source_hash).toBeNull();
      });
    });

    describe("T-11 — attest() refuses and writes nothing (AC-11)", () => {
      const cases: readonly [
        string,
        () => Parameters<typeof attest>[0],
        string,
        number,
      ][] = [
        [
          "a content user holding only pl approving de copy",
          () => ({
            channel: "admin",
            input: {
              userId: f.nativePl,
              subject: {
                kind: "product_translation",
                ref: f.sku,
                locale: "de",
              },
              decision: "approved",
              valueHash: "0".repeat(64),
            },
          }),
          "locale_not_granted",
          403,
        ],
        [
          "a blank display_name",
          () => ({
            channel: "admin",
            input: {
              userId: f.blankName,
              subject: {
                kind: "product_translation",
                ref: f.sku,
                locale: "pl",
              },
              decision: "approved",
              valueHash: "0".repeat(64),
            },
          }),
          "no_display_name",
          403,
        ],
        [
          "a deactivated reviewer",
          () => ({
            channel: "admin",
            input: {
              userId: f.gone,
              subject: {
                kind: "product_translation",
                ref: f.sku,
                locale: "pl",
              },
              decision: "approved",
              valueHash: "0".repeat(64),
            },
          }),
          "not_a_reviewer",
          403,
        ],
        [
          "a photo without media.review",
          () => ({
            channel: "admin",
            input: {
              userId: f.opsUser,
              subject: { kind: "media_asset", ref: f.checksum },
              decision: "approved",
              valueHash: f.checksum,
            },
          }),
          "permission_denied",
          403,
        ],
        [
          "a hash other than the one served now",
          () => ({
            channel: "admin",
            input: {
              userId: f.nativePl,
              subject: {
                kind: "product_translation",
                ref: f.sku,
                locale: "pl",
              },
              decision: "approved",
              valueHash: "f".repeat(64),
            },
          }),
          "stale_hash",
          409,
        ],
        [
          "a change request without a note",
          () => ({
            channel: "admin",
            input: {
              userId: f.nativePl,
              subject: {
                kind: "product_translation",
                ref: f.sku,
                locale: "pl",
              },
              decision: "changes_requested",
              valueHash: "f".repeat(64),
            },
          }),
          "note_required",
          422,
        ],
        [
          "a change request with a blank note",
          () => ({
            channel: "admin",
            input: {
              userId: f.nativePl,
              subject: {
                kind: "product_translation",
                ref: f.sku,
                locale: "pl",
              },
              decision: "changes_requested",
              valueHash: "f".repeat(64),
              note: "   ",
            },
          }),
          "note_required",
          422,
        ],
        [
          "a product that does not exist",
          () => ({
            channel: "admin",
            input: {
              userId: f.nativePl,
              subject: {
                kind: "product_translation",
                ref: "ZZ-NOPE",
                locale: "pl",
              },
              decision: "approved",
              valueHash: "f".repeat(64),
            },
          }),
          "unknown_subject",
          404,
        ],
      ];

      it.each(cases)("%s", async (_label, command, refusal, status) => {
        const rowsBefore = await ledgerCount(scratch.sql);
        const [mirrorBefore] = await scratch.sql<{ rows: unknown }[]>`
          SELECT json_agg(t ORDER BY locale_code) AS rows FROM product_translation t
          WHERE product_id = ${f.productId}`;
        const outcome = await attest(command());
        expect(outcome).toEqual({ ok: false, refusal, status });
        expect(await ledgerCount(scratch.sql)).toBe(rowsBefore);
        const [mirrorAfter] = await scratch.sql<{ rows: unknown }[]>`
          SELECT json_agg(t ORDER BY locale_code) AS rows FROM product_translation t
          WHERE product_id = ${f.productId}`;
        expect(mirrorAfter?.rows).toEqual(mirrorBefore?.rows);
      });

      it("the same pl user may request a change with a note, and that un-reviews the locale", async () => {
        const valueHash = await hashOf(
          scratch.sql,
          "product_translation",
          f.sku,
          "pl",
        );
        const outcome = await attest({
          channel: "admin",
          input: {
            userId: f.nativePl,
            subject: { kind: "product_translation", ref: f.sku, locale: "pl" },
            decision: "changes_requested",
            valueHash,
            note: "Użyj słowa bukiet",
            suggestedText: "Bukiet bursztynowy",
          },
        });
        expect(outcome.ok).toBe(true);
        const state = await reviewState(
          { kind: "product_translation", ref: f.sku, locale: "pl" },
          (fn) =>
            scratch.sql.begin((tx) =>
              fn({ execute: (q) => runSql(tx, q) }),
            ) as never,
        );
        expect(state.reviewed).toBe(false);
        expect(state.decision).toBe("changes_requested");
      });
    });

    describe("T-12 — the product copy hash and what it decides (AC-12)", () => {
      const read = (sql: Sql) =>
        ((fn) =>
          sql.begin((tx) =>
            fn({ execute: (q) => runSql(tx, q) }),
          )) as Parameters<typeof reviewState>[1];

      it("the SQL and the TypeScript hash agree, for every locale and with nulls, Polish letters and an emoji", async () => {
        for (const locale of ["en", "pl", "de"]) {
          expect(
            await hashOf(scratch.sql, "product_translation", f.sku, locale),
            locale,
          ).toBe(
            productCopyHash(await contentOf(scratch.sql, f.productId, locale)),
          );
        }
      });

      it("each of the six parts changes the pl hash; nothing else does", async () => {
        const original = await hashOf(
          scratch.sql,
          "product_translation",
          f.sku,
          "pl",
        );
        const changes: readonly [string, (tx: Tx) => Promise<unknown>][] = [
          [
            "name",
            (tx) =>
              tx`UPDATE product_translation SET name = name || '!' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "slug",
            (tx) =>
              tx`UPDATE product_translation SET slug = slug || '-x' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "description",
            (tx) =>
              tx`UPDATE product_translation SET description_md = description_md || '.' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "SEO title",
            (tx) =>
              tx`UPDATE product_translation SET seo_title = seo_title || '.' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "SEO description",
            (tx) =>
              tx`UPDATE product_translation SET seo_description = 'nowy' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "alt text",
            (tx) =>
              tx`UPDATE product_media_alt SET alt = alt || '.' WHERE locale_code = 'pl' AND product_media_id IN (SELECT id FROM product_media WHERE product_id = ${f.productId})`,
          ],
        ];
        const seen = new Set<string>([original]);
        for (const [part, change] of changes) {
          await rolledBack(scratch.sql, async (tx) => {
            await change(tx);
            const changed = await hashOf(
              tx,
              "product_translation",
              f.sku,
              "pl",
            );
            expect(changed, part).not.toBe(original);
            seen.add(changed);
          });
        }
        expect(seen.size).toBe(7);

        const unrelated: readonly [string, (tx: Tx) => Promise<unknown>][] = [
          [
            "translation_status",
            (tx) =>
              tx`UPDATE product_translation SET translation_status = 'machine' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "source_hash column",
            (tx) =>
              tx`UPDATE product_translation SET source_hash = 'x' WHERE product_id = ${f.productId} AND locale_code = 'pl'`,
          ],
          [
            "the English name",
            (tx) =>
              tx`UPDATE product_translation SET name = 'Other' WHERE product_id = ${f.productId} AND locale_code = 'en'`,
          ],
          [
            "the English alt",
            (tx) =>
              tx`UPDATE product_media_alt SET alt = 'Other alt' WHERE locale_code = 'en'`,
          ],
          [
            "the German description",
            (tx) =>
              tx`UPDATE product_translation SET description_md = 'x' WHERE product_id = ${f.productId} AND locale_code = 'de'`,
          ],
        ];
        for (const [part, change] of unrelated) {
          await rolledBack(scratch.sql, async (tx) => {
            await change(tx);
            expect(
              await hashOf(tx, "product_translation", f.sku, "pl"),
              part,
            ).toBe(original);
          });
        }
      });

      it("an edit un-reviews the locale, a new approval restores it, an English-only edit keeps it reviewed but stale", async () => {
        const subject = {
          kind: "product_translation",
          ref: f.sku,
          locale: "pl",
        } as const;
        const approve = async () =>
          attest({
            channel: "admin",
            input: {
              userId: f.nativePl,
              subject,
              decision: "approved",
              valueHash: await hashOf(
                scratch.sql,
                "product_translation",
                f.sku,
                "pl",
              ),
            },
          });
        expect((await approve()).ok).toBe(true);
        expect(await reviewState(subject, read(scratch.sql))).toEqual({
          reviewed: true,
          decision: "approved",
          edited: false,
          stale: false,
          importedNotReRead: false,
        });

        await scratch.sql`UPDATE product_translation SET name = 'Bursztynowa godzina II'
                          WHERE product_id = ${f.productId} AND locale_code = 'pl'`;
        const [column] = await scratch.sql<{ reviewed: boolean }[]>`
          SELECT reviewed FROM product_translation WHERE product_id = ${f.productId} AND locale_code = 'pl'`;
        expect(column?.reviewed).toBe(false);
        expect(await reviewState(subject, read(scratch.sql))).toMatchObject({
          reviewed: false,
          edited: true,
        });

        expect((await approve()).ok).toBe(true);
        expect(await reviewState(subject, read(scratch.sql))).toMatchObject({
          reviewed: true,
          edited: false,
          stale: false,
        });

        // An alt-only edit reopens it too (the ledger, not the column, says so).
        await scratch.sql`UPDATE product_media_alt SET alt = 'Róże pomarańczowe'
                          WHERE locale_code = 'pl' AND product_media_id IN
                            (SELECT id FROM product_media WHERE product_id = ${f.productId})`;
        expect(await reviewState(subject, read(scratch.sql))).toMatchObject({
          reviewed: false,
          edited: true,
        });
        expect((await approve()).ok).toBe(true);

        await scratch.sql`UPDATE product_translation SET seo_title = 'Amber Hour, hand-tied'
                          WHERE product_id = ${f.productId} AND locale_code = 'en'`;
        expect(await reviewState(subject, read(scratch.sql))).toMatchObject({
          reviewed: true,
          stale: true,
        });
      });
    });
  },
);

/** Runs a Drizzle `SQL` on a postgres.js transaction (the suites' runner). */
async function runSql(
  tx: Tx,
  query: import("drizzle-orm").SQL,
): Promise<unknown> {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const { sql, params } = new PgDialect().sqlToQuery(query);
  return tx.unsafe(sql, params as never[]);
}
