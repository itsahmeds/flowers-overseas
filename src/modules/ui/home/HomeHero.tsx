/**
 * `HomeHero` — the locale home's first screen, round 2: **desktop option A** and **phone option 1**
 * (spec 004 §14 A23 clause 1 "Round-2 picks", A24 clauses 4 (f), 5 and 7, **AC-46**; TASK-196;
 * `docs/design/wireframes/home-desktop.dc.html` `.oa`, `home-mobile.dc.html` `.m1`).
 *
 * The founder picked both on 2026-10-05 ("A homepage is good", "home 1"). One DOM serves both:
 *
 *  - **Desktop (`md` and up).** The flat-lay fills the first screen edge to edge under the chrome:
 *    its block size is `clamp(560px, 100svh − the chrome, 826px)`, so its block-start edge is the
 *    chrome's block-end edge and its block-end edge is at or above the viewport's foot at
 *    1280 × 800, 1440 × 900 and 1512 × 945. It crops with the window (`object-fit: cover`,
 *    `object-position: 64% 50%`, so the flowers stay right of centre); this image alone is exempt
 *    from `--hero-photo-max` (A24 clause 5). Over it, on the frame's 12-column grid, one white card
 *    on columns 1–5, vertically centred, holds the eyebrow, the H1, the one supporting line and,
 *    under a rule, the sentence and Continue. The card is the one overlap and its airmail edge the
 *    one device (A24 clause 7). The card's inline-start edge is the logo's (x 56 at 1440 and 1280,
 *    the frame's x above 1440), and its text is 36 px in (x 92).
 *  - **Phone (below `md`).** The flat-lay is the screen: the header (65 px), the cover at
 *    `min(703px, 100svh − 141px)` (at least 420 px) and the docked bar (76 px, mounted by the page)
 *    together equal the viewport at 390 × 844. The eyebrow, the H1 and its line sit at the cover's
 *    foot on the ink fade (`--color-cover-fade`, whose contrast over white is a unit test,
 *    `./cover-fade.ts`). The fade climbs from transparent over the copy's 96 px block-start padding
 *    (`COVER_FADE_RAMP_PX`), so every glyph sits on its full alpha. The sentence card follows
 *    directly below the fold, `#send`, which the bar's Send flowers links to; the airmail edge
 *    moves with the white card onto it.
 *
 * Below `md` the frame and the card are `display: contents`, so the copy and the form become items
 * of the band's own two-row grid (cover, then the card) without a second copy of either in the
 * document: one `<h1>`, one form, one `<img>` (AC-10, A24 clause 5's single priority image).
 *
 * The photograph is `MediaAsset` for `home-hero`, `priority`: the page's one `fetchpriority="high"`
 * image and its one preload, from the same lookup (spec 006 AC-19), `sizes="100vw"`. With no
 * displayable asset it is the captioned `--color-photo` box in the same box, with no `<img>`.
 *
 * Copy: shipped strings only (`home.hero.*`, `home.sentence.*`, `finder.submit`). The phone
 * artboard prints the proposition's first sentence alone; there is no such key, so the cover
 * carries the whole reviewed proposition (`docs/design/README.md`).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { MediaAsset } from "../media/MediaAsset.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import { SentencePicker } from "./SentencePicker.tsx";

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

/** The band's photograph in `seed/data/media.json` (spec 006 §2.4; TASK-080). */
export const HOME_HERO_ASSET = "home-hero";

/**
 * The chrome above the band, in px, per breakpoint: the utility strip and the sticky header with
 * its rule, measured on the built page (TASK-196): 62 + 83 = 145 from `xl` (the artboard's chrome
 * is 119; the shipped TASK-195 chrome is taller, and the band follows the code), 62 + 121 = 183
 * from `lg` (the header's second row) and 81.6 + 121 from `md` (the strip wraps). The band's block
 * size subtracts it, so the photograph ends at or above the viewport's foot (AC-46).
 */
const CHROME_BLOCK =
  "md:[--home-chrome:203px] lg:[--home-chrome:183px] xl:[--home-chrome:145px]";

export interface HomeHeroProps {
  readonly locale: string;
  /** `h1` on the locale home; `h2` in `/dev/components`, which has its own `<h1>`. */
  readonly headingLevel?: "h1" | "h2";
  /** Is this band the document's single LCP candidate? `false` in the gallery. */
  readonly priority?: boolean;
  /** ISO codes whose shop root exists in this locale — handed to the sentence picker. */
  readonly shopCountries?: readonly string[];
}

export function HomeHero({
  locale,
  headingLevel = "h1",
  priority = true,
  shopCountries = [],
}: HomeHeroProps): ReactElement {
  const t = useTranslations("home");

  return (
    <section
      className={`relative grid grid-cols-[minmax(0,1fr)] [grid-template-areas:'cover'_'send'] md:block md:h-[clamp(560px,calc(100svh-var(--home-chrome)),826px)] ${CHROME_BLOCK}`}
      aria-labelledby="hero-heading"
      data-fo-hero
    >
      {/* The cover: the viewport minus the phone header (65) and the docked bar (76). */}
      <div
        className="relative h-[min(703px,calc(100svh-141px))] min-h-[420px] overflow-hidden max-md:[grid-area:cover] md:absolute md:inset-0 md:h-auto md:min-h-0 [&_img]:object-[58%_40%] max-md:[&_img]:origin-[58%_40%] max-md:[&_img]:scale-[1.12] md:[&_img]:object-[64%_50%] [&>[data-fo-media-asset]]:h-full [&>[data-fo-media-asset]]:rounded-none"
        data-fo-hero-photo
      >
        <MediaAsset
          assetId={HOME_HERO_ASSET}
          locale={locale}
          slot="hero"
          priority={priority}
        />
      </div>
      <div
        className={`max-md:contents md:relative md:grid md:h-full md:grid-cols-12 md:items-center md:gap-x-[clamp(24px,2.22vw,32px)] ${HOME_BLEED}`}
        data-fo-hero-frame
      >
        <div
          className="md:airmail-edge md:bg-surface-card md:rounded-letter md:shadow-letter max-md:contents md:col-span-8 md:grid md:gap-[18px] md:overflow-hidden md:px-[36px] md:pt-[34px] md:pb-[32px] lg:col-span-6 xl:col-span-5"
          data-fo-hero-card
        >
          <div
            className="relative grid gap-[12px] self-end px-(--gutter-s) pt-[96px] pb-[24px] max-md:bg-[linear-gradient(to_bottom,transparent,var(--color-cover-fade)_96px)] max-md:[grid-area:cover] md:gap-[18px] md:p-0"
            data-fo-hero-copy
          >
            <Eyebrow className="max-md:text-on-inverse-accent">
              <span data-fo-hero-eyebrow>{t("hero.eyebrow")}</span>
            </Eyebrow>
            {/* The document's one `<h1>` (AC-10): the hero step on the phone cover, the title step
                in the desktop card (the artboards' `.t-hero` and `.t-title`). */}
            <Display
              as={headingLevel}
              id="hero-heading"
              size="hero"
              className="md:text-title-fluid max-md:text-on-inverse leading-(--text-hero-fluid--line-height) tracking-(--text-hero-fluid--letter-spacing) [font-variation-settings:var(--font-variation-display-hero)] md:leading-(--text-title-fluid--line-height) md:tracking-(--text-title-fluid--letter-spacing)"
            >
              {t("hero.heading")}
            </Display>
            <p
              className="text-ui md:text-lede-fluid md:text-ink-muted max-md:text-on-inverse m-0 max-w-[32ch] leading-[1.5] md:max-w-[38ch]"
              data-fo-hero-line
            >
              {t("hero.proposition")}
            </p>
          </div>
          <hr className="border-rule mt-[4px] hidden border-0 border-t md:block" />
          <SentencePicker
            locale={locale}
            shopCountries={shopCountries}
            className="max-md:airmail-edge max-md:bg-surface-card max-md:rounded-letter max-md:shadow-letter max-md:mx-(--gutter-s) max-md:mt-[28px] max-md:px-[20px] max-md:pt-[16px] max-md:pb-[22px] max-md:[grid-area:send]"
          />
        </div>
      </div>
    </section>
  );
}
