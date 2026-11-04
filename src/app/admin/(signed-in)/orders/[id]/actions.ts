/**
 * @purpose /admin/orders/[id] reroute, cancel, refund and resend actions, each guarded first (020a AC-2, AC-10, AC-13, AC-17, AC-18, AC-25)
 * @spec 020a
 *
 * Thin (`plan/01` §5): `requirePermission(…)` is the first statement of every action (spec 020a
 * AC-2, T-03 scans for it), then the form's fields, then one admin command (`adminOrderReroute`
 * over spec 016's `manualReroute`, `adminOrderCancel` over spec 013's `cancelOrder`), each running
 * through `runOrderAction` (`adminResendNotification` over spec 016's `resendNotification` too),
 * `refundOrderAction` runs spec 020a's `adminOrderRefund` (TASK-359, imported by path) with the
 * card provider from payments' `adminRefundDeps()`; without the provider's keys it refuses with
 * `PROVIDER_NOT_CONFIGURED` and writes nothing (TASK-361),
 * then a redirect back to the order that names the action and its
 * outcome as codes. The URL carries the order's uuid (the page's own path segment) and codes only:
 * never a note, a name or a florist.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adminOrderReroute,
  adminRequestId,
  type AdminOrderActionResult,
  requirePermission,
} from "@/modules/admin";
import { adminOrderCancel } from "@/modules/admin/order-actions/cancel";
import { adminOrderRefund } from "@/modules/admin/order-actions/refund";
import { adminResendNotification } from "@/modules/admin/order-actions/resend";
import { manualReroute } from "@/modules/orders/routing/jobs";
import { adminRefundDeps } from "@/modules/payments";

/**
 * The posted fields at the boundary (unknown keys, Next's `$ACTION_…` among them, stripped):
 * `expectedSeq` arrives as text and becomes a number; a blank note is no note. The command then
 * parses the result with its own strict schema (`AdminRerouteSchema`, `AdminCancelSchema`).
 */
const BaseFormSchema = z.object({
  orderId: z.string(),
  actionId: z.string(),
  expectedSeq: z.coerce.number(),
});
const RerouteFormSchema = BaseFormSchema.extend({ partnerId: z.string() });
const ResendFormSchema = BaseFormSchema.extend({ deliveryId: z.string() });
const CancelFormSchema = BaseFormSchema.extend({
  reason: z.string(),
  note: z
    .string()
    .optional()
    .transform((note) =>
      note === undefined || note.trim() === "" ? undefined : note,
    ),
});

/**
 * A refund form: `kind` decides whether an amount is read (a full refund's amount is the server's,
 * so a posted one is dropped). A missing reason stays missing, so the command's strict schema
 * answers `INPUT_INVALID` and the dialog says so, rather than leaving the page.
 */
const RefundFormSchema = BaseFormSchema.extend({
  kind: z.enum(["full", "partial"]),
  amountText: z.string().optional(),
  reason: z.string().optional(),
  note: CancelFormSchema.shape.note,
});

function refundForm(input: unknown) {
  const parsed = RefundFormSchema.strip().safeParse(input);
  if (!parsed.success) return undefined;
  const { note, amountText, reason, ...rest } = parsed.data;
  return {
    ...rest,
    ...(rest.kind === "partial" ? { amountText: amountText ?? "" } : {}),
    ...(reason === undefined ? {} : { reason }),
    ...(note === undefined ? {} : { note }),
  };
}

function rerouteForm(input: unknown) {
  const parsed = RerouteFormSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function resendForm(input: unknown) {
  const parsed = ResendFormSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function cancelForm(input: unknown) {
  const parsed = CancelFormSchema.strip().safeParse(input);
  if (!parsed.success) return undefined;
  const { note, ...rest } = parsed.data;
  return note === undefined ? rest : { ...rest, note };
}

/** Refused before the command runs: the card provider has no keys (TASK-361). */
type ProviderRefusal = {
  readonly ok: false;
  readonly code: "PROVIDER_NOT_CONFIGURED";
};

function outcomeCode(result: AdminOrderActionResult | ProviderRefusal): string {
  if (result.ok) return "done";
  // A partial refund of exactly the balance: "use Refund in full" (spec 020a AC-18).
  if ("hint" in result && result.hint === "use_full_refund") {
    return "USE_FULL_REFUND";
  }
  return result.code;
}

function back(
  orderId: string,
  action: "reroute" | "cancel" | "resend" | "refund_full" | "refund_partial",
  result: AdminOrderActionResult | ProviderRefusal,
): never {
  const id = z.uuid().safeParse(orderId);
  if (!id.success) redirect("/admin/orders");
  const params = new URLSearchParams({ action, result: outcomeCode(result) });
  // A resend names its new delivery row, a refund its refund row (uuids, no personal data), so
  // the result line can say which email went or how much was asked for (TASK-361).
  if (action !== "reroute" && action !== "cancel" && result.ok) {
    params.set("ref", result.resultRef);
  }
  redirect(`/admin/orders/${id.data}?${params.toString()}`);
}

export async function rerouteOrderAction(formData: FormData): Promise<void> {
  const session = await requirePermission("orders.reroute");
  const input = rerouteForm(Object.fromEntries(formData));
  if (input === undefined) redirect("/admin/orders");
  const result = await adminOrderReroute(input, {
    guard: () => Promise.resolve(session),
    requestId: await adminRequestId(),
    reroute: (orderId, partnerId, actor, options) =>
      manualReroute(orderId, partnerId, actor, options),
  });
  back(input.orderId, "reroute", result);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const session = await requirePermission("orders.cancel");
  const input = cancelForm(Object.fromEntries(formData));
  if (input === undefined) redirect("/admin/orders");
  const result = await adminOrderCancel(input, {
    guard: () => Promise.resolve(session),
    requestId: await adminRequestId(),
  });
  back(input.orderId, "cancel", result);
}

export async function resendEmailAction(formData: FormData): Promise<void> {
  const session = await requirePermission("orders.resend");
  const input = resendForm(Object.fromEntries(formData));
  if (input === undefined) redirect("/admin/orders");
  const result = await adminResendNotification(input, {
    guard: () => Promise.resolve(session),
    requestId: await adminRequestId(),
  });
  back(input.orderId, "resend", result);
}

export async function refundOrderAction(formData: FormData): Promise<void> {
  const session = await requirePermission("orders.refund");
  const input = refundForm(Object.fromEntries(formData));
  if (input === undefined) redirect("/admin/orders");
  const action = input.kind === "full" ? "refund_full" : "refund_partial";
  const refund = adminRefundDeps();
  if (refund === null) {
    back(input.orderId, action, {
      ok: false,
      code: "PROVIDER_NOT_CONFIGURED",
    });
  }
  const result = await adminOrderRefund(input, {
    guard: () => Promise.resolve(session),
    requestId: await adminRequestId(),
    refund,
  });
  back(input.orderId, action, result);
}
