/**
 * `ErrorSummary` — the list of what to fix, which takes focus (spec 010 §5.3 "Accessibility",
 * **AC-14** component half, T-14; `docs/design/wireframes/checkout-desktop.dc.html` "errors"
 * state, `.s10-errsum`; TASK-201).
 *
 * AC-14 in this component:
 *
 *  - **It receives focus.** `tabIndex={-1}` makes it focusable without adding it to the tab order;
 *    the server-rendered `autofocus` focuses it on a full page load (JavaScript off), and
 *    `FocusOnMount` focuses it when a server action re-renders the step (JavaScript on).
 *  - **It links to each field.** Every item is an `<a href="#{fieldId}">`, so following it moves
 *    to the input that needs fixing.
 *  - **Not by colour alone.** It is a titled list of sentences ("Street and number: …"), with a
 *    2 px danger ring as decoration only.
 *
 * The field's own message, tied by `aria-describedby`, is `FieldMessages`; the kept values are
 * the fields' `defaultValue`. `role="alert"` makes a screen reader announce the list as it lands.
 */
import type { ReactElement } from "react";

import { FocusOnMount } from "./FocusOnMount.tsx";

export interface ErrorSummaryItem {
  /** The id of the control to fix: the link's target. */
  readonly fieldId: string;
  /** "Street and number: …", already translated (`checkout.error.summaryItem`). */
  readonly text: string;
}

export interface ErrorSummaryProps {
  /** `checkout.error.summaryTitle`. */
  readonly title: string;
  readonly items: readonly ErrorSummaryItem[];
  readonly id?: string;
  /**
   * `false` only in the gallery's static state, where a page of fifty components must not jump
   * to this one on load. The live gallery state and every checkout step keep the default.
   */
  readonly focusOnMount?: boolean;
}

export function ErrorSummary({
  title,
  items,
  id = "error-summary",
  focusOnMount = true,
}: ErrorSummaryProps): ReactElement | null {
  if (items.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <div
      aria-labelledby={titleId}
      autoFocus={focusOnMount}
      className="bg-card outline-focus rounded-field grid gap-[8px] px-[18px] py-[16px] shadow-[inset_0_0_0_2px_var(--color-danger)] focus:outline-[2.5px] focus:outline-offset-[3px] focus:outline-solid"
      id={id}
      role="alert"
      tabIndex={-1}
    >
      <h2 className="text-h3 text-ink m-0" id={titleId}>
        {title}
      </h2>
      <ul className="m-0 grid list-none gap-[4px] p-0">
        {items.map((item) => (
          <li key={item.fieldId}>
            <a
              className="text-danger inline-flex min-h-(--target-min) items-center font-bold underline underline-offset-4"
              href={`#${item.fieldId}`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
      {focusOnMount ? <FocusOnMount targetId={id} /> : null}
    </div>
  );
}
