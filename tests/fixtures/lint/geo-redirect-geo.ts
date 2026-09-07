// Invalid fixture: IP-derived request.geo read (spec 001 AC-8; ADR-0006).
import type { StubRequest } from "./stubs";

export function country(request: StubRequest): string | undefined {
  return request.geo?.country;
}
