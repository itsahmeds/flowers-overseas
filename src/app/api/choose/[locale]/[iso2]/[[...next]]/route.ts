/**
 * `GET /api/choose/{locale}/{iso2}/{next}`: the country chooser's choice (spec 004 §14
 * A-founder-2026-10-24a item 3, AC-78, AC-90; TASK-385).
 *
 * Reached by `src/proxy.ts`'s rewrite of a choice at `/{locale}/{chooseSegment}/...` (the
 * browser's address is the chooser's), never linked. Answers `303` to that country's version of
 * `next` with the one `Set-Cookie: fo_dest`, uncached; the decision lives in the catalogue
 * (`chooserChoiceResponse()`), this file only hands it the route's params.
 *
 * @purpose The chooser's 303 and its one fo_dest cookie
 * @spec 004
 */
import { chooserChoiceResponse } from "@/modules/catalog";

/** Never cached, never prerendered: it answers one visitor's choice and sets a cookie. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ locale: string; iso2: string; next?: string[] }>;
  },
): Promise<Response> {
  const { locale, iso2, next = [] } = await params;
  return chooserChoiceResponse({ locale, iso2, next });
}
