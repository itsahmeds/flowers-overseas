/**
 * The contract reads (spec 030b §14.2 A, §14.4, §14.5; AC-38, AC-39, AC-42; TASK-442):
 * `partnerContracts(partnerId)`, `partnersContractFlags()` (the list's Agreement column) and
 * `contractsDue(now)`.
 *
 * One admin transaction each (action `partner_contract.read`). No object key, signed URL or file
 * name leaves the database here: a download goes only through `contractDownloadUrl`. Dates are
 * calendar days in the florist's country zone.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { CONTRACTS_CONFIG, type ContractDocKind } from "@/config/contracts";
import type { DbActor, DbTransaction } from "@/lib/db";

import { type PartnerAdminRunner, partnerAdminRunner } from "../admin/commands";
import { CONTRACT_ACTIONS } from "./commands";
import {
  type ContractFlag,
  contractFlags,
  type CurrentDocument,
  reviewState,
  todayInZone,
} from "./flags";

const Instant = z
  .union([z.date(), z.string()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export interface ContractRow {
  readonly id: string;
  readonly docKind: ContractDocKind;
  readonly versionNo: number;
  readonly templateVersion: string;
  readonly languageCode: string;
  readonly includesDpa: boolean;
  readonly signedOn: string;
  readonly effectiveOn: string;
  readonly reviewOn: string | null;
  readonly noticeDays: number;
  readonly note: string | null;
  readonly bytes: number;
  readonly pageCount: number;
  readonly uploadedBy: string | null;
  readonly uploadedAt: Date;
  readonly supersededAt: Date | null;
  readonly current: boolean;
  /** The version every edit and withdraw form carries. */
  readonly updatedAt: string;
}

const Row = z.object({
  id: z.uuid(),
  doc_kind: z.enum(CONTRACTS_CONFIG.docKinds),
  version_no: z.coerce.number().int(),
  template_version: z.string(),
  language_code: z.string(),
  includes_dpa: z.boolean(),
  signed_on: IsoDay,
  effective_on: IsoDay,
  review_on: IsoDay.nullable(),
  notice_days: z.coerce.number().int(),
  note: z.string().nullable(),
  bytes: z.coerce.number().int(),
  page_count: z.coerce.number().int(),
  uploaded_by: z.string().nullable(),
  uploaded_at: Instant,
  superseded_at: Instant.nullable(),
  updated_at: Instant,
});

export interface PartnerContracts {
  readonly zone: string;
  readonly today: string;
  readonly status: string;
  readonly termsSignedAt: string | null;
  readonly termsVersion: string | null;
  /** Kind order, then newest version first. */
  readonly rows: readonly ContractRow[];
  readonly flags: readonly ContractFlag[];
}

const PartnerRow = z.object({
  zone: z.string(),
  status: z.string(),
  terms_signed_at: IsoDay.nullable(),
  terms_version: z.string().nullable(),
});

function asCurrent(row: ContractRow): CurrentDocument {
  return {
    docKind: row.docKind,
    templateVersion: row.templateVersion,
    signedOn: row.signedOn,
    includesDpa: row.includesDpa,
    reviewOn: row.reviewOn,
    noticeDays: row.noticeDays,
  };
}

/** One florist's documents and flags, read in `db`. */
export async function readPartnerContracts(
  db: DbTransaction,
  partnerId: string,
  now: Date,
): Promise<PartnerContracts | undefined> {
  const id = z.uuid().parse(partnerId);
  const [partnerRaw] = await db.execute(sql`
    SELECT c.iana_zone AS zone, p.status, p.terms_signed_at::text AS terms_signed_at,
           p.terms_version
    FROM public.fulfillment_partner p JOIN public.country c ON c.id = p.country_id
    WHERE p.id = ${id}::uuid`);
  if (partnerRaw === undefined) return undefined;
  const partner = PartnerRow.parse(partnerRaw);
  const raw = await db.execute(sql`
    SELECT k.id, k.doc_kind, k.version_no, k.template_version, k.language_code, k.includes_dpa,
           k.signed_on::text AS signed_on, k.effective_on::text AS effective_on,
           k.review_on::text AS review_on, k.notice_days, k.note, k.bytes, k.page_count,
           u.name AS uploaded_by, k.uploaded_at, k.superseded_at, k.updated_at
    FROM public.partner_contract k
    LEFT JOIN public.users u ON u.id = k.uploaded_by
    WHERE k.partner_id = ${id}::uuid
    ORDER BY array_position(ARRAY['agreement', 'dpa_addendum', 'annex'], k.doc_kind),
             k.version_no DESC`);
  const rows: ContractRow[] = raw.map((value) => {
    const row = Row.parse(value);
    return {
      id: row.id,
      docKind: row.doc_kind,
      versionNo: row.version_no,
      templateVersion: row.template_version,
      languageCode: row.language_code,
      includesDpa: row.includes_dpa,
      signedOn: row.signed_on,
      effectiveOn: row.effective_on,
      reviewOn: row.review_on,
      noticeDays: row.notice_days,
      note: row.note,
      bytes: row.bytes,
      pageCount: row.page_count,
      uploadedBy: row.uploaded_by,
      uploadedAt: row.uploaded_at,
      supersededAt: row.superseded_at,
      current: row.superseded_at === null,
      updatedAt: row.updated_at.toISOString(),
    };
  });
  const today = todayInZone(partner.zone, now);
  return {
    zone: partner.zone,
    today,
    status: partner.status,
    termsSignedAt: partner.terms_signed_at,
    termsVersion: partner.terms_version,
    rows,
    flags: contractFlags({
      current: rows.filter((row) => row.current).map(asCurrent),
      termsSignedAt: partner.terms_signed_at,
      termsVersion: partner.terms_version,
      today,
    }),
  };
}

/** `partnerContracts(partnerId)` in its own admin transaction. */
export async function partnerContracts(
  actor: DbActor,
  partnerId: string,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<PartnerContracts | undefined> {
  return run({ ...actor, action: CONTRACT_ACTIONS.read }, (db) =>
    readPartnerContracts(db, partnerId, now),
  );
}

export interface PartnerAgreementColumn {
  readonly flags: readonly ContractFlag[];
  /** The current agreement's template version, when one is on file. */
  readonly templateVersion: string | null;
}

const CurrentRow = z.object({
  partner_id: z.uuid(),
  zone: z.string(),
  terms_signed_at: IsoDay.nullable(),
  terms_version: z.string().nullable(),
  doc_kind: z.enum(CONTRACTS_CONFIG.docKinds).nullable(),
  template_version: z.string().nullable(),
  signed_on: IsoDay.nullable(),
  includes_dpa: z.boolean().nullable(),
  review_on: IsoDay.nullable(),
  notice_days: z.coerce.number().int().nullable(),
});

/** Every florist's Agreement column (one statement), keyed by partner id. */
export async function partnersContractFlags(
  actor: DbActor,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<ReadonlyMap<string, PartnerAgreementColumn>> {
  return run({ ...actor, action: CONTRACT_ACTIONS.read }, async (db) => {
    const raw = await db.execute(sql`
      SELECT p.id AS partner_id, c.iana_zone AS zone, p.terms_signed_at::text AS terms_signed_at,
             p.terms_version, k.doc_kind, k.template_version, k.signed_on::text AS signed_on,
             k.includes_dpa, k.review_on::text AS review_on, k.notice_days
      FROM public.fulfillment_partner p
      JOIN public.country c ON c.id = p.country_id
      LEFT JOIN public.partner_contract k
        ON k.partner_id = p.id AND k.superseded_at IS NULL AND k.doc_kind <> 'annex'`);
    const grouped = new Map<
      string,
      { facts: z.infer<typeof CurrentRow>; current: CurrentDocument[] }
    >();
    for (const value of raw) {
      const row = CurrentRow.parse(value);
      const entry = grouped.get(row.partner_id) ?? { facts: row, current: [] };
      if (
        row.doc_kind !== null &&
        row.template_version !== null &&
        row.signed_on !== null
      ) {
        entry.current.push({
          docKind: row.doc_kind,
          templateVersion: row.template_version,
          signedOn: row.signed_on,
          includesDpa: row.includes_dpa === true,
          reviewOn: row.review_on,
          noticeDays: row.notice_days ?? CONTRACTS_CONFIG.defaultNoticeDays,
        });
      }
      grouped.set(row.partner_id, entry);
    }
    return new Map(
      [...grouped.entries()].map(([partnerId, { facts, current }]) => [
        partnerId,
        {
          flags: contractFlags({
            current,
            termsSignedAt: facts.terms_signed_at,
            termsVersion: facts.terms_version,
            today: todayInZone(facts.zone, now),
          }),
          templateVersion:
            current.find((d) => d.docKind === "agreement")?.templateVersion ??
            null,
        },
      ]),
    );
  });
}

export interface ContractDue {
  readonly contractId: string;
  readonly partnerId: string;
  readonly partnerCode: string;
  readonly partnerName: string;
  readonly docKind: ContractDocKind;
  readonly versionNo: number;
  readonly reviewOn: string;
  readonly state: "due" | "passed";
}

const DueRow = z.object({
  id: z.uuid(),
  partner_id: z.uuid(),
  code: z.string(),
  legal_name: z.string(),
  zone: z.string(),
  doc_kind: z.enum(["agreement", "dpa_addendum"]),
  version_no: z.coerce.number().int(),
  review_on: IsoDay,
  notice_days: z.coerce.number().int(),
});

/** The current rows with a review date, read in `db` (the reminders job and "Contracts due"). */
export async function readReviewRows(db: DbTransaction) {
  const raw = await db.execute(sql`
    SELECT k.id, k.partner_id, p.code, p.legal_name, c.iana_zone AS zone, k.doc_kind,
           k.version_no, k.review_on::text AS review_on, k.notice_days
    FROM public.partner_contract k
    JOIN public.fulfillment_partner p ON p.id = k.partner_id
    JOIN public.country c ON c.id = p.country_id
    WHERE k.superseded_at IS NULL AND k.review_on IS NOT NULL
      AND k.doc_kind IN ('agreement', 'dpa_addendum')
    ORDER BY k.review_on, p.code, k.id`);
  return raw.map((value) => DueRow.parse(value));
}

/** `contractsDue(now)`: current rows inside their notice window or past their review date. */
export async function contractsDue(
  actor: DbActor,
  now: Date = new Date(),
  run: PartnerAdminRunner = partnerAdminRunner,
): Promise<ContractDue[]> {
  return run({ ...actor, action: CONTRACT_ACTIONS.read }, async (db) => {
    const rows = await readReviewRows(db);
    return rows.flatMap((row) => {
      const state = reviewState(
        { reviewOn: row.review_on, noticeDays: row.notice_days },
        todayInZone(row.zone, now),
      );
      return state === null
        ? []
        : [
            {
              contractId: row.id,
              partnerId: row.partner_id,
              partnerCode: row.code,
              partnerName: row.legal_name,
              docKind: row.doc_kind,
              versionNo: row.version_no,
              reviewOn: row.review_on,
              state,
            },
          ];
    });
  });
}
