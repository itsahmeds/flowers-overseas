/**
 * `account-reminders-*` (spec 018 §14 A-founder-2026-10-22 C.7.4, C.13, C.16; AC-56, AC-58;
 * TASK-353): the account frame with Reminders current, the H1 and its intro, then up to three
 * white letters: the saved dates (occasion and day-month, lead time and the saved recipient in
 * `<bdi>`, a Remove submit whose accessible name names the date), the "Add a date" form (native
 * selects for occasion, the optional saved recipient, day and month; the lead time as a radio
 * group of three; the unticked consent box only while consent is off), and, while consent is on,
 * the foot with "Turn off reminders", which asks once in a native `<dialog>` with focus on Keep
 * them (a `GET` of the page, so focus returns). Day and month print through `Intl`, no year.
 * Every word from the catalogues; every form works with JavaScript off.
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import type { LocaleCode } from "@/config/locales";
import {
  OCCASION_KEYS,
  type OccasionReminder,
  REMINDER_LEAD_DAYS,
} from "@/modules/customers";
import { formatDate } from "@/modules/i18n";
import {
  FieldMessages,
  describedBy,
} from "@/modules/ui/checkout/FieldMessages";
import { SelectField } from "@/modules/ui/checkout/SelectField";
import { FIELD_LABEL, buttonClass } from "@/modules/ui/checkout/styles";

import { AccountShell } from "../_parts/AccountShell";
import { remindersPath } from "../_parts/account-request";
import {
  addReminderAction,
  removeReminderAction,
  turnOffRemindersAction,
} from "./actions";

const CARD =
  "bg-card grid gap-[16px] rounded-(--radius-letter) px-[16px] pt-[20px] pb-[22px] shadow-(--shadow-letter) md:px-[30px] md:pt-[26px] md:pb-[28px]";
const LIST =
  "bg-card grid rounded-(--radius-letter) px-[16px] py-[6px] shadow-(--shadow-letter) md:px-[30px] md:py-[10px]";
const REMOVE =
  "text-link min-h-(--target-min) min-w-(--target-min) cursor-pointer border-0 bg-transparent px-[4px] [font:inherit] text-ui underline decoration-[1.5px] underline-offset-[4px] focus-visible:outline-focus focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid";
const RADIO_CARD =
  "relative flex min-h-(--target-min) cursor-pointer items-center gap-[10px] rounded-field bg-card px-[14px] text-ui text-ink shadow-[inset_0_0_0_1.5px_var(--color-rule)] select-none has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-selected)] has-[:checked]:font-bold has-[:checked]:forced-colors:outline-[3px] has-[:checked]:forced-colors:outline-solid has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus";
const RADIO =
  "bg-card checked:border-selected m-0 size-[20px] shrink-0 cursor-pointer appearance-none rounded-full border-[1.5px] border-solid border-(--color-field-edge) checked:border-[6px]";
const CHECKBOX =
  "peer bg-card checked:bg-selected focus-visible:outline-focus m-0 size-[24px] cursor-pointer appearance-none rounded-[6px] shadow-[inset_0_0_0_1.5px_var(--color-field-edge)] checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%223%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%3E%3Cpath%20d=%22M5%2012l5%205L19%207%22/%3E%3C/svg%3E')] checked:bg-[length:16px_16px] checked:bg-center checked:bg-no-repeat checked:shadow-none focus-visible:outline-[2.5px] focus-visible:outline-offset-[3px] focus-visible:outline-solid";

/** The default lead time the form offers (`account-reminders-*`: 7 days chosen). */
const DEFAULT_LEAD = 7;

export interface ReminderRecipientOption {
  readonly id: string;
  readonly name: string;
}

/** Day and month of a reminder, no year: printed on a leap year so 29 February exists. */
function dayMonth(month: number, day: number, locale: LocaleCode): string {
  const date = new Date(Date.UTC(2000, month - 1, day, 12));
  return formatDate(date, locale, "dayMonth", "UTC");
}

/** A month's name in `locale`, standalone (no day, no year). */
function monthName(month: number, locale: LocaleCode): string {
  return formatDate(
    new Date(Date.UTC(2000, month - 1, 1, 12)),
    locale,
    "monthName",
    "UTC",
  );
}

export async function RemindersView({
  locale,
  consent,
  reminders,
  recipients,
  status,
  error,
  confirmingOff,
}: {
  readonly locale: LocaleCode;
  readonly consent: boolean;
  readonly reminders: readonly OccasionReminder[];
  readonly recipients: readonly ReminderRecipientOption[];
  readonly status: "saved" | "removed" | "off" | null;
  readonly error: "consent" | "date" | "limit" | null;
  readonly confirmingOff: boolean;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "account" });
  const add = addReminderAction.bind(null, locale);
  const remove = removeReminderAction.bind(null, locale);
  const off = turnOffRemindersAction.bind(null, locale);
  const occasion = (key: string): string => t("reminders.occasion", { key });
  const lead = (days: number): string => t("reminders.lead", { days });
  const dateError = error === "date" ? t("reminders.errorDate") : undefined;
  const consentError =
    error === "consent" ? t("reminders.errorConsent") : undefined;
  const statusLine =
    status === "off"
      ? t("reminders.unsubscribeDone")
      : status === "removed"
        ? t("recipients.removed")
        : status === "saved"
          ? t("reminders.saved")
          : null;
  const consentContent = { error: consentError };
  return (
    <AccountShell current="reminders" locale={locale}>
      <div
        className="grid gap-[22px]"
        data-fo-account="reminders"
        inert={confirmingOff}
      >
        {statusLine === null ? null : (
          <p
            className="text-ink m-0 font-bold"
            data-fo-account-reminders-status={status ?? ""}
            role="status"
          >
            {statusLine}
          </p>
        )}
        <div className="grid gap-[8px]">
          <h1 className="display text-2xl-fluid m-0 leading-[1.08] max-md:text-(length:--text-2xl-s)">
            <em>{t("nav.reminders")}</em>
          </h1>
          <p className="text-ink-2 m-0">{t("reminders.intro")}</p>
        </div>
        {consent && reminders.length === 0 ? (
          <p className="text-ink-2 m-0" data-fo-account-reminders-empty="">
            {t("reminders.empty")}
          </p>
        ) : null}
        {reminders.length === 0 ? null : (
          <ul className={`${LIST} m-0 list-none`}>
            {reminders.map((row) => {
              const date = dayMonth(row.month, row.day, locale);
              return (
                <li
                  className="border-rule grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[16px] gap-y-[4px] border-b border-solid py-[14px] last:border-b-0"
                  data-fo-account-reminder-row=""
                  key={row.id}
                >
                  <p className="m-0 grid gap-[2px]">
                    <b className="text-ui">
                      {t("reminders.line", {
                        occasion: occasion(row.occasionKey),
                        date,
                      })}
                    </b>
                    <span className="text-ink-2 text-sm">
                      {row.recipientName === null
                        ? lead(row.leadDays)
                        : t.rich("reminders.lineFor", {
                            lead: lead(row.leadDays),
                            name: row.recipientName,
                            bdi: (chunks) => <bdi>{chunks}</bdi>,
                          })}
                    </span>
                  </p>
                  <form action={remove} className="contents">
                    <input name="id" type="hidden" value={row.id} />
                    <button
                      aria-label={t("reminders.removeLabel", {
                        occasion: occasion(row.occasionKey),
                        date,
                      })}
                      className={REMOVE}
                      type="submit"
                    >
                      {t("reminders.remove")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form
          action={add}
          className={CARD}
          data-fo-account-reminder-form=""
          noValidate
        >
          <h2 className="display m-0 text-lg leading-[1.15]">
            {t("reminders.addTitle")}
          </h2>
          {error === "limit" ? (
            <p className="text-ink m-0 font-bold" role="alert">
              {t("reminders.limit")}
            </p>
          ) : null}
          <div className="grid gap-[16px] md:grid-cols-2 md:gap-x-[20px]">
            <SelectField
              defaultValue={OCCASION_KEYS[0]}
              id="reminder-occasion"
              label={t("reminders.occasionLabel")}
              name="occasion"
              options={OCCASION_KEYS.map((key) => ({
                value: key,
                label: occasion(key),
              }))}
              required
            />
            {recipients.length === 0 ? null : (
              <SelectField
                defaultValue=""
                id="reminder-recipient"
                label={t("reminders.forLabel")}
                name="recipient"
                optionalLabel={t("reminders.optional")}
                options={[
                  { value: "", label: t("reminders.forNone") },
                  ...recipients.map((row) => ({
                    value: row.id,
                    label: row.name,
                  })),
                ]}
              />
            )}
            <SelectField
              id="reminder-day"
              label={t("reminders.dayLabel")}
              name="day"
              options={Array.from({ length: 31 }, (_, index) => ({
                value: String(index + 1),
                label: String(index + 1),
              }))}
              required
              {...(dateError === undefined ? {} : { error: dateError })}
            />
            <SelectField
              id="reminder-month"
              label={t("reminders.monthLabel")}
              name="month"
              options={Array.from({ length: 12 }, (_, index) => ({
                value: String(index + 1),
                label: monthName(index + 1, locale),
              }))}
              required
            />
            <fieldset
              className="m-0 grid min-w-0 gap-[6px] border-0 p-0 md:col-span-2"
              data-fo-field="reminder-lead"
              id="reminder-lead"
            >
              <legend className={`${FIELD_LABEL} mb-[6px] p-0`}>
                {t("reminders.leadLabel")}
              </legend>
              <div className="grid gap-[8px] md:grid-cols-3">
                {REMINDER_LEAD_DAYS.map((days) => (
                  <label className={RADIO_CARD} key={days}>
                    <input
                      className={RADIO}
                      defaultChecked={days === DEFAULT_LEAD}
                      name="lead"
                      required
                      type="radio"
                      value={String(days)}
                    />
                    {lead(days)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {consent ? null : (
            <div
              className="text-ui grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-[12px] gap-y-[4px] leading-[1.4]"
              data-fo-reminder-consent=""
            >
              <input
                aria-describedby={describedBy(
                  "reminder-consent",
                  consentContent,
                )}
                aria-invalid={consentError === undefined ? undefined : true}
                className={CHECKBOX}
                id="reminder-consent"
                name="consent"
                required
                type="checkbox"
                value="on"
              />
              <label
                className="text-ink min-h-[24px] cursor-pointer"
                htmlFor="reminder-consent"
              >
                {t("reminders.consent")}
              </label>
              <div className="col-start-2">
                <FieldMessages id="reminder-consent" {...consentContent} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[10px]">
            <button
              className={buttonClass(
                "primary",
                "sm",
                "px-[24px] max-md:flex-1",
              )}
              type="submit"
            >
              {t("reminders.save")}
            </button>
          </div>
        </form>
        {consent ? (
          <section className={CARD} data-fo-account-reminders-off="">
            <form
              action={off}
              className="flex flex-wrap items-center justify-between gap-x-[18px] gap-y-[10px]"
            >
              <p className="text-ink-2 m-0 text-sm">
                {t("reminders.offConfirm")}
              </p>
              <button
                className={buttonClass("ghost", "sm")}
                name="step"
                type="submit"
                value="review"
              >
                {t("reminders.off")}
              </button>
            </form>
          </section>
        ) : null}
      </div>
      {confirmingOff ? (
        <dialog
          aria-describedby="reminders-off-body"
          aria-labelledby="reminders-off-title"
          aria-modal="true"
          className="text-ink fixed inset-0 z-[60] m-0 grid h-full max-h-none w-full max-w-none place-items-center border-0 bg-(--color-scrim) p-0"
          data-fo-account-reminders-off-dialog=""
          open
        >
          <div className="bg-card rounded-field grid w-[480px] max-w-[calc(100%-40px)] gap-[14px] px-[28px] py-[26px] shadow-(--shadow-md) max-md:px-[20px] max-md:py-[22px]">
            <h2
              className="display m-0 text-lg leading-[1.15]"
              id="reminders-off-title"
            >
              {t("reminders.offTitle")}
            </h2>
            <p className="m-0" id="reminders-off-body">
              {t("reminders.offConfirm")}
            </p>
            <div className="flex flex-wrap gap-[10px]">
              <form action={off} className="contents">
                <button
                  className={buttonClass("primary", "sm")}
                  name="step"
                  type="submit"
                  value="confirm"
                >
                  {t("reminders.off")}
                </button>
              </form>
              <form
                action={remindersPath(locale)}
                className="contents"
                method="get"
              >
                <button
                  autoFocus
                  className={buttonClass("ghost", "sm")}
                  type="submit"
                >
                  {t("reminders.keep")}
                </button>
              </form>
            </div>
          </div>
        </dialog>
      ) : null}
    </AccountShell>
  );
}
