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
 * **The band now holds a photograph, and the LCP element moved with it** (TASK-080). The slot is a
 * `MediaAsset` for `home-hero` marked `priority`, so it is the page's single LCP candidate: it
 * loads eagerly at `fetchpriority="high"` and emits its `<link rel="preload" as="image">` from the
 * same manifest lookup that produced its `srcset`, which is why the two cannot disagree (spec 006
 * AC-19). When the asset is missing, unapproved, byte-less or has no alt text in *this* locale the
 * band falls back to the reserved `--color-photo` box with **no `<img>`** (`plan/10` §3), and the
 * `H1` is the LCP element again. Both arms reserve the same box — a fixed height per breakpoint,
 * set before paint rather than measured after it — so the swap between them is **zero layout
 * shift and no template edit**, which is exactly what §2 asked the reserved slot for and what
 * TASK-080's data-flip proof measures (AC-20).
 *
 * The copy is the artboards' copy, in the first person (§14 A5): *our* florist, in the
 * recipient's town, and "we never ship a box" — the claim that distinguishes us from every parcel
 * service, and one we can keep.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Media } from "../media/Media.tsx";
import { MediaAsset } from "../media/MediaAsset.tsx";
import { isDisplayable } from "../media/resolve.ts";
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

/**
 * The full-bleed band's photograph in `seed/data/media.json` (spec 006 §2.4; TASK-080). A constant
 * rather than a prop: the locale home has one hero band, and a call site that could choose the
 * picture could also choose a picture the page has no alt text for.
 */
export const HOME_HERO_ASSET = "home-hero";

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
  /**
   * Is this band the **document's** single LCP candidate? `true` on the locale home, where it is;
   * `false` in `/dev/components`, where the document already has one and a second `priority` image
   * would emit a second `<link rel="preload" as="image">` and break the one-candidate rule
   * (`plan/01` §6, spec 006 AC-19).
   *
   * It is the same decision `headingLevel` makes and is a prop for the same reason: whether this
   * band is the page's subject is a fact about the **page**, which only the page knows. It cannot
   * be inferred here, and inferring it wrongly is a Core Web Vitals regression rather than a
   * visible bug — which is exactly the kind that survives review.
   */
  readonly priority?: boolean;
}

export function HomeHero({
  locale,
  headingLevel = "h1",
  priority = true,
}: HomeHeroProps): ReactElement {
  const t = useTranslations("home");
  // The one branch in this file, and it is a *data* question, not a layout one: has the founder
  // supplied and approved a photograph for this band, derived its bytes and written alt text in
  // this locale? `media/resolve.ts` owns the answer (spec 006 AC-18) and both arms reserve the
  // same box at the same two artboard heights, so the swap costs zero CLS and no template edit
  // (AC-20). The placeholder arm is kept rather than folded into `MediaAsset` because it carries
  // the artboards' **two** captions — the short one under the 300 px mobile slot and the long
  // shooting brief under the desktop band (TASK-054) — which a single placeholder key cannot say.
  const hasHeroPhoto = isDisplayable(HOME_HERO_ASSET, locale);

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
      {hasHeroPhoto ? (
        <MediaAsset
          assetId={HOME_HERO_ASSET}
          locale={locale}
          slot="hero"
          priority={priority}
          className="h-[300px] md:absolute md:inset-0 md:h-full"
        />
      ) : (
        <Media
          slot="hero"
          priority={priority}
          // No image exists, so there is nothing for a screen reader to be told about; the caption
          // below says what the slot will hold, in the catalogue's words. Written out rather than
          // defaulted, because `Media` has no default `alt` by design.
          alt=""
          // Two captions, one box: the mobile artboard writes a short caption under a 300 px slot
          // ("Photography to supply · Warsaw florist, morning light") and the desktop one the long
          // brief under a full-bleed band. Both are in the served HTML and CSS chooses — no media
          // query in JavaScript, no second request, and the shooting brief a photographer reads
          // stays the long one (TASK-054, closing the `/review 53` carry-forward).
          caption={
            <>
              <span className="md:hidden">{t("hero.photoCaptionMobile")}</span>
              <span className="hidden md:inline">{t("hero.photoCaption")}</span>
            </>
          }
          className="h-[300px] md:absolute md:inset-0 md:h-full"
        />
      )}
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
