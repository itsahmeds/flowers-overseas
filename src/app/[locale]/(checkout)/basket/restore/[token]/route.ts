/**
 * `GET /{locale}/basket/restore/{token}` (spec 034 §5.2 "Restore"; AC-16, AC-17; TASK-451): the
 * reminder's link back. Thin glue: `restoreResponse` decides. A route handler because it sets
 * cookies; `no-store`, never prerendered.
 */
import { restoreResponse } from "@/modules/checkout";
import { routableLocale } from "@/modules/i18n";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: Request,
  context: { params: Promise<{ locale: string; token: string }> },
): Promise<Response> {
  const { locale: requested, token } = await context.params;
  const locale = routableLocale(requested);
  if (locale === undefined) return new Response(null, { status: 404 });
  return restoreResponse(request, { locale: locale.code, token });
}
