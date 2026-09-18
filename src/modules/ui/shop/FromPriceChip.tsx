/**
 * `FromPriceChip` — the **only** place a "from" price is allowed (spec 008 §2 "Why the card shows
 * a price and not a 'from' price", §5.3, spec 005 §14 A3; TASK-108;
 * `docs/design/system/components.dc.html`, "From-price chip": default, stale FX, no destination).
 *
 * A product card shows the price of one real, purchasable configuration — the default tier — so
 * *price shown = price charged* holds with no qualifier. A **category tile** stands for a set, so
 * the lowest default-tier price inside it is labelled a from-price through `catalog.price.from`.
 * Both are payable numbers and neither emits an `Offer` (§13 Q5).
 *
 * **Stale FX** (spec 005 §14 A3): when the projection falls back to the destination's own currency
 * the chip says which currency it is quoting, in the sentence spec 005 already ships
 * (`catalog.availability.fxUnavailable`). The price is never silently converted.
 *
 * **No destination, no chip**: a destination-less hub quotes no money at all (§2, 005 §13 Q10), so
 * a tile with no `fromPrice` renders **nothing** — absent rather than empty (the drawing's third
 * state).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { type LocaleCode } from "@/config/locales";
import { type Money, formatMoney } from "@/modules/i18n";

import { Text } from "../primitives/typography.tsx";

export interface FromPriceChipProps {
  /** The lowest default-tier price in the set. Absent on a hub, where no money may be shown. */
  readonly price?: Money | undefined;
  readonly locale: LocaleCode;
  /**
   * The projection fell back to the destination's own currency because the FX snapshot is older
   * than spec 005's ceiling. The chip then carries the sentence that says so.
   */
  readonly fxFallback?: boolean;
}

export function FromPriceChip({
  price,
  locale,
  fxFallback = false,
}: FromPriceChipProps): ReactElement | null {
  const catalog = useTranslations("catalog");
  if (price === undefined) return null;

  const amount = (
    <Text as="span" size="md" className="font-semibold tabular-nums">
      <bdi>{catalog("price.from", { price: formatMoney(price, locale) })}</bdi>
    </Text>
  );

  if (!fxFallback) return <span data-fo-from-price>{amount}</span>;

  return (
    <span className="gap-xs flex flex-col" data-fo-from-price="fx-fallback">
      {amount}
      <Text as="span" size="xs" tone="muted">
        {catalog("availability.fxUnavailable")}
      </Text>
    </span>
  );
}
