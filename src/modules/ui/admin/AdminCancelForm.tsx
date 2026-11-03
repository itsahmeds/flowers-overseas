"use client";

/**
 * The cancel dialog's form (spec 020a §2.3, §5.3 "Cancel dialog", §13 Q1, Q5; artboards
 * `admin-order-cancel-{desktop,mobile}.dc.html`; TASK-358).
 *
 * The reason picker (`.ad-reasons`, one radio per reason the availability table offers for the
 * order's status, the first chosen), the internal note with its warning and its count, the
 * consequences in admin words (`.ad-cons`), and Keep / Cancel. The buyer's sentence follows the
 * chosen reason: "You cancelled" for `buyer_cancel`, "We could not deliver" for the others, which
 * is all a reason ever chooses for the buyer (§13 Q1). With `other` the note is required: the
 * hint is tied to the field, and the server refuses a note-less `other` anyway (`AdminCancelSchema`).
 *
 * No amount field: a cancel always refunds the remaining balance in full (spec 013). Every word
 * arrives as a prop from the admin catalogue; the count's template is filled here.
 */
import { type ReactElement, useId, useState } from "react";

import { adminButtonClass } from "./AdminControls";
import { AdminPendingSubmit } from "./AdminPendingSubmit";

export interface AdminCancelReasonOption {
  readonly value: string;
  readonly label: string;
  /** The buyer email sentence this reason selects, already formatted with the amount. */
  readonly buyerSentence: string;
}

export function AdminCancelForm({
  action,
  hidden,
  legend,
  reasons,
  noteLabel,
  noteOptionalLabel,
  noteHint,
  noteCountTemplate,
  noteMax,
  noteRequired,
  whatHappens,
  consequences,
  buyerEmail,
  keepLabel,
  confirmLabel,
  pendingLabel,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  /** orderId, actionId, expectedSeq. */
  readonly hidden: Readonly<Record<string, string>>;
  readonly legend: string;
  readonly reasons: readonly AdminCancelReasonOption[];
  readonly noteLabel: string;
  readonly noteOptionalLabel: string;
  readonly noteHint: string;
  /** "{count} / {max}". */
  readonly noteCountTemplate: string;
  readonly noteMax: number;
  readonly noteRequired: string;
  readonly whatHappens: string;
  /** The consequence lines before the buyer email line. */
  readonly consequences: readonly string[];
  readonly buyerEmail: string;
  readonly keepLabel: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
}): ReactElement {
  const [reason, setReason] = useState(reasons[0]?.value ?? "");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const base = useId();
  const noteId = `${base}-note`;
  const hintId = `${base}-hint`;
  const errorId = `${base}-error`;
  const chosen = reasons.find((option) => option.value === reason);
  const needsNote = reason === "other";
  const missing = needsNote && note.trim() === "";
  const count = noteCountTemplate
    .replace("{count}", String(note.length))
    .replace("{max}", String(noteMax));

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (missing) {
          event.preventDefault();
          setTried(true);
        }
      }}
      className="grid gap-[14px]"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <fieldset className="grid min-w-0 gap-[4px]">
        <legend className="text-ink-3 mb-[4px] text-[12px] font-bold tracking-[0.08em] uppercase">
          {legend}
        </legend>
        <div className="bg-card grid overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--color-field-edge)]">
          {reasons.map((option) => {
            const on = option.value === reason;
            return (
              <label
                key={option.value}
                className={`border-rule flex min-h-[36px] cursor-pointer items-center gap-[10px] border-b px-[12px] text-[14px] last:border-b-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-3px] ${
                  on ? "bg-sage-wash font-bold" : ""
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={option.value}
                  checked={on}
                  onChange={() => setReason(option.value)}
                  className="accent-selected size-[16px] flex-none"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid min-w-0 gap-[4px]">
        <label
          htmlFor={noteId}
          className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase"
        >
          {noteLabel}
          {needsNote ? null : (
            <span className="font-normal tracking-normal normal-case">
              {" "}
              {noteOptionalLabel}
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
          aria-describedby={tried && missing ? `${hintId} ${errorId}` : hintId}
          aria-invalid={tried && missing}
          required={needsNote}
          className={`bg-card text-ink min-h-[76px] w-full rounded-[8px] border-[1.5px] px-[10px] py-[8px] text-[14px] ${
            tried && missing
              ? "border-danger shadow-[inset_0_0_0_1px_var(--color-danger)]"
              : "border-field-edge"
          }`}
        />
        <div className="flex items-baseline justify-between gap-[12px]">
          <p id={hintId} className="text-ink-3 text-[13px] leading-[1.4]">
            {noteHint}
          </p>
          <span className="text-ink-3 text-[12px] tabular-nums">{count}</span>
        </div>
        {tried && missing ? (
          <p id={errorId} className="text-danger text-[13px] font-bold">
            {noteRequired}
          </p>
        ) : null}
      </div>
      <div className="bg-paper-2 grid gap-[6px] rounded-[10px] px-[14px] py-[12px] text-[14px] leading-[1.45] shadow-[inset_0_0_0_1px_var(--color-rule)]">
        <span className="text-ink-3 text-[12px] font-bold tracking-[0.08em] uppercase">
          {whatHappens}
        </span>
        <ul className="grid gap-[4px]">
          {[...consequences, null].map((line, index) => (
            <li
              key={line ?? `buyer-${String(index)}`}
              className="before:text-ink-3 flex gap-[8px] before:flex-none before:font-bold before:content-['·']"
            >
              {line === null ? (
                <span>
                  {buyerEmail} <q className="italic">{chosen?.buyerSentence}</q>
                </span>
              ) : (
                <span>{line}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap justify-end gap-[8px]">
        <button
          type="button"
          onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          className={adminButtonClass("ghost")}
        >
          {keepLabel}
        </button>
        <AdminPendingSubmit
          tone="dangerFill"
          label={confirmLabel}
          pendingLabel={pendingLabel}
        />
      </div>
    </form>
  );
}
