/**
 * The weekday FX rebuild (spec 005 §14 A7 Corrected 3, AC-34; T-34; TASK-181).
 *
 * Two halves, in the `ci-workflow.test.ts` precedent:
 *
 *  1. **The workflow file**: Monday-to-Friday at 15:30 and 19:30 UTC only; both Railway tokens
 *     from `secrets.*` and no other secret; read-only `permissions`; no hook for the cold-fallback
 *     host, no `git push`, no reference to the CI workflow; the decision is the script's.
 *  2. **The decision script** (`scripts/fx-refresh.ts`), fed recorded responses through MSW: the
 *     captured ECB daily file, health bodies in `HealthResponse`'s shape, a `git ls-remote` tip,
 *     and Railway API answers in the shape Railway's public API documents. The script reaches the
 *     network only through MSW here; an unhandled request fails the test.
 *
 * The cases T-34 names: behind → one rebuild request carrying exactly the reported commit;
 * current → none; production commit ≠ release tip → production skipped, staging still rebuilt;
 * production health unreachable → skipped with a notice; a missing secret → non-zero naming it;
 * 19:30 with staging still behind → one rebuild request, then non-zero naming `staging` (not
 * `production`, which is current); the same input at 15:30 → exit 0.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { ECB_DAILY_URL } from "../../scripts/fx-snapshot.ts";
import {
  FX_REFRESH_AT_VARIABLE,
  RAILWAY_API_URL,
  runFxRefresh,
} from "../../scripts/fx-refresh.ts";
import { server } from "../msw/server.ts";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

/* -------------------------------------------------------------------------- */
/* 1. The workflow file.                                                      */
/* -------------------------------------------------------------------------- */

interface Workflow {
  readonly on: {
    readonly schedule?: readonly { readonly cron: string }[];
    readonly workflow_dispatch?: unknown;
    readonly push?: unknown;
    readonly pull_request?: unknown;
  };
  readonly permissions: Record<string, string>;
  readonly jobs: Record<
    string,
    {
      readonly permissions?: unknown;
      readonly steps: readonly {
        readonly uses?: string;
        readonly run?: string;
        readonly env?: Record<string, string>;
      }[];
    }
  >;
}

const WORKFLOW_PATH = ".github/workflows/fx-refresh.yml";
const workflowText = read(WORKFLOW_PATH);
const workflow = parse(workflowText) as Workflow;

describe("fx-refresh.yml (AC-34, T-34)", () => {
  it("runs Monday to Friday at 15:30 and 19:30 UTC, and on no push or pull request", () => {
    expect(workflow.on.schedule?.map((entry) => entry.cron)).toEqual([
      "30 15 * * 1-5",
      "30 19 * * 1-5",
    ]);
    expect(workflow.on.push).toBeUndefined();
    expect(workflow.on.pull_request).toBeUndefined();
  });

  it("has read-only permissions and no job widens them", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(workflow.jobs)) {
      expect(job.permissions).toBeUndefined();
    }
  });

  it("reads exactly the two Railway tokens, from secrets, and no other secret", () => {
    const secrets = [...workflowText.matchAll(/secrets\.([A-Z0-9_]+)/gu)].map(
      (match) => match[1],
    );
    expect([...new Set(secrets)].sort()).toEqual([
      "RAILWAY_TOKEN_PRODUCTION",
      "RAILWAY_TOKEN_STAGING",
    ]);
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .find((candidate) => candidate.run === "node scripts/fx-refresh.ts");
    expect(step?.env).toMatchObject({
      RAILWAY_TOKEN_STAGING: "${{ secrets.RAILWAY_TOKEN_STAGING }}",
      RAILWAY_TOKEN_PRODUCTION: "${{ secrets.RAILWAY_TOKEN_PRODUCTION }}",
      FX_REFRESH_STAGING_URL: "${{ vars.FX_REFRESH_STAGING_URL }}",
      FX_REFRESH_PRODUCTION_URL: "${{ vars.FX_REFRESH_PRODUCTION_URL }}",
    });
    // The 19:30 schedule — and only it, or a manual `verify` — turns the check on.
    expect(step?.env?.FX_REFRESH_VERIFY).toBe(
      "${{ github.event.schedule == '30 19 * * 1-5' || inputs.verify == true }}",
    );
  });

  it("pushes nothing, calls no hook for the cold-fallback host, dispatches nothing and runs no test", () => {
    expect(workflowText).not.toMatch(
      /git\s+push|vercel|ci\.yml|deploy[_-]?hook/iu,
    );
    expect(workflowText).not.toMatch(/workflow_run|gh\s+workflow|dispatches:/u);
    expect(workflowText).not.toMatch(
      /pnpm\s+(?:test|build|e2e)|vitest|playwright/iu,
    );
    const runs = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .flatMap((step) => (step.run === undefined ? [] : [step.run]));
    expect(runs).toEqual(["node scripts/fx-refresh.ts"]);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The decision script, against recorded responses.                        */
/* -------------------------------------------------------------------------- */

const DAILY = read("tests/fixtures/fx/ecb-eurofxref-daily-2026-10-02.xml");
/** Monday 2026-10-05 15:30 UTC: the ECB's newest file is still Friday's in this fixture. */
const NOW = new Date("2026-10-05T15:30:00Z");
const ECB_DATE = "2026-10-02";

const STAGING_URL = "https://staging.example.test";
const PRODUCTION_URL = "https://production.example.test";
const STAGING_SHA = "1111111111111111111111111111111111111111";
const PRODUCTION_SHA = "2222222222222222222222222222222222222222";
const OTHER_SHA = "3333333333333333333333333333333333333333";
const STAGING_TOKEN = "fixture-staging-token";
const PRODUCTION_TOKEN = "fixture-production-token";

/** A health body in `HealthResponse`'s shape (src/lib/health.ts), recorded for a staging build. */
function healthBody(
  commit: string,
  fxAsOf: string | undefined,
): Record<string, unknown> {
  return {
    status: "ok",
    version: commit,
    env: "staging",
    commit,
    appEnv: "staging",
    region: "europe-west4-drams3a",
    ...(fxAsOf === undefined ? {} : { fxAsOf, fxSource: "ecb-build" }),
  };
}

/** What Railway's API was asked, per token, in order: operation and variables. */
interface RailwayCall {
  readonly token: string | null;
  readonly operation: string;
  readonly variables: Record<string, unknown>;
}

let railwayCalls: RailwayCall[] = [];
let reported: string[] = [];

/** Railway answers in the shape its public API documents, one project and environment per token. */
function railwayHandler() {
  return http.post(RAILWAY_API_URL, async ({ request }) => {
    const token = request.headers.get("project-access-token");
    const { query, variables } = (await request.json()) as {
      query: string;
      variables: Record<string, unknown>;
    };
    const operation = /projectToken/u.test(query)
      ? "projectToken"
      : /services/u.test(query)
        ? "services"
        : /variableUpsert/u.test(query)
          ? "variableUpsert"
          : /serviceInstanceDeployV2/u.test(query)
            ? "serviceInstanceDeployV2"
            : "unknown";
    railwayCalls.push({ token, operation, variables });
    const environmentId =
      token === STAGING_TOKEN ? "env-staging" : "env-production";
    switch (operation) {
      case "projectToken":
        return HttpResponse.json({
          data: { projectToken: { projectId: "project-1", environmentId } },
        });
      case "services":
        return HttpResponse.json({
          data: {
            project: {
              services: {
                edges: [
                  { node: { id: "service-worker", name: "worker" } },
                  { node: { id: "service-web", name: "web" } },
                ],
              },
            },
          },
        });
      case "variableUpsert":
        return HttpResponse.json({ data: { variableUpsert: true } });
      case "serviceInstanceDeployV2":
        return HttpResponse.json({
          data: { serviceInstanceDeployV2: "deployment-1" },
        });
      default:
        return HttpResponse.json({
          errors: [{ message: "unknown operation" }],
        });
    }
  });
}

function health(url: string, body: Record<string, unknown> | "down") {
  return http.get(`${url}/api/health`, () =>
    body === "down" ? HttpResponse.error() : HttpResponse.json(body),
  );
}

const FULL_ENV = {
  RAILWAY_TOKEN_STAGING: STAGING_TOKEN,
  RAILWAY_TOKEN_PRODUCTION: PRODUCTION_TOKEN,
  FX_REFRESH_STAGING_URL: STAGING_URL,
  FX_REFRESH_PRODUCTION_URL: PRODUCTION_URL,
} as const;

async function run(
  options: {
    readonly env?: Record<string, string | undefined>;
    readonly releaseTip?: string | null;
    readonly verify?: boolean;
  } = {},
) {
  return runFxRefresh({
    fetchImpl: fetch,
    releaseTip: () =>
      options.releaseTip === undefined ? PRODUCTION_SHA : options.releaseTip,
    now: NOW,
    env: {
      ...(options.env ?? FULL_ENV),
      FX_REFRESH_VERIFY: options.verify === true ? "true" : "false",
    },
    report: (line) => reported.push(line),
  });
}

/** The deploy requests sent, as `[token, commitSha]`. */
function deploys(): readonly (readonly [string | null, unknown])[] {
  return railwayCalls
    .filter((call) => call.operation === "serviceInstanceDeployV2")
    .map((call) => [call.token, call.variables.commitSha] as const);
}

beforeEach(() => {
  railwayCalls = [];
  reported = [];
  server.use(
    http.get(ECB_DAILY_URL, () => HttpResponse.text(DAILY)),
    railwayHandler(),
  );
});

describe("the decision script (AC-34, T-34)", () => {
  it("rebuilds an environment that is behind, at exactly the commit its health reported", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
    );
    const outcome = await run();

    expect(outcome.exitCode).toBe(0);
    expect(outcome.ecbDate).toBe(ECB_DATE);
    expect(deploys()).toEqual([[STAGING_TOKEN, STAGING_SHA]]);
    const deploy = railwayCalls.find(
      (call) => call.operation === "serviceInstanceDeployV2",
    );
    // The commit, never a branch name; the `web` service, never `worker`; the token's environment.
    expect(deploy?.variables).toEqual({
      serviceId: "service-web",
      environmentId: "env-staging",
      commitSha: STAGING_SHA,
    });
  });

  it("sets the Dockerfile's cache-breaker to this run's timestamp before the build, without deploying", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
    );
    await run();
    const operations = railwayCalls.map((call) => call.operation);
    expect(operations).toEqual([
      "projectToken",
      "services",
      "variableUpsert",
      "serviceInstanceDeployV2",
    ]);
    expect(railwayCalls[2]?.variables).toEqual({
      input: {
        projectId: "project-1",
        environmentId: "env-staging",
        serviceId: "service-web",
        name: FX_REFRESH_AT_VARIABLE,
        value: NOW.toISOString(),
        skipDeploys: true,
      },
    });
    expect(FX_REFRESH_AT_VARIABLE).toBe("FX_REFRESH_AT");
  });

  it("requests nothing when both environments are current", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, ECB_DATE)),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
    );
    const outcome = await run();
    expect(outcome.exitCode).toBe(0);
    expect(railwayCalls).toEqual([]);
    expect(outcome.results.map((result) => result.state)).toEqual([
      "current",
      "current",
    ]);
  });

  it("skips production when its commit is not the release tip, and still rebuilds staging", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, "2026-10-01")),
    );
    const outcome = await run({ releaseTip: OTHER_SHA });

    expect(outcome.exitCode).toBe(0);
    expect(deploys()).toEqual([[STAGING_TOKEN, STAGING_SHA]]);
    expect(outcome.results[1]).toMatchObject({
      env: "production",
      state: "skipped",
      behind: true,
    });
    expect(
      reported.filter((line) => line.startsWith("- production: skipped")),
    ).toHaveLength(1);
    expect(reported.join("\n")).toMatch(/not the release tip/u);
  });

  it("rebuilds production at its commit when that commit is the release tip", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, ECB_DATE)),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, "2026-10-01")),
    );
    const outcome = await run({ releaseTip: PRODUCTION_SHA });
    expect(outcome.exitCode).toBe(0);
    expect(deploys()).toEqual([[PRODUCTION_TOKEN, PRODUCTION_SHA]]);
  });

  it("skips production with a notice when its health does not answer", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, "down"),
    );
    const outcome = await run();
    expect(outcome.exitCode).toBe(0);
    expect(outcome.results[1]).toMatchObject({
      env: "production",
      state: "skipped",
      reason: "health did not answer",
    });
    expect(deploys()).toEqual([[STAGING_TOKEN, STAGING_SHA]]);
  });

  it("skips a deployment from before the bridge (no fxAsOf) rather than rebuild it pointlessly", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, undefined)),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
    );
    const outcome = await run({ verify: true });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.results[0]).toMatchObject({
      env: "staging",
      state: "skipped",
    });
    expect(railwayCalls).toEqual([]);
  });

  it.each([
    ["RAILWAY_TOKEN_STAGING", "secret RAILWAY_TOKEN_STAGING is not set"],
    ["RAILWAY_TOKEN_PRODUCTION", "secret RAILWAY_TOKEN_PRODUCTION is not set"],
    [
      "FX_REFRESH_STAGING_URL",
      "repository variable FX_REFRESH_STAGING_URL is not set",
    ],
  ] as const)(
    "exits non-zero naming a missing %s",
    async (missing, message) => {
      server.use(
        health(STAGING_URL, healthBody(STAGING_SHA, ECB_DATE)),
        health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
      );
      const outcome = await run({ env: { ...FULL_ENV, [missing]: "" } });
      expect(outcome.exitCode).toBe(1);
      expect(reported.join("\n")).toContain(message);
      // The token's value is never printed.
      expect(reported.join("\n")).not.toMatch(
        /fixture-(?:staging|production)-token/u,
      );
    },
  );

  it("at 19:30 requests the rebuild for a lagging staging, then exits non-zero naming staging only", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
    );
    const outcome = await run({ verify: true });

    expect(deploys()).toEqual([[STAGING_TOKEN, STAGING_SHA]]);
    expect(outcome.exitCode).toBe(1);
    const behind = reported.filter((line) =>
      line.includes("still behind the ECB"),
    );
    expect(behind).toEqual([
      `fx-refresh: staging is still behind the ECB (${ECB_DATE}) at the 19:30 check`,
    ]);
  });

  it("at 19:30 names a production skipped by the release guard, with the reason", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, ECB_DATE)),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, "2026-10-01")),
    );
    const outcome = await run({ verify: true, releaseTip: OTHER_SHA });
    expect(outcome.exitCode).toBe(1);
    expect(deploys()).toEqual([]);
    expect(reported.join("\n")).toMatch(
      /production is still behind the ECB \(2026-10-02\) at the 19:30 check, skipped: .*not the release tip/u,
    );
  });

  it("at 15:30 the same lagging input exits 0", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
    );
    const outcome = await run({ verify: false });
    expect(deploys()).toEqual([[STAGING_TOKEN, STAGING_SHA]]);
    expect(outcome.exitCode).toBe(0);
  });

  it("exits non-zero and rebuilds nothing when the ECB file would not validate", async () => {
    server.use(
      http.get(ECB_DAILY_URL, () =>
        HttpResponse.text("<html>maintenance</html>"),
      ),
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, "2026-10-01")),
    );
    const outcome = await run();
    expect(outcome.exitCode).toBe(1);
    expect(railwayCalls).toEqual([]);
    expect(reported.join("\n")).toContain("not-ecb-xml");
  });

  it("exits non-zero naming the environment when Railway refuses the rebuild", async () => {
    server.use(
      health(STAGING_URL, healthBody(STAGING_SHA, "2026-10-01")),
      health(PRODUCTION_URL, healthBody(PRODUCTION_SHA, ECB_DATE)),
      http.post(RAILWAY_API_URL, () =>
        HttpResponse.json({ errors: [{ message: "Not Authorized" }] }),
      ),
    );
    const outcome = await run();
    expect(outcome.exitCode).toBe(1);
    expect(reported.join("\n")).toMatch(
      /- staging: FAILED, rebuild request refused: Railway API: Not Authorized/u,
    );
  });
});
