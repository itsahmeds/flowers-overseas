/**
 * @purpose POST the delivery photo (deliver, or add it); GET it back for the florist (AC-30)
 * @spec 011
 *
 *  - `POST` (`multipart/form-data`, field `photo`): a same-origin post from the photo step by a
 *    signed-in member. The body is read bounded while streaming (`readPhotoUpload`). An order out
 *    for delivery takes `markDelivered` (`order.delivered`, then `order.photo_uploaded`); a
 *    delivered order without a photo takes `addDeliveryPhoto`. A file that is not a JPEG, PNG or
 *    WebP by its bytes, or is over 15 MiB, goes back to the step with its message and stores
 *    nothing. Any other state writes nothing and shows the changed notice.
 *  - `GET`: the member's own photo, read through a 300-second signed URL of the private bucket
 *    and answered `private, no-store` from this origin; anyone else gets a bare 404.
 */
import { FLORIST_PATHS } from "@/config/florists";
import { sameOrigin } from "@/lib/auth/surface";
import { StoragePlacementError } from "@/lib/storage-r2";
import {
  addDeliveryPhoto,
  FloristActionError,
  floristActions,
  floristDeliveryPhotoResponse,
  markDelivered,
} from "@/modules/orders/florist-actions";
import {
  DeliveryPhotoRefused,
  privatePhotoStoreFrom,
  readPhotoUpload,
} from "@/modules/orders/photo";

import {
  commandContextOf,
  noticeOf,
  seeOther,
  withQuery,
} from "../../../../actions";
import { currentFloristContext } from "../../../../request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ assignmentId: string }> };

export async function POST(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const { assignmentId } = await params;
  const order = FLORIST_PATHS.order(assignmentId);
  const step = FLORIST_PATHS.photo(assignmentId);
  if (!sameOrigin(request)) {
    await request.body?.cancel();
    return seeOther(FLORIST_PATHS.base);
  }
  const context = await currentFloristContext();
  if (context === null) {
    await request.body?.cancel();
    return seeOther(FLORIST_PATHS.signIn);
  }
  const member = commandContextOf(context);
  const actions = await floristActions(member, assignmentId);
  const command = actions.includes("delivered")
    ? markDelivered
    : actions.includes("addPhoto")
      ? addDeliveryPhoto
      : null;
  if (command === null) {
    await request.body?.cancel();
    return seeOther(withQuery(order, "notice", "changed"));
  }
  try {
    const photo = await readPhotoUpload(request);
    await command(member, assignmentId, photo, {
      store: privatePhotoStoreFrom(),
    });
  } catch (error) {
    if (error instanceof DeliveryPhotoRefused) {
      return seeOther(
        withQuery(
          step,
          "error",
          error.reason === "too_large" ? "too_large" : "wrong_type",
        ),
      );
    }
    if (error instanceof FloristActionError) {
      return seeOther(withQuery(order, "notice", noticeOf(error.code)));
    }
    throw error;
  }
  return seeOther(order);
}

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { assignmentId } = await params;
  const missing = new Response(null, {
    status: 404,
    headers: { "cache-control": "private, no-store" },
  });
  const context = await currentFloristContext();
  if (context === null) return missing;
  let store: ReturnType<typeof privatePhotoStoreFrom>;
  try {
    store = privatePhotoStoreFrom();
  } catch (error) {
    // No private bucket configured here (a local run): there is no photo to show.
    if (error instanceof StoragePlacementError) return missing;
    throw error;
  }
  return floristDeliveryPhotoResponse(commandContextOf(context), assignmentId, {
    store,
  });
}
