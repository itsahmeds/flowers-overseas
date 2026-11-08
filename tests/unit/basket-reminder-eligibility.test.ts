/**
 * Spec 034 T-01, T-05 (pin), T-06 (pure half), T-10, T-28 (env half) and T-30 (source scan)
 * (AC-1, AC-5, AC-6, AC-10, AC-28, AC-30; TASK-449): `isAbandoned`'s bounds and conditions, the
 * one-reminder pin, each line's state against spec 009's Warsaw calendar at `now + 60 min` (the DST
 * nights included), the env keys and `contactHmac`, and the scans that keep `reminders/` free of
 * any basis other than the box.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ABANDON_AFTER_MS,
  BASKET_REMINDER_MAX,
  CUTOFF_MARGIN_MS,
  SEND_LATEST_MS,
} from "../../src/config/basket-reminders.ts";
import {
  CONTACT_HMAC_PATTERN,
  ContactHmacUnavailableError,
  contactHmac,
  contactHmacWith,
} from "../../src/lib/contact-hmac.ts";
import {
  basketReminderEnv,
  TEST_CONTACT_HMAC_SECRET,
} from "../../src/lib/env.basket-reminders.ts";
import { ENV_KEYS, serverEnvSchema } from "../../src/lib/env.schema.ts";
import {
  type DraftEligibilityView,
  type DeliveryWindowFn,
  isAbandoned,
  reminderLineStates,
} from "../../src/modules/checkout/reminders/eligibility.ts";
import { checkoutDeliveryWindow } from "../../src/modules/geo/index.ts";

const ROOT = resolve(__dirname, "../..");
const NOW = new Date("2026-11-18T12:00:00.000Z");
const minutes = (n: number): number => n * 60_000;
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const ELIGIBLE: DraftEligibilityView = {
  mode: "live",
  purchaseId: null,
  lineCount: 1,
  buyerSaved: true,
  email: "buyer@example.test",
  reminderConsentAt: ago(minutes(150)),
  lastActivityAt: ago(ABANDON_AFTER_MS),
};

describe("T-01 (AC-1) · isAbandoned", () => {
  it("is true at exactly 2 h 00 min and exactly 20 h 00 min of inactivity", () => {
    expect(isAbandoned(ELIGIBLE, NOW)).toBe(true);
    expect(
      isAbandoned({ ...ELIGIBLE, lastActivityAt: ago(SEND_LATEST_MS) }, NOW),
    ).toBe(true);
  });

  it.each([
    ["1 h 59 min idle", { lastActivityAt: ago(minutes(119)) }],
    ["20 h 01 min idle", { lastActivityAt: ago(minutes(20 * 60 + 1)) }],
    ["mode demo", { mode: "demo" as const }],
    ["mode test", { mode: "test" as const }],
    ["placed", { purchaseId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" }],
    ["no line", { lineCount: 0 }],
    ["buyer not saved", { buyerSaved: false }],
    ["no email", { email: null }],
    ["no consent", { reminderConsentAt: null }],
  ])("is false when only one condition changes: %s", (_label, change) => {
    expect(isAbandoned({ ...ELIGIBLE, ...change }, NOW)).toBe(false);
  });

  it("pins the two bounds at 2 h and 20 h", () => {
    expect(ABANDON_AFTER_MS).toBe(2 * 60 * 60_000);
    expect(SEND_LATEST_MS).toBe(20 * 60 * 60_000);
  });
});

describe("T-05 (AC-5) · one reminder per basket", () => {
  it("BASKET_REMINDER_MAX is 1", () => {
    expect(BASKET_REMINDER_MAX).toBe(1);
  });
});

describe("T-10 (AC-10) · consent is the only basis", () => {
  it("a draft with marketing consent, a UK residence and a prior order but no box consent is not abandoned", () => {
    const draft = {
      ...ELIGIBLE,
      reminderConsentAt: null,
      // Facts the predicate must ignore: they are not part of its view at all.
      marketingConsent: true,
      residenceCountry: "GB",
      priorLiveOrders: 1,
    };
    expect(isAbandoned(draft, NOW)).toBe(false);
  });

  it("no file under reminders/ reads marketing consent, a residence country, a geo header or Accept-Language (AC-10, AC-30)", () => {
    const dir = join(ROOT, "src/modules/checkout/reminders");
    const files = readdirSync(dir).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8")
        // Comments may name what is forbidden; code may not read it.
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/^\s*\/\/.*$/gmu, "");
      for (const forbidden of [
        /marketing_?consent/iu,
        /residence_?country/iu,
        /cf-ipcountry/iu,
        /x-vercel-ip-country/iu,
        /accept-language/iu,
        /x-forwarded-for/iu,
      ]) {
        expect(text, `${file} ${String(forbidden)}`).not.toMatch(forbidden);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* AC-6 · line states against the Warsaw calendar (14:00 cutoff, Mon to Sat)   */
/* -------------------------------------------------------------------------- */

const window: DeliveryWindowFn = (input) => checkoutDeliveryWindow(input);
const line = (deliveryDate: string | null) => ({
  countryIso: "PL" as const,
  deliveryDate,
});

describe("T-06 (AC-6) · reminderLineStates at now + 60 min", () => {
  it("pins the margin at 60 minutes", () => {
    expect(CUTOFF_MARGIN_MS).toBe(minutes(60));
  });

  // Wednesday 18 November 2026; Warsaw is UTC+1.
  it("keeps today's date with the cutoff 61 minutes away", () => {
    const now = new Date("2026-11-18T11:59:00.000Z"); // 12:59 in Warsaw
    expect(reminderLineStates([line("2026-11-18")], now, window)).toEqual([
      { state: "kept", line: line("2026-11-18"), date: "2026-11-18" },
    ]);
  });

  it("moves today's date to tomorrow with the cutoff 59 minutes away, and when it has passed", () => {
    for (const iso of [
      "2026-11-18T12:01:00.000Z",
      "2026-11-18T14:30:00.000Z",
    ]) {
      expect(
        reminderLineStates([line("2026-11-18")], new Date(iso), window),
      ).toEqual([
        { state: "moved", line: line("2026-11-18"), nextDate: "2026-11-19" },
      ]);
    }
  });

  it("a line with no date is open; an unavailable product, tier or destination is unavailable", () => {
    const now = new Date("2026-11-18T09:00:00.000Z");
    const states = reminderLineStates(
      [line(null), line("2026-11-20")],
      now,
      window,
      (candidate) => candidate.deliveryDate === null,
    );
    expect(states.map((state) => state.state)).toEqual(["open", "unavailable"]);
  });

  it("a destination with no deliverable date in the window is unavailable", () => {
    const closed: DeliveryWindowFn = () => ({ dates: [] });
    expect(
      reminderLineStates([line("2026-11-20")], NOW, closed).map((s) => s.state),
    ).toEqual(["unavailable"]);
  });

  it.each([
    // The Monday after the last Sunday of March 2026: Warsaw is UTC+2.
    [
      "March",
      "2026-03-30",
      "2026-03-30T10:59:00.000Z",
      "2026-03-30T11:01:00.000Z",
      "2026-03-31",
    ],
    // The Monday after the last Sunday of October 2026: Warsaw is UTC+1 again.
    [
      "October",
      "2026-10-26",
      "2026-10-26T11:59:00.000Z",
      "2026-10-26T12:01:00.000Z",
      "2026-10-27",
    ],
  ])(
    "holds across the last Sunday of %s in Europe/Warsaw",
    (_month, date, keptAt, movedAt, next) => {
      expect(
        reminderLineStates([line(date)], new Date(keptAt), window)[0]?.state,
      ).toBe("kept");
      expect(
        reminderLineStates([line(date)], new Date(movedAt), window),
      ).toEqual([{ state: "moved", line: line(date), nextDate: next }]);
    },
  );

  it("on the DST night itself a Saturday-evening reminder moves a Sunday date to Monday", () => {
    // Saturday 28 March 2026, 22:30 in Warsaw (UTC+1); the clocks go forward at 02:00.
    const now = new Date("2026-03-28T21:30:00.000Z");
    expect(reminderLineStates([line("2026-03-29")], now, window)).toEqual([
      { state: "moved", line: line("2026-03-29"), nextDate: "2026-03-30" },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* AC-28 · env keys, and contactHmac                                           */
/* -------------------------------------------------------------------------- */

const SECRET = Buffer.alloc(32, 7).toString("base64");
const VECTOR =
  "4fe075da820222da5ebc7c38991c770b011074633caa05a02f6a02f53612544d";

describe("T-28 (AC-28) · CONTACT_HMAC_SECRET and MARKETING_MAIL_FROM", () => {
  it("are schema keys and lines of .env.example", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    for (const key of ["CONTACT_HMAC_SECRET", "MARKETING_MAIL_FROM"]) {
      expect(ENV_KEYS).toContain(key);
      expect(example).toMatch(new RegExp(`^${key}=$`, "mu"));
    }
  });

  it("the secret must be base64 of at least 32 bytes; the sender a mailbox", () => {
    const secret = serverEnvSchema.shape.CONTACT_HMAC_SECRET;
    expect(secret.safeParse(SECRET).success).toBe(true);
    expect(
      secret.safeParse(Buffer.alloc(31, 7).toString("base64")).success,
    ).toBe(false);
    expect(secret.safeParse("not base64 at all!").success).toBe(false);
    expect(secret.safeParse("").success).toBe(true); // blank is absent
    const from = serverEnvSchema.shape.MARKETING_MAIL_FROM;
    expect(
      from.safeParse("Flowers Overseas <hello@mail.flowersoverseas.com>")
        .success,
    ).toBe(true);
    expect(from.safeParse("hello@mail.flowersoverseas.com").success).toBe(true);
    expect(from.safeParse("Flowers Overseas").success).toBe(false);
    expect(from.safeParse("<not an address>").success).toBe(false);
  });

  it("absent in staging or production: not configured, naming both keys and no value", () => {
    for (const APP_ENV of ["staging", "production"]) {
      expect(basketReminderEnv({ APP_ENV })).toEqual({
        configured: false,
        missing: ["CONTACT_HMAC_SECRET", "MARKETING_MAIL_FROM"],
      });
    }
    expect(
      basketReminderEnv({
        APP_ENV: "production",
        CONTACT_HMAC_SECRET: "short",
      }),
    ).toEqual({
      configured: false,
      missing: ["CONTACT_HMAC_SECRET", "MARKETING_MAIL_FROM"],
    });
  });

  it("absent in development and test: the fixed test values; never under NODE_ENV=production", () => {
    const config = basketReminderEnv({ APP_ENV: "test" });
    expect(config.configured).toBe(true);
    expect(
      basketReminderEnv({ APP_ENV: "test", NODE_ENV: "production" }).configured,
    ).toBe(false);
    if (config.configured) {
      expect(
        config.hmacSecret.equals(
          Buffer.from(TEST_CONTACT_HMAC_SECRET, "base64"),
        ),
      ).toBe(true);
    }
  });

  it("set in production: configured with the decoded secret and the sender", () => {
    const config = basketReminderEnv({
      APP_ENV: "production",
      CONTACT_HMAC_SECRET: SECRET,
      MARKETING_MAIL_FROM: "Flowers Overseas <hello@mail.flowersoverseas.com>",
    });
    expect(config).toEqual({
      configured: true,
      hmacSecret: Buffer.alloc(32, 7),
      marketingFrom: "Flowers Overseas <hello@mail.flowersoverseas.com>",
    });
  });
});

describe("contactHmac (spec 034 §5.2)", () => {
  const env = {
    APP_ENV: "production",
    CONTACT_HMAC_SECRET: SECRET,
    MARKETING_MAIL_FROM: "a@b.test",
  };

  it("is lowercase hex HMAC-SHA256 of the trimmed, lower-cased address", () => {
    const value = contactHmac("  Buyer@Example.TEST ", env);
    expect(value).toMatch(CONTACT_HMAC_PATTERN);
    expect(value).toBe(contactHmac("buyer@example.test", env));
    expect(value).toBe(
      contactHmacWith(Buffer.alloc(32, 7), "buyer@example.test"),
    );
    // Pinned against Python's hmac module: a change of algorithm or normalisation is seen.
    expect(contactHmacWith(Buffer.alloc(32, 7), "buyer@example.test")).toBe(
      VECTOR,
    );
  });

  it("differs per key and never contains the address", () => {
    const other = {
      ...env,
      CONTACT_HMAC_SECRET: Buffer.alloc(32, 8).toString("base64"),
    };
    expect(contactHmac("buyer@example.test", env)).not.toBe(
      contactHmac("buyer@example.test", other),
    );
    expect(contactHmac("buyer@example.test", env)).not.toContain("buyer");
  });

  it("throws naming the key when it is not configured", () => {
    expect(() =>
      contactHmac("buyer@example.test", { APP_ENV: "production" }),
    ).toThrow(ContactHmacUnavailableError);
    expect(() =>
      contactHmac("buyer@example.test", { APP_ENV: "production" }),
    ).toThrow(/^CONTACT_HMAC_SECRET is not configured$/u);
  });
});
