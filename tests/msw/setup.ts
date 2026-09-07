/**
 * Vitest setup for the `unit` project (spec 001 §2 "Testing harness", AC-18, TASK-008).
 *
 * `onUnhandledRequest: "error"` is the point of the skeleton: a unit test that reaches the
 * network fails instead of silently depending on a third party (plan/12 §3). `tests/unit/
 * msw-unhandled-request.test.ts` is the executable proof (T-19).
 */
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./server.ts";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
