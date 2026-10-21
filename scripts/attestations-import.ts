/**
 * @purpose Recorded approvals into the review ledger (AC-13)
 * @spec 012b
 *
 * `pnpm attestations:import [--only=catalogue,media] [--root=seed/data] [--out=seed/data/attestations.json] [--dry-run]`
 * (spec 012b §2.0 item 4, §2.4, AC-13, T-13; proposed ADR-0022; TASK-293).
 *
 * Carries every approval the repository files record — product copy in
 * `<root>/copy/<locale>/products.json`, photos in `<root>/media.json` — into the
 * `review_attestation` ledger as `channel = 'import'` rows, with the recorded name and date
 * verbatim, through `attest()`'s import channel (`src/modules/i18n/db/ledger.ts`, the one writer).
 * Then it writes `<out>`, the ledger's import rows in a database-independent form, which
 * `db:seed` replays into every fresh database as its last step.
 *
 *  - **What counts as a recorded approval**: a copy row with `reviewed: true`, a photo with
 *    `reviewState: "approved"`. One with a name and a date becomes a row; one missing either is
 *    imported **unreviewed** (no row) and listed in the report, by subject only.
 *  - **The hash** is computed from the files exactly as the database computes it from the rows
 *    (`subjectHash`): a copy subject's five fields and the alt text, in that locale, of every
 *    photo `<root>/media.json` attaches to the product; a photo's `originalSha256`. Non-English
 *    copy carries the English row's hash as its source hash.
 *  - **Idempotent**: an identical import row already in the ledger is counted as existing, so a
 *    second run creates zero rows.
 *  - `--only=catalogue,media` is slice A's scope (§2.4): category and occasion copy keep their
 *    seeded flags until slice B, and UI strings, guides and legal pages are slice B's import.
 *  - `--dry-run` runs the whole import in a transaction that is rolled back, and writes no file.
 *
 * Connects over `DATABASE_URL_UNPOOLED` (spec 002 §13 Q6) from the process environment only, in
 * one transaction. Prints counts and subjects, never an attester's name (spec 012b §8).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import postgres from "postgres";
import { z } from "zod";

import {
  type AttestationsFile,
  AttestationsFileSchema,
  type LedgerEntry,
  LedgerEntrySchema,
  productCopyHash,
  SOURCE_LOCALE,
} from "../src/modules/i18n/attestation.ts";
import { attest, executorOf } from "../src/modules/i18n/db/ledger.ts";

export const CLI_NAME = "attestations:import";

export const IMPORT_SCOPES = ["catalogue", "media"] as const;
export type ImportScope = (typeof IMPORT_SCOPES)[number];

const REPO_ROOT = resolve(import.meta.dirname, "..");
export const DEFAULT_ROOT = join(REPO_ROOT, "seed", "data");
export const DEFAULT_OUT = join(DEFAULT_ROOT, "attestations.json");

/* -------------------------------------------------------------------------- */
/* The files, read leniently: an approval missing its name is reported, not a parse error.     */
/* -------------------------------------------------------------------------- */

const CopyRowSchema = z
  .object({
    key: z.string().min(1),
    locale: z.string().min(1),
    name: z.string(),
    slug: z.string(),
    descriptionMd: z.string().nullish(),
    seoTitle: z.string().nullish(),
    seoDescription: z.string().nullish(),
    reviewed: z.boolean(),
    reviewedBy: z.string().nullish(),
    reviewedAt: z.string().nullish(),
  })
  .loose();
const CopyFileSchema = z.object({ rows: z.array(CopyRowSchema) }).loose();

const MediaRowSchema = z
  .object({
    id: z.string().min(1),
    originalSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    reviewState: z.string(),
    reviewedBy: z.string().nullish(),
    reviewedAt: z.string().nullish(),
    productSku: z.string().nullish(),
  })
  .loose();
const MediaFileSchema = z.object({ rows: z.array(MediaRowSchema) }).loose();

const AltFileSchema = z
  .object({
    locale: z.string().min(1),
    rows: z.array(z.object({ assetId: z.string(), alt: z.string() }).loose()),
  })
  .loose();

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** A recorded approval that could not be imported, by subject only (no name, §8). */
export interface UnreviewedEntry {
  readonly subjectKind: LedgerEntry["subjectKind"];
  readonly subjectRef: string;
  readonly localeCode: string | null;
  readonly missing: readonly ("name" | "date")[];
}

export interface ImportPlan {
  readonly entries: readonly LedgerEntry[];
  readonly unreviewed: readonly UnreviewedEntry[];
}

function missingOf(
  by: string | null | undefined,
  at: string | null | undefined,
): ("name" | "date")[] {
  const missing: ("name" | "date")[] = [];
  if (by === undefined || by === null || by.trim() === "") missing.push("name");
  if (at === undefined || at === null || Number.isNaN(Date.parse(at))) {
    missing.push("date");
  }
  return missing;
}

/** The ledger entries the files record under `root`, and the approvals that lack a name or date. */
export function planImport(
  root: string,
  only: readonly ImportScope[] = IMPORT_SCOPES,
): ImportPlan {
  const entries: LedgerEntry[] = [];
  const unreviewed: UnreviewedEntry[] = [];
  const media = MediaFileSchema.parse(readJson(join(root, "media.json"))).rows;

  if (only.includes("catalogue")) {
    const altsByLocale = new Map<string, Map<string, string>>();
    for (const file of readdirSync(join(root, "alt")).filter((name) =>
      name.endsWith(".json"),
    )) {
      const alt = AltFileSchema.parse(readJson(join(root, "alt", file)));
      altsByLocale.set(
        alt.locale,
        new Map(alt.rows.map((row) => [row.assetId, row.alt])),
      );
    }
    const copies = readdirSync(join(root, "copy"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .flatMap((locale) => {
        try {
          return CopyFileSchema.parse(
            readJson(join(root, "copy", locale, "products.json")),
          ).rows;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
          throw error;
        }
      });
    const hashOf = (row: z.infer<typeof CopyRowSchema>): string => {
      const alts = altsByLocale.get(row.locale) ?? new Map<string, string>();
      return productCopyHash({
        name: row.name,
        slug: row.slug,
        descriptionMd: row.descriptionMd ?? null,
        seoTitle: row.seoTitle ?? null,
        seoDescription: row.seoDescription ?? null,
        alts: media
          .filter((asset) => asset.productSku === row.key)
          .flatMap((asset) => {
            const alt = alts.get(asset.id);
            return alt === undefined
              ? []
              : [{ checksum: asset.originalSha256, alt }];
          }),
      });
    };
    const english = new Map(
      copies
        .filter((row) => row.locale === SOURCE_LOCALE)
        .map((row) => [row.key, hashOf(row)]),
    );
    for (const row of copies.filter((copy) => copy.reviewed)) {
      const missing = missingOf(row.reviewedBy, row.reviewedAt);
      if (missing.length > 0) {
        unreviewed.push({
          subjectKind: "product_translation",
          subjectRef: row.key,
          localeCode: row.locale,
          missing,
        });
        continue;
      }
      entries.push(
        LedgerEntrySchema.parse({
          subjectKind: "product_translation",
          subjectRef: row.key,
          localeCode: row.locale,
          valueHash: hashOf(row),
          sourceHash:
            row.locale === SOURCE_LOCALE
              ? null
              : (english.get(row.key) ?? null),
          decision: "approved",
          attesterName: row.reviewedBy,
          attestedAt: row.reviewedAt,
          channel: "import",
        }),
      );
    }
  }

  if (only.includes("media")) {
    for (const asset of media.filter((row) => row.reviewState === "approved")) {
      const missing = missingOf(asset.reviewedBy, asset.reviewedAt);
      if (missing.length > 0) {
        unreviewed.push({
          subjectKind: "media_asset",
          subjectRef: asset.originalSha256,
          localeCode: null,
          missing,
        });
        continue;
      }
      entries.push(
        LedgerEntrySchema.parse({
          subjectKind: "media_asset",
          subjectRef: asset.originalSha256,
          localeCode: null,
          valueHash: asset.originalSha256,
          sourceHash: null,
          decision: "approved",
          attesterName: asset.reviewedBy,
          attestedAt: asset.reviewedAt,
          channel: "import",
        }),
      );
    }
  }
  return { entries, unreviewed };
}

/* -------------------------------------------------------------------------- */
/* The database.                                                               */
/* -------------------------------------------------------------------------- */

export type Sql = postgres.Sql;
type Tx = postgres.TransactionSql;

/** Opens the import's session settings on `tx`: an admin-context write on the `import` channel. */
async function importContext(tx: Tx): Promise<void> {
  await tx`SELECT set_config('app.role', 'admin', true)`;
  await tx`SELECT set_config('app.request_id', 'cli:attestations-import', true)`;
  await tx`SELECT set_config('app.audit_channel', 'import', true)`;
  await tx`SELECT set_config('app.audit_action', 'review.import', true)`;
}

/** Every import row of the ledger, in the file's form and a stable order. */
export async function readImportedLedger(
  sql: Sql | Tx,
): Promise<AttestationsFile> {
  const rows = await sql<
    {
      subject_kind: string;
      subject_ref: string;
      locale_code: string | null;
      value_hash: string;
      source_hash: string | null;
      decision: string;
      attester_name: string;
      attested_at: string;
    }[]
  >`
    SELECT subject_kind, subject_ref, locale_code, value_hash, source_hash, decision,
           attester_name,
           to_char(attested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS attested_at
    FROM review_attestation
    WHERE channel = 'import'
    ORDER BY subject_kind, subject_ref, locale_code NULLS FIRST, attested_at, value_hash, decision`;
  return AttestationsFileSchema.parse({
    version: 1,
    source: "import",
    entity: "review_attestation",
    rows: rows.map((row) => ({
      subjectKind: row.subject_kind,
      subjectRef: row.subject_ref,
      localeCode: row.locale_code,
      valueHash: row.value_hash,
      sourceHash: row.source_hash,
      decision: row.decision,
      attesterName: row.attester_name,
      attestedAt: row.attested_at,
      channel: "import",
    })),
  });
}

export interface ImportReport {
  readonly created: number;
  readonly existing: number;
  readonly unreviewed: readonly UnreviewedEntry[];
  readonly ledger: AttestationsFile;
}

/** Writes every planned entry through `attest()`'s import channel, in one transaction. */
export async function runImport(
  sql: Sql,
  plan: ImportPlan,
  options: { readonly dryRun?: boolean } = {},
): Promise<ImportReport> {
  let report: ImportReport | undefined;
  const dryRun = options.dryRun === true;
  try {
    await sql.begin(async (tx) => {
      await importContext(tx);
      const db = executorOf((text, parameters) =>
        tx.unsafe(text, parameters as never[]),
      );
      let created = 0;
      let existing = 0;
      for (const entry of plan.entries) {
        const outcome = await attest({ channel: "import", entry, db });
        if (!outcome.ok) throw new Error(`${CLI_NAME}: ${outcome.refusal}`);
        if (outcome.created) created += 1;
        else existing += 1;
      }
      report = {
        created,
        existing,
        unreviewed: plan.unreviewed,
        ledger: await readImportedLedger(tx),
      };
      if (dryRun) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  if (report === undefined) throw new Error(`${CLI_NAME}: no report`);
  return report;
}

class DryRun extends Error {}

/** `<out>`'s text: the ledger's import rows, two-space JSON and a final newline. */
export function formatAttestationsFile(file: AttestationsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function formatImportReport(report: ImportReport): string {
  const lines = [
    `${CLI_NAME}: ${String(report.created)} created, ${String(report.existing)} already in the ledger, ${String(report.ledger.rows.length)} import rows in all`,
  ];
  if (report.unreviewed.length > 0) {
    lines.push(
      `${CLI_NAME}: ${String(report.unreviewed.length)} recorded approvals imported unreviewed (no name or no date):`,
    );
    for (const entry of report.unreviewed) {
      lines.push(
        `  ${entry.subjectKind} ${entry.subjectRef}${entry.localeCode === null ? "" : ` ${entry.localeCode}`}: no ${entry.missing.join(", no ")}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

const ArgsSchema = z
  .object({
    only: z.array(z.enum(IMPORT_SCOPES)).min(1),
    root: z.string().min(1),
    out: z.string().min(1),
    dryRun: z.boolean(),
  })
  .strict();
export type ImportArgs = z.infer<typeof ArgsSchema>;

export function parseImportArgs(argv: readonly string[]): ImportArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      only: { type: "string" },
      root: { type: "string" },
      out: { type: "string" },
      "dry-run": { type: "boolean" },
    },
    strict: true,
  });
  return ArgsSchema.parse({
    only:
      values.only === undefined
        ? [...IMPORT_SCOPES]
        : values.only
            .split(",")
            .map((scope) => scope.trim())
            .filter((scope) => scope !== ""),
    root: values.root ?? DEFAULT_ROOT,
    out: values.out ?? DEFAULT_OUT,
    dryRun: values["dry-run"] === true,
  });
}

async function main(): Promise<number> {
  let args: ImportArgs;
  try {
    args = parseImportArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      `usage: pnpm ${CLI_NAME} [--only=catalogue,media] [--root=<dir>] [--out=<file>] [--dry-run]\n`,
    );
    return 2;
  }
  const url = process.env["DATABASE_URL_UNPOOLED"];
  if (url === undefined || url === "") {
    process.stderr.write(`${CLI_NAME}: DATABASE_URL_UNPOOLED is not set\n`);
    return 1;
  }
  const plan = planImport(resolve(args.root), args.only);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const report = await runImport(sql, plan, { dryRun: args.dryRun });
    if (!args.dryRun) {
      writeFileSync(resolve(args.out), formatAttestationsFile(report.ledger));
    }
    process.stdout.write(formatImportReport(report));
    return 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
