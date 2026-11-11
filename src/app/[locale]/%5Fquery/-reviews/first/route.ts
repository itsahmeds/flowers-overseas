import { localePath, routableLocaleCodes } from "@/modules/i18n";
import { reviewsPageQuery } from "@/modules/reviews/display";

/**
 * `/{locale}/{reviews}?page=1`: a **301** to the bare URL, keeping a valid `?stars=n` (spec 022a §6
 * "Canonical and pagination", `plan/02` §7; AC-24; TASK-373). A route handler, because a page can
 * only answer 307 or 308. Reached only through `src/lib/reviews-routes.ts`'s rewrite; the same
 * response for every visitor, nothing read but the address.
 */
export function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  return params.then(({ locale }) => {
    if (!routableLocaleCodes().includes(locale)) {
      return new Response(null, { status: 404 });
    }
    const url = new URL(request.url);
    const query = reviewsPageQuery(Object.fromEntries(url.searchParams));
    if (query.kind !== "firstPage") return new Response(null, { status: 404 });
    const target = new URL(localePath(locale, "reviews"), url);
    if (query.stars !== undefined) {
      target.search = `stars=${String(query.stars)}`;
    }
    return new Response(null, {
      status: 301,
      headers: { Location: `${target.pathname}${target.search}` },
    });
  });
}
