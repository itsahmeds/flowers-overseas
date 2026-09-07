/**
 * T-14 / AC-13 (TASK-005): `beforeSend` strips request cookies, request bodies and IPs and
 * redacts the PII keys of spec 001 §8 from `extra`/`tags`; with no DSN the SDK is a true no-op.
 */
import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { REDACTED } from "../../src/lib/logger";
import {
  type ScrubbableEvent,
  beforeSend,
  scrubEvent,
  sentryOptions,
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

  it("sets sendDefaultPii false, release = commit SHA, environment = VERCEL_ENV", () => {
    const previous = {
      vercelEnv: process.env.VERCEL_ENV,
      sha: process.env.VERCEL_GIT_COMMIT_SHA,
    };
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "deadbeef";
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
      if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previous.vercelEnv;
      if (previous.sha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previous.sha;
    }
  });

  it("has no Sentry client when the DSN is unset (AC-13)", () => {
    expect(process.env.SENTRY_DSN ?? "").toBe("");
    expect(Sentry.getClient()).toBeUndefined();
  });
});
