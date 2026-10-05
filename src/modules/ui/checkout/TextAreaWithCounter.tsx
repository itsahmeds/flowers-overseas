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
 * The counter is `counterTemplate` with `{count}` left in it ("{count} of 200 characters"): the
 * caller formats the limit and the island only substitutes the live count, so no message
 * catalogue and no `Intl` reaches the browser.
 */
import type { ReactElement, ReactNode } from "react";

import { CardCounter } from "./CardCounter.tsx";
import { COUNT_SLOT } from "./counter-slot.ts";
import {
  type FieldMessageContent,
  FieldMessages,
  describedBy,
} from "./FieldMessages.tsx";
import { FIELD, FIELD_LABEL, FIELD_OPTIONAL, INPUT } from "./styles.ts";

export interface CardPreviewContent {
  /** "Preview of the printed card" (the figure's accessible name). */
  readonly label: string;
  /** "Printed on our card · included" (`checkout.card.preview`). */
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
  const over = count > max;
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
            aria-invalid={error === undefined ? undefined : true}
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
          <figure
            aria-label={preview.label}
            className="bg-card m-0 grid gap-[10px] rounded-md px-[18px] pt-[18px] pb-[16px] shadow-[var(--shadow-sm),inset_0_0_0_1px_var(--color-rule)]"
          >
            <p className="font-display text-ink m-0 text-[17px] leading-[1.35] font-(--font-weight-display) break-words whitespace-pre-line">
              <bdi data-fo-mirror={id}>{defaultValue}</bdi>
              {preview.signatureFieldId === undefined &&
              preview.signature === undefined ? null : (
                <>
                  <br />
                  <bdi data-fo-mirror={preview.signatureFieldId}>
                    {preview.signature}
                  </bdi>
                </>
              )}
            </p>
            <figcaption className="border-rule text-ink-3 border-t border-solid pt-[8px] text-xs">
              {preview.printed}
            </figcaption>
          </figure>
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
