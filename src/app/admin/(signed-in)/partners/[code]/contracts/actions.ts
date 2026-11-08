/**
 * @purpose The Contracts tab's edit and withdraw actions, each guarded first (030b AC-38, AC-41)
 * @spec 030b
 *
 * Thin (`plan/01` §5): `requirePermission("partner.contract.write")` is the first statement
 * (admin only; every other role 403, nothing changes), then one contract command, then a redirect
 * to the tab naming the outcome as codes. The reason and the note never reach the URL.
 */
"use server";

import { redirect } from "next/navigation";

import { adminRequestId, requirePermission } from "@/modules/admin";
import {
  type ContractCommandResult,
  editContractDetails,
  withdrawContract,
} from "@/modules/partners/contracts";

import { PartnerCodeSchema } from "../../view";
import { type ContractForm, contractErrorsParam } from "./view";

function fields(formData: FormData): Record<string, string> {
  const entries: [string, string][] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$") && typeof value === "string") {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function outcome(
  result: ContractCommandResult,
  form: ContractForm,
  input: Record<string, string>,
  saved: "saved" | "withdrawn",
): never {
  const code = PartnerCodeSchema.safeParse(
    result.ok ? result.code : input["code"],
  );
  const tab = code.success
    ? `/admin/partners/${encodeURIComponent(code.data)}/contracts`
    : "/admin/partners";
  const params = new URLSearchParams({
    form,
    result: result.ok ? saved : result.reason,
  });
  const entry = input["contractId"];
  if (entry !== undefined && UUID.test(entry)) params.set("entry", entry);
  if (!result.ok && result.reason === "invalid") {
    params.set("err", contractErrorsParam(result.errors));
  }
  redirect(`${tab}?${params.toString()}`);
}

export async function editContractAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.contract.write");
  const input = fields(formData);
  outcome(
    await editContractDetails(
      { userId: session.userId, requestId: await adminRequestId() },
      input,
    ),
    "edit",
    input,
    "saved",
  );
}

export async function withdrawContractAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("partner.contract.write");
  const input = fields(formData);
  outcome(
    await withdrawContract(
      { userId: session.userId, requestId: await adminRequestId() },
      input,
    ),
    "withdraw",
    input,
    "withdrawn",
  );
}
