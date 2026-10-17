/**
 * The request id an admin write carries into its transaction (spec 012 §11: the audit row and the
 * request's log line share it; spec 001 §5.2; TASK-217).
 */
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/request-id";

export async function adminRequestId(): Promise<string> {
  const { headers } = await import("next/headers");
  return resolveRequestId((await headers()).get(REQUEST_ID_HEADER));
}
