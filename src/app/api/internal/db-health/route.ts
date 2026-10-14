/**
 * `GET /api/internal/db-health` — the database probe (spec 002 §5.2, §5.4, AC-23; TASK-024).
 *
 * Thin by design (`plan/01` §5): the secret gate, the headers and the body schema are
 * `@/jobs/internal`; the probe is `@/jobs/runtime` over `DATABASE_URL_UNPOOLED`. Called by cron,
 * never by the uptime monitor: `GET /api/health` stays database-free so pings never wake Neon.
 */
import { dbHealthResponse } from "@/jobs/internal";
import { probeDbHealth, withBoss } from "@/jobs/runtime";
import { env } from "@/lib/env";

/** Never cached, never prerendered: every call is a live probe. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(request: Request): Promise<Response> {
  return dbHealthResponse(request, {
    secret: env.INTERNAL_CRON_SECRET,
    probe: () => withBoss(probeDbHealth),
  });
}
