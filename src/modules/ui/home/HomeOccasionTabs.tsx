/**
 * "Shop by occasion" on the home (spec 004 §14 A-founder-2026-10-24a item 4.4, AC-96, AC-97;
 * TASK-387; `home-*.dc.html`, `.cm-tabs`, and the "Thank you tab checked" state).
 *
 * **No script.** Every panel is in the server HTML. The tabs are one native radio group
 * (`<input type="radio" name="home-occasion">` inside `<label>`s drawn as chips), the first
 * checked; `globals.css` shows the checked one's panel with `:has(:checked)` and sets the others to
 * `display: none` (`[data-fo-occasion-tabs]`). Arrow keys move through the group natively and a
 * click needs no request. The group is named by the section's heading; each panel
 * (`role="group"`) by its occasion. A panel holds up to four country-less cards in "Our order",
 * then "See all" to the occasion hub, a country-less page and so a plain link.
 */
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LocaleCode } from "../../../config/locales.ts";
import { Display, Eyebrow, HEADING_EM } from "../primitives/typography.tsx";

import { HomeCardGrid, HomeGridLabel } from "./HomeCardGrid.tsx";
import { HOME_BLEED, HOME_V3_SECTION } from "./HomeHero.tsx";
import type { HomeView } from "./home-view.ts";

const HEADING_ID = "occasions-heading";

/** The radio group's `name`: one group per page. */
export const HOME_OCCASION_GROUP = "home-occasion";

type LabelTranslator = (key: string) => string;

export interface HomeOccasionTabsProps {
  readonly occasions: HomeView["occasions"];
}

export function HomeOccasionTabs({
  occasions,
}: HomeOccasionTabsProps): ReactElement | null {
  const t = useTranslations();
  const label = t as unknown as LabelTranslator;
  const locale = useLocale() as LocaleCode;
  if (occasions.length === 0) return null;
  return (
    <section
      className={`bg-surface-raised ${HOME_V3_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-home-section="occasions"
      data-fo-occasion-tabs=""
    >
      <div className="mb-[16px] flex flex-wrap items-end justify-between gap-x-[32px] gap-y-[10px] md:mb-[22px]">
        <div>
          <Eyebrow className="mb-[8px] text-xs">
            {t("home.occasions.eyebrow")}
          </Eyebrow>
          <Display as="h2" id={HEADING_ID} size="2xl" className="m-0">
            {t.rich("home.occasions.heading", HEADING_EM)}
          </Display>
        </div>
        <HomeGridLabel
          cards={occasions.flatMap((occasion) => occasion.cards)}
          locale={locale}
        />
      </div>
      <div
        role="radiogroup"
        aria-labelledby={HEADING_ID}
        className="-mx-(--gutter-s) mb-[16px] flex [scrollbar-width:none] gap-[8px] overflow-x-auto px-(--gutter-s) md:mx-0 md:mb-[22px] md:flex-wrap md:overflow-visible md:px-0"
      >
        {occasions.map((occasion, index) => (
          <label
            key={occasion.key}
            className="bg-card text-ink text-ui has-checked:bg-selected has-checked:text-on-selected relative inline-flex min-h-(--target-min) flex-none cursor-pointer items-center gap-[8px] rounded-full px-[18px] font-bold shadow-[inset_0_0_0_1px_var(--color-rule)] has-checked:shadow-none has-focus-visible:[outline:var(--focus-ring)] has-focus-visible:outline-offset-2"
          >
            <input
              className="sr-only"
              type="radio"
              name={HOME_OCCASION_GROUP}
              value={occasion.key}
              defaultChecked={index === 0}
              data-fo-occasion-tab={String(index)}
            />
            {label(occasion.labelKey)}
          </label>
        ))}
      </div>
      {occasions.map((occasion, index) => (
        <div
          key={occasion.key}
          role="group"
          aria-label={label(occasion.labelKey)}
          data-fo-occasion-panel={String(index)}
        >
          <HomeCardGrid
            cards={occasion.cards}
            locale={locale}
            name={{ label: label(occasion.labelKey) }}
            columns="four"
            section={`occasion-${occasion.key}`}
          />
          {occasion.hubHref === undefined ? null : (
            <div className="mt-[24px]">
              <a
                className="text-link text-ui inline-flex min-h-[24px] items-center font-bold underline decoration-[1.5px] underline-offset-[5px]"
                href={occasion.hubHref}
                data-fo-see-all={`occasion-${occasion.key}`}
              >
                {t("shop.seeAll", { count: occasion.total })}
              </a>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
