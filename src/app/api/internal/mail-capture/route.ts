/**
 * @purpose GET: captured sign-in mail for e2e (§2.2)
 * @spec 012
 *
 * Thin by design (`plan/01` §5): the gate, the environment rule and the body are
 * `@/modules/notifications`' `mailCaptureResponse`.
 */
import { appEnvironment, env } from "@/lib/env";
import { mailCaptureResponse } from "@/modules/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request): Response {
  return mailCaptureResponse(request, {
    secret: env.INTERNAL_CRON_SECRET,
    environment: appEnvironment(process.env),
  });
}
