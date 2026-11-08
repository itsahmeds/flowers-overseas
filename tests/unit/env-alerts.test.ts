/**
 * Spec 025 T-35 (AC-35; TASK-488): the alert channel's env keys. URLs must be https URLs and the
 * Pushover keys 30-character tokens; each is optional, listed in `.env.example`, and a malformed
 * value reads as unset (named, never printed). `alertSecretValues` is what the secret scans use.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  alertHeartbeatUrl,
  alertSecretValues,
  alertSummaryHeartbeatUrl,
  pushoverConfig,
} from "../../src/lib/env.alerts.ts";
import { ENV_KEYS, serverEnvSchema } from "../../src/lib/env.schema.ts";

const KEYS = [
  "PUSHOVER_APP_TOKEN",
  "PUSHOVER_USER_KEY",
  "PUSHOVER_BACKUP_USER_KEY",
  "ALERT_HEARTBEAT_URL",
  "ALERT_SUMMARY_HEARTBEAT_URL",
] as const;
const TOKEN = "azGDORePK8gMaC0QOYAMyEEuzJnyUi";
const PING = "https://hc-ping.com/00000000-0000-4000-8000-000000000000";

describe("T-35 (AC-35) · the alert env keys", () => {
  it("are schema keys and lines of .env.example", () => {
    const example = readFileSync(
      resolve(import.meta.dirname, "../../.env.example"),
      "utf8",
    );
    for (const key of KEYS) {
      expect(ENV_KEYS).toContain(key);
      expect(example).toMatch(new RegExp(`^${key}=$`, "mu"));
    }
  });

  it("accept a 30-character token and an https URL, and refuse anything else", () => {
    const shape = serverEnvSchema.shape;
    expect(shape.PUSHOVER_APP_TOKEN.safeParse(TOKEN).success).toBe(true);
    expect(shape.PUSHOVER_APP_TOKEN.safeParse(`${TOKEN}x`).success).toBe(false);
    expect(shape.PUSHOVER_USER_KEY.safeParse("short").success).toBe(false);
    expect(shape.PUSHOVER_USER_KEY.safeParse("").success).toBe(true);
    expect(shape.ALERT_HEARTBEAT_URL.safeParse(PING).success).toBe(true);
    expect(
      shape.ALERT_HEARTBEAT_URL.safeParse("http://hc-ping.com/x").success,
    ).toBe(false);
    expect(
      shape.ALERT_SUMMARY_HEARTBEAT_URL.safeParse("not a url").success,
    ).toBe(false);
  });

  it("read a malformed value as unset and never print it", () => {
    expect(
      alertHeartbeatUrl({ ALERT_HEARTBEAT_URL: "http://plain.example" }),
    ).toBeUndefined();
    expect(
      alertSummaryHeartbeatUrl({ ALERT_SUMMARY_HEARTBEAT_URL: PING }),
    ).toBe(PING);
    const config = pushoverConfig({
      PUSHOVER_APP_TOKEN: "leaked-but-short",
      PUSHOVER_USER_KEY: TOKEN,
    });
    expect(config).toEqual({
      configured: false,
      missing: ["PUSHOVER_APP_TOKEN"],
    });
    expect(JSON.stringify(config)).not.toContain("leaked-but-short");
  });

  it("lists every configured secret value for the scans", () => {
    expect(
      [
        ...alertSecretValues({
          PUSHOVER_APP_TOKEN: TOKEN,
          ALERT_HEARTBEAT_URL: PING,
        }),
      ].sort(),
    ).toEqual([PING, TOKEN].sort());
  });
});
