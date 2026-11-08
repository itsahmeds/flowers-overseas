/**
 * @purpose Every buyer Auth.js endpoint answers 404
 * @spec 018
 *
 * As on admin and the florist inbox: the link is requested at `/api/auth/buyer/request` and
 * consumed at `/api/auth/buyer/confirm`, which invokes Auth.js's email callback in process, so none
 * of Auth.js's own endpoints is served. Served, they would be a second sign-in path around the
 * identical answer, the send limit and the global cap, and a token consumed by a `GET`.
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
