/**
 * `GET /api/internal/mail-capture?to=` — the capturing mailer's read side for the e2e suite
 * (spec 012 §2.2, §5.2; TASK-217).
 *
 * Behind `INTERNAL_CRON_SECRET` (the `x-internal-cron-secret` header, constant-time), and refused
 * with a bare 404 in `production` and `staging`, where the mailer is Resend and nothing is
 * captured. `to` is a query parameter only on this internal, secret-gated, never-linked route:
 * the e2e suite asks for the messages one fixture address received; nothing logs the query.
 */
import { z } from "zod";

import { INTERNAL_HEADERS, hasInternalSecret } from "@/jobs/internal";
import type { DeploymentEnvironment } from "@/lib/env.schema";

import { capturingMailer } from "./mailer";

/** The environments the route answers in. */
const CAPTURE_ENVIRONMENTS: readonly DeploymentEnvironment[] = [
  "development",
  "test",
  "preview",
];

export const MailCaptureQuerySchema = z
  .object({ to: z.email().optional() })
  .strict();

export function mailCaptureResponse(
  request: Request,
  deps: {
    readonly secret: string;
    readonly environment: DeploymentEnvironment;
  },
): Response {
  if (!CAPTURE_ENVIRONMENTS.includes(deps.environment)) {
    return new Response(null, { status: 404, headers: INTERNAL_HEADERS });
  }
  if (!hasInternalSecret(request, deps.secret)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: INTERNAL_HEADERS,
    });
  }
  const url = new URL(request.url);
  const query = MailCaptureQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!query.success) {
    return new Response(JSON.stringify({ ok: false, error: "bad_request" }), {
      status: 400,
      headers: INTERNAL_HEADERS,
    });
  }
  const messages = capturingMailer("").messages(query.data.to);
  return new Response(JSON.stringify({ ok: true, messages }), {
    status: 200,
    headers: INTERNAL_HEADERS,
  });
}
