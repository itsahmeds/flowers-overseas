/**
 * `HomeHero` — the locale home's first screen, v3, products first (spec 004 §14
 * A-founder-2026-10-24a item 4.2, AC-92, AC-94; TASK-386;
 * `docs/design/wireframes/home-desktop.dc.html` and `home-mobile.dc.html`, `.cm-hero`).
 *
 * A short first screen, so the first product card is in it: the eyebrow (from `md`), the H1, one
 * promise line and **the picker**, the chooser's form inline (`CountryPicker` `variant="home"`):
 * one button per shop country up to `PICKER_CHIPS`, the searchable field, "Show prices" and the
 * remember line. It submits to the chooser with an empty `next` (the chosen country's shop root);
 * native HTML, no script. TASK-394's trust row goes inside the card, under the remember line.
 *
 * Beside it from `md`, on columns 8 to 12 of the frame's 12-column grid, the photograph at 370 px
 * (41 % of a 900 px viewport, inside item 4.2's 45 % cap) and under it, while no destination takes
 * orders, spec 043 AC-8's state line, then `shop.hub.noMoney` once ("beside the picker", item 2).
 * **Below `md` there is no photograph above the first product** (item 4.2): its box is not drawn,
 * and its `<picture>` selects a blank source there, so nothing downloads; the two lines follow the
 * picker. One DOM for both: one `<h1>`, one form.
 *
 * The photograph is the page's `priority` image from `md` up only (`displayedAt="md-up"`, its
 * preload carrying that `media`); below `md` the first product card's photograph is
 * (`HomeSelection`), so the two preloads never overlap (AC-94).
 *
 * The phone H1 is the board's 32 px with `7.95vw` as its ceiling, 31 px at 390: the one-line H1 the
 * board draws at 390 fills 345 of its 350 px on macOS and wrapped on the Linux runner, so the
 * ceiling keeps it on one line on both.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { MediaAsset } from "../media/MediaAsset.tsx";
import { CountryPicker } from "../shop/CountryPicker.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import type { HomeView } from "./home-view.ts";

/**
 * The home sections' inline padding: the page frame's edge on a full-bleed band. Each section
 * keeps its full-width background and puts its content where `PAGE_FRAME` puts every other page's:
 * 20 px below `md`, 56 px from `md` up, and centred on the 1,328 px column above 1,440 (x 92 at
 * 1512), so it lines up with the header logo at every width (AC-31, the TASK-186 carry-forward).
 */
export const HOME_BLEED =
  "px-(--gutter-s) md:px-[max(var(--gutter),calc((100%-var(--container-page))/2))]";

/**
 * The section rhythm: `--section-fluid`, 64 px on a phone and at most 104 px, with a height term so a
 * laptop window gets less (spec 004 §14 A23 clause 9).
 */
export const HOME_SECTION = "py-(--section-fluid)";

/**
 * The v3 home's tighter rhythm (`.cm-sec`): 32 px on a phone, 44 px from `md`, so the first
 * product and every section after it come sooner (spec 004 §14 A-founder-2026-10-24a item 4).
 */
export const HOME_V3_SECTION = "py-[32px] md:py-[44px]";

/** The band's photograph in `seed/data/media.json` (spec 006 §2.4; TASK-080). */
export const HOME_HERO_ASSET = "home-hero";

/**
 * The photograph's rendered width: columns 8 to 12 of the 1,328 px frame (534 px at 1,440 and
 * above), about 37 % of the window between `md` and that. Smaller than the old full-bleed cover's
 * `100vw`, so the LCP image is lighter.
 */
const HERO_PHOTO_SIZES = "(min-width: 90rem) 534px, 37vw";

/**
 * Motion 5 (spec 004 §14 A24 clause 9; `system/motion.dc.html` cell 5; TASK-283): the H1's one
 * phrase carries the sunflower underline as an inline, `aria-hidden` SVG laid under its words
 * (`globals.css`, `#hero-heading [data-fo-em]`), drawn once after load; under reduced motion it is
 * drawn from the start.
 */
const HERO_HEADING_EM = {
  em: (chunks: ReactNode): ReactElement => (
    <em data-fo-em="">
      {chunks}
      <svg
        aria-hidden="true"
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 300 10"
      >
        <path d="M2 6 C 80 2, 200 9, 298 4" />
      </svg>
    </em>
  ),
} as const;

export interface HomeHeroProps {
  readonly locale: string;
  readonly picker: HomeView["picker"];
  /** No destination takes orders yet: spec 043 AC-8's state line is drawn. */
  readonly notOpen: boolean;
  /** `h1` on the locale home; `h2` in `/dev/components`, which has its own `<h1>`. */
  readonly headingLevel?: "h1" | "h2";
  /** Is the photograph the page's LCP candidate from `md` up? `false` in the gallery. */
  readonly priority?: boolean;
}

export function HomeHero({
  locale,
  picker,
  notOpen,
  headingLevel = "h1",
  priority = true,
}: HomeHeroProps): ReactElement {
  const t = useTranslations();

  return (
    <section
      className={`pt-[8px] md:pt-[26px] ${HOME_BLEED}`}
      aria-labelledby="hero-heading"
      data-fo-hero=""
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-y-[6px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)]">
        <div
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[6px] md:col-span-7 md:gap-[14px]"
          data-fo-hero-copy=""
        >
          <Eyebrow className="m-0 max-md:hidden">
            <span data-fo-hero-eyebrow="">{t("home.hero.eyebrow")}</span>
          </Eyebrow>
          <Display
            as={headingLevel}
            id="hero-heading"
            size="hero"
            className="m-0 text-[clamp(26px,7.95vw,32px)] leading-[1.04] tracking-[-0.025em] [font-variation-settings:var(--font-variation-display-hero)] md:text-[56px] md:leading-none max-[390px]:[&_em]:block max-[390px]:[&_em]:w-fit"
          >
            {t.rich("home.hero.heading", HERO_HEADING_EM)}
          </Display>
          <p
            className="text-ink-muted m-0 max-w-[48ch] text-sm leading-[1.35] md:text-[19px] md:leading-[1.45]"
            data-fo-hero-line=""
          >
            {t("home.hero.proposition")}
          </p>
          {/* `#send`: the header's "Send flowers" lands on the picker until the mega menu
              retires the pill (TASK-383). */}
          <div id="send">
            <CountryPicker
              action={picker.action}
              variant="home"
              idPrefix="pk"
              label={t("home.picker.label")}
              searchLabel={t("home.picker.search")}
              submitLabel={t("home.picker.submit")}
              rememberLine={t("shop.choose.remember")}
              chips={picker.chips}
              datalist={picker.datalist}
            />
          </div>
        </div>
        <div className="grid content-start gap-[16px] md:col-span-5">
          <div
            className="rounded-hero bg-paper-2 h-[370px] overflow-hidden max-md:hidden [&_img]:object-[60%_50%] [&>[data-fo-media-asset]]:h-full [&>[data-fo-media-asset]]:rounded-none"
            data-fo-home-photo=""
          >
            <MediaAsset
              assetId={HOME_HERO_ASSET}
              locale={locale}
              slot="hero"
              priority={priority}
              displayedAt="md-up"
              sizes={HERO_PHOTO_SIZES}
            />
          </div>
          <div className="grid gap-[4px] md:gap-[6px]" data-fo-hero-state="">
            {notOpen ? (
              <p
                className="text-ink-muted m-0 text-xs leading-[1.35] md:text-sm md:leading-[1.45]"
                data-fo-home-state=""
              >
                {t("destinations.state.guideNotDelivering")}
              </p>
            ) : null}
            <p
              className="text-ink-muted m-0 max-w-[64ch] text-xs leading-[1.35] md:text-sm md:leading-[1.45]"
              data-fo-no-money=""
            >
              {t("shop.hub.noMoney")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
