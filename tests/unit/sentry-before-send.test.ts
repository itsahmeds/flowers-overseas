/**
 * T-14 / AC-13 (TASK-005): `beforeSend` strips request cookies, request bodies and IPs and
 * redacts the PII keys of spec 001 §8 from `extra`/`tags`; with no DSN the SDK is a true no-op.
 */
import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { REDACTED } from "../../src/lib/logger";
import {
  NON_PII_TAGS,
  type ScrubbableEvent,
  beforeSend,
  scrubEvent,
  sentryOptions,
  setLocaleTag,
} from "../../src/lib/sentry";

function eventWithPii(): ScrubbableEvent {
  return {
    event_id: "abc",
    request: {
      url: "https://flowersoverseas.com/checkout",
      method: "POST",
      cookies: { session: "s3cret" },
      data: { email: "buyer@example.com", message: "Happy birthday" },
      query_string: "email=buyer@example.com",
      headers: {
        authorization: "Bearer t0ken",
        cookie: "session=1",
        "user-agent": "vitest",
      },
    },
    user: { id: "u_1", ip_address: "203.0.113.4", email: "buyer@example.com" },
    extra: {
      order_id: "ord_1",
      phone: "+48123456789",
      address_line1: "ul. Ptasia 4",
    },
    tags: { locale: "pl", cardBrand: "visa" },
  };
}

describe("Sentry beforeSend (T-14)", () => {
  it("removes request cookies, body, query string and the user IP (AC-13)", () => {
    const scrubbed = beforeSend(eventWithPii());
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.user?.["ip_address"]).toBeUndefined();
    // Non-PII request metadata survives, or the event is useless.
    expect(scrubbed.request?.url).toBe("https://flowersoverseas.com/checkout");
    expect(scrubbed.request?.method).toBe("POST");
    expect(scrubbed.event_id).toBe("abc");
  });

  it("redacts every PII key in extra, tags, user and request headers (AC-13)", () => {
    const scrubbed = beforeSend(eventWithPii());
    expect(scrubbed.extra).toEqual({
      order_id: "ord_1",
      phone: REDACTED,
      address_line1: REDACTED,
    });
    expect(scrubbed.tags).toEqual({ locale: "pl", cardBrand: REDACTED });
    expect(scrubbed.user?.["email"]).toBe(REDACTED);
    expect(scrubbed.user?.["id"]).toBe("u_1");
    expect(scrubbed.request?.headers).toEqual({
      authorization: REDACTED,
      cookie: REDACTED,
      "user-agent": "vitest",
    });
  });

  it("leaves no PII substring anywhere in the serialised event", () => {
    const serialised = JSON.stringify(beforeSend(eventWithPii()));
    for (const secret of [
      "s3cret",
      "buyer@example.com",
      "Happy birthday",
      "Bearer t0ken",
      "203.0.113.4",
      "+48123456789",
      "ul. Ptasia 4",
      "visa",
    ]) {
      expect(serialised, `leaked: ${secret}`).not.toContain(secret);
    }
  });

  it("is wired into init options through the SDK-typed wrapper", () => {
    const scrubbed = scrubEvent(
      eventWithPii() as never,
    ) as unknown as ScrubbableEvent;
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.extra?.["phone"]).toBe(REDACTED);
  });

  it("does not mutate the event it was given", () => {
    const event = eventWithPii();
    beforeSend(event);
    expect(event.request?.cookies).toEqual({ session: "s3cret" });
  });

  it("returns no options without a DSN, so Sentry.init is never called (AC-13)", () => {
    expect(sentryOptions(undefined)).toBeUndefined();
    expect(sentryOptions("")).toBeUndefined();
    expect(sentryOptions("   ")).toBeUndefined();
  });

  // Spec 040 §5.2 / AC-32 (TASK-097) changed the two sources: the environment tag is `APP_ENV`
  // (was `VERCEL_ENV`) and the release prefers `RAILWAY_GIT_COMMIT_SHA` (was the Vercel SHA
  // alone). The *shape* — `sendDefaultPii: false`, `beforeSend === scrubEvent` — is unchanged.
  it("sets sendDefaultPii false, release = commit SHA, environment = APP_ENV", () => {
    const keys = ["APP_ENV", "RAILWAY_GIT_COMMIT_SHA"] as const;
    const previous = keys.map((key) => [key, process.env[key]] as const);
    for (const [key, value] of [
      ["APP_ENV", "preview"],
      ["RAILWAY_GIT_COMMIT_SHA", "deadbeef"],
    ] as const) {
      process.env[key] = value;
    }
    try {
      const options = sentryOptions("https://public@de.sentry.io/1");
      expect(options).toMatchObject({
        dsn: "https://public@de.sentry.io/1",
        environment: "preview",
        release: "deadbeef",
        sendDefaultPii: false,
      });
      expect(options?.beforeSend).toBe(scrubEvent);
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("has no Sentry client when the DSN is unset (AC-13)", () => {
    expect(process.env.SENTRY_DSN ?? "").toBe("");
    expect(Sentry.getClient()).toBeUndefined();
  });
});

/**
 * Hardening carried from the review of PR #5 (TASK-007): the scrub must reach every place a
 * Sentry event can carry free text or nested objects, not just `extra`/`tags`.
 */
describe("Sentry beforeSend deep scrub (TASK-007)", () => {
  function nestedEvent(): ScrubbableEvent {
    return {
      message: "checkout failed for buyer@example.com",
      extra: {
        order: {
          id: "ord_1",
          buyer: { email: "buyer@example.com", name: "Anna" },
          items: [{ card: { message: "Happy birthday" } }],
        },
      },
      tags: { nested: "kept" },
      user: { id: "u_1", segments: { email: "buyer@example.com" } },
      contexts: {
        recipient: { address_line1: "ul. Ptasia 4", country: "PL" },
        browser: { version: "120" },
      },
      breadcrumbs: [
        {
          category: "fetch",
          message: "POST /api/checkout buyer@example.com",
          data: { phone: "+48123456789", status: 500 },
        },
      ],
      exception: {
        values: [
          {
            type: "Error",
            value: "duplicate key for buyer@example.com",
            stacktrace: { frames: [{ filename: "app/page.tsx" }] },
          },
        ],
      },
    };
  }

  it("redacts PII keys at any depth in extra, user and contexts", () => {
    const scrubbed = beforeSend(nestedEvent());
    const order = (scrubbed.extra?.["order"] ?? {}) as Record<string, unknown>;
    const buyer = order["buyer"] as Record<string, unknown>;
    expect(order["id"]).toBe("ord_1");
    expect(buyer["email"]).toBe(REDACTED);
    expect(buyer["name"]).toBe(REDACTED);
    // `card*` is a prefix on the redaction list, so the whole sub-object goes.
    const items = order["items"] as { card: unknown }[];
    expect(items[0]?.card).toBe(REDACTED);
    const segments = scrubbed.user?.["segments"] as Record<string, unknown>;
    expect(segments["email"]).toBe(REDACTED);
    const contexts = scrubbed["contexts"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(contexts["recipient"]?.["address_line1"]).toBe(REDACTED);
    expect(contexts["recipient"]?.["country"]).toBe("PL");
    expect(contexts["browser"]?.["version"]).toBe("120");
  });

  it("scrubs breadcrumb data and messages", () => {
    const scrubbed = beforeSend(nestedEvent());
    const breadcrumbs = scrubbed["breadcrumbs"] as {
      category?: string;
      message?: unknown;
      data?: Record<string, unknown>;
    }[];
    expect(breadcrumbs[0]?.category).toBe("fetch");
    expect(breadcrumbs[0]?.message).toBe(REDACTED);
    expect(breadcrumbs[0]?.data?.["phone"]).toBe(REDACTED);
    expect(breadcrumbs[0]?.data?.["status"]).toBe(500);
  });

  it("scrubs the event message and every exception value, keeping type and stack", () => {
    const scrubbed = beforeSend(nestedEvent());
    expect(scrubbed["message"]).toBe(REDACTED);
    const exception = scrubbed["exception"] as {
      values: { type: string; value: unknown; stacktrace: unknown }[];
    };
    expect(exception.values[0]?.type).toBe("Error");
    expect(exception.values[0]?.value).toBe(REDACTED);
    expect(exception.values[0]?.stacktrace).toEqual({
      frames: [{ filename: "app/page.tsx" }],
    });
  });

  it("leaves no PII substring anywhere in the serialised nested event", () => {
    const serialised = JSON.stringify(beforeSend(nestedEvent()));
    for (const secret of [
      "buyer@example.com",
      "Anna",
      "Happy birthday",
      "+48123456789",
      "ul. Ptasia 4",
    ]) {
      expect(serialised, `leaked: ${secret}`).not.toContain(secret);
    }
  });

  it("does not mutate the nested event it was given", () => {
    const event = nestedEvent();
    beforeSend(event);
    expect(event.extra?.["order"]).toMatchObject({ id: "ord_1" });
    expect(event["message"]).toBe("checkout failed for buyer@example.com");
  });

  it("tolerates an event with none of the optional sections", () => {
    expect(beforeSend({ event_id: "e1" })).toEqual({ event_id: "e1" });
  });
});

/**
 * The release resolution still reads the `NEXT_PUBLIC_` mirror even though TASK-043 removed the
 * browser SDK from public routes: the mirror is what a *future* client SDK reads (spec 013 brings
 * one back on the checkout routes), and `sentryOptions()` is one function for every runtime. The
 * precedence is what is pinned here — server value first — so re-adding a client entrypoint
 * cannot silently start reporting a different release than the server does.
 */
describe("Sentry release and the NEXT_PUBLIC mirror (TASK-007, TASK-043)", () => {
  const keys = [
    "RAILWAY_GIT_COMMIT_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  ] as const;

  function withEnv(
    values: Partial<Record<(typeof keys)[number], string>>,
    body: () => void,
  ): void {
    const previous = keys.map((key) => [key, process.env[key]] as const);
    try {
      for (const key of keys) {
        const value = values[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      body();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("falls back to NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, the only SHA a browser bundle could read", () => {
    withEnv({ NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "cafebabe" }, () => {
      expect(sentryOptions("https://public@de.sentry.io/1")?.release).toBe(
        "cafebabe",
      );
    });
  });

  it("prefers the server variable when both are present", () => {
    withEnv(
      {
        VERCEL_GIT_COMMIT_SHA: "server-sha",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "client-sha",
      },
      () => {
        expect(sentryOptions("https://public@de.sentry.io/1")?.release).toBe(
          "server-sha",
        );
      },
    );
  });

  // Spec 040 §5.2 (TASK-097): Railway's SHA is tried before Vercel's, so the image built by
  // whichever platform is actually serving carries the right release.
  it("prefers the Railway SHA over both Vercel variables (spec 040 §5.2)", () => {
    withEnv(
      {
        RAILWAY_GIT_COMMIT_SHA: "railway-sha",
        VERCEL_GIT_COMMIT_SHA: "server-sha",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "client-sha",
      },
      () => {
        expect(sentryOptions("https://public@de.sentry.io/1")?.release).toBe(
          "railway-sha",
        );
      },
    );
  });

  it("leaves the release undefined when none is set or all are blank", () => {
    withEnv(
      {
        RAILWAY_GIT_COMMIT_SHA: "",
        VERCEL_GIT_COMMIT_SHA: "",
        NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "",
      },
      () => {
        expect(
          sentryOptions("https://public@de.sentry.io/1")?.release,
        ).toBeUndefined();
      },
    );
    withEnv({}, () => {
      expect(
        sentryOptions("https://public@de.sentry.io/1")?.release,
      ).toBeUndefined();
    });
  });
});

/**
 * Spec 003 §11 (TASK-034): Sentry gains a `locale` tag and nothing else. It is a language code
 * taken from the URL path, so it must survive the scrub — a redacted tag would make per-locale
 * error volumes unreadable — and the redaction of everything else must be unaffected.
 */
describe("the non-PII tags (spec 003 §11, spec 005 §11)", () => {
  it("declares `locale` and `signal` as the allowed non-PII tags", () => {
    expect([...NON_PII_TAGS]).toEqual(["locale", "signal"]);
  });

  it("survives beforeSend verbatim for every launch locale", () => {
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const scrubbed = beforeSend({ tags: { locale } });
      expect(scrubbed.tags?.["locale"], locale).toBe(locale);
    }
  });

  it("does not make the rest of `tags` survivable", () => {
    const scrubbed = beforeSend({
      tags: { locale: "pl", email: "buyer@example.com", ip: "203.0.113.4" },
    });

    expect(scrubbed.tags).toEqual({
      locale: "pl",
      email: REDACTED,
      ip: REDACTED,
    });
  });

  it("sets the tag on the current scope and nothing else", () => {
    Sentry.withScope((scope) => {
      setLocaleTag("de");
      expect(scope.getScopeData().tags).toEqual({ locale: "de" });
    });
  });
});

/**
 * Spec 040 AC-32 / T-32 (TASK-098): the two tags a Railway deployment is read by. TASK-097 moved
 * the sources; this block pins the values the staging service will actually report, which is what
 * a reviewer of the staging cutover looks for in the Sentry UI.
 */
describe("Sentry environment and release on Railway (spec 040 AC-32, T-32)", () => {
  const environmentKeys = [
    "APP_ENV",
    "NEXT_PUBLIC_APP_ENV",
    "RAILWAY_GIT_COMMIT_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  ] as const;

  function withEnv(
    values: Partial<Record<(typeof environmentKeys)[number], string>>,
    body: () => void,
  ): void {
    const previous = environmentKeys.map(
      (key) => [key, process.env[key]] as const,
    );
    try {
      for (const key of environmentKeys) {
        const value = values[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      body();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const dsn = "https://public@de.sentry.io/1";

  it("tags every environment with its own APP_ENV value", () => {
    for (const environment of [
      "development",
      "preview",
      "staging",
      "production",
    ]) {
      withEnv({ APP_ENV: environment }, () => {
        expect(sentryOptions(dsn)?.environment, environment).toBe(environment);
      });
    }
  });

  it("uses the Railway commit SHA as the release on staging", () => {
    withEnv({ APP_ENV: "staging", RAILWAY_GIT_COMMIT_SHA: "c0ffee1" }, () => {
      expect(sentryOptions(dsn)).toMatchObject({
        environment: "staging",
        release: "c0ffee1",
      });
    });
  });

  it("falls back to the browser mirror of APP_ENV, then to development", () => {
    withEnv({ NEXT_PUBLIC_APP_ENV: "staging" }, () => {
      expect(sentryOptions(dsn)?.environment).toBe("staging");
    });
    withEnv({}, () => {
      expect(sentryOptions(dsn)?.environment).toBe("development");
    });
  });

  it("sends nothing at all when the DSN is unset, in any environment", () => {
    withEnv({ APP_ENV: "staging", RAILWAY_GIT_COMMIT_SHA: "c0ffee1" }, () => {
      expect(sentryOptions(undefined)).toBeUndefined();
      expect(sentryOptions("")).toBeUndefined();
    });
  });
});
