/**
 * @purpose GET /admin/finance/export: the management-figures CSV of the orders, florists or countries (030b AC-23)
 * @spec 030b
 *
 * `finance.export` first (admin only): no session is 401, any other role 403, and nothing is
 * read. The query is the finance range plus `kind`; a refused range or kind is 400 with no data.
 * The file is built in memory (`exportFinanceCsv`), the one audit row
 * (`audit_record_view('finance_export', kind)`, the range in the reason) written in the same
 * admin transaction, and the bytes answered as an attachment
 * `management-figures-{kind}-{from}-{to}.csv` with `Cache-Control: no-store, private` and
 * `X-Robots-Tag: noindex, nofollow`. Nothing is written to disk or R2 and nothing of the file is
 * logged.
 */
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import { adminRequestId, requirePermission } from "@/modules/admin";
import {
  exportFinanceCsv,
  financeExportKinds,
  parseFinanceRange,
} from "@/modules/admin/finance";

export const dynamic = "force-dynamic";

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
};

export async function GET(request: Request): Promise<Response> {
  const session = await requirePermission("finance.export");
  const params = new URL(request.url).searchParams;
  const query = Object.fromEntries(params.entries());
  const kind = financeExportKinds.find(
    (candidate) => candidate === params.get("kind"),
  );
  const parsed = parseFinanceRange(query, session.timeZone, new Date());
  if (kind === undefined || !parsed.ok) {
    return Response.json(
      { code: "FINANCE_EXPORT_QUERY_INVALID" },
      { status: 400, headers: HEADERS },
    );
  }
  const file = await exportFinanceCsv(
    { userId: session.userId, requestId: await adminRequestId() },
    { range: parsed.range, kind },
    session.timeZone,
    new Date(),
  );
  return new Response(new TextEncoder().encode(file.body), {
    status: 200,
    headers: {
      ...HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
}
