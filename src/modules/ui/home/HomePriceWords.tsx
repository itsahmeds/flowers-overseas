/**
 * "Shop by price" on the home (spec 004 §14 A-founder-2026-10-24a item 4.5, AC-96; TASK-387;
 * `home-*.dc.html`, the "Price words · before a country" primitive of `system/components.dc.html`).
 *
 * Three word labels and **no amount** (`shop.price.bandWord.low`, `.mid`, `.high`): a band's
 * amounts are a country's (`priceBands()`, spec 008's amendment), and no country is chosen here.
 * Each is a chooser link, `next=price/{band}`, `rel="nofollow"`. No cards in this section.
 *
 * The heading is `nav.mega.byPrice` ("By price"), the menu's own word for the same entry, drawn
 * where the board puts its eyebrow: the board's heading is a keyless `[slot]` ("Shop by price"),
 * and no key is invented for it (the `/plan-tasks` carry-forward). It is proposed to the founder's
 * copy batch as `home.price.heading` (`docs/tasks/TASK-387.md`, "Escalations").
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Display } from "../primitives/typography.tsx";

import { HOME_BLEED, HOME_V3_SECTION } from "./HomeHero.tsx";
import type { HomeView } from "./home-view.ts";

const HEADING_ID = "price-heading";

/** Each band's word label, written out so `i18n:check` sees every key a page reads. */
const BAND_WORD_KEYS = {
  low: "shop.price.bandWord.low",
  mid: "shop.price.bandWord.mid",
  high: "shop.price.bandWord.high",
} as const;

export interface HomePriceWordsProps {
  readonly bands: HomeView["priceBands"];
}

export function HomePriceWords({ bands }: HomePriceWordsProps): ReactElement {
  const t = useTranslations();
  return (
    <section
      className={`${HOME_V3_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-home-section="price"
    >
      <Display as="h2" id={HEADING_ID} size="2xl" className="m-0 mb-[18px]">
        {t("nav.mega.byPrice")}
      </Display>
      <ul className="m-0 flex list-none flex-wrap gap-[12px] p-0">
        {bands.map((band) => (
          <li key={band.band}>
            <a
              className="text-ink text-ui inline-flex min-h-(--control-sm) items-center rounded-full px-[20px] font-bold whitespace-nowrap underline shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
              href={band.href}
              rel="nofollow"
              data-fo-price-band={band.band}
            >
              {t(BAND_WORD_KEYS[band.band])}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
