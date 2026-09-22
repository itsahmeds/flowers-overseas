/**
 * The country occasion `/{locale}/{country}/{occasions}/{occasion}` (spec 008 §2 row 8, §5.2,
 * §5.3 row 2, §5.4, §12 task 7 — the country half of **AC-11**; T-01, T-11;
 * `docs/design/wireframes/country-occasion-desktop.dc.html` and `-mobile.dc.html`; TASK-111).
 *
 * **Why the page type exists.** Mother's Day is a different day in every country a buyer might
 * send to. This page answers "what can you make for it *there*, and when is it *there*" on one
 * URL, and the dated line is the whole reason it deserves to rank (`plan/02` §6: "a wrong
 * Mother's Day is worse than no page").
 *
 * **Block order, from the artboard** — breadcrumb · `h1` · the dated line · the lede · the demo
 * sentence · the priced grid · the "also in {country}" row. §5.3 row 2 is the normative list
 * ("the same, minus the tiles; occasion adds the dated line for that country").
 *
 * **The date is never computed here** (AC-11, T-11). It arrives on `listingView().occasionDates`
 * as one row for this destination, produced by spec 007's `occasionDate`/`nextOccasions` through
 * `upcomingOccasions()` — the same path the shop root's table and the occasion hub read, so no two
 * page types can print different days for one occasion. This component formats it with spec 003's
 * `formatDate` and composes nothing: there is no date literal here and none in any message string.
 *
 * **`date: null` is the honest blank** (§14 design round **Q6**). An occasion whose rule is `none`,
 * and Romania's Orthodox Easter until spec 009 task 2 adds the rule type (`plan/13` B15), carries
 * no date: the page says it is not printing one and why. The Western date is never reused.
 *
 * **No empty state.** A country occasion exists only where six deliverable products do (§2 row 8,
 * §13 Q7), so the grid can never be empty — the artboard draws that cell as unreachable, and
 * `tests/unit/catalog-occasion-page.test.tsx` asserts the existence set keeps it so.
 *
 * **What is deliberately not here.** The delivery-facts panel the desktop artboard draws under the
 * demo sentence is spec 007's `CorridorFacts` in its `facts-unknown` form: it reads a
 * `CorridorView`, and §5.2 makes `listingView()` the **only** source for this page. Spec 008 §14
 * **A9** already ruled that for the shop root — spec text governs over the drawing — and §5.3
 * row 2's block list names it no more than row 1 does, so it stays on the corridor page the
 * breadcrumb links to (dated row in `docs/design/README.md`). The **toolbar** and **pagination**
 * the artboard draws are TASK-114's (§14 **A8** (c)): nothing here reads `searchParams`, and a
 * sort form that cannot sort is a control the page does not pretend to have. `BreadcrumbList` and
 * `ItemList` are TASK-115's. No client island, no `useState`, no fetch (§5.4).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { formatDate } from "@/modules/i18n";
import {
  type ChipLinkView,
  CategoryChipRow,
  Container,
  Display,
  Label,
  ListingGrid,
  Stack,
  Text,
  assertSinglePriority,
} from "@/modules/ui";

import type { ListingView } from "../listing";

import { ListingBreadcrumb } from "./ListingBreadcrumb";
import { localeCode, registryLabel } from "./labels";

/** Midday UTC: the hour that is the same calendar date in every European zone (007's rule). */
function instantOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export interface CountryOccasionPageProps {
  readonly view: ListingView;
}

export function CountryOccasionPage({
  view,
}: CountryOccasionPageProps): ReactElement {
  const t = useTranslations();
  const shop = useTranslations("shop");
  const catalog = useTranslations("catalog");
  const code = localeCode(view.locale);
  const country = registryLabel(t, view.country?.nameKey ?? "");
  // The occasion's name is the founder's **authored copy** in this locale (spec 006's corpus), not
  // a message key: `listingView()` carries it on the entity, and nothing here composes a name.
  const occasion = view.entity?.name ?? "";

  // AC-24, asserted where the nomination is made: the first card of the one grid, and nothing else
  // on the page, carries `priority`.
  const lcp = view.items[0];
  assertSinglePriority(
    lcp !== undefined && lcp.photo.kind === "asset" ? [lcp.photo.assetId] : [],
  );

  /** This destination's row — the one `occasionDates` entry a country occasion carries. */
  const dated = view.occasionDates?.[0];
  const date = dated?.date ?? null;

  /**
   * The artboard's row, as one list: the **other** occasions of this destination that have a page,
   * then the shop root. The current occasion is left out rather than repeated as a marker — the
   * drawing's row is the way *out* of this page — and an occasion below the floor has no URL, so
   * it is absent rather than disabled (§13 Q7, spec 004 AC-14). Nothing is invented: every href
   * is one `listingView()` already resolved, and the shop root's label is a message.
   */
  const alsoIn: readonly ChipLinkView[] = [
    ...view.links.chips.filter((chip) => chip.current !== true),
    ...(view.links.shopRoot === undefined
      ? []
      : [
          {
            key: "shop-root",
            name: shop("occasion.shopRootLink", { country }),
            href: view.links.shopRoot,
          },
        ]),
  ];

  return (
    <Container
      as="main"
      id="main"
      data-fo-country-occasion={view.entity?.key ?? ""}
      data-fo-listing-state={view.items.length === 0 ? "empty" : "populated"}
    >
      <Stack gap="xl" className="py-xl">
        <ListingBreadcrumb crumbs={view.breadcrumb} />

        <Stack gap="md">
          <Display as="h1" size="display-s">
            {shop("h1.countryOccasion", { occasion, country })}
          </Display>

          {/* The dated line, and the reason this page type is worth having. */}
          <Stack
            gap="xs"
            className="border-accent p-md max-w-[760px] border"
            data-fo-occasion-date={date ?? ""}
          >
            <Text as="span" size="md">
              {date === null
                ? shop("occasion.undatedLine", { occasion, country })
                : shop("occasion.datedLine", {
                    occasion,
                    country,
                    date: formatDate(
                      instantOf(date),
                      code,
                      "calendarDate",
                      "UTC",
                    ),
                  })}
            </Text>
            {date === null ? null : (
              <Text measure size="sm" tone="muted">
                {shop("occasion.dateNote", { country })}
              </Text>
            )}
          </Stack>

          <Text measure>{shop("occasion.lede", { country })}</Text>
          {/* The Phase 0 demo sentence, shared with the shop root: one wording for one fact, so a
              buyer who reads it twice reads the same sentence. */}
          <Text measure tone="muted">
            {shop("root.demoNotice", { country })}
          </Text>
        </Stack>

        {/* Products before prose (§5.3, `docs/design/README.md` §Density). */}
        <Stack as="section" gap="md" data-fo-shop-listing>
          <Label>{shop("toolbar.count", { count: view.resultCount })}</Label>
          {/* §2 "Sort": the default order is labelled for what it is and never called a ranking by
              sales. The sentence ships with the order, not with the control. */}
          <Text measure size="sm" tone="muted">
            {shop("toolbar.disclosure")}
          </Text>
          <ListingGrid cards={view.items} locale={code} priority />
          {/* Stale FX (spec 005 §14 A3): the projection fell back to the destination's own
              authored price, so the page says which currency it is quoting. Once for the page,
              because one rate priced all of it. */}
          {view.fxFallback ? (
            <Text measure size="sm" tone="muted">
              {catalog("availability.fxUnavailable")}
            </Text>
          ) : null}
        </Stack>

        {/* The artboard's "Also in Poland" row: the other occasions of this destination that have
            a page, and the destination's shop root. Every href is one `listingView()` resolved, so
            none can point at a page that does not exist (spec 004 AC-14, 007 AC-17); an occasion
            below the floor is absent rather than disabled. The occasions index is not repeated
            here — the breadcrumb already carries it, as a link the day TASK-113 publishes its
            link id and as text until then. */}
        <CategoryChipRow
          heading={shop("occasion.siblingsHeading", { country })}
          id="occasion-siblings"
          items={alsoIn}
          locale={code}
        />
      </Stack>
    </Container>
  );
}
