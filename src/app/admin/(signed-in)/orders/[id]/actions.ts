/**
 * @purpose /admin/orders/[id] reroute and cancel actions, each guarded first (020a AC-2, AC-10, AC-13)
 * @spec 020a
 *
 * Thin (`plan/01` §5): `requirePermission(…)` is the first statement of every action (spec 020a
 * AC-2, T-03 scans for it), then the form's fields, then one admin command (`adminOrderReroute`
 * over spec 016's `manualReroute`, `adminOrderCancel` over spec 013's `cancelOrder`), each running
 * through `runOrderAction`, then a redirect back to the order that names the action and its
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
import { manualReroute } from "@/modules/orders/routing/jobs";

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
const CancelFormSchema = BaseFormSchema.extend({
  reason: z.string(),
  note: z
    .string()
    .optional()
    .transform((note) =>
      note === undefined || note.trim() === "" ? undefined : note,
    ),
});

function rerouteForm(input: unknown) {
  const parsed = RerouteFormSchema.strip().safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function cancelForm(input: unknown) {
  const parsed = CancelFormSchema.strip().safeParse(input);
  if (!parsed.success) return undefined;
  const { note, ...rest } = parsed.data;
  return note === undefined ? rest : { ...rest, note };
}

function back(
  orderId: string,
  action: "reroute" | "cancel",
  result: AdminOrderActionResult,
): never {
  const id = z.uuid().safeParse(orderId);
  if (!id.success) redirect("/admin/orders");
  const params = new URLSearchParams({
    action,
    result: result.ok ? "done" : result.code,
  });
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
