/**
 * `TextAreaWithCounter` — the card message with its counter and the printed-card preview (spec
 * 010 §5.3 Step 2: "Card counter and preview: one small island; without JS the server counts on
 * submit"; §13 Q9; `docs/design/wireframes/checkout-desktop.dc.html` step 2, `.s10-cardrow`,
 * `.s10-count`, `.s10-print`; TASK-201).
 *
 * The server draws everything: the `<textarea>` with the kept value, the counter for that value
 * (counted in graphemes by the caller through `countGraphemes`, the server's own rule), and the
 * preview with the message and the signature, each inside `<bdi>`. With JavaScript on,
 * `CardCounter` (the island) keeps the counter and the preview in step as the buyer types; it
 * makes no network request and stores nothing.
 *
 * **The preview is the product page's** (spec 042 §5.3.2, AC-11, §13 Q4 (a); motion 15; TASK-308):
 * `PrintedCardPreview`, the one card component, with the words and the signature in Caveat and
 * `card.preview` as its caption. Checkout gives it no sample, so an empty card shows the mark and
 * the caption only and nothing fades. Field and card side by side from `md` (`1fr` and 200 px); on
 * the phone the card sits above the field, so the keyboard never hides it.
 *
 * The counter is `counterTemplate` with `{count}` left in it ("{count} of 200 characters"): the
 * caller formats the limit and the island only substitutes the live count, so no message
 * catalogue and no `Intl` reaches the browser.
 */
import type { ReactElement, ReactNode } from "react";

import { PrintedCardPreview } from "../product/PrintedCardPreview.tsx";

import { CardCounter } from "./CardCounter.tsx";
import { COUNT_SLOT, isOverLimit } from "./counter-slot.ts";
import {
  type FieldMessageContent,
  FieldMessages,
  describedBy,
  hasFieldError,
} from "./FieldMessages.tsx";
import { FIELD, FIELD_LABEL, FIELD_OPTIONAL, INPUT } from "./styles.ts";

export interface CardPreviewContent {
  /** "Preview of the printed card" (the figure's accessible name). */
  readonly label: string;
  /** "Printed on our card · included" (`card.preview` (checkout catalogue)). */
  readonly printed: string;
  /** The signature the preview shows under the message ("Love, Anna"). */
  readonly signature?: string;
  /** The id of the "sign as" input the preview mirrors, when it is on the page. */
  readonly signatureFieldId?: string;
}

export interface TextAreaWithCounterProps extends FieldMessageContent {
  readonly id: string;
  readonly name: string;
  readonly label: ReactNode;
  readonly optionalLabel?: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
  /** The limit in graphemes (`CHECKOUT_LIMITS.cardMessage`, 200). */
  readonly max: number;
  /** The server's grapheme count of `defaultValue`. */
  readonly count: number;
  /** The counter with `{count}` unfilled and the limit formatted ("{count} of 200 characters"). */
  readonly counterTemplate: string;
  /** The count, formatted for the locale, as the server renders it. */
  readonly formattedCount: string;
  readonly rows?: number;
  /** The printed-card preview beside the field; absent for a plain text area. */
  readonly preview?: CardPreviewContent;
}

export function TextAreaWithCounter({
  id,
  name,
  label,
  optionalLabel,
  required = false,
  defaultValue = "",
  max,
  count,
  counterTemplate,
  formattedCount,
  rows = 4,
  preview,
  hint,
  warning,
  error,
}: TextAreaWithCounterProps): ReactElement {
  const messages = { hint, warning, error };
  const counterId = `${id}-count`;
  const over = isOverLimit(count, max);
  return (
    <div className={FIELD} data-fo-field={id}>
      <label className={FIELD_LABEL} htmlFor={id}>
        {label}
        {required || optionalLabel === undefined ? null : (
          <>
            {" "}
            <span className={FIELD_OPTIONAL}>{optionalLabel}</span>
          </>
        )}
      </label>
      <div
        className={
          preview === undefined
            ? "grid gap-[6px]"
            : "grid items-start gap-[12px] md:grid-cols-[minmax(0,1fr)_200px] md:gap-[20px]"
        }
      >
        <div className="grid gap-[6px]">
          <textarea
            aria-describedby={describedBy(id, messages, [counterId])}
            aria-invalid={hasFieldError(error) ? true : undefined}
            className={`${INPUT} min-h-[96px] resize-y py-[12px] leading-[1.45]`}
            defaultValue={defaultValue}
            dir="auto"
            id={id}
            name={name}
            required={required}
            rows={rows}
          />
          <p
            className="text-ink-3 data-[over=true]:text-danger m-0 justify-self-end text-xs [font-variant-numeric:tabular-nums] data-[over=true]:font-bold"
            data-over={over}
            id={counterId}
          >
            {counterTemplate.replace(COUNT_SLOT, formattedCount)}
          </p>
        </div>
        {preview === undefined ? null : (
          <PrintedCardPreview
            caption={preview.printed}
            className="max-md:order-first"
            label={preview.label}
            message={defaultValue}
            messageFieldId={id}
            {...(preview.signature === undefined
              ? {}
              : { signature: preview.signature })}
            {...(preview.signatureFieldId === undefined
              ? {}
              : { signatureFieldId: preview.signatureFieldId })}
          />
        )}
      </div>
      <FieldMessages id={id} {...messages} />
      <CardCounter
        counterId={counterId}
        fieldId={id}
        max={max}
        template={counterTemplate}
        {...(preview?.signatureFieldId === undefined
          ? {}
          : { mirrorIds: [preview.signatureFieldId] })}
      />
    </div>
  );
}
