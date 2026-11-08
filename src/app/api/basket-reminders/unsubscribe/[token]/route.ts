/**
 * `POST /api/basket-reminders/unsubscribe/{token}` (spec 034 §5.2 "Unsubscribe", RFC 8058;
 * AC-19; TASK-451): the mail client's one-click stop. Thin glue: `oneClickUnsubscribeResponse`
 * decides. `GET` answers 405.
 */
import {
  oneClickMethodNotAllowed,
  oneClickUnsubscribeResponse,
} from "@/modules/checkout";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  return oneClickUnsubscribeResponse(request, { token });
}

export function GET(): Response {
  return oneClickMethodNotAllowed();
}
