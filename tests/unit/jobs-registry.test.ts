/**
 * The job registry (spec 002 §5.2, AC-21; TASK-024): registered versus declared-only exactly as
 * the brief's Binding lists them, a versioned envelope per registered name, and refusal of an
 * invalid payload on both sides of the queue — with no payload value in what a refusal reports.
 */
import { describe, expect, it } from "vitest";

import {
  BackupVerifyPayload,
  DECLARED_JOBS,
  JOB_NAMES,
  JobPayloadError,
  MediaDeriveVariantsPayload,
  NeonUsageProbePayload,
  REGISTERED_JOBS,
  REGISTERED_JOB_NAMES,
  RetentionSweepPayload,
  buildJobData,
  isDeclaredJob,
  isRegisteredJob,
  parseJobData,
} from "../../src/jobs/index";

const REQUEST_ID = "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b";

describe("registered versus declared-only (TASK-024 Binding, spec 002 §5.2)", () => {
  it("registers exactly the four queues the Binding names, and spec 013's outbox.dispatch and payments.production_start", () => {
    expect([...REGISTERED_JOB_NAMES].sort()).toEqual([
      "db.backup_verify",
      "media.derive_variants",
      "neon.usage_probe",
      "outbox.dispatch",
      "payments.production_start",
      "retention.sweep",
    ]);
  });

  it("declares exactly the eight names later specs implement", () => {
    expect([...DECLARED_JOBS].sort()).toEqual([
      "assignment.timeout",
      "fx.refresh",
      "notification.deliver",
      "occasion.reminders",
      "order.route",
      "payout.accrue",
      "review.request",
      "sitemap.regenerate",
    ]);
  });

  it("keeps the two sets disjoint and JOB_NAMES their union", () => {
    for (const name of DECLARED_JOBS) {
      expect(isRegisteredJob(name), name).toBe(false);
      expect(isDeclaredJob(name), name).toBe(true);
    }
    for (const name of REGISTERED_JOB_NAMES) {
      expect(isDeclaredJob(name), name).toBe(false);
      expect(isRegisteredJob(name), name).toBe(true);
    }
    expect([...JOB_NAMES].sort()).toEqual(
      [...REGISTERED_JOB_NAMES, ...DECLARED_JOBS].sort(),
    );
    expect(new Set(JOB_NAMES).size).toBe(14);
    expect(isRegisteredJob("toString")).toBe(false);
  });

  it("gives each registered name its spec'd payload schema at version 1", () => {
    expect(REGISTERED_JOBS["media.derive_variants"]).toEqual({
      version: 1,
      payload: MediaDeriveVariantsPayload,
    });
    expect(REGISTERED_JOBS["retention.sweep"]).toEqual({
      version: 1,
      payload: RetentionSweepPayload,
    });
    expect(REGISTERED_JOBS["neon.usage_probe"]).toEqual({
      version: 1,
      payload: NeonUsageProbePayload,
    });
    expect(REGISTERED_JOBS["db.backup_verify"]).toEqual({
      version: 1,
      payload: BackupVerifyPayload,
    });
  });
});

describe("the payload schemas (spec 002 §5.2, spec 006 §5.2)", () => {
  it("RetentionSweepPayload defaults dryRun to false and refuses a non-boolean", () => {
    expect(RetentionSweepPayload.parse({})).toEqual({ dryRun: false });
    expect(RetentionSweepPayload.parse({ dryRun: true })).toEqual({
      dryRun: true,
    });
    expect(RetentionSweepPayload.safeParse({ dryRun: "yes" }).success).toBe(
      false,
    );
  });

  it("NeonUsageProbePayload takes nothing", () => {
    expect(NeonUsageProbePayload.parse({})).toEqual({});
    expect(NeonUsageProbePayload.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("BackupVerifyPayload needs a non-empty objectKey", () => {
    expect(
      BackupVerifyPayload.parse({ objectKey: "backups/2026/10/14/fo.dump" }),
    ).toEqual({
      objectKey: "backups/2026/10/14/fo.dump",
    });
    expect(BackupVerifyPayload.safeParse({ objectKey: "" }).success).toBe(
      false,
    );
    expect(BackupVerifyPayload.safeParse({}).success).toBe(false);
  });

  it("MediaDeriveVariantsPayload's reasons are exactly spec 006's three (breaker hole 8)", () => {
    expect([...MediaDeriveVariantsPayload.shape.reason.options].sort()).toEqual(
      ["backfill", "reencode", "upload"],
    );
    expect(Object.keys(MediaDeriveVariantsPayload.shape).sort()).toEqual([
      "assetId",
      "reason",
    ]);
  });

  it("MediaDeriveVariantsPayload is spec 006's: assetId and one of three reasons", () => {
    expect(
      MediaDeriveVariantsPayload.parse({ assetId: "a1", reason: "upload" }),
    ).toEqual({ assetId: "a1", reason: "upload" });
    for (const reason of ["upload", "backfill", "reencode"]) {
      expect(
        MediaDeriveVariantsPayload.safeParse({ assetId: "a1", reason }).success,
        reason,
      ).toBe(true);
    }
    expect(
      MediaDeriveVariantsPayload.safeParse({ assetId: "a1", reason: "manual" })
        .success,
    ).toBe(false);
  });
});

describe("buildJobData — the enqueuing half", () => {
  it("wraps a valid payload in the versioned envelope, defaults applied", () => {
    expect(buildJobData("retention.sweep", {}, REQUEST_ID)).toEqual({
      v: 1,
      requestId: REQUEST_ID,
      payload: { dryRun: false },
    });
  });

  it("throws payload_invalid naming the path, never the value", () => {
    let caught: unknown;
    try {
      buildJobData("db.backup_verify", { objectKey: 42 } as never, REQUEST_ID);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JobPayloadError);
    const error = caught as JobPayloadError;
    expect(error.reason).toBe("payload_invalid");
    expect(error.issues).toEqual(["payload.objectKey:invalid_type"]);
    expect(error.message).not.toContain("42");
  });

  it("throws not_registered for every declared-only name", () => {
    for (const name of DECLARED_JOBS) {
      expect(() => buildJobData(name, {}, REQUEST_ID), name).toThrow(
        JobPayloadError,
      );
      try {
        buildJobData(name, {}, REQUEST_ID);
      } catch (error) {
        expect((error as JobPayloadError).reason).toBe("not_registered");
      }
    }
  });

  it("refuses a request id that could carry free text into a log line", () => {
    expect(() => buildJobData("neon.usage_probe", {}, "two words")).toThrow(
      JobPayloadError,
    );
    expect(
      buildJobData("neon.usage_probe", {}, "system:neon.usage_probe"),
    ).toEqual({
      v: 1,
      requestId: "system:neon.usage_probe",
      payload: {},
    });
  });
});

describe("parseJobData — the consuming half (T-21: refused before the handler runs)", () => {
  const valid = { v: 1, requestId: REQUEST_ID, payload: { objectKey: "k" } };

  it("accepts the envelope buildJobData writes", () => {
    expect(parseJobData("db.backup_verify", valid)).toEqual({
      ok: true,
      envelope: valid,
    });
  });

  it("refuses another version, a missing envelope, an extra key and a bad payload", () => {
    const cases: [string, unknown, string[]][] = [
      ["version 0", { ...valid, v: 0 }, ["v:invalid_value"]],
      ["version 2", { ...valid, v: 2 }, ["v:invalid_value"]],
      [
        "bare payload",
        { objectKey: "k" },
        [
          "v:invalid_value",
          "requestId:invalid_type",
          "payload:invalid_type",
          "(root):unrecognized_keys",
        ],
      ],
      ["extra key", { ...valid, extra: true }, ["(root):unrecognized_keys"]],
      [
        "bad payload",
        { ...valid, payload: { objectKey: 7 } },
        ["payload.objectKey:invalid_type"],
      ],
      ["null", null, ["(root):invalid_type"]],
    ];
    for (const [label, data, issues] of cases) {
      const parsed = parseJobData("db.backup_verify", data);
      expect(parsed, label).toEqual({
        ok: false,
        reason: "payload_invalid",
        issues,
      });
    }
  });

  it("refuses a name that is not registered", () => {
    expect(parseJobData("order.route" as never, valid)).toEqual({
      ok: false,
      reason: "not_registered",
      issues: [],
    });
  });
});
