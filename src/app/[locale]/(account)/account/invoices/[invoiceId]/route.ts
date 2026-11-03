/**
 * @purpose GET: the invoice PDF for a signed link
 * @spec 018
 *
 * `GET /{locale}/account/invoices/{invoiceId}?t={token}` (spec 018 §5.3, AC-12, AC-23 signed-link
 * half; TASK-342): the stored invoice or credit-note PDF for a valid signed `invoice` link, a bare
 * 404 for anything else. The work is `invoiceDownloadResponse()` in `@/modules/invoices`; the
 * owner's session joins with task 4 (TASK-344).
 */
import {
  INVOICE_LINK_QUERY_KEY,
  invoiceDownloadResponse,
} from "@/modules/invoices";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; invoiceId: string }> },
): Promise<Response> {
  const { locale, invoiceId } = await params;
  const token = new URL(request.url).searchParams.get(INVOICE_LINK_QUERY_KEY);
  return invoiceDownloadResponse({ locale, invoiceId }, token);
}
