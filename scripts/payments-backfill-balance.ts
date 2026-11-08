/**
 * @purpose Ask Stripe for the fees of every payment since an instant (spec 030b §5.2, §12)
 * @spec 030b
 *
 * `pnpm payments:backfill-balance --since <ISO> [--dry-run] [--base-url <url>]` (spec 030b §5.2
 * `scripts/`, §12; TASK-439; `docs/runbooks/finance.md`). Run once after the deploy that ships
 * spec 030b, with `--since` the first live payment.
 *
 * Posts to the deployment's `POST /api/internal/payments/backfill-balance` with
 * `INTERNAL_CRON_SECRET`, because the fetch needs the app's Stripe key and job queue, which live in
 * the deployment's environment, not on the founder's machine (the same shape as
 * `pnpm jobs:replay-webhooks`). The target is `--base-url`, else `NEXT_PUBLIC_SITE_URL`. Prints the
 * counts the route answers (found, enqueued); never a payment. A script runs on Node's type
 * stripping and cannot resolve the `@/` alias, so it restates the request shape the route parses
 * (`BalanceBackfillRequestSchema`).
 */
import { parseArgs } from "node:util";

import { z } from "zod";

export const BackfillArgsSchema = z
  .object({
    since: z.iso.datetime({ offset: true }),
    dryRun: z.boolean().default(false),
    baseUrl: z.url().optional(),
  })
  .strict();
export type BackfillArgs = z.infer<typeof BackfillArgsSchema>;

export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      since: { type: "string" },
      "dry-run": { type: "boolean" },
      "base-url": { type: "string" },
    },
    strict: true,
  });
  return BackfillArgsSchema.parse({
    since: values.since,
    dryRun: values["dry-run"] ?? false,
    baseUrl: values["base-url"],
  });
}

/** The request the route parses: exactly the backfill options, nothing else. */
export function backfillRequestBody(
  args: BackfillArgs,
): Record<string, unknown> {
  return { since: args.since, dryRun: args.dryRun };
}

async function main(): Promise<number> {
  let args: BackfillArgs;
  try {
    args = parseBackfillArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(
      "usage: pnpm payments:backfill-balance --since <ISO> [--dry-run] [--base-url <url>]\n",
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
      "payments:backfill-balance: set INTERNAL_CRON_SECRET and NEXT_PUBLIC_SITE_URL (or --base-url)\n",
    );
    return 2;
  }
  const response = await fetch(
    new URL("/api/internal/payments/backfill-balance", base),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-cron-secret": secret,
      },
      body: JSON.stringify(backfillRequestBody(args)),
    },
  );
  const text = await response.text();
  process.stdout.write(`${String(response.status)} ${text}\n`);
  return response.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  process.exitCode = await main();
}
