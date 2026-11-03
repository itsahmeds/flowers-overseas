/**
 * The invoice and credit-note PDF (spec 018 §5.2 `renderPdf`, §7, §8 "Accessibility", AC-17,
 * AC-18, AC-19, AC-22, AC-40; artboard `docs/design/wireframes/invoice-pdf.dc.html`; TASK-342).
 *
 * **From the snapshot and the profile only.** Every figure and every word of a party, a line or a
 * total is read from `invoice.snapshot` (`InvoiceSnapshotV1` / `CreditNoteSnapshotV1`, parsed
 * here again); the profile gives only the title key and the optional issuer statement key. No
 * live order row is read, so a re-render of a stored document prints what was issued.
 *
 * **Gross method.** The snapshot holds each line's gross and, per VAT rate, the net, VAT and gross
 * computed on the rate's group total (round half to even, `../vat.ts`). So each line prints its
 * rate and gross, and each rate prints its net, VAT and gross: the figures the buyer was charged,
 * with no per-line VAT that the snapshot does not hold (Polish VAT Act art. 106e(7)-(8) allows an
 * invoice issued on gross prices to show line values gross). The line table and the rate rows
 * share one six-column grid, as the artboard draws it.
 *
 * **Second VAT currency (AC-19).** When the snapshot carries `vatRate` (the profile's
 * `vat_currency_code` differs from the invoice currency), each rate's VAT is also printed in that
 * currency at the stored rate, with the source, table number and date. The conversion is
 * `vat × rate`, rounded to the nearest minor unit, half away from zero (art. 106e(11): "końcówki
 * 0,5 grosza i wyższe zaokrągla się do 1 grosza"), in integer arithmetic over the rate's decimal
 * text: never a float.
 *
 * **The file (AC-22).** PDFKit with `tagged: true` (a `StructTreeRoot`, `/MarkInfo << /Marked true
 * >>`), `lang` (`/Lang`, the first label locale), PDF/UA metadata, A4, and Noto Sans embedded as a
 * subset (`./fonts`, Latin with its extensions, Greek and Cyrillic), so "Zażółć gęślą jaźń" and
 * "Größe" extract as typed. A name in Hebrew or Arabic script is set in Noto Sans Hebrew or Noto
 * Sans Arabic, one run per name, so the shaper lays it out right to left (and joins Arabic)
 * rather than printing missing-glyph boxes. Rules and the page number are artifacts; every text run sits in a
 * structure element in reading order: header, meta, seller, buyer, table, second-currency VAT,
 * payment line, fine print. The creation date is the issue instant, so a re-render of the same
 * document produces the same bytes.
 *
 * **Wording (AC-40).** We are the seller: the document names the issuer from the snapshot and no
 * one else. No fulfilment party, no "on behalf of" line; the only statement slot is the profile's
 * `issuer_statement_key`, which the active `principal/PL` profile leaves null.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { TRADING_NAME } from "@/config/company.data";
import {
  currencyConfig,
  isCurrencyCode,
  type CurrencyCode,
} from "@/config/currencies";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercentFromBasisPoints,
  formatRegionName,
} from "@/modules/i18n";

import {
  CreditNoteSnapshotV1,
  InvoiceSnapshotV1,
  type CreditNoteSnapshot,
  type InvoiceSnapshot,
} from "../snapshot";

import {
  invoiceWords,
  LABEL_SEPARATOR,
  type InvoiceTranslatorFactory,
  type InvoiceWords,
} from "./labels";

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

/** The profile's two words, read from `invoice_profile` by `profile_key`. */
export interface RenderProfile {
  readonly titleKey: string;
  readonly issuerStatementKey: string | null;
}

/** One stored document, as `invoice` holds it. */
export interface RenderableDocument {
  readonly kind: "invoice" | "credit_note";
  readonly number: string;
  /** `invoice.issued_at`: the PDF's creation date, so the bytes are a function of the row. */
  readonly issuedAt: Date;
  readonly snapshot: unknown;
  readonly profile: RenderProfile;
}

export interface RenderOptions {
  readonly translator?: InvoiceTranslatorFactory;
  readonly fonts?: InvoiceFonts;
}

/** The two embedded faces. */
export interface InvoiceFonts {
  readonly regular: Buffer;
  readonly bold: Buffer;
  /** Noto Sans Hebrew and Noto Sans Arabic: the scripts Noto Sans itself does not cover. */
  readonly hebrew: Buffer;
  readonly arabic: Buffer;
}

/** The credit note's title; an invoice's comes from its profile. */
export const CREDIT_NOTE_TITLE_KEY = "invoice.title.creditNote";

/** The title keys the seed profiles name (`seed/plan.ts`), so the catalogue scan finds them. */
export const PROFILE_TITLE_KEYS = [
  "invoice.title.vatInvoice",
  "invoice.title.receiptOnBehalf",
] as const;

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Where the faces live, relative to the working directory: the repository root in the suites and
 * scripts, the standalone server's root in the container (`next.config.ts` traces the folder into
 * it with `outputFileTracingIncludes`).
 */
export const FONT_DIRECTORY = path.join(
  "src",
  "modules",
  "invoices",
  "pdf",
  "fonts",
);

let cachedFonts: InvoiceFonts | undefined;

/** Noto Sans Regular and Bold, read once per process. */
export function invoiceFonts(): InvoiceFonts {
  cachedFonts ??= {
    regular: readFileSync(
      path.join(process.cwd(), FONT_DIRECTORY, "NotoSans-Regular.ttf"),
    ),
    bold: readFileSync(
      path.join(process.cwd(), FONT_DIRECTORY, "NotoSans-Bold.ttf"),
    ),
    hebrew: readFileSync(
      path.join(process.cwd(), FONT_DIRECTORY, "NotoSansHebrew-Regular.ttf"),
    ),
    arabic: readFileSync(
      path.join(process.cwd(), FONT_DIRECTORY, "NotoSansArabic-Regular.ttf"),
    ),
  };
  return cachedFonts;
}

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `amountMinor` of `from` in `to` at `rate` (the decimal text of "1 from = rate to"), to the
 * nearest minor unit of `to`, half away from zero. Integer arithmetic only.
 */
export function convertMinor(
  amountMinor: number,
  rate: string,
  fromExponent: number,
  toExponent: number,
): number {
  const match = /^(\d+)\.(\d{1,8})$/.exec(rate);
  if (match === null) throw new RangeError("a rate is decimal text");
  const [, whole = "", fraction = ""] = match;
  const scaledRate = BigInt(whole + fraction);
  // amount × rate × 10^(toExp − fromExp), with the rate's own 10^fraction.length divided out.
  let numerator = BigInt(amountMinor) * scaledRate;
  let denominator = 10n ** BigInt(fraction.length);
  const shift = toExponent - fromExponent;
  if (shift >= 0) numerator *= 10n ** BigInt(shift);
  else denominator *= 10n ** BigInt(-shift);
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return Number(negative ? -rounded : rounded);
}

function exponentOf(code: string): number {
  if (!isCurrencyCode(code)) {
    throw new RangeError("invoice currency is not a configured currency");
  }
  return currencyConfig(code).minorUnitExponent;
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

/** A4 in points, and the artboard's 56 px margins at 96 dpi. */
const PAGE = { width: 595.28, height: 841.89, margin: 42 } as const;
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
/** The artboard's 11.5 px body at 96 dpi, and its scale. */
const SIZE = {
  body: 8.6,
  small: 7.5,
  label: 7.5,
  title: 17,
  brand: 13,
} as const;
const LINE_GAP = 2;
/** Ink and rule colours from the design tokens (`--color-ink`, `--color-rule`), as sRGB hex. */
const INK = "#24203f";
const INK_MUTED = "#4f4a66";
const RULE = "#d8d6e3";
/** The bottom of the writable area: the footer line sits below it. */
const BODY_BOTTOM = PAGE.height - PAGE.margin - 24;

/** The six table columns: start x and width, as fractions of the content width. */
const COLUMNS = (() => {
  const fractions = [0.07, 0.39, 0.12, 0.14, 0.14, 0.14] as const;
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
  readonly words: InvoiceWords;
  y: number;
}

function money(ctx: Context, amountMinor: number, currency: string): string {
  return formatMoney(
    { amountMinor, currency: currency as CurrencyCode },
    ctx.words.valueLocale,
  );
}

/** A calendar date (`YYYY-MM-DD`) as the buyer's locale writes it; the date is the date. */
function day(ctx: Context, isoDate: string): string {
  return formatDate(
    new Date(`${isoDate}T12:00:00Z`),
    ctx.words.valueLocale,
    "dayMonthYear",
    "UTC",
  );
}

function rate(ctx: Context, basisPoints: number): string {
  return formatPercentFromBasisPoints(basisPoints, ctx.words.valueLocale);
}

/** A page break when `height` more points do not fit. */
function ensureRoom(ctx: Context, height: number): void {
  if (ctx.y + height <= BODY_BOTTOM) return;
  ctx.doc.addPage();
  ctx.y = PAGE.margin;
}

/** Draws a horizontal rule, marked as an artifact. */
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

interface TextOptions {
  readonly x?: number;
  readonly width?: number;
  readonly align?: "left" | "right";
  readonly bold?: boolean;
  readonly size?: number;
  readonly color?: string;
}

/** Writes `text` at the current line, returning the height it took. */
/**
 * A run of right-to-left script, from its first letter to its last, with the spaces and name
 * punctuation between: one run, so the shaper lays the whole name out right to left.
 */
const RTL_RUN =
  /(\p{Script=Hebrew}(?:[\p{Script=Hebrew}\s'’.-]*\p{Script=Hebrew})?)|(\p{Script=Arabic}(?:[\p{Script=Arabic}\s'’.-]*\p{Script=Arabic})?)/gu;

/** `text` cut into runs, each with the face that has its glyphs. */
function runs(text: string, face: "regular" | "bold"): [string, string][] {
  const out: [string, string][] = [];
  let at = 0;
  for (const match of text.matchAll(RTL_RUN)) {
    if (match.index > at) out.push([text.slice(at, match.index), face]);
    // No-break spaces keep the run one word for PDFKit's line wrapper, so the shaper reverses
    // the whole name, not each word in place (PDFKit has no bidi of its own).
    out.push([
      match[0].replace(/\s/gu, "\u00A0"),
      match[1] === undefined ? "arabic" : "hebrew",
    ]);
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push([text.slice(at), face]);
  return out;
}

function write(ctx: Context, text: string, options: TextOptions = {}): number {
  const { doc } = ctx;
  const width = options.width ?? CONTENT_WIDTH;
  const face = options.bold === true ? "bold" : "regular";
  doc
    .font(face)
    .fontSize(options.size ?? SIZE.body)
    .fillColor(options.color ?? INK);
  const height = doc.heightOfString(text, { width, lineGap: LINE_GAP });
  const pieces = runs(text, face);
  pieces.forEach(([piece, pieceFace], index) => {
    doc.font(pieceFace);
    const continued = index < pieces.length - 1;
    const textOptions = {
      width,
      align: options.align ?? "left",
      lineGap: LINE_GAP,
      continued,
    };
    if (index === 0)
      doc.text(piece, options.x ?? PAGE.margin, ctx.y, textOptions);
    else doc.text(piece, textOptions);
  });
  return height;
}

/** One structure element of `type` holding `text`, appended to `parent`. */
function element(
  ctx: Context,
  parent: Struct,
  type: string,
  text: string,
  options: TextOptions = {},
): number {
  let height = 0;
  parent.add(
    ctx.doc.struct(type, {}, () => {
      height = write(ctx, text, options);
    }),
  );
  return height;
}

/** A paragraph that advances the cursor. */
function paragraph(
  ctx: Context,
  parent: Struct,
  text: string,
  options: TextOptions = {},
): void {
  ensureRoom(ctx, (options.size ?? SIZE.body) * 2);
  ctx.y += element(ctx, parent, "P", text, options) + 1;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

type Snapshot = InvoiceSnapshot | CreditNoteSnapshot;

function header(ctx: Context, document: RenderableDocument): void {
  const titleKey =
    document.kind === "credit_note"
      ? CREDIT_NOTE_TITLE_KEY
      : document.profile.titleKey;
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  const top = ctx.y;
  element(ctx, section, "P", TRADING_NAME, {
    bold: true,
    size: SIZE.brand,
  });
  ctx.y = top;
  const titleHeight = element(ctx, section, "H1", ctx.words.label(titleKey), {
    bold: true,
    size: SIZE.title,
    align: "right",
  });
  section.end();
  ctx.y = top + Math.max(titleHeight, SIZE.brand * 1.4) + 6;
  rule(ctx, 2);
  ctx.y += 10;
}

function meta(
  ctx: Context,
  document: RenderableDocument,
  snapshot: Snapshot,
): void {
  const { words } = ctx;
  const rows: [string, string][] = [
    [words.label("invoice.label.number"), document.number],
    [words.label("invoice.label.issueDate"), day(ctx, snapshot.issueDate)],
    [words.label("invoice.label.supplyDate"), day(ctx, snapshot.supplyDate)],
    [words.label("invoice.label.order"), snapshot.orderReference],
  ];
  if (snapshot.kind === "credit_note") {
    rows.push([
      words.label("invoice.label.corrects"),
      snapshot.corrects.number,
    ]);
  }
  rows.push([words.label("invoice.label.currency"), snapshot.currency]);
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  for (const [label, value] of rows) {
    ensureRoom(ctx, SIZE.body * 2);
    const top = ctx.y;
    const labelHeight = element(ctx, section, "P", label, {
      width: CONTENT_WIDTH * 0.45,
      color: INK_MUTED,
      size: SIZE.label,
    });
    ctx.y = top;
    const valueHeight = element(ctx, section, "P", value, {
      x: PAGE.margin + CONTENT_WIDTH * 0.45,
      width: CONTENT_WIDTH * 0.55,
    });
    ctx.y = top + Math.max(labelHeight, valueHeight) + 1;
  }
  section.end();
  ctx.y += 8;
}

/** Seller in the start column, buyer in the end column. */
function parties(ctx: Context, snapshot: Snapshot): void {
  const { words } = ctx;
  const { issuer, buyer } = snapshot;
  const country = (iso2: string): string => {
    const names: string[] = [];
    for (const locale of words.locales) {
      const name = formatRegionName(iso2, locale);
      if (!names.includes(name)) names.push(name);
    }
    return names.join(LABEL_SEPARATOR);
  };
  const half = CONTENT_WIDTH / 2 - 8;
  const top = ctx.y;

  const seller = ctx.doc.struct("Sect");
  ctx.root.add(seller);
  ctx.y += element(ctx, seller, "H2", words.label("invoice.label.seller"), {
    width: half,
    bold: true,
    size: SIZE.label,
    color: INK_MUTED,
  });
  const sellerLines = [
    issuer.legalName,
    ...issuer.address.lines,
    `${issuer.address.postalCode} ${issuer.address.city}`,
    country(issuer.address.countryIso2),
    `${words.label("invoice.label.registryCode")}: ${issuer.registryName} ${issuer.registrationNumber}`,
    ...issuer.vatIds.map(
      (id) =>
        `${words.label("invoice.label.vatId", { country: id.countryIso2 })}: ${id.vatId}`,
    ),
  ];
  for (const line of sellerLines) {
    ctx.y += element(ctx, seller, "P", line, { width: half }) + 1;
  }
  seller.end();
  const sellerBottom = ctx.y;

  ctx.y = top;
  const buyerSection = ctx.doc.struct("Sect");
  ctx.root.add(buyerSection);
  const x = PAGE.margin + CONTENT_WIDTH / 2 + 8;
  ctx.y += element(
    ctx,
    buyerSection,
    "H2",
    words.label("invoice.label.buyer"),
    {
      x,
      width: half,
      bold: true,
      size: SIZE.label,
      color: INK_MUTED,
    },
  );
  for (const line of [buyer.name, country(buyer.countryIso2)]) {
    ctx.y += element(ctx, buyerSection, "P", line, { x, width: half }) + 1;
  }
  buyerSection.end();
  ctx.y = Math.max(sellerBottom, ctx.y) + 12;
}

/** One table row: up to six cells, each `[column, text]`, as `TH` or `TD`. */
function row(
  ctx: Context,
  table: Struct,
  cells: readonly (readonly [number, string])[],
  options: { readonly header?: boolean; readonly bold?: boolean } = {},
): void {
  const { doc } = ctx;
  const heights = cells.map(([column, text]) => {
    const spec = COLUMNS[column];
    if (spec === undefined) throw new RangeError("no such column");
    doc
      .font(
        options.bold === true || options.header === true ? "bold" : "regular",
      )
      .fontSize(options.header === true ? SIZE.label : SIZE.body);
    return doc.heightOfString(text, {
      width: spec.width - 4,
      lineGap: LINE_GAP,
    });
  });
  const height = Math.max(...heights, SIZE.body);
  ensureRoom(ctx, height + 4);
  const tr = doc.struct("TR");
  table.add(tr);
  for (const [column, text] of cells) {
    const spec = COLUMNS[column];
    if (spec === undefined) throw new RangeError("no such column");
    const top = ctx.y;
    element(ctx, tr, options.header === true ? "TH" : "TD", text, {
      x: spec.x + (column === 0 ? 0 : 2),
      width: spec.width - 4,
      align: column >= 2 ? "right" : "left",
      bold: options.bold === true || options.header === true,
      size: options.header === true ? SIZE.label : SIZE.body,
      ...(options.header === true ? { color: INK_MUTED } : {}),
    });
    ctx.y = top;
  }
  tr.end();
  ctx.y += height + 4;
}

/** The product, add-on or surcharge name in the label locales, each distinct name once. */
function lineName(
  ctx: Context,
  names: Readonly<Record<string, string>>,
  kind: string,
): string {
  const found: string[] = [];
  for (const locale of ctx.words.locales) {
    const name = names[locale];
    if (name !== undefined && !found.includes(name)) found.push(name);
  }
  if (found.length === 0) {
    const any = Object.keys(names)
      .sort()
      .map((key) => names[key])
      .find((name) => name !== undefined);
    if (any !== undefined) found.push(any);
  }
  if (found.length === 0 && kind === "surcharge") {
    return ctx.words.label("invoice.line.surcharge");
  }
  return found.join(" / ");
}

function table(ctx: Context, snapshot: Snapshot): void {
  const { words } = ctx;
  const currency = snapshot.currency;
  const tableStruct = ctx.doc.struct("Table");
  ctx.root.add(tableStruct);
  row(
    ctx,
    tableStruct,
    [
      [0, words.label("invoice.label.lineNo")],
      [1, words.label("invoice.label.description")],
      [2, words.label("invoice.label.vatRate")],
      [3, words.label("invoice.label.net")],
      [4, words.label("invoice.label.vat")],
      [5, words.label("invoice.label.gross")],
    ],
    { header: true },
  );
  rule(ctx, 0.75);
  ctx.y += 4;

  if (snapshot.kind === "invoice") {
    snapshot.lines.forEach((line, index) => {
      const name = lineName(ctx, line.names, line.kind);
      const description =
        line.qty > 1
          ? words.single("invoice.line.quantity", {
              name,
              qty: formatNumber(line.qty, words.valueLocale),
            })
          : name;
      row(ctx, tableStruct, [
        [0, formatNumber(index + 1, words.valueLocale)],
        [1, description],
        [2, line.vatBearing ? rate(ctx, line.vatRateBp) : ""],
        [5, money(ctx, line.grossMinor, currency)],
      ]);
    });
    rule(ctx, 0.75);
    ctx.y += 4;
  }

  for (const split of snapshot.byRate) {
    row(ctx, tableStruct, [
      [
        1,
        words.label("invoice.label.totalAtRate", {
          rate: rate(ctx, split.rateBp),
        }),
      ],
      [2, rate(ctx, split.rateBp)],
      [3, money(ctx, split.netMinor, currency)],
      [4, money(ctx, split.vatMinor, currency)],
      [5, money(ctx, split.grossMinor, currency)],
    ]);
  }
  if (snapshot.outsideVatMinor !== 0) {
    row(ctx, tableStruct, [
      [1, words.label("invoice.label.outsideVat")],
      [5, money(ctx, snapshot.outsideVatMinor, currency)],
    ]);
  }
  ctx.y += 2;
  rule(ctx, 2);
  ctx.y += 4;
  const totalKey =
    snapshot.kind === "credit_note"
      ? "invoice.label.totalRefunded"
      : "invoice.label.totalDue";
  row(
    ctx,
    tableStruct,
    [
      [1, words.label(totalKey)],
      [3, money(ctx, snapshot.totals.netMinor, currency)],
      [4, money(ctx, snapshot.totals.vatMinor, currency)],
      [5, money(ctx, snapshot.totals.grossMinor, currency)],
    ],
    { bold: true },
  );
  tableStruct.end();
  ctx.y += 8;
}

/** AC-19: each rate's VAT in the second VAT currency, at the stored rate, source and date. */
function secondCurrency(ctx: Context, snapshot: Snapshot): void {
  const { vatRate, vatCurrency } = snapshot;
  if (
    vatRate === null ||
    vatCurrency === null ||
    vatCurrency === snapshot.currency
  ) {
    return;
  }
  const { words } = ctx;
  const fromExponent = exponentOf(vatRate.from);
  const toExponent = exponentOf(vatRate.to);
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  ensureRoom(ctx, SIZE.body * 6);
  ctx.y +=
    element(
      ctx,
      section,
      "H2",
      words.label("invoice.label.vatInCurrency", { currency: vatRate.to }),
      {
        bold: true,
        size: SIZE.label,
        color: INK_MUTED,
      },
    ) + 1;
  paragraph(
    ctx,
    section,
    words.label("invoice.label.rateSource", {
      table: vatRate.table,
      date: day(ctx, vatRate.effectiveDate),
      from: vatRate.from,
      rate: vatRate.rate,
      to: vatRate.to,
    }),
  );
  for (const split of snapshot.byRate) {
    const converted = convertMinor(
      split.vatMinor,
      vatRate.rate,
      fromExponent,
      toExponent,
    );
    paragraph(
      ctx,
      section,
      words.single("invoice.label.vatAtRate", {
        rate: rate(ctx, split.rateBp),
        amount: money(ctx, converted, vatRate.to),
      }),
    );
  }
  section.end();
  ctx.y += 6;
}

/** "Paid, {date} {total}" for an invoice; "Refunded, {date} {total}" for a credit note. */
function payment(ctx: Context, snapshot: Snapshot): void {
  const { words } = ctx;
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  const date =
    snapshot.kind === "credit_note"
      ? day(ctx, snapshot.refund.succeededAt.slice(0, 10))
      : day(ctx, snapshot.issueDate);
  const label =
    snapshot.kind === "credit_note"
      ? words.label("invoice.label.refunded")
      : words.label("invoice.label.paid");
  ensureRoom(ctx, SIZE.body * 2);
  const top = ctx.y;
  element(ctx, section, "P", `${label}, ${date}`, {
    width: CONTENT_WIDTH * 0.7,
  });
  ctx.y = top;
  const height = element(
    ctx,
    section,
    "P",
    money(ctx, snapshot.totals.grossMinor, snapshot.currency),
    {
      x: PAGE.margin + CONTENT_WIDTH * 0.7,
      width: CONTENT_WIDTH * 0.3,
      align: "right",
      bold: true,
    },
  );
  section.end();
  ctx.y = top + height + 10;
}

function finePrint(ctx: Context, document: RenderableDocument): void {
  const { words } = ctx;
  const section = ctx.doc.struct("Sect");
  ctx.root.add(section);
  paragraph(ctx, section, words.label("invoice.label.pricesInclude"), {
    size: SIZE.small,
    color: INK_MUTED,
  });
  const statementKey = document.profile.issuerStatementKey;
  if (statementKey !== null) {
    paragraph(ctx, section, words.label(statementKey), {
      size: SIZE.small,
      color: INK_MUTED,
    });
  }
  section.end();
}

/** "Page n of N" on every page, as a pagination artifact. */
function pageNumbers(ctx: Context): void {
  const { doc, words } = ctx;
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    // The footer sits inside the bottom margin; with the margin in place PDFKit would start a
    // new page for it.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.markContent("Artifact", { type: "Pagination" });
    doc
      .font("regular")
      .fontSize(SIZE.small)
      .fillColor(INK_MUTED)
      .text(
        words.label("invoice.label.page", {
          page: formatNumber(index + 1, words.valueLocale),
          pages: formatNumber(range.count, words.valueLocale),
        }),
        PAGE.margin,
        PAGE.height - PAGE.margin - 8,
        { width: CONTENT_WIDTH, align: "right", lineBreak: false },
      );
    doc.endMarkedContent();
    doc.page.margins.bottom = bottom;
  }
}

/* -------------------------------------------------------------------------- */
/* renderInvoicePdf                                                           */
/* -------------------------------------------------------------------------- */

function parseSnapshot(document: RenderableDocument): Snapshot {
  return document.kind === "credit_note"
    ? CreditNoteSnapshotV1.parse(document.snapshot)
    : InvoiceSnapshotV1.parse(document.snapshot);
}

/** The document's PDF bytes. Pure apart from reading the fonts: the same row, the same bytes. */
export async function renderInvoicePdf(
  document: RenderableDocument,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const snapshot = parseSnapshot(document);
  const words = invoiceWords(snapshot.labelLocales, options.translator);
  const fonts = options.fonts ?? invoiceFonts();
  const lang = words.locales[0] ?? words.valueLocale;
  const title = `${words.label(
    document.kind === "credit_note"
      ? CREDIT_NOTE_TITLE_KEY
      : document.profile.titleKey,
  )} ${document.number}`;
  // `@types/pdfkit` lags the library: PDFKit 0.20 takes a font buffer as the initial `font` (so
  // the standard Helvetica, and its AFM files, are never loaded) and the `PDF/UA` subset (the
  // `pdfuaid` XMP part), which the declared option types do not list yet.
  const pdfOptions = {
    size: "A4",
    margin: PAGE.margin,
    font: fonts.regular,
    tagged: true,
    lang,
    pdfVersion: "1.7",
    subset: "PDF/UA",
    displayTitle: true,
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: title,
      Author: snapshot.issuer.legalName,
      Producer: TRADING_NAME,
      Creator: TRADING_NAME,
      CreationDate: document.issuedAt,
      ModDate: document.issuedAt,
    },
  };
  const doc = new PDFDocument(
    pdfOptions as unknown as PDFKit.PDFDocumentOptions,
  );
  doc.registerFont("regular", fonts.regular);
  doc.registerFont("bold", fonts.bold);
  doc.registerFont("hebrew", fonts.hebrew);
  doc.registerFont("arabic", fonts.arabic);

  const chunks: Buffer[] = [];
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });

  const root = doc.struct("Document");
  doc.addStructure(root);
  const ctx: Context = { doc, root, words, y: PAGE.margin };
  header(ctx, document);
  meta(ctx, document, snapshot);
  parties(ctx, snapshot);
  table(ctx, snapshot);
  secondCurrency(ctx, snapshot);
  payment(ctx, snapshot);
  finePrint(ctx, document);
  root.end();
  pageNumbers(ctx);
  doc.end();
  return done;
}

export type { InvoiceTranslatorFactory } from "./labels";
