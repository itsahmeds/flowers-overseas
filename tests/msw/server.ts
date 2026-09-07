/**
 * The one MSW server for node-side tests (spec 001 §2 "Testing harness", AC-18, TASK-008).
 *
 * Started by `tests/msw/setup.ts` for the `unit` Vitest project. Handlers come from the barrel;
 * per-test overrides use `server.use(...)`.
 */
import { setupServer } from "msw/node";

import { handlers } from "./handlers/index.ts";

export const server = setupServer(...handlers);
