/**
 * T-13 (spec 012b §2.0 item 4, §2.4, AC-13; TASK-293): `pnpm attestations:import
 * --only=catalogue,media` over a fixture tree, on a migrated scratch database.
 *
 * Entries that record an approval with a name and a date become `channel = 'import'` rows with
 * both verbatim; entries missing either are imported unreviewed and listed; a second run creates
 * zero rows; the written `attestations.json` equals the ledger; an imported subject reads
 * "imported, not re-read" until a signed-in reviewer approves it again.
 */
import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  formatAttestationsFile,
  planImport,
  readImportedLedger,
  runImport,
} from "../../scripts/attestations-import.ts";
import { productCopyHash } from "../../src/modules/i18n/attestation.ts";
import {
  attest,
  executorOf,
  reviewState,
} from "../../src/modules/i18n/db/ledger.ts";
import {
  probeLocalServer,
  scratchDatabase,
  type ScratchDatabase,
} from "./support/scratch-db.ts";

const target = vi.hoisted(() => ({ url: "" }));
vi.mock("@/lib/env", () => ({
  get env() {
    return { DATABASE_URL: target.url };
  },
}));
vi.mock("@/lib/sentry", () => ({ captureGuardError: () => undefined }));

const run = promisify(execFile);
const server = await probeLocalServer();
const REPO_ROOT = resolve(import.meta.dirname, "../..");

const SKU = "ZZ-IMP-001";
const PHOTO = "1".repeat(64);
const UNDATED_PHOTO = "2".repeat(64);
const REJECTED_PHOTO = "3".repeat(64);

const EN = {
  entity: "product",
  key: SKU,
  locale: "en",
  name: "Amber Hour",
  slug: "amber-hour-imp",
  descriptionMd: "Orange roses.",
  seoTitle: "Amber Hour",
  seoDescription: "Orange roses, hand-tied.",
  translationStatus: "human",
  reviewed: true,
  reviewedBy: "founder (transcribed)",
  reviewedAt: "2026-09-18T07:30:00.000Z",
};

/** A fixture tree in the files' own shapes, with every case of AC-13 in it. */
function fixtureTree(): string {
  const root = mkdtempSync(join(tmpdir(), "fo-attest-import-"));
  const write = (path: string, rows: unknown[], extra: object = {}) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      JSON.stringify({ version: 1, source: "seed", ...extra, rows }, null, 2),
    );
  };
  write("copy/en/products.json", [
    EN,
    { ...EN, key: "ZZ-IMP-002", slug: "no-name", reviewedBy: undefined },
    {
      ...EN,
      key: "ZZ-IMP-004",
      slug: "not-reviewed",
      reviewed: false,
      reviewedBy: undefined,
      reviewedAt: undefined,
    },
  ]);
  write("copy/pl/products.json", [
    {
      ...EN,
      locale: "pl",
      name: "Bursztynowa godzina",
      slug: "bursztynowa",
      reviewedBy: "Native Reviewer",
      reviewedAt: "2026-10-01T10:00:00.000Z",
    },
    {
      ...EN,
      key: "ZZ-IMP-003",
      locale: "pl",
      slug: "no-date",
      reviewedAt: undefined,
    },
  ]);
  write("media.json", [
    {
      id: "zz-imp-001-hero",
      originalSha256: PHOTO,
      reviewState: "approved",
      reviewedBy: "founder",
      reviewedAt: "2026-09-18T07:30:00.000Z",
      productSku: SKU,
    },
    {
      id: "zz-imp-001-detail",
      originalSha256: UNDATED_PHOTO,
      reviewState: "approved",
      reviewedBy: "founder",
      productSku: SKU,
    },
    {
      id: "zz-imp-002-hero",
      originalSha256: REJECTED_PHOTO,
      reviewState: "rejected",
      productSku: "ZZ-IMP-002",
    },
  ]);
  write(
    "alt/en.json",
    [{ assetId: "zz-imp-001-hero", alt: "Orange roses in kraft paper" }],
    { locale: "en" },
  );
  write(
    "alt/pl.json",
    [{ assetId: "zz-imp-001-hero", alt: "Pomarańczowe róże" }],
    { locale: "pl" },
  );
  return root;
}

describe.skipIf(server.url === undefined)(
  `T-13 — attestations:import (spec 012b AC-13)${server.url === undefined ? ` — skipped: ${server.reason}` : ""}`,
  () => {
    let scratch: ScratchDatabase;
    let root: string;
    let founder: string;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url ?? "", "attestimport");
      target.url = scratch.url;
      root = fixtureTree();
      const sql = scratch.sql;
      await sql`INSERT INTO locale (code, bcp47, name) VALUES ('en', 'en', 'English'), ('pl', 'pl-PL', 'Polski')`;
      // The product as the database holds it, serving exactly the files' text and photo.
      const [product] = await sql<{ id: string }[]>`
        INSERT INTO product (sku, product_type, primary_flower, colour_primary, style, price_tier,
                             substitution_class, freshness_days)
        VALUES (${SKU}, 'bouquet', 'roses', 'orange', 'classic', 'classic', 'main_flower', 5)
        RETURNING id`;
      await sql`INSERT INTO product_translation (product_id, locale_code, name, slug, description_md,
                                                 seo_title, seo_description, translation_status)
                VALUES (${product?.id ?? ""}, 'en', ${EN.name}, ${EN.slug}, ${EN.descriptionMd},
                        ${EN.seoTitle}, ${EN.seoDescription}, 'human')`;
      const [asset] = await sql<{ id: string }[]>`
        INSERT INTO media_asset (kind, bucket, object_key, mime, width, height, bytes,
                                 checksum_sha256, visibility, source, depicts, exif_stripped)
        VALUES ('product', 'fo-media-test', 'products/zz-imp-001-hero/original', 'image/jpeg',
                1200, 1500, 1000, ${PHOTO}, 'public', 'ai', 'product', true)
        RETURNING id`;
      const [media] = await sql<{ id: string }[]>`
        INSERT INTO product_media (product_id, media_asset_id, is_primary)
        VALUES (${product?.id ?? ""}, ${asset?.id ?? ""}, true) RETURNING id`;
      await sql`INSERT INTO product_media_alt (product_media_id, locale_code, alt)
                VALUES (${media?.id ?? ""}, 'en', 'Orange roses in kraft paper')`;
      const [user] = await sql<{ id: string }[]>`
        INSERT INTO users (email) VALUES ('founder-import@example.test') RETURNING id`;
      founder = user?.id ?? "";
      await sql`INSERT INTO admin_profile (user_id, display_name) VALUES (${founder}, 'Founder Test')`;
      await sql`INSERT INTO user_role (user_id, role) VALUES (${founder}, 'admin')`;
      await sql`INSERT INTO reviewer_locale (user_id, locale_code) VALUES (${founder}, 'en')`;
      await Promise.all([
        import("@/lib/db"),
        import("@/modules/admin"),
        import("@/lib/logger"),
      ]);
    }, 120_000);

    afterAll(async () => {
      rmSync(root, { recursive: true, force: true });
      await scratch.drop();
    });

    it("imports each recorded approval with a name and a date verbatim, lists the rest, and is idempotent", async () => {
      const plan = planImport(root, ["catalogue", "media"]);
      expect(plan.unreviewed).toEqual([
        {
          subjectKind: "product_translation",
          subjectRef: "ZZ-IMP-002",
          localeCode: "en",
          missing: ["name"],
        },
        {
          subjectKind: "product_translation",
          subjectRef: "ZZ-IMP-003",
          localeCode: "pl",
          missing: ["date"],
        },
        {
          subjectKind: "media_asset",
          subjectRef: UNDATED_PHOTO,
          localeCode: null,
          missing: ["date"],
        },
      ]);

      const first = await runImport(scratch.sql, plan);
      expect([first.created, first.existing]).toEqual([3, 0]);
      const rows = await scratch.sql<
        {
          subject_kind: string;
          subject_ref: string;
          locale_code: string | null;
          attester_name: string;
          attested_at: Date;
          attester_user_id: string | null;
          channel: string;
          value_hash: string;
          source_hash: string | null;
        }[]
      >`SELECT subject_kind, subject_ref, locale_code, attester_name, attested_at,
               attester_user_id, channel, value_hash, source_hash
        FROM review_attestation ORDER BY subject_kind, locale_code NULLS FIRST`;
      const enHash = productCopyHash({
        name: EN.name,
        slug: EN.slug,
        descriptionMd: EN.descriptionMd,
        seoTitle: EN.seoTitle,
        seoDescription: EN.seoDescription,
        alts: [{ checksum: PHOTO, alt: "Orange roses in kraft paper" }],
      });
      expect(
        rows.map((row) => ({
          ...row,
          attested_at: row.attested_at.toISOString(),
        })),
      ).toEqual([
        {
          subject_kind: "media_asset",
          subject_ref: PHOTO,
          locale_code: null,
          attester_name: "founder",
          attested_at: "2026-09-18T07:30:00.000Z",
          attester_user_id: null,
          channel: "import",
          value_hash: PHOTO,
          source_hash: null,
        },
        {
          subject_kind: "product_translation",
          subject_ref: SKU,
          locale_code: "en",
          attester_name: "founder (transcribed)",
          attested_at: "2026-09-18T07:30:00.000Z",
          attester_user_id: null,
          channel: "import",
          value_hash: enHash,
          source_hash: null,
        },
        {
          subject_kind: "product_translation",
          subject_ref: SKU,
          locale_code: "pl",
          attester_name: "Native Reviewer",
          attested_at: "2026-10-01T10:00:00.000Z",
          attester_user_id: null,
          channel: "import",
          value_hash: expect.stringMatching(
            /^[0-9a-f]{64}$/,
          ) as unknown as string,
          source_hash: enHash,
        },
      ]);
      // The database serves the en text the file approved, so the import mirrored it; the photo
      // too.
      const [mirror] = await scratch.sql<
        { reviewed: boolean; reviewed_by: string }[]
      >`
        SELECT reviewed, reviewed_by FROM product_translation WHERE locale_code = 'en'`;
      expect(mirror).toEqual({
        reviewed: true,
        reviewed_by: "founder (transcribed)",
      });
      const [photo] = await scratch.sql<{ review_state: string }[]>`
        SELECT review_state FROM media_asset WHERE checksum_sha256 = ${PHOTO}`;
      expect(photo?.review_state).toBe("approved");

      const second = await runImport(
        scratch.sql,
        planImport(root, ["catalogue", "media"]),
      );
      expect([second.created, second.existing]).toEqual([0, 3]);
      const [count] = await scratch.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM review_attestation`;
      expect(count?.n).toBe(3);
    });

    it("--only=media imports photos alone", () => {
      const plan = planImport(root, ["media"]);
      expect(plan.entries.map((entry) => entry.subjectKind)).toEqual([
        "media_asset",
      ]);
    });

    it("the CLI writes a file equal to the ledger and prints subjects, never a name", async () => {
      const out = join(root, "attestations.json");
      const { stdout } = await run(
        process.execPath,
        [
          resolve(REPO_ROOT, "scripts/attestations-import.ts"),
          "--only=catalogue,media",
          `--root=${root}`,
          `--out=${out}`,
        ],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, DATABASE_URL_UNPOOLED: scratch.url },
          timeout: 60_000,
        },
      );
      expect(stdout).toContain(
        "0 created, 3 already in the ledger, 3 import rows in all",
      );
      expect(stdout).toContain(`product_translation ZZ-IMP-002 en: no name`);
      expect(stdout).toContain(`media_asset ${UNDATED_PHOTO}: no date`);
      expect(stdout).not.toMatch(/founder|Native Reviewer/u);
      expect(readFileSync(out, "utf8")).toBe(
        formatAttestationsFile(await readImportedLedger(scratch.sql)),
      );
    });

    it("an imported subject reads imported, not re-read, until a signed-in reviewer approves it", async () => {
      const subject = {
        kind: "product_translation",
        ref: SKU,
        locale: "en",
      } as const;
      const reader = (<T>(
        fn: (db: ReturnType<typeof executorOf>) => Promise<T>,
      ) =>
        scratch.sql.begin((tx) =>
          fn(
            executorOf((text, parameters) =>
              tx.unsafe(text, parameters as never[]),
            ),
          ),
        ) as Promise<T>) as Parameters<typeof reviewState>[1];
      expect(await reviewState(subject, reader)).toMatchObject({
        reviewed: true,
        importedNotReRead: true,
      });
      const [hash] = await scratch.sql<{ hash: string }[]>`
        SELECT public.review_subject_hash('product_translation', ${SKU}, 'en') AS hash`;
      const outcome = await attest({
        channel: "admin",
        input: {
          userId: founder,
          subject,
          decision: "approved",
          valueHash: hash?.hash ?? "",
        },
      });
      expect(outcome.ok).toBe(true);
      expect(await reviewState(subject, reader)).toMatchObject({
        reviewed: true,
        importedNotReRead: false,
      });
    });
  },
);
