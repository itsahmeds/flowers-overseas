/**
 * `BasketSummary`: the basket's one total and its way on (spec 010 §14 A-founder-2026-10-22 item
 * 6, D5, AC-57, AC-79; `docs/design/system/components.dc.html` "BasketSummary";
 * `wireframes/basket-*` `.recap.plain.bk-sum`; TASK-349).
 *
 * "Your order", then the total in an `aria-live="polite"` region (after a Remove the new total is
 * announced once; nothing else on the page is live), the inclusion sentence in the included green,
 * **Check out** (a link to the checkout, the full-width send pill; on a phone the docked bar
 * carries it instead), **Continue shopping** and the fresh-flower promise.
 *
 * Price shown = price charged (D5): the total is the integer sum of the available lines' amounts,
 * computed by the caller and formatted here by `formatMoney`; nothing is added to it. Copy
 * arrives as props.
 */
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import { MONEY_FIGURE, buttonClass } from "../checkout/styles.ts";

export interface BasketSummaryProps {
  readonly locale: LocaleCode;
  readonly id?: string;
  /** "Your order". */
  readonly title: string;
  /** "Total". */
  readonly totalLabel: string;
  readonly total: Money;
  /** "Each price includes VAT and delivery to its address." */
  readonly included: string;
  readonly checkout: { readonly href: string; readonly label: string };
  readonly continueShopping: { readonly href: string; readonly label: string };
  /** The fresh-flower promise line, with its link when the guarantee page exists. */
  readonly promise?: ReactNode;
}

/** `.link`: bold, link ink, underlined 1.5 px at 5 px. */
const TEXT_LINK =
  "inline-flex min-h-(--target-min) items-center font-bold text-link underline decoration-[1.5px] underline-offset-[5px] hover:text-link-strong";

export function BasketSummary({
  locale,
  id = "basket-summary",
  title,
  totalLabel,
  total,
  included,
  checkout,
  continueShopping,
  promise,
}: BasketSummaryProps): ReactElement {
  const titleId = `${id}-title`;
  return (
    <aside
      aria-labelledby={titleId}
      className="bg-card rounded-field relative bg-[repeating-linear-gradient(to_bottom,transparent_0_39px,var(--color-paper-2)_39px_40px)] px-[26px] pt-[34px] pb-[26px] shadow-md"
      data-fo-basket-summary=""
      id={id}
    >
      <h2 className="display text-ink m-0 text-lg lg:text-xl" id={titleId}>
        {title}
      </h2>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="border-rule mt-[18px] flex items-baseline justify-between gap-[16px] border-t border-solid pt-[14px]"
        data-fo-basket-total=""
      >
        <span className="font-bold">{totalLabel}</span>
        <strong className={`${MONEY_FIGURE} text-[32px]`}>
          {formatMoney(total, locale)}
        </strong>
      </div>
      <p className="text-included mt-[8px] mb-0 text-sm font-bold">
        {included}
      </p>
      <a
        className={buttonClass("primary", "send", "mt-[20px] max-lg:hidden")}
        data-fo-basket-checkout=""
        href={checkout.href}
      >
        {checkout.label}
      </a>
      <p className="mt-[8px] mb-0 flex justify-center">
        <a className={TEXT_LINK} href={continueShopping.href}>
          {continueShopping.label}
        </a>
      </p>
      {promise === undefined ? null : (
        <p className="border-rule text-ink-2 mt-[16px] mb-0 border-t border-solid pt-[14px] text-sm">
          {promise}
        </p>
      )}
    </aside>
  );
}
