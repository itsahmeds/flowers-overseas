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

/** The form's own fields; Next's `$ACTION_…` keys are dropped. */
function fields(formData: FormData): Record<string, string> {
  const entries: [string, string][] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$") && typeof value === "string") {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

const SeqSchema = z.coerce.number().int().positive();

/** The base fields as the action schemas expect them: `expectedSeq` a number, no blank note. */
function actionInput(input: Record<string, string>): Record<string, unknown> {
  const seq = SeqSchema.safeParse(input["expectedSeq"]);
  const { note, ...rest } = input;
  return {
    ...rest,
    expectedSeq: seq.success ? seq.data : input["expectedSeq"],
    ...(note === undefined || note.trim() === "" ? {} : { note }),
  };
}

function back(
  orderId: unknown,
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
  const input = fields(formData);
  const result = await adminOrderReroute(actionInput(input), {
    guard: () => Promise.resolve(session),
    requestId: await adminRequestId(),
    reroute: (orderId, partnerId, actor, options) =>
      manualReroute(orderId, partnerId, actor, options),
  });
  back(input["orderId"], "reroute", result);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const session = await requirePermission("orders.cancel");
  const input = fields(formData);
  const result = await adminOrderCancel(actionInput(input), {
    guard: () => Promise.resolve(session),
    requestId: await adminRequestId(),
  });
  back(input["orderId"], "cancel", result);
}
