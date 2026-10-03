/**
 * The home's sentence picker: its options and where a submission lands (spec 004 §14 **A21
 * clause 4**, AC-10, AC-11; TASK-177; `docs/design/wireframes/home-{desktop,mobile}.dc.html`).
 *
 * It replaces the v1 finder (`finder-model.ts`, `FinderCard`, the `FinderTypeahead` island). The
 * picker is a server-rendered `<form method="get">` whose action is the one route under `/api/`
 * that answers **303**; everything that route and the form decide about *data* is decided here,
 * so neither the page nor the route file holds a `published` branch or a collation call. That is
 * what makes AC-11's "a country is data" proof a property of the import graph: flipping a
 * registry flag changes this module's answer and nothing under `src/app/` (T-13).
 *
 * ## The rules, in one place
 *
 * - **Fields.** Only `country` (ISO code) and `occasion` (an occasion-tile id) have a `name`
 *   (`SENTENCE_FIELDS`). Nothing else on the form is ever submitted.
 * - **Which destinations are open.** `isSentenceDestination()`: the registry publishes the
 *   destination's corridor page (`corridorPagePublished`), the destination is `live` (we have
 *   said we will deliver there), **and** its shop root exists in this locale. The last term is
 *   the catalogue's (`corridorShopEntry()`), so the caller hands it in as `shopCountries`:
 *   `src/modules/ui` may not import the catalogue (`plan/01` §5). Every other destination is a
 *   `disabled` option labelled "not yet" in words, never by colour alone (A21 clause 4, A20
 *   clause 3). The `live` term is TASK-177's reading of the clause, recorded in the brief's
 *   escalations: TASK-092 set `corridorPagePublished` on all seven, and the artboards (and the
 *   honesty rules) draw six of them as "not yet".
 * - **Order.** `collator(locale)`, never the registry's (AC-11; `pl` sorts `Ł` correctly).
 * - **Where a submission lands** (`sentenceTarget()`), from the user's own input only — never an
 *   IP or a header (ADR-0006):
 *     1. an open destination and an existing occasion page for the chosen occasion → that page;
 *     2. an open destination → its shop root;
 *     3. anything else (unknown code, unpublished, not live, malformed) → the destinations hub.
 *   "The occasion page" is the country occasion page (spec 008 `countryOccasion`) for a seasonal
 *   occasion and the country's occasion **category** (`countryCategory`, same key) for an
 *   evergreen one — birthday, anniversary, sympathy, new baby and just because are categories in
 *   a country shop (`categories.data.ts`, kind `occasion`). Which of the two exists is the
 *   catalogue's answer, handed in as `occasionPage`.
 *
 * Nothing here reads a cookie, a header, the clock or a database.
 */
import { z } from "zod";

import {
  COUNTRIES,
  type CountryConfig,
  type CountryIso2,
  countryConfig,
  isCorridorPagePublished,
  isCountryIso2,
} from "../../../config/countries.ts";
import type { LocaleCode } from "../../../config/locales.ts";
import {
  OCCASION_TILES,
  type OccasionId,
  type OccasionTile,
} from "../../../config/occasions.ts";
import { localePath, sortBy } from "../../i18n";

/** The two submitted fields. A third `name` on the form is a defect (T-12). */
export const SENTENCE_FIELDS = {
  country: "country",
  occasion: "occasion",
} as const;

/** DOM contracts: the form's id (the header's "Send flowers" anchor), its heading and fields. */
export const SENTENCE_IDS = {
  form: "send",
  heading: "send-heading",
  who: "send-who",
  country: "send-country",
  occasion: "send-occasion",
} as const;

/**
 * "Who it's for" (founder, 2026-10-04), in the founder's order, each with the pronoun its
 * occasion label takes ("her birthday"). The founder's "my partner" waits for a ruling: spec 004
 * §14 A5 bans the word "partner" from customer copy (`src/config/voice.ts`), so it is not offered
 * until the spec allows the relationship sense (brief, `## Escalations`). The select has **no `name`**: it is never submitted, so
 * a relationship never reaches a URL, a log or the server (plan/07). The first is the default.
 */
export const SENTENCE_WHO = [
  { id: "mum", pronoun: "her" },
  { id: "dad", pronoun: "his" },
  { id: "grandma", pronoun: "her" },
  { id: "grandad", pronoun: "his" },
  { id: "friend", pronoun: "their" },
  { id: "someoneILove", pronoun: "their" },
] as const;

export type SentencePronoun = (typeof SENTENCE_WHO)[number]["pronoun"];

/** The three forms every occasion label is rendered in, for the island to swap between. */
export const SENTENCE_PRONOUNS = ["her", "his", "their"] as const;

/** The route the form submits to: `/api/send/{locale}`. GET forms drop an action's query string. */
export function sentenceAction(locale: string): string {
  return `/api/send/${encodeURIComponent(locale)}`;
}

/** The same cast `finder-model.ts` documented: routed locales are provider-backed data. */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/**
 * Is this destination open in the sentence? See the header for the three terms. `shopCountries`
 * is the set of ISO codes whose shop root exists in this locale (the catalogue's answer).
 */
export function isSentenceDestination(
  iso2: string,
  shopCountries: ReadonlySet<string>,
): boolean {
  if (!isCountryIso2(iso2)) return false;
  if (!isCorridorPagePublished(iso2)) return false;
  if (countryConfig(iso2).status !== "live") return false;
  return shopCountries.has(iso2);
}

/** One `<option>` of the country select. */
export interface SentenceDestination {
  readonly iso2: CountryIso2;
  /** `destinations.{iso}.name`. */
  readonly nameKey: string;
  /** `false` → a `disabled` option labelled "not yet". */
  readonly open: boolean;
}

/** The seven destinations in the reader's collation order, each open or not yet. */
export function sentenceDestinations(
  locale: string,
  nameOf: (nameKey: string) => string,
  shopCountries: ReadonlySet<string>,
): readonly SentenceDestination[] {
  const named = COUNTRIES.map((country: CountryConfig) => ({
    country,
    name: nameOf(country.nameKey),
  }));
  return sortBy(named, localeCode(locale), (entry) => entry.name).map(
    ({ country }): SentenceDestination => ({
      iso2: country.iso2,
      nameKey: country.nameKey,
      open: isSentenceDestination(country.iso2, shopCountries),
    }),
  );
}

/** One `<option>` of the occasion select: the six home tiles, in registry order, by id. */
export interface SentenceOccasion {
  readonly id: OccasionId;
  readonly nameKey: string;
}

export function sentenceOccasions(): readonly SentenceOccasion[] {
  return OCCASION_TILES.map((tile: OccasionTile): SentenceOccasion => ({
    id: tile.id,
    nameKey: tile.nameKey,
  }));
}

/**
 * The route's query, parsed at the boundary. Every field is optional and a malformed one is
 * simply absent: a query string is whatever a client typed, and the answer to nonsense is the
 * destinations hub, never a 4xx page.
 */
export const SentenceQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .optional()
    .catch(undefined),
  occasion: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]{1,40}$/u)
    .optional()
    .catch(undefined),
});
export type SentenceQuery = z.infer<typeof SentenceQuerySchema>;

/** What the catalogue answers for the route (`src/modules/ui` cannot ask it itself). */
export interface SentenceLookups {
  /** The country's shop root in this locale, or `undefined` when it may not be linked. */
  readonly shopRoot: (iso2: CountryIso2) => Promise<string | undefined>;
  /** The country's page for this occasion (catalogue key), or `undefined` when none exists. */
  readonly occasionPage: (
    iso2: CountryIso2,
    catalogueKey: string,
  ) => Promise<string | undefined>;
}

/** The occasion tile a submitted id names, or `undefined`. */
function tileOf(id: string | undefined): OccasionTile | undefined {
  if (id === undefined) return undefined;
  return OCCASION_TILES.find((tile) => tile.id === id);
}

/**
 * Where a submission lands: always a path this application builds, never a submitted string.
 * See the header for the order.
 */
export async function sentenceTarget(
  locale: string,
  query: SentenceQuery,
  lookups: SentenceLookups,
): Promise<string> {
  const hub = localePath(locale, "destinations");
  const iso2 = query.country;
  if (iso2 === undefined || !isCountryIso2(iso2)) return hub;
  if (!isCorridorPagePublished(iso2)) return hub;
  if (countryConfig(iso2).status !== "live") return hub;
  const shopRoot = await lookups.shopRoot(iso2);
  if (shopRoot === undefined) return hub;
  const tile = tileOf(query.occasion);
  if (tile !== undefined) {
    const page = await lookups.occasionPage(iso2, tile.catalogueKey);
    if (page !== undefined) return page;
  }
  return shopRoot;
}
