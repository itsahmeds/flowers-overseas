/**
 * `checkPdf(bytes)` (spec 030b §14.2 A "Files", §14.4; AC-37; TASK-442).
 *
 * A florist contract is accepted by its **content**, never by its name or declared type:
 *
 *  1. at most `maxBytes` (10 485 760) bytes, else `contract.too_large`;
 *  2. the `%PDF-` signature within the first 1024 bytes, else `contract.not_pdf`;
 *  3. a parse with the maintained pure-JS parser `@cantoo/pdf-lib` (no native binary), else
 *     `contract.unreadable`;
 *  4. not encrypted (no password needed to open it), else `contract.encrypted`;
 *  5. no active content anywhere in the decoded object graph, object streams included (the parser
 *     expands compressed object streams into indirect objects): JavaScript (`/JS`, `/JavaScript`),
 *     launch actions, embedded files, XFA forms, rich media, submit-form and import-data actions,
 *     else `contract.active_content`;
 *  6. at least one page, else `contract.no_pages`.
 *
 * Pure: the bytes are read, never changed (the stored file must stay byte-identical so a digital
 * signature survives), and the parser's own error text is never returned, logged or shown.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  PDFRawStream,
  PDFStream,
} from "@cantoo/pdf-lib";

import { CONTRACTS_CONFIG } from "@/config/contracts";

export const PDF_RULE_IDS = [
  "contract.too_large",
  "contract.not_pdf",
  "contract.unreadable",
  "contract.no_pages",
  "contract.encrypted",
  "contract.active_content",
] as const;
export type PdfRuleId = (typeof PDF_RULE_IDS)[number];

export type PdfCheck =
  | { readonly ok: true; readonly pageCount: number }
  | { readonly ok: false; readonly ruleId: PdfRuleId };

/** Dictionary keys whose presence is active content wherever they appear. */
const ACTIVE_KEYS: ReadonlySet<string> = new Set([
  "JS",
  "JavaScript",
  "EmbeddedFile",
  "EmbeddedFiles",
  "XFA",
  "RichMediaContent",
  "RichMediaSettings",
]);

/** Name values (an action's `/S`, an object's `/Type` or `/Subtype`) that are active content. */
const ACTIVE_NAMES: ReadonlySet<string> = new Set([
  "JavaScript",
  "Launch",
  "EmbeddedFile",
  "RichMedia",
  "SubmitForm",
  "ImportData",
  "FileAttachment",
  "Movie",
  "Sound",
  "Rendition",
]);

const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const SIGNATURE_WINDOW = 1024;

function hasSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, SIGNATURE_WINDOW) - SIGNATURE.length;
  for (let start = 0; start <= limit; start += 1) {
    if (SIGNATURE.every((byte, offset) => bytes[start + offset] === byte)) {
      return true;
    }
  }
  return false;
}

/** A PDF name's decoded value (`/J#61vaScript` reads `JavaScript`). */
function nameOf(name: PDFName): string {
  return name.decodeText();
}

/** Whether `value` (followed through arrays and dictionaries, not references) is active. */
function isActive(value: PDFObject, depth = 0): boolean {
  if (depth > 32) return false;
  if (value instanceof PDFName) return ACTIVE_NAMES.has(nameOf(value));
  if (value instanceof PDFArray) {
    return value.asArray().some((item) => isActive(item, depth + 1));
  }
  const dict =
    value instanceof PDFDict
      ? value
      : value instanceof PDFStream || value instanceof PDFRawStream
        ? value.dict
        : undefined;
  if (dict === undefined) return false;
  for (const [key, entry] of dict.entries()) {
    if (ACTIVE_KEYS.has(nameOf(key))) return true;
    if (isActive(entry, depth + 1)) return true;
  }
  return false;
}

/** The content check of a contract upload; never throws. */
export async function checkPdf(bytes: Uint8Array): Promise<PdfCheck> {
  if (bytes.byteLength > CONTRACTS_CONFIG.maxBytes) {
    return { ok: false, ruleId: "contract.too_large" };
  }
  if (!hasSignature(bytes)) return { ok: false, ruleId: "contract.not_pdf" };
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    return { ok: false, ruleId: "contract.unreadable" };
  }
  if (document.isEncrypted) return { ok: false, ruleId: "contract.encrypted" };
  try {
    const objects = document.context.enumerateIndirectObjects();
    if (objects.length === 0)
      return { ok: false, ruleId: "contract.unreadable" };
    if (objects.some(([, object]) => isActive(object))) {
      return { ok: false, ruleId: "contract.active_content" };
    }
    if (isActive(document.catalog)) {
      return { ok: false, ruleId: "contract.active_content" };
    }
    const pageCount = document.getPageCount();
    return pageCount >= 1
      ? { ok: true, pageCount }
      : { ok: false, ruleId: "contract.no_pages" };
  } catch {
    return { ok: false, ruleId: "contract.unreadable" };
  }
}
