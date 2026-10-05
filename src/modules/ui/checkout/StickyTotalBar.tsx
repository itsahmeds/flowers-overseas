/**
 * `StickyTotalBar` — the phone's bar with the total and the step's primary action (spec 010 §5.3
 * "mobile sticky bar with the total and the step's primary action"; **AC-39** component half;
 * `docs/design/wireframes/checkout-mobile.dc.html` `.dock`, `.s10-bar`; TASK-201).
 *
 * Fixed to the bottom of the viewport below `lg`, hidden from `lg` up, where the summary panel sits
 * beside the form and carries the same figure. It renders a spacer of its own height in the flow,
 * so the bar never covers the last field or the footer. The bottom padding adds the device's safe
 * area, so the action clears the home indicator.
 *
 * The total comes through `formatMoney` from the quote's `Money`, the same value the panel shows.
 * It is not a live region: the panel's total is the page's one (`OrderSummaryPanel`), so a price
 * change is announced once. `action` is the step's submit, usually a `SubmitButton` with
 * `form={stepFormId}` because the bar sits outside the step's `<form>`; a state with no action
 * (the daily cap) passes none.
 */
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import { MONEY_FIGURE } from "./styles.ts";

export interface StickyTotalBarProps {
  readonly locale: LocaleCode;
  /** "You pay". */
  readonly totalLabel: string;
  readonly total: Money;
  /** The step's primary action. */
  readonly action?: ReactNode;
}

export function StickyTotalBar({
  locale,
  totalLabel,
  total,
  action,
}: StickyTotalBarProps): ReactElement {
  return (
    <>
      <div aria-hidden="true" className="h-[76px] lg:hidden" />
      <div
        className="bg-card/96 border-rule shadow-sticky fixed start-0 end-0 bottom-0 z-40 flex min-h-[76px] items-center gap-[12px] border-t border-solid px-(--gutter-s) pt-[10px] pb-[calc(14px+env(safe-area-inset-bottom))] lg:hidden"
        data-fo-sticky-total=""
      >
        <p className="m-0 grid leading-[1.15]">
          <small className="text-ink-3 text-xs">{totalLabel}</small>
          <strong className={`${MONEY_FIGURE} text-md`}>
            {formatMoney(total, locale)}
          </strong>
        </p>
        {action === undefined ? null : (
          <div className="ms-auto flex max-w-[260px] flex-1 [&>*]:w-full">
            {action}
          </div>
        )}
      </div>
    </>
  );
}
