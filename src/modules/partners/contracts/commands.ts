/**
 * The contract commands (spec 030b §14.2 A, §14.4 "upload, exactly", "withdraw, exactly",
 * "download, exactly"; AC-37 to AC-41, AC-59; TASK-442): `uploadContract`,
 * `editContractDetails`, `withdrawContract`, `contractDownloadUrl` and `hasCurrentAgreement`.
 *
 *  - **Upload.** The bytes are checked by content (`checkPdf`), stored unchanged with their
 *    SHA-256 in the private bucket at `originals/contract/{id}`, then one admin transaction locks
 *    the florist, refuses `CONTRACT_VERSION_CONFLICT` when the current row of the kind is not the
 *    one the page showed, supersedes it (agreement and addendum; an annex never supersedes),
 *    inserts the next version, and for an agreement sets spec 012's profile terms to its signed
 *    date and template version. Any failure after the `put` deletes the object again and logs
 *    `partners.contract_orphan` with the contract id only.
 *  - **Withdraw** within 7 days, with a reason (audited): the row and then its object go; the
 *    previous version is current again and, for an agreement, the profile terms come back from
 *    it. The only agreement of an `active` florist pauses the florist first, in the same
 *    transaction (audit reason `contract.only_agreement_withdrawn`). No assignment, order or payout
 *    row is read for writing or written (ADR-0009).
 *  - **Download**: the read is audited (`partner_contract.viewed`), the stored object's checksum is
 *    compared with the row (a mismatch raises `alert=partners.contract_checksum_mismatch` and gives
 *    no URL), then a 60-second signed URL that downloads as `contract-{code}-{kind}-v{n}.pdf`.
 *
 * Nothing here logs a note, a reason, a file name, an object key, a signed URL or a legal name.
 */
import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { CONTRACTS_CONFIG, type ContractDocKind } from "@/config/contracts";
import type { AdminContextInput, DbActor, DbTransaction } from "@/lib/db";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";
import { objectKey, type Storage } from "@/lib/storage";

import { type PartnerAdminRunner, partnerAdminRunner } from "../admin/commands";
import { todayInZone } from "./flags";
import { checkPdf, type PdfRuleId } from "./pdf";
import {
  type ContractFieldErrors,
  ContractTargetSchema,
  parseContractDetailsEdit,
  parseContractUpload,
  parseContractWithdraw,
} from "./schemas";

/** The audit actions of the contract commands. */
export const CONTRACT_ACTIONS = Object.freeze({
  upload: "partner_contract.upload",
  edit: "partner_contract.edit",
  withdraw: "partner_contract.withdraw",
  read: "partner_contract.read",
  viewed: "partner_contract.viewed",
  pause: "partner.status.paused",
});

/** The audit reason of the pause a withdrawn only agreement causes (§14.2 A). */
export const ONLY_AGREEMENT_WITHDRAWN = "contract.only_agreement_withdrawn";

export const CHECKSUM_MISMATCH_ALERT = "partners.contract_checksum_mismatch";
export const CONTRACT_ORPHAN_LOG = "partners.contract_orphan";

/** Where contracts live: the private bucket and the seam over it. */
export interface ContractStore {
  readonly storage: Storage;
  readonly bucket: string;
}

/** The production store: R2's private bucket, loaded at the first call (no env read at import). */
export async function privateContractStore(): Promise<ContractStore> {
  const { R2Storage, r2EnvironmentFrom } = await import("@/lib/storage-r2");
  const r2 = r2EnvironmentFrom(process.env);
  if (r2.privateBucket === undefined) {
    throw new Error(
      "CONTRACT_STORAGE_UNCONFIGURED: no private bucket is configured",
    );
  }
  return { storage: new R2Storage(r2.config), bucket: r2.privateBucket };
}

export interface ContractDeps {
  readonly store: () => Promise<ContractStore>;
  readonly run: PartnerAdminRunner;
  readonly now: () => Date;
  readonly log: Logger;
  readonly alert: (alert: string, fields: Record<string, unknown>) => void;
}

const defaults: ContractDeps = {
  store: privateContractStore,
  run: partnerAdminRunner,
  now: () => new Date(),
  log: defaultLogger,
  alert: (alert, fields) => {
    captureAlert(alert, fields);
  },
};

function depsOf(overrides: Partial<ContractDeps>): ContractDeps {
  return { ...defaults, ...overrides };
}

export type ContractCommandResult =
  | {
      readonly ok: true;
      readonly code: string;
      readonly contractId: string;
      readonly versionNo: number;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly errors: ContractFieldErrors;
    }
  | { readonly ok: false; readonly reason: "rule"; readonly ruleId: PdfRuleId }
  | {
      readonly ok: false;
      readonly reason:
        "conflict" | "version_conflict" | "not_found" | "window_closed";
    };

interface PartnerFacts {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly zone: string;
}

const PartnerRow = z.object({
  id: z.uuid(),
  code: z.string(),
  status: z.string(),
  zone: z.string(),
});

async function partnerFacts(
  db: DbTransaction,
  partnerId: string,
  lock = false,
): Promise<PartnerFacts | undefined> {
  const [row] = await db.execute(sql`
    SELECT p.id, p.code, p.status, c.iana_zone AS zone
    FROM public.fulfillment_partner p
    JOIN public.country c ON c.id = p.country_id
    WHERE p.id = ${partnerId}::uuid
    ${lock ? sql`FOR UPDATE OF p` : sql``}`);
  return row === undefined ? undefined : PartnerRow.parse(row);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function context(
  actor: DbActor,
  action: string,
  reason?: string,
): AdminContextInput {
  return {
    ...actor,
    action,
    ...(reason === undefined ? {} : { reason }),
  };
}

/* -------------------------------------------------------------------------- */
/* upload                                                                     */
/* -------------------------------------------------------------------------- */

const CurrentRow = z.object({ id: z.uuid() });
const MaxRow = z.object({ max: z.coerce.number().int() });

/**
 * `uploadContract(partnerId, ContractUploadSchema, bytes, actor)`. `fields` are the form's text
 * fields; `bytes` the file, already capped at `maxBytes + 1` by the route.
 */
export async function uploadContract(
  actor: DbActor,
  partnerId: string,
  fields: unknown,
  bytes: Uint8Array,
  overrides: Partial<ContractDeps> = {},
): Promise<ContractCommandResult> {
  const deps = depsOf(overrides);
  const id = z.uuid().safeParse(partnerId);
  if (!id.success) return { ok: false, reason: "not_found" };
  const uploadedBy = z.uuid().parse(actor.userId);
  const partner = await deps.run(context(actor, CONTRACT_ACTIONS.read), (db) =>
    partnerFacts(db, id.data),
  );
  if (partner === undefined) return { ok: false, reason: "not_found" };
  const now = deps.now();
  const parsed = parseContractUpload(fields, todayInZone(partner.zone, now));
  if (!parsed.ok)
    return { ok: false, reason: "invalid", errors: parsed.errors };
  const check = await checkPdf(bytes);
  if (!check.ok) return { ok: false, reason: "rule", ruleId: check.ruleId };

  const contractId = randomUUID();
  const { storage, bucket } = await deps.store();
  const key = objectKey("contract", contractId, "original");
  const checksum = sha256(bytes);
  await storage.put({
    bucket,
    objectKey: key,
    body: bytes,
    mime: "application/pdf",
    checksumSha256: checksum,
  });
  const upload = parsed.value;
  try {
    const result = await deps.run(
      context(actor, CONTRACT_ACTIONS.upload),
      async (db): Promise<ContractCommandResult> => {
        const locked = await partnerFacts(db, partner.id, true);
        if (locked === undefined) return { ok: false, reason: "not_found" };
        const supersedes = upload.docKind !== "annex";
        let current: string | null = null;
        if (supersedes) {
          const [row] = await db.execute(sql`
            SELECT id FROM public.partner_contract
            WHERE partner_id = ${locked.id}::uuid AND doc_kind = ${upload.docKind}
              AND superseded_at IS NULL
            FOR UPDATE`);
          current = row === undefined ? null : CurrentRow.parse(row).id;
          if (current !== upload.expectedCurrentId) {
            return { ok: false, reason: "version_conflict" };
          }
        }
        const [maxRow] = await db.execute(sql`
          SELECT coalesce(max(version_no), 0) AS max FROM public.partner_contract
          WHERE partner_id = ${locked.id}::uuid AND doc_kind = ${upload.docKind}`);
        const versionNo = MaxRow.parse(maxRow).max + 1;
        if (current !== null) {
          // The superseding link is deferred to commit: the old row stops being current first,
          // so the partial unique index sees one current row at every moment.
          await db.execute(sql`
            UPDATE public.partner_contract
            SET superseded_at = now(), superseded_by = ${contractId}::uuid
            WHERE id = ${current}::uuid`);
        }
        await db.execute(sql`
          INSERT INTO public.partner_contract (
            id, partner_id, doc_kind, version_no, template_version, language_code, includes_dpa,
            signed_on, effective_on, review_on, notice_days, note, bucket, object_key, bytes,
            page_count, checksum_sha256, uploaded_by)
          VALUES (
            ${contractId}::uuid, ${locked.id}::uuid, ${upload.docKind}, ${versionNo},
            ${upload.templateVersion}, ${upload.languageCode}, ${upload.includesDpa},
            ${upload.signedOn}::date, ${upload.effectiveOn}::date, ${upload.reviewOn}::date,
            ${upload.noticeDays}, ${upload.note}, ${bucket}, ${key}, ${bytes.byteLength},
            ${check.pageCount}, ${checksum}, ${uploadedBy}::uuid)`);
        if (upload.docKind === "agreement") {
          await syncTerms(
            db,
            locked.id,
            upload.signedOn,
            upload.templateVersion,
          );
        }
        return { ok: true, code: locked.code, contractId, versionNo };
      },
    );
    if (!result.ok) await storage.delete({ bucket, objectKey: key });
    return result;
  } catch (error) {
    await storage.delete({ bucket, objectKey: key }).catch(() => undefined);
    deps.log.warn({ contract_id: contractId }, CONTRACT_ORPHAN_LOG);
    throw error;
  }
}

/** Spec 012's profile terms, from the agreement on file (a partner write: the version moves on). */
async function syncTerms(
  db: DbTransaction,
  partnerId: string,
  signedOn: string,
  templateVersion: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE public.fulfillment_partner
    SET terms_signed_at = ${signedOn}::date, terms_version = ${templateVersion},
        updated_at = now()
    WHERE id = ${partnerId}::uuid`);
}

/* -------------------------------------------------------------------------- */
/* edit                                                                       */
/* -------------------------------------------------------------------------- */

const ContractRow = z.object({
  id: z.uuid(),
  partner_id: z.uuid(),
  code: z.string(),
  status: z.string(),
  zone: z.string(),
  doc_kind: z.enum(CONTRACTS_CONFIG.docKinds),
  version_no: z.coerce.number().int(),
  superseded_at: z.union([z.date(), z.string()]).nullable(),
  updated_at: z.union([z.date(), z.string()]),
  uploaded_at: z.union([z.date(), z.string()]),
  bucket: z.string(),
  object_key: z.string(),
  checksum_sha256: z.string(),
});
type ContractRowValue = z.infer<typeof ContractRow>;

async function lockContract(
  db: DbTransaction,
  contractId: string,
): Promise<ContractRowValue | undefined> {
  const [row] = await db.execute(sql`
    SELECT k.id, k.partner_id, p.code, p.status, c.iana_zone AS zone, k.doc_kind, k.version_no,
           k.superseded_at, k.updated_at, k.uploaded_at, k.bucket, k.object_key, k.checksum_sha256
    FROM public.partner_contract k
    JOIN public.fulfillment_partner p ON p.id = k.partner_id
    JOIN public.country c ON c.id = p.country_id
    WHERE k.id = ${contractId}::uuid
    FOR UPDATE OF k, p`);
  return row === undefined ? undefined : ContractRow.parse(row);
}

function sameVersion(stored: Date | string, carried: string): boolean {
  return new Date(stored).getTime() === new Date(carried).getTime();
}

/** `editContractDetails(ContractDetailsEditSchema)`: dates, template, language, notice, note. */
export async function editContractDetails(
  actor: DbActor,
  input: unknown,
  overrides: Partial<ContractDeps> = {},
): Promise<ContractCommandResult> {
  const deps = depsOf(overrides);
  const target = ContractTargetSchema.safeParse(input);
  if (!target.success) {
    return { ok: false, reason: "invalid", errors: { contractId: "target" } };
  }
  return deps.run(context(actor, CONTRACT_ACTIONS.edit), async (db) => {
    const row = await lockContract(db, target.data.contractId);
    if (row === undefined) return { ok: false, reason: "not_found" };
    const parsed = parseContractDetailsEdit(
      input,
      todayInZone(row.zone, deps.now()),
      row.doc_kind,
    );
    if (!parsed.ok) {
      return { ok: false, reason: "invalid", errors: parsed.errors };
    }
    if (!sameVersion(row.updated_at, parsed.value.updatedAt)) {
      return { ok: false, reason: "conflict" };
    }
    const edit = parsed.value;
    await db.execute(sql`
      UPDATE public.partner_contract
      SET template_version = ${edit.templateVersion}, language_code = ${edit.languageCode},
          includes_dpa = ${edit.includesDpa}, signed_on = ${edit.signedOn}::date,
          effective_on = ${edit.effectiveOn}::date, review_on = ${edit.reviewOn}::date,
          notice_days = ${edit.noticeDays}, note = ${edit.note}
      WHERE id = ${row.id}::uuid`);
    if (row.doc_kind === "agreement" && row.superseded_at === null) {
      await syncTerms(db, row.partner_id, edit.signedOn, edit.templateVersion);
    }
    return {
      ok: true,
      code: row.code,
      contractId: row.id,
      versionNo: row.version_no,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* withdraw                                                                   */
/* -------------------------------------------------------------------------- */

const PreviousRow = z.object({
  id: z.uuid(),
  signed_on: z.string(),
  template_version: z.string(),
});

/** `withdrawContract(ContractWithdrawSchema)`; the object goes after the commit. */
export async function withdrawContract(
  actor: DbActor,
  input: unknown,
  overrides: Partial<ContractDeps> = {},
): Promise<ContractCommandResult> {
  const deps = depsOf(overrides);
  const parsed = parseContractWithdraw(input);
  if (!parsed.ok)
    return { ok: false, reason: "invalid", errors: parsed.errors };
  const { contractId, reason, updatedAt } = parsed.value;
  const now = deps.now();
  const result = await deps.run(
    context(actor, CONTRACT_ACTIONS.withdraw, reason),
    async (db) => {
      const row = await lockContract(db, contractId);
      if (row === undefined)
        return { ok: false as const, reason: "not_found" as const };
      // Only a current version (or an annex) is withdrawn; a superseded one stays as evidence.
      if (
        !sameVersion(row.updated_at, updatedAt) ||
        row.superseded_at !== null
      ) {
        return { ok: false as const, reason: "conflict" as const };
      }
      const windowEnds =
        new Date(row.uploaded_at).getTime() +
        CONTRACTS_CONFIG.withdrawWindowDays * 86_400_000;
      if (now.getTime() > windowEnds) {
        return { ok: false as const, reason: "window_closed" as const };
      }
      const [previousRaw] = await db.execute(sql`
        SELECT id, signed_on::text AS signed_on, template_version
        FROM public.partner_contract WHERE superseded_by = ${row.id}::uuid
        FOR UPDATE`);
      const previous =
        previousRaw === undefined ? undefined : PreviousRow.parse(previousRaw);
      const onlyAgreement =
        row.doc_kind === "agreement" &&
        row.superseded_at === null &&
        previous === undefined;
      if (onlyAgreement && row.status === "active") {
        // §14.2 A: an active florist is never left without an agreement. Paused first, through
        // the status write, with its own audit action and reason; then the delete guard passes.
        await db.execute(sql`
          SELECT set_config('app.audit_action', ${CONTRACT_ACTIONS.pause}, true),
                 set_config('app.audit_reason', ${ONLY_AGREEMENT_WITHDRAWN}, true)`);
        await db.execute(sql`
          UPDATE public.fulfillment_partner SET status = 'paused', updated_at = now()
          WHERE id = ${row.partner_id}::uuid`);
        await db.execute(sql`
          SELECT set_config('app.audit_action', ${CONTRACT_ACTIONS.withdraw}, true),
                 set_config('app.audit_reason', ${reason}, true)`);
      }
      await db.execute(
        sql`DELETE FROM public.partner_contract WHERE id = ${row.id}::uuid`,
      );
      if (previous !== undefined) {
        await db.execute(sql`
          UPDATE public.partner_contract SET superseded_at = NULL, superseded_by = NULL
          WHERE id = ${previous.id}::uuid`);
        if (row.doc_kind === "agreement") {
          await syncTerms(
            db,
            row.partner_id,
            previous.signed_on,
            previous.template_version,
          );
        }
      }
      return {
        ok: true as const,
        code: row.code,
        contractId: row.id,
        versionNo: row.version_no,
        location: { bucket: row.bucket, objectKey: row.object_key },
      };
    },
  );
  if (!result.ok) return result;
  const { storage } = await deps.store();
  await storage.delete(result.location);
  return {
    ok: true,
    code: result.code,
    contractId: result.contractId,
    versionNo: result.versionNo,
  };
}

/* -------------------------------------------------------------------------- */
/* download                                                                   */
/* -------------------------------------------------------------------------- */

export type ContractDownload =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: "not_found" | "checksum_mismatch" };

/** The file name a contract downloads as: `contract-{code}-{kind}-v{n}.pdf`. */
export function contractDownloadName(
  code: string,
  kind: ContractDocKind,
  versionNo: number,
): string {
  return `contract-${code}-${kind}-v${String(versionNo)}.pdf`;
}

/** `contractDownloadUrl(contractId, actor)`: audited, checksum-verified, 60 seconds. */
export async function contractDownloadUrl(
  actor: DbActor,
  contractId: string,
  overrides: Partial<ContractDeps> = {},
): Promise<ContractDownload> {
  const deps = depsOf(overrides);
  const id = z.uuid().safeParse(contractId);
  if (!id.success) return { ok: false, reason: "not_found" };
  const row = await deps.run(
    context(actor, CONTRACT_ACTIONS.viewed),
    async (db) => {
      const found = await lockContract(db, id.data);
      if (found === undefined) return undefined;
      await db.execute(
        sql`SELECT public.audit_record_view('partner_contract', ${found.id})`,
      );
      return found;
    },
  );
  if (row === undefined) return { ok: false, reason: "not_found" };
  const { storage } = await deps.store();
  const location = { bucket: row.bucket, objectKey: row.object_key };
  const stored = await storage.head(location);
  if (stored?.checksumSha256 !== row.checksum_sha256) {
    deps.alert(CHECKSUM_MISMATCH_ALERT, { contract_id: row.id });
    return { ok: false, reason: "checksum_mismatch" };
  }
  return {
    ok: true,
    url: await storage.getSignedUrl(
      location,
      CONTRACTS_CONFIG.signedUrlTtlSeconds,
      {
        downloadName: contractDownloadName(
          row.code,
          row.doc_kind,
          row.version_no,
        ),
      },
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* activation                                                                 */
/* -------------------------------------------------------------------------- */

/** `hasCurrentAgreement(partnerId)`: a current `agreement` row exists, in `db`. */
export async function hasCurrentAgreementIn(
  db: DbTransaction,
  partnerId: string,
): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 FROM public.partner_contract
    WHERE partner_id = ${z.uuid().parse(partnerId)}::uuid AND doc_kind = 'agreement'
      AND superseded_at IS NULL`);
  return Array.from(rows as Iterable<unknown>).length > 0;
}
