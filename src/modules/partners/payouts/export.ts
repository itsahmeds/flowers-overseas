/**
 * The Wise bulk-payment export and payment (spec 030a §2.6, §5.2 `minorToDecimalString`,
 * `wiseCsv`, `createWiseExport`, `wiseExportFile`, `cancelExport`, `markPaid`, `markExportPaid`,
 * §5.4, §8 "Logs and PII", "Security"; AC-24 to AC-28; TASK-366).
 *
 * **The one formatting path outside `Intl`.** `minorToDecimalString` writes an amount for Wise's
 * parser, never for a person: `.` as the decimal separator, no grouping, the currency's own
 * exponent (`149.00` for 14900 at 2, `149` at 0, `1.234` for 1234 at 3). Every amount a person
 * reads still goes through `formatMoney` (spec 030a §7).
 *
 * **The file.** `wiseCsv(rows, header)` is RFC 4180: a cell holding `"`, `,`, CR or LF is quoted
 * with its quotes doubled; records end in CRLF; UTF-8 with no BOM; rows in statement-number
 * order. A cell that begins with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` before quoting
 * (CSV formula injection, §8 "Security"). The columns are the configured header's, filled by
 * name (§5.2 `wiseExportFile`); a column 030a does not fill is left empty. The bytes depend only
 * on the export's rows, so two downloads are identical. The file is built in memory and returned:
 * it is never written to disk, R2 or a log, and no log line carries a name, a recipient id or a
 * cell (§8).
 *
 * **The commands** run in the caller's admin transaction (TASK-367's actions check
 * `payouts.manage` first) and write one audit row each:
 *
 *  - `createWiseExport`: 1 to 1000 distinct `statement_sent` payouts not in an active export,
 *    whose florists all have a Wise recipient id (`PAYOUT_WISE_RECIPIENT_MISSING` names the
 *    florist codes); refusals write nothing;
 *  - `cancelExport`: refuses `PAYOUT_EXPORT_PAID` when any of its payouts is paid; else sets
 *    `cancelled_at` and frees its payouts for a new export;
 *  - `markPaid` / `markExportPaid`: a `statement_sent` payout in an active export becomes `paid`
 *    with `paid_at` (the database's `payout_status_guard` admits exactly this step).
 */
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { PAYOUTS_CONFIG } from "@/config/payouts";
import {
  CSV_MAX_EXPONENT,
  csvDocument,
  csvText,
  csvTextCell,
  unsignedDecimalString,
} from "@/lib/csv";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import type { OrderExecutor } from "@/modules/orders";

import { type PayoutActor, PayoutActorSchema } from "./accrual";
import { PayoutError } from "./amount";
import { writePayoutAudit } from "./audit";

/* -------------------------------------------------------------------------- */
/* Pure                                                                       */
/* -------------------------------------------------------------------------- */

/** The largest exponent a currency in this system has (ISO 4217 uses 0 to 4). */
const MAX_EXPONENT = CSV_MAX_EXPONENT;

/**
 * spec 030a §5.2 `minorToDecimalString(amountMinor, exponent)`: the machine form of an amount.
 * Refuses a negative amount, a fractional or unsafe number, and an exponent outside 0..4. Spec
 * 030b moved the digits to `src/lib/csv.ts` (`unsignedDecimalString`), the one writer both files use.
 */
export function minorToDecimalString(
  amountMinor: bigint | number,
  exponent: number,
): string {
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError("an amount in minor units is a whole number");
  }
  if (BigInt(amountMinor) < 0n) {
    throw new RangeError("a transfer amount is not negative");
  }
  return unsignedDecimalString(amountMinor, exponent);
}

/** One cell: neutralised against formula injection, then quoted when RFC 4180 needs it. */
export const csvCell = csvTextCell;

/** One payout as the Wise file needs it. */
export const WiseRowSchema = z
  .object({
    legalName: z.string().min(1),
    recipientId: z.string().regex(/^[0-9]{1,20}$/u),
    sourceCurrency: z.string().regex(/^[A-Z]{3}$/u),
    targetCurrency: z.string().regex(/^[A-Z]{3}$/u),
    amountMinor: z.bigint().nonnegative(),
    exponent: z.number().int().min(0).max(MAX_EXPONENT),
    statementNumber: z.string().regex(/^P-[0-9]{6}$/u),
  })
  .strict();
export type WiseRow = z.infer<typeof WiseRowSchema>;

/** What each header column holds, by name; a name not here is left empty. */
function cellsOf(row: WiseRow): Readonly<Record<string, string>> {
  return {
    name: row.legalName,
    recipientId: row.recipientId,
    sourceCurrency: row.sourceCurrency,
    targetCurrency: row.targetCurrency,
    // A fixed **target** payment: the amount is in the florist's currency (§13 Q8).
    amountCurrency: row.targetCurrency,
    amount: minorToDecimalString(row.amountMinor, row.exponent),
    paymentReference: row.statementNumber,
  };
}

/**
 * spec 030a §5.2 `wiseCsv(rows, header)`: the file, as a string (encode it as UTF-8, no BOM).
 * Written by `src/lib/csv.ts`'s `csvDocument` (spec 030b): every Wise cell is a text cell, as it
 * always was, so the bytes are unchanged.
 */
export function wiseCsv(
  rows: readonly WiseRow[],
  header: readonly string[] = PAYOUTS_CONFIG.wise.header,
): string {
  const parsed = rows.map((row) => WiseRowSchema.parse(row));
  const ordered = [...parsed].sort((a, b) =>
    a.statementNumber < b.statementNumber
      ? -1
      : a.statementNumber > b.statementNumber
        ? 1
        : 0,
  );
  return csvDocument(
    header,
    ordered.map((row) => {
      const cells = cellsOf(row);
      return header.map((column) => csvText(cells[column] ?? ""));
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/** spec 030a §5.2 `WiseExportCreateSchema`. */
export const WiseExportCreateSchema = z
  .object({
    payoutIds: z
      .array(z.uuid())
      .min(1)
      .max(PAYOUTS_CONFIG.wise.maxRows)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "each payout once",
      }),
  })
  .strict();
export type WiseExportCreate = z.infer<typeof WiseExportCreateSchema>;

/** A refusal that names the florists it is about (codes only, never a name). */
export class WiseRecipientMissing extends PayoutError {
  readonly partnerCodes: readonly string[];

  constructor(partnerCodes: readonly string[]) {
    super(
      "PAYOUT_WISE_RECIPIENT_MISSING",
      `no Wise recipient id for ${partnerCodes.join(", ")}`,
    );
    this.partnerCodes = partnerCodes;
  }
}

export type CreateExportResult =
  | { readonly ok: true; readonly exportId: string }
  | { readonly ok: false; readonly reason: "invalid" };

const ExportPayoutRow = z.object({
  id: z.uuid(),
  status: z.string(),
  export_id: z.uuid().nullable(),
  currency_code: z.string(),
  total_minor: z.coerce.bigint(),
  partner_code: z.string(),
  wise_recipient_id: z.string().nullable(),
});
const IdRow = z.object({ id: z.uuid() });

/** `ARRAY[$1, $2, …]::uuid[]`: Drizzle expands a bare array parameter into a list. */
function uuidArray(ids: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
}

export interface ExportDeps {
  readonly log?: Logger;
}

/** spec 030a §5.2 `createWiseExport(WiseExportCreateSchema, actor)`. */
export async function createWiseExport(
  executor: OrderExecutor,
  input: unknown,
  actor: PayoutActor,
  deps: ExportDeps = {},
): Promise<CreateExportResult> {
  const who = PayoutActorSchema.parse(actor);
  const parsed = WiseExportCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const ids = [...parsed.data.payoutIds].sort();
  const rows = (
    await executor.execute(sql`
      SELECT p.id, p.status, p.export_id, p.currency_code, p.total_minor::text AS total_minor,
             fp.code AS partner_code, fp.wise_recipient_id
      FROM payout p JOIN fulfillment_partner fp ON fp.id = p.partner_id
      WHERE p.id = ANY(${uuidArray(ids)})
      ORDER BY p.id
      FOR UPDATE OF p`)
  ).map((row) => ExportPayoutRow.parse(row));
  if (rows.length !== ids.length) {
    throw new PayoutError("PAYOUT_NOT_FOUND", "a selected payout is gone");
  }
  const notSent = rows.filter((row) => row.status !== "statement_sent");
  if (notSent.length > 0) {
    throw new PayoutError(
      "PAYOUT_STATUS_ILLEGAL",
      `${String(notSent.length)} selected payout(s) are not sent statements`,
    );
  }
  if (rows.some((row) => row.export_id !== null)) {
    throw new PayoutError(
      "PAYOUT_IN_EXPORT",
      "a selected payout is in an active export",
    );
  }
  const missing = [
    ...new Set(
      rows
        .filter((row) => row.wise_recipient_id === null)
        .map((row) => row.partner_code),
    ),
  ].sort();
  if (missing.length > 0) throw new WiseRecipientMissing(missing);

  const [created] = await executor.execute(sql`
    INSERT INTO payout_export (source_currency_code, created_by)
    VALUES (${PAYOUTS_CONFIG.wise.sourceCurrency}, ${who.userId}::uuid)
    RETURNING id`);
  const exportId = IdRow.parse(created).id;
  await executor.execute(sql`
    UPDATE payout SET export_id = ${exportId}
    WHERE id = ANY(${uuidArray(ids)})`);
  const totals: Record<string, string> = {};
  for (const row of rows) {
    totals[row.currency_code] = (
      BigInt(totals[row.currency_code] ?? "0") + row.total_minor
    ).toString();
  }
  await writePayoutAudit(executor, who, {
    action: "payout_export.created",
    entityTable: "payout_export",
    entityId: exportId,
    after: { payout_ids: ids, totals_minor: totals },
  });
  (deps.log ?? defaultLogger).info(
    { export_id: exportId, row_count: rows.length, totals_minor: totals },
    "payouts.export_created",
  );
  return { ok: true, exportId };
}

const ExportRow = z.object({
  id: z.uuid(),
  cancelled: z.boolean(),
});
const FileRow = z.object({
  legal_name: z.string(),
  wise_recipient_id: z.string().nullable(),
  source_currency_code: z.string(),
  currency_code: z.string(),
  total_minor: z.coerce.bigint(),
  exponent: z.coerce.number().int(),
  statement_number: z.string(),
});

/** The CSV of one export and its download name. */
export interface WiseExportFile {
  readonly filename: string;
  readonly body: string;
  readonly rowCount: number;
}

/**
 * spec 030a §5.2 `wiseExportFile(exportId)`: the bytes of an active export. A cancelled export
 * refuses `PAYOUT_EXPORT_CANCELLED` (its payouts are free again; uploading its file would pay
 * them twice). The caller logs the download with `logAdminRead('payout_export', id)`.
 */
export async function wiseExportFile(
  executor: OrderExecutor,
  exportId: string,
): Promise<WiseExportFile> {
  const id = z.uuid().parse(exportId);
  const [found] = await executor.execute(sql`
    SELECT id, cancelled_at IS NOT NULL AS cancelled FROM payout_export WHERE id = ${id}`);
  if (found === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `export ${id}`);
  }
  if (ExportRow.parse(found).cancelled) {
    throw new PayoutError("PAYOUT_EXPORT_CANCELLED", `export ${id}`);
  }
  const rows = (
    await executor.execute(sql`
      SELECT fp.legal_name, fp.wise_recipient_id, x.source_currency_code, p.currency_code,
             p.total_minor::text AS total_minor, cur.minor_unit_exponent AS exponent,
             p.statement_number
      FROM payout p
      JOIN payout_export x ON x.id = p.export_id
      JOIN fulfillment_partner fp ON fp.id = p.partner_id
      JOIN currency cur ON cur.code = p.currency_code
      WHERE p.export_id = ${id}
      ORDER BY p.statement_number`)
  ).map((row) => FileRow.parse(row));
  const body = wiseCsv(
    rows.map((row) => {
      if (row.wise_recipient_id === null) {
        throw new PayoutError(
          "PAYOUT_WISE_RECIPIENT_MISSING",
          `export ${id} has a florist without a Wise recipient id`,
        );
      }
      return {
        legalName: row.legal_name,
        recipientId: row.wise_recipient_id,
        sourceCurrency: row.source_currency_code,
        targetCurrency: row.currency_code,
        amountMinor: row.total_minor,
        exponent: row.exponent,
        statementNumber: row.statement_number,
      };
    }),
  );
  return { filename: `wise-${id}.csv`, body, rowCount: rows.length };
}

/** spec 030a §5.2 `cancelExport(exportId, actor)`. */
export async function cancelExport(
  executor: OrderExecutor,
  exportId: string,
  actor: PayoutActor,
): Promise<void> {
  const id = z.uuid().parse(exportId);
  const who = PayoutActorSchema.parse(actor);
  const [found] = await executor.execute(sql`
    SELECT id, cancelled_at IS NOT NULL AS cancelled FROM payout_export
    WHERE id = ${id} FOR UPDATE`);
  if (found === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `export ${id}`);
  }
  if (ExportRow.parse(found).cancelled) return;
  const payouts = await executor.execute(sql`
    SELECT id, status FROM payout WHERE export_id = ${id} ORDER BY id FOR UPDATE`);
  if (
    payouts.some(
      (row) => z.object({ status: z.string() }).parse(row).status === "paid",
    )
  ) {
    throw new PayoutError(
      "PAYOUT_EXPORT_PAID",
      `export ${id} has a paid payout`,
    );
  }
  await executor.execute(sql`
    UPDATE payout SET export_id = NULL WHERE export_id = ${id}`);
  await executor.execute(sql`
    UPDATE payout_export SET cancelled_at = now() WHERE id = ${id}`);
  await writePayoutAudit(executor, who, {
    action: "payout_export.cancelled",
    entityTable: "payout_export",
    entityId: id,
    before: { payout_count: payouts.length },
    after: { cancelled: true },
  });
}

const PaidRow = z.object({
  id: z.uuid(),
  status: z.string(),
  export_id: z.uuid().nullable(),
  export_cancelled: z.boolean().nullable(),
});

async function payOne(
  executor: OrderExecutor,
  payoutId: string,
  who: PayoutActor,
): Promise<void> {
  const [found] = await executor.execute(sql`
    SELECT p.id, p.status, p.export_id, x.cancelled_at IS NOT NULL AS export_cancelled
    FROM payout p LEFT JOIN payout_export x ON x.id = p.export_id
    WHERE p.id = ${payoutId}
    FOR UPDATE OF p`);
  if (found === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `payout ${payoutId}`);
  }
  const payout = PaidRow.parse(found);
  if (payout.status !== "statement_sent") {
    throw new PayoutError(
      "PAYOUT_STATUS_ILLEGAL",
      `payout ${payoutId} is ${payout.status}`,
    );
  }
  if (payout.export_id === null || payout.export_cancelled === true) {
    throw new PayoutError(
      "PAYOUT_NOT_EXPORTED",
      `payout ${payoutId} is in no active export`,
    );
  }
  await executor.execute(sql`
    UPDATE payout SET status = 'paid', paid_at = now() WHERE id = ${payoutId}`);
  await writePayoutAudit(executor, who, {
    action: "payout.paid",
    entityTable: "payout",
    entityId: payoutId,
    before: { status: "statement_sent" },
    after: { status: "paid", export_id: payout.export_id },
  });
}

/** spec 030a §5.2 `markPaid(payoutId, actor)`. */
export async function markPaid(
  executor: OrderExecutor,
  payoutId: string,
  actor: PayoutActor,
  deps: ExportDeps = {},
): Promise<void> {
  const id = z.uuid().parse(payoutId);
  const who = PayoutActorSchema.parse(actor);
  await payOne(executor, id, who);
  (deps.log ?? defaultLogger).info({ payout_id: id }, "payouts.paid");
}

/** spec 030a §5.2 `markExportPaid(exportId, actor)`: every sent payout of an active export. */
export async function markExportPaid(
  executor: OrderExecutor,
  exportId: string,
  actor: PayoutActor,
  deps: ExportDeps = {},
): Promise<{ readonly paid: number }> {
  const id = z.uuid().parse(exportId);
  const who = PayoutActorSchema.parse(actor);
  const [found] = await executor.execute(sql`
    SELECT id, cancelled_at IS NOT NULL AS cancelled FROM payout_export
    WHERE id = ${id} FOR UPDATE`);
  if (found === undefined) {
    throw new PayoutError("PAYOUT_NOT_FOUND", `export ${id}`);
  }
  if (ExportRow.parse(found).cancelled) {
    throw new PayoutError("PAYOUT_EXPORT_CANCELLED", `export ${id}`);
  }
  const due = await executor.execute(sql`
    SELECT id FROM payout WHERE export_id = ${id} AND status = 'statement_sent'
    ORDER BY id`);
  for (const row of due) {
    await payOne(executor, IdRow.parse(row).id, who);
  }
  (deps.log ?? defaultLogger).info(
    { export_id: id, paid: due.length },
    "payouts.paid",
  );
  return { paid: due.length };
}

/* -------------------------------------------------------------------------- */
/* The download                                                               */
/* -------------------------------------------------------------------------- */

/** The audit action of the read transaction behind a download (the view row is `logAdminRead`'s). */
export const WISE_EXPORT_READ_ACTION = "payout_export.read" as const;

/** Reads one export's file in its own admin transaction (the route's read). */
export type WiseExportReader = (
  actor: { readonly userId: string; readonly requestId: string },
  exportId: string,
) => Promise<WiseExportFile>;

export const readWiseExportFile: WiseExportReader = async (actor, exportId) => {
  const [{ withAdminContext }, { withExecutor }] = await Promise.all([
    import("@/lib/db"),
    import("@/modules/orders"),
  ]);
  return withAdminContext({ ...actor, action: WISE_EXPORT_READ_ACTION }, (db) =>
    withExecutor({ db }, "payouts.export_file", (executor) =>
      wiseExportFile(executor, exportId),
    ),
  );
};

/**
 * The CSV response (spec 030a §5.4): UTF-8 with no BOM, `no-store`, an attachment named
 * `wise-{exportId}.csv`, `noindex`. The headers' values come from the caller (the admin header
 * constants), so this module names no admin path.
 */
export function wiseCsvResponse(
  file: WiseExportFile,
  headers: Readonly<Record<string, string>>,
): Response {
  return new Response(new TextEncoder().encode(file.body), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}
