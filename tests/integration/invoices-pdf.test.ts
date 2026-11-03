/**
 * Spec 018 invoice PDF and delivery, connected half (TASK-342), on a migrated PG16 scratch
 * database (`support/scratch-db.ts`; never the shared database). Each document is an `invoice`
 * row written here with a snapshot from `tests/fixtures/invoice-documents.ts` for an order whose
 * lines, total and `vat_breakdown` match it, and rendered with `renderInvoice` into an
 * `InMemoryStorage` standing in for the private bucket.
 *
 * Why the rows are written here and not by `issueInvoice`: on `main`, TASK-341's `issueInvoice`
 * and `issueCreditNote` read `payment.order_id`, which migration `0026_payment_purchase`
 * dropped, so neither runs against the migrated schema (escalated in `docs/tasks/TASK-342.md`).
 * Rendering reads only the `invoice` row and its profile, so the render half is proved
 * independently of the issuing half.
 *
 *  - **T-16 (render half) / AC-16:** the first render writes the three columns; a second write of
 *    them raises `INVOICE_IMMUTABLE`; a second render writes nothing.
 *  - **T-17 / AC-17:** the stored `principal/PL` PDF of the AC-17 order carries every listed
 *    field; its total is `order.buyer_total_minor`, its gross per rate `order.vat_breakdown`; the
 *    PLN line at the snapshot's rate (AC-19).
 *  - **T-18 / AC-18:** the profile's words switched by SQL only: the agent title and a test-only
 *    statement, the same renderer, no source change.
 *  - **T-37 / AC-37:** a live invoice and its credit note rendered: one `invoice.email` job per
 *    document in pg-boss, none added by a second render; a `test` order's document: none; the
 *    getter returns the private bucket's bytes with sha-256 and metadata; null render columns:
 *    `INVOICE_PDF_NOT_RENDERED`; one byte flipped or the object gone:
 *    `INVOICE_PDF_HASH_MISMATCH`; no route but the signed download reads it.
 *  - **T-23 (link half) / AC-23:** the signed link: 200 with the stored bytes; no link, a tracking
 *    token as `t`, an expired link, a link with no expiry, another invoice's link, an unrendered
 *    invoice: 404.
 *  - **T-40 / AC-40:** the stored PDF of an order whose florist's name is a marker: no relay
 *    word, no marker, no partner id.
 *  - The sweep and the job: every unrendered document is queued, one 15 minutes old also alerts; the
 *    fifth failed attempt alerts `invoice.render_dead`.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { relayMatches } from "@/config/honesty";
import { createLogger, type Logger } from "@/lib/logger";
import { sign } from "@/lib/signed-link";
import { InMemoryStorage, type Storage } from "@/lib/storage";
import { formatMoney } from "@/modules/i18n";
import {
  createPgBossInvoiceScheduler,
  getIssuedPdf,
  getPdfByInvoiceId,
  invoiceDownloadPath,
  invoiceDownloadResponse,
  InvoicePdfError,
  invoiceTranslator,
  renderInvoice,
  runInvoiceRenderSweep,
  runRenderJob,
  type CreditNoteSnapshot,
  type InvoiceJob,
  type InvoiceSnapshot,
  type InvoiceStore,
  type InvoiceTranslatorFactory,
} from "@/modules/invoices";
import type { AlertRaiser } from "@/modules/orders";

import {
  AC17_INVOICE,
  AC21_CREDIT_NOTE,
} from "../fixtures/invoice-documents.ts";
import { insertPlacedOrder } from "../fixtures/order-state.ts";
import { pdfText } from "../fixtures/pdf-text.ts";
import {
  country,
  customer,
  partner,
  recipient,
  unique,
} from "./support/rows.ts";
import {
  probeLocalServer,
  rolledBack,
  scratchDatabase,
  type ScratchDatabase,
  type Tx,
} from "./support/scratch-db.ts";
import { runnerOf } from "./support/sql-runner.ts";

const server = await probeLocalServer();

const SECRET = "test-signed-link-secret-0123456789abcdef";
const BUCKET = "fo-private-test";

function silentLogger(): Logger {
  return createLogger({ level: "debug", write: () => undefined });
}

function alerts(): AlertRaiser & {
  raised: { alert: string; fields: Record<string, unknown> }[];
} {
  const raised: { alert: string; fields: Record<string, unknown> }[] = [];
  const raise: AlertRaiser = (alert, fields) => {
    raised.push({ alert, fields: { ...fields } });
  };
  return Object.assign(raise, { raised });
}

function store(): InvoiceStore & { readonly memory: InMemoryStorage } {
  const memory = new InMemoryStorage();
  return {
    memory,
    storage: memory,
    bucket: BUCKET,
    fetchObject: (url) => memory.fetch(url),
  };
}

function scheduler(): ((job: InvoiceJob) => Promise<void>) & {
  jobs: InvoiceJob[];
} {
  const jobs: InvoiceJob[] = [];
  return Object.assign(
    (job: InvoiceJob) => {
      jobs.push(job);
      return Promise.resolve();
    },
    { jobs },
  );
}

/** The two seed profiles (`seed/plan.ts`) and the `en-gb` locale the buyer reads. */
async function profiles(tx: Tx): Promise<void> {
  await country(tx, "PL");
  await tx`INSERT INTO locale (code, bcp47, name) VALUES ('en-gb', 'en-GB', 'English (UK)')
           ON CONFLICT DO NOTHING`;
  await tx`INSERT INTO invoice_profile (key, supply_model, destination_iso2, document_kind,
                                        title_key, label_locales, vat_bearing_line_kinds,
                                        series_key, credit_series_key, vat_currency_code,
                                        vat_rate_source, active)
           VALUES ('principal-pl', 'principal', 'PL', 'vat_invoice', 'invoice.title.vatInvoice',
                   ARRAY['pl', '{buyer}'], ARRAY['product', 'addon', 'surcharge'],
                   'fo-pl-2026', 'fok-pl-2026', 'PLN', 'nbp_previous_business_day', true),
                  ('agent-pl', 'agent', 'PL', 'receipt_on_behalf',
                   'invoice.title.receiptOnBehalf', ARRAY['pl', '{buyer}'], ARRAY['surcharge'],
                   'fo-pl-2026', 'fok-pl-2026', 'PLN', 'nbp_previous_business_day', false)`;
}

/** An order of AC-17's lines (an 8 % bouquet, a 23 % add-on, a free card), paid in GBP. */
async function order(tx: Tx, mode: "test" | "live" = "live"): Promise<string> {
  const countryId = await country(tx, "PL");
  const customerId = await customer(tx);
  const id = await insertPlacedOrder(tx, {
    countryId,
    customerId,
    recipientId: await recipient(tx, customerId),
    mode,
    currencyCode: "GBP",
    totalMinor: AC17_INVOICE.totals.grossMinor,
  });
  const breakdown = AC17_INVOICE.byRate.map((split) => ({
    rateBp: split.rateBp,
    grossMinor: split.grossMinor,
    vatMinor: split.vatMinor,
    netMinor: split.netMinor,
  }));
  await tx`UPDATE "order"
           SET vat_breakdown = ${tx.json(breakdown)}, supply_model = 'principal',
               locale_code = 'en-gb'
           WHERE id = ${id}`;
  return id;
}

/** Writes an invoice (or a credit note correcting `corrects`) for `orderId`, unrendered. */
async function document(
  tx: Tx,
  orderId: string,
  options: {
    readonly snapshot?: InvoiceSnapshot | CreditNoteSnapshot;
    readonly corrects?: string;
    readonly profileKey?: string;
  } = {},
): Promise<string> {
  const snapshot = options.snapshot ?? AC17_INVOICE;
  const credit = snapshot.kind === "credit_note";
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO invoice (kind, order_id, corrects_invoice_id, series_key, number, issued_at,
                         supply_date, currency_code, total_minor, profile_key, snapshot,
                         snapshot_version)
    VALUES (${snapshot.kind}, ${orderId}, ${options.corrects ?? null},
            ${credit ? "fok-pl-2026" : "fo-pl-2026"},
            ${`${credit ? "FOK-PL" : "FO-PL"}/2026/${unique("")}`},
            now(), ${snapshot.supplyDate}::date, ${snapshot.currency},
            ${snapshot.totals.grossMinor}, ${options.profileKey ?? "principal-pl"},
            ${tx.json(JSON.parse(JSON.stringify(snapshot)) as never)}, 1)
    RETURNING id`;
  if (row === undefined) throw new Error("no invoice row");
  return row.id;
}

function renderDeps(
  tx: Tx,
  files: InvoiceStore,
  schedule: (job: InvoiceJob) => Promise<void>,
  translator?: InvoiceTranslatorFactory,
) {
  return {
    executor: runnerOf(tx),
    store: files,
    schedule,
    log: silentLogger(),
    ...(translator === undefined ? {} : { render: { translator } }),
  };
}

interface Row {
  number: string;
  pdf_object_key: string | null;
  pdf_sha256: string | null;
  rendered_at: Date | null;
  issued_at: Date;
}

async function rowOf(tx: Tx, invoiceId: string): Promise<Row> {
  const [row] = await tx<Row[]>`
    SELECT number, pdf_object_key, pdf_sha256, rendered_at, issued_at
    FROM invoice WHERE id = ${invoiceId}`;
  if (row === undefined) throw new Error("no invoice row");
  return row;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof InvoicePdfError) return error.code;
    throw error;
  }
  return undefined;
}

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const gbp = (amountMinor: number) =>
  formatMoney({ amountMinor, currency: "GBP" }, "en-gb").replace(/\s+/g, " ");
const pln = (amountMinor: number) =>
  formatMoney({ amountMinor, currency: "PLN" }, "en-gb").replace(/\s+/g, " ");
const HOUR = 3_600_000;

describe.skipIf(server.url === undefined)(
  `spec 018 invoice PDF and delivery (TASK-342)${server.url === undefined ? ` (skipped: ${server.reason})` : ""}`,
  () => {
    let scratch: ScratchDatabase;

    beforeAll(async () => {
      scratch = await scratchDatabase(server.url as string, "invoices_pdf");
    }, 600_000);

    afterAll(async () => {
      await scratch.drop();
    });

    it("AC-16 (render half): one render writes the three columns; a second write raises INVOICE_IMMUTABLE; a second render writes nothing", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const invoiceId = await document(tx, await order(tx));
        const before = await rowOf(tx, invoiceId);
        const files = store();
        const jobs = scheduler();
        const first = await renderInvoice(
          invoiceId,
          renderDeps(tx, files, jobs),
        );
        const after = await rowOf(tx, invoiceId);
        const second = await renderInvoice(
          invoiceId,
          renderDeps(tx, files, jobs),
        );
        const again = await rowOf(tx, invoiceId);
        const secondWrite = await tx
          .savepoint(
            (sp) => sp`UPDATE invoice
                       SET pdf_object_key = 'invoices/2026/other.pdf',
                           pdf_sha256 = ${"0".repeat(64)}, rendered_at = now()
                       WHERE id = ${invoiceId}`,
          )
          .then(
            () => "no error",
            (error: unknown) => (error as Error).message,
          );
        const stored = await files.memory.head({
          bucket: BUCKET,
          objectKey: after.pdf_object_key ?? "",
        });
        return {
          invoiceId,
          before,
          first,
          after,
          second,
          again,
          secondWrite,
          stored,
          jobs: jobs.jobs,
        };
      });
      expect(result.before.pdf_object_key).toBeNull();
      expect(result.first.status).toBe("rendered");
      const year = String(result.after.issued_at.getUTCFullYear());
      expect(result.after.pdf_object_key).toBe(
        `invoices/${year}/${result.invoiceId}.pdf`,
      );
      expect(result.after.pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(result.after.rendered_at).not.toBeNull();
      expect(result.stored?.checksumSha256).toBe(result.after.pdf_sha256);
      expect(result.stored?.mime).toBe("application/pdf");
      expect(result.second.status).toBe("already_rendered");
      expect(result.again).toEqual(result.after);
      expect(result.secondWrite).toMatch(/^INVOICE_IMMUTABLE/);
      expect(result.jobs).toEqual([
        { name: "invoice.email", invoiceId: result.invoiceId },
      ]);
    });

    it("AC-17 and AC-19: the stored principal/PL PDF carries every field; its total is buyer_total_minor and its gross per rate vat_breakdown; VAT in PLN at the stored rate", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const orderId = await order(tx);
        const invoiceId = await document(tx, orderId);
        const files = store();
        await renderInvoice(invoiceId, renderDeps(tx, files, scheduler()));
        const pdf = await getPdfByInvoiceId(invoiceId, {
          executor: runnerOf(tx),
          store: files,
        });
        const [orderRow] = await tx<
          {
            buyer_total_minor: string;
            vat_breakdown: { rateBp: number; grossMinor: number }[];
          }[]
        >`SELECT buyer_total_minor::text, vat_breakdown FROM "order" WHERE id = ${orderId}`;
        return {
          text: pdfText(pdf.bytes).replace(/\s+/g, " "),
          pdf,
          order: orderRow,
        };
      });
      const { text, pdf } = result;
      for (const expected of [
        "Faktura / Invoice",
        "Sprzedawca / Seller Test Seller LLC",
        "1 Test Street",
        "00001 Testville",
        "Kod rejestrowy / Registry code: Test Register TEST-0001",
        "VAT EE: EE000000000",
        "VAT PL: PL0000000000",
        "Nabywca / Buyer Sam Sample Wielka Brytania / United Kingdom",
        `Numer / Number ${pdf.number}`,
        "Data wystawienia / Issue date 6 Oct 2026",
        "Data dostawy / Supply date 8 Oct 2026",
        "Zamówienie / Order FO-7K2M-9QXA",
        "Waluta / Currency GBP",
        `1 Amber Hour 8% ${gbp(4_590)}`,
        `2 Bombonierka / Box of chocolates 23% ${gbp(600)}`,
        `3 Drukowany bilecik / Printed card 8% ${gbp(0)}`,
        `Razem 8% / Total 8% 8% ${gbp(4_250)} ${gbp(340)} ${gbp(4_590)}`,
        `Razem 23% / Total 23% 23% ${gbp(488)} ${gbp(112)} ${gbp(600)}`,
        `Do zapłaty / Total ${gbp(4_738)} ${gbp(452)} ${gbp(5_190)}`,
        "Kurs NBP, tabela A nr 193/A/NBP/2026",
        `8%: VAT ${pln(1_742)}`,
        `23%: VAT ${pln(574)}`,
      ]) {
        expect(text).toContain(expected);
      }
      expect(pdf.totalMinor).toBe(Number(result.order?.buyer_total_minor));
      expect(
        AC17_INVOICE.byRate.map((split) => [split.rateBp, split.grossMinor]),
      ).toEqual(
        result.order?.vat_breakdown.map((entry) => [
          entry.rateBp,
          entry.grossMinor,
        ]),
      );
    });

    it("AC-18: the profile's title and statement switched by SQL only print in the same renderer", async () => {
      const statement: InvoiceTranslatorFactory = (locale) => {
        const translate = invoiceTranslator(locale);
        return (key, values) =>
          key === "invoice.statement.test"
            ? "Test-only issuer statement."
            : translate(key, values);
      };
      const texts = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const orderId = await order(tx);
        const principalId = await document(tx, orderId);
        const files = store();
        await renderInvoice(
          principalId,
          renderDeps(tx, files, scheduler(), statement),
        );
        // The flip of AC-18, by SQL only: principal/PL off, agent/PL on with a statement.
        await tx`UPDATE invoice_profile SET active = false WHERE key = 'principal-pl'`;
        await tx`UPDATE invoice_profile
                 SET active = true, issuer_statement_key = 'invoice.statement.test'
                 WHERE key = 'agent-pl'`;
        const agentSnapshot: InvoiceSnapshot = {
          ...AC17_INVOICE,
          profileKey: "agent-pl",
        };
        const agentId = await document(tx, await order(tx), {
          snapshot: agentSnapshot,
          profileKey: "agent-pl",
        });
        await renderInvoice(
          agentId,
          renderDeps(tx, files, scheduler(), statement),
        );
        const read = { executor: runnerOf(tx), store: files };
        return {
          principal: pdfText(
            (await getPdfByInvoiceId(principalId, read)).bytes,
          ).replace(/\s+/g, " "),
          agent: pdfText(
            (await getPdfByInvoiceId(agentId, read)).bytes,
          ).replace(/\s+/g, " "),
        };
      });
      expect(texts.principal).toContain("Faktura / Invoice");
      expect(texts.principal).not.toContain("Test-only issuer statement.");
      expect(texts.agent).toContain("Pokwitowanie / Receipt");
      expect(texts.agent).not.toContain("Faktura / Invoice");
      expect(texts.agent).toContain("Test-only issuer statement.");
    });

    it("AC-37: one invoice.email job per document in pg-boss, none added by a second render; a test order's document enqueues none", async () => {
      const schedule = createPgBossInvoiceScheduler({
        connectionString: scratch.url,
      });
      const ids = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const orderId = await order(tx);
        const invoiceId = await document(tx, orderId);
        const creditId = await document(tx, orderId, {
          snapshot: AC21_CREDIT_NOTE,
          corrects: invoiceId,
        });
        const testId = await document(tx, await order(tx, "test"));
        const deps = renderDeps(tx, store(), schedule);
        const outcomes: string[] = [];
        for (let round = 0; round < 2; round += 1) {
          for (const id of [invoiceId, creditId, testId]) {
            outcomes.push((await renderInvoice(id, deps)).status);
          }
        }
        return { invoiceId, creditId, testId, outcomes };
      });
      expect(ids.outcomes).toEqual([
        "rendered",
        "rendered",
        "rendered",
        "already_rendered",
        "already_rendered",
        "already_rendered",
      ]);
      const jobs = await scratch.sql<
        { singleton_key: string; data: { payload: { invoiceId: string } } }[]
      >`SELECT singleton_key, data FROM pgboss.job WHERE name = 'invoice.email'`;
      const count = (id: string) =>
        jobs.filter((job) => job.singleton_key === `invoice.email:${id}`)
          .length;
      expect(count(ids.invoiceId)).toBe(1);
      expect(count(ids.creditId)).toBe(1);
      expect(count(ids.testId)).toBe(0);
      expect(
        jobs
          .filter(
            (job) => job.singleton_key === `invoice.email:${ids.creditId}`,
          )
          .map((job) => job.data.payload),
      ).toEqual([{ invoiceId: ids.creditId }]);
    });

    it("the sweep's ask is idempotent on the exclusive invoice.render queue: two asks, one job, with five attempts", async () => {
      const schedule = createPgBossInvoiceScheduler({
        connectionString: scratch.url,
      });
      const invoiceId = randomUUID();
      await schedule({ name: "invoice.render", invoiceId });
      await schedule({ name: "invoice.render", invoiceId });
      const jobs = await scratch.sql<{ retry_limit: number }[]>`
        SELECT retry_limit FROM pgboss.job
        WHERE name = 'invoice.render' AND singleton_key = ${invoiceId}`;
      expect(jobs).toEqual([{ retry_limit: 4 }]);
    });

    it("AC-37: getPdfByInvoiceId returns the private bucket's bytes for the invoice and the credit note; unrendered, a flipped byte and a missing object throw", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const orderId = await order(tx);
        const invoiceId = await document(tx, orderId);
        const creditId = await document(tx, orderId, {
          snapshot: AC21_CREDIT_NOTE,
          corrects: invoiceId,
        });
        const files = store();
        const read = { executor: runnerOf(tx), store: files };
        const unrendered = await codeOf(getPdfByInvoiceId(invoiceId, read));
        const unrenderedIssued = await codeOf(getIssuedPdf(orderId, read));
        await renderInvoice(invoiceId, renderDeps(tx, files, scheduler()));
        await renderInvoice(creditId, renderDeps(tx, files, scheduler()));
        const invoicePdf = await getPdfByInvoiceId(invoiceId, read);
        const creditPdf = await getPdfByInvoiceId(creditId, read);
        const viaOrder = await getIssuedPdf(orderId, read);
        const noInvoice = await getIssuedPdf(await order(tx), read);
        const invoiceRow = await rowOf(tx, invoiceId);
        const creditRow = await rowOf(tx, creditId);
        // One byte flipped in the stored object.
        const flipped = new Uint8Array(invoicePdf.bytes);
        flipped[200] = (flipped[200] ?? 0) ^ 0x01;
        await files.memory.put({
          bucket: BUCKET,
          objectKey: invoiceRow.pdf_object_key ?? "",
          body: flipped,
          mime: "application/pdf",
        });
        const afterFlip = await codeOf(getPdfByInvoiceId(invoiceId, read));
        await files.memory.delete({
          bucket: BUCKET,
          objectKey: creditRow.pdf_object_key ?? "",
        });
        const afterDelete = await codeOf(getPdfByInvoiceId(creditId, read));
        const unknown = await codeOf(getPdfByInvoiceId(randomUUID(), read));
        return {
          orderId,
          invoiceId,
          creditId,
          unrendered,
          unrenderedIssued,
          invoicePdf,
          creditPdf,
          viaOrder,
          noInvoice,
          invoiceRow,
          creditRow,
          afterFlip,
          afterDelete,
          unknown,
        };
      });
      expect(result.unrendered).toBe("INVOICE_PDF_NOT_RENDERED");
      expect(result.unrenderedIssued).toBe("INVOICE_PDF_NOT_RENDERED");
      expect(result.invoicePdf).toMatchObject({
        invoiceId: result.invoiceId,
        kind: "invoice",
        number: result.invoiceRow.number,
        orderId: result.orderId,
        totalMinor: 5_190,
        currencyCode: "GBP",
        filename: `${result.invoiceRow.number.replaceAll("/", "-")}.pdf`,
        sha256: result.invoiceRow.pdf_sha256,
      });
      expect(sha256(result.invoicePdf.bytes)).toBe(
        result.invoiceRow.pdf_sha256,
      );
      expect(result.creditPdf).toMatchObject({
        invoiceId: result.creditId,
        kind: "credit_note",
        number: result.creditRow.number,
        orderId: result.orderId,
        totalMinor: -600,
        currencyCode: "GBP",
        sha256: result.creditRow.pdf_sha256,
      });
      expect(sha256(result.creditPdf.bytes)).toBe(result.creditRow.pdf_sha256);
      expect(result.viaOrder?.invoiceId).toBe(result.invoiceId);
      expect(result.noInvoice).toBeNull();
      expect(result.afterFlip).toBe("INVOICE_PDF_HASH_MISMATCH");
      expect(result.afterDelete).toBe("INVOICE_PDF_HASH_MISMATCH");
      expect(result.unknown).toBe("INVOICE_PDF_NOT_FOUND");
    });

    it("AC-37: no route reads the stored PDF except the signed download", () => {
      const appRoot = path.join(process.cwd(), "src", "app");
      const readers: string[] = [];
      const walk = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(entry.name)) {
            const source = readFileSync(full, "utf8");
            if (
              /getPdfByInvoiceId|getIssuedPdf|invoiceDownloadResponse/.test(
                source,
              )
            ) {
              readers.push(path.relative(appRoot, full));
            }
          }
        }
      };
      walk(appRoot);
      expect(readers).toEqual([
        path.join(
          "[locale]",
          "(account)",
          "account",
          "invoices",
          "[invoiceId]",
          "route.ts",
        ),
      ]);
    });

    it("AC-23 (signed-link half): 200 for a valid invoice link; 404 for no link, a tracking token, an expired link, a link without expiry, another invoice's link, an unrendered invoice", async () => {
      const now = new Date();
      const link = { secret: SECRET, now: () => now };
      const tokenOf = (pathWithQuery: string) =>
        new URL(pathWithQuery, "https://example.test").searchParams.get("t");
      const result = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const invoiceId = await document(tx, await order(tx));
        const otherId = await document(tx, await order(tx));
        const files = store();
        await renderInvoice(invoiceId, renderDeps(tx, files, scheduler()));
        const deps = {
          executor: runnerOf(tx),
          store: files,
          link,
          log: silentLogger(),
        };
        const later = new Date(now.getTime() + HOUR);
        const valid = tokenOf(
          invoiceDownloadPath(invoiceId, "en-gb", later, link),
        );
        const params = { locale: "en-gb", invoiceId };
        const ok = await invoiceDownloadResponse(params, valid, deps);
        const okBytes = new Uint8Array(await ok.arrayBuffer());
        const answers = {
          noLink: await invoiceDownloadResponse(params, null, deps),
          trackingToken: await invoiceDownloadResponse(
            params,
            sign(
              "track",
              { publicToken: "A".repeat(22), version: 1 },
              undefined,
              link,
            ),
            deps,
          ),
          trackingPurposeSamePayload: await invoiceDownloadResponse(
            params,
            sign("track", { invoiceId }, later, link),
            deps,
          ),
          expired: await invoiceDownloadResponse(
            params,
            tokenOf(
              invoiceDownloadPath(
                invoiceId,
                "en-gb",
                new Date(now.getTime() - 1),
                link,
              ),
            ),
            deps,
          ),
          noExpiry: await invoiceDownloadResponse(
            params,
            sign("invoice", { invoiceId }, undefined, link),
            deps,
          ),
          otherInvoice: await invoiceDownloadResponse(
            params,
            tokenOf(invoiceDownloadPath(otherId, "en-gb", later, link)),
            deps,
          ),
          unrendered: await invoiceDownloadResponse(
            { locale: "en-gb", invoiceId: otherId },
            tokenOf(invoiceDownloadPath(otherId, "en-gb", later, link)),
            deps,
          ),
          badLocale: await invoiceDownloadResponse(
            { locale: "xx", invoiceId },
            valid,
            deps,
          ),
          badId: await invoiceDownloadResponse(
            { locale: "en-gb", invoiceId: "nope" },
            valid,
            deps,
          ),
        };
        const bodies: Record<
          string,
          {
            status: number;
            robots: string | null;
            cache: string | null;
            body: string;
          }
        > = {};
        for (const [name, answer] of Object.entries(answers)) {
          bodies[name] = {
            status: answer.status,
            robots: answer.headers.get("x-robots-tag"),
            cache: answer.headers.get("cache-control"),
            body: await answer.text(),
          };
        }
        return { ok, okBytes, bodies, row: await rowOf(tx, invoiceId) };
      });
      expect(result.ok.status).toBe(200);
      expect(result.ok.headers.get("content-type")).toBe("application/pdf");
      expect(result.ok.headers.get("content-disposition")).toBe(
        `attachment; filename="${result.row.number.replaceAll("/", "-")}.pdf"`,
      );
      expect(result.ok.headers.get("cache-control")).toBe("private, no-store");
      expect(result.ok.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(result.ok.headers.get("referrer-policy")).toBe("no-referrer");
      expect(sha256(result.okBytes)).toBe(result.row.pdf_sha256);
      for (const [name, answer] of Object.entries(result.bodies)) {
        expect(answer, name).toEqual({
          status: 404,
          robots: "noindex, nofollow",
          cache: "private, no-store",
          body: "",
        });
      }
    });

    it("the route file answers 404 to a request with no link, before any read", async () => {
      const route =
        await import("../../src/app/[locale]/(account)/account/invoices/[invoiceId]/route");
      const invoiceId = randomUUID();
      const response = await route.GET(
        new Request(`https://example.test/en-gb/account/invoices/${invoiceId}`),
        { params: Promise.resolve({ locale: "en-gb", invoiceId }) },
      );
      expect(response.status).toBe(404);
    });

    it("AC-40: the stored PDF of an order whose florist name is a marker: no relay word, no marker, no partner id", async () => {
      const marker = `MARKER${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      const result = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const orderId = await order(tx);
        const countryId = await country(tx, "PL");
        const partnerId = await partner(tx, countryId, "active");
        await tx`UPDATE fulfillment_partner
                 SET legal_name = ${marker}, display_first_name = ${marker}
                 WHERE id = ${partnerId}`;
        await tx`INSERT INTO order_assignment (order_id, partner_id, sla_expires_at,
                                               responded_at, response, attempt)
                 VALUES (${orderId}, ${partnerId}, now() + interval '1 hour', now(), 'accept', 1)`;
        const invoiceId = await document(tx, orderId);
        const files = store();
        await renderInvoice(invoiceId, renderDeps(tx, files, scheduler()));
        const pdf = await getPdfByInvoiceId(invoiceId, {
          executor: runnerOf(tx),
          store: files,
        });
        return { partnerId, text: pdfText(pdf.bytes) };
      });
      for (const locale of ["en", "en-gb", "de", "pl"]) {
        expect(relayMatches(result.text, locale)).toEqual([]);
      }
      expect(result.text).not.toContain(result.partnerId);
      expect(result.text).not.toMatch(
        new RegExp(`${marker}|on behalf of|w imieniu|im Namen|partner`, "i"),
      );
      expect(result.text.replace(/\s+/g, " ")).toContain(
        "Sprzedawca / Seller Test Seller LLC",
      );
    });

    it("the sweep asks a render for every unrendered document and alerts one 15 minutes old; the fifth failed attempt alerts invoice.render_dead", async () => {
      const result = await rolledBack(scratch.sql, async (tx) => {
        await profiles(tx);
        const invoiceId = await document(tx, await order(tx));
        const { issued_at: issuedAt } = await rowOf(tx, invoiceId);
        const sweep = async (minutes: number) => {
          const jobs = scheduler();
          const spy = alerts();
          const counts = await runInvoiceRenderSweep({
            executor: runnerOf(tx),
            schedule: jobs,
            alert: spy,
            log: silentLogger(),
            now: () => new Date(issuedAt.getTime() + minutes * 60_000 + 1_000),
          });
          return { counts, jobs: jobs.jobs, alerts: spy.raised };
        };
        const fresh = await sweep(14);
        const old = await sweep(15);
        const brokenStorage: Storage = {
          objectKey: () => "",
          put: () => Promise.reject(new Error("bucket unreachable")),
          head: () => Promise.resolve(null),
          getSignedUrl: () => Promise.resolve(""),
          delete: () => Promise.resolve(),
        };
        const broken: InvoiceStore = { storage: brokenStorage, bucket: BUCKET };
        const attempts: string[][] = [];
        for (const retryCount of [0, 3, 4]) {
          const spy = alerts();
          await tx
            .savepoint((sp) =>
              runRenderJob(
                invoiceId,
                { retryCount },
                { ...renderDeps(sp, broken, scheduler()), alert: spy },
              ),
            )
            .catch(() => undefined);
          attempts.push(spy.raised.map((entry) => entry.alert));
        }
        return { invoiceId, fresh, old, attempts };
      });
      expect(result.fresh).toEqual({
        counts: { queued: 1, overdue: 0 },
        jobs: [{ name: "invoice.render", invoiceId: result.invoiceId }],
        alerts: [],
      });
      expect(result.old).toEqual({
        counts: { queued: 1, overdue: 1 },
        jobs: [{ name: "invoice.render", invoiceId: result.invoiceId }],
        alerts: [
          {
            alert: "invoice.render_overdue",
            fields: { invoice_id: result.invoiceId, minutes: 15 },
          },
        ],
      });
      expect(result.attempts).toEqual([[], [], ["invoice.render_dead"]]);
    });
  },
);
