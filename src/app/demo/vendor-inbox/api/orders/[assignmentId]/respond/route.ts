/**
 * @purpose POST: the florist accepts or declines an offer (AC-27, AC-28)
 * @spec 011
 *
 * A same-origin form post from the order page (`response=accept`) or the decline step
 * (`response=decline&reason=…`), by a signed-in member: `respondToOffer` (TASK-215), then `303`.
 * Accepted: back to the order, now showing the recipient. Declined: to the list, which no longer
 * has it. Refused: the order page with its notice. A body that is not one of the two shapes
 * changes nothing (a decline without a reason goes back to the reasons).
 */
import { FLORIST_PATHS } from "@/config/florists";
import { sameOrigin } from "@/lib/auth/surface";
import { readBoundedBody } from "@/lib/consent";
import {
  FloristActionError,
  OfferResponseInputSchema,
  respondToOffer,
} from "@/modules/orders/florist-actions";

import {
  commandContextOf,
  noticeOf,
  seeOther,
  SMALL_FORM_MAX_BYTES,
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
  if (!sameOrigin(request)) return seeOther(FLORIST_PATHS.base);
  const context = await currentFloristContext();
  if (context === null) return seeOther(FLORIST_PATHS.signIn);
  const raw = await readBoundedBody(request, SMALL_FORM_MAX_BYTES);
  const fields = Object.fromEntries(new URLSearchParams(raw ?? ""));
  const input = OfferResponseInputSchema.safeParse(fields);
  if (!input.success) {
    return seeOther(
      fields["response"] === "decline"
        ? FLORIST_PATHS.decline(assignmentId)
        : order,
    );
  }
  try {
    await respondToOffer(commandContextOf(context), assignmentId, input.data);
  } catch (error) {
    if (!(error instanceof FloristActionError)) throw error;
    return seeOther(withQuery(order, "notice", noticeOf(error.code)));
  }
  return seeOther(
    input.data.response === "accept" ? order : FLORIST_PATHS.base,
  );
}
