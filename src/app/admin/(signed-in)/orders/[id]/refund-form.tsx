"use client";

/**
 * @purpose The refund dialog's form island: amount, suggestions, reason, note, checked as typed (020a AC-16, AC-18, AC-20, AC-22)
 * @spec 020a
 *
 * Artboards `admin-order-refund-{desktop,mobile}` (spec 020a §5.3 "Refund dialog"; TASK-361).
 * One form per kind:
 *
 *  - **full**: the money summary (charged, refunded or on its way, refund now: the server's
 *    remaining balance, never typed), the reason picker, or, for the cancelled-order retry and the
 *    abandoned-order anomaly, the reason the server fixes, said in a line;
 *  - **partial**: `MoneyInput` in the order's currency, the suggestions (`suggestedRefunds`, each
 *    fills the amount and the reason and never submits), the reason picker.
 *
 * Both carry the internal note (required with Other), the two sentences the spec quotes, and
 * Keep / Refund. The amount is checked as typed with the server's own `parseMinorUnits` (digit
 * strings, no float) against the remaining balance: invalid, more than is left, exactly what is
 * left (use Refund in full). The server checks everything again under the order lock; this only
 * spares a round trip. The submit button carries the amount it will ask for, through
 * `formatMoney`.
 *
 * Amounts cross from the server as digit strings (a `bigint` does not cross). Every word arrives
 * as a prop from the admin catalogue; `{amount}`, `{count}` and `{max}` are filled here.
 */
import { type ReactElement, useId, useState } from "react";

import type { CurrencyCode } from "@/config/currencies";
import { parseMinorUnits } from "@/modules/admin/order-actions/money";
import { formatMoney } from "@/modules/i18n/client";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import { AdminPendingSubmit } from "@/modules/ui/admin/AdminPendingSubmit";
import { MoneyInput } from "@/modules/ui/admin/MoneyInput";
import {
  type ReasonOption,
  ReasonPicker,
} from "@/modules/ui/admin/ReasonPicker";

export interface RefundSuggestionView {
  readonly key: string;
  readonly reason: string;
  readonly label: string;
  /** What the chip puts into the field ("13.00"). */
  readonly text: string;
  /** The chip's amount, formatted. */
  readonly amount: string;
}

export interface RefundFormCopy {
  readonly amount: string;
  readonly amountName: string;
  readonly amountPlaceholder: string;
  readonly amountHint: string;
  readonly invalid: string;
  readonly exceeds: string;
  readonly whole: string;
  readonly suggested: string;
  readonly suggestedHint: string;
  readonly reason: string;
  readonly reasonRequired: string;
  readonly note: string;
  readonly noteOptional: string;
  readonly noteHint: string;
  /** "{count} / {max}". */
  readonly noteCount: string;
  readonly noteRequired: string;
  readonly goesBack: string;
  readonly buyerGets: string;
  readonly keep: string;
  /** "Refund {amount}". */
  readonly submit: string;
  readonly submitBare: string;
  readonly refunding: string;
}

export interface RefundSummaryRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

type AmountCheck =
  | { readonly state: "empty" | "invalid" | "exceeds" | "whole" }
  | { readonly state: "ok"; readonly amountMinor: bigint };

/** The text against the balance, as the server will judge it. */
export function checkRefundAmount(
  text: string,
  currency: CurrencyCode,
  remainingMinor: bigint,
): AmountCheck {
  if (text === "") return { state: "empty" };
  const parsed = parseMinorUnits(text, currency);
  if (!parsed.ok) return { state: "invalid" };
  if (parsed.amountMinor === remainingMinor) return { state: "whole" };
  if (parsed.amountMinor > remainingMinor) return { state: "exceeds" };
  return { state: "ok", amountMinor: parsed.amountMinor };
}

export function AdminRefundForm({
  action,
  kind,
  hidden,
  currency,
  remainingMinor,
  summary,
  reasons,
  fixedReason,
  suggestions,
  copy,
  noteMax,
  fieldMaxLength,
  refusal,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly kind: "full" | "partial";
  /** orderId, actionId, expectedSeq. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly currency: CurrencyCode;
  /** Digits of the remaining balance in minor units. */
  readonly remainingMinor: string;
  /** Full only: charged, refunded or on its way, refund now. */
  readonly summary: readonly RefundSummaryRow[];
  readonly reasons: readonly ReasonOption[];
  /** The cancelled retry and the anomaly: the line saying the server's reason, and the value posted. */
  readonly fixedReason: {
    readonly line: string;
    readonly value: string;
  } | null;
  readonly suggestions: readonly RefundSuggestionView[];
  readonly copy: RefundFormCopy;
  readonly noteMax: number;
  readonly fieldMaxLength: number;
  /** The server's refusal of the last submission, under the amount field when it is about it. */
  readonly refusal: {
    readonly field: "amount" | null;
    readonly message: string;
  } | null;
}): ReactElement {
  const base = useId();
  const [text, setText] = useState("");
  const [reason, setReason] = useState(fixedReason?.value ?? "");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const remaining = BigInt(remainingMinor);

  const check =
    kind === "partial"
      ? checkRefundAmount(text, currency, remaining)
      : ({ state: "ok", amountMinor: remaining } as const);
  const amountError =
    check.state === "invalid" || (check.state === "empty" && tried)
      ? copy.invalid
      : check.state === "exceeds"
        ? copy.exceeds
        : check.state === "whole"
          ? copy.whole
          : refusal?.field === "amount" && text === ""
            ? refusal.message
            : undefined;
  const needsNote = fixedReason === null && reason === "other";
  const noteMissing = needsNote && note.trim() === "";
  const reasonMissing = reason === "";
  const blocked = check.state !== "ok" || reasonMissing || noteMissing;
  const submitLabel =
    check.state === "ok"
      ? copy.submit.replace(
          "{amount}",
          formatMoney({ amountMinor: check.amountMinor, currency }, "en"),
        )
      : copy.submitBare;
  const noteId = `${base}-note`;
  const noteHintId = `${base}-note-hint`;
  const noteErrorId = `${base}-note-error`;
  const count = copy.noteCount
    .replace("{count}", String(note.length))
    .replace("{max}", String(noteMax));

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (blocked) {
          event.preventDefault();
          setTried(true);
        }
      }}
      className="grid gap-[14px]"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="kind" value={kind} />
      {fixedReason === null ? null : (
        <input type="hidden" name="reason" value={fixedReason.value} />
      )}
      {refusal !== null && refusal.field === null ? (
        <p role="alert" className="text-danger text-[14px] font-bold">
          {refusal.message}
        </p>
      ) : null}

      {summary.length === 0 ? null : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-[16px] gap-y-[4px] text-[14px]">
          {summary.map((row, index) => {
            const total = index === summary.length - 1;
            const edge = total
              ? "text-ink border-rule border-t pt-[4px] font-bold"
              : "";
            return (
              <div key={row.key} className="contents">
                <dt className={total ? edge : "text-ink-2"}>{row.label}</dt>
                <dd className={`text-end tabular-nums ${edge}`}>{row.value}</dd>
              </div>
            );
          })}
        </dl>
      )}

      {kind === "partial" ? (
        <MoneyInput
          id={`${base}-amount`}
          name="amountText"
          label={copy.amount}
          accessibleName={copy.amountName}
          currency={currency}
          value={text}
          onChange={setText}
          placeholder={copy.amountPlaceholder}
          maxLength={fieldMaxLength}
          hint={copy.amountHint}
          error={amountError}
        />
      ) : null}

      {kind === "partial" && suggestions.length > 0 ? (
        <div className="grid min-w-0 gap-[4px]">
          <span
            id={`${base}-suggested`}
            className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase"
          >
            {copy.suggested}
          </span>
          <div
            role="group"
            aria-labelledby={`${base}-suggested`}
            className="flex flex-wrap gap-[6px]"
          >
            {suggestions.map((suggestion) => {
              const on =
                text === suggestion.text && reason === suggestion.reason;
              return (
                <button
                  key={suggestion.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setText(suggestion.text);
                    setReason(suggestion.reason);
                  }}
                  className={`text-ink inline-flex min-h-[28px] cursor-pointer items-center gap-[6px] rounded-full px-[10px] text-[13px] ${
                    on
                      ? "bg-sage-wash shadow-[inset_0_0_0_1.5px_var(--color-selected)]"
                      : "bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"
                  }`}
                >
                  {suggestion.label}{" "}
                  <b className="tabular-nums">{suggestion.amount}</b>
                </button>
              );
            })}
          </div>
          <p className="text-ink-3 text-[13px] leading-[1.4]">
            {copy.suggestedHint}
          </p>
        </div>
      ) : null}

      {fixedReason === null ? (
        <ReasonPicker
          id={`${base}-reason`}
          name="reason"
          legend={copy.reason}
          options={reasons}
          value={reason}
          onChange={setReason}
          error={tried && reasonMissing ? copy.reasonRequired : undefined}
        />
      ) : (
        <p className="text-ink-2 text-[14px]">{fixedReason.line}</p>
      )}

      <div className="grid min-w-0 gap-[4px]">
        <label
          htmlFor={noteId}
          className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase"
        >
          {copy.note}
          {needsNote ? null : (
            <span className="font-normal tracking-normal normal-case">
              {" "}
              {copy.noteOptional}
            </span>
          )}
        </label>
        <textarea
          id={noteId}
          name="note"
          rows={3}
          maxLength={noteMax}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-describedby={
            tried && noteMissing ? `${noteHintId} ${noteErrorId}` : noteHintId
          }
          aria-invalid={tried && noteMissing}
          required={needsNote}
          className={`bg-card text-ink min-h-[76px] w-full rounded-[8px] border-[1.5px] px-[10px] py-[8px] text-[14px] ${
            tried && noteMissing
              ? "border-danger shadow-[inset_0_0_0_1px_var(--color-danger)]"
              : "border-field-edge"
          }`}
        />
        <div className="flex items-baseline justify-between gap-[12px]">
          <p id={noteHintId} className="text-ink-3 text-[13px] leading-[1.4]">
            {copy.noteHint}
          </p>
          <span className="text-ink-3 text-[12px] tabular-nums">{count}</span>
        </div>
        {tried && noteMissing ? (
          <p id={noteErrorId} className="text-danger text-[13px] font-bold">
            {copy.noteRequired}
          </p>
        ) : null}
      </div>

      <p className="text-ink-3 text-[13px] leading-[1.45]">
        {copy.goesBack} {copy.buyerGets}
      </p>

      <div className="flex flex-col-reverse gap-[8px] md:flex-row md:flex-wrap md:justify-end">
        <button
          type="button"
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          className={`${adminButtonClass("ghost")} max-md:min-h-[44px]`}
        >
          {copy.keep}
        </button>
        <AdminPendingSubmit
          tone="primary"
          label={submitLabel}
          pendingLabel={copy.refunding}
          sheet
        />
      </div>
    </form>
  );
}
