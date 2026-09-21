/**
 * `OccasionTiles` — the artboards' "Shop by occasion" grid (spec 004 §13's 2026-09-08 resolution
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
import type { ReactElement } from "react";

import { MediaAsset } from "../media/MediaAsset.tsx";
import { Grid, Stack } from "../primitives/layout.tsx";
import { Display, Label, Text } from "../primitives/typography.tsx";

import { HOME_BLEED } from "./HomeHero.tsx";
import { OCCASIONS_ANCHOR, occasionTiles } from "./occasion-model.ts";

/** See `SiteHeader`'s twin: the registries hold dotted keys, not typed literals. */
type Translator = ReturnType<typeof useTranslations>;
type LabelTranslator = (key: string) => string;

/** Resolve a registry key (`occasions.nameDay.subtitle`). The one cast in this file. */
function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

export interface OccasionTilesProps {
  readonly locale: string;
  /** `h2` on the locale home; `h3` in `/dev/components`, where the section is nested. */
  readonly headingLevel?: "h2" | "h3";
}

const HEADING_ID = "occasions-heading";

export function OccasionTiles({
  locale,
  headingLevel = "h2",
}: OccasionTilesProps): ReactElement {
  const t = useTranslations();
  const home = useTranslations("home");
  const tiles = occasionTiles(locale);

  return (
    <Stack
      as="section"
      gap="lg"
      className={`py-2xl ${HOME_BLEED}`}
      aria-labelledby={HEADING_ID}
      data-fo-occasions
      id={OCCASIONS_ANCHOR}
    >
      <Stack gap="sm">
        <Label>{home("occasions.eyebrow")}</Label>
        <Display as={headingLevel} id={HEADING_ID} size="2xl">
          {home("occasions.heading")}
        </Display>
      </Stack>
      <Grid as="ul" columns="2-6" gap="lg">
        {tiles.map((tile) => (
          <Stack as="li" gap="sm" key={tile.id} data-fo-occasion={tile.id}>
            {/*
              The tile's photograph, or the captioned placeholder — one component, one reserved
              box, and the gate of `media/resolve.ts` deciding which (spec 006 AC-18). There is no
              `alt` prop: alt text is per-locale data from `seed/data/alt/{locale}.json`, so a
              locale with none renders the box rather than an English alt on a Polish page
              (TASK-080). `media.placeholder.occasion` is still the caption in the placeholder
              state — `MediaAsset` reads it from the same key this call site used to pass.
            */}
            <MediaAsset assetId={tile.assetId} locale={locale} slot="tile" />
            {tile.href === undefined ? (
              <Text as="span" size="sm" className="font-medium">
                {registryLabel(t, tile.nameKey)}
              </Text>
            ) : (
              // The published branch: a link, from the same loop, with no template edit — the
              // "an occasion is data" half of AC-14's promise.
              <a
                className="text-sm font-medium underline underline-offset-4"
                href={tile.href}
              >
                {registryLabel(t, tile.nameKey)}
              </a>
            )}
            <Text as="span" size="xs" tone="subtle">
              {registryLabel(t, tile.subtitleKey)}
            </Text>
          </Stack>
        ))}
      </Grid>
    </Stack>
  );
}
