/**
 * @purpose GET: one Wise export as its bulk-payment CSV, no-store and noindex (spec 030a AC-26)
 * @spec 030a
 *
 * `payouts.manage` first: no session is 401, a role without it (ops, content) 403, and nothing is
 * read. Then the file is built in memory from the export's rows (`wiseExportFile`, in its own
 * admin transaction), the download is recorded with `logAdminRead('payout_export', id)`, and the
 * bytes are answered as an attachment `wise-{exportId}.csv` with `Cache-Control: no-store` and
 * `X-Robots-Tag: noindex`. Nothing is written to disk or R2 and nothing of the file is logged
 * (spec 030a §8). A malformed id is 404; a cancelled export is 409 with its refusal code.
 */
import { z } from "zod";

import {
  adminRequestId,
  logAdminRead,
  requirePermission,
} from "@/modules/admin";
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import {
  PayoutError,
  readWiseExportFile,
  wiseCsvResponse,
} from "@/modules/partners/payouts";

export const dynamic = "force-dynamic";

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  const session = await requirePermission("payouts.manage");
  const parsed = z.uuid().safeParse((await context.params).exportId);
  if (!parsed.success)
    return new Response(null, { status: 404, headers: HEADERS });
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  try {
    const file = await readWiseExportFile(actor, parsed.data);
    await logAdminRead(actor, "payout_export", parsed.data);
    return wiseCsvResponse(file, HEADERS);
  } catch (error) {
    if (error instanceof PayoutError) {
      const status = error.code === "PAYOUT_NOT_FOUND" ? 404 : 409;
      return Response.json({ code: error.code }, { status, headers: HEADERS });
    }
    throw error;
  }
}
