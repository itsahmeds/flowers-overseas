/**
 * "Coming up" on the home (spec 004 §14 A-founder-2026-10-24a item 4.6, AC-96; TASK-387;
 * `home-*.dc.html`, the "Coming up · layout for when it renders" state).
 *
 * Over **every shop country**, never one (the founder's "don't just build the shop around Poland",
 * AC-73): the next three dated occasions observed in any shop country that at least two core
 * products carry, earliest first. Each: its name linking the occasion hub (a country-less page, a
 * plain link; text where no hub exists), its earliest date (`formatDate`), the shop countries that
 * keep it on that date (`Intl.ListFormat`, at most two names, then `home.comingUp.more`), and up to
 * three country-less cards, on the occasion panels' four-column grid (the board draws this layout
 * only in a narrow state cell; the four columns keep its cards the size of the tabs' cards). With
 * no qualifying occasion the section is absent: no heading, no gap.
 *
 * The eyebrow is `nav.mega.comingUp` ("Coming up"), the heading the reviewed `home.dates.heading`.
 */
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LocaleCode } from "../../../config/locales.ts";
import { Display, Eyebrow, HEADING_EM } from "../primitives/typography.tsx";

import { HomeCardGrid, HomeGridLabel } from "./HomeCardGrid.tsx";
import { HOME_BLEED, HOME_V3_SECTION } from "./HomeHero.tsx";
import type { HomeView } from "./home-view.ts";

const HEADING_ID = "coming-up-heading";

type LabelTranslator = (key: string) => string;

export interface HomeComingUpProps {
  readonly comingUp: HomeView["comingUp"];
}

export function HomeComingUp({
  comingUp,
}: HomeComingUpProps): ReactElement | null {
  const t = useTranslations();
  const label = t as unknown as LabelTranslator;
  const locale = useLocale() as LocaleCode;
  if (comingUp.length === 0) return null;
  return (
    <section
      className={`${HOME_V3_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-home-section="coming-up"
    >
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-x-[32px] gap-y-[10px]">
        <div>
          <Eyebrow className="mb-[8px] text-xs">
            {t("nav.mega.comingUp")}
          </Eyebrow>
          <Display as="h2" id={HEADING_ID} size="2xl" className="m-0">
            {t.rich("home.dates.heading", HEADING_EM)}
          </Display>
        </div>
        <HomeGridLabel
          cards={comingUp.flatMap((occasion) => occasion.cards)}
          locale={locale}
        />
      </div>
      {comingUp.map((occasion) => {
        const name = label(occasion.labelKey);
        return (
          <div
            key={occasion.key}
            className="mb-[22px] grid gap-[12px] last:mb-0"
            data-fo-coming-up={occasion.key}
          >
            <div className="flex flex-wrap items-baseline gap-x-[16px] gap-y-[6px]">
              <p className="display m-0 text-[24px] leading-[1.2] font-normal">
                {occasion.hubHref === undefined ? (
                  name
                ) : (
                  <a className="text-link no-underline" href={occasion.hubHref}>
                    {name}
                  </a>
                )}
              </p>
              <time
                className="font-bold [font-variant-numeric:lining-nums_tabular-nums]"
                dateTime={occasion.dateIso}
              >
                {occasion.date}
              </time>
              <span
                className="text-ink-3 text-sm"
                data-fo-coming-up-countries=""
              >
                {occasion.more > 0
                  ? `${occasion.countries} ${t("home.comingUp.more", { count: occasion.more })}`
                  : occasion.countries}
              </span>
            </div>
            <HomeCardGrid
              cards={occasion.cards}
              locale={locale}
              name={{ label: name }}
              columns="four"
              section={`coming-up-${occasion.key}`}
            />
          </div>
        );
      })}
    </section>
  );
}
