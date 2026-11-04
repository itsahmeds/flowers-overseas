/**
 * Spec 020a AC-31 / T-32 (TASK-361): a log and Sentry spy over one integration suite.
 *
 * `watchLogsAndSentry(sentry)` starts, before the suite's first case, a spy on the process's
 * own sinks (`process.stdout.write`, `process.stderr.write` and `console`, where `src/lib/logger.ts`
 * writes by default) and reads the Sentry calls the suite's `vi.mock("@sentry/nextjs")` recorded.
 * The suite's last case calls `expectClean(forbidden)`: no line and no Sentry argument may carry
 * any of the strings (the fixture's buyer and recipient names, emails, phones, streets, card
 * message, the admin's note, every order's `public_token`, a sign-in link). Lines still reach the
 * real sink, so a failing case can be read.
 *
 * The Sentry mock must be declared in the suite itself (`vi.mock` is hoisted per file):
 *
 *   const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
 *   vi.mock("@sentry/nextjs", async (original) => ({ ...(await original()), ...sentry }));
 */
import { afterAll, beforeAll, expect, type Mock, vi } from "vitest";

export interface SentrySpies {
  readonly captureMessage: Mock;
  readonly captureException: Mock;
}

export interface PiiWatch {
  /** Every line written so far, and every Sentry call's arguments, as one text. */
  readonly captured: () => string;
  readonly expectClean: (forbidden: readonly string[]) => void;
}

/** A sign-in or tracking link in a line: the path segments the app's links carry. */
export const LINK_PATTERN =
  /\/(?:track|sign-in|api\/auth\/callback)\/[A-Za-z0-9_.-]{8,}/u;

function json(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "bigint" ? inner.toString() : inner,
  );
}

export function watchLogsAndSentry(sentry: SentrySpies): PiiWatch {
  const lines: string[] = [];
  const restore: (() => void)[] = [];

  beforeAll(() => {
    for (const stream of [process.stdout, process.stderr]) {
      const original = stream.write.bind(stream);
      const spy = vi
        .spyOn(stream, "write")
        .mockImplementation((chunk: unknown, ...rest: unknown[]) => {
          lines.push(
            typeof chunk === "string"
              ? chunk
              : Buffer.from(chunk as Uint8Array).toString("utf8"),
          );
          return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
        });
      restore.push(() => spy.mockRestore());
    }
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      const original = console[method].bind(console);
      const spy = vi
        .spyOn(console, method)
        .mockImplementation((...args: unknown[]) => {
          lines.push(
            args
              .map((arg) => (typeof arg === "string" ? arg : json(arg)))
              .join(" "),
          );
          original(...args);
        });
      restore.push(() => spy.mockRestore());
    }
  });

  afterAll(() => {
    for (const undo of restore) undo();
  });

  const captured = (): string =>
    [
      ...lines,
      json(sentry.captureMessage.mock.calls),
      json(sentry.captureException.mock.calls),
    ].join("\n");

  return {
    captured,
    expectClean(forbidden) {
      const text = captured();
      expect(forbidden.length).toBeGreaterThan(0);
      expect(
        forbidden.filter((value) => value !== "" && text.includes(value)),
      ).toEqual([]);
      expect(text).not.toMatch(LINK_PATTERN);
    },
  };
}
