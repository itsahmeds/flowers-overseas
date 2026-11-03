/**
 * The tracking lookup without a database (spec 018 §5.2 `lookupTracking`, "Emails"; AC-8, AC-39's
 * T16 half; T-08 unit half; TASK-339).
 *
 *  - `lookupTrackingAction` answers every case with the same `303` to `/{locale}/track?sent=1`
 *    and hands the lookup to `after()`, so nothing it found can change the response: a match, a
 *    wrong email, an unknown reference, an over-limit request and garbage are one answer.
 *  - `runLookup` never throws and logs no reference, address or link.
 *  - `TrackingLookupInputSchema` reads the reference without spaces and in capitals and refuses
 *    anything that is not `FO-XXXX-XXXX` or an email.
 *  - T16 (`renderTrackingLinkEmail`): the reference and the link, in the buyer frame, no relay
 *    language and no dash in en-gb, de and pl, nothing personal but the link.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { relayMatches } from "../../src/config/honesty.ts";
import { logger } from "../../src/lib/logger.ts";
import { renderTrackingLinkEmail } from "../../src/modules/notifications/emails";
import {
  TrackingLookupInputSchema,
  type TrackingLookupDeps,
} from "../../src/modules/orders";

class RedirectSignal extends Error {
  readonly url: string;
  constructor(url: string) {
    super("NEXT_REDIRECT");
    this.url = url;
  }
}

const scheduled: (() => unknown)[] = [];
const lookups: { input: unknown; locale: string }[] = [];

vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/server", () => ({
  after: (task: () => unknown): void => {
    scheduled.push(task);
  },
}));
vi.mock("../../src/app/[locale]/(track)/track/lookup.ts", async (original) => ({
  ...(await original<object>()),
  runLookup: (input: unknown, locale: string): Promise<void> => {
    lookups.push({ input, locale });
    return Promise.resolve();
  },
}));

const { lookupTrackingAction } =
  await import("../../src/app/[locale]/(track)/track/actions.ts");
const lookupModule = await vi.importActual<
  typeof import("../../src/app/[locale]/(track)/track/lookup.ts")
>("../../src/app/[locale]/(track)/track/lookup.ts");

function form(reference: string, email: string): FormData {
  const data = new FormData();
  data.set("reference", reference);
  data.set("email", email);
  return data;
}

async function answer(locale: string, data: FormData): Promise<string> {
  try {
    await lookupTrackingAction(locale, data);
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("the action did not redirect");
}

beforeEach(() => {
  scheduled.length = 0;
  lookups.length = 0;
});

describe("lookupTrackingAction (AC-8)", () => {
  it("answers a match, a wrong email, an unknown reference, an over-limit and garbage with the same 303", async () => {
    const cases = [
      form("FO-7K2M-9QXA", "buyer@example.test"),
      form("FO-7K2M-9QXA", "someone@example.test"),
      form("FO-0000-0000", "buyer@example.test"),
      form("FO-7K2M-9QXA", "buyer@example.test"),
      form("not a reference", "not an email"),
    ];
    const answers = [];
    for (const data of cases) answers.push(await answer("en-gb", data));
    expect(new Set(answers)).toEqual(new Set(["/en-gb/track?sent=1"]));
    // The lookup ran after the answer, never before it: nothing it found reached the response.
    expect(lookups).toEqual([]);
    expect(scheduled).toHaveLength(cases.length);
    for (const task of scheduled) await task();
    expect(lookups.map((call) => call.locale)).toEqual(
      cases.map(() => "en-gb"),
    );
    expect(lookups[1]?.input).toEqual({
      reference: "FO-7K2M-9QXA",
      email: "someone@example.test",
    });
  });

  it("lands on the lookup page of the form's locale, and nowhere with an unknown locale", async () => {
    expect(await answer("pl", form("FO-7K2M-9QXA", "a@example.test"))).toBe(
      "/pl/track?sent=1",
    );
    expect(await answer("xx", form("FO-7K2M-9QXA", "a@example.test"))).toBe(
      "/",
    );
    expect(scheduled).toHaveLength(1);
  });

  it("puts nothing typed in the address it answers with", async () => {
    const url = await answer(
      "de",
      form("FO-7K2M-9QXA", "zażółć.gęślą@example.test"),
    );
    expect(url).toBe("/de/track?sent=1");
    expect(url).not.toContain("example");
    expect(url).not.toContain("FO-");
  });
});

describe("runLookup", () => {
  it("never throws and logs no reference, address or link", async () => {
    const errors = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    const deps: TrackingLookupDeps = {
      claim: () => Promise.reject(new Error("zxq@example.test FO-7K2M-9QXA")),
      send: () => Promise.resolve(),
      sendsNonLive: true,
    };
    await expect(
      lookupModule.runLookup(
        { reference: "FO-7K2M-9QXA", email: "zxq@example.test" },
        "en-gb",
        deps,
      ),
    ).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).not.toContain("zxq@example.test");
    expect(logged).not.toContain("FO-7K2M-9QXA");
    errors.mockRestore();
  });

  it("does not claim or send for input that does not parse", async () => {
    const claim = vi.fn(() => Promise.resolve(true));
    const send = vi.fn(() => Promise.resolve());
    await lookupModule.runLookup(
      { reference: "FO-7K2M", email: "buyer@example.test" },
      "en-gb",
      { claim, send, sendsNonLive: true },
    );
    expect(claim).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing when the address is over its limit, before any order is read", async () => {
    const send = vi.fn(() => Promise.resolve());
    await lookupModule.runLookup(
      { reference: "FO-7K2M-9QXA", email: "buyer@example.test" },
      "en-gb",
      { claim: () => Promise.resolve(false), send, sendsNonLive: true },
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe("TrackingLookupInputSchema", () => {
  it("reads the reference without spaces and in capitals", () => {
    expect(
      TrackingLookupInputSchema.parse({
        reference: " fo-7k2m-9qxa ",
        email: " Buyer@Example.test ",
      }),
    ).toEqual({ reference: "FO-7K2M-9QXA", email: "Buyer@Example.test" });
  });

  it.each([
    ["a short reference", { reference: "FO-7K2M-9QX", email: "a@b.test" }],
    ["another prefix", { reference: "XX-7K2M-9QXA", email: "a@b.test" }],
    ["no email", { reference: "FO-7K2M-9QXA", email: "" }],
    ["not an email", { reference: "FO-7K2M-9QXA", email: "buyer" }],
    [
      "an extra field",
      { reference: "FO-7K2M-9QXA", email: "a@b.test", locale: "en" },
    ],
    ["a missing field", { reference: "FO-7K2M-9QXA" }],
  ])("refuses %s", (_label, input) => {
    expect(TrackingLookupInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("T16, the tracking link email (AC-8, AC-39)", () => {
  const link =
    "https://flowersoverseas.com/en-gb/track/eyJwIjoxfQ.AbCdEfGhIjKlMnOp";

  it("carries the reference and the link, in the buyer frame", () => {
    const mail = renderTrackingLinkEmail({
      locale: "en-gb",
      reference: "FO-7K2M-9QXA",
      link,
    });
    expect(mail.subject).toBe("Your tracking link for order FO-7K2M-9QXA");
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain('lang="en-GB"');
    expect(mail.text).toContain(`Track your order:\n${link}`);
    expect(mail.text).toContain(
      "Here is the link to follow order FO-7K2M-9QXA, as you asked.",
    );
    expect(mail.text).toContain(
      "If you did not ask for this link, you can ignore this email.",
    );
  });

  it("has no relay language and no dash in en-gb, de and pl", () => {
    for (const locale of ["en", "en-gb", "de", "pl"] as const) {
      const mail = renderTrackingLinkEmail({
        locale,
        reference: "FO-7K2M-9QXA",
        link,
      });
      for (const part of [mail.subject, mail.text]) {
        expect(relayMatches(part, locale), locale).toEqual([]);
        expect(part, locale).not.toMatch(/[–—]/u);
      }
      expect(mail.html, locale).not.toMatch(/[–—]/u);
      expect(mail.text.toLowerCase(), locale).not.toContain("refund");
    }
  });
});
