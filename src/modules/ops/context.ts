/**
 * The alert module's seams (spec 025 §5.2; TASK-488): the transaction it writes in, the clock,
 * the environment name, the logger, the Sentry trail and the dispatch queue. Each has a production
 * default that loads its dependency at first use, so importing the module opens no connection,
 * reads no env and pulls no pg-boss into a page.
 */
import type { SQL } from "drizzle-orm";

import { appEnvironment } from "@/lib/env.schema";
import { logger as defaultLogger, type Logger } from "@/lib/logger";
import { captureAlert } from "@/lib/sentry";

/** Runs one statement in the caller's open transaction. */
export interface OpsExecutor {
  execute(query: SQL): Promise<readonly Record<string, unknown>[]>;
}

/** Runs `fn` in one transaction and commits it (or rolls it back on a throw). */
export type OpsTransaction = <T>(
  fn: (executor: OpsExecutor) => Promise<T>,
) => Promise<T>;

/** One `alerts.dispatch` job (§5.2 "Jobs"). */
export interface DispatchJob {
  readonly alertId: string;
  readonly kind:
    "raise" | "bump" | "resolve" | "reminder" | "escalation" | "test";
}

/** Enqueues `alerts.dispatch`; throws when it cannot. */
export type DispatchQueue = (job: DispatchJob) => Promise<void>;

/** The Sentry trail (`captureAlert`'s shape). */
export type SentryAlert = (
  alert: string,
  fields: Readonly<Record<string, unknown>> & { readonly order_id?: string },
  options?: { readonly fingerprint?: readonly string[] },
) => void;

export interface OpsDeps {
  readonly transaction?: OpsTransaction;
  readonly now?: () => Date;
  /** `APP_ENV`; default from `process.env` at call time. */
  readonly environment?: string;
  readonly log?: Logger;
  readonly sentry?: SentryAlert;
  readonly enqueue?: DispatchQueue;
  /** Throw on an invalid raise (tests); default: `NODE_ENV === "test"`. */
  readonly strict?: boolean;
}

/** A `system` transaction named for the alert job, loaded at first use. */
export function systemTransaction(job: string): OpsTransaction {
  return async (fn) => {
    const { withSystemContext } = await import("@/lib/db");
    return withSystemContext(job, async (db) =>
      fn({
        async execute(query) {
          const rows: unknown = await db.execute(query);
          return rows as readonly Record<string, unknown>[];
        },
      }),
    );
  };
}

/** The production queue: one pg-boss instance for the enqueue, loaded at first use. */
export const pgBossDispatchQueue: DispatchQueue = async (job) => {
  const { enqueue, withBoss } = await import("@/jobs/runtime");
  await withBoss(async (boss) => {
    await enqueue(
      boss,
      "alerts.dispatch",
      { alertId: job.alertId, kind: job.kind },
      {
        requestId: "system:alerts.raise",
        singletonKey: `${job.alertId}:${job.kind}`,
      },
    );
  });
};

/** The environment this process runs in, read at call time (never at import). */
export function currentEnvironment(): string {
  try {
    return appEnvironment(process.env);
  } catch {
    return "development";
  }
}

export interface ResolvedDeps {
  readonly transaction: OpsTransaction;
  readonly now: () => Date;
  readonly environment: string;
  readonly log: Logger;
  readonly sentry: SentryAlert;
  readonly enqueue: DispatchQueue;
  readonly strict: boolean;
}

export function resolveDeps(deps: OpsDeps, job: string): ResolvedDeps {
  return {
    transaction: deps.transaction ?? systemTransaction(job),
    now: deps.now ?? (() => new Date()),
    environment: deps.environment ?? currentEnvironment(),
    log: deps.log ?? defaultLogger,
    sentry: deps.sentry ?? captureAlert,
    enqueue: deps.enqueue ?? pgBossDispatchQueue,
    strict: deps.strict ?? process.env["NODE_ENV"] === "test",
  };
}

/** `ARRAY[...]::text[]` cannot be bound bare; a timestamptz parameter is bound as ISO text. */
export function iso(at: Date): string {
  return at.toISOString();
}
