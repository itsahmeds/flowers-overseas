/**
 * Tokens never leave in a URL (spec 018 §8, §11; AC-14; T-14; TASK-339).
 *
 *  - `scrubUrlTokens` replaces the tracking link's path token and a signed link's `?t=` value with
 *    `:token`, and leaves the lookup page and other queries alone.
 *  - **GA4:** the consent bootstrap, run as the browser runs it (a `vm` context with a
 *    `location`, `document.currentScript` and the `data-fo-ga4` attribute), queues `config` with
 *    `page_location` scrubbed, for a token in the path and in `?t=`.
 *  - **Sentry:** `beforeSend` removes the token from `request.url`, drops the query string, and
 *    scrubs every breadcrumb URL (a navigation's `from`/`to`, a fetch's `url`) and the
 *    transaction name.
 */
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  CONSENT_BOOTSTRAP_SCRIPT,
  GA4_ID_ATTRIBUTE,
} from "../../src/lib/consent-bootstrap.ts";
import { beforeSend } from "../../src/lib/sentry.ts";
import { scrubUrlTokens } from "../../src/lib/url-tokens.ts";
import { sanitisePageLocation } from "../../src/modules/analytics/location.ts";

const TOKEN =
  "eyJwIjoiQWJDZEVmR2hJaktsTW5PcFFyU3RVdiIsInYiOjF9.Zm9vYmFyYmF6cXV4";
const INVOICE_TOKEN = "eyJpIjoxfQ.cXV4cXV4cXV4";
const TRACK = `https://flowersoverseas.com/en-gb/track/${TOKEN}`;
const INVOICE = `https://flowersoverseas.com/en-gb/account/invoices/9f1c?t=${INVOICE_TOKEN}&download=1`;

describe("scrubUrlTokens", () => {
  it.each([
    [TRACK, "https://flowersoverseas.com/en-gb/track/:token"],
    [`${TRACK}/photo`, "https://flowersoverseas.com/en-gb/track/:token/photo"],
    [
      `/pl/track/${TOKEN}/calendar.ics?x=1#top`,
      "/pl/track/:token/calendar.ics?x=1#top",
    ],
    [
      INVOICE,
      "https://flowersoverseas.com/en-gb/account/invoices/9f1c?t=:token&download=1",
    ],
    [`/en/x?a=1&t=${INVOICE_TOKEN}`, "/en/x?a=1&t=:token"],
  ])("scrubs %s", (input, expected) => {
    expect(scrubUrlTokens(input)).toBe(expected);
  });

  it.each([
    "https://flowersoverseas.com/en-gb/track",
    "https://flowersoverseas.com/en-gb/track?sent=1",
    "/en-gb/send-flowers-to/poland?to=1&utm=t",
  ])("leaves %s alone", (input) => {
    expect(scrubUrlTokens(input)).toBe(input);
  });
});

/** Runs the bootstrap as a page at `href` with a measurement id; returns what it queued. */
function bootstrapAt(href: string): unknown[][] {
  const window: { dataLayer?: unknown[] } = {};
  const context = {
    window,
    location: { href },
    document: {
      currentScript: {
        getAttribute: (name: string) =>
          name === GA4_ID_ATTRIBUTE ? "G-TESTID1234" : null,
      },
    },
    Date,
  };
  runInNewContext(CONSENT_BOOTSTRAP_SCRIPT, context);
  return (window.dataLayer ?? []).map((entry) =>
    Array.from(entry as ArrayLike<unknown>),
  );
}

describe("GA4 page_location (AC-14)", () => {
  // Since spec 023 (TASK-492) the bootstrap queues no `config` before a grant; the deferred
  // loader sends `sanitisePageLocation()` of the address, which absorbed the token rewrite
  // (`src/modules/analytics/location.ts`; TASK-522).
  it.each([
    [TRACK, "https://flowersoverseas.com/en-gb/track/:token"],
    [`${TRACK}/photo`, "https://flowersoverseas.com/en-gb/track/:token/photo"],
    // Spec 023 AC-7 (TASK-492): the invoice id is a private segment, and only `step` and the
    // `utm_*` keys survive in the query, so `t=` and `sent=` never leave the browser.
    [INVOICE, "https://flowersoverseas.com/en-gb/account/invoices/:invoice"],
    [
      "https://flowersoverseas.com/en-gb/track?sent=1",
      "https://flowersoverseas.com/en-gb/track",
    ],
  ])("sends %s as page_location %s", (href, expected) => {
    expect(sanitisePageLocation(href)).toBe(expected);
    expect(sanitisePageLocation(href)).not.toContain(TOKEN);
    expect(sanitisePageLocation(href)).not.toContain(INVOICE_TOKEN);
  });

  it("queues no config, and so no address, before a grant", () => {
    expect(bootstrapAt(TRACK).filter((entry) => entry[0] === "config")).toEqual(
      [],
    );
    expect(JSON.stringify(bootstrapAt(TRACK))).not.toContain(TOKEN);
  });
});

describe("Sentry beforeSend (AC-14)", () => {
  it("removes the token from the URL, the query string, the breadcrumbs and the transaction", () => {
    const event = beforeSend({
      request: {
        url: `${TRACK}?t=${INVOICE_TOKEN}`,
        query_string: `t=${INVOICE_TOKEN}`,
        method: "GET",
      },
      transaction: `GET /en-gb/track/${TOKEN}`,
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/en-gb", to: `/en-gb/track/${TOKEN}` },
        },
        {
          category: "fetch",
          data: { url: `${TRACK}/photo`, method: "GET" },
        },
        { category: "fetch", data: { url: INVOICE } },
      ],
    });
    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain(INVOICE_TOKEN);
    expect(event.request?.url).toBe(
      "https://flowersoverseas.com/en-gb/track/:token?t=:token",
    );
    expect(event.request).not.toHaveProperty("query_string");
    expect(event["transaction"]).toBe("GET /en-gb/track/:token");
    expect(
      (event.breadcrumbs as { data: Record<string, string> }[])[0]?.data["to"],
    ).toBe("/en-gb/track/:token");
  });
});
