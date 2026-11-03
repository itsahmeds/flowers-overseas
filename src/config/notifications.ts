/**
 * The buyer emails' configuration slots (spec 016 §5.2 B1, §13 16-7; plan/07 §2.1; TASK-333).
 *
 * Two of B1's items are not ours to write: they land as data when the legal text is final.
 *
 *  - **The terms PDF** (§13 16-7, founder 2026-10-14): "one static PDF per terms version and
 *    variant (EU, UK; per locale), uploaded to R2 when the legal text is final; a missing PDF for a
 *    live country's terms version blocks the go-live flip, not this build". One entry per
 *    (`order.terms_version`, locale), with the file name the buyer sees and the `https` URL Resend
 *    fetches it from; `locale: null` is the entry for every locale without its own. While no entry
 *    matches an order's version, B1 is not sent (`TERMS_PDF_MISSING`, retried, then `dead` with
 *    `outbox.dead`): the email says "Our terms are attached." and must never go without them.
 *  - **The complaint path** (plan/07 §2.1, §2.3; lawyer-gated): the message key of B1's sentence
 *    naming how to complain and the national dispute body. `null` until the lawyer approves the
 *    text; while `null` B1 prints no such line.
 *
 * The trader identity is the buyer footer's `company.operatedBy` line (`src/config/company.ts`),
 * printed once the company is registered.
 */
export interface TermsPdf {
  /** `order.terms_version`. */
  readonly termsVersion: string;
  /** A locale code, or null for every locale without an entry of its own. */
  readonly locale: string | null;
  /** The file name the buyer sees. */
  readonly filename: string;
  /** Where Resend fetches it: an `https` URL of the public bucket. */
  readonly url: string;
}

/** Empty until the founder and the lawyer upload the PDFs (16-7). */
export const TERMS_PDFS: readonly TermsPdf[] = [];

/** The terms PDF of `termsVersion` for `locale`, or null. */
export function termsPdfFor(
  termsVersion: string,
  locale: string,
  pdfs: readonly TermsPdf[] = TERMS_PDFS,
): TermsPdf | null {
  const own = pdfs.find(
    (pdf) => pdf.termsVersion === termsVersion && pdf.locale === locale,
  );
  return (
    own ??
    pdfs.find(
      (pdf) => pdf.termsVersion === termsVersion && pdf.locale === null,
    ) ??
    null
  );
}

/** B1's complaint-path sentence (a message key), or null while the lawyer has not approved one. */
export const B1_COMPLAINT_PATH_KEY: string | null = null;

/**
 * How long B1 waits for the issued invoice PDFs of its purchase (spec 016 §5.2 "The invoice rides
 * B1", A-founder-2026-10-14b; §14 A-founder-2026-10-22 item 5; TASK-334): 5 minutes after the
 * purchase's first `order.captured` from `placed`, in milliseconds. Within it a pending invoice
 * makes the B1 delivery throw `INVOICE_PENDING` and retry; after it B1 goes with the stored ones
 * and B8 sends each later one alone.
 */
export const B1_INVOICE_WAIT = 5 * 60 * 1000;
