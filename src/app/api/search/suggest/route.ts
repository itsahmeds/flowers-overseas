/**
 * `POST /api/search/suggest`: the header field's suggestions (spec 045 §14 A-founder-2026-11-08a
 * item 3, AC-44, AC-45; TASK-520). Thin: `suggestRoute()` (`src/modules/search`) parses the strict
 * JSON body, answers and sets the headers. `GET` answers 405, so the typed words never travel in a
 * URL. The proxy rate-limits it (TASK-403) and logs its pathname only.
 *
 * @purpose The search suggestions endpoint (POST only, no-store, noindex)
 * @spec 045
 */
import { suggestMethodNotAllowed, suggestRoute } from "@/modules/search";

/** Per request: the answer depends on the body, and nothing of it is stored. */
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return suggestRoute(request);
}

export function GET(): Response {
  return suggestMethodNotAllowed();
}
