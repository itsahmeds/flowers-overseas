/**
 * `AddonPriceList` — the add-ons as a priced, read-only list (spec 009 §2 "Add-ons", §5.3, §13 Q6,
 * AC-23 as amended by §14 A-founder-2026-10-14c, AC-34; `docs/design/system/components.dc.html`
 * "Add-on price row"; TASK-126, TASK-228).
 *
 * Each row is the add-on's name (`catalog.addon.*`), its catalogue description and its all-in
 * price **in the page's currency** (`AddonLine.price`, from `addonPriceProjection()`: the bouquet's
 * FX rule, so a euro page shows euro add-ons and a stale rate moves both to the destination's
 * currency together). **No row carries a VAT rate**: the section says once, under its heading and
 * above the rows, that the prices include delivery and VAT (`nav.utility.pricesInclude`, the
 * approved key item 8A draws); the split by rate is spec 010's step 3.
 *
 * **A plain ruled price list** (item 8A, spec 004 §14 A-founder-2026-10-19c; `.ao-list`/`.ao-row`
 * in `docs/design/wireframes/product-{desktop,mobile}.dc.html`; TASK-286): one rule over the list
 * and one under each row, no fill, no radius, no shadow, no hover and no pointer, so no row reads
 * as a card or a control. The free printed card's row reads "Included", with no
 * amount and no currency, set in leaf (`--color-included`) as v2 draws the included row: the
 * founder's approved `product.included` with its first letter set upright by CSS, so the row
 * adds no unreviewed string to the locale's review share (spec 003's 5 % gate).
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
  const nav = useTranslations("nav");
  const code = localeOf(locale);
  if (addons.length === 0) return null;

  return (
    <>
      <p
        className="text-ink-muted m-0 -mt-[4px] mb-[16px] text-sm"
        data-fo-addon-vat
      >
        {nav("utility.pricesInclude")}
      </p>
      <ul
        className="border-rule m-0 grid list-none border-t p-0"
        data-fo-addon-list
      >
        {addons.map((addon) => {
          const free = addon.price.amountMinor === 0;
          return (
            <li
              key={addon.key}
              className="border-rule grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-[20px] gap-y-[2px] border-b py-[12px]"
              data-fo-addon={addon.key}
            >
              <span className="text-ui font-bold">
                {messageFor(t, addon.nameKey)}
              </span>
              {free ? (
                <span
                  className="text-included text-ui inline-block text-end font-bold whitespace-nowrap first-letter:uppercase"
                  data-fo-addon-price="included"
                >
                  {product("included")}
                </span>
              ) : (
                <bdi
                  className="text-ink-muted text-ui text-end whitespace-nowrap tabular-nums"
                  data-fo-addon-price
                >
                  {formatMoney(addon.price, code)}
                </bdi>
              )}
              <span className="text-ink-muted col-start-1 text-sm leading-[1.35]">
                {messageFor(t, descriptionKey(addon.nameKey))}
              </span>
            </li>
          );
        })}
      </ul>
    </>
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
