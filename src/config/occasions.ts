/**
 * Occasion registry for the locale home (spec 004 §2 "Everything data-gated is config", §5.1,
 * §13's 2026-09-08 resolution note "occasion tiles"; TASK-053).
 *
 * Two data sets, both drawn from the founder-approved artboards
 * (`docs/design/homepage-v1/homepage-desktop.dc.html`, `homepage-mobile.dc.html`) and both read
 * only by `src/modules/ui/home`:
 *
 *  - **`OCCASION_TILES`** — the six tiles of the "Shop by occasion" grid (Birthday, Name day,
 *    Anniversary, Sympathy, Just because, New baby), each with a per-locale slug, its name and
 *    subtitle message keys and `published: false`. Spec **008** owns the occasion pages
 *    (`plan/02` §4.1's `/{locale}/{occasions}/{slug}`), so in Phase 0 every tile renders as text
 *    and a photo placeholder and **not** as a link — the `site-links.ts` rule applied to a data
 *    registry, and the reason the home still has zero internal links to a non-200 URL (AC-14).
 *    008 flips `published` and the same loop renders links with no template edit.
 *  - **`OCCASION_DATES`** — the "Coming up in Poland" strip: the destination's real calendar
 *    dates with their order-by cutoffs, as data. Nothing is computed here (`plan/03` §9's
 *    calendar and spec 009's cutoff arithmetic are not this file's), and nothing is invented:
 *    each cutoff is a stored instant, and `tests/unit/occasions-config.test.ts` asserts it lands
 *    on the wall clock the artboard prints, in the recipient's own zone.
 *
 * Three notes for the next reader:
 *
 *  1. **A tile is not a catalogue occasion, and must not drift from one.** Spec 005's
 *    `src/config/catalogue/occasions.data.ts` is the closed facet value set that products
 *    reference; this file is the *homepage navigation* over six of those values. `catalogueKey`
 *    is parsed against that set, so a tile for an occasion the taxonomy does not have fails at
 *    module load rather than linking to an empty shop page in 008.
 *  2. **Names and subtitles are message keys, never strings** (§7, `CLAUDE.md`): `occasions.*`
 *    in the catalogues, pinned to the tile's own id by the refinement below so a copy/paste
 *    cannot print "Name day" under the sympathy slug.
 *  3. **The dates carry a year and therefore an expiry.** They are the next occurrence of each
 *    date as authored (2026-11-01 → 2027-03-08); a unit test fails once the last of them is in
 *    the past, because a strip that prints a date that has already gone is worse than no strip.
 *    Rolling them forward is a data edit in this file — never date arithmetic in a component,
 *    which on an ISR document would be computed at revalidation time and served stale.
 *
 * No database is read here and none may be (`pnpm check:no-db`, spec 004 AC-2). Spec 002's
 * `occasion`/`occasion_translation` and `occasion_country` tables are the later persistence
 * target; the projection onto `occasion` rows stays with spec 005's dataset (ADR-0017), which is
 * why this file ships none.
 */
import { z } from "zod";

import { occasionKeys } from "./catalogue/schemas.ts";
import { launchLocales } from "./locales.ts";

/** Lowercase ASCII, hyphen-separated, no slash — `plan/02` §4's slug rule. */
const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be a lowercase ASCII, hyphen-separated slug with no slash (plan/02 §4)",
  );

/** A dotted `occasions.*` message key. Pinned to the row's id by the refinements below. */
const MessageKeySchema = z
  .string()
  .regex(
    /^occasions\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+$/,
    "must be a dotted `occasions.*` message key",
  );

/** The spec that publishes the target, as its three-digit id (`008`). */
const OwningSpecSchema = z
  .string()
  .regex(/^0\d{2}$/, "must be a three-digit spec id such as `008`");

/**
 * One slug per launch locale, and no locale missing — the `countries.ts` rule, for the same
 * reason: an occasion with no URL in a locale has no page there, and that must fail the parse
 * rather than throw at render time.
 */
const SlugsSchema = z
  .object(
    Object.fromEntries(
      launchLocales.map((code) => [code, SlugSchema]),
    ) as Record<string, typeof SlugSchema>,
  )
  .strict();

export const OccasionTileSchema = z
  .object({
    /** Stable id, camelCase so it is also the message-key segment (`occasions.nameDay.name`). */
    id: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*$/, "must be a camelCase occasion id"),
    /** The facet value in spec 005's taxonomy this tile navigates to (`occasions.data.ts`). */
    catalogueKey: z.enum(occasionKeys),
    nameKey: MessageKeySchema,
    subtitleKey: MessageKeySchema,
    slugs: SlugsSchema,
    /** May the tile be rendered as a link? `false` → text and a photo placeholder (AC-14). */
    published: z.boolean(),
    owningSpec: OwningSpecSchema,
  })
  .strict()
  .superRefine((tile, ctx) => {
    for (const [field, suffix] of [
      ["nameKey", "name"],
      ["subtitleKey", "subtitle"],
    ] as const) {
      const expected = `occasions.${tile.id}.${suffix}`;
      if (tile[field] !== expected) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${field} of \`${tile.id}\` must be \`${expected}\`, found \`${tile[field]}\``,
        });
      }
    }
  });

/** A tile as the schema parses it (`id` is any shape-valid id). */
export type ParsedOccasionTile = z.infer<typeof OccasionTileSchema>;

/** A tile as the application reads it: `id` narrowed to the configured set. */
export type OccasionTile = Omit<ParsedOccasionTile, "id"> & { id: OccasionId };

/** Registry-level refinements: unique ids, unique slugs inside each locale. */
export const OccasionTileRegistrySchema = z
  .array(OccasionTileSchema)
  .min(1)
  .superRefine((tiles, ctx) => {
    const seen = new Set<string>();
    tiles.forEach((tile, index) => {
      if (seen.has(tile.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate occasion id \`${tile.id}\``,
        });
      }
      seen.add(tile.id);
    });

    const owner = new Map<string, string>();
    tiles.forEach((tile, index) => {
      for (const [locale, slug] of Object.entries(tile.slugs)) {
        const key = `${locale}/${slug}`;
        const existing = owner.get(key);
        if (existing !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "slugs", locale],
            message: `slug \`${slug}\` is already used by \`${existing}\` in locale \`${locale}\``,
          });
        }
        owner.set(key, tile.id);
      }
    });
  });

/**
 * The six tiles the artboards draw, in their order. Slugs are `plan/02` §4.1's shape in each
 * launch locale, ASCII-folded; spec 008 revisits them with the occasion copy before any of these
 * URLs is published, which is exactly what `published: false` protects.
 */
const tiles = [
  {
    id: "birthday",
    catalogueKey: "birthday",
    nameKey: "occasions.birthday.name",
    subtitleKey: "occasions.birthday.subtitle",
    slugs: {
      en: "birthday",
      "en-gb": "birthday",
      de: "geburtstag",
      pl: "urodziny",
    },
    published: false,
    owningSpec: "008",
  },
  {
    id: "nameDay",
    catalogueKey: "name_day",
    nameKey: "occasions.nameDay.name",
    subtitleKey: "occasions.nameDay.subtitle",
    slugs: {
      en: "name-day",
      "en-gb": "name-day",
      de: "namenstag",
      pl: "imieniny",
    },
    published: false,
    owningSpec: "008",
  },
  {
    id: "anniversary",
    catalogueKey: "anniversary",
    nameKey: "occasions.anniversary.name",
    subtitleKey: "occasions.anniversary.subtitle",
    slugs: {
      en: "anniversary",
      "en-gb": "anniversary",
      de: "jahrestag",
      pl: "rocznica",
    },
    published: false,
    owningSpec: "008",
  },
  {
    id: "sympathy",
    catalogueKey: "sympathy",
    nameKey: "occasions.sympathy.name",
    subtitleKey: "occasions.sympathy.subtitle",
    slugs: {
      en: "sympathy",
      "en-gb": "sympathy",
      de: "trauer",
      pl: "kondolencje",
    },
    published: false,
    owningSpec: "008",
  },
  {
    id: "justBecause",
    catalogueKey: "just_because",
    nameKey: "occasions.justBecause.name",
    subtitleKey: "occasions.justBecause.subtitle",
    slugs: {
      en: "just-because",
      "en-gb": "just-because",
      de: "einfach-so",
      pl: "bez-okazji",
    },
    published: false,
    owningSpec: "008",
  },
  {
    id: "newBaby",
    catalogueKey: "new_baby",
    nameKey: "occasions.newBaby.name",
    subtitleKey: "occasions.newBaby.subtitle",
    slugs: {
      en: "new-baby",
      "en-gb": "new-baby",
      de: "geburt",
      pl: "narodziny",
    },
    published: false,
    owningSpec: "008",
  },
] as const;

/** Parsed at module load: a malformed registry throws on first import, never at request time. */
export const OCCASION_TILES = OccasionTileRegistrySchema.parse(
  tiles,
) as readonly OccasionTile[];

/** The closed set of tile ids, as a literal union: an unknown id is a type error. */
export type OccasionId = (typeof tiles)[number]["id"];

const byId = new Map<string, OccasionTile>(
  OCCASION_TILES.map((tile) => [tile.id, tile]),
);

/** Look a tile up by id. Throws on an unknown id: the set is closed data. */
export function occasionTile(id: OccasionId): OccasionTile {
  const tile = byId.get(id);
  if (tile === undefined) throw new Error(`unknown occasion id: ${id}`);
  return tile;
}

/**
 * The occasion slug in a locale. Returns the slug and never a path, so `localePath()` stays the
 * one URL builder (spec 003 §6).
 */
export function occasionSlug(id: OccasionId, locale: string): string {
  const slugs: Readonly<Record<string, string>> = occasionTile(id).slugs;
  const slug = slugs[locale];
  if (slug === undefined) {
    throw new Error(`no slug for occasion ${id} in locale ${locale}`);
  }
  return slug;
}

/**
 * The one predicate over `published` (spec 004 §5.1's contract: one predicate per flag). `false`
 * for every tile in Phase 0, so no caller can render an occasion link.
 */
export function isOccasionPagePublished(id: OccasionId): boolean {
  return occasionTile(id).published;
}

/* ------------------------------------------------------------------------------------------ */

/**
 * One dated occasion in a destination — a row of the artboards' "Coming up in Poland" strip.
 *
 * `orderBy` and `note` are exclusive and one is required: the strip's third line is either the
 * cutoff for that date or a fact about it (Women's Day has no cutoff on the artboard because it
 * is five months out), and an empty third line would leave a hole in the grid.
 */
export const OccasionDateSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-zA-Z0-9]*$/, "must be a camelCase occasion-date id"),
    /** ISO-3166-1 alpha-2 of the destination whose calendar this is. */
    countryIso2: z
      .string()
      .regex(/^[A-Z]{2}$/, "must be a two-letter uppercase ISO-3166-1 code"),
    /** `occasions.date.{id}.name` — the date's name, per locale, in the catalogue. */
    nameKey: MessageKeySchema,
    /** The calendar date in the destination, `YYYY-MM-DD`. */
    date: z.iso.date(),
    /**
     * The order-by cutoff as an **instant**, so the wall clock it prints is a property of the
     * recipient's zone and not of the reader's. Authored, never computed: spec 009 owns cutoff
     * arithmetic and this file owns the four dates the founder's design prints.
     */
    orderBy: z.iso.datetime().optional(),
    /** `occasions.date.{id}.note` — the alternative third line. */
    noteKey: MessageKeySchema.optional(),
    /**
     * The destination's IANA zone. Carried here because `countries.ts` deliberately holds no
     * `iana_zone` (spec 005/009 own that column); spec 009 takes it over with no call-site
     * change, because only `occasionDates()` reads it.
     */
    zone: z.string().min(1),
  })
  .strict()
  .superRefine((row, ctx) => {
    const expected = `occasions.date.${row.id}.name`;
    if (row.nameKey !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["nameKey"],
        message: `nameKey of \`${row.id}\` must be \`${expected}\`, found \`${row.nameKey}\``,
      });
    }
    const expectedNote = `occasions.date.${row.id}.note`;
    if (row.noteKey !== undefined && row.noteKey !== expectedNote) {
      ctx.addIssue({
        code: "custom",
        path: ["noteKey"],
        message: `noteKey of \`${row.id}\` must be \`${expectedNote}\`, found \`${row.noteKey}\``,
      });
    }
    if ((row.orderBy === undefined) === (row.noteKey === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["orderBy"],
        message: `\`${row.id}\` must carry exactly one of \`orderBy\` and \`noteKey\`: the strip's third line is either the cutoff or a fact about the date`,
      });
    }
    if (
      row.orderBy !== undefined &&
      !(new Date(row.orderBy) < new Date(row.date))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["orderBy"],
        message: `the cutoff of \`${row.id}\` is not before the date it is a cutoff for`,
      });
    }
  });

export type OccasionDate = z.infer<typeof OccasionDateSchema>;

export const OccasionDateRegistrySchema = z
  .array(OccasionDateSchema)
  .min(1)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      if (seen.has(row.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `duplicate occasion-date id \`${row.id}\``,
        });
      }
      seen.add(row.id);
    });
    // Calendar order, because the strip reads as a calendar and nothing sorts it at render time.
    const dates = rows.map((row) => row.date);
    if ([...dates].sort().join() !== dates.join()) {
      ctx.addIssue({
        code: "custom",
        path: [0, "date"],
        message: "occasion dates must be authored in calendar order",
      });
    }
  });

/**
 * The four Polish dates the artboards print, with the cutoffs they print, as the next occurrence
 * of each. Every instant below is 14:00 in Warsaw on the day the artboard names — asserted in
 * `tests/unit/occasions-config.test.ts` rather than trusted, because an authored UTC instant is
 * the one field in this file a daylight-saving change can silently move.
 */
const dates = [
  {
    id: "allSaints",
    countryIso2: "PL",
    nameKey: "occasions.date.allSaints.name",
    date: "2026-11-01",
    orderBy: "2026-10-30T13:00:00Z",
    zone: "Europe/Warsaw",
  },
  {
    id: "andrzejki",
    countryIso2: "PL",
    nameKey: "occasions.date.andrzejki.name",
    date: "2026-11-29",
    orderBy: "2026-11-28T13:00:00Z",
    zone: "Europe/Warsaw",
  },
  {
    id: "wigilia",
    countryIso2: "PL",
    nameKey: "occasions.date.wigilia.name",
    date: "2026-12-24",
    orderBy: "2026-12-22T13:00:00Z",
    zone: "Europe/Warsaw",
  },
  {
    id: "womensDay",
    countryIso2: "PL",
    nameKey: "occasions.date.womensDay.name",
    date: "2027-03-08",
    noteKey: "occasions.date.womensDay.note",
    zone: "Europe/Warsaw",
  },
] as const;

/** Parsed at module load, like every registry in this directory. */
export const OCCASION_DATES = OccasionDateRegistrySchema.parse(
  dates,
) as readonly OccasionDate[];

/** The dated occasions of one destination, in calendar order. */
export function occasionDates(countryIso2: string): readonly OccasionDate[] {
  return OCCASION_DATES.filter((row) => row.countryIso2 === countryIso2);
}
