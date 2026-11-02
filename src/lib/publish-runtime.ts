/**
 * Publishing, wired to the database, the job queue, the cache and the environment (spec 012b
 * §2.3, AC-6, AC-7, AC-8, AC-38; TASK-295). The rules are `./publish.ts`'s and are tested there
 * with an in-memory store; this file only connects them:
 *
 *  - `requestPublishFromAdmin()`: the admin's Publish: the diff against the running manifest, the
 *    removal context (the placeholder window, the indexing environment), one audited admin
 *    transaction, then one `catalogue.publish` job for the run;
 *  - `runPublishJob()`: the job's handler: one step, and the next step a minute later until the
 *    run is finished;
 *  - `bootPublish()`: `verifyOnBoot()` at every deployment's start, then the `dataAsOf`
 *    invalidation.
 */
import { sql } from "drizzle-orm";

import { existenceDiff, isStructuralPath } from "@/modules/catalog";

import { appEnvironment, commitSha } from "./env.schema";
import { invalidate } from "./cache";
import { type WarmOutcome, warmUrls as warmPaths } from "./cache-warm";
import { unionTags, type AdminCommand } from "./command-tags";
import { type DbTransaction, withAdminContext, withSystemContext } from "./db";
import { runningManifest } from "./existence";
import { isEnabled } from "./flags";
import { logger } from "./logger";
import {
  PUBLISH_FAILED_SIGNAL,
  type PublishRun,
  advancePublishRun,
  requestPublish,
  selectPublishTarget,
  trackedRef,
  verifyOnBoot,
} from "./publish";
import { dbPublishStore } from "./publish-store";
import { captureWarning } from "./sentry";

/** The job's name (`src/jobs/index.ts`). */
export const PUBLISH_JOB = "catalogue.publish" as const;

/** The minute between two polls (§2.3). */
export const PUBLISH_POLL_SECONDS = 60;

function environmentNow(): string {
  return appEnvironment(process.env);
}

/** Request each URL once, through the public origin (`cache:warm`'s function). */
export function warmUrls(
  paths: readonly string[],
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = process.env["NEXT_PUBLIC_SITE_URL"] ?? "",
): Promise<WarmOutcome> {
  return warmPaths(paths, fetchImpl, baseUrl);
}

/** The admin's Publish (AC-6, AC-8). Throws `PublishError` on a refusal; nothing is written then. */
export async function requestPublishFromAdmin(input: {
  readonly reason: string;
  readonly userId: string;
  readonly enqueue: (
    runId: string,
    addedUrls: readonly string[],
  ) => Promise<unknown>;
}): Promise<PublishRun> {
  const environment = environmentNow();
  const manifest = runningManifest();
  const diff = await existenceDiff({ urls: manifest?.urls ?? [] });
  const windowOpen = await isEnabled("catalogue.placeholder_window");
  const running = new Set(manifest?.urls ?? []);
  const indexingEnvironment = environment === "production";
  const run = await withAdminContext(
    { userId: input.userId, action: "catalogue.publish", reason: input.reason },
    (db) =>
      requestPublish(
        {
          environment,
          reason: input.reason,
          requestedBy: input.userId,
          diff,
          removal: {
            placeholderWindowOpen: windowOpen,
            // Conservative: once the window is closed, every structural URL the running build
            // serves in production counts as indexable (spec 012b §2.3: the window closes when
            // indexing opens).
            indexable: (url) =>
              indexingEnvironment && running.has(url) && isStructuralPath(url),
          },
        },
        {
          store: dbPublishStore(db),
          target: selectPublishTarget(process.env, environment),
          now: new Date(),
        },
      ),
  );
  await input.enqueue(run.id, diff.added);
  return run;
}

/** One step of the `catalogue.publish` job; `true` when the run is finished. */
export async function runPublishJob(payload: {
  readonly runId: string;
  readonly addedUrls: readonly string[];
}): Promise<boolean> {
  const environment = environmentNow();
  const target = selectPublishTarget(process.env, environment);
  const outcome = await withSystemContext(PUBLISH_JOB, (db) =>
    advancePublishRun(payload.runId, payload.addedUrls, {
      store: dbPublishStore(db),
      target,
      now: new Date(),
      report: captureWarning,
      invalidate: (tags) => invalidate(tags),
      warm: (urls) => warmUrls(urls),
    }),
  );
  logger.info(
    { event: PUBLISH_JOB, status: outcome.status, done: outcome.done },
    "publish run advanced",
  );
  return outcome.done;
}

/**
 * The commands whose rows changed after `dataAsOf` (advisor F1, AC-38): a product, a product copy
 * row or a photo attachment as a copy change, a price row as a price change, a country as a status
 * flip (the widest country row of §5.4).
 */
export async function changedSinceCommands(
  db: DbTransaction,
  dataAsOf: Date,
): Promise<readonly AdminCommand[]> {
  const since = dataAsOf.toISOString();
  const pricedIn = new Map<string, string[]>();
  for (const row of await db.execute<{ sku: string; iso2: string }>(sql`
    SELECT DISTINCT p.sku, c.iso2 FROM public.country_price cp
    JOIN public.product p ON p.id = cp.product_id
    JOIN public.country c ON c.id = cp.country_id
    WHERE cp.active_to IS NULL OR cp.active_to > current_date`)) {
    pricedIn.set(row.sku, [...(pricedIn.get(row.sku) ?? []), row.iso2]);
  }
  const commands: AdminCommand[] = [];
  const copied = await db.execute<{ sku: string }>(sql`
    SELECT p.sku FROM public.product p WHERE p.updated_at > ${since}::timestamptz
    UNION SELECT p.sku FROM public.product_translation t
      JOIN public.product p ON p.id = t.product_id WHERE t.updated_at > ${since}::timestamptz
    UNION SELECT p.sku FROM public.product_media m
      JOIN public.product p ON p.id = m.product_id WHERE m.updated_at > ${since}::timestamptz`);
  for (const row of copied) {
    commands.push({
      kind: "copy",
      sku: row.sku,
      pricedIn: pricedIn.get(row.sku) ?? [],
    });
  }
  const priced = await db.execute<{ sku: string; iso2: string }>(sql`
    SELECT DISTINCT p.sku, c.iso2 FROM public.country_price cp
    JOIN public.product p ON p.id = cp.product_id
    JOIN public.country c ON c.id = cp.country_id
    WHERE cp.updated_at > ${since}::timestamptz OR cp.created_at > ${since}::timestamptz`);
  for (const row of priced)
    commands.push({ kind: "price", sku: row.sku, iso2: row.iso2 });
  const countries = await db.execute<{ iso2: string }>(sql`
    SELECT iso2 FROM public.country WHERE updated_at > ${since}::timestamptz`);
  for (const row of countries)
    commands.push({ kind: "countryStatus", iso2: row.iso2 });
  return commands;
}

/** Hand `tags` to the `cache.invalidate` job. */
async function enqueueInvalidation(tags: readonly string[]): Promise<void> {
  const { enqueue, withBoss } = await import("../jobs/runtime");
  await withBoss((boss) =>
    enqueue(
      boss,
      "cache.invalidate",
      { tags: [...tags] },
      {
        requestId: "system:catalogue.publish",
      },
    ),
  );
}

/** Enqueue the first step of a run's `catalogue.publish` job. */
export async function enqueuePublishJob(
  runId: string,
  addedUrls: readonly string[],
  requestId: string,
): Promise<void> {
  const { enqueue, withBoss } = await import("../jobs/runtime");
  await withBoss((boss) =>
    enqueue(
      boss,
      PUBLISH_JOB,
      { runId, addedUrls: [...addedUrls] },
      { requestId },
    ),
  );
}

/**
 * At every deployment's start (`instrumentation.ts`, never during the build): verify the open run
 * and invalidate what changed while the build ran. A failure is logged and reported, never fatal:
 * the deployment serves either way, and an unverified run times out on its own.
 */
export async function bootPublish(): Promise<void> {
  const environment = environmentNow();
  if (trackedRef(environment) === null && environment !== "preview") return;
  try {
    await withSystemContext(PUBLISH_JOB, (db) =>
      verifyOnBoot({
        store: dbPublishStore(db),
        environment,
        commit: commitSha(process.env),
        manifest: runningManifest(),
        now: new Date(),
        changedSince: async (dataAsOf) =>
          unionTags(await changedSinceCommands(db, dataAsOf)),
        // Outside any request here, so the purge runs as a job inside the next tick, where
        // `revalidatePath` works (`cache.invalidate`).
        invalidate: (tags) => enqueueInvalidation(tags),
        report: captureWarning,
      }),
    );
  } catch (error) {
    logger.warn(
      {
        event: "catalogue.publish.boot_failed",
        error_class: error instanceof Error ? error.name : "Error",
      },
      "publish boot step failed",
    );
    captureWarning(PUBLISH_FAILED_SIGNAL, { stage: "boot" });
  }
}
