/**
 * Destination-country registry (spec 004 §2 "Everything data-gated is config", §5.1, §13 Q12;
 * TASK-047).
 *
 * The Phase 0 source of truth for the seven destinations the founder-approved design renders in
 * its destinations grid and in the home finder: **PL delivering now**, plus **DE, FR, ES, IT, RO,
 * NL** as guide-and-waiting-list (spec 004 §13 Q12 / `plan/13` A7, and the grid drawn in
 * `docs/design/homepage-v1/homepage-desktop.dc.html`). No database is read here and none may be
 * (`pnpm check:no-db`, spec 004 AC-2): spec 002 §5.1's `country` table stays the later
 * persistence target and `toCountryRow()` is the projection its seed reads, so the two cannot
 * drift.
 *
 * Three things about this file are load-bearing for later specs:
 *
 *  - **`corridorPagePublished` and `guidePublished` are the Phase 0 corridor go-live switches.**
 *    TASK-091 set `guidePublished: true` on all seven, because the seven `en` and seven `en-gb`
 *    guides are authored and parsed: that flag **is** `plan/02` §5.1's existence rule, so flipping
 *    it is what creates the corridor URLs — a data change, with no edit under `src/app/` (spec 007
 *    AC-5, AC-7). TASK-092 flipped `corridorPagePublished` to `true` on all seven, which is the
 *    registry half of "this destination may be linked": the finder, the destinations grid, the
 *    hub and the footer render a link only where that flag, the destination's `site-links.ts`
 *    corridor id (`isPublished`) **and** the per-locale existence rule all hold, so `/de` and
 *    `/pl` — which have no authored guide — still render every destination as text and the site
 *    still has zero internal links to a non-200 URL (spec 004 AC-14, spec 007 AC-17, AC-20).
 *    Spec 007 flips them and those surfaces become navigation with **no template edit** — the
 *    `plan/09` "a new country is data" promise applied to the layout (AC-11). As in spec 003 §12,
 *    a config-file flag is a bounded, stated deviation from `CLAUDE.md`'s "go-live is a data flip
 *    in admin, never a code change": there is no database and no admin yet, each flag is read
 *    through exactly one predicate (`isCorridorPagePublished`, `isGuidePublished`), and spec 002's
 *    `country.guide_published` plus spec 012's admin take the authority over with no call-site
 *    change (spec 004 §12).
 *  - **`slugs` is human-authored URL data**, one slug per launch locale, taken from `plan/02` §4.1
 *    and §4.2's worked examples (`poland` / `polen` / `polska`) and extended to the other six
 *    destinations in the same forms. It is never machine drafted (spec 003 §6): a slug is a URL,
 *    and `localePath()` is the only builder that may consume it. ASCII-lowercase-hyphen shape and
 *    per-locale uniqueness are refined below, so a German slug cannot appear on a Polish URL.
 *  - **Country *names* are message keys, not strings.** `nameKey` points at `destinations.*` in
 *    the catalogues (spec 004 §7: UI strings until spec 002 seeds CLDR / `country_translation`),
 *    which keeps `CLAUDE.md`'s "no literal user-facing string" rule true for the one registry that
 *    would otherwise carry seven exonyms per locale.
 *
 * `status` is spec 002 §5.1's `country.status` enum verbatim (`demo | live | disabled`). PL is
 * `live` — the state the founder-approved canvas labels "Delivering now" — and the six guide
 * countries are `demo`, which is the state spec 002's seed gives every country it ships.
 */
import { z } from "zod";

import { buildDatabaseConfigured } from "../lib/build-login.ts";
import { pickerState } from "../modules/geo/delivery/state.ts";

import { launchLocales } from "./locales.ts";

/**
 * The operational facts a **live** corridor page renders (spec 007 §5.1's second contract; spec
 * 002 §5.1's `iana_zone`, `same_day_cutoff_local`, `delivery_days`, `sunday_delivery`).
 *
 * It lives here, in the registry that owns the country row, and `src/modules/geo` re-exports it:
 * the cutoff is country data, and a module that defined it would be a second place a cutoff could
 * be authored.
 */
export const CountryOperationsSchema = z
  .object({
    /** IANA zone of the **recipient**, named on the page (`plan/03` §7, §10). */
    ianaZone: z.string().min(3),
    /** `HH:MM` in the recipient's local time. */
    sameDayCutoffLocal: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    /** ISO-8601 weekday numbers, 1 = Monday. */
    deliveryDays: z.array(z.number().int().min(1).max(7)).min(1),
    /** Spec 002 §5.1 `country.sunday_delivery`, verbatim. */
    sundayDelivery: z.enum(["none", "peak", "always"]),
  })
  .strict();

export type CountryOperations = z.infer<typeof CountryOperationsSchema>;

/** `country.status` CHECK constraint of spec 002 §5.1, verbatim. */
export const countryStatuses = ["demo", "live", "disabled"] as const;
export type CountryStatus = (typeof countryStatuses)[number];

/** ISO-3166-1 alpha-2, uppercase — spec 002 §5.1's `country.iso2`. */
const Iso2Schema = z
  .string()
  .regex(
    /^[A-Z]{2}$/,
    "must be a two-letter uppercase ISO-3166-1 alpha-2 code",
  );

/** Lowercase ASCII, hyphen-separated, no slash — `plan/02` §4's slug rule. */
const SlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be a lowercase ASCII, hyphen-separated slug with no slash (plan/02 §4)",
  );

/**
 * A `destinations.*` message key. The refinement below pins it to the country's own ISO code, so
 * a copy/paste that leaves `destinations.de.name` on the French row fails the parse rather than
 * printing "Germany" under a French slug.
 */
const MessageKeySchema = z
  .string()
  .regex(
    /^destinations\.[a-z0-9]+(?:\.[a-zA-Z0-9]+)+$/,
    "must be a dotted `destinations.*` message key",
  );

/**
 * One slug per launch locale, and no locale missing: the object is built from the registry rather
 * than hand-listed, so adding a fifth launch locale fails this parse until its slugs are authored
 * (which is the intended cost — a locale with no URL for a destination has no corridor page).
 */
const SlugsSchema = z
  .object(
    Object.fromEntries(
      launchLocales.map((code) => [code, SlugSchema]),
    ) as Record<string, typeof SlugSchema>,
  )
  .strict();

/**
 * The regions the all-destinations hub groups its destinations into, **in the order the hub
 * renders them** (founder ruling 2026-09-15 (b), recorded in `docs/decisions-log.md`:
 * Central Europe DE·NL·PL · Western and Southern Europe FR·ES·IT · South-eastern Europe RO;
 * `docs/design/wireframes/all-destinations-desktop.dc.html`).
 *
 * A region is **country data**, so it lives on the registry row rather than in the hub: an eighth
 * destination cannot be added without saying where in Europe it is, and the hub then groups it
 * with no template edit (spec 007 AC-7's "a new country is data").
 */
export const countryRegions = [
  "centralEurope",
  "westernSouthernEurope",
  "southEasternEurope",
] as const;

export type CountryRegion = (typeof countryRegions)[number];

/**
 * The hub's heading key for a region — `destinationsHub.region.*`, never a literal (§7).
 *
 * The keys are written out rather than composed, for `pnpm i18n:check`'s usage scan: a key that
 * only ever exists as a template literal reads as unused, and an unused key is deleted by the
 * next person who runs the check. It is the same rule `nameKey` and `citiesKey` follow above.
 */
const REGION_HEADING_KEYS: Readonly<Record<CountryRegion, string>> = {
  centralEurope: "destinationsHub.region.centralEurope",
  westernSouthernEurope: "destinationsHub.region.westernSouthernEurope",
  southEasternEurope: "destinationsHub.region.southEasternEurope",
};

export function regionHeadingKey(region: CountryRegion): string {
  return REGION_HEADING_KEYS[region];
}

export const CountryConfigSchema = z
  .object({
    iso2: Iso2Schema,
    /** Spec 002 §5.1 `country.status`; `live` is the canvas's "Delivering now" state. */
    status: z.enum(countryStatuses),
    /** Which group of the all-destinations hub this destination is rendered in (spec 007 §5.3). */
    region: z.enum(countryRegions),
    /** `destinations.{iso2 lowercased}.name` — the country name, per locale, in the catalogue. */
    nameKey: MessageKeySchema,
    /**
     * Optional key for the endonym city line the canvas prints under a delivering destination
     * ("Warszawa · Kraków · Wrocław · Gdańsk · Poznań"). Absent for a country we do not deliver
     * to, because naming cities there would claim coverage we do not have (`plan/10` §3).
     */
    citiesKey: MessageKeySchema.optional(),
    /** Per-locale corridor slug (`plan/02` §4.1). */
    slugs: SlugsSchema,
    /**
     * The country's place in every country list a buyer chooses from: the picker's buttons, the
     * chooser, the menus (spec 004 §14 A-founder-2026-10-24a item 1 and "Data model": spec 002's
     * `country.sort_weight int NOT NULL DEFAULT 0`). Lower comes first; ties are ordered by the
     * country's name in the reader's collation, never by this file's order, so no country is first
     * because of where it was typed (item 13: no "Poland first"). Set in the admin from spec 012b;
     * here until its cutover.
     */
    sortWeight: z.number().int(),
    /** Corridor page exists and may be linked (spec 007 flips it; AC-11, AC-14). */
    corridorPagePublished: z.boolean(),
    /** Spec 002 §5.1 `country.guide_published`: the corridor guide's copy exists. */
    guidePublished: z.boolean(),
    /**
     * The operational facts a **live** corridor page renders (spec 007 §5.1's second contract,
     * AC-2; TASK-087): the recipient's zone, the same-day cutoff in it, the delivery weekdays and
     * the Sunday rule — spec 002 §5.1's `iana_zone`, `same_day_cutoff_local`, `delivery_days` and
     * `sunday_delivery`.
     *
     * **Authored for Poland only** (spec 009 §13 Q3, founder ruling 2026-09-16; TASK-124):
     * `Europe/Warsaw`, `14:00`, Monday–Saturday, no Sunday delivery. Every other destination has
     * no block, and that absence is the point — no florist has been signed there, so no cutoff has
     * been agreed, there is **no global default cutoff**, and a missing block is spec 009's
     * `unavailable` picker state: no dates, no cutoff, one honest sentence. A country whose block
     * is missing also cannot have a `live` corridor file (`pnpm corridor:check`'s `live-operations`
     * rule refuses one), so a cutoff we cannot honour is unrenderable rather than merely unwritten.
     *
     * A block alone promises nothing. Poland's makes its picker `preview` (the full calendar, every
     * date closed, labelled as a demonstration) because `hasActivePartners("PL")` is still false;
     * `deliveryDatesOpen()` below is what the chrome asks, and it is false until a florist is
     * signed. `COUNTRY_ROW_COLUMNS` / `toCountryRow()` do **not** project the block yet: spec 002's
     * `country.iana_zone` is `NOT NULL`, and six destinations have no zone anybody agreed to.
     */
    operations: CountryOperationsSchema.optional(),
  })
  .strict()
  .superRefine((country, ctx) => {
    const expectedName = `destinations.${country.iso2.toLowerCase()}.name`;
    if (country.nameKey !== expectedName) {
      ctx.addIssue({
        code: "custom",
        path: ["nameKey"],
        message: `nameKey of \`${country.iso2}\` must be \`${expectedName}\`, found \`${country.nameKey}\``,
      });
    }
    const expectedCities = `destinations.${country.iso2.toLowerCase()}.cities`;
    if (
      country.citiesKey !== undefined &&
      country.citiesKey !== expectedCities
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["citiesKey"],
        message: `citiesKey of \`${country.iso2}\` must be \`${expectedCities}\`, found \`${country.citiesKey}\``,
      });
    }
    // `plan/02` §5.1: a corridor page exists because the country is live or its guide is
    // published — never because the country appears in a list.
    if (
      country.corridorPagePublished &&
      country.status !== "live" &&
      !country.guidePublished
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["corridorPagePublished"],
        message: `\`${country.iso2}\` publishes a corridor page while it is neither \`live\` nor \`guidePublished\`: a page with no guide and no delivery is thin content (plan/02 §5.1)`,
      });
    }
    // A country we do not deliver to may not name cities (`plan/10` §3, honesty rule).
    if (country.citiesKey !== undefined && country.status !== "live") {
      ctx.addIssue({
        code: "custom",
        path: ["citiesKey"],
        message: `\`${country.iso2}\` names cities while its status is \`${country.status}\`: only a live destination may list the cities it covers (plan/10 §3)`,
      });
    }
  });

/** A destination as the schema parses it (`iso2` is any ISO code the shape allows). */
export type ParsedCountryConfig = z.infer<typeof CountryConfigSchema>;

/**
 * A destination as the application reads it: `iso2` narrowed to the configured set, so iterating
 * `COUNTRIES` and calling a predicate needs no cast and a typo is a compile error.
 */
export type CountryConfig = Omit<ParsedCountryConfig, "iso2"> & {
  iso2: CountryIso2;
};

/** Registry-level refinements: unique ISO codes and unique slugs inside each locale. */
export const CountryRegistrySchema = z
  .array(CountryConfigSchema)
  .min(1)
  .superRefine((countries, ctx) => {
    const seen = new Set<string>();
    countries.forEach((country, index) => {
      if (seen.has(country.iso2)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "iso2"],
          message: `duplicate country code \`${country.iso2}\``,
        });
      }
      seen.add(country.iso2);
    });

    // Two destinations sharing a slug in one locale would claim the same URL (`plan/02` §4,
    // spec 002 §5.1's `UNIQUE (locale_code, slug)` on `country_translation`).
    const owner = new Map<string, string>();
    countries.forEach((country, index) => {
      for (const [locale, slug] of Object.entries(country.slugs)) {
        const key = `${locale}/${slug}`;
        const existing = owner.get(key);
        if (existing !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [index, "slugs", locale],
            message: `slug \`${slug}\` is already used by \`${existing}\` in locale \`${locale}\``,
          });
        }
        owner.set(key, country.iso2);
      }
    });
  });

/**
 * The seven Phase 0 destinations, in the order the canvas's destinations grid draws them
 * (`docs/design/homepage-v1/homepage-desktop.dc.html`): Poland first as the delivering
 * destination, then the six guide countries of spec 004 §13 Q12.
 *
 * Slugs are `plan/02` §4.1/§4.2's forms, ASCII-folded (`rumaenien`, `wlochy`). The Polish
 * `holandia` and German `rumaenien` are the high-intent search forms rather than the formal
 * exonyms (`niderlandy`, `rumänien`); they are data, and spec 007 revisits them with the corridor
 * copy before any of these URLs is published.
 */
const countries = [
  {
    iso2: "PL",
    region: "centralEurope",
    status: "live",
    nameKey: "destinations.pl.name",
    citiesKey: "destinations.pl.cities",
    slugs: { en: "poland", "en-gb": "poland", de: "polen", pl: "polska" },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
    // spec 009 §13 Q3 (founder, 2026-09-16), verbatim: the recipient's zone, the same-day cutoff
    // in it, Monday–Saturday, and §13 Q3's "sundayDelivery: false" as spec 002 §5.1's `none`.
    operations: {
      ianaZone: "Europe/Warsaw",
      sameDayCutoffLocal: "14:00",
      deliveryDays: [1, 2, 3, 4, 5, 6],
      sundayDelivery: "none",
    },
  },
  {
    iso2: "DE",
    region: "centralEurope",
    status: "demo",
    nameKey: "destinations.de.name",
    slugs: {
      en: "germany",
      "en-gb": "germany",
      de: "deutschland",
      pl: "niemcy",
    },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
  },
  {
    iso2: "FR",
    region: "westernSouthernEurope",
    status: "demo",
    nameKey: "destinations.fr.name",
    slugs: { en: "france", "en-gb": "france", de: "frankreich", pl: "francja" },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
  },
  {
    iso2: "ES",
    region: "westernSouthernEurope",
    status: "demo",
    nameKey: "destinations.es.name",
    slugs: { en: "spain", "en-gb": "spain", de: "spanien", pl: "hiszpania" },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
  },
  {
    iso2: "IT",
    region: "westernSouthernEurope",
    status: "demo",
    nameKey: "destinations.it.name",
    slugs: { en: "italy", "en-gb": "italy", de: "italien", pl: "wlochy" },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
  },
  {
    iso2: "RO",
    region: "southEasternEurope",
    status: "demo",
    nameKey: "destinations.ro.name",
    slugs: {
      en: "romania",
      "en-gb": "romania",
      de: "rumaenien",
      pl: "rumunia",
    },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
  },
  {
    iso2: "NL",
    region: "centralEurope",
    status: "demo",
    nameKey: "destinations.nl.name",
    slugs: {
      en: "netherlands",
      "en-gb": "netherlands",
      de: "niederlande",
      pl: "holandia",
    },
    sortWeight: 0,
    corridorPagePublished: true,
    guidePublished: true,
  },
] as const;

/**
 * Parsed at module load: a malformed registry throws on first import, never at request time.
 *
 * **The file registry**: the seed's source, the static providers' answer and the overlay base of
 * the database registry (spec 012b §2.2). Code that renders or prices reads `activeCountries()` or
 * `countryConfig()` instead, which answer from the database in `production`, `staging` and
 * `preview` (AC-3); `tests/unit/country-registry-cutover.test.ts` scans for any other reader.
 */
export const COUNTRIES = CountryRegistrySchema.parse(
  countries,
) as readonly CountryConfig[];

/** The closed set of destination codes, as a literal union: an unknown code is a type error. */
export type CountryIso2 = (typeof countries)[number]["iso2"];

export const COUNTRY_CODES = COUNTRIES.map(
  (country) => country.iso2,
) as readonly string[];

const byIso2 = new Map<string, CountryConfig>(
  COUNTRIES.map((country) => [country.iso2, country]),
);

/* -------------------------------------------------------------------------- */
/* The registry a deployment serves (spec 012b §2.2, AC-3; TASK-294).          */
/* -------------------------------------------------------------------------- */

/**
 * The environments whose registry is the database's (spec 012b AC-3): `production`, `staging`
 * and `preview`. `development` and `test` serve this file.
 */
export const DATABASE_REGISTRY_ENVIRONMENTS = [
  "production",
  "staging",
  "preview",
] as const;

/** Where a deployment's catalogue, prices and destination registry come from (spec 012b AC-3). */
export type CmsSource = "static" | "database";

/**
 * The cutover's one rule, shared by the catalogue, price, saleability and country composition
 * roots so that a deployment never prices from one source and lists destinations from the other.
 *
 * The database in `DATABASE_REGISTRY_ENVIRONMENTS`, **while the deployment carries the build's
 * database login** (spec 012b §12 founder action 4; `buildDatabaseConfigured()` in
 * `src/lib/build-login.ts`; only `src/lib/db.ts` connects with it). Without it the deployment, build and server
 * alike, keeps serving this file and the authored dataset, and says so in its log
 * (`src/modules/geo/db/runtime.ts`). That is the staging fallback the orchestrator ordered on
 * 2026-11-11 so a build without the variable still passes; it departs from §2.0 item 2's "no
 * fallback" and is recorded in `docs/tasks/TASK-294.md` (Escalations). Build and server decide on
 * the same variable, so the pages a build prerendered and the prices checkout charges come from
 * one source in either state.
 */
export function cmsSourceFor(
  environment: string,
  buildDatabaseConfigured: boolean,
): CmsSource {
  return buildDatabaseConfigured &&
    (DATABASE_REGISTRY_ENVIRONMENTS as readonly string[]).includes(environment)
    ? "database"
    : "static";
}

/**
 * The slot the database registry is installed in, on `globalThis` so that every bundle of one
 * server process (Next compiles `instrumentation.ts`, route handlers and pages separately) reads
 * the one copy `src/modules/geo/db/runtime.ts` installed.
 */
const REGISTRY_SLOT = Symbol.for("flowers-overseas.country-registry");

interface InstalledRegistry {
  readonly countries: readonly CountryConfig[];
  readonly byIso2: ReadonlyMap<string, CountryConfig>;
}

type RegistryHolder = { [REGISTRY_SLOT]?: InstalledRegistry };

function installed(): InstalledRegistry | undefined {
  return (globalThis as RegistryHolder)[REGISTRY_SLOT];
}

/**
 * Whether this process must serve the database's registry: `cmsSourceFor()` of `APP_ENV` (spec 040
 * §5.2's signal) and the build login. `APP_ENV` is read raw rather than through `appEnvironment()`
 * so this file depends on nothing in `src/lib` but the import-free `build-login.ts`; a value that
 * is not one of the three is not a database environment, and `appEnvironment()` refuses an
 * unparseable one at boot anyway. Without the build login nothing is required and the file
 * answers, in the build's page-data workers too, where no boot hook has run.
 */
function databaseRegistryRequired(): boolean {
  return (
    cmsSourceFor(process.env["APP_ENV"] ?? "", buildDatabaseConfigured()) ===
    "database"
  );
}

/**
 * Put `countries` in place as the registry every `countryConfig()` read answers from (spec 012b
 * AC-3). Refused unless it holds exactly this file's destinations, each once, because a new
 * destination is a code change (slugs, region; `src/modules/geo/registry.ts`).
 */
export function installCountryRegistry(
  countries: readonly CountryConfig[],
): void {
  const codes = countries.map((country) => country.iso2);
  if (
    new Set(codes).size !== codes.length ||
    codes.length !== COUNTRIES.length ||
    codes.some((iso2) => !byIso2.has(iso2))
  ) {
    throw new Error(
      "installCountryRegistry: the registry must hold exactly the destinations of src/config/countries.ts, each once",
    );
  }
  (globalThis as RegistryHolder)[REGISTRY_SLOT] = {
    countries,
    byIso2: new Map(countries.map((country) => [country.iso2, country])),
  };
}

/** Remove an installed registry (tests only; a deployment installs once and refreshes). */
export function uninstallCountryRegistry(): void {
  delete (globalThis as RegistryHolder)[REGISTRY_SLOT];
}

/**
 * The environment variable `pnpm build` (`scripts/build.ts`) hands `next build` the database's
 * registry in, read once through the build login before the build starts (TASK-294). Next runs no
 * `instrumentation.ts` hook in the build's page-data and prerender workers, so this is how they
 * serve the database's registry; the running server installs its own at boot and never reads it.
 */
export const COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV =
  "COUNTRY_REGISTRY_BUILD_SNAPSHOT";

/** Next's `PHASE_PRODUCTION_BUILD`, the value of `NEXT_PHASE` while `next build` runs. */
const BUILD_PHASE = "phase-production-build";

/**
 * What the build snapshot carries per destination: exactly the facts the database registry
 * overlays on this file (`countryRegistryFromRows()` in `src/modules/geo/registry.ts`), so the
 * workers serve the same registry the server installs at boot.
 */
export const CountryRegistryBuildFactsSchema = z.array(
  z
    .object({
      iso2: z.string(),
      status: z.enum(countryStatuses),
      guidePublished: z.boolean(),
      operations: CountryOperationsSchema.optional(),
    })
    .strict(),
);
export type CountryRegistryBuildFacts = z.infer<
  typeof CountryRegistryBuildFactsSchema
>;

/** The snapshot's facts of `countries` (what `scripts/build.ts` hands the workers). */
export function countryRegistryBuildFacts(
  countries: readonly CountryConfig[],
): CountryRegistryBuildFacts {
  return countries.map((country) => ({
    iso2: country.iso2,
    status: country.status,
    guidePublished: country.guidePublished,
    ...(country.operations === undefined
      ? {}
      : { operations: country.operations }),
  }));
}

/**
 * Install the build's snapshot of the database registry, when this process is a `next build`
 * worker that was handed one: each destination of this file with the snapshot's facts overlaid.
 * Parsed at the boundary; a destination missing from it, or one this file does not have, throws
 * and fails the build.
 */
function installBuildSnapshot(): InstalledRegistry | undefined {
  if (process.env["NEXT_PHASE"] !== BUILD_PHASE) return undefined;
  const raw = process.env[COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV];
  if (raw === undefined || raw === "") return undefined;
  const facts = new Map(
    CountryRegistryBuildFactsSchema.parse(JSON.parse(raw)).map(
      (row) => [row.iso2, row] as const,
    ),
  );
  if (facts.size !== COUNTRIES.length) {
    throw new Error(
      `${COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV} must hold exactly the destinations of src/config/countries.ts`,
    );
  }
  installCountryRegistry(
    COUNTRIES.map((country) => {
      const row = facts.get(country.iso2);
      if (row === undefined) {
        throw new Error(
          `${COUNTRY_REGISTRY_BUILD_SNAPSHOT_ENV} has no ${country.iso2}`,
        );
      }
      const overlaid: CountryConfig = {
        ...country,
        status: row.status,
        guidePublished: row.guidePublished,
      };
      // The row's operations, or none: a country without agreed operations has no block.
      if (row.operations !== undefined) {
        return { ...overlaid, operations: row.operations };
      }
      delete overlaid.operations;
      return overlaid;
    }),
  );
  return installed();
}

/**
 * The registry this process serves: the installed one, the build's snapshot, or `undefined`
 * where the file answers. Throws where the database's registry is required and neither exists.
 */
function servedRegistry(): InstalledRegistry | undefined {
  const registry = installed() ?? installBuildSnapshot();
  if (registry !== undefined) return registry;
  if (databaseRegistryRequired()) {
    throw new Error(
      "COUNTRY_REGISTRY_NOT_LOADED: this environment serves the database's country registry and none is installed (spec 012b AC-3)",
    );
  }
  return undefined;
}

/**
 * The destination registry this process serves: the installed database registry (or, in a
 * `next build` worker, the build's snapshot of it), or, where none is required (`development`,
 * `test`, or a deployment without the build login), this file. Where the database's registry is
 * required an absent one **throws** rather than answering from the file: a page built from the
 * file while checkout charges from the database is the "shown ≠ charged" failure spec 012b §2.0
 * item 2 forbids.
 */
export function activeCountries(): readonly CountryConfig[] {
  return servedRegistry()?.countries ?? COUNTRIES;
}

/** Look a destination up by ISO code. Throws on an unknown code: the set is closed data. */
export function countryConfig(iso2: CountryIso2): CountryConfig {
  const country = (servedRegistry()?.byIso2 ?? byIso2).get(iso2);
  if (country === undefined) {
    throw new Error(`unknown country code: ${iso2}`);
  }
  return country;
}

/** True when the string is one of the configured destinations (boundary parsing helper). */
export function isCountryIso2(iso2: string): iso2 is CountryIso2 {
  return byIso2.has(iso2);
}

/**
 * The corridor slug for a destination in a locale. The only reader is `localePath()`'s caller:
 * this returns the slug, never a path, so the URL builder stays the single one (spec 003 §6).
 */
export function countrySlug(iso2: CountryIso2, locale: string): string {
  const slugs: Readonly<Record<string, string>> = countryConfig(iso2).slugs;
  const slug = slugs[locale];
  if (slug === undefined) {
    throw new Error(`no slug for country ${iso2} in locale ${locale}`);
  }
  return slug;
}

/**
 * The one predicate over `corridorPagePublished` (spec 004 §5.1's contract: one predicate per
 * flag). `false` for every destination in Phase 0, so no caller can render a corridor link.
 */
export function isCorridorPagePublished(iso2: CountryIso2): boolean {
  return countryConfig(iso2).corridorPagePublished;
}

/** The one predicate over `guidePublished` (spec 002 §5.1's `country.guide_published`). */
export function isGuidePublished(iso2: CountryIso2): boolean {
  return countryConfig(iso2).guidePublished;
}

/**
 * The one predicate over `operations`: true when every operational fact a live corridor page
 * needs has been authored (spec 007 §5.1, AC-2). True for Poland alone since TASK-124 (spec 009
 * §13 Q3) and false for the six other destinations, so `corridor:check` refuses a `live` content
 * file for any of them and no page can print a cutoff that nobody agreed to.
 */
export function hasCompleteOperations(iso2: CountryIso2): boolean {
  return countryConfig(iso2).operations !== undefined;
}

/**
 * **The one predicate every same-day / cutoff / delivery-date promise in the site chrome is
 * gated on** (spec 004 §14 A19, widened by `/review 70`; TASK-120).
 *
 * True when the destination both *delivers* (`status === "live"`) and has an agreed set of
 * operational facts to compute a delivery date from (`operations`, i.e. an `iana_zone`, a
 * `same_day_cutoff_local` and the delivery weekdays a florist has accepted). Both halves are
 * required and both are load-bearing: a `live` country with no `operations` is exactly Phase 0's
 * Poland — the canvas's "Delivering now" destination for which no florist has yet agreed a
 * cutoff — and printing "Order by 14:00 in Warsaw for delivery today" for it is the promise A19
 * removed.
 *
 * It is deliberately **one** predicate for the whole chrome, in the registry that owns the
 * country row, for the reason A19 gives: the utility strip, the finder, the FAQ, the category row
 * and the footer must never disagree with the picker. **TASK-124 re-sourced it to the picker
 * itself** — `pickerState(iso2) === "live"`, spec 009's single decision — with no call-site
 * change. It had to happen in the same change that authored Poland's `operations` block: the old
 * body (`status === "live"` and a block) would have turned true for Poland that moment and printed
 * "Order by 14:00 in Warsaw" with no florist behind it. `live` needs a block **and** an active
 * partner, so the promise now returns the day a florist is signed, and not a day earlier.
 */
export function deliveryDatesOpen(iso2: CountryIso2): boolean {
  return pickerState(iso2) === "live";
}

/**
 * The chrome's form of the same predicate: **is any destination at all taking delivery dates?**
 *
 * The header, the footer and the home page are not scoped to a destination — they render above
 * every page in the site — so the fact they may assert is the disjunction, not one country's
 * flag. `false` in Phase 0 (no destination has an active partner, so no picker is `live`), which
 * is what makes the honest chrome copy the rendered copy and keeps
 * `tests/e2e/chrome-honesty.spec.ts` green.
 */
export function anyDeliveryDatesOpen(): boolean {
  return activeCountries().some((country) => deliveryDatesOpen(country.iso2));
}

/**
 * The state message the destinations grid prints for a destination — the canvas's two states, as
 * keys rather than as a branch on a literal in a component: "Delivering now" only where delivery
 * dates are open (`deliveryDatesOpen()`, a signed florist behind it), "Guide · not delivering yet"
 * for everything else. Not `status === "live"`: that is the registry label, true for Poland while
 * no florist is signed, and it printed "Delivering now" on a home where nobody can order (PR 174,
 * the live crawl, 2026-10-04). Same predicate as the rest of the site's "You cannot order yet".
 */
export function destinationStateKey(country: CountryConfig): string {
  return deliveryDatesOpen(country.iso2)
    ? "destinations.state.deliveringNow"
    : "destinations.state.guideNotDelivering";
}

/**
 * Spec 002 §5.1 `country` columns **that exist in Phase 0**, in declaration order. The rest of
 * that table's columns (`currency_code`, `vat_rate_bp`, `iana_zone`, `same_day_cutoff_local`,
 * `delivery_days`, `sunday_delivery`, `supply_model`, `source`, timestamps) are owned by specs
 * 005/009 and by the founder's operational data; projecting a guess for them here would put a
 * fabricated cutoff into a seed. Pinned by a unit test, so this list and the projection below
 * cannot be edited apart (spec 004 §5.1).
 */
export const COUNTRY_ROW_COLUMNS = [
  "iso2",
  "status",
  "guide_published",
] as const;

export interface CountryRow {
  iso2: string;
  status: CountryStatus;
  guide_published: boolean;
}

/**
 * Project a destination onto the Phase 0 half of spec 002 §5.1's `country` row. TASK-015's
 * migration and TASK-026's seed read this rather than restating the destination set.
 */
export function toCountryRow(country: CountryConfig): CountryRow {
  return {
    iso2: country.iso2,
    status: country.status,
    guide_published: country.guidePublished,
  };
}

/**
 * The destinations of one hub region, in registry order (spec 007 §5.3; TASK-092).
 *
 * Order **inside** a group is the reader's, not the registry's: the hub sorts with
 * `collator(locale)` over the translated names, which is why this returns the rows rather than a
 * sorted list — a registry may not decide how Polish sorts `Łotwa` (§7).
 */
export function countriesInRegion(
  region: CountryRegion,
): readonly CountryConfig[] {
  return activeCountries().filter((country) => country.region === region);
}
