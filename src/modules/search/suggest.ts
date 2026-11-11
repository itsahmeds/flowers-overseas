/**
 * `POST /api/search/suggest`: the suggestions island's one request (spec 045 §14
 * A-founder-2026-11-08a item 3, AC-44, AC-45; TASK-520, which folds TASK-409 in).
 *
 * **The words never go into a URL.** The island sends a strict JSON body `{ locale, q, to? }`
 * (`SuggestRequestSchema`); a `GET` answers 405, so no typed word, possibly a name, ever sits in a
 * query string, a log line or a referrer. The proxy counts the request against the suggestion
 * budget (TASK-403: 120 a minute per client) and logs its pathname only; here it counts against
 * the process's concurrency cap. Nothing here logs, reports or measures the body: an error is
 * answered with an empty list and no detail.
 *
 * The answer is `SuggestItem[]` with `Cache-Control: private, no-store` and `X-Robots-Tag:
 * noindex`. No header, cookie or IP is read (ADR-0006): the same words, locale and `to` give every
 * visitor the same answer.
 */
import { UNLISTED_ROBOTS_HEADERS } from "@/modules/seo";
import { SEARCH_CONFIG, type SearchConfig } from "@/config/search";

import { searchEngine } from "./default-engine";
import type { SearchEngine } from "./engine";
import { type RateLimiter, searchGate } from "./gate";
import { SuggestRequestSchema } from "./schemas";

/** The headers on every answer of the route, the refusals included. */
export const SUGGEST_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store",
  ...UNLISTED_ROBOTS_HEADERS,
};

export interface SuggestRouteDeps {
  readonly engine?: SearchEngine;
  readonly gate?: RateLimiter;
  readonly config?: Pick<SearchConfig, "suggestions">;
}

function answer(status: number, body: unknown, extra: HeadersInit = {}) {
  const headers = new Headers({ ...SUGGEST_HEADERS });
  for (const [name, value] of new Headers(extra)) headers.set(name, value);
  if (body === null) return new Response(null, { status, headers });
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

/** The 405 every method but `POST` gets: the words must not arrive in a query string. */
export function suggestMethodNotAllowed(): Response {
  return answer(405, null, { Allow: "POST" });
}

/** One suggestion request, start to finish. */
export async function suggestRoute(
  request: Request,
  deps: SuggestRouteDeps = {},
): Promise<Response> {
  if (request.method !== "POST") return suggestMethodNotAllowed();
  if (!(deps.config ?? SEARCH_CONFIG).suggestions) return answer(404, null);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return answer(400, null);
  }
  const parsed = SuggestRequestSchema.safeParse(body);
  if (!parsed.success) return answer(400, null);

  const gate = deps.gate ?? searchGate();
  if (!gate.enter()) return answer(503, null, { "Retry-After": "5" });
  try {
    const items = await (deps.engine ?? searchEngine()).suggest(parsed.data);
    return answer(200, items);
  } catch {
    // No detail, no body, no words: the island closes its list and the form still works.
    return answer(500, []);
  } finally {
    gate.leave();
  }
}
