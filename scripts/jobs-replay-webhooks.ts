/**
 * @purpose Replay missed Stripe webhooks through the inbox (spec 013 AC-26)
 * @spec 013
 *
 * `pnpm jobs:replay-webhooks --since <ISO> [--dry-run]` or `--inbox-id <uuid> [--dry-run]` (spec
 * 013 §5.2 "Webhook inbox", AC-26; TASK-260; `docs/runbooks/payment-webhook-down.md`).
 *
 * Posts to the deployment's `POST /api/internal/payments/replay-webhooks` with
 * `INTERNAL_CRON_SECRET`, because the replay needs the app's Stripe key and job queue, which live
 * in the deployment's environment, not on the founder's machine. The target is `--base-url`, else
 * `NEXT_PUBLIC_SITE_URL`. Prints the counts the route answers (seen, inserted, enqueued); never an
 * event. A script runs on Node's type stripping and cannot resolve the `@/` alias, so it restates
 * the request shape the route parses (`ReplayRequestSchema`).
 */
import { parseArgs } from "node:util";

import { z } from "zod";

export const ReplayArgsSchema = z
  .object({
    since: z.iso.datetime({ offset: true }).optional(),
    inboxId: z.uuid().optional(),
    dryRun: z.boolean().default(false),
    baseUrl: z.url().optional(),
  })
  .strict()
  .refine(
    (value) => (value.since === undefined) !== (value.inboxId === undefined),
    {
      message: "exactly one of --since and --inbox-id",
    },
  );
export type ReplayArgs = z.infer<typeof ReplayArgsSchema>;

export function parseReplayArgs(argv: readonly string[]): ReplayArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      since: { type: "string" },
      "inbox-id": { type: "string" },
      "dry-run": { type: "boolean" },
      "base-url": { type: "string" },
    },
    strict: true,
  });
  return ReplayArgsSchema.parse({
    since: values.since,
    inboxId: values["inbox-id"],
    dryRun: values["dry-run"] ?? false,
    baseUrl: values["base-url"],
  });
}

/** The request the route parses: exactly the replay options, nothing else. */
export function replayRequestBody(args: ReplayArgs): Record<string, unknown> {
  return {
    ...(args.since === undefined ? {} : { since: args.since }),
    ...(args.inboxId === undefined ? {} : { inboxId: args.inboxId }),
    dryRun: args.dryRun,
  };
}

async function main(): Promise<number> {
  let args: ReplayArgs;
  try {
    args = parseReplayArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      "usage: pnpm jobs:replay-webhooks (--since <ISO> | --inbox-id <uuid>) [--dry-run] [--base-url <url>]\n",
    );
    return 2;
  }
  const base = args.baseUrl ?? process.env["NEXT_PUBLIC_SITE_URL"];
  const secret = process.env["INTERNAL_CRON_SECRET"];
  if (
    base === undefined ||
    base === "" ||
    secret === undefined ||
    secret === ""
  ) {
    process.stderr.write(
      "jobs:replay-webhooks: set INTERNAL_CRON_SECRET and NEXT_PUBLIC_SITE_URL (or --base-url)\n",
    );
    return 2;
  }
  const response = await fetch(
    new URL("/api/internal/payments/replay-webhooks", base),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-cron-secret": secret,
      },
      body: JSON.stringify(replayRequestBody(args)),
    },
  );
  const text = await response.text();
  process.stdout.write(`${String(response.status)} ${text}\n`);
  return response.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
