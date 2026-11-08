/**
 * The CRM's input schemas (spec 030b §5.2 "Schemas"; AC-28, AC-29, AC-30; TASK-441).
 *
 * `PartnerNoteCreateSchema`, `PartnerNoteEditSchema`, `PartnerNoteDeleteSchema`,
 * `ContactLogCreateSchema`, `ContactLogEditSchema`, `FollowUpDoneSchema` and
 * `ContactNameEditSchema`. Each parse returns the value or one refusal code per field, so the page
 * names the field and keeps the text in it (the URL carries codes only, never the text). A note,
 * a summary and a contact person holding an email address or a phone number are refused with
 * `contactDetails` (`CRM_TEXT_HAS_CONTACT_DETAILS`). Pure: the clock is a parameter.
 */
import { z } from "zod";

import {
  contactLogChannels,
  contactLogDirections,
  contactLogTopics,
} from "../../../../db/schema/partners";
import { textHasContactDetails } from "./text";

/** The refusal codes a CRM field can carry back. */
export const crmFieldErrors = [
  "required",
  "tooShort",
  "tooLong",
  "contactDetails",
  "choice",
  "date",
  "future",
  "target",
] as const;
export type CrmFieldError = (typeof crmFieldErrors)[number];
export type CrmFieldErrors = Readonly<Record<string, CrmFieldError>>;

export type CrmParsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: CrmFieldErrors };

export const NOTE_MAX = 2000;
export const SUMMARY_MAX = 1000;
export const CONTACT_NAME_MIN = 2;
export const CONTACT_NAME_MAX = 120;
/** How far ahead of now a contact may be dated (clock skew between the browser and us). */
export const OCCURRED_AT_MAX_AHEAD_MS = 5 * 60 * 1000;

export type ContactChannel = (typeof contactLogChannels)[number];
export type ContactDirection = (typeof contactLogDirections)[number];
export type ContactTopic = (typeof contactLogTopics)[number];

const Version = z.iso.datetime({ offset: true });
const IsoDate = z.iso.date();

/** Turns a `datetime-local` value in the viewer's zone into an instant; `undefined` when invalid. */
export type WallClockReader = (wallClock: string) => Date | undefined;

function fieldsOf(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : {};
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** A form checkbox: present and not `"false"`/`"0"`. */
function checked(value: unknown): boolean {
  return value === true || value === "on" || value === "true" || value === "1";
}

/** One free-text field: trimmed, 1..max, no contact details. */
function freeText(
  value: unknown,
  max: number,
): { text: string } | { error: CrmFieldError } {
  const trimmed = stringOf(value)?.trim() ?? "";
  if (trimmed === "") return { error: "required" };
  if ([...trimmed].length > max) return { error: "tooLong" };
  if (textHasContactDetails(trimmed)) return { error: "contactDetails" };
  return { text: trimmed };
}

/* -------------------------------------------------------------------------- */
/* notes                                                                      */
/* -------------------------------------------------------------------------- */

export interface NoteCreate {
  readonly partnerId: string;
  readonly body: string;
  readonly pinned: boolean;
}

export interface NoteEdit {
  readonly noteId: string;
  readonly body: string;
  readonly pinned: boolean;
  readonly updatedAt: string;
}

export interface NoteDelete {
  readonly noteId: string;
  readonly updatedAt: string;
}

/** `PartnerNoteCreateSchema { partnerId, body: trimmed 1..2000, pinned }`. */
export function parseNoteCreate(input: unknown): CrmParsed<NoteCreate> {
  const fields = fieldsOf(input);
  const errors: Record<string, CrmFieldError> = {};
  const partnerId = z.uuid().safeParse(fields["partnerId"]);
  if (!partnerId.success) errors["partnerId"] = "target";
  const body = freeText(fields["body"], NOTE_MAX);
  if ("error" in body) errors["body"] = body.error;
  if (!partnerId.success || "error" in body) return { ok: false, errors };
  return {
    ok: true,
    value: {
      partnerId: partnerId.data,
      body: body.text,
      pinned: checked(fields["pinned"]),
    },
  };
}

/** `PartnerNoteEditSchema { noteId, body, pinned, updatedAt }`. */
export function parseNoteEdit(input: unknown): CrmParsed<NoteEdit> {
  const fields = fieldsOf(input);
  const errors: Record<string, CrmFieldError> = {};
  const noteId = z.uuid().safeParse(fields["noteId"]);
  const updatedAt = Version.safeParse(fields["updatedAt"]);
  if (!noteId.success || !updatedAt.success) errors["noteId"] = "target";
  const body = freeText(fields["body"], NOTE_MAX);
  if ("error" in body) errors["body"] = body.error;
  if (!noteId.success || !updatedAt.success || "error" in body) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      noteId: noteId.data,
      body: body.text,
      pinned: checked(fields["pinned"]),
      updatedAt: updatedAt.data,
    },
  };
}

/** `PartnerNoteDeleteSchema { noteId, updatedAt }`. */
export const PartnerNoteDeleteSchema = z
  .object({ noteId: z.uuid(), updatedAt: Version })
  .strip();

/* -------------------------------------------------------------------------- */
/* contact log                                                                */
/* -------------------------------------------------------------------------- */

export interface ContactCreate {
  readonly partnerId: string;
  readonly occurredAt: Date;
  readonly channel: ContactChannel;
  readonly direction: ContactDirection;
  readonly topic: ContactTopic;
  readonly summary: string;
  readonly followUpOn: string | null;
}

export interface ContactEdit extends Omit<ContactCreate, "partnerId"> {
  readonly entryId: string;
  readonly updatedAt: string;
}

/**
 * The contact fields shared by create and edit. `occurredAt` is an ISO instant, or the
 * `datetime-local` value the dialog sends with the viewer's zone (`toInstant` turns it into one).
 */
function parseContactFields(
  fields: Record<string, unknown>,
  now: Date,
  toInstant: (wallClock: string) => Date | undefined,
  errors: Record<string, CrmFieldError>,
): Omit<ContactCreate, "partnerId"> | undefined {
  const typed = stringOf(fields["occurredAt"])?.trim() ?? "";
  let occurredAt: Date | undefined;
  if (typed === "") errors["occurredAt"] = "required";
  else {
    occurredAt = z.iso.datetime({ offset: true }).safeParse(typed).success
      ? new Date(typed)
      : toInstant(typed);
    if (occurredAt === undefined || Number.isNaN(occurredAt.getTime())) {
      errors["occurredAt"] = "date";
      occurredAt = undefined;
    } else if (
      occurredAt.getTime() >
      now.getTime() + OCCURRED_AT_MAX_AHEAD_MS
    ) {
      errors["occurredAt"] = "future";
      occurredAt = undefined;
    }
  }
  const channel = z.enum(contactLogChannels).safeParse(fields["channel"]);
  if (!channel.success) errors["channel"] = "choice";
  const direction = z.enum(contactLogDirections).safeParse(fields["direction"]);
  if (!direction.success) errors["direction"] = "choice";
  const topic = z.enum(contactLogTopics).safeParse(fields["topic"]);
  if (!topic.success) errors["topic"] = "choice";
  const summary = freeText(fields["summary"], SUMMARY_MAX);
  if ("error" in summary) errors["summary"] = summary.error;
  const typedFollowUp = stringOf(fields["followUpOn"])?.trim() ?? "";
  const followUp =
    typedFollowUp === "" ? undefined : IsoDate.safeParse(typedFollowUp);
  if (followUp !== undefined && !followUp.success)
    errors["followUpOn"] = "date";
  if (
    occurredAt === undefined ||
    !channel.success ||
    !direction.success ||
    !topic.success ||
    "error" in summary ||
    (followUp !== undefined && !followUp.success)
  ) {
    return undefined;
  }
  return {
    occurredAt,
    channel: channel.data,
    direction: direction.data,
    topic: topic.data,
    summary: summary.text,
    followUpOn: followUp?.success === true ? followUp.data : null,
  };
}

/**
 * `ContactLogCreateSchema { partnerId, occurredAt: not more than 5 minutes ahead of now, channel,
 * direction, topic, summary: trimmed 1..1000, followUpOn?: iso date }`.
 */
export function parseContactCreate(
  input: unknown,
  now: Date,
  toInstant: (wallClock: string) => Date | undefined = () => undefined,
): CrmParsed<ContactCreate> {
  const fields = fieldsOf(input);
  const errors: Record<string, CrmFieldError> = {};
  const partnerId = z.uuid().safeParse(fields["partnerId"]);
  if (!partnerId.success) errors["partnerId"] = "target";
  const contact = parseContactFields(fields, now, toInstant, errors);
  if (!partnerId.success || contact === undefined) return { ok: false, errors };
  return { ok: true, value: { partnerId: partnerId.data, ...contact } };
}

/** `ContactLogEditSchema`: the create fields plus `entryId` and `updatedAt`. */
export function parseContactEdit(
  input: unknown,
  now: Date,
  toInstant: (wallClock: string) => Date | undefined = () => undefined,
): CrmParsed<ContactEdit> {
  const fields = fieldsOf(input);
  const errors: Record<string, CrmFieldError> = {};
  const entryId = z.uuid().safeParse(fields["entryId"]);
  const updatedAt = Version.safeParse(fields["updatedAt"]);
  if (!entryId.success || !updatedAt.success) errors["entryId"] = "target";
  const contact = parseContactFields(fields, now, toInstant, errors);
  if (!entryId.success || !updatedAt.success || contact === undefined) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { entryId: entryId.data, updatedAt: updatedAt.data, ...contact },
  };
}

/** `FollowUpDoneSchema { entryId }`. */
export const FollowUpDoneSchema = z.object({ entryId: z.uuid() }).strip();

/* -------------------------------------------------------------------------- */
/* contact person                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The contact person (`fulfillment_partner.contact_name`, spec 012's `PartnerEditSchema` gains
 * `contactName`): empty clears it; otherwise 2 to 120 characters and no contact details.
 */
export function parseContactName(
  value: unknown,
):
  | { readonly name: string | null }
  | { readonly error: "tooShort" | "tooLong" | "contactDetails" } {
  const trimmed = stringOf(value)?.trim() ?? "";
  if (trimmed === "") return { name: null };
  const length = [...trimmed].length;
  if (length < CONTACT_NAME_MIN) return { error: "tooShort" };
  if (length > CONTACT_NAME_MAX) return { error: "tooLong" };
  if (textHasContactDetails(trimmed)) return { error: "contactDetails" };
  return { name: trimmed };
}

export interface ContactNameEdit {
  readonly partnerId: string;
  readonly updatedAt: string;
  readonly contactName: string | null;
}

/** `ContactNameEditSchema { partnerId, updatedAt, contactName }` (the Relationship tab's form). */
export function parseContactNameEdit(
  input: unknown,
): CrmParsed<ContactNameEdit> {
  const fields = fieldsOf(input);
  const errors: Record<string, CrmFieldError> = {};
  const partnerId = z.uuid().safeParse(fields["partnerId"]);
  const updatedAt = Version.safeParse(fields["updatedAt"]);
  if (!partnerId.success || !updatedAt.success) errors["partnerId"] = "target";
  const name = parseContactName(fields["contactName"]);
  if ("error" in name) errors["contactName"] = name.error;
  if (!partnerId.success || !updatedAt.success || "error" in name) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      partnerId: partnerId.data,
      updatedAt: updatedAt.data,
      contactName: name.name,
    },
  };
}
