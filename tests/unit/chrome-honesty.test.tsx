/**
 * **The chrome-promise sweep** (spec 004 §14 A19, widened by `/review 70` required change 3 to
 * every chrome promise string and by TASK-108's third escalation to the ranking labels; spec 008
 * AC-6 and AC-9; spec 007 AC-19's forbidden set. TASK-120).
 *
 * The failure this file exists to prevent is the one `/review 70` found: TASK-091's honesty scan
 * passed because it was scoped to `<main>` while the header two bands above it promised same-day
 * delivery and the footer offered "Delivery times and cutoffs", on the same document whose facts
 * block said "no cutoff, because no florist has agreed to one". A promise in the chrome is on
 * *every* page, so it is the most expensive kind of dishonesty on the site and the cheapest to
 * miss.
 *
 * Two different rules, deliberately asserted differently, because the two claims are not the same
 * kind of wrong:
 *
 *  1. **A ranking claim is forbidden copy.** Spec 008 §8 and AC-9: we have no sales, no
 *     personalisation and no paid placement, so "best sellers" / "most popular" / "recommended
 *     for you" cannot be described truthfully at all and a true, cheap alternative exists. The
 *     assertion is over **every locale's messages**, unconditional, with no gate and no escape
 *     list — which is why `nav.category.bestSellers` was *renamed* to `nav.category.ourSelection`
 *     rather than hidden.
 *  2. **A delivery-timing promise is conditional copy.** It is true the day a florist's
 *     `operations` are authored and false until then, so the rule is not "these words may not
 *     exist" but "these words may only render when `anyDeliveryDatesOpen()` is true". The
 *     assertion is therefore: every catalogue key that carries one is in the **declared gated
 *     set** below, and nothing the chrome renders today carries one.
 *
 * The rendered half runs here over the real components in all four locales, and again over the
 * served documents in `tests/e2e/chrome-honesty.spec.ts`. The planted-violation case at the end
 * is what stops this file from being a scan that would pass on any input.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { anyDeliveryDatesOpen } from "../../src/config/countries.ts";
import { launchLocales } from "../../src/config/locales.ts";
import {
  loadMessages,
  MESSAGE_NAMESPACES,
} from "../../src/modules/i18n/messages.ts";
import { HomeFaq } from "../../src/modules/ui/home/HomeFaq.tsx";
import { HowItWorks } from "../../src/modules/ui/home/HowItWorks.tsx";
import { OccasionDates } from "../../src/modules/ui/home/OccasionDates.tsx";
import { ProofRow } from "../../src/modules/ui/home/ProofRow.tsx";
import { SiteFooter } from "../../src/modules/ui/layout/SiteFooter.tsx";
import { SiteHeader } from "../../src/modules/ui/layout/SiteHeader.tsx";
import {
  FORBIDDEN_DELIVERY_PROMISE_TEXT,
  FORBIDDEN_RANKING_TEXT,
  type HonestyPattern,
} from "../support/listing-honesty.ts";

/* -------------------------------------------------------------------------- */
/* The catalogues.                                                            */
/* -------------------------------------------------------------------------- */

type MessageTree = { [key: string]: string | MessageTree };

function catalogue(locale: string): MessageTree {
  return JSON.parse(
    readFileSync(resolve(__dirname, `../../messages/${locale}.json`), "utf8"),
  ) as MessageTree;
}

/** Every leaf of a catalogue as `dotted.key -> value`. */
function flatten(tree: MessageTree, prefix = ""): readonly [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    return typeof value === "string"
      ? ([[path, value]] as const)
      : flatten(value, path);
  });
}

function offences(
  text: string,
  patterns: readonly HonestyPattern[],
): readonly string[] {
  return patterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => name);
}

/**
 * **The declared gated set**: every catalogue key allowed to carry a delivery-timing promise,
 * with the predicate that keeps it off the page.
 *
 * Adding a key here is a deliberate line in a diff and must be paid for by a gate in a component
 * — which is what the rendered half below then proves. A promise string that appears in the
 * catalogue and *not* in this list fails the scan, so a later task cannot reintroduce one by
 * adding a message.
 */
const GATED_PROMISE_KEYS: readonly string[] = [
  // Header utility strip and home finder — `anyDeliveryDatesOpen()` in `SiteHeader`/`FinderCard`.
  "nav.utility.cutoff",
  "nav.utility.cutoffShort",
  "finder.cutoff",
  // Header category row — `requiresDeliveryDates` in `headerCategoryItems()`.
  "nav.category.sameDayDelivery",
  "nav.category.sameDayShort",
  // Home FAQ's appended second sentence — `anyDeliveryDatesOpen()` in `HomeFaq`.
  "faq.whoDelivers.answerCutoff",
  // Home occasion strip's third line — `anyDeliveryDatesOpen()` in `OccasionDates`.
  "home.dates.orderBy",
  // Corridor guide, **live** state only: `corridor:check`'s `live-operations` rule refuses a
  // `live` content file for a destination with no `operations`, and none has one (spec 007 §5.1).
  "corridor.facts.orderBy.value",
  "corridor.steps.live.threeBody",
];

describe("the message catalogues carry no claim we cannot make (AC-9, A19)", () => {
  it("names no ranking in any locale, in any namespace", () => {
    for (const locale of launchLocales) {
      for (const [key, value] of flatten(catalogue(locale))) {
        expect(
          offences(value, FORBIDDEN_RANKING_TEXT),
          `${locale} ${key}: ${value}`,
        ).toEqual([]);
      }
    }
  });

  it("keeps every delivery-timing promise inside the declared gated set", () => {
    const promisingIn = (locale: string): readonly string[] =>
      flatten(catalogue(locale))
        .filter(
          ([, value]) =>
            offences(value, FORBIDDEN_DELIVERY_PROMISE_TEXT).length > 0,
        )
        .map(([key]) => key)
        .toSorted();

    // `en` is the authored source of truth and must match the declared set **key-exact**: a new
    // promise string fails here rather than shipping, and a gate removed from a component leaves
    // its key behind for a reviewer to see.
    expect(promisingIn("en")).toEqual([...GATED_PROMISE_KEYS].toSorted());
    // `de` and `pl` are echoes of `en` and `en-gb` is a thin override set, so each is a subset:
    // the rule is that no locale may carry a promise the declared set does not cover.
    for (const locale of launchLocales) {
      for (const key of promisingIn(locale)) {
        expect(GATED_PROMISE_KEYS, `${locale} ${key}`).toContain(key);
      }
    }
  });

  it("gates them on a predicate that is false for every Phase 0 destination", () => {
    // If this ever goes true without the gated copy being re-read by the founder, the whole file
    // above becomes a statement about a page nobody has checked — so it is asserted here, once.
    expect(anyDeliveryDatesOpen()).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The rendered chrome.                                                       */
/* -------------------------------------------------------------------------- */

function render(locale: string, node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** The visible text of rendered markup: tags stripped, the entities React escapes decoded. */
function text(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll(/\s+/g, " ");
}

const SURFACES: readonly {
  readonly name: string;
  readonly of: (locale: string) => React.ReactElement;
}[] = [
  { name: "SiteHeader", of: (locale) => <SiteHeader locale={locale} /> },
  { name: "SiteFooter", of: (locale) => <SiteFooter locale={locale} /> },
  { name: "HomeFaq", of: () => <HomeFaq /> },
  { name: "HowItWorks", of: () => <HowItWorks /> },
  { name: "ProofRow", of: () => <ProofRow /> },
  { name: "OccasionDates", of: (locale) => <OccasionDates locale={locale} /> },
];

describe("the rendered chrome promises nothing (A19, AC-6)", () => {
  for (const locale of launchLocales) {
    for (const surface of SURFACES) {
      it(`${surface.name} in ${locale} states no cutoff and no ranking`, () => {
        const rendered = text(render(locale, surface.of(locale)));

        expect(
          offences(rendered, [
            ...FORBIDDEN_RANKING_TEXT,
            ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
          ]),
          `${surface.name} ${locale}: ${rendered.slice(0, 300)}`,
        ).toEqual([]);
      });
    }
  }

  it("prints the honest forms in their place, in every locale", () => {
    for (const locale of launchLocales) {
      const header = text(render(locale, <SiteHeader locale={locale} />));
      expect(header, locale).toContain(
        "Delivery dates open when we confirm our first florist",
      );
      // "Same-day delivery" and "Delivery times and cutoffs" carry no pattern-matchable promise
      // on their own ("Delivery times and cutoffs" is a page title), so their absence is asserted
      // by name: both rows are gated on `requiresDeliveryDates` and neither renders today.
      expect(header, locale).not.toContain("Same-day");
      const footer = text(render(locale, <SiteFooter locale={locale} />));
      expect(footer, locale).not.toContain("Delivery times and cutoffs");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The scan fails on a planted violation.                                     */
/* -------------------------------------------------------------------------- */

describe("the sweep itself", () => {
  it("fails on a planted ranking claim and a planted cutoff promise", () => {
    for (const planted of [
      "Best sellers",
      "Bestseller",
      "Most popular",
      "Recommended for you",
      "Najpopularniejsze bukiety",
      "Unsere beliebtesten Sträuße",
    ]) {
      expect(offences(planted, FORBIDDEN_RANKING_TEXT), planted).not.toEqual(
        [],
      );
    }
    for (const planted of [
      "Order by 14:00 in Warsaw for delivery today",
      "Same-day delivery",
      "Next-day delivery to Poland",
      "We deliver today",
      "Bestellen Sie bis 14:00 Uhr",
      "Dostawa jeszcze dziś",
    ]) {
      expect(
        offences(planted, FORBIDDEN_DELIVERY_PROMISE_TEXT),
        planted,
      ).not.toEqual([]);
    }
  });

  it("passes the honest sentences this sweep put in their place", () => {
    for (const honest of [
      "Delivery dates open when we confirm our first florist",
      "Delivery dates are not open yet",
      "Our selection",
      "— no cutoff, because no florist has agreed to one",
      "Continue shows you where we deliver and where we are still choosing florists.",
    ]) {
      expect(
        offences(honest, [
          ...FORBIDDEN_RANKING_TEXT,
          ...FORBIDDEN_DELIVERY_PROMISE_TEXT,
        ]),
        honest,
      ).toEqual([]);
    }
  });
});
