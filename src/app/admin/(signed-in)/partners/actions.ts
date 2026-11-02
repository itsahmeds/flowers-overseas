/**
 * @purpose /admin/partners actions, each guarded first (AC-15, AC-16)
 * @spec 012
 *
 * Thin (`plan/01` §5): `requirePermission(…)` is the first statement of every action (T-02 scans
 * for it), then one partner command, then a redirect that names the outcome, the form and, for a
 * refusal, the refused fields as codes. The URL carries the florist's code and codes only, never
 * a value a person typed. Profile, terms, zones and days off need `partner.edit` (admin, ops),
 * products and payouts `partner.payout` (admin, finance), the status `partner.status` (admin,
 * ops): the database refuses nothing the guard let through, and the guard lets through nothing
 * the matrix does not mark.
 */
"use server";

import { redirect } from "next/navigation";

import { adminRequestId, requirePermission } from "@/modules/admin";
import {
  type PartnerCommandResult,
  createPartner,
  recordTerms,
  saveBlackout,
  saveCoverage,
  saveMapping,
  setPartnerStatus,
  updatePartner,
} from "@/modules/partners";

import { type PartnerForm, PartnerCodeSchema, errorsParam } from "./view";

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

/** The florist page of `code`, or the list when the form named none it can trust. */
function pageOf(code: unknown): string {
  const parsed = PartnerCodeSchema.safeParse(code);
  return parsed.success
    ? `/admin/partners/${encodeURIComponent(parsed.data)}`
    : "/admin/partners";
}

function outcome(
  result: PartnerCommandResult,
  form: PartnerForm,
  input: Record<string, string>,
  saved: Record<string, string> = { result: "saved" },
): never {
  if (result.ok) {
    redirect(
      `${pageOf(result.code)}?${new URLSearchParams({ ...saved, form }).toString()}`,
    );
  }
  const params = new URLSearchParams({ result: result.reason, form });
  if (result.reason === "invalid")
    params.set("err", errorsParam(result.errors));
  redirect(`${pageOf(input["code"])}?${params.toString()}`);
}

async function actor(userId: string): Promise<{
  readonly userId: string;
  readonly requestId: string;
}> {
  return { userId, requestId: await adminRequestId() };
}

export async function createPartnerAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.edit");
  const input = fields(formData);
  const result = await createPartner(await actor(session.userId), input);
  if (result.ok) {
    redirect(`${pageOf(result.code)}?result=created`);
  }
  const params = new URLSearchParams({
    result: result.reason,
    form: "profile",
  });
  if (result.reason === "invalid")
    params.set("err", errorsParam(result.errors));
  redirect(`/admin/partners/new?${params.toString()}`);
}

export async function updatePartnerAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.edit");
  const input = fields(formData);
  outcome(
    await updatePartner(await actor(session.userId), input),
    "profile",
    input,
  );
}

export async function recordTermsAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.edit");
  const input = fields(formData);
  outcome(
    await recordTerms(await actor(session.userId), input),
    "terms",
    input,
  );
}

export async function saveCoverageAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.edit");
  const input = fields(formData);
  outcome(
    await saveCoverage(await actor(session.userId), input),
    "zones",
    input,
  );
}

export async function saveBlackoutAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.edit");
  const input = fields(formData);
  outcome(
    await saveBlackout(await actor(session.userId), input),
    "daysOff",
    input,
  );
}

export async function saveMappingAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.payout");
  const input = fields(formData);
  outcome(
    await saveMapping(await actor(session.userId), input),
    "products",
    input,
  );
}

export async function setPartnerStatusAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("partner.status");
  const input = fields(formData);
  outcome(
    await setPartnerStatus(await actor(session.userId), input),
    "status",
    input,
    { result: "status", to: input["to"] ?? "" },
  );
}
