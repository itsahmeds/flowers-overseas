/**
 * The corridor page, one template for both states (spec 007 §5.3, AC-8, AC-19, AC-24;
 * `docs/design/wireframes/corridor-country-desktop.dc.html` and `-mobile`; TASK-091).
 *
 * The artboards' block order, top to bottom: breadcrumb · the first screen (h1, the state line,
 * the next three dates of the calendar, the authored intro; `CorridorFirstScreen`, TASK-189) ·
 * delivery facts · how we work here · the authored guide · the
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

import { PAGE_FRAME } from "../../ui/index.ts";
import type { CorridorView } from "../corridor.ts";

import { CorridorBreadcrumb } from "./CorridorBreadcrumb.tsx";
import { CorridorCalendar } from "./CorridorCalendar.tsx";
import { CorridorFacts } from "./CorridorFacts.tsx";
import { CorridorFaq } from "./CorridorFaq.tsx";
import { CorridorFirstScreen } from "./CorridorFirstScreen.tsx";
import { CorridorGuideBody } from "./CorridorGuideBody.tsx";
import { CorridorRelated } from "./CorridorRelated.tsx";
import { CorridorSection } from "./CorridorSection.tsx";
import { CorridorShopEntry } from "./CorridorShopEntry.tsx";
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

  // The shop entry (`CorridorShopEntry`). Rendered only when spec 008 has published a target for
  // this country: an unpublished link id renders no heading, no disabled button and no "coming
  // soon" box, which is what keeps "zero links to a non-200 URL" true by construction. **In the
  // guide state it is the link and nothing else** (`/review 98`, TASK-113); the live state adds
  // the heading, the body and the chip row (spec 007 §14 A10, TASK-147). v2 draws it as the poppy
  // pill under the related chips (TASK-179).
  const shop =
    view.liveSlots.shopEntryHref === undefined ? null : (
      <CorridorShopEntry
        afterRelated={view.related !== undefined}
        chips={view.liveSlots.shopChips}
        country={country}
        href={view.liveSlots.shopEntryHref}
        live={live}
      />
    );

  return (
    <main
      className={`${PAGE_FRAME} pb-(--section-fluid)`}
      id="main"
      data-fo-corridor={view.iso2}
      data-fo-corridor-state={view.state}
    >
      <CorridorBreadcrumb crumbs={view.breadcrumb} />

      {/* The first screen (spec 007 §14 A11 (b), A12 (a); TASK-189): the one `<h1>` (the LCP
          element: no photograph of any destination exists, so no image and no preload), the
          state as one quiet line, the next three rows of this page's own calendar, and the
          authored intro. */}
      <CorridorFirstScreen country={country} view={view} />

      {/* Delivery facts, in the form the data allows. */}
      <CorridorSection
        eyebrow={c("facts.eyebrow")}
        heading={live ? c("facts.headingLive") : c("facts.headingGuide")}
        id="corridor-facts"
        marker="data-fo-corridor-facts"
      >
        <CorridorFacts view={view} />
      </CorridorSection>

      {/* How we work here — future tense for a destination we have not opened, present tense
          only where a florist is taking our orders. The route: numbered rings joined by a dashed
          rule. */}
      <CorridorSection
        eyebrow={live ? c("steps.eyebrowLive") : c("steps.eyebrowGuide")}
        heading={
          live ? c("steps.headingLive", { country }) : c("steps.headingGuide")
        }
        id="corridor-steps"
        marker="data-fo-corridor-steps"
      >
        <ol className="m-0 grid list-none p-0">
          {STEP_KEYS[live ? "live" : "guide"].map(
            ([titleKey, bodyKey], index, all) => (
              <li className="relative ps-[76px] pb-[36px]" key={titleKey}>
                <span
                  aria-hidden="true"
                  className="display text-md text-mark bg-card absolute start-0 -top-[4px] grid size-[52px] place-items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--color-mark),0_0_0_5px_var(--color-paper-2),inset_0_0_0_5px_var(--color-card),inset_0_0_0_6px_var(--color-mark)]"
                >
                  {index + 1}
                </span>
                {index === all.length - 1 ? null : (
                  <span
                    aria-hidden="true"
                    className="border-rule absolute start-[25px] top-[56px] bottom-[4px] border-s-2 border-dashed"
                  />
                )}
                <h3 className="display text-h3 m-0 leading-[1.2] md:text-[25px]">
                  {registryLabel(t, titleKey, { country })}
                </h3>
                <p className="text-ink-muted m-0 mt-[8px] max-w-[48ch]">
                  {registryLabel(t, bodyKey, { country })}
                </p>
              </li>
            ),
          )}
        </ol>
      </CorridorSection>

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
      <CorridorSection
        eyebrow={c("flowers.eyebrow", { country })}
        heading={c("flowers.heading")}
        id="corridor-flowers"
        marker="data-fo-corridor-flowers"
      >
        <div className="grid gap-[20px] md:grid-cols-2">
          <div className="bg-leaf-wash rounded-photo px-[28px] py-[26px]">
            <h3 className="display text-md m-0 mb-[10px]">
              {c("flowers.sentMost")}
            </h3>
            <p className="text-ink-muted m-0">{view.localFlowers}</p>
          </div>
          <div className="bg-blush rounded-photo px-[28px] py-[26px]">
            <h3 className="display text-md m-0 mb-[10px]">
              {c("flowers.sentRarely")}
            </h3>
            <p className="text-ink-muted m-0">{view.taboos}</p>
          </div>
        </div>
      </CorridorSection>

      {/* Where we deliver. The registry refuses a `citiesKey` on a destination that is not live,
          so the no-cities branch cannot name a town by accident. */}
      <CorridorSection
        eyebrow={c("coverage.eyebrow")}
        heading={
          view.facts.citiesKey === undefined
            ? c("coverage.headingNone", { country })
            : c("coverage.headingCities", { country })
        }
        id="corridor-coverage"
        marker="data-fo-corridor-coverage"
      >
        <p className="text-ink-muted text-body-s m-0 max-w-prose md:text-[19px]">
          {view.facts.citiesKey === undefined
            ? c("coverage.bodyNone", { country })
            : registryLabel(t, view.facts.citiesKey)}
        </p>
      </CorridorSection>

      <CorridorFaq country={country} faq={view.faq} />

      {view.related === undefined ? (
        shop
      ) : (
        <CorridorRelated related={view.related}>{shop}</CorridorRelated>
      )}
    </main>
  );
}
