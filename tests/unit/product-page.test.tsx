/**
 * The product page and its six primitives, rendered from the real `productView()` (spec 009 §2,
 * §5.3; AC-7's render half, AC-8, AC-9, AC-10, AC-21, AC-22, AC-23, AC-25; T-07 unit half, T-08,
 * T-09 unit half, T-10, T-21, T-22, T-23, T-25 unit half; TASK-126, TASK-127).
 *
 * **No fixture view and no mocked module.** Every view here is `productView()` over the committed
 * dataset: Poland's authored `operations` block makes its picker `preview`, the six other
 * destinations have none and are `unavailable`, and `withActivePartnersProvider` — the one seam
 * spec 007 gives for "a florist exists" — turns the same route's Poland page `live`. The clocks are
 * chosen for what they make the data do:
 *
 *  - `WOMENS_DAY_WEEK` is 09:00 Warsaw on Monday 1 March 2027, the drawing's own clock: the
 *    fourteen-day window holds Women's Day (Monday 8 March), an authored `peak_day` row of
 *    `dateSurcharges("PL", …)`, so a **selectable surcharged date** exists in `live`. The FX
 *    snapshot is stale by then, so the page quotes the destination's own currency (`fallback`).
 *  - `IN_WINDOW` is inside the committed ECB snapshot's window, so `en` converts (`converted`).
 *
 * The page is mounted exactly as the route mounts it (`mount()` below): `ProductPage` with spec
 * 008's breadcrumb and spec 007's delivery facts in its two slots.
 *
 * Every money expectation is **derived**, never typed: a chip's expected text is the difference of
 * two `priceProjection()` calls, an add-on's is its `AddonLine.price`, the total is the view's own
 * `displayPrice`. A component that printed a hard-coded fee, or computed one, goes red here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { COUNTRY_CODES } from "../../src/config/countries.ts";
import {
  ListingBreadcrumb,
  type ProductView,
  priceProjection,
  productView,
} from "../../src/modules/catalog";
import { dateSurcharges } from "../../src/modules/catalog/pricing/resolve.ts";
import { DeliveryFacts } from "../../src/modules/geo";
import { withActivePartnersProvider } from "../../src/modules/geo/partners.ts";
import { formatDate, formatMoney, loadMessages } from "../../src/modules/i18n";
import { ProductPage } from "../../src/modules/ui";
import { zoneCity } from "../../src/modules/ui/product/labels.ts";
import { lcpNominations } from "../support/lcp-nomination.ts";
import { listingHonestyViolations, textOf } from "../support/listing-honesty";

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
type Locale = (typeof LOCALES)[number];

/** 09:00 Europe/Warsaw, Monday 1 March 2027 — Women's Day (8 March) is in the window. */
const WOMENS_DAY_WEEK = new Date("2027-03-01T08:00:00Z");
/** 15:30 Europe/Warsaw, the same Monday: past the 14:00 cutoff, so today closes as `pastCutoff`. */
const PAST_CUTOFF = new Date("2027-03-01T14:30:00Z");
/** Wednesday 9 September 2026, 09:00 Warsaw — inside the committed FX snapshot's window. */
const IN_WINDOW = new Date("2026-09-09T07:00:00Z");

const AMBER = "FO-BQ-001"; // three tiers, photographed
const ANTHURIUM = "FO-PT-005"; // one tier, photographed since TASK-168
const VASED = "FO-AR-002"; // ships in a vase, photographed since TASK-168

const NAMESPACES = [
  "product",
  "delivery",
  "catalog",
  "corridor",
  "breadcrumb",
  "shop",
  "media",
  "a11y",
  "destinations",
  "occasions",
  "common",
] as const;

const partnered = { hasActivePartners: (iso2: string) => iso2 === "PL" };

type ViewOptions = Partial<Parameters<typeof productView>[1]>;

async function viewOf(
  locale: string,
  countryIso: string,
  sku: string,
  options: ViewOptions = {},
): Promise<ProductView> {
  const view = await productView(
    { locale, countryIso, sku },
    { parameterised: false, productLinks: true, ...options },
  );
  if (view === undefined) {
    throw new Error(`${locale}/${countryIso}/${sku} must be a page`);
  }
  return view;
}

/**
 * A real view with the product's media removed: the gallery as `productView()` builds it for a
 * product with no approved, alt-texted asset. Since TASK-168 approved photo batch 2 every
 * committed product has a photograph, so a no-photograph case builds its subject here and asserts
 * it started from a photographed view, so the removal is what the case measures.
 */
function withoutMedia(view: ProductView): ProductView {
  expect(view.gallery.kind).toBe("photos");
  return { ...view, gallery: { kind: "placeholder" } };
}

function liveViewOf(
  locale: string,
  sku: string,
  options: ViewOptions = {},
): Promise<ProductView> {
  return withActivePartnersProvider(partnered, () =>
    viewOf(locale, "PL", sku, options),
  );
}

/** The page as the route mounts it: the two slots are the route's own components. */
function mount(view: ProductView): ReactElement {
  return (
    <ProductPage
      breadcrumb={<ListingBreadcrumb crumbs={view.breadcrumb} />}
      facts={
        <DeliveryFacts
          facts={view.facts}
          locale={view.locale}
          nameKey={view.country.nameKey}
          prices="omit"
        />
      }
      view={view}
    />
  );
}

function render(view: ProductView): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={view.locale}
      messages={loadMessages(view.locale as Locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      {mount(view)}
    </NextIntlClientProvider>,
  );
}

function readable(html: string): string {
  return textOf(
    html
      .replaceAll("&#x27;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll("&amp;", "&"),
  );
}

/** One chip's markup: from its `<label data-fo-date=…>` to its closing `</label>`. */
function chips(html: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const match of html.matchAll(
    /<label[^>]*data-fo-date="(\d{4}-\d{2}-\d{2})"[\s\S]*?<\/label>/gu,
  )) {
    found.set(match[1] ?? "", match[0]);
  }
  return found;
}

/** The markup between `data-fo-<block>` and the end of its element's subtree, approximately. */
function block(html: string, marker: string): string {
  const start = html.indexOf(marker);
  if (start === -1) return "";
  const open = html.lastIndexOf("<", start);
  const tag = /^<([a-z]+)/u.exec(html.slice(open))?.[1] ?? "div";
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}[\\s>]`, "gu");
  re.lastIndex = open;
  for (let hit = re.exec(html); hit !== null; hit = re.exec(html)) {
    depth += hit[1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(open, html.indexOf(">", hit.index) + 1);
  }
  return html.slice(open);
}

const decode = (text: string): string =>
  text.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

/* -------------------------------------------------------------------------- */
/* AC-8 — three states, chosen by data, one template.                         */
/* -------------------------------------------------------------------------- */

describe("AC-8: the picker says only what the destination's data allows, in one template", () => {
  it("renders `unavailable` for every destination with no `operations` block, in four locales", async () => {
    let checked = 0;
    for (const locale of LOCALES) {
      for (const iso2 of COUNTRY_CODES) {
        const view = await productView(
          { locale, countryIso: iso2, sku: AMBER },
          { parameterised: false },
        );
        if (view === undefined || view.delivery.state !== "unavailable") {
          continue;
        }
        const html = render(view);
        expect(html, `${locale}/${iso2}`).toContain(
          'data-fo-picker-state="unavailable"',
        );
        expect(chips(html).size, `${locale}/${iso2}: dates`).toBe(0);
        expect(html, `${locale}/${iso2}: cutoff`).not.toContain(
          "data-fo-cutoff",
        );
        expect(html, `${locale}/${iso2}: radios`).not.toContain('name="date"');
        checked += 1;
      }
    }
    // Six destinations have no `operations` block; Poland has one. Four locales each.
    expect(checked).toBe(6 * LOCALES.length);
  });

  it("renders Poland as `preview`: the full grid, nothing selectable, the preview notice", async () => {
    for (const locale of LOCALES) {
      const view = await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK });
      expect(view.delivery.state).toBe("preview");
      const html = render(view);
      const grid = chips(html);
      expect(grid.size, locale).toBe(view.delivery.dates.length);
      expect(grid.size, locale).toBeGreaterThan(0);
      for (const [date, chip] of grid) {
        expect(chip, `${locale} ${date}`).toMatch(/<input[^>]*disabled/u);
      }
      expect(html).not.toMatch(/<input(?![^>]*disabled)[^>]*name="date"/u);
      expect(html).not.toContain(">Use this date<");
      expect(html).toContain('data-fo-picker-state="preview"');
    }
  });

  it("renders the same route `live` when a florist exists: selectable dates, cutoff, earliest preselected", async () => {
    const view = await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK });
    expect(view.delivery.state).toBe("live");
    const html = render(view);
    const selectable = view.delivery.dates.filter((date) => date.selectable);
    expect(selectable.length).toBeGreaterThan(0);
    const enabled = [...chips(html).values()].filter(
      (chip) => !/<input[^>]*disabled/u.test(chip),
    );
    expect(enabled).toHaveLength(selectable.length);
    // The earliest selectable date is the checked one, and it is the view's own choice.
    const checked = [...chips(html)].filter(([, chip]) =>
      /<input[^>]*checked/u.test(chip),
    );
    expect(checked.map(([date]) => date)).toEqual([selectable[0]?.date]);
    expect(html).toContain("data-fo-cutoff");
    expect(readable(html)).toContain(
      "Order by 14:00 in Warsaw — the recipient's time, not yours",
    );
    expect(html).toContain(">Use this date<");
  });
});

/* -------------------------------------------------------------------------- */
/* AC-7 (render half) — the reason in words, and in the accessible name.      */
/* -------------------------------------------------------------------------- */

describe("AC-7: a closed date says why, in words, inside its own label", () => {
  it("prints every calendar reason beside its date, inside the radio's `<label>`", async () => {
    const view = await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK });
    const html = render(view);
    const grid = chips(html);
    const closed = view.delivery.dates.filter((date) => !date.selectable);
    expect(closed.length).toBeGreaterThan(0);
    for (const date of closed) {
      const chip = grid.get(date.date) ?? "";
      const why = /data-fo-date-why[^>]*>([^<]+)</u.exec(chip)?.[1] ?? "";
      expect(why.trim(), date.date).not.toBe("");
      // Inside the `<label>` that wraps the disabled radio: the reason is part of its name.
      expect(chip, date.date).toMatch(/<input[^>]*disabled/u);
      expect(chip).toContain(`data-fo-date-reason="${date.reasonKey ?? ""}"`);
    }
    // The Sunday is closed for the Sunday rule, said as the destination's own sentence.
    expect(readable(html)).toContain("We do not deliver on Sundays in Poland");
  });

  it("names the shared `preview` sentence in every not-yet-orderable chip's accessible name (Q6)", async () => {
    const view = await viewOf("en", "PL", AMBER, { now: WOMENS_DAY_WEEK });
    const html = render(view);
    const noticeId =
      /id="([^"]+)"[^>]*>This is how delivery dates will work in Poland/u.exec(
        html,
      )?.[1];
    expect(noticeId).toBeDefined();
    const shared = view.delivery.dates.filter(
      (date) => date.reasonKey === "delivery.reason.notOrderable",
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const date of shared) {
      const chip = chips(html).get(date.date) ?? "";
      expect(chip, date.date).toContain(
        `aria-labelledby="date-${date.date} ${noticeId ?? ""}"`,
      );
      // …and prints no per-chip copy of it: the sentence is visible once (Q6).
      expect(chip).not.toContain("data-fo-date-why");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-9 — every selectable chip prints its money; selection moves one total.   */
/* -------------------------------------------------------------------------- */

describe("AC-9: the fee is on the chip before selection, and selecting moves exactly one total", () => {
  it("prints “included” or the exact surcharge — the difference of two projections — on every selectable chip", async () => {
    const view = await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK });
    const html = render(view);
    const authored = await dateSurcharges("PL", {
      from: view.delivery.dates[0]?.date ?? "",
      to: view.delivery.dates.at(-1)?.date ?? "",
    });
    const surchargedDates = new Set(authored.map((row) => row.date));
    let fees = 0;
    for (const date of view.delivery.dates.filter((day) => day.selectable)) {
      const query = {
        productId: AMBER,
        tierKey: view.selectedTierKey,
        countryIso: "PL" as const,
        now: WOMENS_DAY_WEEK,
      };
      const dated = await priceProjection("en", {
        ...query,
        deliveryDate: date.date,
      });
      const bare = await priceProjection("en", query);
      const delta =
        dated.displayPrice.amountMinor - bare.displayPrice.amountMinor;
      const chip = chips(html).get(date.date) ?? "";
      if (surchargedDates.has(date.date)) {
        expect(delta, date.date).toBeGreaterThan(0);
        const expected = formatMoney(
          { amountMinor: delta, currency: dated.displayPrice.currency },
          "en",
          { signDisplay: "always" },
        );
        expect(decode(chip), date.date).toContain(`>${expected}</bdi>`);
        fees += 1;
      } else {
        expect(delta, date.date).toBe(0);
        expect(chip, date.date).toContain(
          'data-fo-date-fee="included">included<',
        );
      }
    }
    // Women's Day 2027 is the window's one selectable surcharged date.
    expect(fees).toBe(1);
  });

  it("changes the one total by exactly the chip, and adds no second charge", async () => {
    const plain = await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK });
    const surcharged = plain.delivery.dates.find(
      (date) => date.selectable && date.surcharge !== undefined,
    );
    expect(surcharged).toBeDefined();
    const chosen = await liveViewOf("en", AMBER, {
      now: WOMENS_DAY_WEEK,
      selection: { date: surcharged?.date ?? "" },
    });
    const before = render(plain);
    const after = render(chosen);

    const totals = (html: string): string[] =>
      [...html.matchAll(/data-fo-price-total[^>]*>([^<]+)</gu)].map(
        (match) => match[1] ?? "",
      );
    expect(totals(before)).toEqual([
      formatMoney(plain.price.displayPrice, "en"),
    ]);
    expect(totals(after)).toEqual([
      formatMoney(chosen.price.displayPrice, "en"),
    ]);
    expect(
      chosen.price.displayPrice.amountMinor -
        plain.price.displayPrice.amountMinor,
    ).toBe(surcharged?.surcharge?.amountMinor);

    // The fee appears on its chip and as the summary's line — and nowhere else.
    const fee = formatMoney(
      surcharged?.surcharge ?? { amountMinor: 0, currency: "PLN" },
      "en",
      { signDisplay: "always" },
    );
    const count = (html: string): number => html.split(`>${fee}<`).length - 1;
    expect(count(before)).toBe(1);
    expect(count(after)).toBe(2);
    expect(block(after, "data-fo-price-summary")).toContain(`>${fee}<`);
    // Every other amount on the page is unmoved.
    const amounts = (html: string): string[] =>
      [
        ...html.matchAll(
          /<bdi(?![^>]*data-fo-price-total)[^>]*>([^<]*\d[^<]*)<\/bdi>/gu,
        ),
      ]
        .map((match) => match[1] ?? "")
        .filter((text) => text !== fee);
    expect(amounts(after)).toEqual(amounts(before));
  });

  it("docks the summary's own total row at ≤390 px — the sticky bar is not a second money element", async () => {
    for (const view of [
      await viewOf("en", "PL", AMBER, { now: WOMENS_DAY_WEEK }),
      await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK }),
    ]) {
      const html = render(view);
      const where = view.delivery.state;
      // One element is docked, and it is the row inside the summary that holds the one total.
      // A named breakpoint: an arbitrary media variant once emptied this project's stylesheet
      // with no error raised (`ui-site-header.test.tsx`).
      expect(html, where).not.toMatch(/(?:min|max)-\[\d+px\]:/u);
      const docked = [...html.matchAll(/class="[^"]*max-sm:fixed/gu)];
      expect(docked, where).toHaveLength(1);
      const row = block(html, "data-fo-summary-total");
      expect(row, where).toMatch(/^<div[^>]*max-sm:fixed/u);
      expect(block(html, "data-fo-price-summary"), where).toContain(row);
      expect([...html.matchAll(/data-fo-price-total/gu)], where).toHaveLength(
        1,
      );
      expect(row, where).toContain("data-fo-price-total");
      expect([...html.matchAll(/aria-live=/gu)], where).toHaveLength(1);
      expect(row, where).toContain('aria-live="polite"');
      // The bar names the size and the inclusive formula beside the amount; those words repeat
      // the summary's, so they are out of the accessibility tree, and they carry no money.
      const selection = block(row, 'data-fo-summary-docked="selection"');
      expect(selection, where).toContain('aria-hidden="true"');
      expect(readable(selection), where).toContain(
        loadMessages("en", ["catalog"]).catalog.price.inclusive,
      );
      expect(selection, where).not.toMatch(/\d[\d,.]*\s*zł|zł\s*\d|PLN|£/u);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-10 — no relative day label, no countdown; an absolute cutoff.           */
/* -------------------------------------------------------------------------- */

const RELATIVE =
  /\b(today|tomorrow|tonight|heute|morgen|dzisiaj|dziś|jutro)\b|\bin \d+ ?(h|hours?|min|minutes?)\b|order within|noch \d+|countdown/iu;

/**
 * The one "today" the page may print: spec 007's facts heading, "What we can say about delivering
 * here today", which the product artboards draw verbatim above the reused block. It is a statement
 * about what is known now, not a day label on a date or a deadline, so it is lifted out before the
 * scan — exactly this sentence in each locale, and nothing like it.
 */
function withoutFactsHeading(text: string, locale: string): string {
  const corridor = loadMessages(locale as Locale, ["corridor"]) as {
    corridor: { facts: { headingGuide: string } };
  };
  return text.replaceAll(corridor.corridor.facts.headingGuide, "");
}

describe("AC-10: absolute dates and an absolute cutoff, in every state and locale", () => {
  it("renders no relative day label and no countdown", async () => {
    for (const locale of LOCALES) {
      for (const view of [
        await viewOf(locale, "DE", AMBER),
        await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK }),
        await liveViewOf(locale, AMBER, { now: WOMENS_DAY_WEEK }),
      ]) {
        const text = withoutFactsHeading(readable(render(view)), locale);
        expect(
          RELATIVE.exec(text)?.[0],
          `${locale} ${view.delivery.state}`,
        ).toBe(undefined);
      }
    }
  });

  it("ships no relative-day or countdown string in the page's own namespaces", () => {
    for (const locale of LOCALES) {
      const messages = loadMessages(locale, ["product", "delivery"]);
      expect(RELATIVE.exec(JSON.stringify(messages))?.[0], locale).toBe(
        undefined,
      );
    }
  });

  it("names the cutoff's time and its zone's city in `live`", async () => {
    const live = readable(
      render(await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK })),
    );
    expect(live).toContain(
      "Order by 14:00 in Warsaw — the recipient's time, not yours",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* AC-8 / §14 A8 — `preview` states no cutoff time; only `live` does.         */
/* -------------------------------------------------------------------------- */

/**
 * Any clock time, in any of the shapes a locale writes one: `H:MM`, `HH:MM`, `H.MM`, `HH.MM` and
 * `HH h MM` (`/break 151` round 1, hole 2). Run over the **raw markup**, attributes included,
 * so a time in a `title`, an `aria-*` or a `data-*` value is found as well as one in the text
 * (hole 1).
 */
const ANY_TIME = /(?<![\d.,])\d{1,2}(?:[:.]|\s?h\s?)\d{2}(?![\d.,])/gu;

/**
 * The clock times in a picker's raw markup. Two kinds of number are not times and are removed
 * first, each by its known value: the `class` tokens (`leading-[1.35]`), which are styling, and
 * the chips' printed fees, which are the view's own money through `formatMoney` in both sign
 * forms `DateChip` uses. Nothing else is stripped.
 */
function timesInPicker(markup: string, view: ProductView): readonly string[] {
  let scanned = markup.replaceAll(/\sclass="[^"]*"/gu, "");
  const locale = view.locale as Locale;
  for (const date of view.delivery.dates) {
    if (date.surcharge === undefined) continue;
    for (const signDisplay of ["always", "auto"] as const) {
      scanned = scanned.replaceAll(
        formatMoney(date.surcharge, locale, { signDisplay }),
        "",
      );
    }
  }
  return [...decode(scanned).matchAll(ANY_TIME)].map((match) => match[0]);
}

describe("A8: the `preview` picker states no cutoff time, in every locale", () => {
  it("finds a time in every shape it claims, in text and in an attribute", () => {
    for (const time of ["9:30", "14:00", "9.30", "14.00", "14 h 00", "14h00"]) {
      expect([...`<p>${time}</p>`.matchAll(ANY_TIME)], time).toHaveLength(1);
      expect(
        [...`<i title="at ${time}"></i>`.matchAll(ANY_TIME)],
        time,
      ).toHaveLength(1);
    }
    for (const notTime of ["25.00", "1 234,50", "2027-03-01", "18 zł"]) {
      expect(
        [...`${notTime}`.matchAll(ANY_TIME)].map((match) => match[0]),
        notTime,
      ).toEqual(notTime === "25.00" ? ["25.00"] : []);
    }
  });

  it("renders no cutoff line and no cutoff time in the `preview` picker, and the facts row's `none`", async () => {
    for (const locale of LOCALES) {
      const view = await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK });
      expect(view.delivery.state, locale).toBe("preview");
      // The data still carries Poland's authored cutoff: its absence below is the template's
      // choice, not a missing input.
      const time = view.delivery.cutoffLocal ?? "";
      expect(time, locale).toMatch(/^\d{2}:\d{2}$/u);
      const html = render(view);
      const picker = block(html, 'data-fo-picker-state="preview"');
      expect(picker, locale).not.toBe("");
      expect(picker, `${locale}: cutoff element`).not.toContain(
        "data-fo-cutoff",
      );
      expect(readable(picker), `${locale}: cutoff time`).not.toContain(time);
      expect(timesInPicker(picker, view), `${locale}: raw markup`).toEqual([]);
      expect(html, `${locale}: anywhere on the page`).not.toContain(
        "data-fo-cutoff",
      );
      // The facts row keeps its honest `none` text.
      const corridor = loadMessages(locale as Locale, ["corridor"]) as {
        corridor: { facts: { orderBy: { none: string } } };
      };
      expect(readable(html), `${locale}: facts row`).toContain(
        corridor.corridor.facts.orderBy.none,
      );
    }
  });

  it("still renders the `live` cutoff line (`delivery.picker.live`) on the same route, in every locale", async () => {
    for (const locale of LOCALES) {
      const view = await liveViewOf(locale, AMBER, { now: WOMENS_DAY_WEEK });
      expect(view.delivery.state, locale).toBe("live");
      const picker = block(render(view), 'data-fo-picker-state="live"');
      const cutoff = block(picker, "data-fo-cutoff");
      expect(cutoff, locale).not.toBe("");
      const t = createTranslator({
        locale,
        messages: loadMessages(locale as Locale, ["delivery"]),
      });
      const time = view.delivery.cutoffLocal ?? "";
      expect(time, locale).toMatch(/^\d{2}:\d{2}$/u);
      expect(readable(cutoff).trim(), locale).toBe(
        t("delivery.picker.live", {
          time,
          city: zoneCity(view.delivery.timeZone ?? ""),
        }),
      );
    }
  });

  it("prints no cutoff time on a past-cutoff `preview` chip: the shared sentence covers it (E-1)", async () => {
    for (const locale of LOCALES) {
      const view = await viewOf(locale, "PL", AMBER, { now: PAST_CUTOFF });
      expect(view.delivery.state, locale).toBe("preview");
      // The calendar still computes the reason; only the `preview` render withholds its text.
      const past = view.delivery.dates.filter(
        (date) => date.reasonKey === "delivery.reason.pastCutoff",
      );
      expect(
        past.map((date) => date.date),
        locale,
      ).toEqual(["2027-03-01"]);
      const time = view.delivery.cutoffLocal ?? "";
      expect(time, locale).toMatch(/^\d{2}:\d{2}$/u);
      const html = render(view);
      const picker = block(html, 'data-fo-picker-state="preview"');
      expect(readable(picker), `${locale}: cutoff time`).not.toContain(time);
      expect(timesInPicker(picker, view), `${locale}: raw markup`).toEqual([]);
      const chip = chips(html).get("2027-03-01") ?? "";
      expect(chip, locale).toMatch(/<input[^>]*disabled/u);
      expect(chip, `${locale}: per-chip reason`).not.toContain(
        "data-fo-date-why",
      );
      // Its accessible name carries the shared `preview` sentence instead (§13 Q6).
      const noticeId = /<p[^>]*id="([^"]+)"/u.exec(picker)?.[1] ?? "";
      expect(noticeId, locale).not.toBe("");
      expect(chip, locale).toContain(
        `aria-labelledby="date-2027-03-01 ${noticeId}"`,
      );
    }
  });

  it("keeps the `live` past-cutoff chip's own reason with its time", async () => {
    const view = await liveViewOf("en", AMBER, { now: PAST_CUTOFF });
    expect(view.delivery.state).toBe("live");
    const chip = chips(render(view)).get("2027-03-01") ?? "";
    expect(chip).toMatch(/<input[^>]*disabled/u);
    expect(chip).toContain('data-fo-date-reason="delivery.reason.pastCutoff"');
    expect(
      readable(/data-fo-date-why[^>]*>([^<]+)</u.exec(chip)?.[1] ?? ""),
    ).toBe("Ordering closed at 14:00 in Warsaw");
    expect(chip).not.toContain("aria-labelledby");
  });

  it("leaves no `delivery.cutoffPreview` key in any message or meta file", () => {
    const dir = join(process.cwd(), "messages");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    // Four catalogues and their four meta files.
    expect(files).toHaveLength(8);
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/cutoffPreview/u);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-21 — one all-in price, its rows, and the stale-FX state.                */
/* -------------------------------------------------------------------------- */

describe("AC-21: one all-in price with its formula, VAT and delivery rows, and the exclusion", () => {
  it("prints the view's `displayPrice` once, with the inclusive formula and both rows", async () => {
    for (const locale of LOCALES) {
      const view = await viewOf(locale, "PL", AMBER, { now: IN_WINDOW });
      const html = render(view);
      const totals = [...html.matchAll(/data-fo-price-total/gu)];
      expect(totals, locale).toHaveLength(1);
      const summary = block(html, "data-fo-price-summary");
      expect(decode(summary)).toContain(
        `>${formatMoney(view.price.displayPrice, view.locale as Locale)}<`,
      );
      expect(summary).toContain('data-fo-summary-row="vat"');
      expect(summary).toContain('data-fo-summary-row="delivery"');
      expect(summary).toContain(view.price.vatRateText);
      const messages = loadMessages(locale, ["catalog"]) as {
        catalog: { price: { inclusive: string; from: string } };
      };
      expect(decode(summary)).toContain(messages.catalog.price.inclusive);
      // v2 moves the sentence out of the summary into the "Good to know" band (TASK-179); the
      // page still prints it, once.
      expect([...html.matchAll(/data-fo-price-excludes/gu)]).toHaveLength(1);
      // No "from", no strike-through, no reference price.
      const fromWord = messages.catalog.price.from
        .replace("{price}", "")
        .trim();
      expect(
        new RegExp(`\\b${fromWord}\\s+\\S*\\d`, "iu").exec(readable(html))?.[0],
        `${locale}: a "from" price`,
      ).toBe(undefined);
      expect(html).not.toMatch(/<(s|del|strike)[\s>]|line-through/u);
    }
  });

  it("states the destination's currency when the FX snapshot is stale, and only then", async () => {
    const stale = await viewOf("en", "PL", AMBER, { now: WOMENS_DAY_WEEK });
    const fresh = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    expect(stale.fx.state).toBe("fallback");
    expect(fresh.fx.state).not.toBe("fallback");
    expect(stale.price.displayPrice.currency).toBe("PLN");
    expect(render(stale)).toContain("data-fo-fx-notice");
    expect(readable(render(stale))).toContain(
      "We are showing this price in the currency of the delivery country.",
    );
    expect(render(fresh)).not.toContain("data-fo-fx-notice");
  });

  // The vase sentence ("…The photograph is styled with one…") is about a photograph, so it renders
  // only beside one (TASK-126 E-5, ruled 2026-10-03); the vase itself stays a priced add-on row.
  // Each case below differs from the rendering branch by exactly one input.
  const EXCLUDES = (
    loadMessages("en", ["product"]) as { product: { excludes: string } }
  ).product.excludes;

  it("prints the vase sentence beside a photograph of a product sold without one", async () => {
    const view = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    expect(view.gallery.kind).toBe("photos");
    expect(view.product.vaseIncluded).toBe(false);
    const excludes = block(render(view), "data-fo-price-excludes");
    expect(readable(excludes)).toBe(EXCLUDES);
  });

  it("omits the vase sentence on the no-photo placeholder, and keeps the vase in the add-on list", async () => {
    const view = withoutMedia(
      await viewOf("en", "PL", ANTHURIUM, { now: IN_WINDOW }),
    );
    expect(view.gallery.kind).toBe("placeholder");
    expect(view.product.vaseIncluded).toBe(false);
    const html = render(view);
    expect(html).not.toContain("data-fo-price-excludes");
    expect(readable(html)).not.toContain(EXCLUDES);
    expect(block(html, "data-fo-addon-list")).toContain('data-fo-addon="vase"');
  });

  it("omits the vase sentence for a product that ships in a vase, photograph or not", async () => {
    // Since TASK-168 every committed vased product is photographed, so the real vased view is the
    // photographed half and the placeholder half is the same view with its media removed. The
    // older half (a photographed non-vase product with the one field set) is kept beside them.
    const vased = await viewOf("en", "PL", VASED, { now: IN_WINDOW });
    expect(vased.product.vaseIncluded).toBe(true);
    expect(vased.gallery.kind).toBe("photos");
    expect(render(vased)).not.toContain("data-fo-price-excludes");
    expect(render(withoutMedia(vased))).not.toContain("data-fo-price-excludes");
    const photographed = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    expect(photographed.gallery.kind).toBe("photos");
    expect(
      render({
        ...photographed,
        product: { ...photographed.product, vaseIncluded: true },
      }),
    ).not.toContain("data-fo-price-excludes");
  });

  it("prints a single tier as text, not as a one-radio control", async () => {
    const view = await viewOf("en", "PL", ANTHURIUM, { now: IN_WINDOW });
    expect(view.tiers).toHaveLength(1);
    const html = render(view);
    expect(html).toContain('data-fo-tier-selector="single"');
    expect(html).not.toContain('name="tier"');
  });
});

/* -------------------------------------------------------------------------- */
/* `/break 135` round 1 HOLES 3, 4 and 5 — the values a buyer reads.          */
/* -------------------------------------------------------------------------- */

/** One tier radio's markup: from its `<label data-fo-tier=…>` to its closing `</label>`. */
function tierLabels(html: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const match of html.matchAll(
    /<label[^>]*data-fo-tier="([^"]+)"[\s\S]*?<\/label>/gu,
  )) {
    found.set(match[1] ?? "", match[0]);
  }
  return found;
}

/** The text of the first element `pattern` opens in `markup`, entity-decoded. */
function firstText(markup: string, pattern: RegExp): string {
  return decode(pattern.exec(markup)?.[1] ?? "");
}

/**
 * A calendar date as a buyer must read it, built **without** the component's `instantOf()`: its
 * own midday-UTC instant, formatted in UTC. A component that shifted the printed day — a different
 * instant, a different zone — disagrees with this by a whole day.
 */
function printedDate(date: string, locale: Locale): string {
  return formatDate(
    new Date(`${date}T12:00:00Z`),
    locale,
    "deliveryDate",
    "UTC",
  );
}

describe("HOLE 3: each tier radio prints its own price, its own stem count, and the selected size is the checked one", () => {
  it("prints every tier's own `formatMoney(price)` and stem-count label, in three locales", async () => {
    for (const locale of ["en", "de", "pl"] as const) {
      const view = await viewOf(locale, "PL", AMBER, { now: IN_WINDOW });
      expect(view.tiers.length, locale).toBe(3);
      const translate = createTranslator({
        locale,
        messages: loadMessages(locale, ["catalog"]),
      }) as unknown as (key: string, values?: Record<string, number>) => string;
      const radios = tierLabels(render(view));
      expect([...radios.keys()], locale).toEqual(
        view.tiers.map((tier) => tier.tierKey),
      );
      const prices = new Set<string>();
      for (const tier of view.tiers) {
        const radio = radios.get(tier.tierKey) ?? "";
        const where = `${locale} ${tier.tierKey}`;
        const price = formatMoney(tier.price, locale);
        prices.add(price);
        expect(firstText(radio, /<bdi[^>]*>([^<]*)<\/bdi>/u), where).toBe(
          price,
        );
        // The stem count is the tier's own, through the catalogue's ICU plural.
        expect(tier.stems, where).not.toBeNull();
        const label = translate(tier.labelKey, { count: tier.stems ?? 0 });
        expect(label, where).toContain(String(tier.stems));
        expect(
          firstText(
            radio,
            /<span[^>]*data-fo-tier-label[^>]*>([^<]*)<\/span>/u,
          ),
          where,
        ).toBe(label);
      }
      // Three tiers, three different amounts: one price on every radio cannot pass.
      expect(prices.size, locale).toBe(3);
    }
  });

  it("prints a one-tier product's own price and its own label, in `en` and `pl` (HOLE 8)", async () => {
    for (const locale of ["en", "pl"] as const) {
      const view = await viewOf(locale, "PL", ANTHURIUM, { now: IN_WINDOW });
      const [only] = view.tiers;
      expect(view.tiers, locale).toHaveLength(1);
      if (only === undefined) throw new Error("one tier");
      const translate = createTranslator({
        locale,
        messages: loadMessages(locale, ["catalog"]),
      }) as unknown as (key: string, values?: Record<string, number>) => string;
      // The committed one-tier products are the eight plants: `catalog.tier.single`, no stem
      // count. The label is still the tier's own key, through the same plural rule if it had one.
      const label =
        only.stems === null
          ? translate(only.labelKey)
          : translate(only.labelKey, { count: only.stems });
      const single = block(render(view), 'data-fo-tier-selector="single"');
      expect(single, locale).not.toBe("");
      expect(
        firstText(single, /<b[^>]*data-fo-tier-label[^>]*>([^<]*)<\/b>/u),
        locale,
      ).toBe(label);
      expect(firstText(single, /<bdi[^>]*>([^<]*)<\/bdi>/u), locale).toBe(
        formatMoney(only.price, locale),
      );
    }
  });

  it("checks exactly the selected tier — the `is_default` one, or the one the visitor chose", async () => {
    const byDefault = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    const chosen = await viewOf("en", "PL", AMBER, {
      now: IN_WINDOW,
      selection: { tierKey: "stems_12" },
    });
    // The default is the middle tier, so neither "the first" nor "the last" is it by accident.
    expect(byDefault.selectedTierKey).toBe("stems_18");
    expect(chosen.selectedTierKey).toBe("stems_12");
    for (const view of [byDefault, chosen]) {
      const checked = [...tierLabels(render(view))]
        .filter(([, radio]) => /<input[^>]*checked/u.test(radio))
        .map(([key]) => key);
      expect(checked).toEqual([view.selectedTierKey]);
    }
  });
});

describe("HOLE 4: a chip prints the date it carries, and the summary's surcharge line the chosen one", () => {
  it("prints each chip's own `data-fo-date` as its date, in `en` and `pl`, `preview` and `live`", async () => {
    for (const locale of ["en", "pl"] as const) {
      for (const view of [
        await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK }),
        await liveViewOf(locale, AMBER, { now: WOMENS_DAY_WEEK }),
      ]) {
        const grid = chips(render(view));
        expect(grid.size, locale).toBe(view.delivery.dates.length);
        for (const [date, chip] of grid) {
          const where = `${locale} ${view.delivery.state} ${date}`;
          const printed = firstText(chip, /<b[^>]*>([^<]*)<\/b>/u);
          expect(printed, where).toBe(printedDate(date, locale));
          // And independently of any formatter: the day of the month is the value's.
          expect(printed, where).toMatch(
            new RegExp(`(?<!\\d)${String(Number(date.slice(8)))}(?!\\d)`, "u"),
          );
        }
      }
    }
  });

  it("dates the summary's surcharge line, and the docked bar, with the chosen chip's date", async () => {
    for (const locale of ["en", "pl"] as const) {
      const plain = await liveViewOf(locale, AMBER, { now: WOMENS_DAY_WEEK });
      const surcharged = plain.delivery.dates.find(
        (date) => date.selectable && date.surcharge !== undefined,
      );
      expect(surcharged, locale).toBeDefined();
      const day = surcharged?.date ?? "";
      const chosen = await liveViewOf(locale, AMBER, {
        now: WOMENS_DAY_WEEK,
        selection: { date: day },
      });
      expect(chosen.selectedDate, locale).toBe(day);
      const html = render(chosen);
      const expected = printedDate(day, locale);
      const line = firstText(
        block(html, 'data-fo-summary-row="surcharge"'),
        /<dt[^>]*>([^<]*)<\/dt>/u,
      );
      expect(line.split(" · ").at(-1), locale).toBe(expected);
      const docked = firstText(
        block(html, 'data-fo-summary-docked="selection"'),
        /<span[^>]*>([^<]*)<\/span>/u,
      );
      expect(docked.split(" · "), locale).toContain(expected);
    }
  });
});

describe("HOLE 5: a closed date never says “included”", () => {
  it("prints no `included` fee on any closed chip, in `preview` and `live`, in every locale", async () => {
    for (const locale of LOCALES) {
      for (const view of [
        await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK }),
        await liveViewOf(locale, AMBER, { now: WOMENS_DAY_WEEK }),
      ]) {
        const where = `${locale} ${view.delivery.state}`;
        const included = loadMessages(locale, ["product"]).product.included;
        const closed = [...chips(render(view))].filter(([, chip]) =>
          chip.includes('data-fo-date-state="closed"'),
        );
        // Both states have closed dates (every `preview` date; Sundays and the past cutoff live).
        expect(closed.length, where).toBeGreaterThan(0);
        for (const [date, chip] of closed) {
          expect(chip, `${where} ${date}`).not.toContain(
            'data-fo-date-fee="included"',
          );
          expect(readable(chip), `${where} ${date}`).not.toContain(included);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-22 — nothing the page has no backing for.                               */
/* -------------------------------------------------------------------------- */

const UNBACKED: readonly { name: string; pattern: RegExp }[] = [
  { name: "basket", pattern: /basket|warenkorb|koszyk|add to (cart|bag)/iu },
  { name: "withdrawal", pattern: /withdraw|widerruf|odstąpieni/iu },
  {
    name: "delivery photo",
    // "…delivery" + "Photography to supply" is two adjacent elements' text, not a claim.
    pattern:
      /photo(graph)? (at|on) (the )?(door|delivery)|delivery photo(?!graphy to supply)/iu,
  },
  {
    name: "florist name",
    pattern: /florist (named|called)|meet (our|your) florist/iu,
  },
  { name: "florist count", pattern: /\d+\s+florists/iu },
  { name: "countdown", pattern: RELATIVE },
  {
    name: "rating",
    pattern: /★|\b\d(\.\d)? ?\/ ?5\b|trustpilot|reviews?\b|testimonial/iu,
  },
];

describe("AC-22: no claim without backing, in every locale and picker state", () => {
  it("renders no review, rating, florist, delivery-photo, basket, add-on input, countdown or withdrawal marker", async () => {
    for (const locale of LOCALES) {
      for (const view of [
        await viewOf(locale, "DE", AMBER),
        await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK }),
        await liveViewOf(locale, AMBER, { now: WOMENS_DAY_WEEK }),
      ]) {
        const html = render(view);
        const text = withoutFactsHeading(readable(html), locale);
        const where = `${locale} ${view.delivery.state}`;
        // The listing scan forbids any "order by 14:00": a listing has no calendar to back one.
        // The picker's cutoff line is the one place the PDP may print it — in `live` only, since
        // spec 009 §14 A8 took it out of `preview` — so it is lifted out by its own element, and
        // the `unavailable` and `preview` pages, which have no cutoff at all, are scanned whole.
        // The docked summary repeats it in `live` (the mobile artboard's "the last line becomes
        // the cutoff sentence"), marked the same way, so every marked line is lifted and counted.
        let scanned = html;
        let cutoffs = 0;
        for (
          let cutoff = block(scanned, "data-fo-cutoff");
          cutoff !== "";
          cutoff = block(scanned, "data-fo-cutoff")
        ) {
          scanned = scanned.replace(cutoff, "");
          cutoffs += 1;
        }
        expect(cutoffs, where).toBe(
          { unavailable: 0, preview: 0, live: 2 }[view.delivery.state],
        );
        expect(
          listingHonestyViolations({
            text: withoutFactsHeading(readable(scanned), locale),
            html: scanned,
          }),
          where,
        ).toEqual([]);
        for (const { name, pattern } of UNBACKED) {
          expect(pattern.exec(text)?.[0], `${where}: ${name}`).toBe(undefined);
        }
        expect(html, where).not.toMatch(/type="checkbox"/u);
        expect(block(html, "data-fo-addon-list"), where).not.toContain(
          "<input",
        );
        expect(html, where).not.toMatch(/<button(?![^>]*type="submit")/u);
      }
    }
  });

  it("renders the substitution claim only — the trust claims the drawing does not show stay off", async () => {
    const view = await liveViewOf("en", AMBER, { now: WOMENS_DAY_WEEK });
    expect(view.trust).toContain("freshnessGuarantee");
    const trust = readable(block(render(view), "data-fo-pdp-trust"));
    expect(trust).toContain("If something is unavailable");
    expect(trust).not.toMatch(/freshness|7-day|hand-made in the recipient/iu);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-23 — add-ons are read-only rows; the free card is a zero line.          */
/* -------------------------------------------------------------------------- */

describe("A21 / AC-21 (v2, TASK-179): the price under the H1 is the price charged", () => {
  it("prints the selected tier's `formatMoney` under the H1, equal to the one total, with no JSON-LD price", async () => {
    for (const locale of LOCALES) {
      for (const view of [
        await viewOf(locale, "PL", AMBER, { now: IN_WINDOW }),
        await viewOf(locale, "PL", AMBER, { now: WOMENS_DAY_WEEK }),
        await viewOf(locale, "PL", AMBER, {
          now: IN_WINDOW,
          selection: { tierKey: "stems_12" },
        }),
      ]) {
        const html = render(view);
        const where = `${locale} ${view.fx.state} ${view.selectedTierKey}`;
        const tier = view.tiers.find(
          (option) => option.tierKey === view.selectedTierKey,
        );
        const shown = firstText(
          block(html, "data-fo-pdp-price"),
          /<bdi>([^<]*)<\/bdi>/u,
        );
        const total = firstText(
          block(html, "data-fo-summary-total"),
          /<bdi[^>]*data-fo-price-total[^>]*>([^<]*)<\/bdi>/u,
        );
        expect(decode(shown), where).toBe(
          formatMoney(view.price.displayPrice, view.locale as Locale),
        );
        expect(tier, where).toBeDefined();
        expect(decode(shown), where).toBe(
          formatMoney(
            tier?.price ?? view.price.displayPrice,
            view.locale as Locale,
          ),
        );
        expect(shown, where).toBe(total);
        // No structured-data price on a Phase 0 PDP (BreadcrumbList only), so nothing can differ.
        expect(html, where).not.toMatch(/"price"\s*:/u);
        // No equivalents line until the helper is wired (A21 clause 6: absent renders nothing).
        expect(html, where).not.toContain("data-fo-price-equivalents");
      }
    }
  });

  it("renders a finished equivalents line under the price and the total, and never a second amount in it", async () => {
    const view = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    const line = "about 47.32 £ · 238.58 PLN at the rate of 8 September";
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale={view.locale}
        messages={loadMessages("en", [...NAMESPACES])}
        timeZone="UTC"
      >
        <ProductPage
          breadcrumb={null}
          equivalents={line}
          facts={null}
          view={view}
        />
      </NextIntlClientProvider>,
    );
    expect([...html.matchAll(/data-fo-price-equivalents/gu)]).toHaveLength(2);
    expect(block(html, "data-fo-pdp-price")).toContain(line);
    expect(block(html, "data-fo-price-summary")).toContain(line);
    expect([...html.matchAll(/data-fo-price-total/gu)]).toHaveLength(1);
  });
});

describe("AC-23: the add-ons are a priced, read-only list", () => {
  it("prints name, per-country price and own VAT rate per row, with no input element", async () => {
    const view = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    const list = block(render(view), "data-fo-addon-list");
    expect(view.addons.length).toBeGreaterThan(0);
    expect(list).not.toMatch(/<(input|button|select|textarea)[\s>]/u);
    for (const addon of view.addons) {
      const row = block(list, `data-fo-addon="${addon.key}"`);
      expect(decode(row), addon.key).toContain(
        `>${formatMoney(addon.price, "en")}<`,
      );
      expect(row, addon.key).toContain(`VAT ${addon.vatRateText}`);
    }
    const card = view.addons.find((addon) => addon.price.amountMinor === 0);
    expect(card?.key).toBe("card");
    expect(decode(block(list, 'data-fo-addon="card"'))).toContain(
      `>${formatMoney({ amountMinor: 0, currency: card?.price.currency ?? "PLN" }, "en")}<`,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* AC-25 — one priority image with its preload; the placeholder has none.     */
/* -------------------------------------------------------------------------- */

describe("AC-25: one `priority` image with a matching preload, and none without a photograph", () => {
  it("preloads the hero, and only the hero, from the srcset it renders", async () => {
    const view = await viewOf("en", "PL", AMBER, { now: IN_WINDOW });
    expect(view.gallery.kind).toBe("photos");
    const html = render(view);
    const nominations = lcpNominations(html);
    expect(nominations.high).toBe(1);
    expect(nominations.preloaded).toHaveLength(1);
    const gallery = block(html, 'data-fo-gallery="photos"');
    const heroSource = /<source[^>]*srcSet="([^"]+)"/iu.exec(gallery)?.[1];
    expect(nominations.preloaded[0]?.srcset).toBe(heroSource);
    expect(gallery).toMatch(/<img[^>]*fetchpriority="high"/iu);
  });

  it("renders no `<img>` and no honesty label in the gallery of a product with no photograph", async () => {
    const view = withoutMedia(
      await viewOf("en", "PL", ANTHURIUM, { now: IN_WINDOW }),
    );
    expect(view.gallery.kind).toBe("placeholder");
    const gallery = block(render(view), 'data-fo-gallery="placeholder"');
    expect(gallery).not.toContain("<img");
    expect(gallery).not.toContain("Example arrangement");
    expect(gallery).toContain("Photography to supply");
  });
});

/* -------------------------------------------------------------------------- */
/* `/dev/components` — the gallery's fixtures are values the page could get.  */
/* -------------------------------------------------------------------------- */

describe("the gallery's product fixtures are shapes `productView()` could produce (T-09, T-23 via /dev/components)", () => {
  it("parses every picker state and every chip with the calendar's own schema", async () => {
    const { DeliveryWindowSchema } =
      await import("../../src/modules/geo/delivery/schemas.ts");
    const gallery =
      await import("../../src/app/(dev)/dev/components/product.ts");
    for (const delivery of [
      gallery.PRODUCT_DELIVERY_LIVE,
      gallery.PRODUCT_DELIVERY_PREVIEW,
      gallery.PRODUCT_DELIVERY_UNAVAILABLE,
    ]) {
      expect(
        DeliveryWindowSchema.safeParse(delivery).error,
        delivery.state,
      ).toBe(undefined);
    }
    for (const [name, chip] of Object.entries(gallery.PRODUCT_CHIPS)) {
      const window = {
        state: "live",
        timeZone: gallery.PRODUCT_CHIP_ZONE,
        cutoffLocal: gallery.PRODUCT_CHIP_CUTOFF,
        noticeKey: "delivery.picker.live",
        dates: [chip],
      };
      expect(DeliveryWindowSchema.safeParse(window).error, name).toBe(
        undefined,
      );
    }
  });

  it("prices each summary as the configuration it names — the tier, plus the chosen date's chip", async () => {
    const gallery =
      await import("../../src/app/(dev)/dev/components/product.ts");
    for (const [name, view] of Object.entries(gallery.PRODUCT_SUMMARIES)) {
      const tier = view.tiers.find(
        (option) => option.tierKey === view.selectedTierKey,
      );
      const fee =
        view.selectedDate === undefined
          ? undefined
          : view.delivery.dates.find((date) => date.date === view.selectedDate)
              ?.surcharge;
      expect(view.price.displayPrice.currency, name).toBe(tier?.price.currency);
      expect(view.price.displayPrice.amountMinor, name).toBe(
        (tier?.price.amountMinor ?? Number.NaN) + (fee?.amountMinor ?? 0),
      );
      expect(view.fx.state === "fallback", name).toBe(
        view.fx.noticeKey !== undefined,
      );
    }
    expect(gallery.PRODUCT_SUMMARIES["surcharge"]?.selectedDate).toBe(
      gallery.PRODUCT_SURCHARGE_DATE,
    );
  });
});
