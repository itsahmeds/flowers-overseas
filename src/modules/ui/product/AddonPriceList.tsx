/**
 * `AddonPriceList` — the add-ons as a priced, read-only list (spec 009 §2 "Add-ons", §5.3, §13 Q6,
 * AC-23; `docs/design/system/components.dc.html` "Add-on price row"; TASK-126).
 *
 * Each row is the add-on's name (`catalog.addon.*`), its price in the destination's currency
 * (`AddonLine.price`, design round Q4) and **its own** VAT rate (`AddonLine.vatRateText`). The free
 * printed card is a row like the others, at a visible zero, set in leaf (`--color-included`) as v2
 * draws the included row (TASK-179). Each row also prints the add-on's catalogue description.
 *
 * **There is no input of any kind** — no checkbox, no toggle, no button. There is no basket in
 * Phase 0 to add one to, and a tick that changes a total nobody can be charged is a worse lie than
 * no tick (§13 Q6). `AddonLine` has no selection field, so a pre-ticked add-on is unrepresentable
 * (CRD Art. 22) and stays so when spec 010 draws the inputs.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { AddonLine } from "@/modules/catalog";
import { formatMoney } from "@/modules/i18n";

import { localeOf, messageFor } from "./labels.ts";

export interface AddonPriceListProps {
  readonly addons: readonly AddonLine[];
  readonly locale: string;
}

export function AddonPriceList({
  addons,
  locale,
}: AddonPriceListProps): ReactElement | null {
  const t = useTranslations();
  const product = useTranslations("product");
  const code = localeOf(locale);
  if (addons.length === 0) return null;

  return (
    <ul className="m-0 grid list-none gap-[8px] p-0" data-fo-addon-list>
      {addons.map((addon) => {
        const free = addon.price.amountMinor === 0;
        return (
          <li
            key={addon.key}
            className="bg-card rounded-field grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-[14px] gap-y-[4px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
            data-fo-addon={addon.key}
          >
            <span className="grid">
              <span className="font-bold">{messageFor(t, addon.nameKey)}</span>
              <span className="text-ink-muted text-sm leading-[1.4]">
                {messageFor(t, descriptionKey(addon.nameKey))}
              </span>
            </span>
            <span
              className={`grid text-end whitespace-nowrap ${free ? "text-included font-bold" : ""}`}
            >
              <bdi className="tabular-nums" data-fo-addon-price>
                {formatMoney(addon.price, code)}
              </bdi>
              <small className="text-ink-subtle text-xs font-normal">
                {product("vat", { rate: addon.vatRateText })}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The add-on's one-line description, which the catalogue keeps beside its name
 * (`catalog.addon.<key>.name` → `catalog.addon.<key>.description`). `pnpm i18n:check` proves both
 * exist for every add-on; the derivation is a key reading, not copy.
 */
export function descriptionKey(nameKey: string): string {
  return nameKey.replace(/\.name$/u, ".description");
}
