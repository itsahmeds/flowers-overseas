/**
 * The `payouts.statement_email` job (spec 030a §5.2, AC-21; artboards `email-florist-*`
 * "Statement" and `florist-payout-statement-pdf`; TASK-365): one sent payout's statement, as a PDF
 * stored private and as an email to the florist with the PDF attached.
 *
 * In one `system` transaction, with the payout row locked `FOR UPDATE`:
 *
 *  1. A payout that is still `draft` (no statement), or that already has its
 *     `statement_media_asset_id`, is done: nothing is rendered, stored or sent. A re-run of the job
 *     therefore sends nothing more (AC-21).
 *  2. The recipient is resolved now and never stored: `fulfillment_partner.contact_email`; the
 *     language is the `locale_code` of the florist's earliest owner `partner_member`, else the
 *     florist's country's (`STATEMENT_LANGUAGE_BY_COUNTRY`, §13 Q10), else `en`.
 *  3. Spec 016's pipeline claims `notification_delivery` under
 *     `(job:payouts.statement_email:{payoutId}, florist-payout-statement, {partnerId})`; only for a
 *     `queued` row does it ask for the attachment, which renders the PDF from the payout's rows,
 *     puts it in the private bucket at `payouts/{yyyy}/{payoutId}.pdf` (`yyyy` = the year of
 *     `sent_at`, UTC) through spec 002's `Storage` seam, records it as a `media_asset`
 *     (`kind = 'partner'`, `visibility = 'private'`) and sets `statement_media_asset_id`.
 *  4. The email is sent with the PDF attached, and the row is marked `sent`.
 *
 * If the send fails the transaction rolls back (no asset row, no `statement_media_asset_id`) and
 * pg-boss retries the job; the object written to the bucket is overwritten by the retry with the
 * same bytes (the PDF's creation date is `sent_at`). While `notifications.email` is off the
 * pipeline throws `NOTIFICATIONS_HELD` before anything is rendered, and the job waits.
 *
 * Logs carry the payout id and the outcome only: never the address, the florist's name or a line.
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { FLORIST_LANGUAGES, type FloristLanguage } from "@/config/florists";
import { statementCountryLanguage } from "@/config/payouts";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { Storage } from "@/lib/storage";
import type { MailAttachment, NotificationDeps } from "@/modules/notifications";
import { type OrderExecutor, withExecutor } from "@/modules/orders";

/** Where the statements live: the private bucket and the seam over it. */
export interface StatementStore {
  readonly storage: Storage;
  readonly bucket: string;
}

/** The production store: R2's private bucket; the job fails (and retries) without one. */
export async function privateStatementStore(): Promise<StatementStore> {
  const { R2Storage, r2EnvironmentFrom } = await import("@/lib/storage-r2");
  const r2 = r2EnvironmentFrom(process.env);
  if (r2.privateBucket === undefined) {
    throw new Error(
      "PAYOUT_STATEMENT_STORAGE_UNCONFIGURED: no private bucket is configured",
    );
  }
  return { storage: new R2Storage(r2.config), bucket: r2.privateBucket };
}

/** `payouts/{yyyy}/{payoutId}.pdf` (§5.2), the year the statement was sent, in UTC. */
export function statementObjectKey(payoutId: string, sentAt: Date): string {
  const id = z.uuid().parse(payoutId);
  return `payouts/${String(sentAt.getUTCFullYear())}/${id}.pdf`;
}

/** The statement PDF of a sent payout in a language: `payoutStatementPdf` of the email module. */
export type StatementPdfRenderer = (
  executor: OrderExecutor,
  payoutId: string,
  language: FloristLanguage,
) => Promise<Uint8Array>;

export interface StatementEmailDeps {
  /**
   * Required: the worker passes the email module's renderer (`src/jobs/handlers.ts`), so this
   * module and its barrel never import the statement's copy or PDFKit (plan/01 §5 boundaries).
   */
  readonly renderPdf: StatementPdfRenderer;
  readonly executor?: OrderExecutor;
  readonly store?: StatementStore;
  /** The pipeline's seams (mailer, provider, the `notifications.email` hold). */
  readonly notifications?: NotificationDeps;
  readonly log?: Logger;
}

export type StatementEmailOutcome =
  | { readonly status: "missing" | "not_sent" | "already_done" }
  | {
      readonly status: "sent" | "skipped";
      readonly mediaAssetId: string | null;
    };

const PayoutRow = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "statement_sent", "paid"]),
  statement_number: z.string().nullable(),
  sent_at: z.union([z.date(), z.string()]).nullable(),
  statement_media_asset_id: z.uuid().nullable(),
  partner_id: z.uuid(),
  contact_email: z.email(),
  country_iso2: z.string().regex(/^[A-Z]{2}$/u),
  owner_language: z.string().nullable(),
});

function languageOf(owner: string | null, iso2: string): FloristLanguage {
  const parsed = z.enum(FLORIST_LANGUAGES).safeParse(owner);
  return parsed.success ? parsed.data : statementCountryLanguage(iso2);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** spec 030a §5.2's `payouts.statement_email` job, for one payout. */
export async function runStatementEmailJob(
  payoutId: string,
  deps: StatementEmailDeps,
): Promise<StatementEmailOutcome> {
  const id = z.uuid().parse(payoutId);
  const log = deps.log ?? defaultLogger;
  return withExecutor(
    deps.executor === undefined ? undefined : { executor: deps.executor },
    "payouts.statement_email",
    async (executor) => {
      const [raw] = await executor.execute(sql`
        SELECT p.id, p.status, p.statement_number, p.sent_at, p.statement_media_asset_id,
               p.partner_id, fp.contact_email, c.iso2 AS country_iso2,
               (SELECT m.locale_code FROM partner_member m
                 WHERE m.partner_id = p.partner_id AND m.role = 'owner'
                 ORDER BY m.created_at, m.user_id LIMIT 1) AS owner_language
        FROM payout p
        JOIN fulfillment_partner fp ON fp.id = p.partner_id
        JOIN country c ON c.id = fp.country_id
        WHERE p.id = ${id}
        FOR UPDATE OF p`);
      if (raw === undefined) {
        log.warn(
          { payout_id: id, outcome: "missing" },
          "payouts.statement_email",
        );
        return { status: "missing" } as const;
      }
      const row = PayoutRow.parse(raw);
      if (
        row.status === "draft" ||
        row.statement_number === null ||
        row.sent_at === null
      ) {
        log.warn(
          { payout_id: id, outcome: "not_sent" },
          "payouts.statement_email",
        );
        return { status: "not_sent" } as const;
      }
      if (row.statement_media_asset_id !== null) {
        log.info(
          { payout_id: id, outcome: "already_done" },
          "payouts.statement_email",
        );
        return { status: "already_done" } as const;
      }
      const sentAt =
        row.sent_at instanceof Date ? row.sent_at : new Date(row.sent_at);
      const language = languageOf(row.owner_language, row.country_iso2);
      const statementNumber = row.statement_number;
      const { sendPayoutStatementNotification } =
        await import("@/modules/notifications");
      let mediaAssetId: string | null = null;
      const attach = async (): Promise<readonly MailAttachment[]> => {
        const bytes = await deps.renderPdf(executor, id, language);
        const checksum = sha256Hex(bytes);
        const objectKey = statementObjectKey(id, sentAt);
        const store = deps.store ?? (await privateStatementStore());
        await store.storage.put({
          bucket: store.bucket,
          objectKey,
          body: bytes,
          mime: "application/pdf",
          checksumSha256: checksum,
        });
        const [asset] = await executor.execute(sql`
          INSERT INTO media_asset (kind, bucket, object_key, mime, bytes, checksum_sha256,
                                   visibility, source, depicts)
          VALUES ('partner', ${store.bucket}, ${objectKey}, 'application/pdf',
                  ${bytes.byteLength}, ${checksum}, 'private', 'partner', 'context')
          RETURNING id`);
        mediaAssetId = z.object({ id: z.uuid() }).parse(asset).id;
        await executor.execute(sql`
          UPDATE payout SET statement_media_asset_id = ${mediaAssetId}, updated_at = now()
          WHERE id = ${id}`);
        return [
          {
            filename: `payout-statement-${statementNumber}.pdf`,
            contentType: "application/pdf",
            content: Buffer.from(bytes).toString("base64"),
          },
        ];
      };
      const outcome = await sendPayoutStatementNotification(
        executor,
        {
          payoutId: id,
          partnerId: row.partner_id,
          address: row.contact_email,
          locale: language,
        },
        attach,
        deps.notifications,
      );
      log.info(
        { payout_id: id, outcome, media_asset_id: mediaAssetId },
        "payouts.statement_email",
      );
      return { status: outcome, mediaAssetId } as const;
    },
  );
}
