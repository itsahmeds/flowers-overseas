/**
 * `pnpm jobs:replay-webhooks` arguments (spec 013 AC-26; TASK-260), and that the script's request
 * matches what the route parses (`ReplayRequestSchema`).
 */
import { describe, expect, it } from "vitest";

import {
  parseReplayArgs,
  replayRequestBody,
} from "../../scripts/jobs-replay-webhooks.ts";
import { ReplayRequestSchema } from "../../src/modules/payments/webhooks.ts";

describe("jobs:replay-webhooks arguments (AC-26)", () => {
  it("--since, --inbox-id and --dry-run become the route's body, which the route accepts", () => {
    const since = parseReplayArgs([
      "--since",
      "2026-10-20T00:00:00Z",
      "--dry-run",
    ]);
    expect(replayRequestBody(since)).toEqual({
      since: "2026-10-20T00:00:00Z",
      dryRun: true,
    });
    expect(
      ReplayRequestSchema.safeParse(replayRequestBody(since)).success,
    ).toBe(true);
    const one = parseReplayArgs([
      "--inbox-id",
      "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
    ]);
    expect(replayRequestBody(one)).toEqual({
      inboxId: "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
      dryRun: false,
    });
    expect(ReplayRequestSchema.safeParse(replayRequestBody(one)).success).toBe(
      true,
    );
  });

  it("refuses neither or both of --since and --inbox-id, a bad date and an unknown flag", () => {
    expect(() => parseReplayArgs([])).toThrow();
    expect(() =>
      parseReplayArgs([
        "--since",
        "2026-10-20T00:00:00Z",
        "--inbox-id",
        "3f2a1c64-9b7e-4d21-8f0a-5c6d7e8f9a0b",
      ]),
    ).toThrow();
    expect(() => parseReplayArgs(["--since", "yesterday"])).toThrow();
    expect(() =>
      parseReplayArgs(["--since", "2026-10-20T00:00:00Z", "--all"]),
    ).toThrow();
    expect(ReplayRequestSchema.safeParse({}).success).toBe(false);
  });
});
