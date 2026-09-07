// Invalid fixture: geo header read outside src/modules/i18n/hints.ts (spec 001 AC-8; ADR-0006).
import type { StubRequest } from "./stubs";

export function country(req: StubRequest): string | null {
  return req.headers.get("x-vercel-ip-country");
}
