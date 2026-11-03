/**
 * @purpose GET: a sent payout's statement PDF through a 5-minute private link (spec 030a §5.3, §6, §8)
 * @spec 030a
 *
 * `payouts.manage` first: no session is 401, a role without it (ops, content) 403, and nothing is
 * read. Then the statement's private object (`statement_media_asset_id`) is looked up in an admin
 * read transaction, the opening is recorded with `logAdminRead('payout', id)`, and the answer is a
 * 303 to a signed URL of the private bucket that works for 5 minutes. The link is made at the
 * click, never rendered into the page, so it is not stale and never sits in a page's HTML.
 * A malformed id, or a payout whose PDF the job has not stored yet, is 404. Nothing is logged but
 * the payout id.
 */
import { z } from "zod";

import {
  adminRequestId,
  logAdminRead,
  requirePermission,
} from "@/modules/admin";
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import {
  privateStatementStore,
  readPayouts,
  statementFileOf,
} from "@/modules/partners/payouts";

export const dynamic = "force-dynamic";

/** How long the signed link works (spec 030a §5.3: "signed URL, 5 minutes"). */
const STATEMENT_LINK_SECONDS = 300;

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ payoutId: string }> },
): Promise<Response> {
  const session = await requirePermission("payouts.manage");
  const parsed = z.uuid().safeParse((await context.params).payoutId);
  if (!parsed.success) {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const file = await readPayouts(actor, (executor) =>
    statementFileOf(executor, parsed.data),
  );
  if (file === undefined) {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  const { storage } = await privateStatementStore();
  const url = await storage.getSignedUrl(
    { bucket: file.bucket, objectKey: file.objectKey },
    STATEMENT_LINK_SECONDS,
  );
  await logAdminRead(actor, "payout", parsed.data);
  return new Response(null, {
    status: 303,
    headers: { ...HEADERS, Location: url },
  });
}
