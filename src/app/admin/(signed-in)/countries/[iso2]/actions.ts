/**
 * @purpose POST /admin/countries/[iso2]: the go-live flip, back to demo, and the two go-live fiscal fields
 * @spec 012b
 *
 * Thin (`plan/01` §5): `requirePermission("country.status")` is each action's first statement,
 * then the command (`setCountryStatus`, `setGoLiveFiscalFields`, spec 012b §2.8, AC-25, §14
 * A-orchestrator-2026-10-20a; TASK-300), then a redirect that names the outcome. A refusal writes
 * nothing. The query carries outcome codes, field names and public paths only; the typed code and
 * the reason never travel back.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adminRequestId,
  defaultCountryStatusDeps,
  defaultFiscalFieldsDeps,
  requirePermission,
  setCountryStatus,
  setGoLiveFiscalFields,
} from "@/modules/admin";

const Iso2Schema = z.string().regex(/^[A-Z]{2}$/u);

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function pageOf(iso2: string | undefined): string {
  const code = Iso2Schema.safeParse(iso2);
  return code.success ? `/admin/countries/${code.data}` : "/admin/countries";
}

export async function flipCountryStatusAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("country.status");
  const actor = {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
  const iso2 = text(formData, "iso2");
  const confirmCode = text(formData, "confirmCode");
  const result = await setCountryStatus(
    actor,
    {
      iso2,
      from: text(formData, "from"),
      to: text(formData, "to"),
      ...(confirmCode === undefined ? {} : { confirmCode }),
    },
    await defaultCountryStatusDeps(actor),
  );
  const params = new URLSearchParams();
  if (result.ok) {
    params.set("result", result.status);
    if (result.publish.kind !== "notNeeded") {
      params.set("publish", result.publish.kind);
    }
    if (result.publish.kind === "notStarted") {
      params.set("code", result.publish.code);
    }
  } else {
    params.set("result", result.reason);
    for (const reason of result.reasons ?? []) params.append("reason", reason);
  }
  redirect(`${pageOf(iso2)}?${params.toString()}`);
}

/** The VAT input's text as the schema reads it: absent when empty, else the number it spells. */
function vatOf(value: string | undefined): number | string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value.trim());
  return Number.isNaN(number) ? value : number;
}

export async function saveFiscalFieldsAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("country.status");
  const actor = {
    userId: session.userId,
    requestId: await adminRequestId(),
    roles: session.roles,
  };
  const iso2 = text(formData, "iso2");
  const vatRateBp = vatOf(text(formData, "vatRateBp"));
  const supplyModel = text(formData, "supplyModel");
  const result = await setGoLiveFiscalFields(
    actor,
    {
      iso2,
      ...(vatRateBp === undefined ? {} : { vatRateBp }),
      ...(supplyModel === undefined || supplyModel === ""
        ? {}
        : { supplyModel }),
      reason: text(formData, "reason") ?? "",
    },
    await defaultFiscalFieldsDeps(),
  );
  const params = new URLSearchParams({
    fiscal: result.ok ? "saved" : result.reason,
  });
  if (!result.ok && "fields" in result) {
    for (const field of result.fields) params.append("field", field);
  }
  redirect(`${pageOf(iso2)}?${params.toString()}`);
}
