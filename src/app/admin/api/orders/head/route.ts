/**
 * @purpose GET: the order queue's head, for the 3 s poll (AC-18)
 * @spec 012
 *
 * `{ latestCreatedAt, count }` (`OrderQueueHeadSchema`) for the queue island's poll (spec 012
 * §2.6 "Arrival within 5 s"). `orders.view` first: no session is 401, a role without it 403, and
 * nothing is read. Never cached and never indexed: the admin header rules set both headers on
 * every `/admin` path, and this response sets them itself as well. Counts and one instant only;
 * no order field.
 */
import { adminRequestId, requirePermission } from "@/modules/admin";
import { orderQueueHead } from "@/modules/orders";
import { ADMIN_CACHE_HEADER, ADMIN_ROBOTS_HEADER } from "@/lib/admin-headers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await requirePermission("orders.view");
  const head = await orderQueueHead({
    userId: session.userId,
    requestId: await adminRequestId(),
  });
  return Response.json(head, {
    headers: {
      [ADMIN_CACHE_HEADER.key]: ADMIN_CACHE_HEADER.value,
      [ADMIN_ROBOTS_HEADER.key]: ADMIN_ROBOTS_HEADER.value,
    },
  });
}
