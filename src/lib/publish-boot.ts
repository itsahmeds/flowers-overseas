/**
 * The publish step of every deployment's boot (spec 012b §2.3, AC-7, AC-38; TASK-295).
 *
 * `instrumentation.ts` runs this at a server's start, never during the build. It imports only the
 * rules (`./publish.ts`), the `publish_run` store, the database client, the manifest, the job
 * queue, the logger and Sentry: **not** the catalogue barrel or the cache, whose fonts and pages
 * cannot be bundled into the instrumentation entry. So it does two things and defers the third:
 *
 *  1. verify the environment's open run against this deployment (`verifyOnBoot()`: its expected
 *     hash and the head it recorded at request), moving it to `verified`, or `failed` with
 *     `PUBLISH_VERIFY_MISMATCH` when this is its deployment and the URL set differs;
 *  2. hand the build's `dataAsOf` to one `cache.invalidate` job, which, inside the next tick,
 *     invalidates once the union of the §5.4 tags of every row changed after it, or nothing
 *     (`invalidateChangedSinceJob()` in `./publish-runtime.ts`);
 *  3. a failure is logged and reported, never fatal: the deployment serves either way, and an
 *     unverified run times out on its own.
 */
import { appEnvironment, commitSha } from "./env.schema";
import { withSystemContext } from "./db";
import { runningManifest } from "./existence";
import { logger } from "./logger";
import { PUBLISH_FAILED_SIGNAL, trackedRef, verifyOnBoot } from "./publish";
import { dbPublishStore } from "./publish-store";
import { captureWarning } from "./sentry";

/** The boot's request id on the jobs it enqueues and the transaction it opens. */
const BOOT_REQUEST = "system:catalogue.publish";

/** Enqueue the `dataAsOf` invalidation for the next tick. */
async function enqueueChangedSince(dataAsOf: string): Promise<void> {
  const { enqueue, withBoss } = await import("../jobs/runtime");
  await withBoss((boss) =>
    enqueue(
      boss,
      "cache.invalidate",
      { changedSince: dataAsOf },
      { requestId: BOOT_REQUEST },
    ),
  );
}

/** At every deployment's start: verify the open run, then defer the `dataAsOf` invalidation. */
export async function bootPublish(): Promise<void> {
  const environment = appEnvironment(process.env);
  if (trackedRef(environment) === null && environment !== "preview") return;
  const manifest = runningManifest();
  try {
    await withSystemContext("catalogue.publish", (db) =>
      verifyOnBoot({
        store: dbPublishStore(db),
        environment,
        commit: commitSha(process.env),
        // The `dataAsOf` half runs in the job (2. above), so verification sees none here.
        manifest:
          manifest === null
            ? null
            : { existenceHash: manifest.existenceHash, dataAsOf: null },
        now: new Date(),
        changedSince: () => Promise.resolve([]),
        invalidate: () => Promise.resolve(),
        report: captureWarning,
      }),
    );
    if (manifest?.dataAsOf != null)
      await enqueueChangedSince(manifest.dataAsOf);
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
