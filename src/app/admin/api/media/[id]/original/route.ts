/**
 * @purpose GET /admin/api/media/[id]/original: a photo's stored original for the admin preview (012b §2.7)
 * @spec 012b
 *
 * Spec 012b §2.7 (TASK-299). The review page shows the photo at full size before it is approved,
 * and a pending photo has no public URL (its variants are never published before approval). So
 * admin reads the stored original, already stripped of every metadata block, through this
 * same-origin route: `media.review` first (no session 401, without it 403), then the private
 * bucket. Private, never cached, never indexed.
 */
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";
import {
  adminRequestId,
  mediaOriginal,
  requirePermission,
} from "@/modules/admin";

export const dynamic = "force-dynamic";

const HEADERS = {
  [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
  [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await requirePermission("media.review");
  const original = await mediaOriginal(
    {
      userId: session.userId,
      requestId: await adminRequestId(),
      roles: session.roles,
    },
    (await params).id,
  );
  if (original === undefined) {
    return new Response(null, { status: 404, headers: HEADERS });
  }
  return new Response(new Uint8Array(original.body), {
    status: 200,
    headers: {
      ...HEADERS,
      "Content-Type": original.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
