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
  /**
   * `buy` (v3, TASK-197): the round-2 buy column. From `md` up the sizes are the artboard's cards
   * (64 px, the selected one ringed in ink); below `md` the same radios are the phone sheet's
   * **segmented control** (spec 004 §14 A24 clause 4 (b), AC-49): a paper-3 pill track, 52 px
   * segments, the chosen one lifted onto card white. One radio group, restyled by width, so the
   * page never carries two groups of `name="tier"` that would uncheck each other.
   */
  readonly look?: "step" | "buy";
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

/**
 * v3's sizes (product artboards, round 2). Below `md`: the segmented track and segments of
 * `SegmentedControl` (`.seg` on `product-mobile`), the choice lifted onto card white with a
 * shadow, a shape cue as well as a fill. From `md`: three 64 px cards, the selected one ringed by a
 * 2 px ink inset (`.pv-tier.on` on `product-desktop`).
 */
const BUY_TRACK =
  "grid auto-cols-fr grid-flow-col rounded-full bg-surface-muted p-[4px] md:grid-cols-3 md:gap-[8px] md:rounded-none md:bg-transparent md:p-0";
const BUY_SEGMENT = [
  "grid cursor-pointer content-center gap-0 rounded-full text-sm text-ink-muted min-h-[52px] justify-items-center px-[8px] text-center",
  "has-[:checked]:bg-card has-[:checked]:shadow-sm",
  "md:min-h-[64px] md:justify-items-start md:gap-[2px] md:rounded-field md:bg-card md:px-[14px] md:py-[12px] md:text-start md:shadow-[inset_0_0_0_1.5px_var(--color-rule)]",
  "md:hover:shadow-[inset_0_0_0_1.5px_var(--color-ink-3)] md:has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-ink)]",
  "has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2",
].join(" ");

export function TierSelector({
  tiers,
  selectedTierKey,
  locale,
  name = "tier",
  step,
  look = "step",
}: TierSelectorProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const code = localeOf(locale);
  const [only] = tiers;
  const buy = look === "buy";
  const legend = (
    <StepLegend
      look={buy ? (tiers.length === 1 ? "buy" : "buy-phone-hidden") : "step"}
      step={buy ? undefined : step}
    >
      {product("tier.legend")}
    </StepLegend>
  );

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

  if (buy) {
    return (
      <fieldset
        className="m-0 min-w-0 border-0 p-0"
        data-fo-segmented="radios"
        data-fo-tier-selector="radios"
      >
        {legend}
        <div className={BUY_TRACK}>
          {tiers.map((tier) => (
            <label
              key={tier.tierKey}
              className={BUY_SEGMENT}
              data-fo-segment={tier.tierKey}
              data-fo-tier={tier.tierKey}
            >
              <input
                className="sr-only"
                defaultChecked={tier.tierKey === selectedTierKey}
                name={name}
                type="radio"
                value={tier.tierKey}
              />
              <b className="text-ink text-ui" data-fo-tier-label>
                {tierLabel(t, tier)}
              </b>
              <bdi className="tabular-nums">
                {formatMoney(tier.price, code)}
              </bdi>
            </label>
          ))}
        </div>
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
