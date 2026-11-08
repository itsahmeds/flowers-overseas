/**
 * @purpose /admin/discounts actions, each guarded first (spec 047 AC-3)
 * @spec 047
 *
 * Thin (`plan/01` §5): `requirePermission(…)` is the first statement of every action
 * (`discounts.write` for create, update, disable and turn back on; `discounts.read` for the cost
 * preview), then one command of `modules/admin`, then a redirect naming the outcome by code, or
 * the field messages back to the form island. The URL carries the code's id, never its text.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { CURRENCY_CODES, isCurrencyCode } from "@/config/currencies";
import {
  adminRequestId,
  adminT,
  createDiscountCode,
  type DiscountCommandResult,
  discountCostPreview,
  type DiscountFormFields,
  requirePermission,
  setDiscountCodeStatus,
  updateDiscountCode,
} from "@/modules/admin";

import type { DiscountFormState, DiscountPreviewView } from "./form-types";
import { previewView } from "./view";

/** The form's own fields; Next's `$ACTION_…` keys are dropped, multi-selects kept as arrays. */
function fields(formData: FormData): DiscountFormFields {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$")) continue;
    const values = formData
      .getAll(key)
      .filter((value): value is string => typeof value === "string");
    out[key] =
      key === "countryIds" || key === "productIds" ? values : (values[0] ?? "");
  }
  return out;
}

async function actor(
  userId: string,
): Promise<{ readonly userId: string; readonly requestId: string }> {
  return { userId, requestId: await adminRequestId() };
}

function state(
  result: DiscountCommandResult,
  typed: DiscountFormFields,
): DiscountFormState {
  if (result.ok) return { result: null, errors: {} };
  const code =
    typeof typed["code"] === "string" ? typed["code"].trim().toUpperCase() : "";
  return {
    result: result.reason,
    errors: Object.fromEntries(
      Object.entries(result.errors).map(([field, error]) => [
        field,
        adminT(`admin.discounts.error.${error}`, { code }),
      ]),
    ),
  };
}

const IdSchema = z.uuid();

/** Every currency of ours, in registry order: the form posts fields for the ones it shows. */
const CURRENCIES = CURRENCY_CODES.filter(isCurrencyCode);

export async function createDiscountCodeAction(
  _previous: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const session = await requirePermission("discounts.write");
  const typed = fields(formData);
  const result = await createDiscountCode(
    await actor(session.userId),
    typed,
    CURRENCIES,
  );
  if (result.ok) redirect(`/admin/discounts/${result.id}?result=created`);
  return state(result, typed);
}

export async function updateDiscountCodeAction(
  _previous: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const session = await requirePermission("discounts.write");
  const typed = fields(formData);
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) return { result: "not_found", errors: {} };
  const result = await updateDiscountCode(
    await actor(session.userId),
    id.data,
    typed,
    CURRENCIES,
  );
  if (result.ok) redirect(`/admin/discounts/${result.id}?result=saved`);
  return state(result, typed);
}

async function setStatus(
  formData: FormData,
  status: "active" | "disabled",
): Promise<never> {
  const session = await requirePermission("discounts.write");
  const id = IdSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/discounts");
  const result = await setDiscountCodeStatus(
    await actor(session.userId),
    id.data,
    status,
  );
  if (!result.ok) redirect("/admin/discounts?result=not_found");
  redirect(
    `/admin/discounts/${id.data}?result=${status === "disabled" ? "disabled" : "enabled"}`,
  );
}

export async function disableDiscountCodeAction(
  formData: FormData,
): Promise<void> {
  await setStatus(formData, "disabled");
}

export async function enableDiscountCodeAction(
  formData: FormData,
): Promise<void> {
  await setStatus(formData, "active");
}

/** The cost preview of the offer as typed; reads only, writes nothing. */
export async function previewDiscountCostAction(
  formData: FormData,
): Promise<DiscountPreviewView> {
  const session = await requirePermission("discounts.read");
  const preview = await discountCostPreview(
    await actor(session.userId),
    fields(formData),
    CURRENCIES,
  );
  return previewView(preview);
}
