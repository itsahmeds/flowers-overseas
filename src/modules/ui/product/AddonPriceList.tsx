/**
 * `AddonPriceList` — the add-ons as a priced, read-only list (spec 009 §2 "Add-ons", §5.3, §13 Q6,
 * AC-23; `docs/design/system/components.dc.html` "Add-on price row"; TASK-126).
 *
 * Each row is the add-on's name (`catalog.addon.*`), its price in the destination's currency
 * (`AddonLine.price`, design round Q4) and **its own** VAT rate (`AddonLine.vatRateText`). The free
 * handwritten card is a row like the others, at a visible zero.
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
    <ul className="m-0 flex list-none flex-col p-0" data-fo-addon-list>
      {addons.map((addon) => (
        <li
          key={addon.key}
          className="border-border gap-md py-sm flex items-baseline border-b text-sm last:border-b-0"
          data-fo-addon={addon.key}
        >
          <span className="flex-1">{messageFor(t, addon.nameKey)}</span>
          <bdi className="tabular-nums" data-fo-addon-price>
            {formatMoney(addon.price, code)}
          </bdi>
          <span className="text-ink-subtle min-w-[90px] text-end text-xs">
            {product("vat", { rate: addon.vatRateText })}
          </span>
        </li>
      ))}
    </ul>
  );
}
