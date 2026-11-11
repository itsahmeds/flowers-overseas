/**
 * The tracking page without a database (spec 018 §5.2, §5.3, §6; AC-3, AC-4, AC-5, AC-7, AC-11,
 * AC-12, AC-35, AC-41; T-03 fold half, T-04 unit half, T-11, T-12 header half, T-34, T-41 scan
 * half; TASK-338).
 *
 *  - `buyerStep` folds `with_florist` into `confirmed` and nothing else; `foldTimeline` gives the
 *    five steps done, current and future, the cancelled line, and `closed → disputed` with
 *    `closed` future.
 *  - `TrackingViewSchema` is `.strict()` and its keys are AC-4's allowlist exactly.
 *  - `TrackingPageView`, rendered with `react-dom/server` against the real catalogues: the
 *    headline per step, times in Europe/Warsaw with the short zone name across the October DST
 *    night, the florist line only when the view carries it, no "accepted" and no relay language.
 *  - `NotWorkingView`: one body per locale, the lookup form, no order data.
 *  - TASK-339 (AC-10, AC-42): one refund chip per succeeded refund, in the refund's currency and
 *    the destination's zone, oldest first; "You cancelled this order." / "We could not deliver
 *    this order." by `cancelledByOf`; the pending sentence until the refund succeeds; nothing for
 *    an order that never took money; the lookup page's one sent message.
 *  - `calendarIcs` parses as RFC 5545 (a strict reader below): one all-day `VEVENT`.
 *  - `trackHeaderRules()` and their place after the security rules in `next.config.ts`;
 *    `transactionalMetadata("trackOrder")`.
 *  - A source scan of this task's code: event names within A6.6 + A7's 37, status literals within
 *    A6.4's 26, no read of an assignment or re-route event (AC-35, AC-41).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createTranslator } from "next-intl";

import { relayMatches } from "../../src/config/honesty.ts";
import type { LocaleCode } from "../../src/config/locales.ts";
import {
  TRACK_CACHE_HEADER,
  TRACK_REFERRER_HEADER,
  trackHeaderRules,
} from "../../src/lib/transactional-headers.ts";
import { loadMessages } from "../../src/modules/i18n";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import {
  buyerStep,
  cancelledByOf,
  foldTimeline,
  TRACKING_VIEW_KEYS,
  type TrackingView,
  TrackingViewSchema,
} from "../../src/modules/orders/tracking-view.ts";
import { PAGE_TYPE_POLICY, transactionalMetadata } from "../../src/modules/seo";
import {
  STATES,
  STATUS_PRESERVING_EVENTS,
  TRANSITION_EVENTS,
} from "../fixtures/order-machine.ts";

vi.mock("next-intl/server", () => ({
  getTranslations: ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace?: string;
  }) =>
    Promise.resolve(
      createTranslator({
        locale,
        messages: loadMessages(locale, MESSAGE_NAMESPACES),
        ...(namespace === undefined ? {} : { namespace }),
      } as Parameters<typeof createTranslator>[0]),
    ),
}));

const PAGE_DIR = "src/app/[locale]/(track)/track/[token]";
const { TrackingPageView } =
  await import("../../src/app/[locale]/(track)/track/[token]/TrackingPageView.tsx");
const { NotWorkingView } =
  await import("../../src/app/[locale]/(track)/track/[token]/TrackingPageView.tsx");
const { LookupForm, LookupPageView } =
  await import("../../src/app/[locale]/(track)/track/LookupForm.tsx");
const { calendarIcs, foldLine } =
  await import("../../src/app/[locale]/(track)/track/[token]/tracking-routes.ts");

const ROOT = join(import.meta.dirname, "..", "..");
const ZONE = "Europe/Warsaw";
const at = (iso: string): Date => new Date(iso);

/** AC-4's list, as the spec writes it. */
const ALLOWLIST = [
  "reference",
  "projection",
  "timeline",
  "refundLines",
  "refundPending",
  "cancelledBy",
  "deliveryDate",
  "destinationCity",
  "floristFirstName",
  "floristCity",
  "substitution",
  "photoState",
  "canShare",
  "demo",
];

function view(overrides: Partial<TrackingView> = {}): TrackingView {
  return TrackingViewSchema.parse({
    reference: "FO-7K2M-9QXA",
    projection: "confirmed",
    timeline: foldTimeline(
      [{ projection: "confirmed", occurredAt: at("2026-10-06T17:22:00Z") }],
      "confirmed",
      ZONE,
    ),
    refundLines: [],
    refundPending: null,
    cancelledBy: null,
    deliveryDate: "2026-10-08",
    destinationCity: "Warszawa",
    floristFirstName: null,
    floristCity: null,
    substitution: null,
    photoState: { kind: "none" },
    canShare: true,
    demo: null,
    ...overrides,
  });
}

async function html(
  model: TrackingView,
  locale: LocaleCode = "en-gb",
): Promise<string> {
  return renderToStaticMarkup(
    await TrackingPageView({
      locale,
      view: model,
      photoHref: `/${locale}/track/TOKEN/photo`,
      calendarHref: `/${locale}/track/TOKEN/calendar.ics`,
    }),
  );
}

/** The visible text of a document, tags removed. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x27;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

describe("buyerStep (spec 018 §5.2, AC-3)", () => {
  it("folds with_florist into confirmed, and every other projection into itself", () => {
    expect(buyerStep("with_florist")).toBe("confirmed");
    for (const step of [
      "placed",
      "confirmed",
      "being_made",
      "on_its_way",
      "delivered",
      "closed",
      "cancelled",
    ]) {
      expect(buyerStep(step)).toBe(step);
    }
    expect(() => buyerStep("accepted")).toThrow();
  });

  it("reads accepted and paid as We have your order, whichever projection the machine stores", () => {
    // Spec 002 §14 A9.1 moved them from `with_florist` to `confirmed` at the source; the fold
    // keeps the page right on a database from before it.
    for (const key of ["accepted", "paid"]) {
      const state = STATES.find((row) => row.key === key);
      expect(["with_florist", "confirmed"]).toContain(state?.buyerProjection);
      expect(buyerStep(state?.buyerProjection ?? "")).toBe("confirmed");
    }
  });
});

describe("foldTimeline (AC-3)", () => {
  const captured = at("2026-10-06T17:22:00Z");
  const making = at("2026-10-08T05:40:00Z");
  const out = at("2026-10-08T09:15:00Z");
  const delivered = at("2026-10-08T10:05:00Z");
  const closed = at("2026-10-11T10:05:00Z");

  it("marks the steps up to the current one done or current, dated at first entry, and the rest future", () => {
    const timeline = foldTimeline(
      [
        { projection: "confirmed", occurredAt: captured },
        // A later internal move inside the same projection does not re-date the step.
        { projection: "confirmed", occurredAt: at("2026-10-07T08:00:00Z") },
        { projection: "with_florist", occurredAt: at("2026-10-07T09:00:00Z") },
        { projection: "being_made", occurredAt: making },
      ],
      "being_made",
      ZONE,
    );
    expect(timeline).toStrictEqual({
      timeZone: ZONE,
      steps: [
        { step: "confirmed", state: "done", at: captured },
        { step: "being_made", state: "current", at: making },
        { step: "on_its_way", state: "future", at: null },
        { step: "delivered", state: "future", at: null },
        { step: "closed", state: "future", at: null },
      ],
      cancelledAt: null,
    });
  });

  it("shows closed as future after closed then disputed", () => {
    const timeline = foldTimeline(
      [
        { projection: "confirmed", occurredAt: captured },
        { projection: "being_made", occurredAt: making },
        { projection: "on_its_way", occurredAt: out },
        { projection: "delivered", occurredAt: delivered },
        { projection: "closed", occurredAt: closed },
        { projection: "delivered", occurredAt: at("2026-10-12T10:00:00Z") },
      ],
      "delivered",
      ZONE,
    );
    expect(timeline.steps.map((step) => [step.step, step.state])).toEqual([
      ["confirmed", "done"],
      ["being_made", "done"],
      ["on_its_way", "done"],
      ["delivered", "current"],
      ["closed", "future"],
    ]);
    expect(timeline.steps[3]?.at).toEqual(delivered);
    expect(timeline.steps[4]?.at).toBeNull();
  });

  it("ends a cancelled order with its dated cancelled line after the last step reached", () => {
    const cancelledAt = at("2026-10-06T20:10:00Z");
    expect(
      foldTimeline(
        [
          { projection: "confirmed", occurredAt: captured },
          { projection: "cancelled", occurredAt: cancelledAt },
          { projection: "cancelled", occurredAt: at("2026-10-07T00:00:00Z") },
        ],
        "cancelled",
        ZONE,
      ),
    ).toStrictEqual({
      timeZone: ZONE,
      steps: [{ step: "confirmed", state: "done", at: captured }],
      cancelledAt,
    });
    // A payment that never went through: no step, the cancelled line alone.
    expect(
      foldTimeline(
        [{ projection: "cancelled", occurredAt: cancelledAt }],
        "cancelled",
        ZONE,
      ).steps,
    ).toEqual([]);
  });

  it("leaves every step future while the order reads placed", () => {
    expect(
      foldTimeline([], "placed", ZONE).steps.map((step) => step.state),
    ).toEqual(["future", "future", "future", "future", "future"]);
  });
});

describe("TrackingViewSchema (AC-4)", () => {
  it("has exactly the allowlist's keys", () => {
    expect([...TRACKING_VIEW_KEYS].sort()).toEqual([...ALLOWLIST].sort());
  });

  it("refuses an added key", () => {
    expect(() =>
      TrackingViewSchema.parse({ ...view(), recipientName: "x" }),
    ).toThrow();
  });
});

describe("TrackingPageView (AC-3, AC-5, AC-6)", () => {
  it("prints the folded headline in a polite live region and the five steps", async () => {
    const markup = await html(view());
    expect(markup).toMatch(
      /<div aria-live="polite"><h1[^>]*data-fo-track-headline="confirmed"[^>]*>We have your order<\/h1><\/div>/u,
    );
    expect(
      [...markup.matchAll(/data-fo-track-timeline-step="([a-z_]+)"/gu)].map(
        (match) => match[1],
      ),
    ).toEqual(["confirmed", "being_made", "on_its_way", "delivered", "closed"]);
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain("Order FO-7K2M-9QXA");
    expect(markup).toContain("Delivery Thursday 8 October, Warszawa.");
  });

  it("dates steps in the destination zone with the short zone name, across the DST night", async () => {
    // 25 October 2026, 03:00 CEST → 02:00 CET in Warsaw.
    const before = at("2026-10-25T00:30:00Z");
    const after = at("2026-10-25T01:30:00Z");
    const markup = await html(
      view({
        projection: "being_made",
        timeline: foldTimeline(
          [
            { projection: "confirmed", occurredAt: before },
            { projection: "being_made", occurredAt: after },
          ],
          "being_made",
          ZONE,
        ),
        floristFirstName: "Anna",
        floristCity: "Warszawa",
      }),
    );
    expect(markup).toContain("Sun 25 Oct, 02:30 CEST");
    expect(markup).toContain("Sun 25 Oct, 02:30 CET<");
    const pl = await html(
      view({
        timeline: foldTimeline(
          [{ projection: "confirmed", occurredAt: after }],
          "confirmed",
          ZONE,
        ),
      }),
      "pl",
    );
    expect(pl).toContain("02:30 CET");
  });

  it("names our florist only when the view carries the card, and never says accepted", async () => {
    const before = await html(view());
    expect(before).not.toContain("our florist");
    expect(before).not.toContain("data-fo-track-florist");
    const named = text(
      await html(
        view({
          projection: "being_made",
          floristFirstName: "Anna",
          floristCity: "Warszawa",
        }),
      ),
    );
    expect(named).toContain("Made by our florist Anna in Warszawa");
    const unnamed = text(
      await html(
        view({
          projection: "being_made",
          floristFirstName: null,
          floristCity: "Warszawa",
        }),
      ),
    );
    expect(unnamed).toContain("Made by our florist in Warszawa");
    expect(unnamed).not.toContain("Made by our florist Warszawa");
    for (const markup of [before, named, unnamed]) {
      expect(markup.toLowerCase()).not.toContain("accepted");
    }
  });

  it("renders the photo through the token route with its alt text, or the dated deletion sentence", async () => {
    const shown = await html(
      view({
        projection: "delivered",
        photoState: { kind: "available", takenAt: at("2026-10-08T10:05:00Z") },
      }),
    );
    expect(shown).toContain('src="/en-gb/track/TOKEN/photo"');
    expect(shown).toContain(
      'alt="Photo of your delivered flowers, taken on Thursday 8 October"',
    );
    const gone = text(
      await html(
        view({
          projection: "delivered",
          photoState: {
            kind: "deleted",
            deletedOn: at("2028-10-08T10:05:00Z"),
          },
        }),
      ),
    );
    expect(gone).toContain(
      "The delivery photo was deleted on 8 October under our privacy policy.",
    );
    expect(await html(view())).not.toContain("<img");
  });

  it("drops the tiles and shows the banner for a demo order", async () => {
    const demo = await html(view({ demo: "demo", canShare: false }));
    expect(demo).toContain("This is a demo order.");
    expect(demo).not.toContain("calendar.ics");
    expect(demo).not.toContain("data-fo-track-share");
    const live = await html(view());
    expect(live).toContain('href="/en-gb/track/TOKEN/calendar.ics"');
    expect(live).toContain("Share the tracking link");
  });

  it("has no relay language and no em dash in any state, in en-gb, de and pl", async () => {
    const states: TrackingView[] = [
      view(),
      view({
        projection: "being_made",
        floristFirstName: "Anna",
        floristCity: "Warszawa",
        substitution: "Tulips instead of roses",
      }),
      view({
        projection: "cancelled",
        timeline: foldTimeline([], "cancelled", ZONE),
      }),
    ];
    for (const locale of ["en-gb", "de", "pl"] as const) {
      for (const state of states) {
        const markup = await html(state, locale);
        expect(relayMatches(text(markup), locale)).toEqual([]);
        expect(markup).not.toMatch(/[\u2013\u2014]/u);
      }
    }
  });
});

describe("NotWorkingView (AC-7)", () => {
  it("is one body per locale with the lookup form and nothing about an order", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const first = renderToStaticMarkup(await NotWorkingView({ locale }));
      const second = renderToStaticMarkup(await NotWorkingView({ locale }));
      expect(second).toBe(first);
      // TASK-339: the lookup's own form, a server action bound to the locale, so the fields
      // travel in a POST body and never in an address.
      expect(first).toContain("data-fo-track-lookup");
      expect(first).not.toMatch(/method="get"/iu);
      const form = (await LookupForm({ locale })) as {
        props: { action: { name: string } };
      };
      expect(form.props.action.name).toBe("bound lookupTrackingAction");
      expect(first).toContain('name="reference"');
      expect(first).toContain('name="email"');
      // The reference field's placeholder is the pattern, never a reference.
      expect(first).not.toMatch(/FO-(?!XXXX-XXXX)[0-9A-Z]{4}-[0-9A-Z]{4}/u);
    }
    expect(
      text(renderToStaticMarkup(await NotWorkingView({ locale: "en-gb" }))),
    ).toContain("This tracking link does not work.");
  });
});

/**
 * A strict RFC 5545 reader for the one shape we emit: CRLF lines, unfolding, `BEGIN`/`END`
 * nesting, `NAME[;PARAM=V]:VALUE`. Throws on anything else.
 */
function parseIcs(body: string): {
  calendar: Map<string, string>;
  events: Map<string, string>[];
} {
  if (!body.endsWith("\r\n")) throw new Error("no final CRLF");
  if (/(?<!\r)\n/u.test(body)) throw new Error("bare LF");
  const physical = body.slice(0, -2).split("\r\n");
  for (const line of physical) {
    if (Buffer.byteLength(line, "utf8") > 75)
      throw new Error("line over 75 octets");
  }
  const lines = physical
    .join("\r\n")
    .replace(/\r\n[ \t]/gu, "")
    .split("\r\n");
  const stack: string[] = [];
  const calendar = new Map<string, string>();
  const events: Map<string, string>[] = [];
  for (const line of lines) {
    const match = /^([A-Z-]+)((?:;[A-Z-]+=[^:;]+)*):(.*)$/u.exec(line);
    if (match === null) throw new Error(`bad line ${line}`);
    const [, name = "", params = "", value = ""] = match;
    if (name === "BEGIN") {
      stack.push(value);
      if (value === "VEVENT") events.push(new Map());
      continue;
    }
    if (name === "END") {
      if (stack.pop() !== value) throw new Error("unbalanced");
      continue;
    }
    const target = stack.at(-1) === "VEVENT" ? events.at(-1) : calendar;
    target?.set(`${name}${params}`, value);
  }
  if (stack.length !== 0) throw new Error("unclosed");
  return { calendar, events };
}

describe("calendarIcs (AC-11)", () => {
  const input = {
    deliveryDate: "2026-12-31",
    summary: "Flowers delivered in Warszawa",
    reference: "FO-7K2M-9QXA",
    host: "flowersoverseas.com",
    productName: "Flowers Overseas",
    now: at("2026-11-01T10:00:00Z"),
  };

  it("parses as RFC 5545 with one all-day VEVENT on the delivery date", () => {
    const { calendar, events } = parseIcs(calendarIcs(input));
    expect(calendar.get("VERSION")).toBe("2.0");
    expect(calendar.get("PRODID")).toBe("-//Flowers Overseas//Tracking//EN");
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.get("DTSTART;VALUE=DATE")).toBe("20261231");
    expect(event?.get("DTEND;VALUE=DATE")).toBe("20270101");
    expect(event?.get("SUMMARY")).toBe("Flowers delivered in Warszawa");
    expect(event?.get("UID")).toBe("FO-7K2M-9QXA@flowersoverseas.com");
    expect(event?.get("DTSTAMP")).toBe("20261101T100000Z");
  });

  it("escapes text and folds long lines without splitting a character", () => {
    const long = `Flowers delivered in ${"Łódź, Kraków; ".repeat(8)}`;
    const body = calendarIcs({ ...input, summary: long });
    const { events } = parseIcs(body);
    expect(events[0]?.get("SUMMARY")).toBe(
      long.replace(/;/gu, "\\;").replace(/,/gu, "\\,"),
    );
    expect(foldLine("a".repeat(76))).toBe(`${"a".repeat(75)}\r\n a`);
  });
});

describe("headers and head (AC-12)", () => {
  it("sends noindex, no-store and no-referrer on the token routes, and private on the photo", () => {
    const rules = trackHeaderRules();
    const value = (source: string, key: string): string | undefined =>
      rules
        .find((rule) => rule.source === source)
        ?.headers.find((header) => header.key === key)?.value;
    for (const source of [
      "/:locale/track/:token",
      "/:locale/track/:token/calendar.ics",
    ]) {
      expect(value(source, "X-Robots-Tag")).toBe("noindex, nofollow");
      expect(value(source, "Cache-Control")).toBe("private, no-store");
      expect(value(source, "Referrer-Policy")).toBe("no-referrer");
    }
    expect(value("/:locale/track/:token/photo", "X-Robots-Tag")).toBe(
      "noindex, nofollow",
    );
    expect(
      value("/:locale/track/:token/photo", "Cache-Control"),
    ).toBeUndefined();
    expect(value("/:locale/track/:token/photo", "Referrer-Policy")).toBe(
      "no-referrer",
    );
    expect(TRACK_CACHE_HEADER.value).toContain("no-store");
    expect(TRACK_REFERRER_HEADER.value).toBe("no-referrer");
  });

  it("puts the track rules after the security rules, so no-referrer wins", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    const security = config.indexOf("...securityHeaderRules(");
    const track = config.indexOf("...trackHeaderRules()");
    expect(security).toBeGreaterThan(-1);
    expect(track).toBeGreaterThan(security);
  });

  it("gives the page a title and noindex,nofollow, with no canonical or alternate", () => {
    expect(PAGE_TYPE_POLICY.trackOrder).toBe("never");
    expect(
      transactionalMetadata("trackOrder", "Track your order"),
    ).toStrictEqual({ title: "Track your order", robots: "noindex,nofollow" });
    const page = readFileSync(join(ROOT, PAGE_DIR, "page.tsx"), "utf8");
    expect(page).toContain('transactionalMetadata("trackOrder"');
    expect(page).not.toContain("alternates");
  });
});

/** Every `.ts`/`.tsx` file this task adds for the tracking page. */
function trackingSources(): { path: string; source: string }[] {
  const files = ["src/modules/orders/tracking-view.ts"];
  const walk = (dir: string): void => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const path = `${dir}/${name}`;
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else if (/\.tsx?$/u.test(name)) files.push(path);
    }
  };
  walk("src/app/[locale]/(track)");
  walk("src/app/[locale]/@header/(track)");
  return files.map((path) => ({
    path,
    source: readFileSync(join(ROOT, path), "utf8"),
  }));
}

/** Code only: block and line comments removed, so a sentence about an event is not a use. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

describe("A6 alignment and no assignment leakage (AC-35, AC-41)", () => {
  const sources = trackingSources();
  const names = new Set<string>([
    ...TRANSITION_EVENTS,
    ...STATUS_PRESERVING_EVENTS,
  ]);
  const statuses = new Set(STATES.map((state) => state.key));

  it("scans the files it means to", () => {
    expect(sources.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "src/modules/orders/tracking-view.ts",
        `${PAGE_DIR}/page.tsx`,
        `${PAGE_DIR}/TrackingPageView.tsx`,
        `${PAGE_DIR}/photo/route.ts`,
        `${PAGE_DIR}/calendar.ics/route.ts`,
      ]),
    );
    expect(names.size).toBe(39);
    expect(statuses.size).toBe(26);
  });

  it("uses event names within the 37 and status literals within the 26", () => {
    for (const { path, source } of sources) {
      const body = code(source);
      // Event names as string or SQL literals; `order.projection` is a property access.
      for (const [, literal = ""] of body.matchAll(
        /["'`]((?:order|assignment)\.[a-z_]+)["'`]/gu,
      )) {
        expect(names.has(literal), `${path}: ${literal}`).toBe(true);
      }
      expect(body, path).not.toContain("'order.refunded'");
      expect(body, path).not.toMatch(/order\.chargeback_\*/u);
      for (const [, status] of body.matchAll(
        /(?:to_status|from_status|status)\s*=\s*'([a-z_]+)'/gu,
      )) {
        expect(statuses.has(status ?? ""), `${path}: ${String(status)}`).toBe(
          true,
        );
      }
    }
  });

  it("reads no assignment, re-route or routing event in the tracking view code", () => {
    for (const { path, source } of sources) {
      expect(code(source), path).not.toMatch(
        /["'`](?:assignment\.[a-z_]+|order\.(?:no_partner_available|manual_reroute|routed))["'`]/u,
      );
      expect(code(source), path).not.toMatch(/\be\.type\b/u);
    }
  });
});

/** The en-gb `Intl` rendering of an amount, computed here and not by the code under test. */
function money(amountMinor: number, currency: string, tag: string): string {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(tag, { style: "currency", currency })
    .format(amountMinor / 10 ** digits)
    .replace(/\s+/gu, " ");
}

describe("refund lines and the cancelled state (AC-10, AC-42; TASK-339)", () => {
  const cancelledTimeline = foldTimeline(
    [
      { projection: "confirmed", occurredAt: at("2026-10-06T17:22:00Z") },
      { projection: "cancelled", occurredAt: at("2026-10-06T20:10:00Z") },
    ],
    "cancelled",
    ZONE,
  );
  const refundsOf = (markup: string): string[] =>
    [...markup.matchAll(/data-fo-track-refund=""[^>]*>([^<]*)</gu)].map(
      (match) => (match[1] ?? "").replace(/\s+/gu, " "),
    );

  it("prints one chip per succeeded refund, oldest first, in its currency and the destination's day", async () => {
    const markup = await html(
      view({
        projection: "delivered",
        refundLines: [
          // 22:30 UTC on the 8th is 00:30 on the 9th in Warsaw: the date is the zone's.
          {
            amountMinor: 1,
            currencyCode: "GBP",
            succeededAt: at("2026-10-08T22:30:00Z"),
          },
          {
            amountMinor: 123_456_789,
            currencyCode: "PLN",
            succeededAt: at("2026-10-10T09:00:00Z"),
          },
        ],
      }),
    );
    expect(refundsOf(markup)).toEqual([
      `Refunded ${money(1, "GBP", "en-GB")} on 9 October`,
      `Refunded ${money(123_456_789, "PLN", "en-GB")} on 10 October`,
    ]);
    expect(markup).toContain('aria-label="Refunds"');
    // A partial refund keeps the fulfilment headline (D1).
    expect(markup).toMatch(
      /data-fo-track-headline="delivered"[^>]*>Delivered</u,
    );
  });

  it("formats the amount and the date in the page locale (pl, de)", async () => {
    const line = {
      amountMinor: 4590,
      currencyCode: "EUR" as const,
      succeededAt: at("2026-10-08T22:30:00Z"),
    };
    const pl = refundsOf(
      await html(view({ projection: "being_made", refundLines: [line] }), "pl"),
    );
    expect(pl).toEqual([
      `Refunded ${money(4590, "EUR", "pl-PL")} on 9 października`,
    ]);
    const de = refundsOf(
      await html(view({ projection: "being_made", refundLines: [line] }), "de"),
    );
    expect(de).toEqual([
      `Refunded ${money(4590, "EUR", "de-DE")} on 9. Oktober`,
    ]);

    // One minor unit and a large amount, in złoty and pounds, in Polish.
    const extremes = refundsOf(
      await html(
        view({
          projection: "delivered",
          refundLines: [
            {
              amountMinor: 1,
              currencyCode: "PLN",
              succeededAt: line.succeededAt,
            },
            {
              amountMinor: 123_456_789,
              currencyCode: "GBP",
              succeededAt: line.succeededAt,
            },
          ],
        }),
        "pl",
      ),
    );
    expect(extremes).toEqual([
      `Refunded ${money(1, "PLN", "pl-PL")} on 9 października`,
      `Refunded ${money(123_456_789, "GBP", "pl-PL")} on 9 października`,
    ]);
  });

  it("prints no refund row when there is no succeeded refund", async () => {
    const markup = await html(view({ projection: "delivered" }));
    expect(markup).not.toContain("data-fo-track-refunds");
    expect(text(markup).toLowerCase()).not.toContain("refund");
  });

  it("reads You cancelled this order. for the buyer and We could not deliver this order. for us, with no cause", async () => {
    const byBuyer = text(
      await html(
        view({
          projection: "cancelled",
          timeline: cancelledTimeline,
          cancelledBy: "buyer",
        }),
      ),
    );
    expect(byBuyer).toContain("You cancelled this order.");
    expect(byBuyer).not.toContain("could not deliver");
    const byUs = text(
      await html(
        view({
          projection: "cancelled",
          timeline: cancelledTimeline,
          cancelledBy: "us",
        }),
      ),
    );
    expect(byUs).toContain("We could not deliver this order.");
    expect(byUs).not.toContain("You cancelled");
    for (const cause of [
      "florist",
      "available",
      "reroute",
      "admin",
      "no_partner",
    ]) {
      expect(byUs.toLowerCase()).not.toContain(cause);
    }
  });

  it("says We are refunding {amount} while the refund is open, and the dated line once it succeeded", async () => {
    const pending = await html(
      view({
        projection: "cancelled",
        timeline: cancelledTimeline,
        cancelledBy: "us",
        refundPending: { amountMinor: 18_900, currencyCode: "PLN" },
      }),
    );
    expect(text(pending)).toContain(
      `We could not deliver this order. We are refunding ${money(18_900, "PLN", "en-GB")} to your original payment method.`,
    );
    expect(refundsOf(pending)).toEqual([]);
    const done = await html(
      view({
        projection: "cancelled",
        timeline: cancelledTimeline,
        cancelledBy: "us",
        refundLines: [
          {
            amountMinor: 18_900,
            currencyCode: "PLN",
            succeededAt: at("2026-10-07T08:00:00Z"),
          },
        ],
      }),
    );
    expect(text(done)).not.toContain("We are refunding");
    expect(refundsOf(done)).toEqual([
      `Refunded ${money(18_900, "PLN", "en-GB")} on 7 October`,
    ]);
    // The refund is the second sentence: after the cancelled lede (§7).
    expect(done.indexOf("data-fo-track-cancelled")).toBeLessThan(
      done.indexOf("data-fo-track-refunds"),
    );
  });

  it("shows neither sentence for an order that never took money (payment_failed, abandoned)", async () => {
    const markup = await html(
      view({ projection: "cancelled", timeline: cancelledTimeline }),
    );
    const visible = text(markup).toLowerCase();
    expect(visible).not.toContain("refund");
    expect(visible).not.toContain("could not deliver");
    expect(visible).not.toContain("you cancelled");
  });

  it("has no relay language and no dash in any refund or cancelled state, in en-gb, de and pl", async () => {
    const line = {
      amountMinor: 2500,
      currencyCode: "PLN" as const,
      succeededAt: at("2026-10-07T08:00:00Z"),
    };
    const states = [
      view({ projection: "being_made", refundLines: [line] }),
      view({
        projection: "cancelled",
        timeline: cancelledTimeline,
        cancelledBy: "us",
        refundPending: { amountMinor: 2500, currencyCode: "PLN" },
      }),
      view({
        projection: "cancelled",
        timeline: cancelledTimeline,
        cancelledBy: "buyer",
        refundLines: [line],
      }),
    ];
    for (const locale of ["en-gb", "de", "pl"] as const) {
      for (const state of states) {
        const markup = await html(state, locale);
        expect(relayMatches(text(markup), locale)).toEqual([]);
        expect(markup).not.toMatch(/[\u2013\u2014]/u);
      }
    }
  });
});

describe("cancelledByOf (spec 018 §5.2; spec 020a request 3)", () => {
  it.each([
    ["buyer", null, "buyer"],
    ["buyer", "buyer_cancel", "buyer"],
    ["admin:7d1c", "buyer_cancel", "buyer"],
    ["admin:7d1c", "other", "us"],
    ["admin:7d1c", null, "us"],
    ["system:routing.no_partner_expiry", "no_partner", "us"],
    ["system:test_fixture", "buyer_cancel", "us"],
    ["partner:x", "buyer_cancel", "us"],
    ["nobody", null, "us"],
  ] as const)("%s with %s reads %s", (actor, reason, expected) => {
    expect(cancelledByOf(actor, reason)).toBe(expected);
  });
});

describe("LookupPageView (AC-8; TASK-339)", () => {
  it("draws the one sent message only after a submission, the same bytes every time", async () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const before = renderToStaticMarkup(
        await LookupPageView({ locale, sent: false }),
      );
      const first = renderToStaticMarkup(
        await LookupPageView({ locale, sent: true }),
      );
      const second = renderToStaticMarkup(
        await LookupPageView({ locale, sent: true }),
      );
      expect(second).toBe(first);
      expect(before).not.toContain("data-fo-track-sent");
      expect(first).toMatch(/data-fo-track-sent=""[^>]*role="status"/u);
      expect(relayMatches(text(first), locale)).toEqual([]);
      expect(first).not.toMatch(/[\u2013\u2014]/u);
    }
    const en = text(
      renderToStaticMarkup(
        await LookupPageView({ locale: "en-gb", sent: true }),
      ),
    );
    expect(en).toContain("Find your order");
    expect(en).toContain(
      "If that order exists, we have emailed its link to the address it was placed with.",
    );
  });
});
