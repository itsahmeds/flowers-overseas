/**
 * What the on-blur island does to one field (spec 010 §5.3 "Form quality": "validation on submit
 * always and on blur when the island is present", "values are never cleared on error"; AC-14;
 * TASK-201).
 *
 * A plain module, so the logic is unit-testable without a DOM and the island file is only the
 * wiring. It reads the browser's own constraint validation (`required`, `pattern`, `type`), which
 * the server-rendered control already carries, and shows the message the caller put on the
 * control's `data-fo-msg-*` attributes. So the browser bundle holds no schema, no copy and no
 * zod; the server's schema stays the only judge, on every submit.
 *
 * Three rules keep it honest:
 *
 *  - **Only a field the buyer has edited** (`data-fo-dirty`, set on its first `input`) is
 *    checked: tabbing through an empty form raises nothing.
 *  - **A server message stays** (`data-fo-error="server"`): the island cannot re-check a phone
 *    or a postcode the server refused, so only the next submit clears it.
 *  - **The value is never touched.**
 */

/** The `validity` fields the island reads. */
export interface ValidityLike {
  readonly valueMissing: boolean;
  readonly patternMismatch: boolean;
  readonly typeMismatch: boolean;
}

export type FieldProblem = "required" | "format";

/** Which message a control's validity calls for, or `null` when it is valid. */
export function fieldProblem(validity: ValidityLike): FieldProblem | null {
  if (validity.valueMissing) return "required";
  if (validity.patternMismatch || validity.typeMismatch) return "format";
  return null;
}

/** The parts of a control the island touches. */
export interface ControlLike {
  readonly id: string;
  readonly dataset: DOMStringMap;
  readonly validity: ValidityLike;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/** The parts of the field's error element the island touches. */
export interface ErrorElementLike {
  hidden: boolean;
  readonly dataset: DOMStringMap;
  querySelector(selector: string): { textContent: string | null } | null;
}

export interface DocumentLike {
  getElementById(id: string): ErrorElementLike | null;
}

/**
 * Shows or hides the client message of one control after it lost focus. Returns the problem it
 * showed, or `null` when it showed none (valid, unedited, not opted in, or a server message).
 */
export function applyFieldState(
  control: ControlLike,
  doc: DocumentLike,
): FieldProblem | null {
  if (control.dataset.foValidate === undefined) return null;
  if (control.dataset.foDirty === undefined) return null;
  const error = doc.getElementById(`${control.id}-error`);
  if (error === null || error.dataset.foError === "server") return null;
  const text = error.querySelector("[data-fo-error-text]");
  const problem = fieldProblem(control.validity);
  const message =
    problem === null
      ? undefined
      : problem === "required"
        ? control.dataset.foMsgRequired
        : control.dataset.foMsgFormat;
  if (problem === null || message === undefined) {
    error.hidden = true;
    if (text !== null) text.textContent = "";
    control.removeAttribute("aria-invalid");
    return null;
  }
  if (text !== null) text.textContent = message;
  error.hidden = false;
  control.setAttribute("aria-invalid", "true");
  return problem;
}

/** Moves focus to the element with `id`; `false` when it is not on the page. */
export function focusTarget(
  doc: { getElementById(id: string): { focus(): void } | null },
  id: string,
): boolean {
  const target = doc.getElementById(id);
  if (target === null) return false;
  target.focus();
  return true;
}
