/**
 * The corridor page, one template for both states (spec 007 §5.3, AC-8, AC-19, AC-24;
 * `docs/design/wireframes/corridor-country-desktop.dc.html` and `-mobile`; TASK-091).
 *
 * The artboards' block order, top to bottom: breadcrumb · hero (h1, status chip, authored intro,
 * the reserved photo slot) · delivery facts · how we work here · the authored guide · the
 * occasion calendar · what is sent and what is not · where we deliver · the FAQ · related
 * destinations · the shop entry. **Zero template edits between the two states**: every difference
 * is a branch on data the view model already decided (AC-8).
 *
 * Three things this component deliberately does not do:
 *
 *  - **It mounts no island and fetches nothing.** Every block above is a Server Component reading
 *    a value computed at build time; the page's first-load script is the layout's, unchanged
 *    (AC-24). There is nothing here that could be a `useState`.
 *  - **It renders no block whose data is missing.** The calendar, the undated-occasion line, the
 *    related row and the shop entry each disappear — heading included — rather than printing a
 *    placeholder (spec 004 §5.3's `TrustMarks` rule, and the artboards' state C).
 *  - **It claims nothing in the guide state.** No cutoff, no delivery date, no price, no florist,
 *    no city, no count. The shop entry, which spec 008 AC-20 now fills on a guide page, is its bare
 *    link there: its heading and body are the live state's (`/review 98`; TASK-113). The `h1` itself carries the difference the founder ruled on 2026-09-15:
 *    the guide says "Sending flowers to {country}" (the authored `h1` of the content file), and
 *    the imperative "Send flowers to {country}" belongs to the live state, because it is a call
 *    to an action the page cannot yet take.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import {
  Chip,
  Container,
  Display,
  Grid,
  Label,
  Photo,
  Stack,
  Text,
} from "../../ui/index.ts";
import type { CorridorView } from "../corridor.ts";

import { CorridorBreadcrumb } from "./CorridorBreadcrumb.tsx";
import { CorridorCalendar } from "./CorridorCalendar.tsx";
import { CorridorFacts } from "./CorridorFacts.tsx";
import { CorridorFaq } from "./CorridorFaq.tsx";
import { CorridorGuideBody } from "./CorridorGuideBody.tsx";
import { CorridorRelated } from "./CorridorRelated.tsx";
import { countryName, registryLabel } from "./labels.ts";

/**
 * The three "how we work" tiles, per state, as fully-qualified message keys. Literals rather than
 * a composed path for `pnpm i18n:check`'s usage scan (see `CorridorFacts`), and a table rather
 * than a branch per tile so the two states cannot drift apart in length or order.
 */
const STEP_KEYS = {
  guide: [
    ["corridor.steps.guide.oneTitle", "corridor.steps.guide.oneBody"],
    ["corridor.steps.guide.twoTitle", "corridor.steps.guide.twoBody"],
    ["corridor.steps.guide.threeTitle", "corridor.steps.guide.threeBody"],
  ],
  live: [
    ["corridor.steps.live.oneTitle", "corridor.steps.live.oneBody"],
    ["corridor.steps.live.twoTitle", "corridor.steps.live.twoBody"],
    ["corridor.steps.live.threeTitle", "corridor.steps.live.threeBody"],
  ],
} as const;

export interface CorridorPageProps {
  readonly view: CorridorView;
}

export function CorridorPage({ view }: CorridorPageProps): ReactElement {
  const t = useTranslations();
  const c = useTranslations("corridor");
  const country = countryName(t, view.nameKey);
  const live = view.state === "live";

  return (
    <Container
      as="main"
      id="main"
      data-fo-corridor={view.iso2}
      data-fo-corridor-state={view.state}
    >
      <Stack gap="xl" className="py-xl">
        <CorridorBreadcrumb crumbs={view.breadcrumb} />

        {/* Hero: the one `<h1>` (the text LCP element — there is no photography of any
            destination, so the slot is spec 004's placeholder and the LCP stays server-rendered
            text), the status chip, and the authored intro. */}
        <Grid columns="1-2" gap="xl" className="items-start">
          <Stack gap="md">
            <Display as="h1" size="display-s">
              {view.h1}
            </Display>
            <Chip tone={live ? "accent" : "muted"} className="self-start">
              {registryLabel(t, view.stateKey)}
            </Chip>
            <Text measure>{view.intro}</Text>
          </Stack>
          <Photo ratio="hero" caption={c("photo.caption", { country })} />
        </Grid>

        {/* Delivery facts, in the form the data allows. */}
        <Stack as="section" gap="md" data-fo-corridor-facts>
          <Stack gap="xs">
            <Label>{c("facts.eyebrow")}</Label>
            <Display size="2xl">
              {live ? c("facts.headingLive") : c("facts.headingGuide")}
            </Display>
          </Stack>
          <CorridorFacts view={view} />
        </Stack>

        {/* How we work here — future tense for a destination we have not opened, present tense
            only where a florist is taking our orders. */}
        <Stack as="section" gap="md" data-fo-corridor-steps>
          <Stack gap="xs">
            <Label>
              {live ? c("steps.eyebrowLive") : c("steps.eyebrowGuide")}
            </Label>
            <Display size="2xl">
              {live
                ? c("steps.headingLive", { country })
                : c("steps.headingGuide")}
            </Display>
          </Stack>
          <Grid columns="1-3" gap="md">
            {STEP_KEYS[live ? "live" : "guide"].map(
              ([titleKey, bodyKey], index) => (
                <Stack
                  className="border-rule bg-surface p-md border"
                  gap="sm"
                  key={titleKey}
                >
                  <Label>{String(index + 1).padStart(2, "0")}</Label>
                  <Text as="span" className="font-semibold">
                    {registryLabel(t, titleKey)}
                  </Text>
                  <Text as="span" size="sm" tone="muted">
                    {registryLabel(t, bodyKey)}
                  </Text>
                </Stack>
              ),
            )}
          </Grid>
        </Stack>

        {/* The authored guide: the ≥600 words the existence rule is there to protect. */}
        <CorridorGuideBody body={view.body} />

        {/* The destination's own calendar — absent entirely when it has no rules. */}
        {view.occasions === undefined ? null : (
          <CorridorCalendar
            country={country}
            locale={view.locale}
            occasions={view.occasions}
            undated={view.undatedOccasions}
          />
        )}

        {/* What is sent, and what is not: the authored `localFlowers` / `taboos` pair. */}
        <Stack as="section" gap="md" data-fo-corridor-flowers>
          <Stack gap="xs">
            <Label>{c("flowers.eyebrow", { country })}</Label>
            <Display size="2xl">{c("flowers.heading")}</Display>
          </Stack>
          <Grid columns="1-2" gap="lg">
            <Stack className="border-rule bg-surface p-md border" gap="sm">
              <Label>{c("flowers.sentMost")}</Label>
              <Text size="sm" tone="muted">
                {view.localFlowers}
              </Text>
            </Stack>
            <Stack className="border-rule bg-surface p-md border" gap="sm">
              <Label>{c("flowers.sentRarely")}</Label>
              <Text size="sm" tone="muted">
                {view.taboos}
              </Text>
            </Stack>
          </Grid>
        </Stack>

        {/* Where we deliver. The registry refuses a `citiesKey` on a destination that is not
            live, so the no-cities branch cannot name a town by accident. */}
        <Stack as="section" gap="md" data-fo-corridor-coverage>
          <Stack gap="xs">
            <Label>{c("coverage.eyebrow")}</Label>
            <Display size="xl">
              {view.facts.citiesKey === undefined
                ? c("coverage.headingNone", { country })
                : c("coverage.headingCities", { country })}
            </Display>
          </Stack>
          <Text measure>
            {view.facts.citiesKey === undefined
              ? c("coverage.bodyNone", { country })
              : registryLabel(t, view.facts.citiesKey)}
          </Text>
        </Stack>

        <CorridorFaq country={country} faq={view.faq} />

        {view.related === undefined ? null : (
          <CorridorRelated related={view.related} />
        )}

        {/* The shop entry. Rendered only when spec 008 has published a target for this country:
            an unpublished link id renders no heading, no disabled button and no "coming soon"
            box, which is what keeps "zero links to a non-200 URL" true by construction.
            **In the guide state it is the link and nothing else** (`/review 98`, TASK-113): the
            heading ("See what can arrive in…") and the body ("Bouquets our florists in… can
            make, … with delivery…") are state-B copy, and each is a florist, delivery or
            availability claim the guide state may not make beside "Not yet. We are choosing
            florists in {country} now". The link's own label names flowers and a country and
            claims nothing, so a guide page may carry it. */}
        {view.liveSlots.shopEntryHref === undefined ? null : (
          <Stack
            as="section"
            className="border-accent bg-surface-raised p-lg border"
            data-fo-corridor-shop
            gap="sm"
          >
            {live ? (
              <>
                <Display size="xl">{c("shop.heading", { country })}</Display>
                <Text size="sm" tone="muted">
                  {c("shop.body", { country })}
                </Text>
              </>
            ) : null}
            <a
              className="text-accent font-semibold"
              href={view.liveSlots.shopEntryHref}
            >
              {c("shop.cta", { country })}
            </a>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
