/**
 * Spec 025 T-1 (AC-1) and §7's catalogue check (TASK-488): the alert registry is complete and
 * closed, every name the application raises is in it, and `captureAlert` is called from
 * `src/modules/ops` only.
 *
 *  - every registry entry parses under `AlertDefinitionSchema` (severity, scope, resolve mode,
 *    act-by rule, `docs/runbooks/<file>.md#<anchor>`);
 *  - every registry title key and component key exists in the admin catalogue;
 *  - a source scan of `src/` finds no `raiseAlert(`/`raiseLegacyAlert(`/`alert(` call with a
 *    string-literal name outside the registry, and no `captureAlert(` call outside
 *    `src/modules/ops` and its definition in `src/lib/sentry.ts`; the scan bites on a fixture.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { adminMessages } from "../../src/modules/admin/messages.ts";
import {
  ALERT_NAMES,
  ALERT_REGISTRY,
  AlertDefinitionSchema,
  alertTitleKey,
  baseSeverity,
  isAlertName,
} from "../../src/modules/ops/index.ts";

const ROOT = resolve(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory()
      ? walk(path)
      : /\.tsx?$/u.test(name)
        ? [path]
        : [];
  });
}

function lookup(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      adminMessages,
    );
}

/** The string-literal names raised in `source`, and stray `captureAlert(` calls. */
export function scanSource(
  file: string,
  source: string,
): { readonly unknown: string[]; readonly strayCapture: boolean } {
  const names = [
    ...source.matchAll(
      /\b(?:raiseAlert|raiseLegacyAlert|alert|captureAlert)\)?\(\s*"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/gu,
    ),
  ].map((match) => match[1] ?? "");
  const constants = [
    ...source.matchAll(
      /export const [A-Z_]+_ALERT\s*=\s*"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"/gu,
    ),
  ].map((match) => match[1] ?? "");
  const unknown = [...names, ...constants].filter((name) => !isAlertName(name));
  const strayCapture =
    !file.startsWith("src/modules/ops/") &&
    file !== "src/lib/sentry.ts" &&
    /\bcaptureAlert\s*\(/u.test(
      source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, ""),
    );
  return { unknown, strayCapture };
}

describe("T-1 (AC-1) · the registry", () => {
  it("gives every name a severity, scope, resolve mode, act-by rule and a runbook with an anchor", () => {
    expect(ALERT_NAMES.length).toBeGreaterThanOrEqual(40);
    for (const name of ALERT_NAMES) {
      expect(
        AlertDefinitionSchema.safeParse(ALERT_REGISTRY[name]).success,
        name,
      ).toBe(true);
      expect(ALERT_REGISTRY[name].runbook, name).toMatch(
        /^docs\/runbooks\/[a-z0-9-]+\.md#[a-z0-9-]+$/u,
      );
    }
  });

  it("absorbs spec 013's and 016's names and §5.2's new ones, with the severities of the table", () => {
    expect(baseSeverity("webhook.dead", "stripe")).toBe("P1");
    expect(baseSeverity("webhook.dead", "resend")).toBe("P2");
    expect(baseSeverity("routing.no_partner", undefined)).toBe("P1");
    expect(baseSeverity("order.photo_missing", undefined)).toBe("P3");
    expect(baseSeverity("payment.refund_state_mismatch", undefined)).toBe("P3");
    expect(baseSeverity("alerts.channel_failed", "push")).toBe("P1");
    for (const name of [
      "outbox.dead",
      "payment.amount_mismatch",
      "payment.paid_not_routed",
      "webhook.silent_24h",
      "routing.sla_overdue",
      "notifications.florist_bounce",
      "jobs.backlog",
      "site.down",
      "fx.stale",
      "email.bounce_rate",
      "db.usage_high",
      "alerts.test",
    ]) {
      expect(isAlertName(name), name).toBe(true);
    }
  });

  it("has every title key and component key in the admin catalogue", () => {
    for (const name of ALERT_NAMES) {
      expect(typeof lookup(alertTitleKey(name)), name).toBe("string");
      expect(
        typeof lookup(
          `admin.alerts.component.${ALERT_REGISTRY[name].component}`,
        ),
        name,
      ).toBe("string");
    }
  });
});

describe("T-1 (AC-1) · the source scan", () => {
  const files = walk("src");

  it("finds no raised name outside the registry and no captureAlert call outside src/modules/ops", () => {
    const problems = files.flatMap((file) => {
      const result = scanSource(
        relative(ROOT, join(ROOT, file)),
        readFileSync(join(ROOT, file), "utf8"),
      );
      return [
        ...result.unknown.map((name) => `${file}: ${name}`),
        ...(result.strayCapture ? [`${file}: captureAlert(`] : []),
      ];
    });
    expect(problems).toEqual([]);
  });

  it("bites: an unknown name and a stray captureAlert fail the scan", () => {
    expect(
      scanSource(
        "src/modules/payments/x.ts",
        'raiseLegacyAlert("payment.made_up", {});',
      ).unknown,
    ).toEqual(["payment.made_up"]);
    expect(
      scanSource(
        "src/modules/payments/x.ts",
        'captureAlert("outbox.dead", {});',
      ).strayCapture,
    ).toBe(true);
    expect(
      scanSource("src/modules/ops/raise.ts", 'captureAlert("outbox.dead");')
        .strayCapture,
    ).toBe(false);
  });
});
