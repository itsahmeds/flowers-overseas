/**
 * @purpose Every Auth.js endpoint answers 404
 * @spec 012
 *
 * The sign-in core needs none of Auth.js's own HTTP endpoints: the link is requested at
 * `/admin/api/auth/request`, consumed at `/admin/api/auth/confirm` (which invokes Auth.js's email
 * callback **in process**), and the session is read from the database. Served, those endpoints
 * would be a second sign-in path outside the allowlist's identical answer and the send limit
 * (`signin/email`), an uncatalogued, unrobotted HTML page (`signout`, `error`, `verify-request`)
 * and a token consumed by a `GET` (`callback/email`). So the catch-all answers every method with
 * the same empty 404, with the admin headers. `tests/integration/auth-core.test.ts` crawls them.
 */
import { AUTH_RESPONSE_HEADERS } from "@/lib/auth/surface";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(null, { status: 404, headers: AUTH_RESPONSE_HEADERS });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
