/**
 * @purpose GET /admin/partners/[code]/contracts: the florist's signed agreement, addendum and annexes
 * @spec 030b
 *
 * Spec 030b §14.2 A, §14.5 (artboards `admin-partner-contracts-{desktop,mobile}`; AC-36 to AC-41,
 * AC-56, AC-59; TASK-442). `partner.contract.view` (admin only) opens it; upload, edit and
 * withdraw need `partner.contract.write`. The three kinds on two thirds, what is on file on the
 * last third. Each version shows its template, language, dates, review reminder, upload and
 * file size; downloads go through the route (a 303 to a 60-second signed URL), so no signed URL
 * is ever in this HTML. The flag banners name each of `contractFlags`; a florist that is not
 * active and has no agreement reads "Cannot go live until one is uploaded". Withdraw is offered
 * for 7 days after an upload, with the consequence said before the click. The upload is a plain
 * multipart form to the route; the dialogs are the page's only client islands.
 */
import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { CONTRACTS_CONFIG, type ContractDocKind } from "@/config/contracts";
import { LOCALES } from "@/config/locales";
import {
  adminRequestId,
  adminT,
  can,
  requireAdminPage,
  zoneCity,
} from "@/modules/admin";
import { formatDate, formatNumber } from "@/modules/i18n";
import { partnerHead } from "@/modules/partners";
import {
  CONTRACT_NOTE_MAX,
  type ContractFlag,
  type ContractRow,
  partnerContracts,
  REASON_MAX,
} from "@/modules/partners/contracts";
import {
  AdminActionDialog,
  AdminDialogClose,
} from "@/modules/ui/admin/AdminActionDialog";
import {
  AdminButton,
  AdminRefusal,
  AdminToast,
  adminButtonClass,
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
import { PartnerTabHead } from "../tabs";
import { editContractAction, withdrawContractAction } from "./actions";
import {
  type ContractResult,
  ContractResultSchema,
  contractFieldError,
} from "./view";

const KINDS: readonly ContractDocKind[] = CONTRACTS_CONFIG.docKinds;

function day(iso: string): string {
  return formatDate(new Date(`${iso}T12:00:00Z`), "en", "dayMonthYear", "UTC");
}

function size(bytes: number): string {
  return adminT("admin.partners.contracts.size", {
    mb: formatNumber(Math.max(0.1, Math.round(bytes / 104_857.6) / 10), "en"),
  });
}

function languageName(code: string): string {
  return LOCALES.find((locale) => locale.code === code)?.name ?? code;
}

function Field({
  id,
  name,
  label,
  type = "text",
  value,
  error,
  hint,
  required = false,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly type?: string;
  readonly value?: string | undefined;
  readonly error: string | undefined;
  readonly hint?: string | undefined;
  readonly required?: boolean;
}): ReactElement {
  return (
    <AdminField id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        className={adminControlClass(error !== undefined)}
        {...adminFieldAria(id, hint, error)}
      />
    </AdminField>
  );
}

/** The editable details, shared by the upload and the edit dialog. */
function DetailFields({
  prefix,
  result,
  form,
  entry,
  row,
  showDpa,
}: {
  readonly prefix: string;
  readonly result: ContractResult;
  readonly form: "upload" | "edit";
  readonly entry?: string | undefined;
  readonly row?: ContractRow | undefined;
  readonly showDpa: boolean;
}): ReactElement {
  const error = (field: string) =>
    contractFieldError(result, form, field, entry);
  return (
    <>
      <Field
        id={`${prefix}-template`}
        name="templateVersion"
        label={adminT("admin.partners.contracts.field.template")}
        value={row?.templateVersion}
        error={error("templateVersion")}
        required
      />
      <AdminField
        id={`${prefix}-language`}
        label={adminT("admin.partners.contracts.field.language")}
        error={error("languageCode")}
      >
        <select
          id={`${prefix}-language`}
          name="languageCode"
          defaultValue={row?.languageCode ?? "en"}
          className={adminControlClass(error("languageCode") !== undefined)}
        >
          {LOCALES.map((locale) => (
            <option key={locale.code} value={locale.code}>
              {locale.name}
            </option>
          ))}
        </select>
      </AdminField>
      <Field
        id={`${prefix}-signed`}
        name="signedOn"
        type="date"
        label={adminT("admin.partners.contracts.field.signedOn")}
        value={row?.signedOn}
        error={error("signedOn")}
        required
      />
      <Field
        id={`${prefix}-effective`}
        name="effectiveOn"
        type="date"
        label={adminT("admin.partners.contracts.field.effectiveOn")}
        value={row?.effectiveOn}
        error={error("effectiveOn")}
        required
      />
      <Field
        id={`${prefix}-review`}
        name="reviewOn"
        type="date"
        label={adminT("admin.partners.contracts.field.reviewOn")}
        value={row?.reviewOn ?? undefined}
        error={error("reviewOn")}
      />
      <Field
        id={`${prefix}-notice`}
        name="noticeDays"
        type="number"
        label={adminT("admin.partners.contracts.field.notice")}
        value={String(row?.noticeDays ?? CONTRACTS_CONFIG.defaultNoticeDays)}
        error={error("noticeDays")}
      />
      {showDpa ? (
        <label className="col-span-full inline-flex min-h-[24px] items-center gap-[8px] text-[14px]">
          <input
            type="checkbox"
            name="includesDpa"
            value="on"
            defaultChecked={row?.includesDpa ?? false}
          />
          {adminT("admin.partners.contracts.field.includesDpa")}
        </label>
      ) : null}
      <AdminField
        id={`${prefix}-note`}
        label={adminT("admin.partners.contracts.field.note")}
        hint={adminT("admin.partners.contracts.field.noteHint", {
          max: CONTRACT_NOTE_MAX,
        })}
        error={error("note")}
        full
      >
        <textarea
          id={`${prefix}-note`}
          name="note"
          rows={2}
          maxLength={CONTRACT_NOTE_MAX}
          defaultValue={row?.note ?? undefined}
          className={`${adminControlClass(error("note") !== undefined)} py-[8px]`}
          {...adminFieldAria(
            `${prefix}-note`,
            adminT("admin.partners.contracts.field.noteHint", {
              max: CONTRACT_NOTE_MAX,
            }),
            error("note"),
          )}
        />
      </AdminField>
    </>
  );
}

const GRID = "grid gap-[12px] md:grid-cols-2";

function VersionCard({
  row,
  code,
  zone,
  now,
  canWrite,
  result,
  previous,
}: {
  readonly row: ContractRow;
  readonly code: string;
  readonly zone: string;
  readonly now: Date;
  readonly canWrite: boolean;
  readonly result: ContractResult;
  readonly previous: ContractRow | undefined;
}): ReactElement {
  const windowEnds = new Date(
    row.uploadedAt.getTime() + CONTRACTS_CONFIG.withdrawWindowDays * 86_400_000,
  );
  const canWithdraw = canWrite && row.current && now < windowEnds;
  const ends = adminT("admin.partners.contracts.when", {
    when: formatDate(windowEnds, "en", "dayMonthTime", zone),
    zone: zoneCity(zone),
  });
  const kindLabel = adminT(`admin.partners.contracts.kind.${row.docKind}`);
  const withdrawEffect =
    row.docKind !== "agreement"
      ? adminT("admin.partners.contracts.withdraw.other")
      : previous !== undefined
        ? adminT("admin.partners.contracts.withdraw.previous", {
            version: previous.versionNo,
          })
        : adminT("admin.partners.contracts.withdraw.only");
  return (
    <li className="bg-card grid gap-[8px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <strong className="text-[15px]">
          {adminT("admin.partners.contracts.version", {
            kind: kindLabel,
            version: row.versionNo,
          })}
        </strong>
        <AdminChip tone={row.current ? "ok" : "plain"}>
          {adminT(
            row.current
              ? "admin.partners.contracts.current"
              : "admin.partners.contracts.superseded",
          )}
        </AdminChip>
        {row.includesDpa ? (
          <AdminChip tone="sky">
            {adminT("admin.partners.contracts.containsDpa")}
          </AdminChip>
        ) : null}
      </div>
      <AdminKeyValues
        variant="tight"
        items={[
          {
            key: "template",
            label: adminT("admin.partners.contracts.field.template"),
            value: `${row.templateVersion} · ${languageName(row.languageCode)}`,
          },
          {
            key: "signed",
            label: adminT("admin.partners.contracts.field.signedOn"),
            value: day(row.signedOn),
          },
          {
            key: "effective",
            label: adminT("admin.partners.contracts.field.effectiveOn"),
            value: day(row.effectiveOn),
          },
          ...(row.reviewOn === null
            ? []
            : [
                {
                  key: "review",
                  label: adminT("admin.partners.contracts.review"),
                  value: adminT("admin.partners.contracts.reviewLine", {
                    date: day(row.reviewOn),
                    days: row.noticeDays,
                  }),
                },
              ]),
          {
            key: "uploaded",
            label: adminT("admin.partners.contracts.uploaded"),
            value: adminT("admin.partners.contracts.uploadedLine", {
              when: formatDate(row.uploadedAt, "en", "dayMonthTime", zone),
              zone: zoneCity(zone),
              by: row.uploadedBy ?? "",
            }),
          },
          {
            key: "file",
            label: adminT("admin.partners.contracts.file"),
            value: adminT("admin.partners.contracts.fileLine", {
              size: size(row.bytes),
              pages: row.pageCount,
            }),
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-[8px]">
        <a
          href={`/admin/partners/${encodeURIComponent(code)}/contracts/${row.id}/download`}
          className={adminButtonClass("ghost")}
          aria-label={adminT("admin.partners.contracts.downloadLabel", {
            kind: kindLabel,
            version: row.versionNo,
          })}
        >
          {adminT("admin.partners.contracts.download")}
        </a>
        {canWrite && row.current ? (
          <AdminActionDialog
            id={`contract-edit-${row.id}`}
            openLabel={adminT("admin.partners.contracts.edit")}
            openTone="ghost"
            inline
            title={adminT("admin.partners.contracts.editTitle", {
              kind: kindLabel,
              version: row.versionNo,
            })}
            initiallyOpen={
              result.form === "edit" &&
              result.entry === row.id &&
              result.result === "invalid"
            }
            sheetCloseLabel={adminT("admin.partners.crm.close")}
          >
            <form action={editContractAction} className={GRID}>
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="contractId" value={row.id} />
              <input type="hidden" name="updatedAt" value={row.updatedAt} />
              <DetailFields
                prefix={`contract-${row.id}`}
                result={result}
                form="edit"
                entry={row.id}
                row={row}
                showDpa={row.docKind === "agreement"}
              />
              <p className="text-ink-3 col-span-full m-0 text-[13px]">
                {adminT("admin.partners.contracts.editNote")}
              </p>
              <div className="col-span-full flex flex-wrap justify-end gap-[8px]">
                <AdminDialogClose label={adminT("admin.partners.crm.cancel")} />
                <AdminButton>
                  {adminT("admin.partners.contracts.save")}
                </AdminButton>
              </div>
            </form>
          </AdminActionDialog>
        ) : null}
        {canWithdraw ? (
          <AdminActionDialog
            id={`contract-withdraw-${row.id}`}
            openLabel={adminT("admin.partners.contracts.withdraw.open")}
            openTone="danger"
            inline
            title={adminT("admin.partners.contracts.withdraw.title", {
              kind: kindLabel,
              version: row.versionNo,
            })}
            initiallyOpen={
              result.form === "withdraw" &&
              result.entry === row.id &&
              result.result === "invalid"
            }
            sheetCloseLabel={adminT("admin.partners.crm.close")}
          >
            <p className="m-0 text-[14px]">{withdrawEffect}</p>
            <form action={withdrawContractAction} className="grid gap-[12px]">
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="contractId" value={row.id} />
              <input type="hidden" name="updatedAt" value={row.updatedAt} />
              <AdminField
                id={`contract-reason-${row.id}`}
                label={adminT("admin.partners.contracts.withdraw.reason")}
                hint={adminT("admin.partners.contracts.withdraw.reasonHint")}
                error={contractFieldError(result, "withdraw", "reason", row.id)}
              >
                <textarea
                  id={`contract-reason-${row.id}`}
                  name="reason"
                  rows={2}
                  required
                  minLength={10}
                  maxLength={REASON_MAX}
                  className={`${adminControlClass(false)} py-[8px]`}
                />
              </AdminField>
              <div className="flex flex-wrap justify-end gap-[8px]">
                <AdminDialogClose label={adminT("admin.partners.crm.cancel")} />
                <AdminButton tone="dangerFill">
                  {adminT("admin.partners.contracts.withdraw.confirm")}
                </AdminButton>
              </div>
            </form>
          </AdminActionDialog>
        ) : null}
      </div>
      {canWrite && row.current ? (
        <AdminQuiet>
          {canWithdraw
            ? adminT("admin.partners.contracts.withdraw.until", { when: ends })
            : adminT("admin.partners.contracts.withdraw.closed", {
                when: ends,
              })}
        </AdminQuiet>
      ) : null}
    </li>
  );
}

function Flags({
  flags,
  status,
}: {
  readonly flags: readonly ContractFlag[];
  readonly status: string;
}): ReactElement | null {
  if (flags.length === 0) return null;
  return (
    <div className="grid gap-[8px]">
      {flags.map((flag) => (
        <p
          key={flag}
          role="status"
          data-contract-flag={flag}
          className={`m-0 rounded-[10px] px-[14px] py-[10px] text-[14px] ${
            flag === "review_due" ? "bg-butter" : "bg-blush"
          }`}
        >
          <strong>{adminT(`admin.partners.contracts.flag.${flag}`)}</strong>{" "}
          {flag === "no_agreement" && status !== "active"
            ? adminT("admin.partners.contracts.flag.cannotGoLive")
            : adminT(`admin.partners.contracts.flagHint.${flag}`)}
        </p>
      ))}
    </div>
  );
}

export default async function AdminPartnerContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const session = await requireAdminPage("partner.contract.view");
  const canWrite = can(session.roles, "partner.contract.write");
  const { code } = await params;
  const actor = { userId: session.userId, requestId: await adminRequestId() };
  const head = await partnerHead(actor, code);
  if (head === undefined) notFound();
  const now = new Date();
  const record = await partnerContracts(actor, head.id, now);
  if (record === undefined) notFound();
  const result = ContractResultSchema.parse(await searchParams);
  const zone = session.timeZone;
  const currentOf = (kind: ContractDocKind) =>
    record.rows.find((row) => row.docKind === kind && row.current);

  let message: ReactNode = null;
  if (
    result.result === "uploaded" ||
    result.result === "saved" ||
    result.result === "withdrawn"
  ) {
    message = (
      <AdminToast>
        {adminT(`admin.partners.contracts.result.${result.result}`)}
      </AdminToast>
    );
  } else if (result.result === "rule" && result.rule !== undefined) {
    message = (
      <AdminRefusal>
        {adminT(`admin.partners.contracts.rule.${result.rule}`)}
      </AdminRefusal>
    );
  } else if (result.result !== undefined) {
    message = (
      <AdminRefusal>
        {adminT(`admin.partners.contracts.result.${result.result}`)}
      </AdminRefusal>
    );
  }

  const upload = canWrite ? (
    <AdminActionDialog
      id="contract-upload"
      openLabel={adminT("admin.partners.contracts.upload")}
      openTone="primary"
      inline
      title={adminT("admin.partners.contracts.upload")}
      initiallyOpen={result.form === "upload" && result.result === "invalid"}
      sheetCloseLabel={adminT("admin.partners.crm.close")}
    >
      <form
        method="post"
        encType="multipart/form-data"
        action={`/admin/partners/${encodeURIComponent(head.code)}/contracts/upload`}
        className={GRID}
      >
        <AdminField
          id="contract-file"
          label={adminT("admin.partners.contracts.field.file")}
          hint={adminT("admin.partners.contracts.field.fileHint")}
          error={contractFieldError(result, "upload", "file")}
          full
        >
          <input
            id="contract-file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
            className="text-[14px]"
            {...adminFieldAria(
              "contract-file",
              adminT("admin.partners.contracts.field.fileHint"),
              contractFieldError(result, "upload", "file"),
            )}
          />
        </AdminField>
        <AdminField
          id="contract-kind"
          label={adminT("admin.partners.contracts.field.kind")}
          error={contractFieldError(result, "upload", "docKind")}
        >
          <select
            id="contract-kind"
            name="docKind"
            className={adminControlClass(false)}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {adminT(`admin.partners.contracts.kind.${kind}`)}
              </option>
            ))}
          </select>
        </AdminField>
        <DetailFields
          prefix="contract-new"
          result={result}
          form="upload"
          showDpa
        />
        {/* The current row of each kind the page showed: a newer upload meanwhile is a conflict. */}
        <input
          type="hidden"
          name="expectedAgreement"
          value={currentOf("agreement")?.id ?? ""}
        />
        <input
          type="hidden"
          name="expectedAddendum"
          value={currentOf("dpa_addendum")?.id ?? ""}
        />
        <div className="col-span-full flex flex-wrap justify-end gap-[8px]">
          <AdminDialogClose label={adminT("admin.partners.crm.cancel")} />
          <AdminButton>
            {adminT("admin.partners.contracts.uploadSubmit")}
          </AdminButton>
        </div>
      </form>
    </AdminActionDialog>
  ) : undefined;

  const agreement = currentOf("agreement");
  const addendum = currentOf("dpa_addendum");
  const nextReview = [agreement, addendum]
    .map((row) => row?.reviewOn ?? null)
    .filter((value): value is string => value !== null)
    .sort()[0];

  return (
    <AdminFrame session={session} current="partners">
      <div className="grid gap-[16px] md:gap-[20px]">
        <PartnerTabHead head={head} roles={session.roles} current="contracts" />
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <p className="text-ink-2 m-0 max-w-[70ch] text-[14px]">
            {adminT("admin.partners.contracts.lead")}
          </p>
          {upload}
        </div>
        {message}
        <Flags flags={record.flags} status={record.status} />
        <AdminRecordColumns
          main={
            <>
              {KINDS.map((kind) => {
                const rows = record.rows.filter((row) => row.docKind === kind);
                return (
                  <AdminSection
                    key={kind}
                    title={adminT(`admin.partners.contracts.section.${kind}`)}
                  >
                    {rows.length === 0 ? (
                      <AdminQuiet>
                        {kind === "dpa_addendum" &&
                        agreement?.includesDpa === true
                          ? adminT("admin.partners.contracts.coveredBy", {
                              version: agreement.versionNo,
                            })
                          : adminT("admin.partners.contracts.none")}
                      </AdminQuiet>
                    ) : (
                      <ul className="m-0 grid list-none gap-[10px] p-0">
                        {rows.map((row) => (
                          <VersionCard
                            key={row.id}
                            row={row}
                            code={head.code}
                            zone={zone}
                            now={now}
                            canWrite={canWrite}
                            result={result}
                            previous={record.rows.find(
                              (other) =>
                                other.docKind === row.docKind &&
                                other.versionNo < row.versionNo &&
                                !other.current,
                            )}
                          />
                        ))}
                      </ul>
                    )}
                  </AdminSection>
                );
              })}
            </>
          }
          aside={
            <AdminCard title={adminT("admin.partners.contracts.onFile.title")}>
              <AdminKeyValues
                variant="tight"
                items={[
                  {
                    key: "agreement",
                    label: adminT("admin.partners.contracts.kind.agreement"),
                    value:
                      agreement === undefined
                        ? adminT("admin.partners.contracts.flag.no_agreement")
                        : adminT("admin.partners.contracts.onFile.signed", {
                            version: agreement.versionNo,
                            date: day(agreement.signedOn),
                          }),
                  },
                  {
                    key: "addendum",
                    label: adminT("admin.partners.contracts.kind.dpa_addendum"),
                    value:
                      addendum !== undefined
                        ? adminT("admin.partners.contracts.onFile.signed", {
                            version: addendum.versionNo,
                            date: day(addendum.signedOn),
                          })
                        : agreement?.includesDpa === true
                          ? adminT("admin.partners.contracts.coveredBy", {
                              version: agreement.versionNo,
                            })
                          : adminT("admin.partners.contracts.flag.no_dpa"),
                  },
                  {
                    key: "terms",
                    label: adminT("admin.partners.contracts.onFile.terms"),
                    value:
                      record.termsVersion === null ||
                      record.termsSignedAt === null
                        ? adminT("admin.partners.termsNone")
                        : `${record.termsVersion} · ${day(record.termsSignedAt)}`,
                  },
                  {
                    key: "review",
                    label: adminT("admin.partners.contracts.onFile.review"),
                    value:
                      nextReview === undefined
                        ? adminT("admin.partners.contracts.onFile.noReview")
                        : day(nextReview),
                  },
                ]}
              />
              <AdminQuiet>
                {adminT("admin.partners.contracts.onFile.private")}
              </AdminQuiet>
            </AdminCard>
          }
        />
      </div>
    </AdminFrame>
  );
}
