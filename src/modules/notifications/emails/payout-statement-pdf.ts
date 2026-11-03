/**
 * The florist's payout statement as an A4 PDF (spec 030a §5.2 `payouts.statement_email`, §5.3
 * "The florist statement", §7; AC-21, AC-22, AC-23; artboard
 * `docs/design/wireframes/florist-payout-statement-pdf.dc.html`; TASK-365).
 *
 * **Spec 018's PDFKit setup, shared with the invoice** (`src/modules/invoices/pdf/render.ts`):
 * `tagged: true` with a `Document` structure tree in reading order (header, meta, parties, table,
 * payment, fine print), `/Lang` from the florist's language, a title shown in the viewer, the
 * PDF/UA identifier, A4, the invoice's 42 pt margins, ink and rule colours, 2 pt ink rules and
 * tabular end-aligned amounts, and the same embedded Noto Sans faces (`invoiceFonts()`), so
 * "Kwiaciarnia pod Lipą" extracts as typed. Rules and the page number are artifacts.
 *
 * **Words.** Every word is `payoutStatementWords(view)`'s: the same `emails.floristPayoutStatement.*`
 * keys and data fields as the email, and nothing else (AC-23). No VAT figure, no buyer, recipient,
 * card message, retail price or token: the view cannot hold one (AC-22).
 *
 * **Bytes.** The creation date is the payout's `sent_at`, so the same sent payout renders the same
 * bytes; the job stores them once at `payouts/{yyyy}/{payoutId}.pdf`.
 */
import PDFDocument from "pdfkit";

import { COMPANY, isCompanyRegistered } from "@/config/company";
import { TRADING_NAME } from "@/config/company.data";
import { formatNumber } from "@/modules/i18n";
import { type InvoiceFonts, invoiceFonts } from "@/modules/invoices";

import type { EmailTranslator } from "./copy";
import type { LocaleCode } from "@/config/locales";
import {
  type PayoutStatementView,
  type StatementWords,
  payoutStatementWords,
} from "./payout-statement";

const PAGE = { width: 595.28, height: 841.89, margin: 42 } as const;
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const SIZE = {
  body: 8.6,
  small: 7.5,
  label: 7.5,
  title: 17,
  brand: 13,
} as const;
const LINE_GAP = 2;
/** The invoice's ink, muted ink and rule (`--color-ink`, `--color-ink-2`, `--color-rule`). */
const INK = "#24203f";
const INK_MUTED = "#4f4a66";
const RULE = "#d8d6e3";
const BODY_BOTTOM = PAGE.height - PAGE.margin - 24;

/** The artboard's four columns: order, delivery date, bouquet, amount. */
const COLUMNS = (() => {
  const fractions = [0.2, 0.2, 0.42, 0.18] as const;
  let x = PAGE.margin;
  return fractions.map((fraction) => {
    const width = fraction * CONTENT_WIDTH;
    const column = { x, width };
    x += width;
    return column;
  });
})();

type Doc = PDFKit.PDFDocument;
type Struct = PDFKit.PDFStructureElement;

interface Context {
  readonly doc: Doc;
  readonly root: Struct;
  readonly words: StatementWords;
  y: number;
}

interface TextOptions {
  readonly x?: number;
  readonly width?: number;
  readonly align?: "left" | "right";
  readonly bold?: boolean;
  readonly size?: number;
  readonly color?: string;
}

function write(ctx: Context, value: string, options: TextOptions = {}): number {
  const { doc } = ctx;
  const width = options.width ?? CONTENT_WIDTH;
  doc
    .font(options.bold === true ? "bold" : "regular")
    .fontSize(options.size ?? SIZE.body)
    .fillColor(options.color ?? INK);
  const height = doc.heightOfString(value, { width, lineGap: LINE_GAP });
  doc.text(value, options.x ?? PAGE.margin, ctx.y, {
    width,
    align: options.align ?? "left",
    lineGap: LINE_GAP,
  });
  return height;
}

function element(
  ctx: Context,
  parent: Struct,
  type: string,
  value: string,
  options: TextOptions = {},
): number {
  let height = 0;
  parent.add(
    ctx.doc.struct(type, {}, () => {
      height = write(ctx, value, options);
    }),
  );
  return height;
}

function ensureRoom(ctx: Context, height: number): void {
  if (ctx.y + height <= BODY_BOTTOM) return;
  ctx.doc.addPage();
  ctx.y = PAGE.margin;
}

function rule(ctx: Context, weight: number): void {
  const { doc } = ctx;
  doc.markContent("Artifact", { type: "Layout" });
  doc
    .save()
    .lineWidth(weight)
    .strokeColor(weight > 1 ? INK : RULE)
    .moveTo(PAGE.margin, ctx.y)
    .lineTo(PAGE.width - PAGE.margin, ctx.y)
    .stroke()
    .restore();
  doc.endMarkedContent();
}

function paragraph(
  ctx: Context,
  parent: Struct,
  value: string,
  options: TextOptions = {},
): void {
  ensureRoom(ctx, (options.size ?? SIZE.body) * 2);
  ctx.y += element(ctx, parent, "P", value, options) + 2;
}

function header(ctx: Context): void {
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  const top = ctx.y;
  element(ctx, section, "P", TRADING_NAME, { bold: true, size: SIZE.brand });
  ctx.y = top;
  const titleHeight = element(ctx, section, "H1", ctx.words.documentTitle, {
    bold: true,
    size: SIZE.title,
    align: "right",
  });
  ctx.y = top + titleHeight;
  const numberHeight = element(ctx, section, "P", ctx.words.number, {
    align: "right",
    color: INK_MUTED,
  });
  section.end();
  ctx.y = top + Math.max(titleHeight + numberHeight, SIZE.brand * 1.4) + 6;
  rule(ctx, 2);
  ctx.y += 10;
}

function labelled(
  ctx: Context,
  parent: Struct,
  label: string,
  values: readonly string[],
): void {
  ensureRoom(ctx, SIZE.body * 2 * Math.max(1, values.length));
  const top = ctx.y;
  const labelHeight = element(ctx, parent, "P", label, {
    width: CONTENT_WIDTH * 0.3,
    color: INK_MUTED,
    size: SIZE.label,
  });
  let height = 0;
  for (const [index, value] of values.entries()) {
    ctx.y = top + height;
    height +=
      element(ctx, parent, "P", value, {
        x: PAGE.margin + CONTENT_WIDTH * 0.3,
        width: CONTENT_WIDTH * 0.7,
        bold: index === 0 && values.length > 1,
      }) + 1;
  }
  ctx.y = top + Math.max(labelHeight, height) + 2;
}

function meta(ctx: Context): void {
  const { words } = ctx;
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  labelled(ctx, section, words.numberLabel, [words.number]);
  labelled(ctx, section, words.periodLabel, [words.period]);
  labelled(ctx, section, words.sentLabel, [words.sent]);
  labelled(ctx, section, words.currencyLabel, [words.currency]);
  section.end();
  ctx.y += 6;
}

/** Our identity (the legal name and address once the company is registered), then the florist. */
function parties(ctx: Context): void {
  const { words } = ctx;
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  const ours: string[] = [TRADING_NAME];
  if (isCompanyRegistered() && COMPANY.legalName !== undefined) {
    ours.push(COMPANY.legalName);
    if (COMPANY.address !== undefined) {
      ours.push(
        [
          ...COMPANY.address.lines,
          COMPANY.address.postalCode,
          COMPANY.address.city,
        ].join(", "),
      );
    }
  }
  labelled(ctx, section, words.fromLabel, ours);
  labelled(ctx, section, words.forLabel, [
    words.partnerName,
    words.partnerCode,
  ]);
  section.end();
  ctx.y += 8;
}

function tableRow(
  ctx: Context,
  parent: Struct,
  cells: readonly (readonly string[])[],
  header: boolean,
): void {
  const tr = ctx.doc.struct("TR");
  parent.add(tr);
  const top = ctx.y;
  let height = 0;
  cells.forEach((lines, index) => {
    const column = COLUMNS[index];
    if (column === undefined) return;
    let y = top;
    const cell = ctx.doc.struct(header ? "TH" : "TD");
    tr.add(cell);
    lines.forEach((value, lineIndex) => {
      if (value === "") return;
      cell.add(
        ctx.doc.struct("Span", {}, () => {
          ctx.y = y;
          y +=
            write(ctx, value, {
              x: column.x,
              width: column.width - 6,
              align: index === 3 ? "right" : "left",
              bold: header,
              size: header || lineIndex > 0 ? SIZE.small : SIZE.body,
              color: header || lineIndex > 0 ? INK_MUTED : INK,
            }) + 1;
        }),
      );
    });
    cell.end();
    height = Math.max(height, y - top);
  });
  tr.end();
  ctx.y = top + Math.max(height, SIZE.body * 1.4) + 4;
  rule(ctx, 0.5);
  ctx.y += 4;
}

function table(ctx: Context): void {
  const { words } = ctx;
  const node = ctx.doc.struct("Table");
  ctx.root.add(node);
  ensureRoom(ctx, SIZE.body * 4);
  tableRow(
    ctx,
    node,
    [
      [words.head.order],
      [words.head.date],
      [words.head.bouquet],
      [words.head.amount],
    ],
    true,
  );
  for (const line of words.lines) {
    ensureRoom(ctx, SIZE.body * (3 + line.itemSmall.length));
    tableRow(
      ctx,
      node,
      [
        [line.reference],
        [line.date],
        [line.item, ...line.itemSmall],
        [line.amount],
      ],
      false,
    );
  }
  ensureRoom(ctx, SIZE.body * 3);
  rule(ctx, 2);
  ctx.y += 6;
  tableRow(ctx, node, [[""], [""], [words.totalLabel], [words.total]], false);
  node.end();
  ctx.y += 6;
}

function payment(ctx: Context): void {
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  labelled(ctx, section, ctx.words.paymentLabel, [ctx.words.paymentMethod]);
  section.end();
  ctx.y += 8;
}

function finePrint(ctx: Context): void {
  const { words } = ctx;
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  for (const value of [words.notInvoice, words.deleteReminder, words.help]) {
    paragraph(ctx, section, value, { size: SIZE.small, color: INK_MUTED });
  }
  section.end();
}

function pageNumbers(ctx: Context): void {
  const { doc, words } = ctx;
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.markContent("Artifact", { type: "Pagination" });
    doc
      .font("regular")
      .fontSize(SIZE.small)
      .fillColor(INK_MUTED)
      .text(
        words.t("emails.floristPayoutStatement.page", {
          page: formatNumber(index + 1, words.language),
          pages: formatNumber(range.count, words.language),
        }),
        PAGE.margin,
        PAGE.height - PAGE.margin - 8,
        { width: CONTENT_WIDTH, align: "right", lineBreak: false },
      );
    doc.endMarkedContent();
    doc.page.margins.bottom = bottom;
  }
}

export interface StatementPdfOptions {
  readonly fonts?: InvoiceFonts;
  /** Injectable so the suite can record the keys the PDF reads. */
  readonly translator?: (locale: LocaleCode) => EmailTranslator;
}

/** The statement's PDF bytes: a function of the view (and the fonts). */
export async function renderPayoutStatementPdf(
  view: PayoutStatementView,
  options: StatementPdfOptions = {},
): Promise<Uint8Array> {
  const words = payoutStatementWords(view, options.translator);
  const fonts = options.fonts ?? invoiceFonts();
  // As the invoice: `@types/pdfkit` lags PDFKit 0.20's font buffer and `PDF/UA` subset options.
  const pdfOptions = {
    size: "A4",
    margin: PAGE.margin,
    font: fonts.regular,
    tagged: true,
    lang: words.language,
    pdfVersion: "1.7",
    subset: "PDF/UA",
    displayTitle: true,
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: `${words.documentTitle} ${words.number}`,
      Author: TRADING_NAME,
      Producer: TRADING_NAME,
      Creator: TRADING_NAME,
      CreationDate: view.sentAt,
      ModDate: view.sentAt,
    },
  };
  const doc = new PDFDocument(
    pdfOptions as unknown as PDFKit.PDFDocumentOptions,
  );
  doc.registerFont("regular", fonts.regular);
  doc.registerFont("bold", fonts.bold);
  const chunks: Buffer[] = [];
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });
  const root = doc.struct("Document");
  doc.addStructure(root);
  const ctx: Context = { doc, root, words, y: PAGE.margin };
  header(ctx);
  meta(ctx);
  parties(ctx);
  table(ctx);
  payment(ctx);
  finePrint(ctx);
  root.end();
  pageNumbers(ctx);
  doc.end();
  return done;
}
