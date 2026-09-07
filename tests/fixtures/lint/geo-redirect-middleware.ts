// Invalid fixture: a redirect in a middleware file (spec 001 AC-8; ADR-0006 — suggest, never
// redirect). The rule keys on the `middleware.ts` basename, which this fixture name carries.
import { NextResponse, type StubRequest } from "./stubs";

export function middleware(request: StubRequest) {
  return NextResponse.redirect(new URL("/de", request.url));
}
