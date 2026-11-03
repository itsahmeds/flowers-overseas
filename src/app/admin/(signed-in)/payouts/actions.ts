/**
 * @purpose /admin/payouts actions, each guarded first (030a AC-29; AC-12, AC-16 to AC-19, AC-24, AC-27, AC-28)
 * @spec 030a
 *
 * Thin (`plan/01` §5, spec 030a §5.2 "Module"): `requirePermission('payouts.manage')` is the first
 * statement of every action (admin and finance; ops and content get 403), then the form's fields
 * parsed at the boundary, then one payouts command through `runPayoutCommand` (one admin
 * transaction, audited by the command), then a redirect back that names the outcome as codes. The
 * URL carries ids, codes, a count, a statement number and florist codes only: never a note, a
 * reason, an amount or a name.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { adminRequestId, requirePermission } from "@/modules/admin";
import {
  AdjustmentSettleSchema,
  AdjustmentWaiveSchema,
  ManualPayoutLineSchema,
  PhotoWaiverSchema,
  WiseExportCreateSchema,
  accrueWithoutPhoto,
  addManualLine,
  cancelExport,
  createWiseExport,
  markExportPaid,
  markPaid,
  removeManualLine,
  resolveReview,
  runPayoutCommand,
  sendStatement,
  settleAdjustment,
  waiveAdjustment,
} from "@/modules/partners/payouts";

import { type PayoutsDialog, PAYOUTS_PATH, outcomeHref } from "./outcome";

/** The form's own text fields; Next's `$ACTION_…` keys are dropped. */
function fields(formData: FormData): Record<string, string> {
  const entries: [string, string][] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$") && typeof value === "string") {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

const Id = z.uuid();
/** Where a form came from, so the outcome lands on the page that posted it. */
const FromSchema = z.enum(["list", "detail", "export"]).catch("list");

async function actorOf(userId: string): Promise<{
  readonly userId: string;
  readonly requestId: string;
}> {
  return { userId, requestId: await adminRequestId() };
}

/** The page a form came from: the list, the payout or the export. */
function pageOf(from: string | undefined, id: string | undefined): string {
  const where = FromSchema.parse(from);
  const parsed = Id.safeParse(id);
  if (!parsed.success || where === "list") return PAYOUTS_PATH;
  return where === "export"
    ? `${PAYOUTS_PATH}/exports/${parsed.data}`
    : `${PAYOUTS_PATH}/${parsed.data}`;
}

/** The fields of a refused form, as their names (never their values). */
function invalidFields(
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): string[] {
  return [
    ...new Set(
      issues
        .map((issue) => issue.path[0])
        .filter((key): key is string => typeof key === "string"),
    ),
  ];
}

function refusedOrDone(
  page: string,
  result:
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly code: string;
        readonly partnerCodes?: readonly string[];
      },
  done: Record<string, string>,
  dialog?: PayoutsDialog,
): never {
  if (result.ok) redirect(outcomeHref(page, done));
  redirect(
    outcomeHref(page, {
      refused: result.code,
      ...(dialog === undefined ? {} : { open: dialog }),
      ...(result.partnerCodes === undefined
        ? {}
        : { codes: result.partnerCodes.join(",") }),
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Statements and exports                                                     */
/* -------------------------------------------------------------------------- */

export async function sendStatementAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const payoutId = Id.safeParse(input["payoutId"]);
  if (!payoutId.success) redirect(PAYOUTS_PATH);
  const page = pageOf(input["from"], payoutId.data);
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.statement_sent",
    async (executor) => {
      const sent = await sendStatement(executor, payoutId.data, actor);
      return sent.statementNumber;
    },
  );
  if (!result.ok) refusedOrDone(page, result, {});
  const florist = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .max(60)
    .safeParse(input["florist"]);
  redirect(
    outcomeHref(page, {
      done: "sent",
      n: result.value,
      ...(florist.success ? { florist: florist.data } : {}),
    }),
  );
}

export async function createExportAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const payoutIds = formData
    .getAll("payoutIds")
    .filter((value): value is string => typeof value === "string");
  const parsed = WiseExportCreateSchema.safeParse({ payoutIds });
  if (!parsed.success) {
    redirect(outcomeHref(PAYOUTS_PATH, { refused: "invalid" }));
  }
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout_export.created",
    async (executor) => {
      const created = await createWiseExport(executor, parsed.data, actor);
      return created.ok ? created.exportId : null;
    },
  );
  if (!result.ok) refusedOrDone(PAYOUTS_PATH, result, {});
  if (result.value === null) {
    redirect(outcomeHref(PAYOUTS_PATH, { refused: "invalid" }));
  }
  redirect(
    outcomeHref(`${PAYOUTS_PATH}/exports/${result.value}`, {
      done: "created",
      count: String(parsed.data.payoutIds.length),
    }),
  );
}

export async function markPaidAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const payoutId = Id.safeParse(input["payoutId"]);
  if (!payoutId.success) redirect(PAYOUTS_PATH);
  const page = pageOf(input["from"], input["pageId"] ?? payoutId.data);
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(actor, "payout.paid", (executor) =>
    markPaid(executor, payoutId.data, actor),
  );
  refusedOrDone(page, result, { done: "paid" });
}

export async function markExportPaidAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const exportId = Id.safeParse(input["exportId"]);
  if (!exportId.success) redirect(PAYOUTS_PATH);
  const page = `${PAYOUTS_PATH}/exports/${exportId.data}`;
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(actor, "payout.paid", (executor) =>
    markExportPaid(executor, exportId.data, actor),
  );
  if (!result.ok) refusedOrDone(page, result, {});
  redirect(
    outcomeHref(page, { done: "exportPaid", count: String(result.value.paid) }),
  );
}

export async function cancelExportAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const exportId = Id.safeParse(input["exportId"]);
  if (!exportId.success) redirect(PAYOUTS_PATH);
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout_export.cancelled",
    (executor) => cancelExport(executor, exportId.data, actor),
  );
  refusedOrDone(`${PAYOUTS_PATH}/exports/${exportId.data}`, result, {
    done: "cancelled",
  });
}

/* -------------------------------------------------------------------------- */
/* Adjustments and the photo waiver                                           */
/* -------------------------------------------------------------------------- */

export async function settleAdjustmentAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const adjustmentId = Id.safeParse(input["adjustmentId"]);
  if (!adjustmentId.success) redirect(PAYOUTS_PATH);
  const dialog: PayoutsDialog = `settle-${adjustmentId.data}`;
  const parsed = AdjustmentSettleSchema.safeParse({
    amountMinor: input["amountMinor"] ?? "",
    note: input["note"] ?? "",
  });
  if (!parsed.success) {
    redirect(
      outcomeHref(PAYOUTS_PATH, {
        open: dialog,
        err: invalidFields(parsed.error.issues).join(","),
      }),
    );
  }
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.adjustment_settled",
    (executor) =>
      settleAdjustment(executor, adjustmentId.data, parsed.data, actor),
  );
  refusedOrDone(PAYOUTS_PATH, result, { done: "settled" }, dialog);
}

export async function waiveAdjustmentAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const adjustmentId = Id.safeParse(input["adjustmentId"]);
  if (!adjustmentId.success) redirect(PAYOUTS_PATH);
  const dialog: PayoutsDialog = `waive-${adjustmentId.data}`;
  const parsed = AdjustmentWaiveSchema.safeParse({
    reason: input["reason"] ?? "",
  });
  if (!parsed.success) {
    redirect(outcomeHref(PAYOUTS_PATH, { open: dialog, err: "reason" }));
  }
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.adjustment_waived",
    (executor) =>
      waiveAdjustment(executor, adjustmentId.data, parsed.data, actor),
    { reason: parsed.data.reason },
  );
  refusedOrDone(PAYOUTS_PATH, result, { done: "waived" }, dialog);
}

export async function waivePhotoAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const orderId = Id.safeParse(input["orderId"]);
  if (!orderId.success) redirect(PAYOUTS_PATH);
  const dialog: PayoutsDialog = `waiver-${orderId.data}`;
  const parsed = PhotoWaiverSchema.safeParse({ reason: input["reason"] ?? "" });
  if (!parsed.success) {
    redirect(outcomeHref(PAYOUTS_PATH, { open: dialog, err: "reason" }));
  }
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.photo_waived",
    (executor) =>
      accrueWithoutPhoto(executor, orderId.data, parsed.data, actor),
    { reason: parsed.data.reason },
  );
  refusedOrDone(PAYOUTS_PATH, result, { done: "accrued" }, dialog);
}

/* -------------------------------------------------------------------------- */
/* Lines of one payout                                                        */
/* -------------------------------------------------------------------------- */

export async function addLineAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const payoutId = Id.safeParse(input["payoutId"]);
  if (!payoutId.success) redirect(PAYOUTS_PATH);
  const page = `${PAYOUTS_PATH}/${payoutId.data}`;
  const orderId = input["orderId"];
  const parsed = ManualPayoutLineSchema.safeParse({
    kind: input["kind"] ?? "",
    amountMinor: input["amountMinor"] ?? "",
    note: input["note"] ?? "",
    ...(orderId === undefined || orderId === "" ? {} : { orderId }),
  });
  if (!parsed.success) {
    const err = invalidFields(parsed.error.issues);
    const goodwill =
      input["kind"] === "goodwill" && err.includes("amountMinor")
        ? ["goodwill"]
        : [];
    redirect(
      outcomeHref(page, {
        open: "add-line",
        err: [...err, ...goodwill].join(","),
      }),
    );
  }
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.line_added",
    (executor) => addManualLine(executor, payoutId.data, parsed.data, actor),
  );
  refusedOrDone(page, result, { done: "lineAdded" }, "add-line");
}

export async function removeLineAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const payoutId = Id.safeParse(input["payoutId"]);
  const lineId = Id.safeParse(input["lineId"]);
  if (!payoutId.success || !lineId.success) redirect(PAYOUTS_PATH);
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.line_removed",
    (executor) => removeManualLine(executor, lineId.data, actor),
  );
  refusedOrDone(`${PAYOUTS_PATH}/${payoutId.data}`, result, {
    done: "lineRemoved",
  });
}

export async function resolveReviewAction(formData: FormData): Promise<void> {
  const session = await requirePermission("payouts.manage");
  const input = fields(formData);
  const payoutId = Id.safeParse(input["payoutId"]);
  const lineId = Id.safeParse(input["lineId"]);
  if (!payoutId.success || !lineId.success) redirect(PAYOUTS_PATH);
  const actor = await actorOf(session.userId);
  const result = await runPayoutCommand(
    actor,
    "payout.review_resolved",
    (executor) => resolveReview(executor, lineId.data, actor),
  );
  refusedOrDone(`${PAYOUTS_PATH}/${payoutId.data}`, result, {
    done: "reviewed",
  });
}
