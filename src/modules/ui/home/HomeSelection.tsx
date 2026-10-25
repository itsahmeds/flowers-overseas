/**
 * "Our selection" on the home (spec 004 §14 A-founder-2026-10-24a item 4.3, AC-95, AC-96;
 * TASK-386; `home-*.dc.html`, `.cm-sec.pop`).
 *
 * The whole core range as country-less cards, in "Our order" (spec 045 §2.5: while every band is 0,
 * the core list's rank), under the reviewed `home.trending.heading`. Beside the heading, "How we
 * sort", a native `<details>`, closed, holding the listing disclosure text; then the example label
 * once. Below the grid, only "See all", to the chooser with an empty `next`. Five columns from
 * `lg` (two rows for ten), three from `md`, two on a phone.
 *
 * **The orchestrator's design call (delegated, 2026-10-24):** the section holds every core
 * product, not the "first 8" of item 4.3, so AC-95 (every core product displayed) holds from this
 * section alone; the spec's "first 8" reads as the whole range while it has 10 or fewer.
 */
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LocaleCode } from "../../../config/locales.ts";
import { Display, HEADING_EM } from "../primitives/typography.tsx";

import { HomeCardGrid, HomeGridLabel } from "./HomeCardGrid.tsx";
import { HOME_BLEED } from "./HomeHero.tsx";
import type { HomeView } from "./home-view.ts";

const HEADING_ID = "selection-heading";

export interface HomeSelectionProps {
  readonly selection: HomeView["selection"];
}

export function HomeSelection({
  selection,
}: HomeSelectionProps): ReactElement | null {
  const t = useTranslations();
  const locale = useLocale() as LocaleCode;
  if (selection.cards.length === 0) return null;
  return (
    <section
      className={`pt-[12px] pb-[32px] md:py-[44px] ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-home-section="selection"
    >
      <div className="mb-[10px] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[16px] gap-y-[2px] md:mb-[22px] md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-x-[22px] md:gap-y-[6px]">
        <Display as="h2" id={HEADING_ID} size="2xl" className="m-0">
          {t.rich("home.trending.heading", HEADING_EM)}
        </Display>
        <details className="relative" data-fo-how-we-sort="">
          <summary className="text-link text-ui inline-flex min-h-(--target-min) cursor-pointer list-none items-center font-bold underline decoration-[1.5px] underline-offset-[5px] [&::-webkit-details-marker]:hidden">
            {t("shop.toolbar.howWeSort")}
          </summary>
          <p className="bg-card text-ink-muted rounded-field absolute end-0 top-full z-10 m-0 mt-[6px] w-[min(360px,80vw)] p-[14px] text-sm leading-[1.45] shadow-(--shadow-md)">
            {t("shop.toolbar.disclosure")}
          </p>
        </details>
        <HomeGridLabel
          cards={selection.cards}
          locale={locale}
          className="max-md:col-span-2"
        />
      </div>
      <HomeCardGrid
        cards={selection.cards}
        locale={locale}
        name={{ labelledBy: HEADING_ID }}
        columns="five"
        priorityBelowMd
        section="selection"
      />
      <div className="mt-[28px]">
        <a
          className="text-link text-ui font-bold underline decoration-[1.5px] underline-offset-[5px]"
          href={selection.seeAllHref}
          rel="nofollow"
          data-fo-see-all="selection"
        >
          {t("shop.seeAll", { count: selection.cards.length })}
        </a>
      </div>
    </section>
  );
}
