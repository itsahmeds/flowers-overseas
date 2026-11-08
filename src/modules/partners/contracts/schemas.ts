/**
 * The contract inputs (spec 030b §14.4 "schemas"; AC-37, AC-38, AC-41; TASK-442):
 * `ContractUploadSchema`, `ContractDetailsEditSchema` and `ContractWithdrawSchema`.
 *
 * Each parse returns the value or one refusal code per field, so the tab names the field and the
 * URL carries codes only. The signed date may not be after today in the florist's country zone;
 * a review date must be after the effective date; a note holding an email address or a phone
 * number is refused (`CRM_TEXT_HAS_CONTACT_DETAILS`). Pure: "today" is a parameter.
 */
import { z } from "zod";

import { CONTRACTS_CONFIG, type ContractDocKind } from "@/config/contracts";

import { textHasContactDetails } from "../crm/text";

export const contractFieldErrors = [
  "required",
  "choice",
  "template",
  "language",
  "date",
  "dateFuture",
  "reviewOrder",
  "notice",
  "tooLong",
  "contactDetails",
  "reasonLength",
  "target",
] as const;
export type ContractFieldError = (typeof contractFieldErrors)[number];
export type ContractFieldErrors = Readonly<Record<string, ContractFieldError>>;

export type ContractParsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: ContractFieldErrors };

/** `template_version`'s alphabet (`partner_contract_template_version_check`). */
const TEMPLATE = /^[a-z0-9][a-z0-9.-]{0,39}$/u;
const LANGUAGE = /^[a-z]{2}(?:-[a-z]{2})?$/u;
const IsoDate = z.iso.date();
const Version = z.iso.datetime({ offset: true });

export const NOTE_MAX = 500;
export const REASON_MIN = 10;
export const REASON_MAX = 500;

function fieldsOf(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function checked(value: unknown): boolean {
  return value === true || value === "on" || value === "true" || value === "1";
}

/** The editable details: template, language, dates, notice, the Art. 28 flag and the note. */
export interface ContractDetails {
  readonly templateVersion: string;
  readonly languageCode: string;
  readonly includesDpa: boolean;
  readonly signedOn: string;
  readonly effectiveOn: string;
  readonly reviewOn: string | null;
  readonly noticeDays: number;
  readonly note: string | null;
}

export interface ContractUpload extends ContractDetails {
  readonly docKind: ContractDocKind;
  /** The current row of the kind the page showed, or `null` when it showed none. */
  readonly expectedCurrentId: string | null;
}

export interface ContractDetailsEdit extends ContractDetails {
  readonly contractId: string;
  readonly updatedAt: string;
}

function parseDetails(
  fields: Record<string, unknown>,
  today: string,
  errors: Record<string, ContractFieldError>,
  docKind: ContractDocKind | undefined,
): ContractDetails | undefined {
  const templateVersion = text(fields["templateVersion"])?.toLowerCase();
  if (templateVersion === undefined) errors["templateVersion"] = "required";
  else if (!TEMPLATE.test(templateVersion))
    errors["templateVersion"] = "template";

  const languageCode = text(fields["languageCode"])?.toLowerCase();
  if (languageCode === undefined || !LANGUAGE.test(languageCode)) {
    errors["languageCode"] = "language";
  }

  const signedOn = text(fields["signedOn"]);
  if (signedOn === undefined || !IsoDate.safeParse(signedOn).success) {
    errors["signedOn"] = "date";
  } else if (signedOn > today) errors["signedOn"] = "dateFuture";

  const effectiveOn = text(fields["effectiveOn"]);
  if (effectiveOn === undefined || !IsoDate.safeParse(effectiveOn).success) {
    errors["effectiveOn"] = "date";
  }

  const reviewText = text(fields["reviewOn"]);
  let reviewOn: string | null = null;
  if (reviewText !== undefined) {
    if (!IsoDate.safeParse(reviewText).success) errors["reviewOn"] = "date";
    else if (effectiveOn !== undefined && reviewText <= effectiveOn) {
      errors["reviewOn"] = "reviewOrder";
    } else reviewOn = reviewText;
  }

  const noticeText = text(fields["noticeDays"]);
  const noticeDays =
    noticeText === undefined
      ? CONTRACTS_CONFIG.defaultNoticeDays
      : /^\d{1,3}$/u.test(noticeText)
        ? Number(noticeText)
        : Number.NaN;
  if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) {
    errors["noticeDays"] = "notice";
  }

  const noteText = text(fields["note"]);
  if (noteText !== undefined) {
    if ([...noteText].length > NOTE_MAX) errors["note"] = "tooLong";
    else if (textHasContactDetails(noteText)) errors["note"] = "contactDetails";
  }

  if (Object.keys(errors).length > 0) return undefined;
  return {
    templateVersion: templateVersion ?? "",
    languageCode: languageCode ?? "",
    // The Art. 28 clauses can be inside an agreement only (`partner_contract_includes_dpa_check`).
    includesDpa:
      docKind === undefined || docKind === "agreement"
        ? checked(fields["includesDpa"])
        : false,
    signedOn: signedOn ?? "",
    effectiveOn: effectiveOn ?? "",
    reviewOn,
    noticeDays,
    note: noteText ?? null,
  };
}

/**
 * `ContractUploadSchema { docKind, templateVersion, languageCode, includesDpa, signedOn: not after
 * today in the partner's zone, effectiveOn, reviewOn?: after effectiveOn, noticeDays: 0..365,
 * note?: trimmed 1..500, expectedCurrentId: uuid | null }`.
 */
export function parseContractUpload(
  input: unknown,
  today: string,
): ContractParsed<ContractUpload> {
  const fields = fieldsOf(input);
  const errors: Record<string, ContractFieldError> = {};
  const kind = z.enum(CONTRACTS_CONFIG.docKinds).safeParse(fields["docKind"]);
  if (!kind.success) errors["docKind"] = "choice";
  const expectedText = text(fields["expectedCurrentId"]);
  const expected =
    expectedText === undefined ? null : z.uuid().safeParse(expectedText);
  if (expected !== null && !expected.success) {
    errors["expectedCurrentId"] = "target";
  }
  const details = parseDetails(
    fields,
    today,
    errors,
    kind.success ? kind.data : undefined,
  );
  if (details === undefined || !kind.success) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...details,
      docKind: kind.data,
      expectedCurrentId: expected?.success === true ? expected.data : null,
    },
  };
}

/** `ContractDetailsEditSchema`: the editable fields plus `contractId` and `updatedAt`. */
export function parseContractDetailsEdit(
  input: unknown,
  today: string,
  docKind: ContractDocKind,
): ContractParsed<ContractDetailsEdit> {
  const fields = fieldsOf(input);
  const errors: Record<string, ContractFieldError> = {};
  const contractId = z.uuid().safeParse(fields["contractId"]);
  const updatedAt = Version.safeParse(fields["updatedAt"]);
  if (!contractId.success || !updatedAt.success)
    errors["contractId"] = "target";
  const details = parseDetails(fields, today, errors, docKind);
  if (details === undefined || !contractId.success || !updatedAt.success) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      ...details,
      contractId: contractId.data,
      updatedAt: updatedAt.data,
    },
  };
}

/** The contract an edit or a withdrawal names, before the kind is known. */
export const ContractTargetSchema = z.object({ contractId: z.uuid() }).loose();

/** `ContractWithdrawSchema { contractId, reason: trimmed 10..500, updatedAt }`. */
export function parseContractWithdraw(input: unknown): ContractParsed<{
  readonly contractId: string;
  readonly reason: string;
  readonly updatedAt: string;
}> {
  const fields = fieldsOf(input);
  const errors: Record<string, ContractFieldError> = {};
  const contractId = z.uuid().safeParse(fields["contractId"]);
  const updatedAt = Version.safeParse(fields["updatedAt"]);
  if (!contractId.success || !updatedAt.success)
    errors["contractId"] = "target";
  const reason = text(fields["reason"]);
  const length = reason === undefined ? 0 : [...reason].length;
  if (length < REASON_MIN || length > REASON_MAX)
    errors["reason"] = "reasonLength";
  if (
    !contractId.success ||
    !updatedAt.success ||
    reason === undefined ||
    "reason" in errors
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { contractId: contractId.data, reason, updatedAt: updatedAt.data },
  };
}
