/**
 * `TierSelector` — which size, each at its own all-in price (spec 009 §2 "Tier selector", §5.3;
 * `docs/design/system/components.dc.html` "Tier selector"; TASK-126).
 *
 * One radio per `product_tier`, in the view model's `sort` order, each printing its stem-count
 * label (spec 005's `catalog.tier.stems` ICU plural, `catalog.tier.size.*` or `catalog.tier.single`
 * — **never an adjective**) and **its own** price, read from `TierOption.price` and formatted by
 * `formatMoney`. Nothing is computed here: the preselected tier is `selectedTierKey`, which is
 * `is_default` data unless the visitor chose another.
 *
 * A product with **one** tier renders it as text, not as a control: a radio group with one radio
 * cannot be operated and cannot be answered wrongly.
 *
 * The radios carry `name="tier"` so the page's `GET` form (TASK-128) submits them as `?tier=`.
 * The "selected" marker follows the checked radio through CSS (`has-[:checked]`) and is
 * `aria-hidden`, because the radio's own checked state is what a screen reader announces.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { TierOption } from "@/modules/catalog";
import { formatMoney } from "@/modules/i18n";

import { localeOf, messageFor } from "./labels.ts";
import { StepLegend } from "./StepLegend.tsx";

export interface TierSelectorProps {
  readonly tiers: readonly TierOption[];
  readonly selectedTierKey: string;
  readonly locale: string;
  /** The form field name; `tier` is `ProductSearchParamsSchema`'s (TASK-128). */
  readonly name?: string;
  /** The step number the v2 page draws in a cornflower ring beside the legend (decorative). */
  readonly step?: number;
}

/** A tier's own label: the ICU plural takes the stem count, the size and single keys take none. */
export function tierLabel(
  t: ReturnType<typeof useTranslations>,
  tier: TierOption,
): string {
  return messageFor(
    t,
    tier.labelKey,
    tier.stems === null ? undefined : { count: tier.stems },
  );
}

/** v2's tier chip: a card-white field with a hairline inset; checked is a 2 px cornflower inset. */
const TIER =
  "relative grid gap-[2px] rounded-field bg-card px-[14px] pt-[14px] pb-[12px] shadow-[inset_0_0_0_1.5px_var(--color-rule)]";
const TIER_CHECKED =
  "bg-surface shadow-[inset_0_0_0_2px_var(--color-selected)] after:absolute after:end-[12px] after:top-[12px] after:size-[10px] after:rounded-full after:bg-accent after:content-['']";

export function TierSelector({
  tiers,
  selectedTierKey,
  locale,
  name = "tier",
  step,
}: TierSelectorProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const code = localeOf(locale);
  const [only] = tiers;
  const legend = <StepLegend step={step}>{product("tier.legend")}</StepLegend>;

  if (tiers.length === 1 && only !== undefined) {
    return (
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        data-fo-tier-selector="single"
      >
        {legend}
        <p
          className={`${TIER} ${TIER_CHECKED} m-0 max-w-[180px]`}
          data-fo-tier={only.tierKey}
        >
          <b data-fo-tier-label>{tierLabel(t, only)}</b>
          <bdi className="text-ink-muted text-sm tabular-nums">
            {formatMoney(only.price, code)}
          </bdi>
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      data-fo-tier-selector="radios"
    >
      {legend}
      <div className="grid grid-cols-3 gap-[10px]">
        {tiers.map((tier) => (
          <label
            key={tier.tierKey}
            className={`${TIER} has-[:checked]:bg-surface has-[:focus-visible]:outline-focus after:bg-accent cursor-pointer after:absolute after:end-[12px] after:top-[12px] after:hidden after:size-[10px] after:rounded-full after:content-[''] hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-selected)] has-[:checked]:after:block has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2`}
            data-fo-tier={tier.tierKey}
          >
            <input
              className="sr-only"
              defaultChecked={tier.tierKey === selectedTierKey}
              name={name}
              type="radio"
              value={tier.tierKey}
            />
            <span className="font-bold" data-fo-tier-label>
              {tierLabel(t, tier)}
            </span>
            <bdi className="text-ink-muted text-sm tabular-nums">
              {formatMoney(tier.price, code)}
            </bdi>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
