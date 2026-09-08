/**
 * `Price` (spec 004 §5.3's `aria-live` rule, `CLAUDE.md` "`Intl` for all formatting",
 * `fo/no-adhoc-intl`; TASK-045).
 *
 * **It takes an already-formatted string and never formats one.** `formatMoney()` in
 * `src/modules/i18n/format.ts` is the only place in the repository allowed to call
 * `Intl.NumberFormat` (spec 003 AC-21, enforced by `fo/no-adhoc-intl`), and money is minor units
 * plus a currency code until that function turns it into text. So this component's whole job is
 * typography and announcement:
 *
 *  - `font-variant-numeric: tabular-nums`, so a price that changes does not shift the layout it
 *    sits in;
 *  - `aria-live="polite"` when the price can change after render (§5.3: "`aria-live` for price and
 *    date changes"), off by default because a static price on a card must not be announced;
 *  - the price shown is the price charged, VAT and delivery included (`CLAUDE.md`) — a rule about
 *    what the *caller* passes, restated here because this is where a reviewer will look for it.
 */
import type { ReactElement } from "react";

export const PRICE_SIZES = ["display", "lg", "md", "sm"] as const;
export type PriceSize = (typeof PRICE_SIZES)[number];

const SIZE_CLASS: Readonly<Record<PriceSize, string>> = {
  display: "text-2xl display",
  lg: "text-lg",
  md: "text-md",
  sm: "text-sm",
};

export interface PriceProps {
  /**
   * The formatted amount, from `formatMoney(locale, currency, minorUnits)`. A raw number is not
   * accepted, by type: `string` is the contract.
   */
  readonly value: string;
  readonly size?: PriceSize;
  /** Announce changes politely. Set only where the value can change without a navigation. */
  readonly live?: boolean;
  readonly className?: string;
}

export function Price({
  value,
  size = "md",
  live = false,
  className,
}: PriceProps): ReactElement {
  return (
    <span
      className={["tabular-nums", SIZE_CLASS[size], className]
        .filter(Boolean)
        .join(" ")}
      {...(live ? { "aria-live": "polite" as const } : {})}
    >
      {value}
    </span>
  );
}
