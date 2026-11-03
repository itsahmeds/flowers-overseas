/**
 * @purpose The payout pages' shared view pieces: money, dates, outcomes, the line dialogs (030a §5.3)
 * @spec 030a
 *
 * Amounts through `formatMoney` from integer minor units in the payout's own currency; a
 * florist's calendar dates (periods, delivery dates) as the dates they are, with the florist's
 * zone named beside them; our own actions' instants in the viewer's zone. Every word is the admin
 * catalogue's (`admin.payouts.*`). The outcome line reads the query string's codes only.
 */
import type { ReactElement, ReactNode } from "react";

import { currencyConfig, isCurrencyCode } from "@/config/currencies";
import { adminT, zoneCity } from "@/modules/admin";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatRangeEnds,
} from "@/modules/i18n";
import type { PayoutKind, PayoutListRow } from "@/modules/partners/payouts";
import {
  AdminActionDialog,
  AdminDialogClose,
} from "@/modules/ui/admin/AdminActionDialog";
import { AdminRefusal, AdminToast } from "@/modules/ui/admin/AdminControls";
import {
  AdminChip,
  AdminField,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";
import { AdminPendingSubmit } from "@/modules/ui/admin/AdminPendingSubmit";

import type { PayoutFormField, PayoutOutcome } from "./outcome";

/** Integer minor units of `currency`, through the one money formatter. */
export function money(amountMinor: bigint, currency: string): string {
  // Every payout currency is a `currency` row the config knows; an unknown code shows its digits.
  if (!isCurrencyCode(currency)) return `${amountMinor.toString()} ${currency}`;
  return formatMoney({ amountMinor, currency }, "en");
}

/** One whole unit of `currency` in minor units (100 for PLN, 1 for HUF), for the amount hints. */
export function oneUnit(currency: string): bigint {
  return isCurrencyCode(currency)
    ? 10n ** BigInt(currencyConfig(currency).minorUnitExponent)
    : 100n;
}

/** A calendar date (`YYYY-MM-DD`) as "19 Oct 2026": the same day in every zone. */
export function calendarDay(date: string): string {
  return formatDate(new Date(`${date}T12:00:00Z`), "en", "dayMonthYear", "UTC");
}

/** A calendar date with its weekday, "Sun 1 Nov" (when a weekly payout closes). */
export function weekdayDay(date: string): string {
  return formatDate(new Date(`${date}T12:00:00Z`), "en", "deliveryDate", "UTC");
}

/**
 * A payout's period: one date for a one-order payout, else the range in words, "19 to 25 Oct
 * 2026" (TASK-437: no dash, founder 2026-10-05). The two ends are `Intl`'s, the word joining them
 * is the admin catalogue's (`admin.payouts.period`).
 */
export function periodText(start: string, end: string): string {
  if (start === end) return calendarDay(start);
  const ends = formatRangeEnds(
    new Date(`${start}T12:00:00Z`),
    new Date(`${end}T12:00:00Z`),
    "en",
    "dayMonthYear",
    "UTC",
  );
  return adminT("admin.payouts.period", { ...ends });
}

/** An instant in a zone, with the zone's city: "23 Oct, 18:05 (Warsaw)". */
export function whenIn(
  instant: Date,
  zone: string,
): {
  readonly when: string;
  readonly zone: string;
} {
  return {
    when: formatDate(instant, "en", "dayMonthTime", zone),
    zone: zoneCity(zone),
  };
}

export function kindLabel(kind: PayoutKind): string {
  return adminT(`admin.payouts.kind.${kind}`);
}

/** The status chip of a payout (`.ad-chip`): open, closed draft, sent, exported, paid. */
export function PayoutStatusChip({
  payout,
  viewerZone,
}: {
  readonly payout: PayoutListRow;
  readonly viewerZone: string;
}): ReactElement {
  if (payout.status === "paid") {
    return (
      <AdminChip tone="ok">
        {adminT("admin.payouts.detail.chip.paid", {
          date:
            payout.paidAt === null
              ? ""
              : formatDate(payout.paidAt, "en", "dayMonth", viewerZone),
        })}
      </AdminChip>
    );
  }
  if (payout.status === "statement_sent") {
    return payout.exportId === null ? (
      <AdminChip tone="ink">
        {adminT("admin.payouts.detail.chip.sent")}
      </AdminChip>
    ) : (
      <AdminChip tone="sky">
        {adminT("admin.payouts.detail.chip.exported")}
      </AdminChip>
    );
  }
  return payout.closedAt === null ? (
    <AdminChip>{adminT("admin.payouts.detail.chip.open")}</AdminChip>
  ) : (
    <AdminChip tone="sky">
      {adminT("admin.payouts.detail.chip.closed")}
    </AdminChip>
  );
}

/* -------------------------------------------------------------------------- */
/* Outcomes                                                                   */
/* -------------------------------------------------------------------------- */

/** The toast or the refusal of the last submission, above the page's content. */
export function PayoutOutcomeLine({
  outcome,
}: {
  readonly outcome: PayoutOutcome;
}): ReactElement | null {
  if (outcome.done !== undefined) {
    const text =
      outcome.done === "sent"
        ? adminT("admin.payouts.done.sent", {
            number: outcome.n ?? "",
            florist: outcome.florist ?? "",
          })
        : outcome.done === "created" || outcome.done === "exportPaid"
          ? adminT(`admin.payouts.done.${outcome.done}`, {
              count: outcome.count ?? 0,
            })
          : adminT(`admin.payouts.done.${outcome.done}`);
    return <AdminToast>{text}</AdminToast>;
  }
  if (outcome.refused !== undefined && outcome.open === undefined) {
    return <AdminRefusal>{refusalText(outcome)}</AdminRefusal>;
  }
  return null;
}

/** The message of a refusal code; the Wise case names the florist codes. */
export function refusalText(outcome: PayoutOutcome): string {
  const code = outcome.refused ?? "other";
  if (code === "PAYOUT_WISE_RECIPIENT_MISSING") {
    const codes = outcome.codes ?? [];
    return adminT("admin.payouts.refused.PAYOUT_WISE_RECIPIENT_MISSING", {
      codes: codes.join(", "),
      count: codes.length,
    });
  }
  return adminT(`admin.payouts.refused.${code}`);
}

/** A dialog's refusal or field errors, when the outcome re-opens `dialog`. */
export function dialogState(
  outcome: PayoutOutcome,
  dialog: string,
): {
  readonly open: boolean;
  readonly refusal: string | undefined;
  readonly errors: readonly PayoutFormField[];
} {
  const open = outcome.open === dialog;
  return {
    open,
    refusal:
      open && outcome.refused !== undefined ? refusalText(outcome) : undefined,
    errors: open ? (outcome.err ?? []) : [],
  };
}

function fieldError(
  errors: readonly PayoutFormField[],
  field: PayoutFormField,
): string | undefined {
  return errors.includes(field)
    ? adminT(`admin.payouts.fieldError.${field}`)
    : undefined;
}

/* -------------------------------------------------------------------------- */
/* Form pieces                                                                */
/* -------------------------------------------------------------------------- */

function DialogActions({
  cancel,
  children,
}: {
  readonly cancel: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap justify-end gap-[8px]">
      <AdminDialogClose label={cancel} />
      {children}
    </div>
  );
}

function TextArea({
  id,
  name,
  label,
  hint,
  error,
  maxLength,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly hint: string;
  readonly error: string | undefined;
  readonly maxLength: number;
}): ReactElement {
  return (
    <AdminField id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        name={name}
        rows={3}
        maxLength={maxLength}
        {...adminFieldAria(id, hint, error)}
        className={`${adminControlClass(error !== undefined)} min-h-[84px] py-[8px]`}
      />
    </AdminField>
  );
}

function AmountInput({
  id,
  label,
  hint,
  error,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly error: string | undefined;
}): ReactElement {
  return (
    <AdminField id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        name="amountMinor"
        type="text"
        inputMode="numeric"
        pattern="-?[0-9]{1,15}"
        autoComplete="off"
        {...adminFieldAria(id, hint, error)}
        className={`${adminControlClass(error !== undefined)} text-[18px] [font-variant-numeric:lining-nums_tabular-nums]`}
      />
    </AdminField>
  );
}

/** The settle dialog of one open adjustment (`settleAdjustment`, AC-17). */
export function SettleDialog({
  adjustment,
  outcome,
  action,
}: {
  readonly adjustment: {
    readonly id: string;
    readonly reference: string;
    readonly partnerCode: string;
    readonly currency: string;
  };
  readonly outcome: PayoutOutcome;
  readonly action: (formData: FormData) => Promise<void>;
}): ReactElement {
  const dialog = `settle-${adjustment.id}`;
  const state = dialogState(outcome, dialog);
  const unit = oneUnit(adjustment.currency);
  return (
    <AdminActionDialog
      id={dialog}
      inline
      openLabel={adminT("admin.payouts.adjustment.settle")}
      openTone="ink"
      initiallyOpen={state.open}
      title={adminT("admin.payouts.settle.title", {
        reference: adjustment.reference,
      })}
    >
      {state.refusal === undefined ? null : (
        <AdminRefusal>{state.refusal}</AdminRefusal>
      )}
      <p className="text-ink-2 text-[14px]">
        {adminT("admin.payouts.settle.intro", {
          florist: adjustment.partnerCode,
        })}
      </p>
      <form action={action} className="grid gap-[14px]">
        <input type="hidden" name="adjustmentId" value={adjustment.id} />
        <AmountInput
          id={`${dialog}-amount`}
          label={adminT("admin.payouts.settle.amount", {
            currency: adjustment.currency,
          })}
          hint={adminT("admin.payouts.settle.amountHint", {
            example: formatNumber(Number(unit * 45n), "en"),
            formatted: money(unit * 45n, adjustment.currency),
          })}
          error={fieldError(state.errors, "amountMinor")}
        />
        <TextArea
          id={`${dialog}-note`}
          name="note"
          label={adminT("admin.payouts.settle.note")}
          hint={adminT("admin.payouts.settle.noteHint")}
          error={fieldError(state.errors, "note")}
          maxLength={500}
        />
        <DialogActions cancel={adminT("admin.payouts.cancel")}>
          <AdminPendingSubmit
            tone="primary"
            label={adminT("admin.payouts.settle.submit")}
            pendingLabel={adminT("admin.payouts.settle.pending")}
          />
        </DialogActions>
      </form>
    </AdminActionDialog>
  );
}

/** A dialog that asks for a reason of 10 to 500 characters (waive, the photo waiver). */
export function ReasonDialog({
  dialog,
  openLabel,
  title,
  intro,
  hidden,
  submit,
  pending,
  outcome,
  action,
}: {
  readonly dialog: string;
  readonly openLabel: string;
  readonly title: string;
  readonly intro: string;
  readonly hidden: Readonly<Record<string, string>>;
  readonly submit: string;
  readonly pending: string;
  readonly outcome: PayoutOutcome;
  readonly action: (formData: FormData) => Promise<void>;
}): ReactElement {
  const state = dialogState(outcome, dialog);
  return (
    <AdminActionDialog
      id={dialog}
      inline
      openLabel={openLabel}
      openTone="ghost"
      initiallyOpen={state.open}
      title={title}
    >
      {state.refusal === undefined ? null : (
        <AdminRefusal>{state.refusal}</AdminRefusal>
      )}
      <p className="text-ink-2 text-[14px]">{intro}</p>
      <form action={action} className="grid gap-[14px]">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <TextArea
          id={`${dialog}-reason`}
          name="reason"
          label={adminT("admin.payouts.waive.reason")}
          hint={adminT("admin.payouts.waive.reasonHint")}
          error={fieldError(state.errors, "reason")}
          maxLength={500}
        />
        <DialogActions cancel={adminT("admin.payouts.cancel")}>
          <AdminPendingSubmit label={submit} pendingLabel={pending} />
        </DialogActions>
      </form>
    </AdminActionDialog>
  );
}

/** The add-line dialog of a draft payout (`addManualLine`, AC-16). */
export function AddLineDialog({
  payoutId,
  currency,
  orders,
  outcome,
  action,
}: {
  readonly payoutId: string;
  readonly currency: string;
  readonly orders: readonly {
    readonly id: string;
    readonly reference: string;
  }[];
  readonly outcome: PayoutOutcome;
  readonly action: (formData: FormData) => Promise<void>;
}): ReactElement {
  const dialog = "add-line";
  const state = dialogState(outcome, dialog);
  const unit = oneUnit(currency);
  const kindError = fieldError(state.errors, "kind");
  const amountError =
    fieldError(state.errors, "goodwill") ??
    fieldError(state.errors, "amountMinor");
  return (
    <AdminActionDialog
      id={dialog}
      inline
      wide
      openLabel={adminT("admin.payouts.detail.addLine.open")}
      openTone="ghost"
      initiallyOpen={state.open}
      title={adminT("admin.payouts.detail.addLine.title")}
    >
      {state.refusal === undefined ? null : (
        <AdminRefusal>{state.refusal}</AdminRefusal>
      )}
      <form action={action} className="grid gap-[14px]">
        <input type="hidden" name="payoutId" value={payoutId} />
        <fieldset
          className="m-0 grid gap-[6px] border-0 p-0"
          {...(kindError === undefined
            ? {}
            : { "aria-describedby": `${dialog}-kind-error` })}
        >
          <legend className="text-ink-3 mb-[4px] text-[12px] font-bold tracking-[0.08em] uppercase">
            {adminT("admin.payouts.detail.addLine.kind")}
          </legend>
          <div className="flex flex-wrap gap-[8px]">
            {(["adjustment", "goodwill"] as const).map((kind) => (
              <label
                key={kind}
                className="bg-card grid min-h-[44px] cursor-pointer grid-cols-[auto_1fr] items-center gap-x-[8px] rounded-[10px] px-[12px] py-[6px] text-[14px] font-bold shadow-[inset_0_0_0_1px_var(--color-field-edge)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-ink)]"
              >
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  defaultChecked={kind === "adjustment"}
                  className="accent-ink"
                />
                <span>
                  {adminT(`admin.payouts.detail.addLine.${kind}`)}
                  <small className="text-ink-3 block text-[12px] font-normal">
                    {adminT(`admin.payouts.detail.addLine.${kind}Hint`)}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {kindError === undefined ? null : (
            <p
              id={`${dialog}-kind-error`}
              className="text-danger text-[13px] font-bold"
            >
              {kindError}
            </p>
          )}
        </fieldset>
        <AmountInput
          id={`${dialog}-amount`}
          label={adminT("admin.payouts.detail.addLine.amount", { currency })}
          hint={adminT("admin.payouts.detail.addLine.amountHint", {
            example: formatNumber(Number(unit * -50n), "en"),
            formatted: money(unit * -50n, currency),
          })}
          error={amountError}
        />
        <AdminField
          id={`${dialog}-order`}
          label={adminT("admin.payouts.detail.addLine.order")}
          error={fieldError(state.errors, "orderId")}
        >
          <select
            id={`${dialog}-order`}
            name="orderId"
            {...adminFieldAria(
              `${dialog}-order`,
              undefined,
              fieldError(state.errors, "orderId"),
            )}
            className={adminControlClass(
              fieldError(state.errors, "orderId") !== undefined,
            )}
          >
            <option value="">
              {adminT("admin.payouts.detail.addLine.orderNone")}
            </option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.reference}
              </option>
            ))}
          </select>
        </AdminField>
        <TextArea
          id={`${dialog}-note`}
          name="note"
          label={adminT("admin.payouts.detail.addLine.note")}
          hint={adminT("admin.payouts.detail.addLine.noteHint")}
          error={fieldError(state.errors, "note")}
          maxLength={500}
        />
        <DialogActions cancel={adminT("admin.payouts.cancel")}>
          <AdminPendingSubmit
            tone="primary"
            label={adminT("admin.payouts.detail.addLine.submit")}
            pendingLabel={adminT("admin.payouts.detail.addLine.pending")}
          />
        </DialogActions>
      </form>
    </AdminActionDialog>
  );
}

/** A one-button form posting `fields` to `action` (send, mark paid, remove, mark reviewed). */
export function ButtonForm({
  action,
  fields,
  label,
  pendingLabel,
  tone = "ink",
  accessibleName,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly fields: Readonly<Record<string, string>>;
  readonly label: string;
  readonly pendingLabel?: string;
  readonly tone?: "ink" | "primary" | "ghost";
  readonly accessibleName?: string;
}): ReactElement {
  return (
    <form action={action} className="inline-flex">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <AdminPendingSubmit
        tone={tone}
        label={label}
        pendingLabel={pendingLabel ?? label}
        {...(accessibleName === undefined ? {} : { accessibleName })}
      />
    </form>
  );
}
