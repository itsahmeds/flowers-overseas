/**
 * `OrderSummaryPanel` and `OrderSummaryMini` — "Your order" beside every step (spec 010 §5.3
 * "Order summary panel: desktop side panel · mobile sticky bar"; §8 "Price display"; AC-15's
 * render half belongs to TASK-206; `docs/design/wireframes/checkout-{desktop,mobile}.dc.html`
 * `.recap.plain`, `.rsum`, `.s10-lines`, `.s10-cur`, `.s10-mini`; TASK-201).
 *
 * **Price shown = price charged.** The panel computes nothing: every amount is a `Money` from the
 * draft's quote, formatted here by `formatMoney` and nowhere else, and the total is the quote's
 * total, not a sum of the lines. Every line is visible from step 1 (§8); delivery and VAT read
 * "included" where they are inside the bouquet's price; step 3 adds the VAT split by rate
 * ("Of which VAT 8%") and the currency line. There is no approximate-equivalents line on any step
 * (004 §14 A21 clause 6(c), AC-18).
 *
 * **The total announces only when it changes** (§5.3 "Accessibility"): it sits in an
 * `aria-live="polite"`, `aria-atomic` region, and a re-render with the same amount writes the same
 * text, which a screen reader does not announce. This is the page's one live total: the sticky
 * bar repeats the figure without a live region, so a change is not announced twice.
 *
 * An `<aside>` labelled by its heading. Names inside it are `<bdi>`.
 */
import type { ReactElement, ReactNode } from "react";

import type { LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import { MONEY_FIGURE } from "./styles.ts";

/** A line's amount: a figure, or "included" in the bouquet's price. */
export type SummaryAmount =
  | { readonly kind: "money"; readonly money: Money }
  | { readonly kind: "included" };

export interface SummaryLine {
  readonly id: string;
  /** "18 stems", "Delivery", "VAT 8%", already translated and formatted. */
  readonly label: string;
  readonly amount: SummaryAmount;
}

export interface VatLine {
  readonly id: string;
  /** "Of which VAT 8%" (`checkout.summary.vatOf`, the rate through `formatPercentFromBasisPoints`). */
  readonly label: string;
  readonly money: Money;
}

export interface OrderSummaryItem {
  /** The product's name. */
  readonly name: string;
  /** "18 stems", "Thu 8 Oct · Warszawa": already formatted. */
  readonly details: readonly string[];
  /** The product photograph (`MediaAsset`), when the page has one. */
  readonly image?: ReactNode;
}

export interface OrderSummaryPanelProps {
  readonly locale: LocaleCode;
  readonly id?: string;
  /** "Your order". */
  readonly title: string;
  /** "You pay". */
  readonly totalLabel: string;
  /** "included". */
  readonly includedLabel: string;
  readonly item: OrderSummaryItem;
  /** Step 2 onwards: the card as it will be printed. */
  readonly card?: { readonly message: string; readonly signature?: string };
  readonly lines: readonly SummaryLine[];
  /** The quote's all-in total. */
  readonly total: Money;
  /** Step 3: the VAT inside the total, by rate. */
  readonly vatLines?: readonly VatLine[];
  /** Step 3: "You pay in GBP. Our florist is paid in złoty." */
  readonly currencyLine?: string;
  /** Step 3: the place control, or the daily-cap notice in its place. */
  readonly action?: ReactNode;
  /** The fresh-flower promise line and its link. */
  readonly footer?: ReactNode;
}

function amountText(
  amount: SummaryAmount,
  locale: LocaleCode,
  includedLabel: string,
): string {
  return amount.kind === "money"
    ? formatMoney(amount.money, locale)
    : includedLabel;
}

export function OrderSummaryPanel({
  locale,
  id = "order-summary",
  title,
  totalLabel,
  includedLabel,
  item,
  card,
  lines,
  total,
  vatLines = [],
  currencyLine,
  action,
  footer,
}: OrderSummaryPanelProps): ReactElement {
  const titleId = `${id}-title`;
  return (
    <aside
      aria-labelledby={titleId}
      className="bg-card rounded-field relative bg-[repeating-linear-gradient(to_bottom,transparent_0_39px,var(--color-paper-2)_39px_40px)] px-[26px] pt-[34px] pb-[26px] shadow-md"
      data-fo-order-summary=""
      id={id}
    >
      <h2 className="text-ink m-0 text-xl" id={titleId}>
        {title}
      </h2>
      <div className="mt-[18px] grid grid-cols-[84px_minmax(0,1fr)] items-start gap-[16px]">
        <div className="bg-photo aspect-[4/5] w-[84px] overflow-hidden rounded-[12px]">
          {item.image}
        </div>
        <div>
          <b className="font-display text-md block font-(--font-weight-display)">
            <bdi>{item.name}</bdi>
          </b>
          {item.details.map((detail) => (
            <span className="text-ink-2 block text-sm" key={detail}>
              {detail}
            </span>
          ))}
        </div>
      </div>
      {card === undefined || card.message === "" ? null : (
        <p className="font-display bg-paper text-ink-2 rounded-letter mt-[16px] mb-0 px-[16px] py-[12px] font-(--font-weight-display-em) italic">
          <bdi>{card.message}</bdi>
          {card.signature === undefined || card.signature === "" ? null : (
            <>
              {" "}
              <bdi>{card.signature}</bdi>
            </>
          )}
        </p>
      )}
      <dl className="mt-[18px] mb-0 grid gap-[8px]">
        {lines.map((line) => (
          <div
            className="text-ui flex justify-between gap-[16px]"
            data-fo-line={line.id}
            key={line.id}
          >
            <dt className="text-ink-2">{line.label}</dt>
            <dd
              className={
                line.amount.kind === "included"
                  ? "text-included m-0 font-bold"
                  : "m-0 [font-variant-numeric:tabular-nums]"
              }
            >
              {amountText(line.amount, locale, includedLabel)}
            </dd>
          </div>
        ))}
      </dl>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="border-ink/18 mt-[14px] flex items-baseline justify-between gap-[16px] border-t border-solid pt-[14px]"
        data-fo-total=""
      >
        <span className="font-bold">{totalLabel}</span>
        <strong className={`${MONEY_FIGURE} text-[32px]`}>
          {formatMoney(total, locale)}
        </strong>
      </div>
      {vatLines.length === 0 ? null : (
        <dl className="mt-[12px] mb-0 grid gap-[8px]">
          {vatLines.map((line) => (
            <div
              className="text-ink-3 flex justify-between gap-[16px] text-sm"
              data-fo-vat={line.id}
              key={line.id}
            >
              <dt>{line.label}</dt>
              <dd className="m-0 [font-variant-numeric:tabular-nums]">
                {formatMoney(line.money, locale)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {currencyLine === undefined ? null : (
        <p
          className="text-ink-2 mt-[12px] mb-0 text-sm"
          data-fo-currency-line=""
        >
          {currencyLine}
        </p>
      )}
      {action === undefined ? null : (
        <div className="mt-[12px] grid gap-[10px]">{action}</div>
      )}
      {footer === undefined ? null : (
        <p className="text-ink-2 mt-[14px] mb-0 text-sm leading-[1.35]">
          {footer}
        </p>
      )}
    </aside>
  );
}

export interface OrderSummaryMiniProps {
  readonly locale: LocaleCode;
  /** "Your order · Amber Hour", already composed. */
  readonly label: string;
  readonly total: Money;
}

/**
 * The phone's one-line recap above the form (`.s10-mini`). Below `lg` only: on a desktop the
 * panel is beside the form.
 */
export function OrderSummaryMini({
  locale,
  label,
  total,
}: OrderSummaryMiniProps): ReactElement {
  return (
    <p className="bg-card text-ui rounded-field mb-[14px] flex min-h-(--target-min) items-center justify-between gap-[12px] px-[14px] py-[10px] font-bold shadow-[inset_0_0_0_1px_var(--color-rule)] lg:hidden">
      <span>{label}</span>
      <span className="[font-variant-numeric:tabular-nums]">
        {formatMoney(total, locale)}
      </span>
    </p>
  );
}
