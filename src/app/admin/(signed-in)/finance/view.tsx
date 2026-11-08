/**
 * @purpose The finance pages' shared pieces: the range form, the tax banner, rates, amounts and reasons
 * @spec 030b
 *
 * Shared by `/admin/finance`, `/admin/finance/orders` and the order Money panel (TASK-440).
 * Server components only; the range form is a plain `GET` form, so the pages work without
 * JavaScript (§5.4). Reporting amounts are numbers with the currency named in the header;
 * buyer-currency amounts carry their ISO code and are never added across currencies. Every
 * converted figure shows its rate, date and source (AC-21) through `formatRatePpm`.
 */
import type { ReactElement, ReactNode } from "react";

import { FINANCE_CONFIG, openTaxQuestions } from "@/config/finance";
import { isCurrencyCode } from "@/config/currencies";
import { adminT } from "@/modules/admin";
import type {
  FinanceRange,
  FinanceRangeError,
  FinanceReason,
  OrderMargin,
  RateUse,
} from "@/modules/admin/finance";
import {
  formatDate,
  formatMinorNumber,
  formatPercentBp,
  formatRatePpm,
} from "@/modules/i18n";
import {
  adminControlClass,
  adminFieldAria,
  AdminChip,
  type AdminChipTone,
} from "@/modules/ui/admin/AdminData";

/** The reporting currency (EUR), as the formatter's currency type. */
export const REPORTING = (() => {
  const code = FINANCE_CONFIG.reportingCurrency;
  if (!isCurrencyCode(code))
    throw new Error("the reporting currency is configured");
  return code;
})();

export const FINANCE_PATH = "/admin/finance";
export const FINANCE_ORDERS_PATH = "/admin/finance/orders";
export const FINANCE_EXPORT_PATH = "/admin/finance/export";

/** A reporting amount as a plain number (`53.02`). */
export function eur(minor: bigint): string {
  return formatMinorNumber(minor, REPORTING, "en");
}

/** A buyer- or florist-currency amount with its ISO code (`45.90 GBP`). */
export function native(minor: bigint, currency: string): string {
  if (!isCurrencyCode(currency)) {
    throw new Error(
      `a currency the application does not configure: ${currency}`,
    );
  }
  return `${formatMinorNumber(minor, currency, "en")} ${currency}`;
}

/** Per-currency amounts, each on its own, never added together (`209.00 EUR · 141.70 GBP`). */
export function nativeList(amounts: ReadonlyMap<string, bigint>): string {
  return [...amounts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, minor]) => native(minor, currency))
    .join(" · ");
}

/** A margin percentage, or nothing when the net sale is not positive. */
export function percent(bp: bigint | null): string {
  return bp === null ? "" : formatPercentBp(bp, "en");
}

/** A calendar day (`YYYY-MM-DD`) as "21 Oct 2026"; noon UTC is that day everywhere. */
export function day(iso: string, withYear = true): string {
  return formatDate(
    new Date(`${iso}T12:00:00Z`),
    "en",
    withYear ? "dayMonthYear" : "dayMonth",
    "UTC",
  );
}

/** "ECB · 1 EUR = 0.865000 GBP · 21 Oct 2026" pieces for a rate. */
export function rateText(rate: RateUse): string {
  return adminT("admin.finance.rateLine", {
    rate: formatRatePpm(rate.ratePpm, rate.base, rate.quote, "en"),
    date: day(rate.asOf),
  });
}

/** The source tag and the rate line under an amount (AC-21). */
export function RateNote({ rate }: { readonly rate: RateUse }): ReactElement {
  return (
    <span className="text-ink-3 block text-[12px] whitespace-nowrap">
      <span className="bg-paper-2 text-ink-2 me-[6px] rounded-[4px] px-[4px] text-[11px] font-bold">
        {adminT(`admin.finance.source.${rate.source}`)}
      </span>
      {rateText(rate)}
    </span>
  );
}

/** Whether a rate is worth showing: an EUR amount at the identity rate needs none. */
export function needsRate(rate: RateUse | null): rate is RateUse {
  return rate !== null && rate.base !== rate.quote;
}

const STATUS_TONE: Readonly<
  Record<"final" | "provisional" | "rate_missing", AdminChipTone>
> = {
  final: "ok",
  provisional: "warn",
  rate_missing: "bad",
};

/** The order's figure status: final, provisional, or rate missing. */
export function figureStatus(
  order: OrderMargin,
): "final" | "provisional" | "rate_missing" {
  if (order.reporting === null) return "rate_missing";
  return order.final ? "final" : "provisional";
}

export function StatusChip({
  order,
}: {
  readonly order: OrderMargin;
}): ReactElement {
  const status = figureStatus(order);
  return (
    <AdminChip tone={STATUS_TONE[status]}>
      {adminT(`admin.finance.status.${status}`)}
    </AdminChip>
  );
}

/** Each reason as its sentence. */
export function ReasonList({
  reasons,
}: {
  readonly reasons: readonly FinanceReason[];
}): ReactElement | null {
  if (reasons.length === 0) return null;
  return (
    <ul className="text-ink-2 m-0 grid list-none gap-[2px] p-0 text-[12px]">
      {reasons.map((reason) => (
        <li key={reason}>
          {adminT(`admin.finance.reason.${reason}`, {
            days: FINANCE_CONFIG.rateLookbackDays,
          })}
        </li>
      ))}
    </ul>
  );
}

/** The "Accountant to confirm" banner naming exactly the open tax questions (AC-18). */
export function TaxBanner({
  withNote = true,
}: {
  readonly withNote?: boolean;
}): ReactElement | null {
  const open = openTaxQuestions();
  if (open.length === 0) return null;
  return (
    <div
      role="note"
      className="bg-paper-2 grid gap-[4px] rounded-[10px] px-[14px] py-[10px] text-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
    >
      <p className="m-0">
        <strong>{adminT("admin.finance.tax.lead")}</strong>{" "}
        {open.map((key, index) => (
          <span key={key} data-tax-question={key}>
            {index === 0 ? null : " · "}
            {adminT(`admin.finance.tax.question.${key}`)}
          </span>
        ))}
      </p>
      {withNote ? (
        <p className="text-ink-3 m-0 text-[13px]">
          {adminT("admin.finance.tax.note")}
        </p>
      ) : null}
    </div>
  );
}

/** The per-row "Accountant to confirm" label (supply model null or `agent`), or the banner's. */
export function AccountantChip(): ReactElement {
  return <AdminChip tone="warn">{adminT("admin.finance.tax.row")}</AdminChip>;
}

const LABEL = "text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase";

function DateField({
  id,
  name,
  label,
  value,
  error,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly error: string | undefined;
}): ReactElement {
  return (
    <div className="grid min-w-0 gap-[4px]">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={value}
        className={`${adminControlClass(error !== undefined)} md:min-w-[150px]`}
        {...adminFieldAria(id, undefined, error)}
      />
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-danger m-0 text-[13px] font-bold">
          {error}
        </p>
      )}
    </div>
  );
}

/** A select of the range form. */
export function RangeSelect({
  id,
  name,
  label,
  value,
  options,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}): ReactElement {
  return (
    <div className="grid min-w-0 gap-[4px]">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className={adminControlClass(false)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** What the form shows: a parsed range, or the values as typed with their errors. */
export interface RangeFormState {
  readonly from: string;
  readonly to: string;
  readonly basis: FinanceRange["basis"];
  readonly mode: FinanceRange["mode"];
  readonly errors: Partial<Record<"from" | "to", FinanceRangeError>>;
}

function errorText(error: FinanceRangeError | undefined): string | undefined {
  if (error === undefined) return undefined;
  return adminT(`admin.finance.error.${error}`, {
    max: FINANCE_CONFIG.maxRangeDays,
  });
}

/** The range form: from, to, basis, live or test, extra filters, and the zone named. */
export function RangeForm({
  action,
  state,
  zone,
  children,
}: {
  readonly action: string;
  readonly state: RangeFormState;
  readonly zone: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <form
      method="get"
      action={action}
      aria-label={adminT("admin.finance.form.label")}
      className="bg-card flex flex-wrap items-end gap-x-[12px] gap-y-[10px] rounded-[12px] px-[14px] py-[12px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
    >
      <DateField
        id="finance-from"
        name="from"
        label={adminT("admin.finance.form.from")}
        value={state.from}
        error={errorText(state.errors.from)}
      />
      <DateField
        id="finance-to"
        name="to"
        label={adminT("admin.finance.form.to")}
        value={state.to}
        error={errorText(state.errors.to)}
      />
      <RangeSelect
        id="finance-basis"
        name="basis"
        label={adminT("admin.finance.form.basis")}
        value={state.basis}
        options={[
          { value: "paid", label: adminT("admin.finance.form.basisPaid") },
          {
            value: "delivery",
            label: adminT("admin.finance.form.basisDelivery"),
          },
        ]}
      />
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={`${LABEL} mb-[4px] p-0`}>
          {adminT("admin.finance.form.mode")}
        </legend>
        <div className="flex min-h-[36px] items-center gap-[12px] text-[14px]">
          {(["live", "test"] as const).map((mode) => (
            <label key={mode} className="inline-flex items-center gap-[6px]">
              <input
                type="radio"
                name="mode"
                value={mode}
                defaultChecked={state.mode === mode}
              />
              {adminT(`admin.finance.form.${mode}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {children}
      <button
        type="submit"
        className="bg-ink text-paper inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-[8px] px-[14px] text-[14px] font-bold whitespace-nowrap"
      >
        {adminT("admin.finance.form.submit")}
      </button>
      <span className="text-ink-3 self-center text-[13px]">
        {adminT("admin.finance.form.zone", { zone })}
      </span>
    </form>
  );
}

/** The heading's sub line: "29 Sep 2026 to 28 Oct 2026 · paid on · live". */
export function rangeSub(range: FinanceRange): string {
  return adminT("admin.finance.totals.sub", {
    from: day(range.from),
    to: day(range.to),
    basis: adminT(`admin.finance.basisShort.${range.basis}`),
    mode: adminT(`admin.finance.modeShort.${range.mode}`),
  });
}
