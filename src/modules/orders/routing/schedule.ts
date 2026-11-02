/**
 * The routing jobs a routing step asks for, and the one seam that enqueues them (spec 016 §5.2
 * "Jobs"; AC-1, AC-7, AC-17; TASK-328).
 *
 * A step never talks to pg-boss itself: it returns, or hands to `RoutingScheduler`, the jobs it
 * wants, each keyed (`order.route` by order, `assignment.remind` and `assignment.timeout` by
 * assignment, `assignment.photo_remind` by order). The keyed queues are pg-boss `short` queues
 * (`src/jobs/index.ts`): at most one waiting job per key, so an outbox row handled twice, or a
 * decline and a timeout landing together, queue one run.
 *
 * **Ordering with the transaction.** pg-boss writes through its own connection: the web role
 * holds nothing in schema `pgboss` (`src/jobs/runtime.ts`), so a job cannot commit with the
 * step's transaction. Each step therefore enqueues **inside** its transaction, before the commit:
 * if the enqueue fails, the step rolls back and is retried; if the commit fails after the
 * enqueue, the job runs, re-reads the order under its lock and finds nothing to do (every job is
 * a no-op on a state it does not expect). The one loss the order cannot see, an enqueue that
 * never happened, is what `routing.sla_watch` alerts on.
 *
 * The production scheduler loads `@/jobs/runtime` on first use, so importing this module pulls
 * no pg-boss into a page.
 */
import { z } from "zod";

/** The four keyed routing jobs (spec 016 §5.2). */
export const RoutingJobSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("order.route"),
      orderId: z.uuid(),
      startAfter: z.date().optional(),
    })
    .strict(),
  z
    .object({
      name: z.literal("assignment.remind"),
      assignmentId: z.uuid(),
      startAfter: z.date(),
    })
    .strict(),
  z
    .object({
      name: z.literal("assignment.timeout"),
      assignmentId: z.uuid(),
      startAfter: z.date(),
    })
    .strict(),
  z
    .object({
      name: z.literal("assignment.photo_remind"),
      orderId: z.uuid(),
      startAfter: z.date(),
    })
    .strict(),
]);
export type RoutingJob = z.infer<typeof RoutingJobSchema>;

/** Enqueues `jobs`, in order; throws when one cannot be enqueued (the caller rolls back). */
export type RoutingScheduler = (jobs: readonly RoutingJob[]) => Promise<void>;

/** The correlation id every routing enqueue carries (`plan/11` §1's `system:{job}`). */
export const ROUTING_REQUEST_ID = "system:routing";

/** The `singletonKey` of one job: the order, or the assignment (§5.2). */
export function routingJobKey(job: RoutingJob): { readonly key: string } {
  switch (job.name) {
    case "order.route":
    case "assignment.photo_remind":
      return { key: job.orderId };
    case "assignment.remind":
    case "assignment.timeout":
      return { key: job.assignmentId };
  }
}

/**
 * A pg-boss scheduler: one instance for the batch (`withBoss`), each job's queue made sure of (a
 * web request may enqueue before the first tick after a deploy), then one keyed `enqueue` per
 * job. `connectionString` defaults to `DATABASE_URL_UNPOOLED` (the suites pass a scratch one).
 */
export function createPgBossRoutingScheduler(
  options: { readonly connectionString?: string } = {},
): RoutingScheduler {
  return async (jobs) => {
    const parsed = jobs.map((job) => RoutingJobSchema.parse(job));
    if (parsed.length === 0) return;
    const { enqueue, ensureQueue, withBoss } = await import("@/jobs/runtime");
    await withBoss(
      (boss) => enqueueAll(boss, parsed, { enqueue, ensureQueue }),
      options.connectionString === undefined
        ? {}
        : { connectionString: options.connectionString },
    );
  };
}

type Runtime = typeof import("@/jobs/runtime");

async function enqueueAll(
  boss: Parameters<Runtime["enqueue"]>[0],
  parsed: readonly RoutingJob[],
  { enqueue, ensureQueue }: Pick<Runtime, "enqueue" | "ensureQueue">,
): Promise<void> {
  for (const job of parsed) {
    const options = {
      requestId: ROUTING_REQUEST_ID,
      singletonKey: routingJobKey(job).key,
      ...(job.startAfter === undefined ? {} : { startAfter: job.startAfter }),
    };
    await ensureQueue(boss, job.name);
    switch (job.name) {
      case "order.route":
      case "assignment.photo_remind":
        await enqueue(boss, job.name, { orderId: job.orderId }, options);
        break;
      case "assignment.remind":
      case "assignment.timeout":
        await enqueue(
          boss,
          job.name,
          { assignmentId: job.assignmentId },
          options,
        );
        break;
    }
  }
}

/** The production scheduler, over `DATABASE_URL_UNPOOLED`. */
export const pgBossRoutingScheduler: RoutingScheduler =
  createPgBossRoutingScheduler();
