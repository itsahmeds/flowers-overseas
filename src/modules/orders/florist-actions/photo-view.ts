/**
 * The florist's own delivery photo, shown back through a signed URL (spec 011 §2 "The delivery
 * photo": "The florist sees their photo through a signed URL valid for at most 5 minutes";
 * AC-30; TASK-215).
 *
 * The location is read under the member's **partner context**: `delivery_proof` through
 * `app_partner_sees_order` (`0011`) and `media_asset` through `0022`'s partner policy, so another
 * florist's photo is never found. The URL is minted by the storage seam with
 * `floristsConfig.photo.signedUrlTtlSeconds` (300 at most) and is never logged.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { withDbContext } from "@/lib/db";
import type { ObjectLocation } from "@/lib/storage";

import { deliveryPhotoSignedUrl, type PrivatePhotoStore } from "../photo/store";
import { drizzleExecutor, type OrderExecutor } from "../service/executor";

import type { FloristCommandContext } from "./commands";

const LocationRow = z.object({
  bucket: z.string().min(1),
  object_key: z.string().min(1),
});

/** Where the order's photo is, as the partner context sees it; `null` when there is none. */
export async function selectDeliveryPhotoLocation(
  executor: OrderExecutor,
  assignmentId: string,
): Promise<ObjectLocation | null> {
  if (!z.uuid().safeParse(assignmentId).success) return null;
  const [row] = await executor.execute(sql`
    SELECT m.bucket, m.object_key
    FROM order_assignment a
    JOIN delivery_proof d ON d.order_id = a.order_id
    JOIN media_asset m ON m.id = d.media_asset_id
    WHERE a.id = ${assignmentId} AND a.response = 'accept'
      AND m.kind = 'delivery_proof' AND m.visibility = 'private'
    ORDER BY d.uploaded_at DESC, d.id LIMIT 1`);
  if (row === undefined) return null;
  const parsed = LocationRow.parse(row);
  return { bucket: parsed.bucket, objectKey: parsed.object_key };
}

/** A signed URL of the member's photo for `assignmentId`, or `null`. */
export async function floristDeliveryPhotoUrl(
  ctx: FloristCommandContext,
  assignmentId: string,
  store: Pick<PrivatePhotoStore, "storage">,
): Promise<string | null> {
  const location = await withDbContext(
    {
      role: "partner",
      userId: ctx.userId,
      partnerIds: [...ctx.partnerIds],
      requestId: ctx.requestId ?? randomUUID(),
    },
    (db) => selectDeliveryPhotoLocation(drizzleExecutor(db), assignmentId),
  );
  return location === null ? null : deliveryPhotoSignedUrl(store, location);
}
