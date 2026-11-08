/**
 * Spec 025 T-11 (AC-11; TASK-488): every registry alert's push and email, built from facts that
 * sit beside an order snapshot full of names, emails, phones, street addresses and a card
 * message, stays within Pushover's limits, links only to `{base}/admin/alerts/{uuid}`, carries
 * only the title, severity, reference or component, act-by and occurrences, and the PII scan finds
 * nothing. A builder that put the recipient's name in fails the scan.
 */
import { describe, expect, it } from "vitest";

import { EMAIL_PATTERN, PHONE_PATTERN } from "../../src/lib/logger.ts";
import { adminT } from "../../src/modules/admin/messages.ts";
import {
  ALERT_NAMES,
  type AlertFacts,
  type MessageOptions,
  PushMessageSchema,
  buildAlertEmail,
  buildPushMessage,
} from "../../src/modules/ops/index.ts";

const ALERT_ID = "0f6f1d8e-6a40-4c55-9f0e-2d7c1b3a4e59";
const BASE = "https://staging.flowersoverseas.com";

/** What an order carries that an alert must never show (spec 016's ops-alert rule). */
const SNAPSHOT = {
  recipientName: "Zofia Wiśniewska",
  buyerName: "Oliver Bennett",
  email: "oliver.bennett@example.com",
  phone: "+48 601 234 567",
  street: "ul. Marszałkowska 84/92",
  cardMessage: "Happy birthday Mum, love from all of us",
};
const FORBIDDEN = Object.values(SNAPSHOT);

const options: MessageOptions = {
  t: adminT as unknown as MessageOptions["t"],
  baseUrl: BASE,
  founderZone: "Asia/Karachi",
  runbookBaseUrl: "https://github.com/itsahmeds/flowers-overseas/blob/main",
};

function factsFor(
  name: (typeof ALERT_NAMES)[number],
  order: boolean,
): AlertFacts {
  return {
    id: ALERT_ID,
    name,
    severity: "P1",
    mode: order ? "test" : null,
    component: order ? null : "stripe",
    reference: order ? "FO-7Q2M-K9XD" : null,
    destinationZone: order ? "Europe/Warsaw" : null,
    actBy: new Date("2026-11-09T09:00:00Z"),
    occurrences: 3,
    context: {
      delivery_date: "2026-11-09",
      country: "PL",
      attempts: 2,
      payment_id: "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    },
  };
}

function scan(text: string): string[] {
  const hits = FORBIDDEN.filter((value) => text.includes(value));
  if (new RegExp(EMAIL_PATTERN.source, "iu").test(text))
    hits.push("email pattern");
  if (new RegExp(PHONE_PATTERN.source, "u").test(text))
    hits.push("phone pattern");
  return hits;
}

describe("T-11 (AC-11) · what a push and an email say", () => {
  it.each(ALERT_NAMES)("%s: limits, URL and PII scan", (name) => {
    for (const order of [true, false]) {
      const facts = factsFor(name, order);
      for (const priority of [2, 1, -1] as const) {
        const push = PushMessageSchema.parse(
          buildPushMessage(facts, priority, options),
        );
        expect(push.title.length).toBeLessThanOrEqual(250);
        expect(push.message.length).toBeLessThanOrEqual(1024);
        expect(push.url).toBe(`${BASE}/admin/alerts/${ALERT_ID}`);
        expect(
          scan(`${push.title}\n${push.message}\n${push.url ?? ""}`),
        ).toEqual([]);
        if (priority === 2) {
          expect(push).toMatchObject({
            retry: 120,
            expire: 3600,
            tags: ALERT_ID,
          });
        }
      }
      const email = buildAlertEmail(facts, "raise", options);
      expect(scan(`${email.subject}\n${email.text}\n${email.html}`)).toEqual(
        [],
      );
    }
  });

  it("carries the title with severity, the reference, the act-by and occurrences, and [TEST] first for a test order", () => {
    const push = buildPushMessage(
      factsFor("routing.no_partner", true),
      2,
      options,
    );
    expect(push.title).toBe("[TEST] [P1] No florist left for an order");
    expect(push.message.split("\n")[0]).toBe("FO-7Q2M-K9XD");
    expect(push.message).toContain("Karachi");
    expect(push.message).toContain("Warsaw");
    expect(push.message).toContain("Seen 3 times");
  });

  it("bites: a builder that leaks the recipient's name fails the scan", () => {
    const facts = factsFor("routing.no_partner", true);
    const leaky = { ...buildPushMessage(facts, 1, options) };
    leaky.message = `${leaky.message}\n${SNAPSHOT.recipientName}`;
    expect(scan(leaky.message)).toEqual([SNAPSHOT.recipientName]);
  });
});
