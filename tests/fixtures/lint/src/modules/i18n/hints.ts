// Valid fixture: the single file allowed to read a location hint, for the dismissible
// suggestion banner (spec 001 AC-8 "passes for the header read in a fixture path simulating
// src/modules/i18n/hints.ts"; ADR-0006, spec 003).
import type { StubRequest } from "../../../stubs";

export function countryHint(request: StubRequest): string | null | undefined {
  return request.headers.get("x-vercel-ip-country") ?? request.geo?.country;
}
