/**
 * `src/lib/request-id.ts` (spec 001 §5.2, AC-14; extracted from `src/middleware.ts` in TASK-032).
 * Moved here from `tests/unit/middleware.test.ts` with the assertions unchanged.
 */
import { describe, expect, it } from "vitest";

import { REQUEST_ID_HEADER, resolveRequestId } from "../../src/lib/request-id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCOMING = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("resolveRequestId", () => {
  it("names the header the whole app agrees on", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });

  it("replaces a non-UUID id rather than trusting client input", () => {
    expect(resolveRequestId("../../etc/passwd")).toMatch(UUID_V4);
    expect(resolveRequestId(null)).toMatch(UUID_V4);
    expect(resolveRequestId("")).toMatch(UUID_V4);
    // a UUID v1 is not a v4 and is therefore regenerated
    expect(resolveRequestId("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toMatch(
      UUID_V4,
    );
  });

  it("echoes a caller's UUID v4 in either case", () => {
    expect(resolveRequestId(INCOMING)).toBe(INCOMING);
    expect(resolveRequestId(INCOMING.toUpperCase())).toBe(
      INCOMING.toUpperCase(),
    );
  });

  it("generates a distinct id per call when none is supplied", () => {
    expect(resolveRequestId(null)).not.toBe(resolveRequestId(null));
  });
});
