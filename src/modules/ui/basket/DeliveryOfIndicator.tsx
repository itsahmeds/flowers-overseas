/**
 * `DeliveryOfIndicator`: which delivery of the basket a checkout screen is about (spec 010 §14
 * A-founder-2026-10-22 item 5, AC-58; `docs/design/system/components.dc.html`
 * "DeliveryOfIndicator", `.dl-of`; TASK-349 builds it, TASK-204 mounts it on steps 1 and 2).
 *
 * A 40 px thumbnail, then "Delivery {n} of {total}" in the eyebrow voice and the line's product,
 * size and destination. Rendered only for a basket of two or more lines: a one-line basket's
 * screens are exactly AC-7's. Copy arrives as props, already composed and formatted.
 */
import type { ReactElement, ReactNode } from "react";

export interface DeliveryOfIndicatorProps {
  /** "Delivery 1 of 3". */
  readonly label: string;
  /** "Amber Hour · 18 stems · To Poland". */
  readonly summary: string;
  /** The photograph (`MediaAsset`), or nothing for the token placeholder. */
  readonly image?: ReactNode;
}

export function DeliveryOfIndicator({
  label,
  summary,
  image,
}: DeliveryOfIndicatorProps): ReactElement {
  return (
    <div
      className="rounded-field bg-paper-2 flex items-center gap-[14px] px-[14px] py-[10px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
      data-fo-delivery-of=""
    >
      <div className="bg-paper-3 aspect-[4/5] w-[40px] flex-none overflow-hidden rounded-[8px] [&_img]:size-full [&_img]:object-cover">
        {image}
      </div>
      <div className="min-w-0">
        <b className="eyebrow block">{label}</b>
        <span className="text-ink text-ui block">
          <bdi>{summary}</bdi>
        </span>
      </div>
    </div>
  );
}
