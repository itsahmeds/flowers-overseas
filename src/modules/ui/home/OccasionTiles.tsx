/**
 * `OccasionTiles` — the "Shop by occasion" arches (v2: spec 004 §14 A20, A21; TASK-177: six arched
 * photographs, each a link to its occasion hub where that page exists), first drawn as the grid (spec 004 §13's 2026-09-08 resolution
 * note "occasion tiles", §14 A5, AC-14, AC-15; TASK-053;
 * `docs/design/homepage-v1/homepage-desktop.dc.html`, `homepage-mobile.dc.html`).
 *
 * Six tiles — Birthday, Name day, Anniversary, Sympathy, Just because, New baby — each a square
 * photo slot, a name and a one-line subtitle, from `src/config/occasions.ts`. The subtitle under
 * "Name day" is the one line in this section that earns its place commercially: *Imieniny, the
 * Polish tradition* is the reason a buyer in Berlin sending to Kraków is on this page at all, and
 * no competitor in the benchmark set explains it.
 *
 * **Nothing here is a link, and that is the deliverable.** Spec 008 owns the occasion pages, so
 * every tile carries `published: false` and renders as text plus a placeholder — the same
 * "unpublished target renders as text, never as a dead link" rule the header, the footer and the
 * destination list follow, and the reason the home still has zero internal links to a non-200 URL
 * (AC-14). When 008 flips the flag, `occasionTiles()` starts answering with an `href` and the
 * same loop renders an `<a>`: a data change, with no edit here and none under `src/app/`.
 *
 * **The photo slots hold the founder's six approved photographs** (TASK-080). Each box is a
 * `MediaAsset` keyed on `tile.assetId` — `home-occasion-{id}` in `seed/data/media.json` — with its
 * alt text read per locale from `seed/data/alt/{locale}.json`. A tile whose asset is missing,
 * unapproved, has no derived bytes or has no alt text in *this* locale renders the
 * `--color-photo` gradient with `media.placeholder.occasion` and **no `<img>`** (`plan/10` §3,
 * spec 006 AC-18) — one key for all six, because the sentence is about the kind of photograph and
 * not about the occasion. Nothing in this file decides which of the two happens: the gate is
 * `media/resolve.ts`'s, so a seventh occasion, a withdrawn image or a missing Polish alt is a data
 * change with no edit here (AC-20).
 *
 * The grid is `Grid columns="2-6"` — **2-up mobile, 6-up desktop** (TASK-054, closing the
 * `/review 53` carry-forward: the 3-up desktop rendering left six ~430 px empty placeholder
 * squares, which is not what the artboard draws). The artboards draw 3-up mobile and 6-up
 * desktop; the mobile half stays 2-up, because at 390 px a 3-up row leaves a 106 px tile whose
 * subtitle wraps to four lines, and the TASK-053 row settled that half in the primitive's
 * favour. `MEDIA_SLOT_SPECS.tile` states its `sizes` for this geometry (50vw mobile, ~17vw
 * desktop) and the two cannot be changed apart without failing
 * `tests/unit/ui-media.test.ts`.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { MediaAsset } from "../media/MediaAsset.tsx";
import { Display, Eyebrow } from "../primitives/typography.tsx";

import { HOME_BLEED, HOME_SECTION } from "./HomeHero.tsx";
import { OCCASIONS_ANCHOR, occasionTiles } from "./occasion-model.ts";

type LabelTranslator = (key: string) => string;

export interface OccasionTilesProps {
  readonly locale: string;
  readonly headingLevel?: "h2" | "h3";
  /**
   * Catalogue occasion key → its hub's URL in this locale, for the hubs that exist and may be
   * linked (from the page; `src/modules/ui` may not read the catalogue). A tile with no entry
   * is a photograph and a name, not a control (spec 004 §14 A20).
   */
  readonly hubHrefs?: Readonly<Record<string, string>>;
}

const HEADING_ID = "occasions-heading";

function TileLink({
  href,
  children,
}: {
  readonly href: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  if (href === undefined) return children;
  return (
    <a
      className="block no-underline hover:[&_h3]:underline hover:[&_h4]:underline"
      href={href}
    >
      {children}
    </a>
  );
}

export function OccasionTiles({
  locale,
  headingLevel = "h2",
  hubHrefs = {},
}: OccasionTilesProps): ReactElement {
  const t = useTranslations() as unknown as LabelTranslator;
  const home = useTranslations("home");
  const tiles = occasionTiles(locale, hubHrefs);
  const NameHeading = headingLevel === "h2" ? "h3" : "h4";

  return (
    <section
      className={`${HOME_SECTION} ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-occasions
      id={OCCASIONS_ANCHOR}
    >
      <div className="mb-[28px] md:mb-[48px]">
        <Eyebrow className="mb-[14px]">{home("occasions.eyebrow")}</Eyebrow>
        <Display as={headingLevel} id={HEADING_ID} size="display-s">
          {home("occasions.heading")}
        </Display>
      </div>
      <ul className="grid grid-cols-2 gap-x-[16px] gap-y-[28px] md:grid-cols-6 md:gap-[24px]">
        {tiles.map((tile) => (
          <li key={tile.id} data-fo-occasion={tile.id}>
            <TileLink href={tile.href}>
              {/*
                The tile's photograph in the arch, or the captioned placeholder in the same box
                (spec 006 AC-18); alt text is per-locale data (TASK-080).
              */}
              <MediaAsset
                assetId={tile.assetId}
                locale={locale}
                slot="tile"
                ratio="arch"
              />
              <NameHeading className="display text-h3-s md:text-h3 mt-[12px] text-center">
                {t(tile.nameKey)}
              </NameHeading>
              <p className="text-ink-subtle text-center text-sm">
                {t(tile.subtitleKey)}
              </p>
            </TileLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
