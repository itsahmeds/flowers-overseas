/**
 * @purpose GET /admin/partners/[code]/relationship: contact person, standing, notes, contact log, follow-ups
 * @spec 030b
 *
 * Spec 030b §2.6 "Relationship", §2.7, §5.3 (artboards `admin-partner-relationship-*`; AC-1, AC-2,
 * AC-27 to AC-30, AC-34; TASK-441). `partner.crm.view` opens it (admin and ops; `finance` and
 * `content` get 403 and no tab); every control needs `partner.crm.write`, and without it the tab
 * is read only. No money figure is read or shown here (AC-2). Opening the tab writes one
 * `partner_crm.viewed` audit row (AC-27). Notes pinned first, then newest; the contact log newest
 * first, an open follow-up "Due today" or "Overdue since" in the viewer's zone, with "Mark
 * follow-up done". The dialogs are the page's only client islands (native modal `<dialog>`: focus
 * trapped and returned). Each text field carries the minimisation hint; a text with an email
 * address or a phone number is refused and the dialog reopens with the reason.
 */
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { isLocaleCode, localeConfig } from "@/config/locales";
import {
  adminRequestId,
  adminT,
  can,
  logAdminRead,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import {
  formatDate,
  formatPercentBp,
  formatRatingBp,
  instantToWallClock,
} from "@/modules/i18n";
import { partnerHead } from "@/modules/partners";
import {
  CONTACT_NAME_MAX,
  type CrmContactEntry,
  type CrmNote,
  NOTE_MAX,
  partnerRelationship,
  SUMMARY_MAX,
} from "@/modules/partners/crm";
import {
  AdminActionDialog,
  AdminDialogClose,
} from "@/modules/ui/admin/AdminActionDialog";
import {
  AdminButton,
  AdminRefusal,
  AdminToast,
} from "@/modules/ui/admin/AdminControls";
import {
  AdminChip,
  AdminField,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import {
  AdminCard,
  AdminKeyValues,
  AdminQuiet,
  AdminRecordColumns,
  AdminSection,
} from "@/modules/ui/admin/AdminRecord";

import { AdminFrame } from "../../../frame";
import { PartnerStatusChip } from "../../view";
import { PartnerTabHead } from "../tabs";
import {
  addNoteAction,
  deleteNoteAction,
  editContactAction,
  editNoteAction,
  logContactAction,
  markFollowUpDoneAction,
  saveContactNameAction,
} from "./actions";
import {
  cameFrom,
  type CrmForm,
  type CrmResult,
  CrmResultSchema,
  crmFieldError,
} from "./view";

const CHANNELS = [
  "phone",
  "email",
  "whatsapp",
  "video",
  "in_person",
  "other",
] as const;
const DIRECTIONS = ["inbound", "outbound"] as const;
const TOPICS = [
  "onboarding",
  "order_issue",
  "payout",
  "pricing",
  "quality",
  "other",
] as const;

/** A calendar day (`YYYY-MM-DD`) as "2 Oct 2026"; noon UTC is that day everywhere. */
function calendarDay(iso: string, withYear = true): string {
  return formatDate(
    new Date(`${iso}T12:00:00Z`),
    "en",
    withYear ? "dayMonthYear" : "dayMonth",
    "UTC",
  );
}

/** The outcome of the last save of `form`, as a toast or a refusal. */
function Outcome({
  result,
  form,
  entry,
}: {
  readonly result: CrmResult;
  readonly form: CrmForm;
  readonly entry?: string | undefined;
}): ReactElement | null {
  if (!cameFrom(result, form, entry) || result.result === undefined) {
    return null;
  }
  if (result.result === "saved") {
    return (
      <AdminToast>
        {adminT(`admin.partners.crm.result.saved.${form}`)}
      </AdminToast>
    );
  }
  return (
    <AdminRefusal>
      {adminT(`admin.partners.crm.result.${result.result}`)}
    </AdminRefusal>
  );
}

function Hidden({
  values,
}: {
  readonly values: Readonly<Record<string, string>>;
}): ReactElement {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function TextArea({
  id,
  name,
  label,
  max,
  value,
  error,
  hint,
  rows = 4,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly max: number;
  readonly value?: string | undefined;
  readonly error: string | undefined;
  readonly hint: string;
  readonly rows?: number;
}): ReactElement {
  return (
    <AdminField id={id} label={label} hint={hint} error={error} full>
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={max}
        required
        defaultValue={value}
        className={`${adminControlClass(error !== undefined)} min-h-[96px] py-[8px]`}
        {...adminFieldAria(id, hint, error)}
      />
    </AdminField>
  );
}

function Choice({
  id,
  name,
  label,
  options,
  value,
  error,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly value?: string | undefined;
  readonly error: string | undefined;
}): ReactElement {
  return (
    <AdminField id={id} label={label} error={error}>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className={adminControlClass(error !== undefined)}
        {...adminFieldAria(id, undefined, error)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </AdminField>
  );
}

function Input({
  id,
  name,
  label,
  type = "text",
  value,
  error,
  hint,
  required = false,
  maxLength,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type?: string;
  readonly value?: string | undefined;
  readonly error: string | undefined;
  readonly hint?: string;
  readonly required?: boolean;
  readonly maxLength?: number;
}): ReactElement {
  return (
    <AdminField id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        {...(maxLength === undefined ? {} : { maxLength })}
        className={adminControlClass(error !== undefined)}
        {...adminFieldAria(id, hint, error)}
      />
    </AdminField>
  );
}

function DialogActions({ submit }: { readonly submit: string }): ReactElement {
  return (
    <div className="col-span-full flex flex-wrap justify-end gap-[8px]">
      <AdminDialogClose label={adminT("admin.partners.crm.cancel")} />
      <AdminButton>{submit}</AdminButton>
    </div>
  );
}

const FORM_GRID = "grid gap-[12px] md:grid-cols-2";

function NoteFields({
  form,
  entry,
  result,
  note,
}: {
  readonly form: "note" | "noteEdit";
  readonly entry?: string | undefined;
  readonly result: CrmResult;
  readonly note?: CrmNote;
}): ReactElement {
  const id = entry === undefined ? "crm-note" : `crm-note-${entry}`;
  return (
    <>
      <TextArea
        id={`${id}-body`}
        name="body"
        label={adminT("admin.partners.crm.note.field")}
        max={NOTE_MAX}
        value={note?.body}
        error={crmFieldError(result, form, "body", entry)}
        hint={adminT("admin.partners.crm.hint")}
      />
      <div className="col-span-full flex flex-wrap items-center justify-between gap-[8px] text-[14px]">
        <label className="inline-flex min-h-[24px] items-center gap-[8px]">
          <input
            type="checkbox"
            name="pinned"
            value="on"
            defaultChecked={note?.pinned ?? false}
          />
          {adminT("admin.partners.crm.note.pin")}
        </label>
        <AdminQuiet>
          {adminT("admin.partners.crm.note.limit", { max: NOTE_MAX })}
        </AdminQuiet>
      </div>
    </>
  );
}

function ContactFields({
  form,
  entry,
  result,
  zone,
  value,
}: {
  readonly form: "contact" | "contactEdit";
  readonly entry?: string | undefined;
  readonly result: CrmResult;
  readonly zone: string;
  readonly value?: CrmContactEntry;
}): ReactElement {
  const id = entry === undefined ? "crm-contact" : `crm-contact-${entry}`;
  const error = (field: string) => crmFieldError(result, form, field, entry);
  return (
    <>
      <Input
        id={`${id}-when`}
        name="occurredAt"
        type="datetime-local"
        label={adminT("admin.partners.crm.contact.when")}
        value={
          value === undefined
            ? undefined
            : instantToWallClock(value.occurredAt, zone)
        }
        error={error("occurredAt")}
        hint={adminT("admin.partners.crm.contact.whenHint", {
          zone: zoneCity(zone),
        })}
        required
      />
      <Choice
        id={`${id}-channel`}
        name="channel"
        label={adminT("admin.partners.crm.contact.channel")}
        value={value?.channel}
        error={error("channel")}
        options={CHANNELS.map((c) => ({
          value: c,
          label: adminT(`admin.partners.crm.channel.${c}`),
        }))}
      />
      <Choice
        id={`${id}-direction`}
        name="direction"
        label={adminT("admin.partners.crm.contact.direction")}
        value={value?.direction}
        error={error("direction")}
        options={DIRECTIONS.map((d) => ({
          value: d,
          label: adminT(`admin.partners.crm.direction.${d}`),
        }))}
      />
      <Choice
        id={`${id}-topic`}
        name="topic"
        label={adminT("admin.partners.crm.contact.topic")}
        value={value?.topic}
        error={error("topic")}
        options={TOPICS.map((t) => ({
          value: t,
          label: adminT(`admin.partners.crm.topic.${t}`),
        }))}
      />
      <TextArea
        id={`${id}-summary`}
        name="summary"
        label={adminT("admin.partners.crm.contact.summary")}
        max={SUMMARY_MAX}
        value={value?.summary}
        error={error("summary")}
        hint={adminT("admin.partners.crm.hint")}
        rows={3}
      />
      <Input
        id={`${id}-follow`}
        name="followUpOn"
        type="date"
        label={adminT("admin.partners.crm.contact.followUp")}
        value={value?.followUpOn ?? undefined}
        error={error("followUpOn")}
      />
    </>
  );
}

function NoteCard({
  note,
  canWrite,
  zone,
  code,
  result,
}: {
  readonly note: CrmNote;
  readonly canWrite: boolean;
  readonly zone: string;
  readonly code: string;
  readonly result: CrmResult;
}): ReactElement {
  const when = adminT("admin.partners.crm.when", {
    when: formatDate(note.createdAt, "en", "dayMonthTime", zone),
    zone: zoneCity(zone),
  });
  const version = { code, noteId: note.id, updatedAt: note.updatedAt };
  return (
    <li
      className={`bg-card grid gap-[8px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] ${
        note.pinned ? "border-s-ink border-s-[3px]" : ""
      }`}
    >
      <p className="m-0 text-[14px] leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line">
        {note.body}
      </p>
      <div className="text-ink-3 flex flex-wrap items-center gap-x-[10px] gap-y-[6px] text-[13px]">
        {note.pinned ? (
          <AdminChip tone="ink">
            {adminT("admin.partners.crm.note.pinned")}
          </AdminChip>
        ) : null}
        {note.author === null ? null : <span>{note.author}</span>}
        <span>{when}</span>
      </div>
      <Outcome result={result} form="noteEdit" entry={note.id} />
      {canWrite ? (
        <div className="flex flex-wrap gap-[8px]">
          <AdminActionDialog
            id={`crm-note-edit-${note.id}`}
            openLabel={adminT("admin.partners.crm.note.edit")}
            openTone="ghost"
            inline
            title={adminT("admin.partners.crm.note.editTitle")}
            initiallyOpen={
              cameFrom(result, "noteEdit", note.id) &&
              result.result === "invalid"
            }
            sheetCloseLabel={adminT("admin.partners.crm.close")}
          >
            <form action={editNoteAction} className={FORM_GRID}>
              <Hidden values={version} />
              <NoteFields
                form="noteEdit"
                entry={note.id}
                result={result}
                note={note}
              />
              <DialogActions submit={adminT("admin.partners.crm.note.save")} />
            </form>
          </AdminActionDialog>
          <form action={editNoteAction}>
            <Hidden values={{ ...version, body: note.body }} />
            {note.pinned ? null : (
              <input type="hidden" name="pinned" value="on" />
            )}
            <AdminButton tone="ghost">
              {adminT(
                note.pinned
                  ? "admin.partners.crm.note.unpin"
                  : "admin.partners.crm.note.pinAction",
              )}
            </AdminButton>
          </form>
          <AdminActionDialog
            id={`crm-note-delete-${note.id}`}
            openLabel={adminT("admin.partners.crm.note.delete")}
            openTone="danger"
            inline
            title={adminT("admin.partners.crm.note.deleteTitle")}
            sheetCloseLabel={adminT("admin.partners.crm.close")}
          >
            <p className="m-0 text-[14px]">
              {adminT("admin.partners.crm.note.deleteBody")}
            </p>
            <form
              action={deleteNoteAction}
              className="flex flex-wrap justify-end gap-[8px]"
            >
              <Hidden values={version} />
              <AdminDialogClose label={adminT("admin.partners.crm.cancel")} />
              <AdminButton tone="dangerFill">
                {adminT("admin.partners.crm.note.deleteConfirm")}
              </AdminButton>
            </form>
          </AdminActionDialog>
        </div>
      ) : null}
    </li>
  );
}

function FollowUpState({
  entry,
  today,
}: {
  readonly entry: CrmContactEntry;
  readonly today: string;
}): ReactElement {
  if (entry.followUpOn === null) {
    return (
      <span className="text-ink-3">
        {adminT("admin.partners.crm.followUp.none")}
      </span>
    );
  }
  if (entry.followUpDoneAt !== null) {
    return (
      <span className="text-ink-3">
        {adminT("admin.partners.crm.followUp.done", {
          due: calendarDay(entry.followUpOn, false),
        })}
      </span>
    );
  }
  if (entry.followUpOn === today) {
    return (
      <AdminChip tone="warn">
        {adminT("admin.partners.crm.followUp.today")}
      </AdminChip>
    );
  }
  if (entry.followUpOn < today) {
    return (
      <AdminChip tone="bad">
        {adminT("admin.partners.crm.followUp.overdue", {
          date: calendarDay(entry.followUpOn, false),
        })}
      </AdminChip>
    );
  }
  return (
    <span className="text-ink-3">
      {adminT("admin.partners.crm.followUp.on", {
        date: calendarDay(entry.followUpOn, false),
      })}
    </span>
  );
}

function ContactRow({
  entry,
  canWrite,
  zone,
  today,
  code,
  result,
}: {
  readonly entry: CrmContactEntry;
  readonly canWrite: boolean;
  readonly zone: string;
  readonly today: string;
  readonly code: string;
  readonly result: CrmResult;
}): ReactElement {
  const open =
    entry.followUpOn !== null &&
    entry.followUpDoneAt === null &&
    entry.followUpOn <= today;
  return (
    <li className="border-rule grid gap-[6px] border-b py-[12px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px] text-[14px]">
        <span className="font-bold [font-variant-numeric:lining-nums_tabular-nums]">
          {formatDate(entry.occurredAt, "en", "dayMonthTime", zone)}
        </span>
        <span>{adminT(`admin.partners.crm.channel.${entry.channel}`)}</span>
        <span>{adminT(`admin.partners.crm.direction.${entry.direction}`)}</span>
        <span>{adminT(`admin.partners.crm.topic.${entry.topic}`)}</span>
      </div>
      <p className="m-0 text-[14px] leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line">
        {entry.summary}
      </p>
      <div className="flex flex-wrap items-center gap-[8px] text-[13px]">
        <FollowUpState entry={entry} today={today} />
        {canWrite && open ? (
          <form action={markFollowUpDoneAction}>
            <Hidden values={{ code, entryId: entry.id }} />
            <AdminButton tone="ghost">
              {adminT("admin.partners.crm.followUp.mark")}
            </AdminButton>
          </form>
        ) : null}
        {canWrite ? (
          <AdminActionDialog
            id={`crm-contact-edit-${entry.id}`}
            openLabel={adminT("admin.partners.crm.contact.edit")}
            openTone="ghost"
            inline
            title={adminT("admin.partners.crm.contact.editTitle")}
            initiallyOpen={
              cameFrom(result, "contactEdit", entry.id) &&
              result.result === "invalid"
            }
            sheetCloseLabel={adminT("admin.partners.crm.close")}
          >
            <form action={editContactAction} className={FORM_GRID}>
              <Hidden
                values={{ code, entryId: entry.id, updatedAt: entry.updatedAt }}
              />
              <ContactFields
                form="contactEdit"
                entry={entry.id}
                result={result}
                zone={zone}
                value={entry}
              />
              <DialogActions
                submit={adminT("admin.partners.crm.contact.save")}
              />
            </form>
          </AdminActionDialog>
        ) : null}
      </div>
      <Outcome result={result} form="contactEdit" entry={entry.id} />
    </li>
  );
}

function languageName(code: string | null): string {
  if (code === null)
    return adminT("admin.partners.crm.contactBlock.noLanguage");
  // The English name the locale registry stores (`locale.name`); a code it lacks reads as itself.
  return isLocaleCode(code) ? localeConfig(code).name : code;
}

export default async function AdminPartnerRelationshipPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("partner.crm.view");
  const canWrite = can(session.roles, "partner.crm.write");
  const { code } = await params;
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const head = await partnerHead(actor, code);
  if (head === undefined) notFound();
  const record = await partnerRelationship(actor, head.id);
  if (record === undefined) notFound();
  await logAdminRead(actor, "partner_crm", head.id);
  const result = CrmResultSchema.parse(await searchParams);
  const zone = session.timeZone;
  const today = instantToWallClock(new Date(), zone).slice(0, 10);
  const due = record.contacts.filter(
    (entry) =>
      entry.followUpOn !== null &&
      entry.followUpDoneAt === null &&
      entry.followUpOn <= today,
  );

  const terms =
    record.termsSignedAt === null || record.termsVersion === null
      ? adminT("admin.partners.termsNone")
      : adminT("admin.partners.crm.standing.terms", {
          version: record.termsVersion,
          date: calendarDay(record.termsSignedAt),
        });

  const standing = (
    <AdminCard title={adminT("admin.partners.crm.standing.title")}>
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "status",
            label: adminT("admin.partners.crm.standing.status"),
            value: <PartnerStatusChip status={record.status} />,
          },
          {
            key: "terms",
            label: adminT("admin.partners.crm.standing.termsLabel"),
            value: terms,
          },
          {
            key: "rating",
            label: adminT("admin.partners.crm.standing.rating"),
            value:
              record.rating90dBp === null
                ? adminT("admin.partners.crm.standing.fewRatings")
                : adminT("admin.partners.crm.standing.ratingValue", {
                    rating: formatRatingBp(record.rating90dBp, "en"),
                  }),
          },
          {
            key: "acceptance",
            label: adminT("admin.partners.crm.standing.acceptance"),
            value:
              record.acceptanceRateBp === null
                ? adminT("admin.partners.crm.standing.noOffers")
                : formatPercentBp(record.acceptanceRateBp, "en"),
            numeric: true,
          },
          {
            key: "last",
            label: adminT("admin.partners.crm.standing.lastAccepted"),
            value:
              record.lastAcceptedAt === null
                ? adminT("admin.partners.crm.standing.noOrders")
                : formatDate(record.lastAcceptedAt, "en", "dayMonthYear", zone),
          },
        ]}
      />
      <AdminQuiet>{adminT("admin.partners.crm.standing.note")}</AdminQuiet>
    </AdminCard>
  );

  const contactNameError = crmFieldError(result, "contactName", "contactName");
  const contact = (
    <AdminCard title={adminT("admin.partners.crm.contactBlock.title")}>
      <Outcome result={result} form="contactName" />
      {canWrite ? (
        <form action={saveContactNameAction} className="grid gap-[8px]">
          <Hidden
            values={{
              code: record.code,
              partnerId: record.id,
              updatedAt: record.updatedAt,
            }}
          />
          <Input
            id="crm-contact-name"
            name="contactName"
            label={adminT("admin.partners.crm.contactBlock.person")}
            value={record.contactName ?? ""}
            error={contactNameError}
            hint={adminT("admin.partners.crm.contactBlock.personHint")}
            maxLength={CONTACT_NAME_MAX + 20}
          />
          <div>
            <AdminButton tone="ghost">
              {adminT("admin.partners.crm.contactBlock.save")}
            </AdminButton>
          </div>
        </form>
      ) : null}
      <AdminKeyValues
        variant="tight"
        items={[
          ...(canWrite
            ? []
            : [
                {
                  key: "person",
                  label: adminT("admin.partners.crm.contactBlock.person"),
                  value:
                    record.contactName ??
                    adminT("admin.partners.crm.contactBlock.noPerson"),
                },
              ]),
          {
            key: "email",
            label: adminT("admin.partners.profile.contactEmail"),
            value: record.contactEmail,
          },
          {
            key: "phone",
            label: adminT("admin.partners.profile.contactPhone"),
            value:
              record.contactPhone ??
              adminT("admin.partners.crm.contactBlock.noPhone"),
          },
          {
            key: "channel",
            label: adminT("admin.partners.profile.channel"),
            value: adminT(
              record.notificationChannel === "whatsapp"
                ? "admin.partners.channel.whatsapp"
                : "admin.partners.channel.email",
            ),
          },
          {
            key: "language",
            label: adminT("admin.partners.crm.contactBlock.language"),
            value: languageName(record.localeCode),
          },
        ]}
      />
      <AdminQuiet>{adminT("admin.partners.crm.contactBlock.note")}</AdminQuiet>
    </AdminCard>
  );

  const addNote: ReactNode = canWrite ? (
    <AdminActionDialog
      id="crm-note-add"
      openLabel={adminT("admin.partners.crm.note.add")}
      openTone="ghost"
      inline
      title={adminT("admin.partners.crm.note.add")}
      initiallyOpen={cameFrom(result, "note") && result.result === "invalid"}
      sheetCloseLabel={adminT("admin.partners.crm.close")}
    >
      <form action={addNoteAction} className={FORM_GRID}>
        <Hidden values={{ code: record.code, partnerId: record.id }} />
        <NoteFields form="note" result={result} />
        <DialogActions submit={adminT("admin.partners.crm.note.save")} />
      </form>
    </AdminActionDialog>
  ) : undefined;

  const logContactDialog: ReactNode = canWrite ? (
    <AdminActionDialog
      id="crm-contact-add"
      openLabel={adminT("admin.partners.crm.contact.add")}
      openTone="ghost"
      inline
      title={adminT("admin.partners.crm.contact.add")}
      initiallyOpen={cameFrom(result, "contact") && result.result === "invalid"}
      sheetCloseLabel={adminT("admin.partners.crm.close")}
    >
      <form action={logContactAction} className={FORM_GRID}>
        <Hidden values={{ code: record.code, partnerId: record.id }} />
        <ContactFields form="contact" result={result} zone={zone} />
        <DialogActions submit={adminT("admin.partners.crm.contact.save")} />
      </form>
    </AdminActionDialog>
  ) : undefined;

  return (
    <AdminFrame session={session} current="partners">
      <div className="grid gap-[16px] md:gap-[20px]">
        <PartnerTabHead
          head={head}
          roles={session.roles}
          current="relationship"
        />
        {due.map((entry) => (
          <p
            key={entry.id}
            role="status"
            className={`m-0 rounded-[10px] px-[14px] py-[10px] text-[14px] ${
              entry.followUpOn === today ? "bg-butter" : "bg-blush"
            }`}
          >
            <strong>
              {entry.followUpOn === today
                ? adminT("admin.partners.crm.banner.today")
                : adminT("admin.partners.crm.banner.overdue", {
                    date: calendarDay(entry.followUpOn ?? today, false),
                  })}
            </strong>{" "}
            {adminT("admin.partners.crm.banner.from", {
              topic: adminT(`admin.partners.crm.topic.${entry.topic}`),
              date: formatDate(entry.occurredAt, "en", "dayMonth", zone),
            })}{" "}
            {entry.summary}
          </p>
        ))}
        <Outcome result={result} form="noteDelete" />
        <Outcome result={result} form="followUp" />
        <AdminRecordColumns
          main={
            <>
              <AdminSection
                title={adminT("admin.partners.crm.note.title")}
                note={addNote}
              >
                <Outcome result={result} form="note" />
                {record.notes.length === 0 ? (
                  <AdminQuiet>
                    {adminT("admin.partners.crm.note.empty")}
                  </AdminQuiet>
                ) : (
                  <ul className="m-0 grid list-none gap-[10px] p-0">
                    {record.notes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        canWrite={canWrite}
                        zone={zone}
                        code={record.code}
                        result={result}
                      />
                    ))}
                  </ul>
                )}
              </AdminSection>
              <AdminSection
                title={adminT("admin.partners.crm.contact.title")}
                note={logContactDialog}
              >
                <Outcome result={result} form="contact" />
                {record.contacts.length === 0 ? (
                  <AdminQuiet>
                    {adminT("admin.partners.crm.contact.empty")}
                  </AdminQuiet>
                ) : (
                  <AdminCard flush>
                    <ul className="m-0 grid list-none p-0">
                      {record.contacts.map((entry) => (
                        <ContactRow
                          key={entry.id}
                          entry={entry}
                          canWrite={canWrite}
                          zone={zone}
                          today={today}
                          code={record.code}
                          result={result}
                        />
                      ))}
                    </ul>
                  </AdminCard>
                )}
              </AdminSection>
            </>
          }
          aside={
            <div className="grid gap-[16px]">
              {standing}
              {contact}
            </div>
          }
        />
      </div>
    </AdminFrame>
  );
}
