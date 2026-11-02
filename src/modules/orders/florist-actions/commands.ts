/**
 * The florist's commands (spec 011 §5.2 "Orders", commands; §2 "Actions", "The delivery photo",
 * "The order engine"; AC-27, AC-28, AC-29, AC-30, AC-31; ruling R1; TASK-215).
 *
 *  - `respondToOffer(ctx, assignmentId, OfferResponseInput)`: accept, or decline with a reason;
 *  - `markOutForDelivery(ctx, assignmentId)`;
 *  - `markDelivered(ctx, assignmentId, photo)`: deliver, then the photo (two events);
 *  - `addDeliveryPhoto(ctx, assignmentId, photo)`: the photo of an order already delivered.
 *
 * Each one, in this order (§5.2):
 *
 *   1. reads the assignment under the member's **partner context**: if row-level security hides
 *      it, `ASSIGNMENT_NOT_FOUND` (the 404);
 *   2. opens a **system** transaction, locks the order and then the assignment `FOR UPDATE`, and
 *      re-checks the partner, the answer, the state and the deadline under the lock (the partner
 *      role is read-only on every order table, and the second read closes the gap between check
 *      and write); an accept also re-reads the shop's status there and refuses it with
 *      `ASSIGNMENT_PARTNER_NOT_ACCEPTING` unless `canAcceptFor(mode, status)` (spec 026a AC-6);
 *   3. updates `order_assignment` (`response`, `responded_at`, `reason`) where it applies, and
 *      calls spec 010's `transition` with `partner:{partnerId}` and `payload.by_user_id`;
 *   4. after an answer, hands the order to the `AcceptedOrderEffect` for its mode (TASK-214's
 *      seam) inside the same transaction, so the answer and its effect commit together.
 *
 * Nothing here writes `"order".status`, `order_event` or `outbox`: `transition` does. A repeated
 * submission finds the state already advanced and writes nothing: `ASSIGNMENT_ALREADY_ANSWERED`
 * for a second answer, `ORDER_STATE_CHANGED` for a step the order has passed (the engine's
 * `ORDER_TRANSITION_ILLEGAL`, mapped). An open offer past `sla_expires_at` is
 * `ASSIGNMENT_EXPIRED` whether or not routing has recorded its `timeout` yet: §3 says an offer
 * past its time "is shown as expired and cannot be accepted; nothing moves it", so the command
 * neither answers it nor records the timeout (spec 016's `assignment.timed_out`).
 *
 * The photo is checked, re-encoded and stored **before** the transaction (no row lock is held
 * across an upload); if the transaction then refuses or fails, the stored object is deleted.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  FLORIST_PARTNER_STATUSES,
  type FloristPartnerStatus,
} from "@/config/florists";
import { withDbContext, withSystemContext } from "@/lib/db";
import { appEnvironment } from "@/lib/env.schema";
import { logger } from "@/lib/logger";

import {
  acceptedOrderEffectFor,
  type AcceptedOrderEffect,
} from "../demo/effect";
import { ActorSchema } from "../service/actor";
import { isOrderEngineError } from "../service/errors";
import type { OrderMode, OrderEventType } from "../service/events";
import { OrderModeSchema } from "../service/events";
import { drizzleExecutor, type OrderExecutor } from "../service/executor";
import { transition } from "../service/transition";
import {
  checkDeliveryPhoto,
  DEFAULT_PHOTO_LIMITS,
  type PhotoLimits,
  processDeliveryPhoto,
} from "../photo/process";
import { type PrivatePhotoStore, storeDeliveryPhoto } from "../photo/store";

import { canAcceptFor } from "./can-accept";
import { DeclineReasonSchema } from "./events";

/* -------------------------------------------------------------------------- */
/* Inputs, errors                                                             */
/* -------------------------------------------------------------------------- */

/** §5.2's `OfferResponseInputSchema`: accept, or decline with one reason from the closed list. */
export const OfferResponseInputSchema = z.discriminatedUnion("response", [
  z.object({ response: z.literal("accept") }).strict(),
  z
    .object({ response: z.literal("decline"), reason: DeclineReasonSchema })
    .strict(),
]);
export type OfferResponseInput = z.infer<typeof OfferResponseInputSchema>;

/**
 * §5.2's four errors, and spec 026a's fifth: `ASSIGNMENT_PARTNER_NOT_ACCEPTING`, an accept from a
 * shop whose status does not match the order's mode at that moment (`canAcceptFor`, AC-6).
 */
export const FLORIST_ACTION_ERROR_CODES = [
  "ASSIGNMENT_NOT_FOUND",
  "ASSIGNMENT_EXPIRED",
  "ASSIGNMENT_ALREADY_ANSWERED",
  "ORDER_STATE_CHANGED",
  "ASSIGNMENT_PARTNER_NOT_ACCEPTING",
] as const;
export type FloristActionErrorCode =
  (typeof FLORIST_ACTION_ERROR_CODES)[number];

/** A refusal: nothing was written. The message is the code, never an id or a value. */
export class FloristActionError extends Error {
  override readonly name = "FloristActionError";
  readonly code: FloristActionErrorCode;

  constructor(code: FloristActionErrorCode) {
    super(code);
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Where the commands run                                                     */
/* -------------------------------------------------------------------------- */

/** The signed-in member: who pressed the button, and the partners they act for. */
export interface FloristCommandContext {
  readonly userId: string;
  readonly partnerIds: readonly string[];
  /** The request's correlation id, when the route has one. */
  readonly requestId?: string;
}

/**
 * The two transactions a command opens. Production: `withDbContext` and `withSystemContext`.
 * The integration suite passes its own, over a scratch database, so two concurrent accepts run
 * on two connections.
 */
export interface FloristCommandRuntime {
  asPartner<T>(
    ctx: FloristCommandContext,
    fn: (executor: OrderExecutor) => Promise<T>,
  ): Promise<T>;
  asSystem<T>(
    job: string,
    fn: (executor: OrderExecutor) => Promise<T>,
  ): Promise<T>;
}

export const dbCommandRuntime: FloristCommandRuntime = {
  asPartner(ctx, fn) {
    return withDbContext(
      {
        role: "partner",
        userId: ctx.userId,
        partnerIds: [...ctx.partnerIds],
        requestId: ctx.requestId ?? randomUUID(),
      },
      (db) => fn(drizzleExecutor(db)),
    );
  },
  asSystem(job, fn) {
    return withSystemContext(job, (db) => fn(drizzleExecutor(db)));
  },
};

export interface FloristCommandDeps {
  readonly runtime?: FloristCommandRuntime;
  readonly now?: () => Date;
  readonly environment?: string;
  /** TASK-214's seam: which effect follows an answer for an order of `mode`. */
  readonly effectFor?: (
    mode: OrderMode,
    environment: string,
  ) => AcceptedOrderEffect;
  /** Spec 010's `transition` (spied on by the tests). */
  readonly transition?: typeof transition;
}

export interface PhotoCommandDeps extends FloristCommandDeps {
  readonly store: PrivatePhotoStore;
  readonly limits?: PhotoLimits;
  readonly newAssetId?: () => string;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

const Instant = z.union([z.date(), z.string()]).transform((value, ctx) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: "custom", message: "not an instant" });
    return z.NEVER;
  }
  return date;
});

const VisibleRow = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  partner_id: z.uuid(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  /** `partner_order.status`; `null` once the order is not this florist's to see. */
  status: z.string().min(1).nullable(),
});

/** Step 1: the assignment as the member's partner context sees it, or `ASSIGNMENT_NOT_FOUND`. */
async function visibleAssignment(
  runtime: FloristCommandRuntime,
  ctx: FloristCommandContext,
  assignmentId: string,
): Promise<z.infer<typeof VisibleRow>> {
  if (!z.uuid().safeParse(assignmentId).success) {
    throw new FloristActionError("ASSIGNMENT_NOT_FOUND");
  }
  const row = await runtime.asPartner(ctx, async (executor) => {
    const [found] = await executor.execute(sql`
      SELECT a.id, a.order_id, a.partner_id, a.response, o.status
      FROM order_assignment a LEFT JOIN partner_order o ON o.id = a.order_id
      WHERE a.id = ${assignmentId}`);
    return found;
  });
  if (row === undefined) throw new FloristActionError("ASSIGNMENT_NOT_FOUND");
  return VisibleRow.parse(row);
}

const LockedOrder = z.object({
  id: z.uuid(),
  status: z.string().min(1),
  mode: OrderModeSchema,
});

const LockedAssignment = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  partner_id: z.uuid(),
  response: z.enum(["accept", "decline", "timeout"]).nullable(),
  sla_expires_at: Instant,
  withdrawn_at: Instant.nullable(),
});

const AssignmentFacts = z.object({
  latest: z.boolean(),
  has_photo: z.boolean(),
});

interface Locked {
  readonly order: z.infer<typeof LockedOrder>;
  readonly assignment: z.infer<typeof LockedAssignment>;
  readonly latest: boolean;
  readonly hasPhoto: boolean;
}

/**
 * Step 2: the order, then the assignment, `FOR UPDATE` (the engine's own lock order: the order
 * row first), and the member's partner re-checked under the lock.
 */
async function lockForCommand(
  executor: OrderExecutor,
  ctx: FloristCommandContext,
  visible: z.infer<typeof VisibleRow>,
): Promise<Locked> {
  const [orderRow] = await executor.execute(sql`
    SELECT id, status, mode FROM "order" WHERE id = ${visible.order_id} FOR UPDATE`);
  const [assignmentRow] = await executor.execute(sql`
    SELECT id, order_id, partner_id, response, sla_expires_at, withdrawn_at
    FROM order_assignment WHERE id = ${visible.id} FOR UPDATE`);
  if (orderRow === undefined || assignmentRow === undefined) {
    throw new FloristActionError("ASSIGNMENT_NOT_FOUND");
  }
  const order = LockedOrder.parse(orderRow);
  const assignment = LockedAssignment.parse(assignmentRow);
  if (
    assignment.order_id !== order.id ||
    !ctx.partnerIds.includes(assignment.partner_id)
  ) {
    throw new FloristActionError("ASSIGNMENT_NOT_FOUND");
  }
  const [factsRow] = await executor.execute(sql`
    SELECT
      ${assignment.id}::uuid = (
        SELECT b.id FROM order_assignment b WHERE b.order_id = ${order.id}
        ORDER BY b.attempt DESC LIMIT 1
      ) AS latest,
      EXISTS (SELECT 1 FROM delivery_proof d WHERE d.order_id = ${order.id}) AS has_photo`);
  const facts = AssignmentFacts.parse(factsRow);
  return { order, assignment, latest: facts.latest, hasPhoto: facts.has_photo };
}

const PartnerStatusRow = z.object({
  status: z.enum(FLORIST_PARTNER_STATUSES),
});

/** The assignment's partner's status, read inside the command's locked transaction. */
async function lockedPartnerStatus(
  executor: OrderExecutor,
  partnerId: string,
): Promise<FloristPartnerStatus> {
  const [row] = await executor.execute(sql`
    SELECT status FROM fulfillment_partner WHERE id = ${partnerId}`);
  if (row === undefined) throw new FloristActionError("ASSIGNMENT_NOT_FOUND");
  return PartnerStatusRow.parse(row).status;
}

/** The accepted assignment a step after acceptance needs, or the refusal. */
function assertAcceptedAndLive(locked: Locked): void {
  if (
    locked.assignment.response !== "accept" ||
    locked.assignment.withdrawn_at !== null
  ) {
    throw new FloristActionError("ORDER_STATE_CHANGED");
  }
}

function partnerActor(partnerId: string): string {
  return ActorSchema.parse(`partner:${partnerId}`);
}

/** Runs the engine; an arrow the machine does not allow from here is `ORDER_STATE_CHANGED`. */
async function move(
  deps: FloristCommandDeps,
  executor: OrderExecutor,
  orderId: string,
  event: OrderEventType,
  actor: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const engine = deps.transition ?? transition;
  try {
    await engine(orderId, event, actor, payload, { executor });
  } catch (error) {
    if (isOrderEngineError(error, "ORDER_TRANSITION_ILLEGAL")) {
      throw new FloristActionError("ORDER_STATE_CHANGED");
    }
    throw error;
  }
}

function runtimeOf(deps: FloristCommandDeps): FloristCommandRuntime {
  return deps.runtime ?? dbCommandRuntime;
}

/* -------------------------------------------------------------------------- */
/* respondToOffer                                                             */
/* -------------------------------------------------------------------------- */

export interface CommandResult {
  readonly orderId: string;
  readonly assignmentId: string;
}

/** Accept, or decline with a reason (AC-27, AC-28). */
export async function respondToOffer(
  ctx: FloristCommandContext,
  assignmentId: string,
  input: unknown,
  deps: FloristCommandDeps = {},
): Promise<CommandResult & { readonly response: "accept" | "decline" }> {
  const answer = OfferResponseInputSchema.parse(input);
  const runtime = runtimeOf(deps);
  const visible = await visibleAssignment(runtime, ctx, assignmentId);
  const now = (deps.now ?? (() => new Date()))();
  const environment = deps.environment ?? appEnvironment(process.env);
  const effectFor = deps.effectFor ?? acceptedOrderEffectFor;

  return runtime.asSystem("florists.respond", async (executor) => {
    const locked = await lockForCommand(executor, ctx, visible);
    const { assignment, order } = locked;
    if (assignment.response === "timeout") {
      throw new FloristActionError("ASSIGNMENT_EXPIRED");
    }
    if (assignment.response !== null) {
      throw new FloristActionError("ASSIGNMENT_ALREADY_ANSWERED");
    }
    if (
      assignment.withdrawn_at !== null ||
      order.status !== "routed" ||
      !locked.latest
    ) {
      throw new FloristActionError("ORDER_STATE_CHANGED");
    }
    if (now.getTime() >= assignment.sla_expires_at.getTime()) {
      throw new FloristActionError("ASSIGNMENT_EXPIRED");
    }
    // Spec 026a AC-6: the shop's status, read now and under the order's and the assignment's lock,
    // must match the order's mode for an accept (a paused shop declines but accepts nothing).
    if (answer.response === "accept") {
      const partnerStatus = await lockedPartnerStatus(
        executor,
        assignment.partner_id,
      );
      if (!canAcceptFor(order.mode, partnerStatus)) {
        logger.info(
          {
            assignment_id: assignment.id,
            partner_id: assignment.partner_id,
            partner_status: partnerStatus,
          },
          "florist_accept_refused",
        );
        throw new FloristActionError("ASSIGNMENT_PARTNER_NOT_ACCEPTING");
      }
    }

    const reason = answer.response === "decline" ? answer.reason : null;
    await executor.execute(sql`
      UPDATE order_assignment
      SET response = ${answer.response}, responded_at = ${now.toISOString()}::timestamptz,
          reason = ${reason}
      WHERE id = ${assignment.id}`);

    const base = {
      mode: order.mode,
      assignment_id: assignment.id,
      by_user_id: ctx.userId,
    };
    const actor = partnerActor(assignment.partner_id);
    const effect = effectFor(order.mode, environment);
    const effectContext = { orderId: order.id, mode: order.mode, executor };
    if (answer.response === "accept") {
      await move(deps, executor, order.id, "assignment.accepted", actor, base);
      await effect.afterAccept(effectContext);
    } else {
      await move(deps, executor, order.id, "assignment.declined", actor, {
        ...base,
        reason: answer.reason,
      });
      await effect.afterDecline(effectContext);
    }
    logger.info(
      { assignment_id: assignment.id, response: answer.response },
      "florists.offer_answered",
    );
    return {
      orderId: order.id,
      assignmentId: assignment.id,
      response: answer.response,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* markOutForDelivery                                                         */
/* -------------------------------------------------------------------------- */

/** The bouquet leaves the shop (AC-29): `order.out_for_delivery`, once. */
export async function markOutForDelivery(
  ctx: FloristCommandContext,
  assignmentId: string,
  deps: FloristCommandDeps = {},
): Promise<CommandResult> {
  const runtime = runtimeOf(deps);
  const visible = await visibleAssignment(runtime, ctx, assignmentId);
  return runtime.asSystem("florists.dispatch", async (executor) => {
    const locked = await lockForCommand(executor, ctx, visible);
    assertAcceptedAndLive(locked);
    await move(
      deps,
      executor,
      locked.order.id,
      "order.out_for_delivery",
      partnerActor(locked.assignment.partner_id),
      {
        mode: locked.order.mode,
        assignment_id: locked.assignment.id,
        by_user_id: ctx.userId,
      },
    );
    return { orderId: locked.order.id, assignmentId: locked.assignment.id };
  });
}

/* -------------------------------------------------------------------------- */
/* The photo: markDelivered, addDeliveryPhoto                                 */
/* -------------------------------------------------------------------------- */

export interface PhotoCommandResult extends CommandResult {
  readonly mediaAssetId: string;
}

async function submitPhoto(
  step: "deliver" | "photo",
  ctx: FloristCommandContext,
  assignmentId: string,
  upload: Uint8Array,
  deps: PhotoCommandDeps,
): Promise<PhotoCommandResult> {
  const runtime = runtimeOf(deps);
  const limits = deps.limits ?? DEFAULT_PHOTO_LIMITS;
  const visible = await visibleAssignment(runtime, ctx, assignmentId);
  // A cheap look before the upload, so a stale or forged post stores nothing; the lock below
  // and the engine decide. (`partner_order` shows the florist only an open or accepted offer,
  // and an open one is always at `routed`, so the status alone says "accepted, at this step".)
  if (
    visible.status !== (step === "deliver" ? "out_for_delivery" : "delivered")
  ) {
    throw new FloristActionError("ORDER_STATE_CHANGED");
  }
  // Type and size first, then the re-encode: a refused file is never stored.
  const processed = await processDeliveryPhoto(
    checkDeliveryPhoto(upload, limits.maxBytes),
    limits,
  );
  const assetId = (deps.newAssetId ?? randomUUID)();
  const location = await storeDeliveryPhoto(deps.store, assetId, processed);

  try {
    return await runtime.asSystem("florists.photo", async (executor) => {
      const locked = await lockForCommand(executor, ctx, visible);
      assertAcceptedAndLive(locked);
      // One photo per order: a second post (a double tap, another device) writes nothing.
      if (locked.hasPhoto) throw new FloristActionError("ORDER_STATE_CHANGED");
      const actor = partnerActor(locked.assignment.partner_id);
      const base = {
        mode: locked.order.mode,
        assignment_id: locked.assignment.id,
        by_user_id: ctx.userId,
      };
      if (step === "deliver") {
        await move(
          deps,
          executor,
          locked.order.id,
          "order.delivered",
          actor,
          base,
        );
      } else if (locked.order.status !== "delivered") {
        // `addDeliveryPhoto` is for an order already delivered; the engine would also let
        // `order.photo_uploaded` through only from `delivered`.
        throw new FloristActionError("ORDER_STATE_CHANGED");
      }
      await executor.execute(sql`
        INSERT INTO media_asset (id, kind, bucket, object_key, mime, width, height, bytes,
                                 checksum_sha256, visibility, source, exif_stripped, depicts)
        VALUES (${assetId}, 'delivery_proof', ${location.bucket}, ${location.objectKey},
                'image/jpeg', ${processed.width}, ${processed.height}, ${processed.bytes},
                ${processed.checksumSha256}, 'private', 'partner', true, 'delivery')`);
      await executor.execute(sql`
        INSERT INTO delivery_proof (order_id, media_asset_id, uploaded_by, public_use_consent)
        VALUES (${locked.order.id}, ${assetId}, ${actor}, false)`);
      await move(
        deps,
        executor,
        locked.order.id,
        "order.photo_uploaded",
        actor,
        {
          ...base,
          media_asset_id: assetId,
        },
      );
      logger.info(
        { assignment_id: locked.assignment.id, step },
        "florists.photo_received",
      );
      return {
        orderId: locked.order.id,
        assignmentId: locked.assignment.id,
        mediaAssetId: assetId,
      };
    });
  } catch (error) {
    // Nothing references the object now: remove it, and keep the original error.
    await deps.store.storage.delete(location).catch((deleteError: unknown) => {
      logger.warn(
        {
          error:
            deleteError instanceof Error ? deleteError.name : "unknown_error",
        },
        "florists.photo_orphan_delete_failed",
      );
    });
    throw error;
  }
}

/** Delivered, with the photo (AC-30): `order.delivered`, then `order.photo_uploaded`. */
export function markDelivered(
  ctx: FloristCommandContext,
  assignmentId: string,
  photo: Uint8Array,
  deps: PhotoCommandDeps,
): Promise<PhotoCommandResult> {
  return submitPhoto("deliver", ctx, assignmentId, photo, deps);
}

/** The photo of an order already delivered (AC-30): `order.photo_uploaded` alone. */
export function addDeliveryPhoto(
  ctx: FloristCommandContext,
  assignmentId: string,
  photo: Uint8Array,
  deps: PhotoCommandDeps,
): Promise<PhotoCommandResult> {
  return submitPhoto("photo", ctx, assignmentId, photo, deps);
}
