/**
 * @purpose POST: the florist marks an accepted order out for delivery (AC-29)
 * @spec 011
 *
 * A same-origin form post from the order page by a signed-in member: `markOutForDelivery`
 * (TASK-215), then `303` back to the order. In a state `order_transition` does not allow (a
 * forged or stale post) nothing is written and the order page shows the changed notice.
 */
import { FLORIST_PATHS } from "@/config/florists";
import { sameOrigin } from "@/lib/auth/surface";
import {
  FloristActionError,
  markOutForDelivery,
} from "@/modules/orders/florist-actions";

import {
  commandContextOf,
  noticeOf,
  seeOther,
  withQuery,
} from "../../../../actions";
import { currentFloristContext } from "../../../../request";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
): Promise<Response> {
  const { assignmentId } = await params;
  const order = FLORIST_PATHS.order(assignmentId);
  await request.body?.cancel();
  if (!sameOrigin(request)) return seeOther(FLORIST_PATHS.base);
  const context = await currentFloristContext();
  if (context === null) return seeOther(FLORIST_PATHS.signIn);
  try {
    await markOutForDelivery(commandContextOf(context), assignmentId);
  } catch (error) {
    if (!(error instanceof FloristActionError)) throw error;
    return seeOther(withQuery(order, "notice", noticeOf(error.code)));
  }
  return seeOther(order);
}
