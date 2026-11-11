/**
 * Publishing: how a structural change appears (spec 012b §2.3, §5.2 "`src/lib/publish.ts`", AC-6,
 * AC-7, AC-8, AC-38; TASK-295).
 *
 * A publish is **one rebuild of the environment's tracked branch head**: `release` in production
 * (spec 040 §14 A3), `main` in staging, nothing anywhere else. It never builds another commit, so
 * it cannot undo or skip a release. The pieces:
 *
 *  - **targets** behind one interface: `railway` (Railway's public API with an environment-scoped
 *    project token in `Project-Access-Token`), `fake` (tests) and `none` (development, preview,
 *    and any host without a target: Publish is absent with the reason shown). No Vercel target
 *    (§13 Q16, C2);
 *  - **the run** (`publish_run`, migration `0026`): `requested → building → deployed → verified`,
 *    or `failed` / `timed_out` from any open state, and nothing else (`canMove()`);
 *  - **`requestPublish()`**: the guards (one open run per environment, at most
 *    `PUBLISH_DAILY_LIMIT` a calendar day, no removal of an indexable URL once the placeholder
 *    window is closed), then one row. Nothing is written when a guard refuses;
 *  - **`advancePublishRun()`**: the `catalogue.publish` job's one step, idempotent by run id:
 *    trigger the target exactly once, then poll; `failed` with an error code and one Sentry
 *    event; `timed_out` 30 minutes after the request;
 *  - **`verifyOnBoot()`**: every deployment, at boot: marks the open run `verified` only when this
 *    deployment's `existenceHash` equals the run's expected hash and its commit equals the head
 *    recorded at request; and invalidates the §5.4 tags of every row changed after the manifest's
 *    `dataAsOf` (advisor F1, AC-38);
 *  - after `verified`, the job's last step: `invalidate(['sitemap'])` once and each added URL
 *    requested once (`cache:warm`'s function).
 *
 * The database half is a `PublishStore` (Drizzle over `publish_run` in `./publish-store.ts`), so
 * the rules here are exercised with an in-memory store and a fake target and a fake clock.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Environments and refs.                                                     */
/* -------------------------------------------------------------------------- */

/** The environments that publish (`publish_run.environment`). */
export const PUBLISH_ENVIRONMENTS = [
  "production",
  "staging",
  "preview",
] as const;
export type PublishEnvironment = (typeof PUBLISH_ENVIRONMENTS)[number];

/**
 * The branch a publish rebuilds in `environment`, or `null` where it publishes nothing: preview
 * shares the staging database and has no target (spec 012b §12 "Environments").
 */
export function trackedRef(environment: string): "release" | "main" | null {
  if (environment === "production") return "release";
  if (environment === "staging") return "main";
  return null;
}

/** At most this many runs per environment per calendar day (§13 Q14, AC-6). */
export const PUBLISH_DAILY_LIMIT = 10;

/** An open run with no deployment after this long is `timed_out` (§2.3). */
export const PUBLISH_TIMEOUT_MINUTES = 30;

/* -------------------------------------------------------------------------- */
/* The run's state machine (AC-7).                                            */
/* -------------------------------------------------------------------------- */

export const PUBLISH_RUN_STATUSES = [
  "requested",
  "building",
  "deployed",
  "verified",
  "failed",
  "timed_out",
] as const;
export type PublishRunStatus = (typeof PUBLISH_RUN_STATUSES)[number];

/** The open states: the partial unique index of `0026` allows one per environment. */
export const OPEN_RUN_STATUSES: readonly PublishRunStatus[] = [
  "requested",
  "building",
  "deployed",
];

const EDGES: Readonly<Record<PublishRunStatus, readonly PublishRunStatus[]>> = {
  requested: ["building", "failed", "timed_out"],
  building: ["deployed", "failed", "timed_out"],
  deployed: ["verified", "failed", "timed_out"],
  verified: [],
  failed: [],
  timed_out: [],
};

/** Whether a run may move `from → to` (AC-7: every other edge is refused). */
export function canMove(from: PublishRunStatus, to: PublishRunStatus): boolean {
  return EDGES[from].includes(to);
}

/** A refused publish or run move: a closed set of codes, each a `publish_run.error_code` too. */
export const publishErrorCodes = [
  "PUBLISH_TARGET_NONE",
  "PUBLISH_RUN_OPEN",
  "PUBLISH_DAILY_LIMIT",
  "PUBLISH_REMOVES_INDEXABLE",
  "PUBLISH_ILLEGAL_MOVE",
  "PUBLISH_TRIGGER_FAILED",
  "PUBLISH_BUILD_FAILED",
  "PUBLISH_TIMED_OUT",
  "PUBLISH_VERIFY_MISMATCH",
] as const;
export type PublishErrorCode = (typeof publishErrorCodes)[number];

export class PublishError extends Error {
  readonly code: PublishErrorCode;
  /** For `PUBLISH_REMOVES_INDEXABLE`: every refused URL. */
  readonly urls: readonly string[];

  constructor(
    code: PublishErrorCode,
    message: string,
    urls: readonly string[] = [],
  ) {
    super(`${code}: ${message}`);
    this.name = "PublishError";
    this.code = code;
    this.urls = urls;
  }
}

/* -------------------------------------------------------------------------- */
/* Targets.                                                                   */
/* -------------------------------------------------------------------------- */

/** What a target says of a deployment. */
export type DeploymentState = "building" | "deployed" | "failed";

/** One deploy target (spec 012b §5.2). */
export interface PublishTarget {
  readonly kind: "railway" | "fake" | "none";
  /** Deploy the head of `ref`; resolves to the provider's deployment id and the commit it builds. */
  trigger(ref: string): Promise<{ deploymentId: string; headSha: string }>;
  status(deploymentId: string): Promise<DeploymentState>;
}

/** No target: Publish is absent and nothing can be triggered. */
export const noTarget: PublishTarget = {
  kind: "none",
  trigger: () =>
    Promise.reject(
      new PublishError(
        "PUBLISH_TARGET_NONE",
        "no publish target in this environment",
      ),
    ),
  status: () =>
    Promise.reject(
      new PublishError(
        "PUBLISH_TARGET_NONE",
        "no publish target in this environment",
      ),
    ),
};

/** The fake target's controls: what the next deployment does, and every call it received. */
export interface FakeTarget extends PublishTarget {
  readonly kind: "fake";
  readonly triggered: string[];
  /** The state `status()` answers for every deployment. */
  outcome: DeploymentState;
  /** The commit the next trigger reports. */
  headSha: string;
}

/** A target for tests and the e2e run: records calls, answers what it is told. */
export function fakeTarget(headSha = "0".repeat(40)): FakeTarget {
  const target: FakeTarget = {
    kind: "fake",
    triggered: [],
    outcome: "building",
    headSha,
    trigger: (ref) => {
      target.triggered.push(ref);
      return Promise.resolve({
        deploymentId: `fake-${String(target.triggered.length)}`,
        headSha: target.headSha,
      });
    },
    status: () => Promise.resolve(target.outcome),
  };
  return target;
}

/** Railway's public GraphQL endpoint (https://docs.railway.com/integrations/api). */
export const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

const RailwayConfigSchema = z
  .object({
    token: z.string().min(1),
    projectId: z.string().min(1),
    environmentId: z.string().min(1),
    serviceId: z.string().min(1),
  })
  .strict();

const RailwayDeploymentSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  meta: z
    .object({
      commitHash: z
        .string()
        .regex(/^[0-9a-f]{40}$/u)
        .optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
});

const RailwayLatestSchema = z.object({
  data: z.object({
    deployments: z.object({
      edges: z.array(z.object({ node: RailwayDeploymentSchema })).min(1),
    }),
  }),
});

const RailwayOneSchema = z.object({
  data: z.object({ deployment: RailwayDeploymentSchema }),
});

/** Railway's deployment statuses, folded to the three a run needs. */
export function railwayState(status: string): DeploymentState {
  if (status === "SUCCESS") return "deployed";
  if (["FAILED", "CRASHED", "REMOVED", "SKIPPED"].includes(status))
    return "failed";
  return "building";
}

/**
 * The Railway target. **Unverified against a live project** (TASK-295's first step needs the
 * founder's environment-scoped token): `environmentTriggersDeploy` deploys the service's tracked
 * branch head, then the newest deployment is read back for its id and commit. The token travels
 * only in the `Project-Access-Token` header and is never logged.
 */
export function railwayTarget(
  config: z.input<typeof RailwayConfigSchema>,
  fetchImpl: typeof fetch = fetch,
): PublishTarget {
  const { token, projectId, environmentId, serviceId } =
    RailwayConfigSchema.parse(config);
  async function call(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetchImpl(RAILWAY_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Project-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new PublishError(
        "PUBLISH_TRIGGER_FAILED",
        `Railway answered ${String(response.status)}`,
      );
    }
    return response.json();
  }
  return {
    kind: "railway",
    async trigger() {
      await call(
        `mutation environmentTriggersDeploy($input: EnvironmentTriggersDeployInput!) {
          environmentTriggersDeploy(input: $input)
        }`,
        { input: { projectId, environmentId, serviceId } },
      );
      const latest = RailwayLatestSchema.parse(
        await call(
          `query latest($input: DeploymentListInput!) {
            deployments(first: 1, input: $input) { edges { node { id status meta } } }
          }`,
          { input: { projectId, environmentId, serviceId } },
        ),
      );
      const node = latest.data.deployments.edges[0]?.node;
      const headSha = node?.meta?.commitHash;
      if (node === undefined || headSha === undefined) {
        throw new PublishError(
          "PUBLISH_TRIGGER_FAILED",
          "Railway reported no commit for the deployment",
        );
      }
      return { deploymentId: node.id, headSha };
    },
    async status(deploymentId) {
      const one = RailwayOneSchema.parse(
        await call(
          `query deployment($id: String!) { deployment(id: $id) { id status meta } }`,
          { id: deploymentId },
        ),
      );
      return railwayState(one.data.deployment.status);
    },
  };
}

/** `PUBLISH_TARGET`'s values (spec 012b §5.2 env). */
export const PublishTargetKindSchema = z.enum(["railway", "fake", "none"]);

/**
 * The environment's target, from `PUBLISH_TARGET` and Railway's own `RAILWAY_*` ids (read, never
 * set). Absent or `none`, and every environment without a tracked ref, is `noTarget`.
 */
export function selectPublishTarget(
  env: Readonly<Record<string, string | undefined>>,
  environment: string,
): PublishTarget {
  if (trackedRef(environment) === null) return noTarget;
  const kind = PublishTargetKindSchema.safeParse(
    env["PUBLISH_TARGET"] ?? "none",
  );
  if (!kind.success || kind.data === "none") return noTarget;
  if (kind.data === "fake") return fakeTarget();
  return railwayTarget({
    token: env["RAILWAY_PUBLISH_TOKEN"] ?? "",
    projectId: env["RAILWAY_PROJECT_ID"] ?? "",
    environmentId: env["RAILWAY_ENVIRONMENT_ID"] ?? "",
    serviceId: env["RAILWAY_SERVICE_ID"] ?? "",
  });
}

/* -------------------------------------------------------------------------- */
/* The store.                                                                 */
/* -------------------------------------------------------------------------- */

/** One `publish_run` row, as the rules read it. */
export interface PublishRun {
  readonly id: string;
  readonly environment: PublishEnvironment;
  readonly reason: string;
  readonly requestedBy: string | null;
  readonly requestedAt: Date;
  readonly targetRef: string;
  readonly headSha: string | null;
  readonly expectedHash: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly status: PublishRunStatus;
  readonly providerDeploymentId: string | null;
  readonly errorCode: string | null;
  readonly finishedAt: Date | null;
}

export interface NewPublishRun {
  readonly environment: PublishEnvironment;
  readonly reason: string;
  readonly requestedBy: string | null;
  readonly targetRef: string;
  readonly expectedHash: string;
  readonly addedCount: number;
  readonly removedCount: number;
}

/** The database half (`./publish-store.ts`); an in-memory one in the tests. */
export interface PublishStore {
  /** Inside one transaction: the open run of `environment`, if any. */
  openRun(environment: PublishEnvironment): Promise<PublishRun | null>;
  /** Runs of `environment` requested on the calendar day of `now` (UTC). */
  runsOnDay(environment: PublishEnvironment, now: Date): Promise<number>;
  insert(run: NewPublishRun, now: Date): Promise<PublishRun>;
  get(id: string): Promise<PublishRun | null>;
  /** Move `id` from `from` to `to` with `patch`; `false` when the row was no longer at `from`. */
  move(
    id: string,
    from: PublishRunStatus,
    to: PublishRunStatus,
    patch: Partial<
      Pick<
        PublishRun,
        "headSha" | "providerDeploymentId" | "errorCode" | "finishedAt"
      >
    >,
  ): Promise<boolean>;
  /** The newest runs of `environment`, for `/admin/publish`. */
  history(
    environment: PublishEnvironment,
    limit: number,
  ): Promise<readonly PublishRun[]>;
}

/** Apply one move, refusing an illegal edge before the store sees it. */
async function moveRun(
  store: PublishStore,
  run: PublishRun,
  to: PublishRunStatus,
  patch: Parameters<PublishStore["move"]>[3],
  now: Date,
): Promise<boolean> {
  if (!canMove(run.status, to)) {
    throw new PublishError(
      "PUBLISH_ILLEGAL_MOVE",
      `a run moves ${run.status} → ${EDGES[run.status].join(" | ") || "nothing"}, not ${to}`,
    );
  }
  const finished = to === "verified" || to === "failed" || to === "timed_out";
  return store.move(run.id, run.status, to, {
    ...patch,
    ...(finished ? { finishedAt: now } : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* The removal guard (AC-8, spec 044 §2.6 / AC-16).                           */
/* -------------------------------------------------------------------------- */

/** What the removal guard knows about the running deployment. */
export interface RemovalContext {
  /** `catalogue.placeholder_window`: on from the cutover until indexing opens. */
  readonly placeholderWindowOpen: boolean;
  /** Whether `url` is indexable in the running deployment. */
  readonly isIndexable: (url: string) => boolean;
  /**
   * Exemptions a later spec registers without editing the guard (spec 044 §2.6: an unpublished
   * blog post with a reason and its audit row). Until one is registered, none applies.
   */
  readonly exemptions?: readonly ((url: string) => boolean)[];
}

/**
 * The one predicate the indexable-removal refusal reads (spec 012b §2.3, AC-8; spec 044 AC-16):
 * with the window open nothing is refused; with it closed, removing a URL that is indexable in the
 * running deployment is, unless a registered exemption covers it.
 */
export function isRemovalRefused(
  url: string,
  context: RemovalContext,
): boolean {
  if (context.placeholderWindowOpen) return false;
  if (!context.isIndexable(url)) return false;
  return !(context.exemptions ?? []).some((exempt) => exempt(url));
}

/* -------------------------------------------------------------------------- */
/* Request (AC-6, AC-8).                                                      */
/* -------------------------------------------------------------------------- */

/** The admin's form: a reason (audit), nothing else; the diff is computed server-side. */
export const PublishRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

/** The existence diff a request is made against (`existenceDiff()` in `src/modules/catalog`). */
export interface PublishDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** SHA-256 of the URL set the next build will emit. */
  readonly expectedHash: string;
}

export interface RequestPublishInput {
  readonly environment: string;
  readonly reason: string;
  readonly requestedBy: string | null;
  readonly diff: PublishDiff;
  readonly removal: RemovalContext;
}

/**
 * Create one run, or refuse and create nothing (AC-6, AC-8). The caller runs it in one admin
 * transaction (the store), so a refusal leaves no row, and `0026`'s partial unique index refuses
 * a second open run that a race let past `openRun()`. The target is **not** called here: the
 * `catalogue.publish` job calls it exactly once for the run.
 */
export async function requestPublish(
  input: RequestPublishInput,
  deps: {
    readonly store: PublishStore;
    readonly target: PublishTarget;
    readonly now: Date;
  },
): Promise<PublishRun> {
  const { reason } = PublishRequestSchema.parse({ reason: input.reason });
  const ref = trackedRef(input.environment);
  if (ref === null || deps.target.kind === "none") {
    throw new PublishError(
      "PUBLISH_TARGET_NONE",
      "this environment has no publish target",
    );
  }
  const environment = input.environment as PublishEnvironment;
  if ((await deps.store.openRun(environment)) !== null) {
    throw new PublishError("PUBLISH_RUN_OPEN", "a publish is already running");
  }
  if (
    (await deps.store.runsOnDay(environment, deps.now)) >= PUBLISH_DAILY_LIMIT
  ) {
    throw new PublishError(
      "PUBLISH_DAILY_LIMIT",
      `at most ${String(PUBLISH_DAILY_LIMIT)} publishes a day`,
    );
  }
  const refused = input.diff.removed.filter((url) =>
    isRemovalRefused(url, input.removal),
  );
  if (refused.length > 0) {
    throw new PublishError(
      "PUBLISH_REMOVES_INDEXABLE",
      `the publish would remove ${String(refused.length)} indexable URL(s)`,
      refused,
    );
  }
  return deps.store.insert(
    {
      environment,
      reason,
      requestedBy: input.requestedBy,
      targetRef: ref,
      expectedHash: input.diff.expectedHash,
      addedCount: input.diff.added.length,
      removedCount: input.diff.removed.length,
    },
    deps.now,
  );
}

/* -------------------------------------------------------------------------- */
/* The job's step (AC-7).                                                     */
/* -------------------------------------------------------------------------- */

export interface AdvanceDeps {
  readonly store: PublishStore;
  readonly target: PublishTarget;
  readonly now: Date;
  /** One Sentry event per failure (`captureWarning`). */
  readonly report: (signal: string, fields: Record<string, unknown>) => void;
  /** After `verified`: `invalidate(['sitemap'])`. */
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
  /** After `verified`: request each added URL once (`cache:warm`'s function). */
  readonly warm: (urls: readonly string[]) => Promise<unknown>;
}

/** The Sentry signal of a failed or timed-out publish (§11). */
export const PUBLISH_FAILED_SIGNAL = "catalogue.publish.failed";

/** What one step did; `done` ends the job, otherwise it runs again a minute later. */
export type AdvanceOutcome =
  | { readonly done: false; readonly status: PublishRunStatus }
  | { readonly done: true; readonly status: PublishRunStatus };

/**
 * One step of the `catalogue.publish` job for `runId` (idempotent by run id): trigger once, poll,
 * fail with a code, time out, and once the new deployment has verified itself, purge the
 * sitemaps once and warm each added URL once.
 */
export async function advancePublishRun(
  runId: string,
  addedUrls: readonly string[],
  deps: AdvanceDeps,
): Promise<AdvanceOutcome> {
  const run = await deps.store.get(runId);
  if (run === null) return { done: true, status: "failed" };
  if (run.status === "verified") {
    await deps.invalidate(["sitemap"]);
    await deps.warm(addedUrls);
    return { done: true, status: run.status };
  }
  if (run.status === "failed" || run.status === "timed_out") {
    return { done: true, status: run.status };
  }
  const ageMs = deps.now.getTime() - run.requestedAt.getTime();
  if (ageMs >= PUBLISH_TIMEOUT_MINUTES * 60_000) {
    await moveRun(
      deps.store,
      run,
      "timed_out",
      { errorCode: "PUBLISH_TIMED_OUT" },
      deps.now,
    );
    deps.report(PUBLISH_FAILED_SIGNAL, { run_id: run.id, status: "timed_out" });
    return { done: true, status: "timed_out" };
  }
  if (run.status === "requested") {
    // The one call to the target for this run: it moves the run to `building` with the
    // deployment id, so a re-run of this job finds `building` and polls instead.
    try {
      const { deploymentId, headSha } = await deps.target.trigger(
        run.targetRef,
      );
      await moveRun(
        deps.store,
        run,
        "building",
        { providerDeploymentId: deploymentId, headSha },
        deps.now,
      );
      return { done: false, status: "building" };
    } catch {
      await moveRun(
        deps.store,
        run,
        "failed",
        { errorCode: "PUBLISH_TRIGGER_FAILED" },
        deps.now,
      );
      deps.report(PUBLISH_FAILED_SIGNAL, { run_id: run.id, status: "failed" });
      return { done: true, status: "failed" };
    }
  }
  if (run.status === "building" && run.providerDeploymentId !== null) {
    const state = await deps.target.status(run.providerDeploymentId);
    if (state === "failed") {
      await moveRun(
        deps.store,
        run,
        "failed",
        { errorCode: "PUBLISH_BUILD_FAILED" },
        deps.now,
      );
      deps.report(PUBLISH_FAILED_SIGNAL, { run_id: run.id, status: "failed" });
      return { done: true, status: "failed" };
    }
    if (state === "deployed") {
      await moveRun(deps.store, run, "deployed", {}, deps.now);
      return { done: false, status: "deployed" };
    }
  }
  return { done: false, status: run.status };
}

/* -------------------------------------------------------------------------- */
/* Boot (AC-7, AC-38).                                                        */
/* -------------------------------------------------------------------------- */

export interface BootDeps {
  readonly store: PublishStore;
  readonly environment: string;
  /** This deployment's commit (`commitSha(process.env)`). */
  readonly commit: string | undefined;
  /** This deployment's manifest (`runningManifest()`). */
  readonly manifest: {
    readonly existenceHash: string;
    readonly dataAsOf: string | null;
  } | null;
  readonly now: Date;
  /** The §5.4 tags of every row changed after `dataAsOf` (`changedSinceTags()`), or none. */
  readonly changedSince: (dataAsOf: Date) => Promise<readonly string[]>;
  readonly invalidate: (tags: readonly string[]) => Promise<unknown>;
  readonly report: (signal: string, fields: Record<string, unknown>) => void;
}

/** What boot did: the run it verified (or refused), and the tags it invalidated. */
export interface BootOutcome {
  readonly verifiedRunId: string | null;
  readonly mismatchRunId: string | null;
  readonly invalidatedTags: readonly string[];
}

/**
 * At the boot of every deployment (publish or release): verify the open run when this deployment
 * is the one it asked for, then invalidate once the union of the tags of the rows changed while
 * the build ran (F1), and not at all when none changed.
 */
export async function verifyOnBoot(deps: BootDeps): Promise<BootOutcome> {
  let verifiedRunId: string | null = null;
  let mismatchRunId: string | null = null;
  const environment = deps.environment as PublishEnvironment;
  if (deps.manifest !== null && trackedRef(deps.environment) !== null) {
    const run = await deps.store.openRun(environment);
    if (run !== null && run.status !== "requested") {
      const matches =
        run.expectedHash === deps.manifest.existenceHash &&
        run.headSha !== null &&
        run.headSha === deps.commit;
      if (matches) {
        // The new deployment can boot before the poll saw `deployed`: pass through it.
        const deployed =
          run.status === "building"
            ? (await moveRun(deps.store, run, "deployed", {}, deps.now)) &&
              (await deps.store.get(run.id))
            : run;
        if (deployed !== false && deployed !== null) {
          await moveRun(deps.store, deployed, "verified", {}, deps.now);
          verifiedRunId = run.id;
        }
      } else if (run.headSha === deps.commit) {
        // This is the run's own deployment and it emitted another URL set than the diff said.
        await moveRun(
          deps.store,
          run,
          "failed",
          { errorCode: "PUBLISH_VERIFY_MISMATCH" },
          deps.now,
        );
        deps.report(PUBLISH_FAILED_SIGNAL, {
          run_id: run.id,
          status: "failed",
        });
        mismatchRunId = run.id;
      }
    }
  }
  let invalidatedTags: readonly string[] = [];
  const dataAsOf = deps.manifest?.dataAsOf ?? null;
  if (dataAsOf !== null) {
    const tags = [
      ...new Set(await deps.changedSince(new Date(dataAsOf))),
    ].sort();
    if (tags.length > 0) {
      await deps.invalidate(tags);
      invalidatedTags = tags;
    }
  }
  return { verifiedRunId, mismatchRunId, invalidatedTags };
}
