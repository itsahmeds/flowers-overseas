/**
 * `pnpm railway:check` against recorded Railway API responses (spec 040 AC-9 / T-10, AC-11 /
 * T-11; TASK-098).
 *
 * A contract test rather than a unit test because the fixtures under `tests/fixtures/railway/`
 * are the shape of a boundary we do not own: if Railway renames `serviceInstances` or stops
 * returning `numReplicas`, the zod parse fails here, loudly, instead of the gate silently
 * reporting "no drift" on a response it no longer understands.
 *
 * The strongest assertion in the file is the negative one: **no line of output contains a
 * variable value**. Every value in the variable fixtures is the literal `SENTINEL-VALUE`, so the
 * check "stdout contains no sentinel" is mechanical rather than a judgement.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadDeclaredConfig,
  loadDeclaredTriggers,
  runRailwayCheck,
} from "../../scripts/railway-check.ts";
import {
  CONTRACT_VARIABLE_KEYS,
  PLATFORM_INJECTED_CONTRACT_KEYS,
  REQUIRED_VARIABLE_KEYS,
  compareDeployTriggers,
  deployTriggersSchema,
  railwayEnvironmentResponseSchema,
  railwayTriggersResponseSchema,
  railwayVariablesResponseSchema,
} from "../../src/lib/railway";

const repoRoot = resolve(__dirname, "../..");
const SENTINEL = "SENTINEL-VALUE";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(resolve(repoRoot, `tests/fixtures/railway/${name}`), "utf8"),
  );

const declared = loadDeclaredConfig(repoRoot);
const matching = railwayEnvironmentResponseSchema.parse(
  fixture("environment-staging.json"),
);
const drifted = railwayEnvironmentResponseSchema.parse(
  fixture("environment-drifted.json"),
);
const variables = (name: string) =>
  railwayVariablesResponseSchema.parse(fixture(name));

describe("the recorded Railway responses still parse (T-10)", () => {
  it("has the `web` service instance with the four AC-9 fields", () => {
    const node = matching.data.environment.serviceInstances.edges[0]?.node;
    expect(node?.serviceName).toBe("web");
    expect(node?.region).toBe("europe-west4");
    expect(node?.numReplicas).toBe(1);
    expect(node?.healthcheckPath).toBe("/api/health");
  });

  it("rejects a response missing the service list rather than passing it", () => {
    expect(
      railwayEnvironmentResponseSchema.safeParse({
        data: { environment: { name: "staging" } },
      }).success,
    ).toBe(false);
  });
});

describe("service drift (AC-9, T-10)", () => {
  it("passes on an environment that matches config/railway.json", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
    });
    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("match config/railway.json");
  });

  it("fails naming each of the four wrong values", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: drifted,
    });
    expect(report.ok).toBe(false);
    const output = report.lines.join("\n");
    for (const field of [
      "region",
      "numReplicas",
      "healthcheckPath",
      "restartPolicyType",
      "restartPolicyMaxRetries",
    ]) {
      expect(output, field).toContain(field);
    }
    // The live value and the declared one are both named, so the fix is obvious.
    expect(output).toContain("numReplicas is 2");
    expect(output).toContain("declares 1");
    expect(output).toContain("healthcheckPath is unset");
  });

  it("fails when the environment has no `web` service at all", () => {
    const empty = railwayEnvironmentResponseSchema.parse({
      data: {
        environment: { name: "staging", serviceInstances: { edges: [] } },
      },
    });
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: empty,
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain("not found");
  });
});

describe("the declared key set (AC-11)", () => {
  it("is AC-11's 28: the 26 of the env contract plus APP_ENV and NEXT_PUBLIC_APP_ENV", () => {
    expect(CONTRACT_VARIABLE_KEYS).toHaveLength(28);
    expect(CONTRACT_VARIABLE_KEYS).toContain("APP_ENV");
    expect(CONTRACT_VARIABLE_KEYS).toContain("NEXT_PUBLIC_APP_ENV");
  });

  it("requires 24 of them: the four Vercel keys are injected, never pasted", () => {
    expect(REQUIRED_VARIABLE_KEYS).toHaveLength(24);
    for (const key of PLATFORM_INJECTED_CONTRACT_KEYS) {
      expect(CONTRACT_VARIABLE_KEYS, key).toContain(key);
      expect(REQUIRED_VARIABLE_KEYS, key).not.toContain(key);
    }
  });
});

describe("variable key sets (AC-11, T-11)", () => {
  it("passes on the 28 contract keys plus the staging access switch", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
      variables: variables("variables-staging.json"),
    });
    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("contract satisfied");
  });

  it("fails on a missing key, naming it", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
      variables: variables("variables-missing-key.json"),
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(
      "missing key DATABASE_URL_UNPOOLED",
    );
  });

  it("fails on an extra key, naming it", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "staging",
      environment: matching,
      variables: variables("variables-extra-key.json"),
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(
      "unexpected key STRIPE_SECRET_KEY",
    );
  });

  it("treats the staging switch as an extra key in production (AC-25: no wall there)", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "production",
      environment: matching,
      variables: variables("variables-staging.json"),
    });
    expect(report.ok).toBe(false);
    expect(report.lines.join("\n")).toContain(
      "unexpected key STAGING_BASIC_AUTH",
    );
  });

  it("accepts the switch on a PR environment, which is gated like staging", () => {
    const report = runRailwayCheck({
      declared,
      environmentName: "pr-123",
      environment: matching,
      variables: variables("variables-staging.json"),
    });
    expect(report.ok).toBe(true);
  });

  it("never prints a variable value, on any of these runs", () => {
    for (const name of [
      "variables-staging.json",
      "variables-missing-key.json",
      "variables-extra-key.json",
    ]) {
      const report = runRailwayCheck({
        declared,
        environmentName: "staging",
        environment: drifted,
        variables: variables(name),
      });
      expect(report.lines.join("\n"), name).not.toContain(SENTINEL);
    }
  });
});

/**
 * Spec 040 §14 A3 change 6, AC-34: the trigger branch of each environment's services, declared in
 * `config/deploy-triggers.json` (Railway config-as-code has no trigger key) and compared with the
 * public API's `deploymentTriggers` (`environmentId`, `branch`). Production deploys only from
 * `release`; staging from `main`; no other environment from `release`.
 *
 * T-35 sits in this file rather than in `tests/unit/` so that the declaration and the recorded
 * responses it is compared with are read in one place.
 */
const declaredTriggers = loadDeclaredTriggers(repoRoot);
const triggers = (name: string) =>
  railwayTriggersResponseSchema.parse(fixture(name));
const checkTriggers = (name: string) =>
  compareDeployTriggers(declaredTriggers, triggers(name));

describe("config/deploy-triggers.json (AC-34, T-35)", () => {
  const valid = {
    production: { web: "release", worker: "release" },
    staging: { web: "main", worker: "main" },
  };

  it("declares production on `release` and staging on `main`, and nothing else", () => {
    expect({
      production: declaredTriggers.production,
      staging: declaredTriggers.staging,
    }).toEqual(valid);
  });

  it("parses the declared shape", () => {
    expect(deployTriggersSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing environment", () => {
    expect(
      deployTriggersSchema.safeParse({ production: valid.production }).success,
    ).toBe(false);
  });

  it("rejects a missing service", () => {
    expect(
      deployTriggersSchema.safeParse({
        ...valid,
        production: { web: "release" },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown branch value", () => {
    expect(
      deployTriggersSchema.safeParse({
        ...valid,
        staging: { web: "develop", worker: "main" },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown environment or service key, so a typo cannot pass unread", () => {
    expect(
      deployTriggersSchema.safeParse({ ...valid, prod: valid.production })
        .success,
    ).toBe(false);
    expect(
      deployTriggersSchema.safeParse({
        ...valid,
        staging: { ...valid.staging, cron: "main" },
      }).success,
    ).toBe(false);
  });
});

describe("the recorded deploymentTriggers responses still parse (T-34)", () => {
  it("carries a trigger's environmentId and branch, as the public API names them", () => {
    const production = triggers(
      "triggers-as-declared.json",
    ).data.project.environments.edges.find(
      (edge) => edge.node.name === "production",
    )?.node;
    const trigger = production?.deploymentTriggers.edges[0]?.node;
    expect(trigger?.branch).toBe("release");
    expect(trigger?.environmentId).toBe(production?.id);
  });

  it("rejects a response without deploymentTriggers rather than reading it as no triggers", () => {
    expect(
      railwayTriggersResponseSchema.safeParse({
        data: {
          project: {
            environments: {
              edges: [
                {
                  node: {
                    id: "e",
                    name: "production",
                    serviceInstances: { edges: [] },
                  },
                },
              ],
            },
          },
        },
      }).success,
    ).toBe(false);
  });
});

describe("the trigger-branch check (AC-34, T-34)", () => {
  it("passes when every trigger is as declared, and says so per service", () => {
    const report = checkTriggers("triggers-as-declared.json");
    expect(report.ok).toBe(true);
    expect(report.lines).toEqual([
      "production · web · triggers on release, declared release",
      "production · worker · triggers on release, declared release",
      "staging · web · triggers on main, declared main",
      "staging · worker · triggers on main, declared main",
    ]);
  });

  it("fails when production `web` triggers on `main`, naming it and nothing else", () => {
    const report = checkTriggers("triggers-production-web-on-main.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on main, declared release",
    ]);
  });

  it("fails when production `worker` triggers on `main`", () => {
    const report = checkTriggers("triggers-production-worker-on-main.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · worker · triggers on main, declared release",
    ]);
  });

  it("fails when staging triggers on `release`", () => {
    const report = checkTriggers("triggers-staging-on-release.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "staging · web · triggers on release, declared main",
    ]);
  });

  it("fails when a PR environment triggers on `release`", () => {
    const report = checkTriggers("triggers-pr-on-release.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "pr-123 · web · triggers on release, declared not release",
    ]);
  });

  it("fails when production has no `web` service, printing `triggers on none`", () => {
    const report = checkTriggers("triggers-production-no-web.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual(["production-services"]);
  });

  it("fails when production `web` exists with no trigger, and does not call that the expected red", () => {
    const report = checkTriggers("triggers-production-web-no-trigger.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("prints only the two `none` lines while production has no service at all (AC-42)", () => {
    const report = checkTriggers("triggers-production-empty.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
      "production · worker · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual(["production-services"]);
  });

  it("does not call a wrong branch the expected red", () => {
    expect(
      checkTriggers("triggers-production-web-on-main.json").expectedAbsences,
    ).toEqual([]);
  });

  it("does not check a `worker` with no repository source: it can follow no branch", () => {
    const report = checkTriggers("triggers-worker-no-source.json");
    expect(report.ok).toBe(true);
    expect(report.lines).toEqual([
      "production · web · triggers on release, declared release",
      "production · worker · no repository source, not checked",
      "staging · web · triggers on main, declared main",
      "staging · worker · no repository source, not checked",
    ]);
  });
});

describe("the trigger-branch check, round 2 (AC-34, T-34; /break 110, /review 110)", () => {
  it("fails a service with two triggers, even when one is the declared branch", () => {
    const report = checkTriggers("triggers-production-web-two-branches.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on main, release, declared release",
    ]);
  });

  it("fails a missing staging `worker`, and calls it the expected red of AC-44 (supersedes T-34's case)", () => {
    const report = checkTriggers("triggers-staging-no-worker.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "staging · worker · triggers on none, declared main",
    ]);
    expect(report.expectedAbsences).toEqual(["staging-worker"]);
  });

  it("fails a `worker` that has a repository but no trigger", () => {
    const report = checkTriggers("triggers-production-worker-no-trigger.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · worker · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("fails a `web` with no source and no trigger: only `worker` is exempt", () => {
    const report = checkTriggers("triggers-production-web-no-source.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("fails an undeclared staging service on `release`", () => {
    const report = checkTriggers("triggers-staging-cron-on-release.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "staging · cron · triggers on release, declared main",
    ]);
  });

  it("fails a staging trigger with no service on `release`", () => {
    const report = checkTriggers(
      "triggers-staging-null-service-on-release.json",
    );
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "staging · (no service) · triggers on release, declared main",
    ]);
  });

  it("judges a live trigger before absence: `web` still on `main` is a wrong branch, not the expected red", () => {
    const report = checkTriggers(
      "triggers-production-no-instance-web-on-main.json",
    );
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on main, declared release",
      "production · worker · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("does not call a missing production `worker` alone the expected red: the label needs `web` absent", () => {
    const report = checkTriggers("triggers-production-no-worker.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · worker · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("does not call a response with no production environment the expected red", () => {
    const report = checkTriggers("triggers-no-production-environment.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
      "production · worker · triggers on none, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });
});

describe("the trigger-branch check, round 3 (AC-34, T-34; /break 110, /review 110 round 2)", () => {
  it("calls production `web` absent plus staging `worker` absent both expected cases, production's first (AC-44, supersedes T-34's case)", () => {
    const report = checkTriggers(
      "triggers-production-no-web-staging-no-worker.json",
    );
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
      "staging · worker · triggers on none, declared main",
    ]);
    expect(report.expectedAbsences).toEqual([
      "production-services",
      "staging-worker",
    ]);
  });

  it("does not call production `web` absent plus `worker` on `main` the expected red", () => {
    const report = checkTriggers(
      "triggers-production-no-web-worker-on-main.json",
    );
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · web · triggers on none, declared release",
      "production · worker · triggers on main, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("fails an undeclared staging service on both `main` and `release`", () => {
    const report = checkTriggers("triggers-staging-cron-two-branches.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "staging · cron · triggers on main, release, declared main",
    ]);
  });

  it("fails an undeclared production service on `main`", () => {
    const report = checkTriggers("triggers-production-cron-on-main.json");
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · cron · triggers on main, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });

  it("fails a production trigger with no service on `main`", () => {
    const report = checkTriggers(
      "triggers-production-null-service-on-main.json",
    );
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "production · (no service) · triggers on main, declared release",
    ]);
    expect(report.expectedAbsences).toEqual([]);
  });
});

describe("`railway:check` on the command line (AC-34, AC-42)", () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/railway-check.ts", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      // No Railway key reaches the child: every run below is a fixture, or the no-credential case.
      env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "test" },
    });
  const triggersFixture = (name: string) => [
    "--fixture-triggers",
    `tests/fixtures/railway/${name}`,
  ];

  it("exits 0 when every trigger is as declared", () => {
    const run = cli(...triggersFixture("triggers-as-declared.json"));
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      "production · web · triggers on release, declared release",
    );
  });

  it("exits 1 with only the `none` lines on stdout while production has no service, labelled as expected on stderr", () => {
    const run = cli(...triggersFixture("triggers-production-empty.json"));
    expect(run.status).toBe(1);
    expect(run.stdout).toBe(
      "production · web · triggers on none, declared release\n" +
        "production · worker · triggers on none, declared release\n",
    );
    expect(run.stderr).toContain("EXPECTED RED until TASK-104");
  });

  it("exits 1 on a wrong branch without the expected-red label", () => {
    const run = cli(...triggersFixture("triggers-production-web-on-main.json"));
    expect(run.status).toBe(1);
    expect(run.stdout).toBe(
      "production · web · triggers on main, declared release\n",
    );
    expect(run.stderr).not.toContain("EXPECTED RED");
  });

  it("withholds the expected-red label when another check failed on the same run", () => {
    const run = cli(
      ...triggersFixture("triggers-production-empty.json"),
      "--fixture-environment",
      "tests/fixtures/railway/environment-drifted.json",
    );
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      "production · web · triggers on none, declared release",
    );
    expect(run.stdout).toContain("numReplicas is 2");
    expect(run.stderr).not.toContain("EXPECTED RED");
  });

  it("keeps the expected-red label when the service check on the same run passed", () => {
    const run = cli(
      ...triggersFixture("triggers-production-empty.json"),
      "--fixture-environment",
      "tests/fixtures/railway/environment-staging.json",
    );
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      "production · web · triggers on none, declared release",
    );
    expect(run.stdout).toContain("match config/railway.json");
    expect(run.stderr).toContain("EXPECTED RED until TASK-104");
  });

  it("refuses a config/deploy-triggers.json the zod schema rejects, before reading any trigger", () => {
    const root = mkdtempSync(join(tmpdir(), "deploy-triggers-"));
    try {
      mkdirSync(join(root, "config"));
      writeFileSync(
        join(root, "config/deploy-triggers.json"),
        JSON.stringify({
          production: { web: "develop", worker: "release" },
          staging: { web: "main", worker: "main" },
        }),
      );
      const run = spawnSync(
        process.execPath,
        [
          resolve(repoRoot, "scripts/railway-check.ts"),
          "--fixture-triggers",
          resolve(repoRoot, "tests/fixtures/railway/triggers-as-declared.json"),
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "test" },
        },
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toBe("");
      expect(run.stderr).toContain("ZodError");
      expect(run.stderr).toContain('"web"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exits 2 naming what is missing when it has neither credentials nor a fixture", () => {
    const run = cli();
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("RAILWAY_API_TOKEN");
    expect(run.stderr).toContain("RAILWAY_PROJECT_ID");
  });
});

/*
 * T-45 (spec 040 §14 A4, AC-44): staging's missing `worker` is an expected red too, until TASK-103
 * creates it. The three stderr lines are AC-44's, copied here as literals rather than imported, so
 * a change to the script's wording turns these cases red. TASK-103's PR deletes case (b) and turns
 * the labelled staging cases below into unlabelled ones.
 */
const LABEL_PRODUCTION =
  "railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` (spec 040 AC-42, T-44): every failure above is a declared production service that does not exist yet. Once production `web` exists, this output is a real failure.\n";
const LABEL_STAGING_WORKER =
  "railway:check: EXPECTED RED until TASK-103 creates staging `worker` (spec 040 AC-44, T-45): every failure above is staging's `worker`, which does not exist yet. Once staging `worker` exists, this output is a real failure.\n";
const LABEL_BOTH =
  "railway:check: EXPECTED RED until TASK-104 creates production `web` on `release` and TASK-103 creates staging `worker` (spec 040 AC-42, AC-44, T-44, T-45): every failure above is a declared production service or staging's `worker`, none of which exists yet. Once both exist, this output is a real failure.\n";
const UNLABELLED =
  "railway:check failed: the lines above name each difference.\n";

describe("staging's missing `worker` is an expected red (AC-44, T-45)", () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/railway-check.ts", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "test" },
    });
  const withTriggers = (name: string, environment?: string) => [
    "--fixture-triggers",
    `tests/fixtures/railway/${name}`,
    ...(environment === undefined
      ? []
      : ["--fixture-environment", `tests/fixtures/railway/${environment}`]),
  ];

  describe("labelled, exit 1, stderr exactly AC-44's line for the cases present", () => {
    it("staging `worker` absent, all else as declared → the `staging · worker` line, line (b)", () => {
      const run = cli(...withTriggers("triggers-staging-no-worker.json"));
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "staging · worker · triggers on none, declared main\n",
      );
      expect(run.stderr).toBe(LABEL_STAGING_WORKER);
    });

    it("staging `worker` absent with a passing service check → still line (b)", () => {
      const run = cli(
        ...withTriggers(
          "triggers-staging-no-worker.json",
          "environment-staging.json",
        ),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toContain(
        "staging · worker · triggers on none, declared main",
      );
      expect(run.stdout).toContain("match config/railway.json");
      expect(run.stderr).toBe(LABEL_STAGING_WORKER);
    });

    it("production `web` absent and staging `worker` absent → both lines, line (a)+(b)", () => {
      const run = cli(
        ...withTriggers("triggers-production-no-web-staging-no-worker.json"),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "production · web · triggers on none, declared release\n" +
          "staging · worker · triggers on none, declared main\n",
      );
      expect(run.stderr).toBe(LABEL_BOTH);
    });

    it("the F1–F3 shape: production empty and staging `worker` absent → the three `none` lines, line (a)+(b)", () => {
      const run = cli(
        ...withTriggers("triggers-production-empty-staging-no-worker.json"),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "production · web · triggers on none, declared release\n" +
          "production · worker · triggers on none, declared release\n" +
          "staging · worker · triggers on none, declared main\n",
      );
      expect(run.stderr).toBe(LABEL_BOTH);
    });

    it("production empty, staging as declared → line (a), unchanged", () => {
      const run = cli(...withTriggers("triggers-production-empty.json"));
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "production · web · triggers on none, declared release\n" +
          "production · worker · triggers on none, declared release\n",
      );
      expect(run.stderr).toBe(LABEL_PRODUCTION);
    });
  });

  describe("unlabelled, exit 1, no EXPECTED RED", () => {
    it("production `web` on `release`, production `worker` absent, staging `worker` absent → the mixed case is a real failure", () => {
      const run = cli(
        ...withTriggers("triggers-production-no-worker-staging-no-worker.json"),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "production · worker · triggers on none, declared release\n" +
          "staging · worker · triggers on none, declared main\n",
      );
      expect(run.stderr).toBe(UNLABELLED);
      expect(run.stderr).not.toContain("EXPECTED RED");
    });

    it("staging `worker` present with its one trigger on `release` → `wrong-branch`", () => {
      const run = cli(
        ...withTriggers("triggers-staging-worker-on-release.json"),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "staging · worker · triggers on release, declared main\n",
      );
      expect(run.stderr).toBe(UNLABELLED);
      expect(run.stderr).not.toContain("EXPECTED RED");
    });

    it("staging `worker` present with a repository and no trigger → `no-trigger`", () => {
      const run = cli(
        ...withTriggers("triggers-staging-worker-no-trigger.json"),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "staging · worker · triggers on none, declared main\n",
      );
      expect(run.stderr).toBe(UNLABELLED);
      expect(run.stderr).not.toContain("EXPECTED RED");
    });

    it("staging `web` absent, `worker` as declared → a real fault", () => {
      const run = cli(...withTriggers("triggers-staging-no-web.json"));
      expect(run.status).toBe(1);
      expect(run.stdout).toBe(
        "staging · web · triggers on none, declared main\n",
      );
      expect(run.stderr).toBe(UNLABELLED);
      expect(run.stderr).not.toContain("EXPECTED RED");
    });

    it("staging `worker` absent while another check failed on the same run → no label", () => {
      const run = cli(
        ...withTriggers(
          "triggers-staging-no-worker.json",
          "environment-drifted.json",
        ),
      );
      expect(run.status).toBe(1);
      expect(run.stdout).toContain(
        "staging · worker · triggers on none, declared main",
      );
      expect(run.stdout).toContain("numReplicas is 2");
      expect(run.stderr).toBe(UNLABELLED);
      expect(run.stderr).not.toContain("EXPECTED RED");
    });
  });

  describe("the report behind the label (`expectedAbsences`)", () => {
    it.each([
      [
        "triggers-production-empty-staging-no-worker.json",
        ["production-services", "staging-worker"],
      ],
      ["triggers-production-no-worker-staging-no-worker.json", []],
      ["triggers-staging-worker-on-release.json", []],
      ["triggers-staging-worker-no-trigger.json", []],
      ["triggers-staging-no-web.json", []],
      ["triggers-as-declared.json", []],
    ])("%s → %j", (name, cases) => {
      expect(checkTriggers(name).expectedAbsences).toEqual(cases);
    });
  });
});
