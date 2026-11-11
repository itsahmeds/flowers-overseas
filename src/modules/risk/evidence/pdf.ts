/**
 * The chargeback evidence pack as an A4 PDF (spec 021 §5.2 "Evidence pack", §8 flow 2, §13 Q8;
 * AC-28; TASK-495), for the founder to upload in Stripe's dispute page by hand.
 *
 * **Spec 018's PDFKit setup** (`src/modules/invoices/pdf/render.ts`): `tagged: true` with a
 * `Document` structure tree in reading order, `/Lang`, the PDF/UA identifier, A4 portrait, 42 pt
 * margins, and the embedded Noto Sans faces (`invoiceFonts()`), so a Polish street or a Hebrew name
 * extracts as typed. Body text is 12 pt (Stripe's guidance for evidence). Rules and the page
 * number are artifacts.
 *
 * **Content, in the spec's order**, each section with a one-line caption: the summary, the proof
 * of authorisation, the timeline (every time in UTC and in the destination's zone, plus the
 * confirmation email), the delivery (recipient name, full address, the photo and its upload time)
 * and what the buyer agreed to (the checkout's cancellation sentence in the buyer's language, the
 * terms version). Every caption is the admin catalogue's (`admin.risk.evidence.*`, English), handed
 * in by the route as `t`; amounts through `formatMoney`, dates through `formatDate`. The facts
 * cannot hold a card message, "sign as", a phone, a florist or a risk score (`./facts.ts`).
 */
import PDFDocument from "pdfkit";

import { TRADING_NAME } from "@/config/company.data";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatMoney, formatRegionName } from "@/modules/i18n";
import { type InvoiceFonts, invoiceFonts } from "@/modules/invoices";

import type { EvidenceFacts } from "./facts.ts";

const PAGE = { width: 595.28, height: 841.89, margin: 42 } as const;
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const SIZE = {
  body: 12,
  caption: 12,
  heading: 14,
  title: 18,
  page: 9,
} as const;
const LINE_GAP = 3;
const INK = "#24203f";
const INK_MUTED = "#4f4a66";
const RULE = "#d8d6e3";
const BODY_BOTTOM = PAGE.height - PAGE.margin - 24;
/** The photo's box: the content width, at most this tall. */
const PHOTO_MAX_HEIGHT = 380;
/** The captions' language and the language of every value but the buyer's sentence. */
const PACK_LOCALE: LocaleCode = "en";

/** A caption reader over the admin catalogue (`adminT`), handed in by the route. */
export type EvidenceTranslate = (
  key: string,
  values?: Readonly<Record<string, string>>,
) => string;

/** How the payment was authenticated, as the provider reported it (`riskFactsFor`). */
export interface EvidenceAuthorisation {
  readonly threeDsResult: string | null;
  readonly liabilityShift: boolean | null;
  readonly cardBrand: string | null;
  readonly cardLast4: string | null;
}

export interface EvidenceRenderInput {
  readonly facts: EvidenceFacts;
  readonly authorisation: EvidenceAuthorisation;
  /** The delivery photo's JPEG bytes (EXIF already stripped by spec 011), or `null`. */
  readonly photo: Buffer | null;
  /** `checkout.legal.cancellation` in the buyer's locale. */
  readonly cancellation: string;
  readonly t: EvidenceTranslate;
  readonly generatedAt: Date;
  readonly fonts?: InvoiceFonts;
}

type Doc = PDFKit.PDFDocument;
type Struct = PDFKit.PDFStructureElement;

interface Context {
  readonly doc: Doc;
  readonly root: Struct;
  y: number;
}

const HEBREW = /[֐-׿]/u;
const ARABIC = /[؀-ۿݐ-ݿ]/u;

function fontFor(value: string, bold: boolean): string {
  if (HEBREW.test(value)) return "hebrew";
  if (ARABIC.test(value)) return "arabic";
  return bold ? "bold" : "regular";
}

function ensureRoom(ctx: Context, height: number): void {
  if (ctx.y + height <= BODY_BOTTOM) return;
  ctx.doc.addPage();
  ctx.y = PAGE.margin;
}

function write(
  ctx: Context,
  parent: Struct,
  type: string,
  value: string,
  options: {
    readonly bold?: boolean;
    readonly size?: number;
    readonly color?: string;
  } = {},
): void {
  const { doc } = ctx;
  doc
    .font(fontFor(value, options.bold === true))
    .fontSize(options.size ?? SIZE.body)
    .fillColor(options.color ?? INK);
  const height = doc.heightOfString(value, {
    width: CONTENT_WIDTH,
    lineGap: LINE_GAP,
  });
  ensureRoom(ctx, height);
  parent.add(
    doc.struct(type, {}, () => {
      doc.text(value, PAGE.margin, ctx.y, {
        width: CONTENT_WIDTH,
        lineGap: LINE_GAP,
      });
    }),
  );
  ctx.y += height + 4;
}

function rule(ctx: Context): void {
  const { doc } = ctx;
  doc.markContent("Artifact", { type: "Layout" });
  doc
    .save()
    .lineWidth(0.75)
    .strokeColor(RULE)
    .moveTo(PAGE.margin, ctx.y)
    .lineTo(PAGE.width - PAGE.margin, ctx.y)
    .stroke()
    .restore();
  doc.endMarkedContent();
  ctx.y += 8;
}

/** One numbered section: heading, one-line caption, then its lines. */
function section(
  ctx: Context,
  heading: string,
  caption: string,
  lines: readonly string[],
): Struct {
  ensureRoom(ctx, SIZE.heading * 4);
  ctx.y += 6;
  rule(ctx);
  const part = ctx.doc.struct("Sect");
  ctx.root.add(part);
  write(ctx, part, "H2", heading, { bold: true, size: SIZE.heading });
  write(ctx, part, "P", caption, { color: INK_MUTED, size: SIZE.caption });
  for (const line of lines) write(ctx, part, "P", line);
  return part;
}

function utc(at: Date): string {
  return formatDate(at, PACK_LOCALE, "dayMonthYearTime", "UTC");
}

function local(at: Date, zone: string): string {
  return formatDate(at, PACK_LOCALE, "dayMonthYearTime", zone);
}

function pageNumbers(ctx: Context, t: EvidenceTranslate): number {
  const { doc } = ctx;
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.markContent("Artifact", { type: "Pagination" });
    doc
      .font("regular")
      .fontSize(SIZE.page)
      .fillColor(INK_MUTED)
      .text(
        t("admin.risk.evidence.page", {
          page: String(index + 1),
          pages: String(range.count),
        }),
        PAGE.margin,
        PAGE.height - PAGE.margin - 8,
        { width: CONTENT_WIDTH, align: "right", lineBreak: false },
      );
    doc.endMarkedContent();
    doc.page.margins.bottom = bottom;
  }
  return range.count;
}

/** The pack's bytes and page count. */
export async function renderEvidencePack(
  input: EvidenceRenderInput,
): Promise<{ readonly bytes: Uint8Array; readonly pages: number }> {
  const { facts, authorisation, t } = input;
  const fonts = input.fonts ?? invoiceFonts();
  const title = t("admin.risk.evidence.title", { reference: facts.reference });
  const pdfOptions = {
    size: "A4",
    layout: "portrait",
    margin: PAGE.margin,
    font: fonts.regular,
    tagged: true,
    lang: PACK_LOCALE,
    pdfVersion: "1.7",
    subset: "PDF/UA",
    displayTitle: true,
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: title,
      Author: TRADING_NAME,
      Producer: TRADING_NAME,
      Creator: TRADING_NAME,
      CreationDate: input.generatedAt,
      ModDate: input.generatedAt,
    },
  };
  // As spec 018's renderer: `@types/pdfkit` lags PDFKit 0.20's buffer font and `PDF/UA` options.
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
  const ctx: Context = { doc, root, y: PAGE.margin };

  write(ctx, root, "H1", title, { bold: true, size: SIZE.title });
  write(ctx, root, "P", t("admin.risk.evidence.intro"), { color: INK_MUTED });

  const notReported = t("admin.risk.evidence.notReported");
  const delivered = facts.timeline.find((entry) => entry.step === "delivered");
  const placed = facts.timeline.find((entry) => entry.step === "placed");
  const label = (key: string, value: string): string =>
    t("admin.risk.evidence.line", { label: t(key), value });

  // 1. Summary.
  section(
    ctx,
    t("admin.risk.evidence.summary.title"),
    t("admin.risk.evidence.summary.caption"),
    [
      label("admin.risk.evidence.summary.reference", facts.reference),
      label(
        "admin.risk.evidence.summary.amount",
        formatMoney(
          {
            amountMinor: facts.totalMinor,
            currency: facts.currency as Parameters<
              typeof formatMoney
            >[0]["currency"],
          },
          PACK_LOCALE,
        ),
      ),
      label(
        "admin.risk.evidence.summary.product",
        facts.productName ?? notReported,
      ),
      label("admin.risk.evidence.summary.tier", facts.tierKey ?? notReported),
      label(
        "admin.risk.evidence.summary.ordered",
        placed === undefined ? notReported : utc(placed.at),
      ),
      label("admin.risk.evidence.summary.delivery", facts.deliveryDate),
      label(
        "admin.risk.evidence.summary.outcome",
        delivered === undefined
          ? t("admin.risk.evidence.summary.notDelivered")
          : t("admin.risk.evidence.summary.delivered", {
              date: formatDate(
                delivered.at,
                PACK_LOCALE,
                "dayMonthYear",
                facts.zone,
              ),
              time: formatDate(delivered.at, PACK_LOCALE, "time", facts.zone),
              zone: facts.zone,
            }),
      ),
    ],
  );

  // 2. Proof of authorisation.
  section(
    ctx,
    t("admin.risk.evidence.auth.title"),
    t("admin.risk.evidence.auth.caption"),
    [
      label(
        "admin.risk.evidence.auth.threeDs",
        authorisation.threeDsResult ?? notReported,
      ),
      label(
        "admin.risk.evidence.auth.shift",
        authorisation.liabilityShift === null
          ? notReported
          : t(
              authorisation.liabilityShift
                ? "admin.risk.evidence.auth.yes"
                : "admin.risk.evidence.auth.no",
            ),
      ),
      label(
        "admin.risk.evidence.auth.card",
        authorisation.cardBrand === null || authorisation.cardLast4 === null
          ? notReported
          : t("admin.risk.evidence.auth.cardValue", {
              brand: authorisation.cardBrand,
              last4: authorisation.cardLast4,
            }),
      ),
      label(
        "admin.risk.evidence.auth.country",
        facts.buyerCountry === null
          ? notReported
          : formatRegionName(facts.buyerCountry, PACK_LOCALE),
      ),
    ],
  );

  // 3. Timeline, in UTC and in the destination's zone.
  const when = (at: Date): string =>
    t("admin.risk.evidence.timeline.when", {
      utc: utc(at),
      local: local(at, facts.zone),
      zone: facts.zone,
    });
  section(
    ctx,
    t("admin.risk.evidence.timeline.title"),
    t("admin.risk.evidence.timeline.caption", { zone: facts.zone }),
    [
      ...facts.timeline.map((entry) =>
        label(
          `admin.risk.evidence.timeline.step.${entry.step}`,
          when(entry.at),
        ),
      ),
      ...(facts.confirmationSentAt === null
        ? []
        : [
            label(
              "admin.risk.evidence.timeline.confirmation",
              when(facts.confirmationSentAt),
            ),
          ]),
    ],
  );

  // 4. Delivery: recipient, full address, the photo and its upload time.
  const delivery = section(
    ctx,
    t("admin.risk.evidence.delivery.title"),
    t("admin.risk.evidence.delivery.caption"),
    [
      label("admin.risk.evidence.delivery.recipient", facts.recipient.name),
      t("admin.risk.evidence.delivery.address"),
      ...facts.recipient.lines.map((line, index, lines) =>
        index === lines.length - 1 ? formatRegionName(line, PACK_LOCALE) : line,
      ),
      facts.photo === null
        ? t("admin.risk.evidence.delivery.noPhoto")
        : t("admin.risk.evidence.delivery.photoAt", {
            when: when(facts.photo.uploadedAt),
          }),
    ],
  );
  if (facts.photo !== null && input.photo !== null) {
    const photo = input.photo;
    ensureRoom(ctx, PHOTO_MAX_HEIGHT);
    delivery.add(
      doc.struct(
        "Figure",
        { alt: t("admin.risk.evidence.delivery.photoAlt") },
        () => {
          doc.image(photo, PAGE.margin, ctx.y, {
            fit: [CONTENT_WIDTH, PHOTO_MAX_HEIGHT],
            align: "center",
          });
        },
      ),
    );
    ctx.y += PHOTO_MAX_HEIGHT + 8;
  }

  // 5. What the buyer agreed to.
  section(
    ctx,
    t("admin.risk.evidence.terms.title"),
    t("admin.risk.evidence.terms.caption"),
    [
      input.cancellation,
      facts.termsVersion === null
        ? t("admin.risk.evidence.terms.noVersion")
        : t("admin.risk.evidence.terms.version", {
            version: facts.termsVersion,
          }),
    ],
  );

  root.end();
  const pages = pageNumbers(ctx, t);
  doc.end();
  return { bytes: await done, pages };
}
