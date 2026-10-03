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

export interface TierSelectorProps {
  readonly tiers: readonly TierOption[];
  readonly selectedTierKey: string;
  readonly locale: string;
  /** The form field name; `tier` is `ProductSearchParamsSchema`'s (TASK-128). */
  readonly name?: string;
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

export function TierSelector({
  tiers,
  selectedTierKey,
  locale,
  name = "tier",
}: TierSelectorProps): ReactElement {
  const t = useTranslations();
  const product = useTranslations("product");
  const code = localeOf(locale);
  const [only] = tiers;

  if (tiers.length === 1 && only !== undefined) {
    return (
      <fieldset
        className="border-border p-md gap-md flex flex-col rounded-sm border"
        data-fo-tier-selector="single"
      >
        <legend className="px-sm text-sm font-semibold">
          {product("tier.legend")}
        </legend>
        <p className="text-md m-0" data-fo-tier={only.tierKey}>
          <b>{tierLabel(t, only)}</b>
          {" · "}
          <bdi className="tabular-nums">{formatMoney(only.price, code)}</bdi>
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset
      className="border-border p-md gap-md flex flex-col rounded-sm border"
      data-fo-tier-selector="radios"
    >
      <legend className="px-sm text-sm font-semibold">
        {product("tier.legend")}
      </legend>
      <div className="gap-sm flex flex-wrap">
        {tiers.map((tier) => (
          <label
            key={tier.tierKey}
            className="border-border p-md has-[:checked]:border-border-emphasis has-[:checked]:bg-surface-raised has-[:focus-visible]:outline-focus flex min-w-[120px] flex-1 cursor-pointer flex-col gap-[2px] border has-[:checked]:border-2 has-[:focus-visible]:outline-2"
            data-fo-tier={tier.tierKey}
          >
            <input
              className="sr-only"
              defaultChecked={tier.tierKey === selectedTierKey}
              name={name}
              type="radio"
              value={tier.tierKey}
            />
            <span className="text-md font-semibold">{tierLabel(t, tier)}</span>
            <bdi className="text-sm tabular-nums">
              {formatMoney(tier.price, code)}
            </bdi>
            <span
              aria-hidden="true"
              className="text-accent hidden text-xs [label:has(:checked)>&]:inline"
            >
              {product("selected")}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
