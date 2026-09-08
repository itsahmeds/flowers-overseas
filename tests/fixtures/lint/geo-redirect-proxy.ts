// Invalid fixture: a redirect in a Next 16 proxy file (spec 003 AC-11; ADR-0006 — suggest, never
// redirect). The rule keys on the `proxy.ts` basename as well as `middleware.ts`, so TASK-032's
// rename could not disarm the gate; this fixture name carries the `proxy.ts` suffix.
import { NextResponse, type StubRequest } from "./stubs";

export function proxy(request: StubRequest) {
  return NextResponse.redirect(new URL("/de", request.url));
}
