// Valid fixture: non-geo headers, and a redirect outside proxy/middleware/i18n (a POST handler
// redirecting after a form submit is not an IP redirect).
import { NextResponse, type StubRequest } from "./stubs";

export function handle(request: StubRequest) {
  const language = request.headers.get("accept-language");
  return NextResponse.redirect(new URL(`/${language ?? "en"}`, request.url));
}
