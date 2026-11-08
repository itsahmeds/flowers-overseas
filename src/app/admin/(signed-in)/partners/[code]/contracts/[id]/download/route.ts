/**
 * @purpose GET /admin/partners/[code]/contracts/[id]/download: a 60-second signed link to a contract (030b AC-40)
 * @spec 030b
 *
 * Spec 030b §14.4 "download, exactly" (TASK-442). `partner.contract.view` (admin only) first; the
 * read is audited (`partner_contract.viewed`), the stored object's checksum is compared with the
 * row (a mismatch: `409`, `alert=partners.contract_checksum_mismatch`, no URL), then `303` to a
 * signed URL that downloads as `contract-{code}-{kind}-v{n}.pdf`. The URL is never rendered into
 * a page or logged; the answer carries `Cache-Control: no-store, private` and
 * `Referrer-Policy: no-referrer`.
 */
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import { adminRequestId, requirePermission } from "@/modules/admin";
import { contractDownloadUrl } from "@/modules/partners/contracts";

export const dynamic = "force-dynamic";

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
  "Referrer-Policy": "no-referrer",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string; id: string }> },
): Promise<Response> {
  const session = await requirePermission("partner.contract.view");
  const { id } = await params;
  const result = await contractDownloadUrl(
    { userId: session.userId, requestId: await adminRequestId() },
    id,
  );
  if (result.ok) {
    return new Response(null, {
      status: 303,
      headers: { ...HEADERS, Location: result.url },
    });
  }
  return new Response(null, {
    status: result.reason === "checksum_mismatch" ? 409 : 404,
    headers: HEADERS,
  });
}
