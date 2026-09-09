/**
 * `DestinationList` — the seven Phase-0 destinations, named, with their state (spec 004 §2
 * "Locale-home skeleton", §5.3 `DestinationPicker`, **AC-11**, AC-14; TASK-052).
 *
 * This is the surface AC-11's second half asks for — "renders every destination as plain text
 * with the onboarding line while `corridorPagePublished` is false, and renders a link to
 * `localePath(locale, "destinations", slug)` when a fixture flips one flag to true" — and it is
 * where the finder's `Continue` lands while no corridor page exists: it carries
 * `DESTINATIONS_ANCHOR`, the id `finderTarget()` points at.
 *
 * **Why it is here and not in the finder card.** Design round 7 took the status column out of the
 * country field ("no status column, no footnote, no pills"); the founder-approved artboards draw
 * the hero card as headline, proposition, three fields, `Continue` and two lines of help, and
 * nothing else. So the states live where round 7 puts them — after the field, on the page — and
 * the card matches the artboard. The country field's `aria-describedby` points here, so a screen
 * reader hears "Poland — delivering now; Germany — guide, waiting list; …" on focus without the
 * list being drawn over the field.
 *
 * **It is a stand-in with a successor, not a permanent section.** TASK-054 ships the artboards'
 * destinations grid — PL with its five city names, the six guide countries, the "Somewhere else?"
 * block — and inherits this component's `id` (hence the exported constant). What must not change
 * when it does: no destination is a link while its flag is false (AC-14: zero internal links to a
 * non-200 URL), the state is a **word** and never a colour (§5.3), and the onboarding line says
 * what is true — Poland today, six countries where we are still choosing florists.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { Grid, Stack } from "../primitives/layout.tsx";
import { Label, Text } from "../primitives/typography.tsx";

import { FINDER_IDS, finderDestinations } from "./finder-model.ts";
import { HOME_BLEED } from "./HomeHero.tsx";

type Translator = ReturnType<typeof useTranslations>;
/**
 * The cast target is a loose call signature, not `Parameters<Translator>[0]`: see `SiteHeader`'s
 * twin for the measurement — next-intl's key union tips `tsc` into `TS2589` once this branch's
 * namespaces land on top of TASK-073's, and the union checked nothing here that
 * `tests/unit/ui-home.test.tsx`'s "every registry key resolves" assertions do not.
 */
type LabelTranslator = (key: string) => string;

/** The registries hold dotted keys; the one cast lives here (see `FinderCard`'s twin). */
function registryLabel(t: Translator, key: string): string {
  return (t as unknown as LabelTranslator)(key);
}

export interface DestinationListProps {
  readonly locale: string;
}

export function DestinationList({
  locale,
}: DestinationListProps): ReactElement {
  const t = useTranslations();
  const finder = useTranslations("finder");
  const destinations = finderDestinations(locale, (nameKey) =>
    registryLabel(t, nameKey),
  );

  return (
    <Stack
      as="section"
      gap="md"
      className={`py-xl ${HOME_BLEED}`}
      data-fo-finder-destinations
      id={FINDER_IDS.destinations}
    >
      <Label as="h2">{finder("destinations.heading")}</Label>
      <Grid as="ul" columns="2-4" gap="md">
        {destinations.map((destination) => (
          <Stack as="li" gap="none" key={destination.iso2}>
            {destination.href === undefined ? (
              <span className="text-md" data-fo-destination={destination.iso2}>
                {registryLabel(t, destination.nameKey)}
              </span>
            ) : (
              // The published branch: a link, from the same loop, with no template edit —
              // the "a country is data" proof of AC-11.
              <a
                className="text-md underline underline-offset-4"
                data-fo-destination={destination.iso2}
                href={destination.href}
              >
                {registryLabel(t, destination.nameKey)}
              </a>
            )}
            <Text as="span" size="sm" tone="subtle">
              {registryLabel(t, destination.stateKey)}
            </Text>
          </Stack>
        ))}
      </Grid>
      <Text measure size="sm" tone="subtle">
        {finder("destinations.onboarding")}
      </Text>
    </Stack>
  );
}
