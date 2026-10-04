/**
 * `ListingToolbar` — the count, the ranking disclosure and the sort form (spec 008 §2 "Sort,
 * filters, pagination", §5.3, §13 **Q3**, §13 **Q6**, AC-9's render half, T-30; TASK-108;
 * `docs/design/system/components.dc.html`, "Listing toolbar": default and sorted).
 *
 * **A `<form method="get">`, and nothing else.** A visible `<label>`, a real `<select>` and a real
 * submit button: operable with the keyboard alone, identical with JavaScript disabled, and adding
 * **zero** bytes of client script (§2, §5.4). There is no island, no `onChange` auto-submit — an
 * auto-submitting select is a control a keyboard user cannot pass through without navigating away
 * — and no `<input type="hidden">` for the page number, because changing the order takes the
 * reader back to page 1 by definition.
 *
 * **The default order is labelled for what it is** (§13 Q3). It is spec 005's deterministic
 * founder-set curation, so the option reads plainly and a one-sentence disclosure says what
 * determines it and what does not. The strings "bestseller", "most popular" and "recommended for
 * you" appear in no locale's catalogue (AC-9): we have no sales, no personalisation and no paid
 * placement, and `plan/07` §2.1's ranking-transparency duty would require us to describe any of
 * the three truthfully — so the honest label is the free alternative.
 *
 * **No filters** (§13 Q6). The browsing affordance is `CategoryChipRow`, whose chips are links to
 * pages that exist.
 *
 * The count is a **plural message**, which is why `pl` gets one/few/many/other rather than the two
 * English forms (T-30).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Text } from "../primitives/typography.tsx";

import { LISTING_SORTS, type ListingSort } from "./viewModel.ts";

/**
 * The `shop.sort.*` key each order is labelled by. §13 Q3: the default order is the founder's
 * curation, labelled plainly — never "bestsellers", "popular" or "recommended", which we cannot
 * evidence and which `plan/07` §2.1's ranking-transparency duty would make us describe truthfully
 * anyway. It lives beside the `useTranslations("shop")` that resolves it, which is also what keeps
 * `pnpm i18n:check`'s namespace-aware usage scan able to see all three keys.
 */
export const SORT_LABEL_KEYS = {
  default: "sort.default",
  "price-asc": "sort.priceAsc",
  "price-desc": "sort.priceDesc",
} as const satisfies Readonly<Record<ListingSort, string>>;

export interface ListingToolbarProps {
  /**
   * Every product in the listing, not the number on this page. Named `productCount` rather than
   * the view model's `total` because `fo/no-float-money` reads any `total: number` as money, and
   * the rule is right to: the only bare `number` a component in this directory may take is a
   * count, and every price arrives as a `Money`.
   */
  readonly productCount: number;
  readonly page: number;
  readonly pageCount: number;
  readonly sort: ListingSort;
  /**
   * The `<select>`'s id, so a page rendering the toolbar twice (it does not, but the gallery
   * does) keeps one label bound to one control.
   */
  readonly id?: string;
}

export function ListingToolbar({
  productCount,
  page,
  pageCount,
  sort,
  id = "listing-sort",
}: ListingToolbarProps): ReactElement {
  const t = useTranslations("shop");

  return (
    // v2 (spec 004 §14 A21; the listing artboards' `.toolbar`): one rule above and below, the
    // count in the display face with the ranking disclosure under it on the start side, and the
    // sort form on the end side — stacked into one column on a phone.
    <div
      className="border-rule gap-x-lg gap-y-md grid grid-cols-1 items-end border-y py-[18px] md:grid-cols-[minmax(0,1fr)_auto]"
      data-fo-listing-toolbar={sort}
    >
      <div className="flex flex-col">
        <Text as="span" size="md" className="display text-md">
          {pageCount > 1
            ? t("toolbar.summary", { count: productCount, page, pageCount })
            : t("toolbar.count", { count: productCount })}
        </Text>
        {/* The ranking disclosure, on the page rather than in a tooltip: `plan/07` §2.1. */}
        <Text
          as="span"
          size="sm"
          tone="subtle"
          className="mt-[6px] max-w-[70ch]"
        >
          {t("toolbar.disclosure")}
        </Text>
      </div>
      <form className="flex items-end gap-[12px]" method="get">
        <div className="gap-xs grid min-w-0 flex-1 md:flex-none">
          <label className="label text-ink-subtle" htmlFor={id}>
            {t("toolbar.sortLabel")}
          </label>
          <select
            className="border-field-edge bg-card text-ui rounded-field min-h-(--field-height) w-full min-w-0 border-[1.5px] px-[14px] md:min-w-[240px]"
            defaultValue={sort}
            id={id}
            name="sort"
          >
            {LISTING_SORTS.map((option) => (
              <option key={option} value={option}>
                {t(SORT_LABEL_KEYS[option])}
              </option>
            ))}
          </select>
        </div>
        <button
          className="text-ink text-ui hover:bg-surface-raised min-h-(--control-sm) rounded-full px-[20px] font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
          type="submit"
        >
          {t("toolbar.submit")}
        </button>
      </form>
    </div>
  );
}
