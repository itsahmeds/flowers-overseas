// Valid fixture: a proxy file that only reads non-geo headers and sets one of its own. Renaming
// `middleware.ts` to `proxy.ts` must not make the request-id proxy itself unlintable.
import type { StubRequest } from "./stubs";

export function proxy(request: StubRequest): string | null {
  return request.headers.get("x-request-id");
}
