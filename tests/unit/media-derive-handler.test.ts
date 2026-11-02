/**
 * The production `media.derive_variants` handler (`src/jobs/handlers.ts`; spec 006 AC-25; TASK-082):
 * what reaches the log. The worker's behaviour is T-25 (`tests/integration/
 * media-derive-variants.test.ts`); here only the wiring the minute tick runs: a refusal completes
 * the job with one `warn` line naming the closed-set reason, and no line carries the asset id, an
 * object key or a credential (spec 002 §8; the brief's "no asset id logged at `info`").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const lines: { level: string; fields: unknown; message: string }[] = [];
const transactions: string[] = [];

vi.mock("../../src/lib/logger", () => {
  const record =
    (level: string) =>
    (fields: unknown, message: string): void => {
      lines.push({ level, fields, message });
    };
  return {
    logger: {
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
    },
  };
});

vi.mock("../../src/lib/db", () => ({
  withSystemContext: async (
    job: string,
    fn: (db: { execute: () => Promise<unknown> }) => Promise<unknown>,
  ) => {
    transactions.push(job);
    // No asset with this id: the worker refuses `asset_missing`.
    return fn({ execute: () => Promise.resolve([]) });
  },
}));

const R2 = {
  R2_S3_ENDPOINT:
    "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "fixture-access-key-id",
  R2_SECRET_ACCESS_KEY: "fixture-secret-access-key",
  R2_BUCKET: "flowersoverseas-media",
  R2_BACKUPS_BUCKET: "flowersoverseas-backups",
};

describe("JOB_HANDLERS['media.derive_variants']", () => {
  beforeEach(() => {
    lines.length = 0;
    transactions.length = 0;
    for (const [key, value] of Object.entries(R2)) vi.stubEnv(key, value);
  });

  it("completes a refused job with one warn line naming the reason and nothing else", async () => {
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    const assetId = "6f1c2a4e-8d5b-4c3a-9e7f-0a1b2c3d4e5f";
    await expect(
      JOB_HANDLERS["media.derive_variants"]?.(
        { assetId, reason: "upload" },
        { jobId: "j1", requestId: "system:test" },
      ),
    ).resolves.toBeUndefined();

    expect(transactions).toEqual(["media.derive_variants"]);
    expect(lines).toEqual([
      {
        level: "warn",
        fields: { job: "media.derive_variants", reason: "asset_missing" },
        message: "media.derive_variants.refused",
      },
    ]);
    const logged = JSON.stringify(lines);
    for (const secret of [assetId, ...Object.values(R2)]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("refuses a malformed id before it opens a transaction", async () => {
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    await JOB_HANDLERS["media.derive_variants"]?.(
      { assetId: "fo-bq-001-hero", reason: "backfill" },
      { jobId: "j2", requestId: "system:test" },
    );
    expect(transactions).toEqual([]);
    expect(lines.map((line) => line.fields)).toEqual([
      { job: "media.derive_variants", reason: "asset_id_invalid" },
    ]);
  });

  it("fails the job, so pg-boss retries, when the R2 environment is missing — naming keys only", async () => {
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    const { JOB_HANDLERS } = await import("../../src/jobs/handlers");
    await expect(
      JOB_HANDLERS["media.derive_variants"]?.(
        { assetId: "6f1c2a4e-8d5b-4c3a-9e7f-0a1b2c3d4e5f", reason: "upload" },
        { jobId: "j3", requestId: "system:test" },
      ),
    ).rejects.toThrow(/R2_SECRET_ACCESS_KEY/u);
  });
});
