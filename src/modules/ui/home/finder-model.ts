/**
 * The finder's projection and its one target helper (spec 004 §2 "Locale-home skeleton", §5.3
 * `DestinationPicker`, §13 Q11/Q12, **AC-11**; TASK-052).
 *
 * Everything the finder card decides about *data* is decided here, so `FinderCard.tsx` holds no
 * `published` branch and no collation call and the page holds neither. That is what makes AC-11's
 * closing clause — "renders a link to the corridor path when a fixture flips one flag to true,
 * with **no change under `src/app/`**" — a property of the import graph rather than a promise.
 *
 * ## Three decisions worth reading before changing this file
 *
 * **1. Order is `collator(locale)`, never the registry's order.** `countries.ts` lists Poland
 * first because the destinations grid draws it first; the finder lists the seven the way the
 * reader's language sorts them, which is the one place spec 003's collation is visible in this
 * spec and is tested in `pl` (where `Łotwa`-style `ł` and the digraph rules differ from a
 * code-point sort — AC-11, §7).
 *
 * **2. `finderTarget()` is the only place that answers "where does Continue go?"** Its published
 * branch is A2/§13 Q11's answer — the corridor country page,
 * `localePath(locale, "destinations", slug)`, i.e. `/{locale}/{send-flowers-to}/{slug}` — and its
 * Phase-0 branch is the on-page destinations anchor, because **no country is published** and a
 * button that leads to our own 404 is worse than one that leads to the honest answer (AC-14: zero
 * internal links to a non-200 URL). Both branches are unit-tested, so spec 007 flips
 * `corridorPagePublished` in `src/config/countries.ts` and this file, the card and the page all
 * stay untouched.
 *
 * Note the page-type name: `plan/02` §4.1's corridor country page is the `destinations` path
 * segment (`send-flowers-to` / `blumen-verschicken` / `wyslij-kwiaty`) plus the country slug.
 * Spec §2 and the TASK-052 row call it `localePath(locale, "corridorCountry", slug)`; there is no
 * `corridorCountry` key in `PATH_SEGMENT_KEYS` and never was — `destinations` is that key, and
 * this comment is here so the next reader does not go looking for the other one.
 *
 * **3. The Phase-0 anchor is a constant two surfaces share.** `DESTINATIONS_ANCHOR` is the id of
 * the destination list the finder itself renders (AC-11's seven destinations with their state);
 * TASK-054's destinations grid takes the same id over when it lands, which is why it is exported
 * rather than written twice — the `REMINDERS_ANCHOR` pattern of `SiteFooter`.
 */
import type { LocaleCode } from "../../../config/locales.ts";
import {
  COUNTRIES,
  type CountryConfig,
  type CountryIso2,
  destinationStateKey,
} from "../../../config/countries.ts";
import { corridorLinkHref } from "../../geo";
import { localePath, sortBy } from "../../i18n";

/**
 * The one cast in this file, and the reason it is a cast rather than a parse.
 *
 * `sortBy()`/`collator()` are typed against `LocaleCode`, the literal union derived from
 * `src/config/locales.ts`. But the locale set is **provider-backed data**: spec 003's AC-31 seam
 * lets `withLocaleRegistry()` inject a fifth locale the static union cannot contain, which is
 * exactly why spec 003 refused to augment next-intl's `Locale` with that union (`global.d.ts`).
 * Validating against the static union here would make a *fifth locale a code change* — the
 * opposite of AC-31 — and `tests/unit/i18n-fifth-locale.test.tsx` fails the moment anyone tries.
 *
 * So the runtime check stays where it belongs: `collator()` resolves the code through
 * `getLocaleRegistry()` and throws `unknown locale code` for a code no registry knows, while the
 * codes that reach this module have already passed the routing gate (`dynamicParams = false` on
 * the `[locale]` layout).
 */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/**
 * The id of the locale home's destination list, and therefore the fragment `finderTarget()`
 * points at while no country is published. TASK-054's destinations grid inherits it.
 */
export const DESTINATIONS_ANCHOR = "destinations";

/** The finder's field ids and its `<datalist>` id, in one place: markup contracts, not copy. */
export const FINDER_IDS = {
  country: "finder-country",
  countryList: "finder-country-options",
  town: "finder-town",
  date: "finder-date",
  /** The destination list — where `Continue` lands, and the section the strip is drawn as. */
  destinations: DESTINATIONS_ANCHOR,
  /**
   * The country field's `aria-describedby` target (`/review 40`, inherited by TASK-053).
   *
   * It used to be `destinations` — the whole section — so focusing the field read the seven
   * destinations, their state words and the onboarding sentence, about 200 words, on **every**
   * focus. A description is a sentence, not a section: this id belongs to a purpose-written
   * `sr-only` summary beside the field ("we deliver in Poland today; in Germany, France, … we
   * are still choosing florists"), which is the same information in one breath. The section
   * itself is still on the page, still the `Continue` target, and still readable by navigation.
   */
  destinationsSummary: "finder-destinations-summary",
} as const;

/** One destination as the finder renders it. */
export interface FinderDestination {
  readonly iso2: CountryIso2;
  /** `destinations.{iso}.name` — the name is catalogue copy, never a literal (§7). */
  readonly nameKey: string;
  /** `destinations.state.deliveringNow` | `destinations.state.guideNotDelivering`. */
  readonly stateKey: string;
  /** True for the one `status: "live"` destination; the state *word* carries the meaning. */
  readonly delivering: boolean;
  /**
   * The corridor page, or `undefined` while `corridorPagePublished` is false. `undefined` is the
   * whole of AC-14's "never a dead link": the caller has nothing to link to and renders text.
   */
  readonly href: string | undefined;
}

/**
 * The seven Phase-0 destinations in the reader's collation order, each with its state and, once
 * published, its corridor path. `translate` stays the caller's job: this module reads no
 * catalogue, so it is callable from a unit test with a stub name function and from the server
 * component with next-intl's.
 */
export function finderDestinations(
  locale: string,
  nameOf: (nameKey: string) => string,
): readonly FinderDestination[] {
  const named = COUNTRIES.map((country: CountryConfig) => ({
    country,
    name: nameOf(country.nameKey),
  }));
  return sortBy(named, localeCode(locale), (entry) => entry.name).map(
    ({ country }): FinderDestination => ({
      iso2: country.iso2,
      nameKey: country.nameKey,
      stateKey: destinationStateKey(country),
      delivering: country.status === "live",
      href: corridorLinkHref(country.iso2, locale),
    }),
  );
}

/**
 * The two groups the `aria-describedby` summary names: where we deliver, and where we are still
 * choosing florists. Both are derived from the same registry the list renders, so the sentence a
 * screen reader hears cannot drift from the section it summarises, and spec 007 flipping a
 * country to `live` moves it between the two groups with no copy edit.
 *
 * Both groups are non-empty in Phase 0 and the summary message assumes it (one live destination,
 * six guides); `tests/unit/ui-home.test.tsx` pins that, so a registry that emptied one of them
 * would fail there rather than render "In  we are still choosing florists."
 */
export interface FinderDestinationGroups {
  readonly delivering: readonly string[];
  readonly onboarding: readonly string[];
}

export function finderDestinationGroups(
  destinations: readonly FinderDestination[],
  nameOf: (nameKey: string) => string,
): FinderDestinationGroups {
  return {
    delivering: destinations
      .filter((destination) => destination.delivering)
      .map((destination) => nameOf(destination.nameKey)),
    onboarding: destinations
      .filter((destination) => !destination.delivering)
      .map((destination) => nameOf(destination.nameKey)),
  };
}

/**
 * Where `Continue` goes.
 *
 *  - **published** (spec 007 onward): the corridor country page for the chosen destination —
 *    A2/§13 Q11's answer, and the URL every future homepage CTA points at.
 *  - **Phase 0** (`corridorPagePublished: false` for all seven): the destination list on this
 *    page, which says where we deliver and where we are still choosing florists. Same answer for
 *    the delivering destination and the six others, because in Phase 0 there is nothing else to
 *    show either of them.
 *
 * `iso2` is optional: with no destination chosen (the server-rendered state, before anyone has
 * typed anything) the answer is the same anchor, so the control is never inert and never points
 * somewhere that does not exist.
 */
export function finderTarget(locale: string, iso2?: CountryIso2): string {
  const href = iso2 === undefined ? undefined : corridorLinkHref(iso2, locale);
  if (href !== undefined) return href;
  return `${localePath(locale, "home")}#${DESTINATIONS_ANCHOR}`;
}
