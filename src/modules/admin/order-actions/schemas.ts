/**
 * The admin order actions' input and result shapes (spec 020a §5.2 "Shared input", "Result",
 * AC-20; TASK-357, TASK-359).
 *
 * Every action form carries the order, an `actionId` minted when the panel renders (the
 * idempotency key, and the primary key of its `admin_order_action` row) and `expectedSeq`, the
 * order's highest `order_event.seq` the admin saw. Each action extends that base. The reasons an
 * admin may choose are a strict subset of spec 013's `refund.reason` set: the system reasons
 * (`buyer_cancel`, `no_partner`, `authorisation_lapsing`, `redelivery_failed`) cannot be typed
 * into a refund, and a cancel takes only its own three.
 *
 * The note is internal (spec 020a §13 Q5): optional, at most 280 characters, required for the
 * reason `other`, and it lands only in `audit_log.reason`, never in a log line or a buyer surface.
 */
import { z } from "zod";

/** `admin_order_action.kind` (spec 020a §5.1). */
export const adminOrderActionKinds = [
  "reroute",
  "cancel",
  "refund_full",
  "refund_partial",
  "resend",
] as const;
export type AdminOrderActionKind = (typeof adminOrderActionKinds)[number];

/** The reasons a cancel may carry (spec 020a §2.3): all three from E, `buyer_cancel` only later. */
export const adminCancelReasons = [
  "buyer_cancel",
  "no_partner",
  "other",
] as const;
export type AdminCancelReason = (typeof adminCancelReasons)[number];

/** The reasons an admin may choose for a refund (spec 020a §5.2, AC-20), exactly these seven. */
export const adminRefundReasons = [
  "addon_missing",
  "late_delivery",
  "substitution_complaint",
  "quality",
  "goodwill",
  "duplicate",
  "other",
] as const;
export type AdminRefundReason = (typeof adminRefundReasons)[number];

/** The longest amount text the money field accepts; `parseMinorUnits` then reads at most 9 digits. */
export const ADMIN_AMOUNT_TEXT_MAX = 16;
/** The longest internal note (spec 020a §13 Q5). */
export const ADMIN_NOTE_MAX = 280;

export const AdminNoteSchema = z.string().trim().min(1).max(ADMIN_NOTE_MAX);
export const AdminCancelReasonSchema = z.enum(adminCancelReasons);
export const AdminRefundReasonSchema = z.enum(adminRefundReasons);

export const AdminOrderActionBaseSchema = z
  .object({
    orderId: z.uuid(),
    actionId: z.uuid(),
    expectedSeq: z.number().int().positive(),
  })
  .strict();
export type AdminOrderActionBase = z.infer<typeof AdminOrderActionBaseSchema>;

/** `other` carries a note, always (spec 020a §5.2, AC-20). */
function noteRequiredForOther(
  value: { reason: string; note?: string | undefined },
  context: z.RefinementCtx,
): void {
  if (value.reason === "other" && value.note === undefined) {
    context.addIssue({
      code: "custom",
      path: ["note"],
      message: "NOTE_REQUIRED",
    });
  }
}

export const AdminRerouteSchema = AdminOrderActionBaseSchema.extend({
  partnerId: z.uuid(),
}).strict();
export type AdminRerouteInput = z.infer<typeof AdminRerouteSchema>;

export const AdminCancelSchema = AdminOrderActionBaseSchema.extend({
  reason: AdminCancelReasonSchema,
  note: AdminNoteSchema.optional(),
})
  .strict()
  .superRefine(noteRequiredForOther);
export type AdminCancelInput = z.infer<typeof AdminCancelSchema>;

const AdminRefundFullSchema = AdminOrderActionBaseSchema.extend({
  kind: z.literal("full"),
  reason: AdminRefundReasonSchema,
  note: AdminNoteSchema.optional(),
}).strict();

const AdminRefundPartialSchema = AdminOrderActionBaseSchema.extend({
  kind: z.literal("partial"),
  amountText: z.string().max(ADMIN_AMOUNT_TEXT_MAX),
  reason: AdminRefundReasonSchema,
  note: AdminNoteSchema.optional(),
}).strict();

export const AdminRefundSchema = z
  .discriminatedUnion("kind", [AdminRefundFullSchema, AdminRefundPartialSchema])
  .superRefine(noteRequiredForOther);
export type AdminRefundInput = z.infer<typeof AdminRefundSchema>;

export const AdminResendSchema = AdminOrderActionBaseSchema.extend({
  deliveryId: z.uuid(),
}).strict();
export type AdminResendInput = z.infer<typeof AdminResendSchema>;

/** The refusal codes of spec 020a §5.2 "Result"; each has one admin message key (TASK-361). */
export const adminOrderActionCodes = [
  "FORBIDDEN",
  "ORDER_CHANGED",
  "DEMO_ORDER",
  "ORDER_TRANSITION_ILLEGAL",
  "PARTNER_NOT_ELIGIBLE",
  "CANCEL_REASON_NOT_ALLOWED",
  "AMOUNT_INVALID",
  "REFUND_EXCEEDS_CAPTURED",
  "CURRENCY_MISMATCH",
  "NOT_REFUNDABLE",
  "RESEND_NOT_ALLOWED",
  "RESEND_RATE_LIMITED",
] as const;
export type AdminOrderActionCode = (typeof adminOrderActionCodes)[number];

export type AdminOrderActionResult =
  | {
      readonly ok: true;
      readonly kind: AdminOrderActionKind;
      readonly resultRef: string;
      readonly replayed: boolean;
    }
  | { readonly ok: false; readonly code: AdminOrderActionCode };
