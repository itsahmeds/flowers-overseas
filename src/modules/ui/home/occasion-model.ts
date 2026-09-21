/**
 * The occasion sections' projections (spec 004 §13's 2026-09-08 resolution note "occasion tiles",
 * design round 6's "Coming up in Poland" strip, AC-14, AC-15; TASK-053).
 *
 * The `finder-model.ts` pattern, for the same reason: every *data* decision the two occasion
 * sections make is made here — whether a tile is a link, what a date's label reads as, in which
 * zone a cutoff is stated — so the components hold no `published` branch and no `Intl` call, and
 * spec 008 flipping `published` in `src/config/occasions.ts` changes no file under `src/app/` and
 * no component.
 *
 * Two decisions worth reading before changing this file:
 *
 * **1. Dates are formatted, never computed.** `formatDate`/`formatTimeInZone` are spec 003's
 * (`fo/no-adhoc-intl` allows no other `Intl` call), and both are given the *destination's* zone,
 * so "1 Nov" and "14:00" are the recipient's calendar and the recipient's clock — `plan/03` §7's
 * rule and the one thing the benchmark study found only 1-800-Flowers doing. The instant comes
 * from the config; nothing here adds a day, subtracts a cutoff or reads a clock, which is what
 * keeps this correct on an ISR document that may be served weeks after it was rendered.
 *
 * **2. The occasion date is rendered at midday UTC.** A `YYYY-MM-DD` in the config is a calendar
 * date, not an instant; midday is the one hour of the day that lands on the same calendar date
 * in every European zone, so the box that says "1 November" cannot render "31 October" for a
 * reader whose formatter is given a different zone. The cutoff is a genuine instant and is used
 * as authored.
 */
import type { LocaleCode } from "../../../config/locales.ts";
import {
  OCCASION_TILES,
  type OccasionDate,
  type OccasionId,
  type OccasionTile,
  isOccasionPagePublished,
  occasionDates,
  occasionSlug,
} from "../../../config/occasions.ts";
import { formatDate, formatTimeInZone, localePath } from "../../i18n";

/**
 * The one cast in this file, and the same one `finder-model.ts` documents at length: the locale
 * set is provider-backed data (spec 003 AC-31), so validating against the static union here would
 * make a fifth locale a code change. The codes that reach this module have already passed the
 * routing gate (`dynamicParams = false` on the `[locale]` layout).
 */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/** The id of the occasion grid, so the section can be pointed at and screenshotted. */
export const OCCASIONS_ANCHOR = "occasions";

/** One tile as the grid renders it. */
export interface OccasionTileView {
  readonly id: OccasionId;
  /** `occasions.{id}.name` — the name is catalogue copy, never a literal (§7). */
  readonly nameKey: string;
  readonly subtitleKey: string;
  /**
   * The occasion page, or `undefined` while `published` is false. `undefined` is the whole of
   * AC-14's "never a dead link": the caller has nothing to link to and renders text.
   */
  readonly href: string | undefined;
  /**
   * The tile's photograph in `seed/data/media.json`, by id (spec 006 §2.4; TASK-080).
   *
   * Derived from the occasion's own id rather than authored in a second registry, so a seventh
   * occasion needs one asset row and no mapping table to keep in step. The id is allowed to name
   * an asset the dataset does not have: `MediaAsset` answers that with the captioned placeholder
   * and no `<img>` (`plan/10` §3), which is what keeps landing a photograph a data change with no
   * edit here and none under `src/app/` (AC-20).
   */
  readonly assetId: string;
}

/**
 * `nameDay` → `home-occasion-name-day`. The registry keys are camel-case TypeScript identifiers
 * and an asset id is a URL segment (`seed/schema/media.ts`'s `AssetIdSchema`), so one of the two
 * has to be derived from the other; deriving the id keeps `src/config/occasions.ts` the single
 * place an occasion is named.
 */
export function occasionAssetId(id: OccasionId): string {
  return `home-occasion-${id.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase()}`;
}

/**
 * The six tiles in the artboards' order (which is the founder's, not the collator's: this is a
 * merchandising row, and "Birthday" leads it in every locale).
 */
export function occasionTiles(locale: string): readonly OccasionTileView[] {
  return OCCASION_TILES.map((tile: OccasionTile): OccasionTileView => ({
    id: tile.id,
    nameKey: tile.nameKey,
    subtitleKey: tile.subtitleKey,
    href: isOccasionPagePublished(tile.id)
      ? localePath(locale, "occasions", occasionSlug(tile.id, locale))
      : undefined,
    assetId: occasionAssetId(tile.id),
  }));
}

/** One row of the "Coming up in Poland" strip, with its labels already in the reader's language. */
export interface OccasionDateView {
  readonly id: string;
  readonly nameKey: string;
  /** The date, in the destination's zone and the reader's format (`Sun 1 Nov`). */
  readonly date: string;
  /** The cutoff's date and wall clock, both in the destination's zone. */
  readonly orderBy:
    { readonly date: string; readonly time: string } | undefined;
  /** The alternative third line (`occasions.date.{id}.note`). */
  readonly noteKey: string | undefined;
}

/** Midday UTC — see the header: the hour that is the same calendar date in every European zone. */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/**
 * The destination's dated occasions, formatted. `countryIso2` is a parameter rather than a
 * constant because the strip is per destination: when spec 007 publishes a second country its
 * home band reads the same function with its own code.
 */
export function occasionDateViews(
  locale: string,
  countryIso2: string,
): readonly OccasionDateView[] {
  const code = localeCode(locale);
  return occasionDates(countryIso2).map(
    (row: OccasionDate): OccasionDateView => {
      const orderBy =
        row.orderBy === undefined
          ? undefined
          : {
              date: formatDate(
                new Date(row.orderBy),
                code,
                "deliveryDate",
                row.zone,
              ),
              time: formatTimeInZone(new Date(row.orderBy), code, row.zone, {
                zoneName: "shortGeneric",
              }),
            };
      return {
        id: row.id,
        nameKey: row.nameKey,
        date: formatDate(instantOf(row.date), code, "deliveryDate", row.zone),
        orderBy,
        noteKey: row.noteKey,
      };
    },
  );
}
