/**
 * `GET /api/geo` — the country hint, and nothing else (spec 003 §14 A14; TASK-119).
 *
 * The founder's 2026-09-16 ruling asked for a suggestion that knows the visitor's country. ADR-0006
 * still forbids acting on it, so the country is not allowed anywhere near a page: a localised
 * document is byte-identical for every visitor, carries no `Vary` and sets no cookie (AC-7, AC-9),
 * and the only way the country reaches the browser is this route, fetched **after hydration** by
 * the suggestion island, and only when the visitor's languages named no launch locale.
 *
 * Everything about the response is deliberately small:
 *
 *  - the body is `{"country":"DE"}` or `{"country":null}` — an ISO 3166-1 alpha-2 code the edge
 *    already derived, never an IP, never a region, city, coordinate or anything else;
 *  - `Cache-Control: no-store` because the answer is per-visitor: caching it anywhere, at any
 *    layer, would hand one visitor another's country;
 *  - `Vary: cf-ipcountry, x-vercel-ip-country` so no shared cache that ignores `no-store` can
 *    collapse two countries onto one entry;
 *  - `X-Robots-Tag: noindex` and `force-dynamic`: it is not a page and must never be prerendered.
 *
 * **Nothing is stored and nothing is logged.** There is no logger import in this file on purpose:
 * a request log line carrying a country alongside a timestamp is exactly the record
 * `docs/compliance/ropa.md` row "language suggestion" promises does not exist (legitimate
 * interest, in memory, retention none).
 *
 * The header read itself is not here — `fo/no-geo-redirect` allows it in exactly one file, and
 * this route calls that file's `countryFromHeaders()`. `plan/01` §5's "`app/` is thin" and
 * ADR-0006's single-reader rule are the same rule here.
 */
import { countryFromHeaders } from "@/modules/i18n";

/** Per-visitor by definition: never prerendered, never revalidated, never cached. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request): Response {
  return Response.json(
    { country: countryFromHeaders(request.headers) },
    {
      headers: {
        "cache-control": "no-store",
        vary: "cf-ipcountry, x-vercel-ip-country",
        "x-robots-tag": "noindex",
      },
    },
  );
}
