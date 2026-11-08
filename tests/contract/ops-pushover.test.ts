/**
 * Spec 025 T-5's request half and T-12 (AC-5, AC-12, AC-14, AC-35; TASK-488): the Pushover adapter
 * against a recorded `fetch`.
 *
 *  - a P1 push is one POST to `/1/messages.json` with `priority=2`, `retry=120`, `expire=3600`,
 *    `tags=<alertId>`, the token and user key in the body only; the receipt comes back as the ref;
 *  - a 400 is one call and not retryable; a 500 is retried 3 times at least 5 s apart on the
 *    injected sleep (4 calls), then reported failed;
 *  - `X-Limit-App-Remaining` is read; cancel-by-tag posts to the receipts endpoint;
 *  - no error carries the token, the user key or a URL (AC-35's secret scan over the results).
 */
import { describe, expect, it, vi } from "vitest";

import { CHANNEL_RETRY_DELAY_MS } from "../../src/config/alerts.ts";
import { createLogger } from "../../src/lib/logger.ts";
import { pushoverConfig } from "../../src/lib/env.alerts.ts";
import {
  PUSHOVER_API,
  buildPushMessage,
  pushoverChannel,
} from "../../src/modules/ops/index.ts";
import { sendWithRetry } from "../../src/modules/ops/dispatch.ts";

const TOKEN = "azGDORePK8gMaC0QOYAMyEEuzJnyUi";
const USER = "uQiRzpo4DXghDmr9QzzfQu27cmVRsG";
const ALERT_ID = "0f6f1d8e-6a40-4c55-9f0e-2d7c1b3a4e59";

function recorder(responses: Response[]) {
  const calls: { url: string; body: URLSearchParams | null; method: string }[] =
    [];
  const fetchImpl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: init?.body instanceof URLSearchParams ? init.body : null,
      });
      const next = responses.shift();
      if (next === undefined) throw new Error("no response scripted");
      return Promise.resolve(next);
    },
  );
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

const message = buildPushMessage(
  {
    id: ALERT_ID,
    name: "site.down",
    severity: "P1",
    mode: null,
    component: "site",
    reference: null,
    destinationZone: null,
    actBy: null,
    occurrences: 1,
    context: {},
  },
  2,
  {
    t: (key) => key,
    baseUrl: "https://flowersoverseas.com",
    founderZone: "Asia/Karachi",
    runbookBaseUrl: "https://example.test",
    alertPath: (id) =>
      id === undefined ? "/admin/alerts" : `/admin/alerts/${id}`,
  },
);

describe("T-5 (AC-5) · a P1 push", () => {
  it("is one POST with priority 2, retry 120, expire 3600 and the alert id as tag", async () => {
    const { calls, fetchImpl } = recorder([
      ok(
        { status: 1, request: "req-1", receipt: "rcpt1" },
        { "X-Limit-App-Remaining": "9876" },
      ),
    ]);
    const channel = pushoverChannel(
      { appToken: TOKEN, userKey: USER, backupUserKey: undefined },
      fetchImpl,
    );
    const result = await channel.send(message);
    expect(result).toEqual({
      ok: true,
      ref: "rcpt1",
      receipt: "rcpt1",
      remaining: 9876,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${PUSHOVER_API}/messages.json`);
    expect(calls[0]?.method).toBe("POST");
    const body = Object.fromEntries(calls[0]?.body ?? []);
    expect(body).toMatchObject({
      token: TOKEN,
      user: USER,
      priority: "2",
      retry: "120",
      expire: "3600",
      tags: ALERT_ID,
      url: `https://flowersoverseas.com/admin/alerts/${ALERT_ID}`,
    });
  });
});

describe("T-12 (AC-12) · failures", () => {
  it("a 400 is one call and not retried", async () => {
    const { calls, fetchImpl } = recorder([
      new Response("{}", { status: 400 }),
    ]);
    const channel = pushoverChannel(
      { appToken: TOKEN, userKey: USER, backupUserKey: undefined },
      fetchImpl,
    );
    const sleep = vi.fn(() => Promise.resolve());
    const result = await sendWithRetry(
      channel,
      message,
      { sleep, log: createLogger({ write: () => undefined }) },
      {
        alertId: ALERT_ID,
        kind: "raise",
      },
    );
    expect(result).toMatchObject({
      ok: false,
      errorClass: "HttpError:400",
      retryable: false,
    });
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("a 500 is retried 3 times at least 5 s apart, then failed", async () => {
    const { calls, fetchImpl } = recorder([
      new Response("{}", { status: 500 }),
      new Response("{}", { status: 502 }),
      new Response("{}", { status: 503 }),
      new Response("{}", { status: 500 }),
    ]);
    const channel = pushoverChannel(
      { appToken: TOKEN, userKey: USER, backupUserKey: undefined },
      fetchImpl,
    );
    const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
    const result = await sendWithRetry(
      channel,
      message,
      { sleep, log: createLogger({ write: () => undefined }) },
      {
        alertId: ALERT_ID,
        kind: "raise",
      },
    );
    expect(calls).toHaveLength(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    for (const [ms] of sleep.mock.calls)
      expect(ms).toBeGreaterThanOrEqual(5000);
    expect(CHANNEL_RETRY_DELAY_MS).toBe(5000);
    expect(result).toMatchObject({
      ok: false,
      errorClass: "HttpError:500",
      retryable: true,
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain(USER);
  });

  it("names the missing keys when either is unset, and treats a malformed key as unset", () => {
    expect(pushoverConfig({})).toEqual({
      configured: false,
      missing: ["PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"],
    });
    expect(
      pushoverConfig({ PUSHOVER_APP_TOKEN: TOKEN, PUSHOVER_USER_KEY: "short" }),
    ).toEqual({
      configured: false,
      missing: ["PUSHOVER_USER_KEY"],
    });
    expect(
      pushoverConfig({ PUSHOVER_APP_TOKEN: TOKEN, PUSHOVER_USER_KEY: USER }),
    ).toMatchObject({
      configured: true,
    });
  });
});

describe("AC-14 · cancel by tag", () => {
  it("posts to the receipts cancel endpoint with the token", async () => {
    const { calls, fetchImpl } = recorder([ok({ status: 1 })]);
    const channel = pushoverChannel(
      { appToken: TOKEN, userKey: USER, backupUserKey: undefined },
      fetchImpl,
    );
    expect(await channel.cancelByTag(ALERT_ID)).toBe(true);
    expect(calls[0]?.url).toBe(
      `${PUSHOVER_API}/receipts/cancel_by_tag/${ALERT_ID}.json`,
    );
    expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({ token: TOKEN });
  });

  it("reads an acknowledged receipt", async () => {
    const { fetchImpl } = recorder([
      ok({
        status: 1,
        acknowledged: 1,
        acknowledged_at: 1_762_700_000,
        expired: 0,
      }),
    ]);
    const channel = pushoverChannel(
      { appToken: TOKEN, userKey: USER, backupUserKey: undefined },
      fetchImpl,
    );
    expect(await channel.receipt("rcpt1")).toEqual({
      ok: true,
      acknowledgedAt: new Date(1_762_700_000_000),
      expired: false,
    });
  });
});
