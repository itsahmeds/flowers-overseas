/**
 * The signed invoice download (spec 018 §5.3 `account/invoices/[invoiceId]`, AC-12, AC-23 signed-
 * link half; TASK-342).
 *
 * A link is `/{locale}/account/invoices/{invoiceId}?t={token}`, the token signed for the
 * `invoice` purpose (`src/lib/signed-link.ts`) over exactly `{ invoiceId }` with an expiry inside
 * the MAC. The caller that mints a link (spec 016's emails) chooses its expiry; a token without
 * one is refused, so no invoice link lives forever.
 *
 * The answer is the stored PDF (`getPdfByInvoiceId`: the private bucket, hash-checked, never
 * rendered here) as an attachment, `private, no-store`, `noindex, nofollow`, `no-referrer`. Every
 * failure is the same bare 404 with the same headers: no token, a malformed one, a tracking token
 * used as `t` (another MAC domain), an expired link, a link for another invoice, an invoice that
 * is not rendered yet or whose stored bytes no longer match their hash. Nothing here logs the
 * token. The owner's session (task 4, TASK-344) is the second way in (`deps.ownerAllows`, asked only
 * without a valid link); the `account` flag gates that half only, because the launch emails carry
 * these links while the account is off.
 */
import { TRANSACTIONAL_ROBOTS_HEADERS } from "@/modules/seo";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { sign, verify, type SignedLinkOptions } from "@/lib/signed-link";

import {
  getPdfByInvoiceId,
  isInvoicePdfError,
  type ReadDeps,
} from "./delivery";

/** The query key that carries the token (the sign-in links' `t`, spec 011). */
export const INVOICE_LINK_QUERY_KEY = "t";

/** The headers every answer carries (AC-12). */
export const INVOICE_DOWNLOAD_HEADERS = {
  "Cache-Control": "private, no-store",
  ...TRANSACTIONAL_ROBOTS_HEADERS,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

const InvoiceLinkPayload = z.object({ invoiceId: z.uuid() }).strict();

/** A token is base64url and one dot; anything else is refused before the MAC is computed. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,512}\.[A-Za-z0-9_-]{1,64}$/u;

/** The path of a signed download link for `invoiceId`, valid until `expiresAt`. */
export function invoiceDownloadPath(
  invoiceId: string,
  locale: string,
  expiresAt: Date,
  options?: SignedLinkOptions,
): string {
  const id = z.uuid().parse(invoiceId);
  if (!isLocaleCode(locale)) throw new RangeError("not a locale");
  const token = sign("invoice", { invoiceId: id }, expiresAt, options);
  const query = new URLSearchParams({ [INVOICE_LINK_QUERY_KEY]: token });
  return `/${locale}/account/invoices/${id}?${query.toString()}`;
}

/** The one 404. */
export function invoiceNotFound(): Response {
  return new Response(null, { status: 404, headers: INVOICE_DOWNLOAD_HEADERS });
}

/** Whether `token` is a live `invoice` link for exactly `invoiceId`. */
export function invoiceLinkOpens(
  invoiceId: string,
  token: string | null,
  options?: SignedLinkOptions,
): boolean {
  if (token === null || !TOKEN_SHAPE.test(token)) return false;
  const verified = verify("invoice", token, options);
  if (!verified.ok || verified.expiresAt === undefined) return false;
  const payload = InvoiceLinkPayload.safeParse(verified.payload);
  return payload.success && payload.data.invoiceId === invoiceId;
}

export interface DownloadDeps extends ReadDeps {
  readonly link?: SignedLinkOptions;
  readonly log?: Logger;
  /**
   * The owner's session (task 4, TASK-344): whether the signed-in buyer owns this invoice's order,
   * asked only when no valid link was given. Absent: the link is the only way in.
   */
  readonly ownerAllows?: (invoiceId: string) => Promise<boolean>;
}

/** The route's work: the PDF for a valid link, else the 404. */
export async function invoiceDownloadResponse(
  params: { readonly locale: string; readonly invoiceId: string },
  token: string | null,
  deps: DownloadDeps = {},
): Promise<Response> {
  const id = z.uuid().safeParse(params.invoiceId);
  if (!isLocaleCode(params.locale) || !id.success) return invoiceNotFound();
  if (
    !invoiceLinkOpens(id.data, token, deps.link) &&
    !(deps.ownerAllows !== undefined && (await deps.ownerAllows(id.data)))
  ) {
    return invoiceNotFound();
  }
  try {
    const pdf = await getPdfByInvoiceId(id.data, deps);
    return new Response(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        ...INVOICE_DOWNLOAD_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      },
    });
  } catch (error) {
    if (!isInvoicePdfError(error)) throw error;
    (deps.log ?? defaultLogger).warn(
      { invoice_id: id.data, code: error.code },
      "invoice.download_refused",
    );
    return invoiceNotFound();
  }
}
