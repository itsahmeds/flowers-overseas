/**
 * @purpose GET: the invoice PDF for a signed link or the owner's session
 * @spec 018
 *
 * `GET /{locale}/account/invoices/{invoiceId}` (spec 018 §5.3, AC-12, AC-23; TASK-342, TASK-344):
 * the stored invoice or credit-note PDF for a valid signed `invoice` link in `?t=`, or, without
 * one, for the buyer whose session's customer owns the invoice's order (read under the `customer`
 * context, so another customer's session is a 404), while `account.open` is on for the locale. A
 * bare 404 for anything else. The work is `invoiceDownloadResponse()` in `@/modules/invoices`.
 */
import { getBuyerContext } from "@/lib/auth/buyer";
import {
  INVOICE_LINK_QUERY_KEY,
  invoiceDownloadResponse,
} from "@/modules/invoices";
import { ownsInvoice } from "@/modules/orders/account-orders";

import {
  accountLocale,
  accountOpen,
  asCustomer,
  listedModes,
} from "../../_parts/account-request";

export const dynamic = "force-dynamic";

/** Whether the signed-in buyer owns `invoiceId` (AC-23 owner half). */
async function ownerAllows(locale: string, invoiceId: string): Promise<boolean> {
  const code = accountLocale(locale);
  if (code === null || !(await accountOpen(code))) return false;
  const context = await getBuyerContext();
  if (context === null) return false;
  return ownsInvoice(asCustomer(context), listedModes(), invoiceId);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; invoiceId: string }> },
): Promise<Response> {
  const { locale, invoiceId } = await params;
  const token = new URL(request.url).searchParams.get(INVOICE_LINK_QUERY_KEY);
  return invoiceDownloadResponse({ locale, invoiceId }, token, {
    ownerAllows: (id) => ownerAllows(locale, id),
  });
}
