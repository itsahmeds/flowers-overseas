/**
 * `DiscountCodeField` and `DiscountAmount`: step 4's "Add a discount code" control and the discount
 * line's amount (spec 047 §5.3 "Step 3, the code control", "Order summary panel", "Form quality";
 * §14 A-orchestrator-2026-10-25 item 1; AC-7, AC-10, AC-22, AC-27, AC-28; TASK-447;
 * `docs/design/wireframes/checkout-{desktop,mobile}.dc.html` `.gr-code`, `.gr-row`, `.gr-ok`,
 * `.gr-rm`, `.s10-lines .gr-red`; `system/components.dc.html` DiscountCodeField, DiscountLine).
 *
 * **No island.** A quiet `<details>`/`<summary>` link that opens one labelled field and "Apply",
 * inside a plain `<form>` posting to the checkout's one server action, so it opens and posts with
 * JavaScript off; "Remove" is its own form. The action answers with a 303 back to step 4 and the
 * state travels in the one-hop echo, so nothing here holds state.
 *
 * **States** (the board's band): closed (the default; a link, not an empty box, §13 Q3), refused
 * (open, the typed value kept, the field marked and the message linked by `aria-describedby`;
 * an unknown and a disabled code draw the same bytes, AC-10), locked (open, field and button
 * disabled, the wait message), applied (the confirmation and "Remove"; the field is gone).
 *
 * **Honest price display (AC-22).** Nothing here strikes anything through, and no percentage is
 * ever drawn: the line names the code and the amount taken off, the amount through `formatMoney`
 * as a negative figure. Every text arrives translated; the code sits inside `<bdi dir="ltr">`.
 */
import { Fragment, type ReactElement, type ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import type { CheckoutAction } from "./form-fields.ts";
import {
  FIELD,
  FIELD_ERROR,
  FIELD_ERROR_MARK,
  FIELD_LABEL,
  INPUT,
  buttonClass,
} from "./styles.ts";

/** What the control draws. */
export type DiscountFieldState =
  | { readonly kind: "closed" }
  | {
      readonly kind: "refused";
      /** What the buyer typed, kept. */
      readonly value: string;
      readonly message: string;
    }
  | {
      readonly kind: "locked";
      readonly value: string;
      readonly message: string;
    }
  | {
      readonly kind: "applied";
      /** "Code {code} applied. You save {amount}." or "One code per order. …", code in `<bdi>`. */
      readonly message: ReactNode;
    };

export interface DiscountCodeFieldProps {
  readonly action: CheckoutAction;
  readonly id?: string;
  readonly labels: {
    /** "Add a discount code". */
    readonly open: string;
    /** "Discount code". */
    readonly label: string;
    /** "Apply". */
    readonly apply: string;
    /** "Remove". */
    readonly remove: string;
  };
  /** The apply form's routing fields (locale, intent). */
  readonly applyFields: ReactNode;
  /** The remove form's routing fields. */
  readonly removeFields: ReactNode;
  readonly state: DiscountFieldState;
}

/** The marker a translated sentence carries where a code goes (no translation contains it). */
export function codeSlot(name: string): string {
  return `\u0000${name}\u0000`;
}

/**
 * A translated sentence with each `codeSlot(name)` replaced by that code inside
 * `<bdi dir="ltr">` (§7: the code text is locale-neutral and reads left to right in `/ar-XB`).
 */
export function withCodes(
  text: string,
  codes: Readonly<Record<string, string>>,
): ReactNode {
  const parts = text.split("\u0000");
  return parts.map((part, index) =>
    index % 2 === 1 && part in codes ? (
      <bdi data-fo-discount-code="" dir="ltr" key={`${part}-${String(index)}`}>
        {codes[part]}
      </bdi>
    ) : (
      <Fragment key={`t-${String(index)}`}>{part}</Fragment>
    ),
  );
}

export function DiscountCodeField({
  action,
  id = "co-discount",
  labels,
  applyFields,
  removeFields,
  state,
}: DiscountCodeFieldProps): ReactElement {
  if (state.kind === "applied") {
    return (
      <div
        className="mt-[6px] flex items-center justify-between gap-[12px]"
        data-fo-discount-control="applied"
        id={id}
      >
        <p
          className="text-ink m-0 flex items-baseline gap-[10px] text-sm leading-(--line-height-tight) before:h-[10px] before:w-[5px] before:flex-none before:translate-y-[-1px] before:rotate-45 before:border-e-2 before:border-b-2 before:border-solid before:border-(--color-included) before:content-['']"
          data-fo-discount-message="applied"
        >
          <span>{state.message}</span>
        </p>
        <form action={action} className="contents">
          {removeFields}
          <button
            className="text-link inline-flex min-h-(--target-min) flex-none cursor-pointer items-center border-0 bg-transparent p-0 text-sm underline underline-offset-4"
            type="submit"
          >
            {labels.remove}
          </button>
        </form>
      </div>
    );
  }
  const open = state.kind !== "closed";
  const inputId = `${id}-input`;
  const messageId = `${id}-message`;
  const locked = state.kind === "locked";
  return (
    <details
      className="group mt-[6px] grid gap-[10px]"
      data-fo-discount-control={state.kind}
      id={id}
      open={open}
    >
      <summary className="text-link text-ui inline-flex min-h-(--target-min) cursor-pointer list-none items-center gap-[10px] justify-self-start underline decoration-[1.5px] underline-offset-[5px] after:block after:size-[7px] after:translate-y-[-2px] after:rotate-45 after:border-e-[1.5px] after:border-b-[1.5px] after:border-solid after:border-current after:content-[''] group-open:after:translate-y-[2px] group-open:after:-rotate-[135deg] [&::-webkit-details-marker]:hidden">
        {labels.open}
      </summary>
      <form action={action} className={`${FIELD} mt-[10px]`} noValidate>
        {applyFields}
        <label className={`${FIELD_LABEL} text-sm`} htmlFor={inputId}>
          {labels.label}
        </label>
        <div className="flex items-stretch gap-[10px]">
          <input
            aria-describedby={open ? messageId : undefined}
            aria-invalid={state.kind === "refused" ? true : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            className={`${INPUT} min-h-(--target-min) min-w-0 flex-1 tracking-[0.06em]`}
            defaultValue={state.kind === "closed" ? undefined : state.value}
            disabled={locked}
            id={inputId}
            inputMode="text"
            maxLength={64}
            name="code"
            spellCheck={false}
            type="text"
          />
          <button
            className={buttonClass("ghost", "sm", "flex-none")}
            disabled={locked}
            type="submit"
          >
            {labels.apply}
          </button>
        </div>
        {state.kind === "closed" ? null : (
          <p
            className={FIELD_ERROR}
            data-fo-discount-message={state.kind}
            id={messageId}
            role="alert"
          >
            <span aria-hidden="true" className={FIELD_ERROR_MARK} />
            <span>{state.message}</span>
          </p>
        )}
      </form>
    </details>
  );
}

/** The discount line's amount: the amount taken off as a negative figure (`formatMoney`). */
export function discountAmountText(amount: Money, locale: LocaleCode): string {
  const minor = amount.amountMinor;
  return formatMoney(
    {
      amountMinor: typeof minor === "bigint" ? -minor : -minor,
      currency: amount.currency,
    },
    locale,
  );
}
