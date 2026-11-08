/**
 * @purpose The Contracts tab's outcome codes: forms, results, rule ids and field errors in the query string
 * @spec 030b
 *
 * What the upload route and the contract actions name after a save
 * (`?form=&result=&rule=&entry=&err=`): codes and ids only, never a file name, a note or a reason
 * (no PII in URLs). Parsed leniently: a hand-edited value is dropped.
 */
import { z } from "zod";

import { adminT } from "@/modules/admin";
import {
  type ContractFieldError,
  contractFieldErrors,
} from "@/modules/partners/contracts";

export const CONTRACT_FORMS = ["upload", "edit", "withdraw"] as const;
export type ContractForm = (typeof CONTRACT_FORMS)[number];

export const CONTRACT_OUTCOMES = [
  "uploaded",
  "saved",
  "withdrawn",
  "invalid",
  "rule",
  "conflict",
  "version_conflict",
  "not_found",
  "window_closed",
] as const;

export const CONTRACT_RULES = [
  "too_large",
  "not_pdf",
  "unreadable",
  "no_pages",
  "encrypted",
  "active_content",
] as const;

const FIELD_CODES = [...contractFieldErrors] as const;

const ErrorsSchema = z
  .string()
  .max(400)
  .transform((value) =>
    Object.fromEntries(
      value
        .split(",")
        .map((pair) => pair.split(":"))
        .filter(
          (pair): pair is [string, ContractFieldError] =>
            pair.length === 2 &&
            /^[a-zA-Z]{1,40}$/u.test(pair[0] ?? "") &&
            (FIELD_CODES as readonly string[]).includes(pair[1] ?? ""),
        ),
    ),
  );

export const ContractResultSchema = z.object({
  form: z.enum(CONTRACT_FORMS).optional().catch(undefined),
  result: z.enum(CONTRACT_OUTCOMES).optional().catch(undefined),
  rule: z.enum(CONTRACT_RULES).optional().catch(undefined),
  entry: z.uuid().optional().catch(undefined),
  err: ErrorsSchema.optional().catch(undefined),
});
export type ContractResult = z.infer<typeof ContractResultSchema>;

export function contractErrorsParam(
  errors: Readonly<Record<string, ContractFieldError>>,
): string {
  return Object.entries(errors)
    .map(([field, code]) => `${field}:${code}`)
    .join(",");
}

/** One field's message after a refused save of `form` (and `entry`, for an edit). */
export function contractFieldError(
  result: ContractResult,
  form: ContractForm,
  field: string,
  entry?: string,
): string | undefined {
  if (result.form !== form || result.err === undefined) return undefined;
  if (entry !== undefined && result.entry !== entry) return undefined;
  const code = result.err[field];
  return code === undefined
    ? undefined
    : adminT(`admin.partners.contracts.error.${code}`);
}
