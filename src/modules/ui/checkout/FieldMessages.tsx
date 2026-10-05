/**
 * The messages under a checkout field: hint, warning and error, each with a stable id, and the
 * `aria-describedby` list that ties them to the control (spec 010 §5.3 "Accessibility", AC-14;
 * `docs/design/wireframes/checkout-desktop.dc.html` "errors" state; TASK-201).
 *
 * **The error element is always rendered**, hidden while empty, so the on-blur island
 * (`BlurValidation.tsx`) has a place to write a message into without the server drawing one, and
 * so `aria-describedby` never names an id that is missing from the document. An error is text
 * after a "!" mark and a warning text after an "i" mark: neither is conveyed by colour alone
 * (AC-14), and both marks are CSS `content` glyphs (`styles.ts`), which forced-colours mode keeps.
 *
 * `data-fo-error="server"` marks a message the server wrote. The island leaves those alone: it
 * cannot know whether a phone the server refused has become valid, so only the next submit
 * clears them.
 */
import type { ReactElement, ReactNode } from "react";

import {
  FIELD_ERROR,
  FIELD_ERROR_MARK,
  FIELD_HINT,
  FIELD_WARNING,
  FIELD_WARNING_MARK,
} from "./styles.ts";

/** The ids a field's messages carry, derived from the control's id. */
export function fieldMessageIds(id: string): {
  readonly hint: string;
  readonly warning: string;
  readonly error: string;
} {
  return { hint: `${id}-hint`, warning: `${id}-warning`, error: `${id}-error` };
}

export interface FieldMessageContent {
  /** Help shown under the control (`recipient.phoneReason` (checkout catalogue)). */
  readonly hint?: ReactNode;
  /** A non-blocking caution (`recipient.phoneNonLocal` (checkout catalogue)). */
  readonly warning?: ReactNode;
  /** The server's message for this field after a submit, already translated. */
  readonly error?: ReactNode;
}

/**
 * The `aria-describedby` value: the error first, so a screen reader reads what to fix before the
 * help, then the warning, the hint and any extra id (the card counter).
 */
export function describedBy(
  id: string,
  content: FieldMessageContent,
  extra: readonly string[] = [],
): string {
  const ids = fieldMessageIds(id);
  return [
    ids.error,
    content.warning === undefined ? undefined : ids.warning,
    content.hint === undefined ? undefined : ids.hint,
    ...extra,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
}

/** The three message slots, in the board's order: hint, warning, error. */
export function FieldMessages({
  id,
  hint,
  warning,
  error,
}: FieldMessageContent & { readonly id: string }): ReactElement {
  const ids = fieldMessageIds(id);
  const hasError = error !== undefined;
  return (
    <>
      {hint === undefined ? null : (
        <p className={FIELD_HINT} id={ids.hint}>
          {hint}
        </p>
      )}
      {warning === undefined ? null : (
        <p className={FIELD_WARNING} id={ids.warning}>
          <span aria-hidden="true" className={FIELD_WARNING_MARK} />
          <span>{warning}</span>
        </p>
      )}
      <p
        className={`${FIELD_ERROR} [&[hidden]]:hidden`}
        data-fo-error={hasError ? "server" : "client"}
        hidden={!hasError}
        id={ids.error}
      >
        <span aria-hidden="true" className={FIELD_ERROR_MARK} />
        <span data-fo-error-text="">{error}</span>
      </p>
    </>
  );
}
