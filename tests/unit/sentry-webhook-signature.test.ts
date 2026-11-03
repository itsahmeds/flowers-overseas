/**
 * Spec 016 §5.2, §11 (TASK-335): a refused Resend webhook is one Sentry warning fingerprinted
 * `webhook-signature:resend`, so the `webhook-signature:*` rule (3 in 15 minutes) can count it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage,
  getCurrentScope: () => ({ setTag: () => undefined }),
}));

const { captureWebhookSignatureRejected } =
  await import("../../src/lib/sentry");

describe("captureWebhookSignatureRejected", () => {
  beforeEach(() => {
    captureMessage.mockClear();
  });

  it("sends one warning fingerprinted webhook-signature:resend, with the reason only", () => {
    captureWebhookSignatureRejected("resend", { reason: "stale_timestamp" });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith("webhook-signature:resend", {
      level: "warning",
      fingerprint: ["webhook-signature:resend"],
      tags: { signal: "webhook-signature:resend" },
      extra: { reason: "stale_timestamp" },
    });
  });
});
