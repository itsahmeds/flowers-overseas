/**
 * @purpose Every florist Auth.js endpoint answers 404
 * @spec 011
 *
 * As on admin (`src/app/admin/api/auth/[...nextauth]/route.ts`): the link is requested at
 * `{base}/api/auth/request` and consumed at `{base}/api/auth/confirm`, which invokes Auth.js's
 * email callback in process, so none of Auth.js's own endpoints is served. Served, they would be a
 * second sign-in path around the identical answer and the send limit, and a token consumed by a
 * `GET` (spec 011 §2).
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
