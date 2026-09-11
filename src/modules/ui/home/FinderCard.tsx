/**
 * `FinderCard` — the finder of §13's 2026-09-08 resolution note: **type-ahead country →
 * town/postcode → date → neutral `Continue`**, with the cutoff line and the destination list
 * beneath it (spec 004 §2 "Locale-home skeleton", §5.3 `DestinationPicker`, §14 A4's honesty
 * rule, **AC-11**, AC-14; TASK-052; design round 7).
 *
 * ## Why it is a real form and not a picture of one (§14 A4 applied honestly)
 *
 * A4 took the header's search band down to text because a `<form>` with no `action` and an
 * enabled submit navigates to the current URL, and a disabled submit is a dead affordance. The
 * finder passes that test where the search band failed it, because it *has* a 200 URL to submit
 * to: `finderTarget()`'s Phase-0 branch is the destination list on this very page
 * (`#destinations`), so `method="get"` on the locale home carries the visitor's answers in the
 * query string to a document that exists, scrolled to the honest answer — where we deliver today
 * and where we are still choosing florists. No `action` to a non-200 URL, no client navigation to
 * a route that does not exist (the TASK-052 row's two conditions), no `<a href>` anywhere near a
 * query URL for AC-14's crawl to find, and the same markup becomes navigation to the corridor
 * page the moment spec 007 flips `corridorPagePublished` — a data flip, not a template edit.
 *
 * ## AC-11, field by field
 *
 * The country control is **a labelled `<input list>` backed by a `<datalist>` of the seven Phase-0
 * destinations** in `collator(locale)` order. That is design round 7's "plain type-ahead — type,
 * see the matching country, pick" implemented by the platform: it filters as you type, announces
 * through the browser's own combobox semantics, and **works with JavaScript disabled**, which is
 * AC-11's hard requirement and the reason it is not a bespoke listbox (the combobox proper is
 * 007/008's). A `<select>` would also satisfy the letter of AC-11 and was rejected: it cannot be
 * typed into, and the artboard draws a caret in a text field.
 *
 * AC-11's "every destination as plain text with the onboarding line while `corridorPagePublished`
 * is false" is the **destination list** below the button, `id="destinations"` and the country
 * field's `aria-describedby` target: all seven, named from `destinations.*`, each with its state
 * word (`Delivering now` / `Guide · waiting list`, never colour alone — §5.3), plus one onboarding
 * sentence for the six. Round 7 removed the status column *from the type-ahead dropdown*, and
 * that is respected: nothing decorates the options, and the status is read after the field, in
 * the button's own line — which is also where a chosen country's status is announced once the
 * enhancement of 007/008 lands. A destination whose flag flips renders as a **link** to its
 * corridor page from the same loop; while every flag is false, nothing here is a link at all.
 *
 * ## Two Phase-0 deviations from the artboard, both honesty rather than convenience
 *
 *  - **The date field ships with no default value.** The artboard prints "Thu 10 Sep" and the row
 *    asks for "the soonest possible date". Both would need today's date in the *recipient's* zone,
 *    which is a date computation (spec 009's, per the row's own "no date arithmetic" rule) and an
 *    `Intl` call outside `format.ts` (`fo/no-adhoc-intl`) — and, worse, it would be **wrong**: this
 *    document is ISR-cached, so a default rendered at build or revalidation time is served to
 *    everyone who arrives after it, including the day after. An empty date field with the cutoff
 *    sentence under it tells the truth; a stale prefilled date does not.
 *  - **`finder.help` is not the artboard's sentence.** The artboard says "Shows everything we can
 *    deliver there on that day: bouquets, plants, add-ons", which will be true when spec 008 has a
 *    shop to show. In Phase 0 `Continue` shows the destination list, and the copy says that.
 *
 * Both are recorded in the PR body; the artboards keep their sentences for the task that makes
 * them true.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { LocaleCode } from "../../../config/locales.ts";
import { formatList } from "../../i18n";
import { FinderTypeahead } from "./FinderTypeahead.tsx";
import { Button } from "../primitives/Button.tsx";
import { VisuallyHidden } from "../primitives/a11y.tsx";
import { Grid, Stack } from "../primitives/layout.tsx";
import { Label, Text } from "../primitives/typography.tsx";

import {
  FINDER_IDS,
  finderDestinationGroups,
  finderDestinations,
  finderTarget,
} from "./finder-model.ts";

/** See `finder-model.ts`'s twin: the locale set is provider-backed data (spec 003 AC-31). */
function localeCode(locale: string): LocaleCode {
  return locale as LocaleCode;
}

/**
 * The canvas's `.field span.v`: a 46 px underlined box with 12 px inline padding. 46 clears the
 * 44 px tap-target floor of §5.3, so the artboard's number stands. Written once because three
 * fields share it and a fourth (spec 008's) must not invent a second look.
 */
const FIELD =
  "border-border-emphasis text-md text-ink bg-transparent min-h-[46px] w-full border-0 border-b border-solid px-[12px]";

/** See `SiteHeader`'s identical pair: the registries hold dotted keys, not typed literals. */
type Translator = ReturnType<typeof useTranslations>;
/**
 * The cast target is a loose call signature, not `Parameters<Translator>[0]`: see `SiteHeader`'s
 * twin for the measurement — next-intl's key union tips `tsc` into `TS2589` once this branch's
 * namespaces land on top of TASK-073's, and the union checked nothing here that
 * `tests/unit/ui-home.test.tsx`'s "every registry key resolves" assertions do not.
 */
type LabelTranslator = (key: string) => string;

/**
 * Resolve a registry key (`destinations.pl.name`, `destinations.state.deliveringNow`). The one
 * cast in this file, so a call site cannot smuggle a literal through it.
 */
function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

export interface FinderCardProps {
  readonly locale: string;
}

export function FinderCard({ locale }: FinderCardProps): ReactElement {
  const t = useTranslations();
  const finder = useTranslations("finder");
  // The country names and state words are catalogue copy (`destinations.*`) whose keys arrive
  // from the zod-validated registry as dotted strings, so the one cast in this file lives in
  // `registryLabel` and `tests/unit/ui-home.test.tsx` asserts every key resolves.
  const destinations = finderDestinations(locale, (nameKey) =>
    registryLabel(t, nameKey),
  );
  const countryNames = destinations.map((destination) =>
    registryLabel(t, destination.nameKey),
  );
  const groups = finderDestinationGroups(destinations, (nameKey) =>
    registryLabel(t, nameKey),
  );
  // 0…7 matches, formatted here so the island runs no ICU (§13 Q13 option (b)).
  const matchLabels = Array.from(
    { length: countryNames.length + 1 },
    (_, count) => finder("destinations.matches", { count }),
  );

  return (
    <Stack gap="md" data-fo-finder>
      {/*
        `method="get"`, and an action that is a document rather than a promise: `finderTarget()`
        answers with this page's destination anchor while no country is published, and with the
        corridor path afterwards. No hidden input carries a country code — the fields the visitor
        filled in are the query string, which is what makes the enhancement of 007/008 a
        progressive one rather than a rewrite.
      */}
      <form method="get" action={finderTarget(locale)} data-fo-finder-form>
        <Stack gap="md">
          <Stack gap="xs">
            <Label as="label" htmlFor={FINDER_IDS.country}>
              {finder("country.label")}
            </Label>
            {/*
              The one island on this page (499 B Brotli, measured — §14 A1). It renders this
              input, with `list` set until it hydrates, so the field is a native `<input list>`
              type-ahead before and without JavaScript and a live-announcing list afterwards.
            */}
            <FinderTypeahead
              className={FIELD}
              describedBy={FINDER_IDS.destinationsSummary}
              inputId={FINDER_IDS.country}
              listId={FINDER_IDS.countryList}
              options={countryNames}
              // One announcement per possible match count, formatted here: the island runs no
              // ICU and carries no catalogue (§13 Q13 option (b)).
              matchLabels={matchLabels}
            />
            {/*
              The platform's type-ahead: seven options, in the reader's collation order, filtered
              by the browser as the visitor types, and present in the HTML — so this works with
              JavaScript disabled and adds not one byte to the client bundle (§14 A1's 131 072 B,
              which every locale document is inside since TASK-085 dropped the client message
              payload and the provider: 122 360 B).
            */}
            {/*
              The field's description (`/review 40`): one sentence naming where we deliver and
              where we are still choosing florists, built from the same registry the destination
              section renders. It replaced `aria-describedby="destinations"`, which read the whole
              section — seven names, seven state words and the onboarding line — on every focus.
            */}
            <VisuallyHidden id={FINDER_IDS.destinationsSummary}>
              {finder("destinations.summary", {
                delivering: formatList(groups.delivering, localeCode(locale)),
                onboarding: formatList(groups.onboarding, localeCode(locale)),
              })}
            </VisuallyHidden>
            <datalist id={FINDER_IDS.countryList}>
              {destinations.map((destination) => (
                <option
                  key={destination.iso2}
                  value={registryLabel(t, destination.nameKey)}
                />
              ))}
            </datalist>
          </Stack>

          <Grid columns="1-2" gap="md">
            <Stack gap="xs">
              <Label as="label" htmlFor={FINDER_IDS.town}>
                {finder("town.label")}
              </Label>
              {/* Optional: the price depends on the country, not on the town (the TASK-052 row). */}
              <input
                id={FINDER_IDS.town}
                name="town"
                type="text"
                autoComplete="address-level2"
                placeholder={finder("town.placeholder")}
                className={FIELD}
              />
            </Stack>
            <Stack gap="xs">
              <Label as="label" htmlFor={FINDER_IDS.date}>
                {finder("date.label")}
              </Label>
              {/* The artboards draw a calendar glyph at the field's inline end because they
                  draw a field-shaped box; `<input type="date">` supplies its own picker
                  affordance, and a second glyph beside it would be a duplicate control with no
                  behaviour. So the icon is the browser's here, and `Icon`'s `calendar` waits for
                  the date *chip* of spec 008. */}
              <input
                id={FINDER_IDS.date}
                name="date"
                type="date"
                className={FIELD}
              />
            </Stack>
          </Grid>

          {/* Neutral, as §13's note requires: the ink fill, not the accent, because nothing has
              been chosen yet and the accent belongs to the one action that commits. */}
          <Button type="submit" fullWidth>
            {finder("submit")}
          </Button>
        </Stack>
      </form>

      <Stack gap="xs">
        <Text size="sm" tone="subtle" measure>
          {finder("help")}
        </Text>
        {/* The cutoff, in the **recipient's** zone and named as such — the one thing
            1-800-Flowers does that nobody else in the field does (`docs/design/benchmarks`
            pattern 5). Static copy, not a computed cutoff: the occasion/cutoff calculation is
            spec 009's and this page has no destination data to compute from. */}
        <Text size="sm" tone="subtle" measure data-fo-finder-cutoff>
          {finder("cutoff")}
        </Text>
      </Stack>
    </Stack>
  );
}
