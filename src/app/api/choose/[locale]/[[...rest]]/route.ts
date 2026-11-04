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
import {
  ChooserQuerySchema,
  ChooserToSchema,
  chooserChoiceResponse,
} from "@/modules/catalog";

/** Never cached, never prerendered: it answers one visitor's choice and sets a cookie. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string; rest?: string[] }> },
): Promise<Response> {
  const { locale, rest = [] } = await params;
  const query = new URL(request.url).searchParams;
  const to = ChooserToSchema.parse(query);
  // The search words, carried on to the results page for `next=search` only (spec 045 AC-13).
  const q = ChooserQuerySchema.parse(query);
  return chooserChoiceResponse({ locale, segments: rest, to, q });
}
