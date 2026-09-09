/**
 * `HomeHero` — the locale home's above-the-fold band (spec 004 §2 "Locale-home skeleton", §5.3,
 * §13's 2026-09-08 resolution note, §14 A5, AC-10; TASK-052).
 *
 * §5's "H1 + proposition + picker" skeleton is **superseded** by the founder-approved artboards
 * (`docs/design/homepage-v1/homepage-desktop.dc.html`, `homepage-mobile.dc.html`), which draw one
 * band: a full-bleed photograph with a paper card on it carrying the eyebrow label, the `H1`, the
 * proposition and the finder. This component is that band, at both artboard geometries:
 *
 *  - **desktop (1440 px artboard)**: an 820 px section, the photo slot absolutely filling it, the
 *    560 px card centred in the block axis at the inline start, 56 px in — the same inline offset
 *    the header and footer use, so the card's edge lines up with the wordmark above it;
 *  - **mobile (390 px artboard)**: a 300 px photo slot, then the card pulled 56 px up over it with
 *    a 16 px inline margin, which is the artboard's overlap exactly.
 *
 * **The LCP element is the `H1`, and it is text** (§6 "CWV budget impact"): the photo slot renders
 * the `--color-photo` gradient and **no `<img>`** (`plan/10` §3 — spec 006 has generated no
 * imagery and a demo that shows a photograph it does not have is the one thing that rule
 * forbids), so there is no image to preload and nothing to preload beyond the two self-hosted
 * font subsets `fontVariables` already preloads. Both slots reserve their box — a fixed height per
 * breakpoint, set before paint rather than measured after it — so when 006 lands imagery the LCP
 * element changes from text to image with **no layout shift and no template edit**, which is
 * exactly what §2 asks the reserved slot for.
 *
 * The copy is the artboards' copy, in the first person (§14 A5): *our* florist, in the
 * recipient's town, and "we never ship a box" — the claim that distinguishes us from every parcel
 * service, and one we can keep.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Media } from "../media/Media.tsx";
import { Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { FinderCard } from "./FinderCard.tsx";

/**
 * The page's inline gutter, identical to `SiteHeader`'s `BLEED` (16 px mobile / 56 px desktop,
 * the two artboard margins). Restated rather than imported so the header stays untouched by this
 * task; `tests/unit/ui-home.test.tsx` pins the two strings against each other.
 */
export const HOME_BLEED = "px-md md:px-[56px]";

/** The two artboard geometries, as one place a reviewer can check against the `.dc.html` files. */
export const HERO_HEIGHTS = { mobilePhoto: 300, desktopBand: 820 } as const;

export interface HomeHeroProps {
  readonly locale: string;
  /**
   * The heading's **level**, which is a structure decision and not a design one (the size is
   * fixed by the artboard either way — see `Display`'s own note). It is `h1` on the locale home,
   * where this band is the document's subject, and `h2` in `/dev/components`, where the document
   * already has an `<h1>` and a second one would be a critical axe finding (AC-26) as well as a
   * lie about the page's structure.
   */
  readonly headingLevel?: "h1" | "h2";
}

export function HomeHero({
  locale,
  headingLevel = "h1",
}: HomeHeroProps): ReactElement {
  const t = useTranslations("home");

  return (
    <section
      className="relative flex flex-col md:h-[820px] md:justify-center"
      data-fo-hero
    >
      {/*
        The reserved photo slot. `priority` is this page's single candidate (`plan/01` §6, one per
        page): the hero is the only above-the-fold slot on the locale home, and nominating it here
        means spec 006's imagery arrives already marked as the LCP candidate rather than being
        found by a later audit. It renders no `<img>` today, so it costs nothing to nominate.
      */}
      <Media
        slot="hero"
        priority
        // No image exists, so there is nothing for a screen reader to be told about; the caption
        // below says what the slot will hold, in the catalogue's words. Written out rather than
        // defaulted, because `Media` has no default `alt` by design.
        alt=""
        caption={t("hero.photoCaption")}
        className="h-[300px] md:absolute md:inset-0 md:h-full"
      />
      {/*
        The card. On mobile it overlaps the photo by 56 px (`-mt-[56px]`, the artboard's overlap);
        on desktop it is positioned in the inline-start gutter and centred in the band. `relative`
        keeps it above the absolutely positioned slot without a z-index — the named layer scale is
        for elements that overlap *chrome*, and this one only overlaps its own section.
      */}
      <div
        className="bg-surface mx-md py-lg relative -mt-[56px] px-[20px] shadow-md md:mx-0 md:ms-[56px] md:mt-0 md:w-[560px] md:px-[36px] md:py-[32px]"
        data-fo-hero-card
      >
        <Stack gap="lg">
          <Stack gap="sm">
            <Label className="text-accent">{t("hero.eyebrow")}</Label>
            {/* The document's one `<h1>` (§5.3, AC-10) and the LCP element. */}
            <Display as={headingLevel} size="display-s">
              {t("hero.heading")}
            </Display>
            <Text size="md" tone="muted" measure>
              {t("hero.proposition")}
            </Text>
          </Stack>
          <FinderCard locale={locale} />
        </Stack>
      </div>
    </section>
  );
}
