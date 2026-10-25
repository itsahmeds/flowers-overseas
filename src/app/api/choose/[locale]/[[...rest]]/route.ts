/**
 * `GET /api/choose/{locale}/{next}`: the country chooser's choice (spec 004 §14
 * A-founder-2026-10-24a item 3, AC-78, AC-90; TASK-385).
 *
 * The chooser form's `action` (its GET carries `to`), and the path form
 * `/{locale}/{chooseSegment}/{iso2}/{next}` by `src/proxy.ts`'s rewrite. Always a `303`, uncached:
 * a shop country to its page with the one `Set-Cookie: fo_dest`, anything else back to the chooser
 * page with what was typed. The decision lives in the catalogue (`chooserChoiceResponse()`); this
 * file parses the query at the boundary and hands over the route's params.
 *
 * @purpose The chooser's 303 and its one fo_dest cookie
 * @spec 004
 */
import { ChooserToSchema, chooserChoiceResponse } from "@/modules/catalog";

/** Never cached, never prerendered: it answers one visitor's choice and sets a cookie. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; rest?: string[] }> },
): Promise<Response> {
  const { locale, rest = [] } = await params;
  const to = ChooserToSchema.parse(new URL(request.url).searchParams);
  return chooserChoiceResponse({ locale, segments: rest, to });
}
