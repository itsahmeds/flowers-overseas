/**
 * `HomeHero` — the locale home's first band, v2 "the letter home" (spec 004 §14 **A21**, AC-10;
 * TASK-177; `docs/design/wireframes/home-desktop.dc.html` / `home-mobile.dc.html`, `.hero`).
 *
 * Supersedes the v1 band (a full-bleed photograph with a paper card and the type-ahead finder,
 * A11). The artboards draw a two-column grid at 1440 — copy over the letter in a 5fr column, the
 * photograph in a 6fr column beside both, 64 px apart — and one column at 390: copy, then the
 * photograph full-bleed at 4∶3, then the letter pulled 64 px up over it.
 *
 *  - **Copy.** The eyebrow, the document's one `<h1>` and the proposition, each a reviewed key.
 *  - **Photograph.** `MediaAsset` for `home-hero`, `priority`: the page's single image preload
 *    (spec 006 AC-19). It is 4∶5 with the 28 px hero radius on desktop and 4∶3 with no radius on
 *    mobile. With no displayable asset in this locale it is the captioned `--color-photo` box in
 *    the same reserved ratio, with no `<img>` (spec 006 AC-18), so nothing shifts.
 *  - **Postmark.** Decorative (`aria-hidden`): two cornflower rings around the logo mark, tilted
 *    by `--tilt-postmark`. The artboard's ring lettering is new copy and waits for the founder's
 *    batch, so the rings carry no words.
 *  - **Letter.** `SentencePicker`, the A21 clause 4 form. It follows the figure in the document,
 *    so where it overlaps the photograph (mobile) it paints above it with no z-index.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Mark } from "../icons/Mark.tsx";
import { MediaAsset } from "../media/MediaAsset.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import { SentencePicker } from "./SentencePicker.tsx";

/**
 * The page's inline gutter: the artboards' `--gutter-s` 20 px on mobile and `--gutter` 56 px on
 * desktop. Every home section uses it, so their edges line up with each other.
 */
export const HOME_BLEED = "px-[20px] md:px-[56px]";

/**
 * The section rhythm: `--section-fluid`, 64 px on a phone and at most 104 px, with a height term so a
 * laptop window gets less (spec 004 §14 A23 clause 9).
 */
export const HOME_SECTION = "py-(--section-fluid)";

/** The band's photograph in `seed/data/media.json` (spec 006 §2.4; TASK-080). */
export const HOME_HERO_ASSET = "home-hero";

export interface HomeHeroProps {
  readonly locale: string;
  /** `h1` on the locale home; `h2` in `/dev/components`, which has its own `<h1>`. */
  readonly headingLevel?: "h1" | "h2";
  /** Is this band the document's single LCP candidate? `false` in the gallery. */
  readonly priority?: boolean;
  /** ISO codes whose shop root exists in this locale — handed to the sentence picker. */
  readonly shopCountries?: readonly string[];
}

/** The postmark: decorative rings and the logo mark, no words (see the header). */
function Postmark(): ReactElement {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      className="absolute end-[14px] top-[14px] size-[108px] rotate-(--tilt-postmark) drop-shadow-[0_6px_14px_var(--color-shade)] md:start-[-56px] md:end-auto md:top-[-36px] md:size-[168px]"
      data-fo-postmark
    >
      <circle cx="100" cy="100" r="97" fill="var(--color-card)" />
      <circle
        cx="100"
        cy="100"
        r="92"
        fill="none"
        stroke="var(--color-mark)"
        strokeWidth="2"
      />
      <circle
        cx="100"
        cy="100"
        r="56"
        fill="none"
        stroke="var(--color-mark)"
        strokeWidth="1.5"
      />
      <g transform="translate(76 76)">
        <Mark size={48} />
      </g>
    </svg>
  );
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
      className={`pt-[28px] md:pt-[32px] md:pb-[24px] ${HOME_BLEED}`}
      aria-labelledby="hero-heading"
      data-fo-hero
    >
      <div className="grid grid-cols-1 [grid-template-areas:'copy'_'photo'_'letter'] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-[auto_1fr] md:items-start md:gap-x-[64px] md:[grid-template-areas:'copy_photo'_'letter_photo']">
        <div className="pb-[28px] [grid-area:copy] md:pt-[24px] md:pb-[36px]">
          <Eyebrow className="mb-[14px]">{t("hero.eyebrow")}</Eyebrow>
          {/* The document's one `<h1>` (AC-10). */}
          <Display
            as={headingLevel}
            id="hero-heading"
            size="hero"
            className="leading-(--line-height-hero) tracking-(--tracking-hero) [font-variation-settings:var(--font-variation-display-hero)]"
          >
            {t("hero.heading")}
          </Display>
          <p className="text-ink-muted text-body mt-[20px] max-w-[40ch] leading-[1.5] md:text-[21px]">
            {t("hero.proposition")}
          </p>
        </div>
        <figure
          className="relative -mx-[20px] [grid-area:photo] md:mx-0 md:mt-[28px]"
          data-fo-hero-photo
        >
          <MediaAsset
            assetId={HOME_HERO_ASSET}
            locale={locale}
            slot="hero"
            ratio="card"
            priority={priority}
            className="lg:rounded-hero max-md:aspect-[4/3] max-md:rounded-none"
          />
          <Postmark />
        </figure>
        <div className="relative mx-[4px] -mt-[64px] [grid-area:letter] md:mx-0 md:mt-0">
          <SentencePicker locale={locale} shopCountries={shopCountries} />
        </div>
      </div>
    </section>
  );
}
