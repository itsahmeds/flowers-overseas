/**
 * @purpose The Relationship tab's CRM actions, each guarded first (030b AC-28, AC-29, AC-30)
 * @spec 030b
 *
 * Thin (`plan/01` §5): `requirePermission("partner.crm.write")` is the first statement of every
 * action (admin and ops; `finance` and `content` are refused and nothing changes), then one CRM
 * command, then a redirect to the tab naming the outcome, the form, the entry it concerned (an id)
 * and, for a refusal, the refused fields as codes. The URL never carries a note, a summary or a
 * name (no PII in URLs).
 */
"use server";

import { redirect } from "next/navigation";

import { adminRequestId, requirePermission } from "@/modules/admin";
import { wallClockToInstant } from "@/modules/i18n";
import {
  addNote,
  type CrmCommandResult,
  deleteNote,
  editContact,
  editNote,
  logContact,
  markFollowUpDone,
  saveContactName,
} from "@/modules/partners/crm";

import { PartnerCodeSchema } from "../../view";
import { type CrmForm, crmErrorsParam } from "./view";

function fields(formData: FormData): Record<string, string> {
  const entries: [string, string][] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$") && typeof value === "string") {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

function tabOf(code: unknown): string {
  const parsed = PartnerCodeSchema.safeParse(code);
  return parsed.success
    ? `/admin/partners/${encodeURIComponent(parsed.data)}/relationship`
    : "/admin/partners";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function outcome(
  result: CrmCommandResult,
  form: CrmForm,
  input: Record<string, string>,
  entry?: string,
): never {
  const params = new URLSearchParams({
    result: result.ok ? "saved" : result.reason,
    form,
  });
  if (entry !== undefined && UUID.test(entry)) params.set("entry", entry);
  if (!result.ok && result.reason === "invalid") {
    params.set("err", crmErrorsParam(result.errors));
  }
  redirect(
    `${tabOf(result.ok ? result.code : input["code"])}?${params.toString()}`,
  );
}

async function actor(userId: string) {
  return { userId, requestId: await adminRequestId() };
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  outcome(await addNote(await actor(session.userId), input), "note", input);
}

export async function editNoteAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  outcome(
    await editNote(await actor(session.userId), input),
    "noteEdit",
    input,
    input["noteId"],
  );
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  outcome(
    await deleteNote(await actor(session.userId), input),
    "noteDelete",
    input,
  );
}

export async function logContactAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  const zone = session.timeZone;
  outcome(
    await logContact(
      await actor(session.userId),
      input,
      new Date(),
      (wall) => wallClockToInstant(wall, zone) ?? undefined,
    ),
    "contact",
    input,
  );
}

export async function editContactAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  const zone = session.timeZone;
  outcome(
    await editContact(
      await actor(session.userId),
      input,
      new Date(),
      (wall) => wallClockToInstant(wall, zone) ?? undefined,
    ),
    "contactEdit",
    input,
    input["entryId"],
  );
}

export async function markFollowUpDoneAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  outcome(
    await markFollowUpDone(await actor(session.userId), input),
    "followUp",
    input,
  );
}

export async function saveContactNameAction(formData: FormData): Promise<void> {
  const session = await requirePermission("partner.crm.write");
  const input = fields(formData);
  outcome(
    await saveContactName(await actor(session.userId), input),
    "contactName",
    input,
  );
}
