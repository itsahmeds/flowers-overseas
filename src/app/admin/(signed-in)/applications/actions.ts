/**
 * @purpose /admin/applications actions, each guarded first (AC-17)
 * @spec 012
 *
 * Thin (`plan/01` §5): `requirePermission("application.manage")` is the first statement (T-02),
 * then one command that moves the application through spec 011's `setFloristApplicationStatus`,
 * then a redirect naming the outcome. A conversion lands on the new florist's page; the URL
 * carries ids and codes, never a name or a reason.
 */
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { adminRequestId, requirePermission } from "@/modules/admin";
import {
  type ApplicationCommandResult,
  convertApplication,
  markApplicationContacted,
  rejectApplication,
} from "@/modules/partners";

/**
 * The form's own fields as strings: Next's `$ACTION_…` keys and any file part are dropped, so the
 * command's own schema reads only what the form typed (a repeated key keeps its last value).
 */
const FormFieldsSchema = z
  .record(z.string(), z.unknown())
  .transform((entries) =>
    Object.fromEntries(
      Object.entries(entries).filter(
        (entry): entry is [string, string] =>
          !entry[0].startsWith("$") && typeof entry[1] === "string",
      ),
    ),
  );

/** The form's own fields, parsed. */
function fields(formData: FormData): Record<string, string> {
  return FormFieldsSchema.parse(Object.fromEntries(formData));
}

function pageOf(id: unknown): string {
  const parsed = z.uuid().safeParse(id);
  return parsed.success
    ? `/admin/applications/${parsed.data}`
    : "/admin/applications";
}

function outcome(
  result: ApplicationCommandResult,
  input: Record<string, string>,
  done: "contacted" | "converted" | "rejected",
): never {
  if (result.ok && done === "converted" && result.partnerCode !== undefined) {
    redirect(
      `/admin/partners/${encodeURIComponent(result.partnerCode)}?result=created`,
    );
  }
  const reason = result.ok ? done : result.reason;
  redirect(`${pageOf(input["applicationId"])}?result=${reason}`);
}

async function actor(userId: string): Promise<{
  readonly userId: string;
  readonly requestId: string;
}> {
  return { userId, requestId: await adminRequestId() };
}

export async function markContactedAction(formData: FormData): Promise<void> {
  const session = await requirePermission("application.manage");
  const input = fields(formData);
  outcome(
    await markApplicationContacted(await actor(session.userId), input),
    input,
    "contacted",
  );
}

export async function convertApplicationAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("application.manage");
  const input = fields(formData);
  outcome(
    await convertApplication(await actor(session.userId), input),
    input,
    "converted",
  );
}

export async function rejectApplicationAction(
  formData: FormData,
): Promise<void> {
  const session = await requirePermission("application.manage");
  const input = fields(formData);
  outcome(
    await rejectApplication(await actor(session.userId), input),
    input,
    "rejected",
  );
}
