/**
 * Spec 023's server-side pieces that need no database (§10 T-15, T-16, T-25, T-26, T-27, T-28 and
 * the cookie half of T-19; AC-15, AC-16, AC-19, AC-25, AC-26, AC-27, AC-28; TASK-491).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CONSENT_POLICY_VERSION } from "@/lib/consent";
import { ga4ServerConfig } from "@/lib/env.analytics";
import { validateEnv } from "@/lib/env.schema";
import { REDACTED, redact } from "@/lib/logger";
import { scrubUrlTokens } from "@/lib/url-tokens";
import {
  MpPurchaseBodySchema,
  MpRefundBodySchema,
  ga4ItemFromProjection,
  ga4ItemsFromOrderLines,
  readAnalyticsContext,
  toGa4Value,
} from "@/modules/analytics";
import { purchaseBody, refundBody } from "@/modules/analytics/mp/payload";
import { outboxTargets } from "@/modules/orders";

import { parseEnvFileKeys } from "../../scripts/env-check";

const ROOT = resolve(import.meta.dirname, "../..");

describe("T-15 (AC-15) · toGa4Value", () => {
  const table: readonly [number, number][] = [
    [0, 0],
    [1, 0.01],
    [99, 0.99],
    [100, 1],
    [4599, 45.99],
    [1_234_567, 12345.67],
  ];
  for (const currency of ["GBP", "EUR", "PLN"] as const) {
    it(`maps minor units of ${currency} exactly`, () => {
      for (const [minor, value] of table) {
        expect(toGa4Value({ amountMinor: minor, currency })).toBe(value);
      }
    });
  }

  it("throws for a currency outside src/config/currencies.ts and for a fractional amount", () => {
    expect(() =>
      toGa4Value({ amountMinor: 100, currency: "XXX" as never }),
    ).toThrow();
    expect(() => toGa4Value({ amountMinor: 1.5, currency: "GBP" })).toThrow();
  });

  it("no file of the analytics module outside money.ts does arithmetic on a price or value field", () => {
    const dir = join(ROOT, "src/modules/analytics");
    const files = readdirSync(dir, {
      recursive: true,
      encoding: "utf8",
    }).filter((name) => /\.tsx?$/u.test(name) && name !== "money.ts");
    const pattern =
      /\b(?:price|value)\b\s*[*/+-]\s*[\w(]|[\w)]\s*[*/+-]\s*\b(?:price|value)\b/u;
    const hits = files.filter((name) =>
      pattern.test(
        readFileSync(join(dir, name), "utf8").replace(
          /\/\*[\s\S]*?\*\/|\/\/.*$/gmu,
          "",
        ),
      ),
    );
    expect(hits).toEqual([]);
  });
});

describe("T-16 (AC-16) · one item builder for the page and the purchase", () => {
  it("builds the same item for the same product and tier on both paths; item_id is the sku", () => {
    const client = ga4ItemFromProjection({
      sku: "FO-BQ-023",
      enName: "Spring Tulips",
      categoryKey: "tulips",
      tierKey: "medium",
      price: { amountMinor: 4599, currency: "GBP" },
      destinationCountry: "pl",
    });
    const [server] = ga4ItemsFromOrderLines(
      [
        {
          kind: "product",
          sku: "FO-BQ-023",
          enName: "Spring Tulips",
          categoryKey: "tulips",
          tierKey: "medium",
          unitPrice: { amountMinor: 4599, currency: "GBP" },
          quantity: 1,
        },
      ],
      "PL",
    );
    expect(server).toEqual(client);
    expect(client).toEqual({
      item_id: "FO-BQ-023",
      item_name: "Spring Tulips",
      item_category: "tulips",
      item_variant: "medium",
      price: 45.99,
      quantity: 1,
      item_destination_country: "PL",
    });
  });

  it("gives add-on and surcharge lines their constant ids and categories", () => {
    const items = ga4ItemsFromOrderLines(
      [
        {
          kind: "addon",
          addonKey: "chocolates",
          enName: "Chocolates",
          unitPrice: { amountMinor: 900, currency: "EUR" },
          quantity: 2,
        },
        {
          kind: "surcharge",
          surchargeKind: "same_day",
          unitPrice: { amountMinor: 500, currency: "EUR" },
          quantity: 1,
        },
      ],
      "DE",
    );
    expect(items).toEqual([
      {
        item_id: "chocolates",
        item_name: "Chocolates",
        item_category: "addon",
        price: 9,
        quantity: 2,
        item_destination_country: "DE",
      },
      {
        item_id: "surcharge",
        item_name: "delivery surcharge",
        item_category: "delivery",
        item_variant: "same_day",
        price: 5,
        quantity: 1,
        item_destination_country: "DE",
      },
    ]);
  });
});

function jar(values: Record<string, string>) {
  return {
    get: (name: string) =>
      Object.hasOwn(values, name) ? { value: values[name] ?? "" } : undefined,
  };
}

function consentCookie(a: boolean, m: boolean, v = CONSENT_POLICY_VERSION) {
  return encodeURIComponent(
    JSON.stringify({
      v,
      a,
      m,
      ts: "2026-11-08T10:00:00.000Z",
      cid: "0b6c3f1e-8a2d-4c7e-9f10-3a5b7c9d1e2f",
    }),
  );
}

describe("T-19 cookie half (AC-19) · readAnalyticsContext", () => {
  const id = "G-FIXTURE00";
  const ga = "GA1.1.123456789.1700000000";

  it("reads the client id and the GS1 session id under a grant", () => {
    expect(
      readAnalyticsContext(
        jar({
          fo_consent: consentCookie(true, false),
          _ga: ga,
          _ga_FIXTURE00: "GS1.1.1700000123.4.1.1700000999.0.0.0",
        }),
        id,
      ),
    ).toEqual({
      analyticsConsent: true,
      marketingConsent: false,
      consentPolicyVersion: String(CONSENT_POLICY_VERSION),
      gaClientId: "123456789.1700000000",
      gaSessionId: "1700000123",
    });
  });

  it("reads the GS2 session id", () => {
    const context = readAnalyticsContext(
      jar({
        fo_consent: consentCookie(true, true),
        _ga: ga,
        _ga_FIXTURE00: "GS2.1.s1700000456$o3$g1$t1700000999$j60$l0$h0",
      }),
      id,
    );
    expect(context.gaSessionId).toBe("1700000456");
    expect(context.marketingConsent).toBe(true);
  });

  it("ignores _ga with consent refused, forged or of an old version", () => {
    for (const fo_consent of [
      consentCookie(false, true),
      "%7Bnot-json",
      consentCookie(true, true, CONSENT_POLICY_VERSION + 1),
      encodeURIComponent(JSON.stringify({ v: 1, a: true, m: true })),
    ]) {
      const context = readAnalyticsContext(
        jar({ fo_consent, _ga: ga, _ga_FIXTURE00: "GS1.1.1700000123.1" }),
        id,
      );
      expect(context.gaClientId, fo_consent).toBeNull();
      expect(context.gaSessionId, fo_consent).toBeNull();
      expect(context.analyticsConsent, fo_consent).toBe(false);
    }
  });

  it("gives null ids for an unparsable _ga and no consent without fo_consent", () => {
    expect(
      readAnalyticsContext(
        jar({ fo_consent: consentCookie(true, false), _ga: "GA1.1.abc.def" }),
        id,
      ).gaClientId,
    ).toBeNull();
    expect(readAnalyticsContext(jar({ _ga: ga }), id)).toMatchObject({
      analyticsConsent: false,
      marketingConsent: false,
      gaClientId: null,
    });
  });
});

describe("T-25 (AC-25) · outboxTargets", () => {
  const analytics = { name: "analytics.ga4", audience: "system" };
  for (const event of [
    "order.captured",
    "order.refunded_partial",
    "order.refunded_full",
  ] as const) {
    it(`routes ${event} to analytics.ga4 in test and live, never in demo`, () => {
      expect(outboxTargets(event, "test")).toContainEqual(analytics);
      expect(outboxTargets(event, "live")).toContainEqual(analytics);
      expect(outboxTargets(event, "demo")).toEqual([]);
    });
  }

  it("routes no other event to analytics.ga4", () => {
    expect(outboxTargets("order.delivered", "live")).not.toContainEqual(
      analytics,
    );
  });
});

const ITEM = {
  item_id: "FO-BQ-023",
  item_name: "Spring Tulips",
  item_category: "tulips",
  item_variant: "medium",
  price: 45.99,
  quantity: 1,
  item_destination_country: "PL",
};

function purchase(environment: "production" | "staging", marketing: boolean) {
  return purchaseBody({
    clientId: "123456789.1700000000",
    at: new Date("2026-11-08T10:00:00.000Z"),
    marketingConsent: marketing,
    transactionId: "5b0b2c55-6b8b-4f4e-9d8e-2b7f3c0e6a11",
    environment,
    value: { amountMinor: 4599, currency: "GBP" },
    items: [ITEM],
    sessionId: "1700000123",
    locale: "en-gb",
    destinationCountry: "PL",
    countryStatus: "live",
    paymentType: "card",
    checkoutChannel: "checkout",
  });
}

describe("T-26 (AC-26) and the AC-20 body shape", () => {
  it("adds debug_mode: 1 outside production and leaves it out in production", () => {
    expect(purchase("staging", false).events[0].params.debug_mode).toBe(1);
    expect("debug_mode" in purchase("production", false).events[0].params).toBe(
      false,
    );
    const refund = refundBody({
      clientId: "123456789.1700000000",
      at: new Date("2026-11-08T10:00:00.000Z"),
      marketingConsent: false,
      transactionId: "5b0b2c55-6b8b-4f4e-9d8e-2b7f3c0e6a11",
      environment: "production",
      value: { amountMinor: 1000, currency: "GBP" },
    });
    expect(MpRefundBodySchema.parse(refund)).toEqual(refund);
    expect(Object.keys(refund.events[0].params).sort()).toEqual(
      ["currency", "engagement_time_msec", "transaction_id", "value"].sort(),
    );
  });

  it("has exactly the four top-level keys, the value, the micros and the consent signals", () => {
    const denied = purchase("production", false);
    expect(Object.keys(denied).sort()).toEqual(
      ["client_id", "consent", "events", "timestamp_micros"].sort(),
    );
    expect(denied.timestamp_micros).toBe(
      Date.parse("2026-11-08T10:00:00.000Z") * 1000,
    );
    expect(denied.events[0].params.value).toBe(45.99);
    expect(denied.consent).toEqual({
      ad_user_data: "DENIED",
      ad_personalization: "DENIED",
    });
    expect(purchase("production", true).consent).toEqual({
      ad_user_data: "GRANTED",
      ad_personalization: "GRANTED",
    });
  });

  it("refuses a body with a personal or device key (strict schemas)", () => {
    const body = purchase("production", false);
    for (const key of [
      "user_id",
      "user_data",
      "user_location",
      "ip_override",
      "device",
    ]) {
      expect(
        MpPurchaseBodySchema.safeParse({ ...body, [key]: "x" }).success,
        key,
      ).toBe(false);
    }
  });

  it("reads GA4_MP_VALIDATE only outside production", () => {
    const base = {
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-FIXTURE00",
      GA4_API_SECRET: "fixtureSecret_123",
      GA4_MP_VALIDATE: "true",
    };
    expect(ga4ServerConfig({ ...base, APP_ENV: "staging" })).toMatchObject({
      configured: true,
      validate: true,
    });
    expect(ga4ServerConfig({ ...base, APP_ENV: "production" })).toMatchObject({
      configured: true,
      validate: false,
    });
    expect(
      ga4ServerConfig({
        APP_ENV: "staging",
        GA4_API_SECRET: "fixtureSecret_123",
      }),
    ).toEqual({ configured: false, environment: "staging" });
  });
});

describe("T-27 (AC-26, AC-27) · validateEnv", () => {
  const SECRET = "sentinelGa4Secret_9f3a";
  const minimal = {
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://user:pass@localhost:5432/fo",
    DATABASE_URL_UNPOOLED: "postgres://user:pass@localhost:5432/fo_direct",
  };
  const issuesFor = (source: Record<string, string>, key: string) =>
    validateEnv(source).issues.filter((issue) => issue.key === key);

  it("accepts the secret only with the measurement id", () => {
    expect(
      issuesFor({ ...minimal, GA4_API_SECRET: SECRET }, "GA4_API_SECRET"),
    ).toHaveLength(1);
    expect(
      issuesFor(
        {
          ...minimal,
          GA4_API_SECRET: SECRET,
          NEXT_PUBLIC_GA4_MEASUREMENT_ID: "G-FIXTURE00",
        },
        "GA4_API_SECRET",
      ),
    ).toEqual([]);
  });

  it("rejects any NEXT_PUBLIC_GA4_API_SECRET and never prints a received value", () => {
    const result = validateEnv({
      ...minimal,
      NEXT_PUBLIC_GA4_API_SECRET: SECRET,
      GA4_API_SECRET: SECRET,
    });
    expect(
      result.issues.some((issue) => issue.key === "NEXT_PUBLIC_GA4_API_SECRET"),
    ).toBe(true);
    expect(JSON.stringify(result.issues)).not.toContain(SECRET);
  });

  it("rejects GA4_MP_VALIDATE=true with APP_ENV=production only", () => {
    expect(
      issuesFor(
        { ...minimal, APP_ENV: "production", GA4_MP_VALIDATE: "true" },
        "GA4_MP_VALIDATE",
      ),
    ).toHaveLength(1);
    expect(
      issuesFor(
        { ...minimal, APP_ENV: "staging", GA4_MP_VALIDATE: "true" },
        "GA4_MP_VALIDATE",
      ),
    ).toEqual([]);
  });

  it("lists GA4_API_SECRET and GA4_MP_VALIDATE in .env.example with blank values", () => {
    const text = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(parseEnvFileKeys(text)).toEqual(
      expect.arrayContaining(["GA4_API_SECRET", "GA4_MP_VALIDATE"]),
    );
    expect(text).toMatch(/^GA4_API_SECRET=$/mu);
    expect(text).toMatch(/^GA4_MP_VALIDATE=$/mu);
  });
});

describe("T-28 unit half (AC-28) · redaction", () => {
  it("shows api_secret=[redacted] in a Measurement Protocol URL", () => {
    expect(
      scrubUrlTokens(
        "https://region1.google-analytics.com/mp/collect?measurement_id=G-FIXTURE00&api_secret=sentinelGa4Secret_9f3a",
      ),
    ).toBe(
      "https://region1.google-analytics.com/mp/collect?measurement_id=G-FIXTURE00&api_secret=[redacted]",
    );
  });

  it("redacts an api_secret key in a log record at any depth", () => {
    expect(redact({ a: { api_secret: "x", apiSecret: "y" } })).toEqual({
      a: { api_secret: REDACTED, apiSecret: REDACTED },
    });
  });
});
