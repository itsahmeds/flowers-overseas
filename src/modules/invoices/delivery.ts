/**
 * The stored document: `renderPdf` (the `invoice.render` job and its minute sweep), the
 * `invoice.email` enqueue, and the two readers `getPdfByInvoiceId` and `getIssuedPdf` (spec 018
 * §5.2, §11, AC-16, AC-37; TASK-342).
 *
 * **Render, once.** `renderInvoice(invoiceId)` locks the `invoice` row, and when its render
 * columns are still null renders the PDF from the snapshot (`./pdf/render.ts`), writes it to the
 * **private** bucket (`R2_PRIVATE_BUCKET`, spec 011) at `invoices/{yyyy}/{id}.pdf` through spec
 * 002's `Storage` seam with its SHA-256 declared, writes the three render columns (the one write
 * `invoice_immutable` allows, AC-16) and, for a `live` order only, enqueues
 * `invoice.email {invoiceId}` before the commit. A row already rendered is left alone and nothing
 * is enqueued, so a second run, a replayed job or a racing worker (it waits on the row lock, then
 * finds the columns set) adds no second email job (AC-37). The PDF is a function of the row, so a
 * crash between the upload and the commit re-uploads the same bytes under the same key.
 *
 * **Who runs it.** `issueInvoice` and `issueCreditNote` (TASK-341) run inside the outbox delivery
 * and enqueue nothing; the minute tick's `invoice.render_sweep` finds every unrendered document.
 * One issued less than `RENDER_WINDOW_MINUTES` ago gets an `invoice.render {invoiceId}` job (an
 * `exclusive` queue keyed by the invoice: at most one queued or running per document; 5 attempts,
 * then `invoice.render_dead`); one older than that raises `invoice.render_overdue` each minute
 * until it is rendered (§11 "an invoice not rendered 15 minutes after issue"; the runbook's
 * `pnpm invoices:render` renders it by hand).
 *
 * **Read, never render.** `getPdfByInvoiceId` reads `pdf_object_key` from the row and the bytes
 * from the private bucket through a short-lived signed read URL (the seam has no `get`), checks
 * them against `pdf_sha256` and returns them with the document's facts. It never renders: an
 * unrendered row throws `INVOICE_PDF_NOT_RENDERED`, bytes that do not hash to the row (or an
 * object that is gone) throw `INVOICE_PDF_HASH_MISMATCH`. It is a module function, never a route;
 * the download route and spec 016's B8 job are its callers.
 *
 * Logs carry the invoice id and a byte count only: never a number, a name or an object key.
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";
import type { Storage } from "@/lib/storage";
import {
  withExecutor,
  type AlertRaiser,
  type EngineConnection,
  type OrderExecutor,
} from "@/modules/orders";

import { renderInvoicePdf, type RenderOptions } from "./pdf/render";
import { SNAPSHOT_VERSION } from "./snapshot";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export const INVOICE_PDF_ERROR_CODES = [
  "INVOICE_PDF_NOT_FOUND",
  "INVOICE_PDF_NOT_RENDERED",
  "INVOICE_PDF_HASH_MISMATCH",
  "INVOICE_STORAGE_UNCONFIGURED",
] as const;
export type InvoicePdfErrorCode = (typeof INVOICE_PDF_ERROR_CODES)[number];

/** A typed failure of the stored document. The message carries the code and the id only. */
export class InvoicePdfError extends Error {
  readonly code: InvoicePdfErrorCode;
  constructor(code: InvoicePdfErrorCode, invoiceId?: string) {
    super(invoiceId === undefined ? code : `${code}: invoice ${invoiceId}`);
    this.name = "InvoicePdfError";
    this.code = code;
  }
}

export function isInvoicePdfError(error: unknown): error is InvoicePdfError {
  return error instanceof InvoicePdfError;
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

/** Where the documents live: the private bucket and the seam over it. */
export interface InvoiceStore {
  readonly storage: Storage;
  readonly bucket: string;
  /** How a signed read URL is fetched; `fetch` in production, the fake's own in tests. */
  readonly fetchObject?: (url: string) => Promise<Response>;
}

/** How long the server's own read URL into the private bucket lives. */
export const READ_URL_TTL_SECONDS = 60;

/** `invoices/{yyyy}/{id}.pdf` (§5.2), the year of issue. */
export function invoiceObjectKey(invoiceId: string, issuedAt: Date): string {
  const id = z.uuid().parse(invoiceId);
  return `invoices/${String(issuedAt.getUTCFullYear())}/${id}.pdf`;
}

/** The production store: R2's private bucket, or `INVOICE_STORAGE_UNCONFIGURED` without one. */
export async function privateInvoiceStore(): Promise<InvoiceStore> {
  const { R2Storage, r2EnvironmentFrom } = await import("@/lib/storage-r2");
  const r2 = r2EnvironmentFrom(process.env);
  if (r2.privateBucket === undefined) {
    throw new InvoicePdfError("INVOICE_STORAGE_UNCONFIGURED");
  }
  return { storage: new R2Storage(r2.config), bucket: r2.privateBucket };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/* -------------------------------------------------------------------------- */
/* Jobs this module enqueues                                                  */
/* -------------------------------------------------------------------------- */

/** One job the render path asks for. */
export type InvoiceJob =
  | { readonly name: "invoice.render"; readonly invoiceId: string }
  | { readonly name: "invoice.email"; readonly invoiceId: string };

/** Enqueues `job`; throws when it cannot (the caller's transaction rolls back). */
export type InvoiceJobScheduler = (job: InvoiceJob) => Promise<void>;

/** The correlation id of every enqueue here (`plan/11` §1's `system:{job}`). */
export const INVOICE_REQUEST_ID = "system:invoices";

/** `invoice.email:{invoiceId}`, spec 018 §5.2's singleton key. */
export function invoiceEmailKey(invoiceId: string): string {
  return `invoice.email:${invoiceId}`;
}

/**
 * A pg-boss scheduler over `DATABASE_URL_UNPOOLED` (or a scratch database in the suites): the
 * queue made sure of, then one keyed `enqueue`.
 */
export function createPgBossInvoiceScheduler(
  options: { readonly connectionString?: string } = {},
): InvoiceJobScheduler {
  return async (job) => {
    const invoiceId = z.uuid().parse(job.invoiceId);
    const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
    await withBoss(
      async (boss) => {
        await ensureQueue(boss, job.name);
        await enqueue(
          boss,
          job.name,
          { invoiceId },
          {
            requestId: INVOICE_REQUEST_ID,
            singletonKey:
              job.name === "invoice.email"
                ? invoiceEmailKey(invoiceId)
                : invoiceId,
          },
        );
      },
      options.connectionString === undefined
        ? {}
        : { connectionString: options.connectionString },
    );
  };
}

/* -------------------------------------------------------------------------- */
/* renderInvoice                                                              */
/* -------------------------------------------------------------------------- */

export interface RenderDeps extends EngineConnection {
  /** The private bucket; `privateInvoiceStore()` when absent. */
  readonly store?: InvoiceStore;
  /** Where `invoice.email` goes; pg-boss when absent. */
  readonly schedule?: InvoiceJobScheduler;
  readonly render?: RenderOptions;
  readonly log?: Logger;
}

export type RenderOutcome =
  | {
      readonly status: "rendered";
      readonly invoiceId: string;
      readonly bytes: number;
      readonly sha256: string;
      readonly emailEnqueued: boolean;
    }
  | { readonly status: "already_rendered"; readonly invoiceId: string }
  | { readonly status: "missing"; readonly invoiceId: string };

const RenderRow = z.object({
  id: z.uuid(),
  kind: z.enum(["invoice", "credit_note"]),
  number: z.string().min(1),
  issued_at: z.coerce.date(),
  snapshot: z.unknown(),
  snapshot_version: z.coerce.number().int(),
  pdf_object_key: z.string().nullable(),
  mode: z.enum(["demo", "test", "live"]),
  title_key: z.string().min(1),
  issuer_statement_key: z.string().nullable(),
});

/** Renders and stores one document, once. See the header. */
export async function renderInvoice(
  invoiceId: string,
  deps: RenderDeps = {},
): Promise<RenderOutcome> {
  const id = z.uuid().parse(invoiceId);
  const log = deps.log ?? defaultLogger;
  return withExecutor(deps, "invoice.render", async (executor) => {
    const [raw] = await executor.execute(sql`
      SELECT i.id, i.kind, i.number, i.issued_at, i.snapshot, i.snapshot_version,
             i.pdf_object_key, o.mode, p.title_key, p.issuer_statement_key
      FROM invoice i
      JOIN "order" o ON o.id = i.order_id
      JOIN invoice_profile p ON p.key = i.profile_key
      WHERE i.id = ${id}
      FOR UPDATE OF i`);
    if (raw === undefined) return { status: "missing", invoiceId: id } as const;
    const row = RenderRow.parse(raw);
    if (row.pdf_object_key !== null) {
      return { status: "already_rendered", invoiceId: id } as const;
    }
    if (row.snapshot_version !== SNAPSHOT_VERSION) {
      throw new RangeError(
        `invoice.render: snapshot version ${String(row.snapshot_version)} has no renderer`,
      );
    }
    const bytes = await renderInvoicePdf(
      {
        kind: row.kind,
        number: row.number,
        issuedAt: row.issued_at,
        snapshot: row.snapshot,
        profile: {
          titleKey: row.title_key,
          issuerStatementKey: row.issuer_statement_key,
        },
      },
      deps.render,
    );
    const sha256 = sha256Hex(bytes);
    const objectKey = invoiceObjectKey(id, row.issued_at);
    const store = deps.store ?? (await privateInvoiceStore());
    await store.storage.put({
      bucket: store.bucket,
      objectKey,
      body: bytes,
      mime: "application/pdf",
      checksumSha256: sha256,
    });
    await executor.execute(sql`
      UPDATE invoice
      SET pdf_object_key = ${objectKey}, pdf_sha256 = ${sha256}, rendered_at = now()
      WHERE id = ${id}`);
    const emailEnqueued = row.mode === "live";
    if (emailEnqueued) {
      await (deps.schedule ?? createPgBossInvoiceScheduler())({
        name: "invoice.email",
        invoiceId: id,
      });
    }
    log.info({ invoice_id: id, bytes: bytes.byteLength }, "invoice.rendered");
    return {
      status: "rendered",
      invoiceId: id,
      bytes: bytes.byteLength,
      sha256,
      emailEnqueued,
    } as const;
  });
}

/** `invoice.render`'s attempts: the first plus four retries (§11 "dead after 5 attempts"). */
export const RENDER_ATTEMPTS = 5;

/**
 * The `invoice.render` job: `renderInvoice`, and on the last attempt's failure the
 * `invoice.render_dead` alert before the error goes back to pg-boss.
 */
export async function runRenderJob(
  invoiceId: string,
  attempt: { readonly retryCount: number },
  deps: RenderDeps & { readonly alert?: AlertRaiser } = {},
): Promise<RenderOutcome> {
  try {
    return await renderInvoice(invoiceId, deps);
  } catch (error) {
    if (attempt.retryCount + 1 >= RENDER_ATTEMPTS) {
      (deps.alert ?? captureAlert)("invoice.render_dead", {
        invoice_id: invoiceId,
        attempts: attempt.retryCount + 1,
        error_class: error instanceof Error ? error.name : "Error",
      });
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* invoice.render_sweep                                                       */
/* -------------------------------------------------------------------------- */

/** How long after issue the sweep keeps a render queued before it alerts instead (§11). */
export const RENDER_WINDOW_MINUTES = 15;

/** Documents looked at per sweep. */
export const RENDER_SWEEP_BATCH = 50;

export interface SweepDeps extends EngineConnection {
  readonly schedule?: InvoiceJobScheduler;
  readonly alert?: AlertRaiser;
  readonly log?: Logger;
  readonly now?: () => Date;
}

const SweepRow = z.object({
  id: z.uuid(),
  minutes: z.coerce.number().int().nonnegative(),
});

/**
 * One minute's sweep: an `invoice.render` job for every unrendered document issued in the last
 * `RENDER_WINDOW_MINUTES`, an `invoice.render_overdue` alert for every older one.
 */
export async function runInvoiceRenderSweep(
  deps: SweepDeps = {},
): Promise<{ readonly queued: number; readonly overdue: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const alert = deps.alert ?? captureAlert;
  const log = deps.log ?? defaultLogger;
  const schedule = deps.schedule ?? createPgBossInvoiceScheduler();
  const rows = await withExecutor(
    deps,
    "invoice.render_sweep",
    (executor: OrderExecutor) =>
      executor.execute(sql`
      SELECT id,
             floor(extract(epoch FROM (${now.toISOString()}::timestamptz - issued_at)) / 60)::int
               AS minutes
      FROM invoice
      WHERE pdf_object_key IS NULL
      ORDER BY issued_at, id
      LIMIT ${RENDER_SWEEP_BATCH}`),
  );
  let queued = 0;
  let overdue = 0;
  for (const raw of rows) {
    const row = SweepRow.parse(raw);
    if (row.minutes < RENDER_WINDOW_MINUTES) {
      await schedule({ name: "invoice.render", invoiceId: row.id });
      queued += 1;
      continue;
    }
    overdue += 1;
    log.error(
      { invoice_id: row.id, minutes: row.minutes, job: "invoice.render_sweep" },
      "invoice.render_overdue",
    );
    alert("invoice.render_overdue", {
      invoice_id: row.id,
      minutes: row.minutes,
    });
  }
  return { queued, overdue };
}

/* -------------------------------------------------------------------------- */
/* Readers                                                                    */
/* -------------------------------------------------------------------------- */

export interface StoredInvoicePdf {
  readonly invoiceId: string;
  readonly kind: "invoice" | "credit_note";
  readonly number: string;
  readonly orderId: string;
  readonly totalMinor: number;
  readonly currencyCode: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface ReadDeps extends EngineConnection {
  readonly store?: InvoiceStore;
}

const StoredRow = z.object({
  id: z.uuid(),
  kind: z.enum(["invoice", "credit_note"]),
  number: z.string().min(1),
  order_id: z.uuid(),
  total_minor: z.coerce.number().int(),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  pdf_object_key: z.string().nullable(),
  pdf_sha256: z.string().nullable(),
});

/** `FO-PL/2026/000001` → `FO-PL-2026-000001.pdf`: a file name with no path separator. */
export function invoiceFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}

async function readObject(
  store: InvoiceStore,
  objectKey: string,
): Promise<Uint8Array | null> {
  const url = await store.storage.getSignedUrl(
    { bucket: store.bucket, objectKey },
    READ_URL_TTL_SECONDS,
  );
  const response = await (store.fetchObject ?? ((u: string) => fetch(u)))(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `invoice read: the private bucket answered ${String(response.status)}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The stored PDF of one invoice or credit note, checked against its hash (§5.2, AC-37). See the
 * header for what it throws.
 */
export async function getPdfByInvoiceId(
  invoiceId: string,
  deps: ReadDeps = {},
): Promise<StoredInvoicePdf> {
  const id = z.uuid().parse(invoiceId);
  const [raw] = await withExecutor(deps, "invoice.read", (executor) =>
    executor.execute(sql`
      SELECT id, kind, number, order_id, total_minor, currency_code, pdf_object_key, pdf_sha256
      FROM invoice WHERE id = ${id}`),
  );
  if (raw === undefined) throw new InvoicePdfError("INVOICE_PDF_NOT_FOUND", id);
  const row = StoredRow.parse(raw);
  if (row.pdf_object_key === null || row.pdf_sha256 === null) {
    throw new InvoicePdfError("INVOICE_PDF_NOT_RENDERED", id);
  }
  const store = deps.store ?? (await privateInvoiceStore());
  const bytes = await readObject(store, row.pdf_object_key);
  const sha256 = bytes === null ? null : sha256Hex(bytes);
  if (bytes === null || sha256 !== row.pdf_sha256) {
    throw new InvoicePdfError("INVOICE_PDF_HASH_MISMATCH", id);
  }
  return {
    invoiceId: row.id,
    kind: row.kind,
    number: row.number,
    orderId: row.order_id,
    totalMinor: row.total_minor,
    currencyCode: row.currency_code,
    filename: invoiceFilename(row.number),
    bytes,
    sha256,
  };
}

/**
 * The order's invoice PDF for spec 016's B1: `null` while the order has no invoice (not yet
 * issued, a demo or test order, `invoice.issue` off); otherwise `getPdfByInvoiceId`, which throws
 * `INVOICE_PDF_NOT_RENDERED` while the render is pending.
 */
export async function getIssuedPdf(
  orderId: string,
  deps: ReadDeps = {},
): Promise<StoredInvoicePdf | null> {
  const id = z.uuid().parse(orderId);
  const [raw] = await withExecutor(deps, "invoice.read", (executor) =>
    executor.execute(sql`
      SELECT id FROM invoice WHERE order_id = ${id} AND kind = 'invoice'`),
  );
  if (raw === undefined) return null;
  return getPdfByInvoiceId(z.object({ id: z.uuid() }).parse(raw).id, deps);
}
