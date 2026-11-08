/**
 * @purpose The Relationship tab's outcome codes: forms, results and field errors in the query string
 * @spec 030b
 *
 * What a CRM action names after a save (`?result=&form=&entry=&err=`): codes and ids only, never
 * the text a person typed (no PII in URLs). Parsed leniently: a hand-edited value is dropped.
 */
import { z } from "zod";

import { adminT } from "@/modules/admin";
import { type CrmFieldError, crmFieldErrors } from "@/modules/partners/crm";

export const CRM_FORMS = [
  "note",
  "noteEdit",
  "noteDelete",
  "contact",
  "contactEdit",
  "followUp",
  "contactName",
] as const;
export type CrmForm = (typeof CRM_FORMS)[number];

export const CRM_OUTCOMES = [
  "saved",
  "invalid",
  "conflict",
  "not_found",
  "no_follow_up",
] as const;

const ErrorsSchema = z
  .string()
  .max(400)
  .transform((value) =>
    Object.fromEntries(
      value
        .split(",")
        .map((pair) => pair.split(":"))
        .filter(
          (pair): pair is [string, CrmFieldError] =>
            pair.length === 2 &&
            /^[a-zA-Z]{1,40}$/u.test(pair[0] ?? "") &&
            (crmFieldErrors as readonly string[]).includes(pair[1] ?? ""),
        ),
    ),
  );

export const CrmResultSchema = z.object({
  result: z.enum(CRM_OUTCOMES).optional().catch(undefined),
  form: z.enum(CRM_FORMS).optional().catch(undefined),
  entry: z.uuid().optional().catch(undefined),
  err: ErrorsSchema.optional().catch(undefined),
});
export type CrmResult = z.infer<typeof CrmResultSchema>;

/** The refusal per field as the query string carries it: `field:code,field:code`. */
export function crmErrorsParam(
  errors: Readonly<Record<string, CrmFieldError>>,
): string {
  return Object.entries(errors)
    .map(([field, code]) => `${field}:${code}`)
    .join(",");
}

/** Whether the last save came from `form` (and, for an edit, from `entry`). */
export function cameFrom(
  result: CrmResult,
  form: CrmForm,
  entry?: string,
): boolean {
  return (
    result.result !== undefined &&
    result.form === form &&
    (entry === undefined || result.entry === entry)
  );
}

/** One field's message after a refused save of `form`, or `undefined`. */
export function crmFieldError(
  result: CrmResult,
  form: CrmForm,
  field: string,
  entry?: string,
): string | undefined {
  if (!cameFrom(result, form, entry) || result.err === undefined) {
    return undefined;
  }
  const code = result.err[field];
  if (code === undefined) return undefined;
  if (field === "contactName" && code === "contactDetails") {
    return adminT("admin.partners.crm.error.contactNameDetails");
  }
  return adminT(`admin.partners.crm.error.${code}`);
}
