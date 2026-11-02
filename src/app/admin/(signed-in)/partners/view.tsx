/**
 * @purpose The florist pages' shared view pieces: chips, outcomes, field errors
 * @spec 012
 *
 * The status chip tones of the artboards (`admin-partners-*`: demo dashed, onboarding sage,
 * active leaf, paused butter, offboarded paper), the outcome a server action names in the query
 * string and its message, and the field errors it carries as codes. The query string holds codes
 * only, never a value a person typed (no PII in URLs).
 */
import type { ReactElement } from "react";
import { z } from "zod";

import { adminT } from "@/modules/admin";
import {
  type PartnerFieldError,
  type PartnerStatus,
  partnerFieldErrors,
} from "@/modules/partners";
import { AdminRefusal, AdminToast } from "@/modules/ui/admin/AdminControls";
import { AdminChip, type AdminChipTone } from "@/modules/ui/admin/AdminData";

export const PARTNER_TONE: Readonly<Record<PartnerStatus, AdminChipTone>> = {
  demo: "demo",
  onboarding: "sky",
  active: "ok",
  paused: "warn",
  offboarded: "plain",
};

export function PartnerStatusChip({
  status,
}: {
  readonly status: PartnerStatus;
}): ReactElement {
  return (
    <AdminChip tone={PARTNER_TONE[status]}>
      {adminT(`admin.partners.status.${status}`)}
    </AdminChip>
  );
}

/** A florist code as the URL carries it (`fulfillment_partner_code_check`). */
export const PartnerCodeSchema = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

/** The outcomes an action names (`?result=`). */
export const PARTNER_OUTCOMES = [
  "saved",
  "created",
  "status",
  "conflict",
  "invalid",
  "code_taken",
  "duplicate",
  "country_has_zones",
  "currency_has_mappings",
  "currency_mismatch",
  "outside_country",
  "illegal_edge",
  "preflight",
  "not_found",
] as const;
export type PartnerOutcome = (typeof PARTNER_OUTCOMES)[number];

/** The forms of the florist page; an outcome names the one it came from (`?form=`). */
export const PARTNER_FORMS = [
  "profile",
  "terms",
  "zones",
  "daysOff",
  "products",
  "status",
] as const;
export type PartnerForm = (typeof PARTNER_FORMS)[number];

const FieldErrorsSchema = z
  .string()
  .max(400)
  .transform((value) =>
    Object.fromEntries(
      value
        .split(",")
        .map((pair) => pair.split(":"))
        .filter(
          (pair): pair is [string, PartnerFieldError] =>
            pair.length === 2 &&
            /^[a-zA-Z]{1,40}$/u.test(pair[0] ?? "") &&
            (partnerFieldErrors as readonly string[]).includes(pair[1] ?? ""),
        ),
    ),
  );

/** What the query string says about the last save. */
export const PartnerResultSchema = z.object({
  result: z.enum(PARTNER_OUTCOMES).optional().catch(undefined),
  form: z.enum(PARTNER_FORMS).optional().catch(undefined),
  to: z.enum(["active", "paused", "offboarded"]).optional().catch(undefined),
  err: FieldErrorsSchema.optional().catch(undefined),
});
export type PartnerResult = z.infer<typeof PartnerResultSchema>;

/** The field errors as the query string carries them: `field:code,field:code`. */
export function errorsParam(
  errors: Readonly<Record<string, PartnerFieldError>>,
): string {
  return Object.entries(errors)
    .map(([field, code]) => `${field}:${code}`)
    .join(",");
}

/** The message of one field's error, or `undefined`. */
export function fieldError(
  result: PartnerResult,
  form: PartnerForm,
  field: string,
): string | undefined {
  if (result.form !== form || result.err === undefined) return undefined;
  const code = result.err[field];
  return code === undefined
    ? undefined
    : adminT(`admin.partners.error.${code}`);
}

/** The toast or the refusal of the last save, shown above the form it came from. */
export function PartnerMessage({
  result,
  form,
}: {
  readonly result: PartnerResult;
  readonly form: PartnerForm | "page";
}): ReactElement | null {
  const outcome = result.result;
  if (outcome === undefined) return null;
  const at: PartnerForm | "page" = result.form ?? "page";
  if (at !== form) return null;
  if (outcome === "saved") {
    return <AdminToast>{adminT("admin.partners.result.saved")}</AdminToast>;
  }
  if (outcome === "created") {
    return <AdminToast>{adminT("admin.partners.result.created")}</AdminToast>;
  }
  if (outcome === "status") {
    return (
      <AdminToast>
        {adminT("admin.partners.result.status", {
          status: result.to ?? "other",
        })}
      </AdminToast>
    );
  }
  return (
    <AdminRefusal>{adminT(`admin.partners.result.${outcome}`)}</AdminRefusal>
  );
}
