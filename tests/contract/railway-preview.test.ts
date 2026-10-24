/**
 * `scripts/railway-preview.ts` against recorded Railway and Cloudflare answers (spec 040 AC-12,
 * AC-26, §14 A2; TASK-099).
 *
 * A contract test because the answers are a boundary we do not own: `preview-project-ready.json`
 * is the shape of Railway's `project(id)` answer for a PR environment that is ready, and every
 * other state is derived from it by changing one field, so each case names the one fact that
 * keeps the pull request's browser suites waiting, or failing.
 *
 * The property AC-26 cares most about is the negative one: **the command never reports a URL it
 * has not proven**: no environment, no proxied record, staging's variables, another commit, or a
 * deployment older than its own variables all keep it waiting, and a deployment that cannot
 * become ready fails at once instead of burning fifteen minutes.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CloudflareRecord,
  type PreviewDeps,
  type PreviewProjectResponse,
  PREVIEW_ATTEMPTS,
  PreviewApiError,
  PreviewScopeError,
  PREVIEW_CLOUDFLARE_ENDPOINTS,
  PREVIEW_INTERVAL_MS,
  PREVIEW_PROJECT_QUERY,
  PREVIEW_VARIABLES_QUERY,
  decide,
  isAllowedCloudflareRequest,
  isPreviewEnvironmentName,
  liveDeps,
  main,
  missingCredentials,
  previewProjectResponseSchema,
  previewProperties,
  previewState,
  previewVariables,
  previewVariablesResponseSchema,
  resolvePreview,
  staleRecords,
} from "../../scripts/railway-preview.ts";

const repoRoot = resolve(__dirname, "../..");
const SENTINEL = "SENTINEL-VALUE";
const PR = 263;
const SHA = "abcdef0123456789abcdef0123456789abcdef01";
const HOST = "pr-263.flowersoverseas.com";
const ZONE = "0123abcd";

const recorded = (): PreviewProjectResponse =>
  previewProjectResponseSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(repoRoot, "tests/fixtures/railway/preview-project-ready.json"),
        "utf8",
      ),
    ),
  );

/** The PR environment's `web` node in a (cloned) answer. */
const prWeb = (project: PreviewProjectResponse) => {
  const env = project.data.project.environments.edges[1]?.node;
  const web = env?.serviceInstances.edges[0]?.node;
  if (env === undefined || web === undefined) throw new Error("fixture shape");
  return { env, web };
};

const goodVariables = {
  APP_ENV: "preview",
  NEXT_PUBLIC_APP_ENV: "preview",
  NEXT_PUBLIC_SITE_URL: `https://${HOST}`,
  ENABLE_PSEUDO_LOCALES: "true",
  ENABLE_DEV_UI: "true",
};
const goodRecord: CloudflareRecord = {
  id: "aa11",
  name: HOST,
  type: "CNAME",
  content: "abc123.up.railway.app",
  proxied: true,
};

const decideOn = (
  project: PreviewProjectResponse,
  options: {
    variables?: typeof goodVariables | undefined;
    records?: CloudflareRecord[];
    provision?: boolean;
    variablesWrittenAt?: string;
  } = {},
) => {
  const state = previewState(
    project,
    "variables" in options ? options.variables : goodVariables,
    options.records ?? [goodRecord],
    PR,
  );
  if (typeof state === "string") throw new Error(state);
  return decide(state, {
    pr: PR,
    sha: SHA,
    provision: options.provision ?? false,
    variablesWrittenAt: options.variablesWrittenAt,
  });
};

describe("the recorded answer parses and reads as ready (AC-12, AC-26)", () => {
  it("reports the Cloudflare-proxied host, not a railway.app one", () => {
    expect(decideOn(recorded())).toEqual({
      kind: "ready",
      url: `https://${HOST}`,
    });
  });

  it("rejects an answer without the domains field rather than reading it as no domain", () => {
    const raw = JSON.parse(JSON.stringify(recorded())) as {
      data: {
        project: {
          environments: {
            edges: {
              node: {
                serviceInstances: {
                  edges: { node: Record<string, unknown> }[];
                };
              };
            }[];
          };
        };
      };
    };
    const node =
      raw.data.project.environments.edges[1]?.node.serviceInstances.edges[0]
        ?.node;
    if (node !== undefined) delete node["domains"];
    expect(() => previewProjectResponseSchema.parse(raw)).toThrow();
  });
});

describe("which environment is the pull request's (§5.5)", () => {
  it.each([
    ["flowers-overseas-pr-263", true],
    ["pr-263", true],
    ["flowers-overseas-pr-2630", false],
    ["flowers-overseas-pr-26", false],
    ["staging", false],
    ["pr-263-old", false],
  ])("%s → %s", (name, expected) => {
    expect(isPreviewEnvironmentName(name, PR)).toBe(expected);
  });
});

describe("it waits, never reports, until every fact holds (AC-26)", () => {
  it("waits while Railway has no environment for the PR, naming founder step P1", () => {
    const project = recorded();
    project.data.project.environments.edges.splice(1, 1);
    const step = decideOn(project);
    expect(step.kind).toBe("wait");
    expect(step.kind === "wait" && step.reason).toMatch(/pr-263.*P1/u);
  });

  it("waits while the environment has no `web` service", () => {
    const project = recorded();
    prWeb(project).env.serviceInstances.edges = [];
    expect(decideOn(project).kind).toBe("wait");
  });

  it("creates the custom domain only when provisioning, and waits for it otherwise", () => {
    const project = recorded();
    prWeb(project).web.domains.customDomains = [];
    expect(decideOn(project, { provision: true })).toEqual({
      kind: "create-domain",
    });
    expect(decideOn(project).kind).toBe("wait");
  });

  it("writes the CNAME **proxied** when the zone lacks it", () => {
    expect(decideOn(recorded(), { records: [], provision: true })).toEqual({
      kind: "write-records",
      records: [
        {
          name: HOST,
          type: "CNAME",
          content: "abc123.up.railway.app",
          proxied: true,
        },
      ],
    });
  });

  it("does not accept a DNS-only record: the suites must cross Cloudflare", () => {
    const step = decideOn(recorded(), {
      records: [{ ...goodRecord, proxied: false }],
    });
    expect(step.kind).toBe("wait");
  });

  it("does not accept a record that points at another target", () => {
    const step = decideOn(recorded(), {
      records: [{ ...goodRecord, content: "other.up.railway.app" }],
      provision: true,
    });
    expect(step.kind).toBe("write-records");
  });

  it.each([
    ["APP_ENV", "staging"],
    ["NEXT_PUBLIC_APP_ENV", "staging"],
    ["NEXT_PUBLIC_SITE_URL", "https://staging.flowersoverseas.com"],
    ["ENABLE_PSEUDO_LOCALES", "false"],
    ["ENABLE_DEV_UI", "false"],
  ] as const)(
    "sets the variables when %s is staging's, and waits without provisioning",
    (key, value) => {
      const variables = { ...goodVariables, [key]: value };
      expect(decideOn(recorded(), { variables, provision: true })).toEqual({
        kind: "set-variables",
      });
      const step = decideOn(recorded(), { variables });
      expect(step.kind === "wait" && step.reason).toContain(key);
    },
  );

  it("waits while the latest deployment is of another commit", () => {
    const project = recorded();
    const deployment = prWeb(project).web.latestDeployment;
    if (deployment?.meta) deployment.meta["commitHash"] = "1".repeat(40);
    const step = decideOn(project);
    expect(step.kind === "wait" && step.reason).toContain("not the head");
  });

  it("waits while the deployment predates this run's variable write", () => {
    const step = decideOn(recorded(), {
      variablesWrittenAt: "2026-10-18T20:00:01.000Z",
    });
    expect(step.kind === "wait" && step.reason).toContain("predates");
  });

  it.each(["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED"])(
    "waits while the head's deployment is %s",
    (status) => {
      const project = recorded();
      const deployment = prWeb(project).web.latestDeployment;
      if (deployment) deployment.status = status;
      expect(decideOn(project).kind).toBe("wait");
    },
  );
});

describe("it fails at once on a deployment that cannot become ready (AC-26: fails, never skips)", () => {
  it.each([
    ["FAILED", /build log/u],
    ["CRASHED", /deploy log/u],
    ["WAITING", /Wait for CI.*P3/u],
    ["NEEDS_APPROVAL", /P4/u],
    ["SKIPPED", /P3/u],
  ])("%s → fail", (status, reason) => {
    const project = recorded();
    const deployment = prWeb(project).web.latestDeployment;
    if (deployment) deployment.status = status;
    const step = decideOn(project);
    expect(step.kind).toBe("fail");
    expect(step.kind === "fail" && step.reason).toMatch(reason);
  });
});

/** A fake Railway + Cloudflare pair whose state moves as the command acts on it. */
function world(
  options: {
    noEnvironment?: boolean;
    domainRace?: boolean;
    forbidden?: boolean;
    /** `preview` already provisioned: domain, record and variables in place, head built. */
    preWritten?: boolean;
    /** How many `/api/health` reads still answer from the build made with staging's variables. */
    staleHealth?: number;
    /** Every Railway query throws, as an unreachable API does. */
    railwayDown?: boolean;
    records?: CloudflareRecord[];
  } = {},
) {
  const project = recorded();
  if (options.preWritten === true) {
    // The recorded answer is exactly this state: everything in place, head SHA SUCCESS.
  } else if (options.noEnvironment === true) {
    project.data.project.environments.edges.splice(1, 1);
  } else {
    const { web } = prWeb(project);
    web.domains.customDomains = [];
    if (web.latestDeployment?.meta)
      web.latestDeployment.meta["commitHash"] = "1".repeat(40);
  }
  let variables: Record<string, string> =
    options.preWritten === true
      ? { ...previewVariables(PR), DATABASE_URL: SENTINEL }
      : {
          APP_ENV: "staging",
          NEXT_PUBLIC_APP_ENV: "staging",
          NEXT_PUBLIC_SITE_URL: "https://staging.flowersoverseas.com",
          DATABASE_URL: SENTINEL,
        };
  const records: CloudflareRecord[] =
    options.records ?? (options.preWritten === true ? [goodRecord] : []);
  let staleHealth = options.staleHealth ?? 0;
  const healthReads: string[] = [];
  const calls: string[] = [];
  const logs: string[] = [];
  let clock = Date.parse("2026-10-18T21:00:00.000Z");
  const deps: PreviewDeps = {
    projectId: "project-0000",
    zoneId: ZONE,
    railway: (query, vars) => {
      calls.push(query.split("(")[0] ?? query);
      if (options.railwayDown === true) {
        return Promise.reject(new PreviewApiError("Railway API answered 502"));
      }
      if (query === PREVIEW_PROJECT_QUERY) {
        return Promise.resolve(JSON.parse(JSON.stringify(project)));
      }
      if (query === PREVIEW_VARIABLES_QUERY) {
        return Promise.resolve({ data: { variables } });
      }
      if (query.includes("customDomainCreate")) {
        if (options.forbidden === true) {
          return Promise.reject(
            new PreviewScopeError("Railway API answered 403"),
          );
        }
        if (options.domainRace === true) {
          // The other job created it a moment earlier; Railway refuses the second create.
          options.domainRace = false;
          prWeb(project).web.domains.customDomains.push({
            id: "cd-pr-263",
            domain: HOST,
            status: {
              dnsRecords: [
                {
                  fqdn: HOST,
                  hostlabel: "pr-263",
                  recordType: "DNS_RECORD_TYPE_CNAME",
                  requiredValue: "abc123.up.railway.app",
                },
              ],
            },
          });
          return Promise.reject(new PreviewApiError("Domain already exists"));
        }
        prWeb(project).web.domains.customDomains.push({
          id: "cd-pr-263",
          domain: HOST,
          status: {
            dnsRecords: [
              {
                fqdn: HOST,
                hostlabel: "pr-263",
                recordType: "DNS_RECORD_TYPE_CNAME",
                requiredValue: "abc123.up.railway.app",
              },
            ],
          },
        });
        return Promise.resolve({ data: { customDomainCreate: { id: "cd" } } });
      }
      if (query.includes("variableCollectionUpsert")) {
        const input = (vars["input"] ?? {}) as {
          variables: Record<string, string>;
        };
        variables = { ...variables, ...input.variables };
        // Railway rebuilds the head after a variable change.
        const deployment = prWeb(project).web.latestDeployment;
        if (deployment?.meta) {
          deployment.meta["commitHash"] = SHA;
          deployment.status = "SUCCESS";
          deployment.createdAt = new Date(clock + 60_000).toISOString();
        }
        return Promise.resolve({ data: { variableCollectionUpsert: true } });
      }
      throw new Error(`unexpected query ${query}`);
    },
    cloudflare: (method, path, body) => {
      calls.push(`${method} ${path.replace(/\?.*$/u, "")}`);
      expect(isAllowedCloudflareRequest(method, path)).toBe(true);
      if (method === "GET") {
        return Promise.resolve({ success: true, result: records });
      }
      if (method === "POST") {
        const b = body as Omit<CloudflareRecord, "id">;
        records.push({ id: "bb22", ...b });
        return Promise.resolve({ success: true, result: {} });
      }
      if (method === "DELETE") {
        const id = path.split("/").pop();
        records.splice(
          records.findIndex((record) => record.id === id),
          1,
        );
        return Promise.resolve({ success: true, result: { id } });
      }
      throw new Error(`unexpected ${method}`);
    },
    health: (url) => {
      healthReads.push(url);
      const deployment = prWeb(project).web.latestDeployment;
      const commit = String(deployment?.meta?.["commitHash"] ?? "");
      if (staleHealth > 0) {
        staleHealth -= 1;
        return Promise.resolve({ appEnv: "staging", commit });
      }
      return Promise.resolve({ appEnv: variables["APP_ENV"] ?? "", commit });
    },
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => new Date(clock),
    log: (line) => logs.push(line),
  };
  return {
    deps,
    calls,
    logs,
    records,
    healthReads,
    variables: () => variables,
  };
}

describe("the polling loop (AC-12, AC-26)", () => {
  it("provisions domain, proxied record and variables, then reports only the rebuilt head", async () => {
    const w = world();
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: true, attempts: 10, intervalMs: 1 },
      w.deps,
    );
    expect(result).toEqual({ ok: true, url: `https://${HOST}` });
    expect(w.calls).toContain("mutation PreviewDomain");
    expect(w.calls).toContain(`POST /zones/${ZONE}/dns_records`);
    expect(w.calls).toContain("mutation PreviewVariablesUpsert");
    expect(w.records).toEqual([
      expect.objectContaining({ name: HOST, type: "CNAME", proxied: true }),
    ]);
    expect(w.variables()).toMatchObject(previewVariables(PR));
  });

  it("reads again when the other job provisioned first, instead of failing", async () => {
    const w = world({ domainRace: true });
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: true, attempts: 10, intervalMs: 1 },
      w.deps,
    );
    expect(result).toEqual({ ok: true, url: `https://${HOST}` });
    expect(w.logs.join("\n")).toContain("create-domain was refused");
  });

  it("ends the run on a missing scope: a retry cannot fix a 403", async () => {
    const w = world({ forbidden: true });
    await expect(
      resolvePreview(
        { pr: PR, sha: SHA, provision: true, attempts: 10, intervalMs: 1 },
        w.deps,
      ),
    ).rejects.toThrow(PreviewScopeError);
  });

  it("changes nothing without --provision: only queries and GETs", async () => {
    const w = world();
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: false, attempts: 3, intervalMs: 1 },
      w.deps,
    );
    expect(result.ok).toBe(false);
    expect(
      w.calls.filter(
        (call) =>
          call.startsWith("mutation") || /^(POST|PUT|DELETE) /u.test(call),
      ),
    ).toEqual([]);
  });

  it("gives up after its attempts, naming what was missing, and never prints a variable value", async () => {
    const w = world({ noEnvironment: true });
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: true, attempts: 4, intervalMs: 1 },
      w.deps,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(
      /not ready after 4 attempts.*pr-263.*P1/u,
    );
    expect(w.logs.join("\n")).not.toContain(SENTINEL);
  });

  it("waits 15 minutes in all: 45 attempts 20 s apart (§5.5)", () => {
    expect(PREVIEW_ATTEMPTS * PREVIEW_INTERVAL_MS).toBe(15 * 60 * 1000);
  });
});

describe("the variables answer keeps five names and drops every other value (no value printed)", () => {
  it("parses to the names it sets and nothing else", () => {
    const parsed = previewVariablesResponseSchema.parse({
      data: {
        variables: {
          DATABASE_URL: SENTINEL,
          STAGING_BASIC_AUTH: SENTINEL,
          ...previewVariables(PR),
        },
      },
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "APP_ENV",
      "ENABLE_DEV_UI",
      "ENABLE_PSEUDO_LOCALES",
      "NEXT_PUBLIC_APP_ENV",
      "NEXT_PUBLIC_SITE_URL",
    ]);
    expect(JSON.stringify(parsed)).not.toContain(SENTINEL);
  });
});

describe("the Cloudflare endpoints it may call (spec 040 AC-24's rule)", () => {
  it.each([
    [
      "GET",
      `/zones/${ZONE}/dns_records?name.contains=pr-263.flowersoverseas.com`,
      true,
    ],
    ["POST", `/zones/${ZONE}/dns_records`, true],
    ["PUT", `/zones/${ZONE}/dns_records/aa11`, true],
    ["DELETE", `/zones/${ZONE}/dns_records/aa11`, true],
    ["GET", "/accounts/abc/tokens", false],
    ["POST", "/accounts/abc/workers/scripts", false],
    ["PATCH", `/zones/${ZONE}/settings/ssl`, false],
    ["PUT", `/zones/${ZONE}/rulesets/abc`, false],
    ["DELETE", `/zones/${ZONE}`, false],
    ["PATCH", `/zones/${ZONE}/dns_records/aa11`, false],
  ])("%s %s → %s", (method, path, allowed) => {
    expect(isAllowedCloudflareRequest(method, path)).toBe(allowed);
  });

  it("names no /accounts/ path at all", () => {
    for (const endpoint of PREVIEW_CLOUDFLARE_ENDPOINTS) {
      expect(endpoint.pattern.source).not.toContain("accounts");
    }
  });
});

describe("the nightly sweep (AC-12: closing the PR removes it, DNS included)", () => {
  const record = (name: string, id = "cc33"): CloudflareRecord => ({
    id,
    name,
    type: "CNAME",
    content: "x.up.railway.app",
    proxied: true,
  });

  it("deletes a pr-<n> record whose environment Railway removed, and nothing else", () => {
    const stale = staleRecords(
      [
        record("pr-12.flowersoverseas.com", "1"),
        record("_railway-verify.pr-12.flowersoverseas.com", "2"),
        record("pr-263.flowersoverseas.com", "3"),
        record("staging.flowersoverseas.com", "4"),
        record("flowersoverseas.com", "5"),
        record("pr-12.example.com", "6"),
      ],
      ["staging", "production", "flowers-overseas-pr-263"],
    );
    expect(stale.map((r) => r.id)).toEqual(["1", "2"]);
  });
});

describe("the command line fails, never skips (AC-26)", () => {
  it("lists every missing credential by name", () => {
    expect(
      missingCredentials({ RAILWAY_API_TOKEN: "x", CLOUDFLARE_ZONE_ID: " " }),
    ).toEqual([
      "RAILWAY_PROJECT_ID",
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ZONE_ID",
    ]);
  });

  it("exits 2 naming them, and the founder step that adds them", () => {
    const run = spawnSync(
      process.execPath,
      ["scripts/railway-preview.ts", "--pr", "263", "--sha", SHA],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "test" },
      },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain(
      "missing RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID",
    );
    expect(run.stderr).toContain("P2");
    expect(run.stdout).toBe("");
  });

  it("exits 2 without a PR number or SHA", async () => {
    expect(await main(["--sha", SHA], {})).toBe(2);
    expect(await main(["--pr", "0", "--sha", SHA], {})).toBe(2);
  });
});

describe("the three properties of AC-26 on the resolved URL (`--assert`, spec 040 §14 A2 clause 1)", () => {
  const URL_ = `https://${HOST}`;
  interface Answer {
    status: number;
    headers: Record<string, string>;
    body: string;
  }
  const good = (): Record<string, Answer> => ({
    bare: {
      status: 401,
      headers: {
        "www-authenticate": 'Basic realm="staging"',
        "cf-ray": "8d-AMS",
      },
      body: "",
    },
    health: {
      status: 200,
      headers: { "cf-ray": "8d-AMS" },
      body: JSON.stringify({
        status: "ok",
        commit: SHA,
        appEnv: "preview",
        region: "europe-west4-drams3a",
      }),
    },
    authed: {
      status: 200,
      headers: { "x-robots-tag": "noindex, nofollow", "cf-ray": "8d-AMS" },
      body: `<link rel="canonical" href="${URL_}/en"/>`,
    },
  });
  const fakeFetch =
    (answers: Record<string, Answer>) =>
    (url: string, init: { headers: Record<string, string> }) => {
      const key = url.endsWith("/api/health")
        ? "health"
        : init.headers["authorization"] === undefined
          ? "bare"
          : "authed";
      const answer = answers[key] as Answer;
      return Promise.resolve({
        status: answer.status,
        headers: {
          get: (name: string) => answer.headers[name.toLowerCase()] ?? null,
        },
        text: () => Promise.resolve(answer.body),
      });
    };
  const failing = async (answers: Record<string, Answer>) =>
    (await previewProperties(URL_, SHA, "user:pass", fakeFetch(answers)))
      .filter((r) => !r.ok)
      .map((r) => r.name);

  it("passes all six on a PR host that is walled, Amsterdam, noindex, proxied and its own", async () => {
    expect(await failing(good())).toEqual([]);
  });

  it("sends the credential only on the walled request, as Basic user:password", async () => {
    const seen: Record<string, string>[] = [];
    await previewProperties(URL_, SHA, "user:pass", (url, init) => {
      seen.push(init.headers);
      return fakeFetch(good())(url, init);
    });
    expect(seen.filter((h) => h["authorization"] !== undefined)).toEqual([
      { authorization: `Basic ${Buffer.from("user:pass").toString("base64")}` },
    ]);
  });

  it.each<[string, (a: Record<string, Answer>) => void, string]>([
    [
      "an SSO-style 302",
      (a) => {
        (a["bare"] as Answer).status = 302;
      },
      "auth wall",
    ],
    [
      "a 401 with no Basic challenge",
      (a) => {
        (a["bare"] as Answer).headers = { "cf-ray": "x" };
      },
      "auth wall",
    ],
    [
      "no cf-ray (the railway.app host)",
      (a) => {
        delete (a["bare"] as Answer).headers["cf-ray"];
      },
      "edge",
    ],
    [
      "a region outside Amsterdam",
      (a) => {
        (a["health"] as Answer).body = (a["health"] as Answer).body.replace(
          "europe-west4-drams3a",
          "us-west2",
        );
      },
      "region",
    ],
    [
      "an x-fo-region header that disagrees",
      (a) => {
        (a["health"] as Answer).headers["x-fo-region"] = "us-east4";
      },
      "region",
    ],
    [
      "health 500",
      (a) => {
        (a["health"] as Answer).status = 500;
      },
      "region",
    ],
    [
      "appEnv staging",
      (a) => {
        (a["health"] as Answer).body = (a["health"] as Answer).body.replace(
          '"preview"',
          '"staging"',
        );
      },
      "build",
    ],
    [
      "another commit",
      (a) => {
        (a["health"] as Answer).body = (a["health"] as Answer).body.replace(
          SHA,
          "1".repeat(40),
        );
      },
      "build",
    ],
    [
      "no X-Robots-Tag",
      (a) => {
        (a["authed"] as Answer).headers = { "cf-ray": "x" };
      },
      "noindex",
    ],
    [
      "the credential refused",
      (a) => {
        (a["authed"] as Answer).status = 401;
      },
      "noindex",
    ],
    [
      "staging's origin in the page",
      (a) => {
        (a["authed"] as Answer).body =
          '<link rel="canonical" href="https://staging.flowersoverseas.com/en"/>';
      },
      "own origin",
    ],
  ])("fails on %s, naming that property", async (_, mutate, name) => {
    const answers = good();
    mutate(answers);
    expect(await failing(answers)).toContain(name);
  });

  it("exits 2 without the wall's credential instead of skipping the noindex read", async () => {
    expect(
      await main(
        ["--assert", "--pr", String(PR), "--sha", SHA],
        {},
        undefined,
        fakeFetch(good()),
      ),
    ).toBe(2);
  });

  it("exits 0 when all hold and 1 when one does not", async () => {
    const env = { STAGING_BASIC_AUTH: "user:pass" };
    const args = ["--assert", "--pr", String(PR), "--sha", SHA];
    expect(await main(args, env, undefined, fakeFetch(good()))).toBe(0);
    const answers = good();
    (answers["bare"] as Answer).status = 200;
    expect(await main(args, env, undefined, fakeFetch(answers))).toBe(1);
  });
});

describe("ready means served: the preview build, not the one made with staging's variables (/break 263 hole 6)", () => {
  it("waits while the host still serves the earlier build, even though Railway lists the head as SUCCESS", async () => {
    const w = world({ preWritten: true, staleHealth: 2 });
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: false, attempts: 10, intervalMs: 1 },
      w.deps,
    );
    expect(result).toEqual({ ok: true, url: `https://${HOST}` });
    expect(w.healthReads).toEqual([
      `https://${HOST}`,
      `https://${HOST}`,
      `https://${HOST}`,
    ]);
    expect(w.logs.join("\n").toLowerCase()).toContain(
      `still serves appenv staging at ${SHA}, not the preview build`,
    );
  });

  it("never reports a host that keeps serving the earlier build", async () => {
    const w = world({ preWritten: true, staleHealth: 99 });
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: false, attempts: 5, intervalMs: 1 },
      w.deps,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(
      "still serves appEnv staging",
    );
  });

  it("waits while the host serves another commit, or does not answer", async () => {
    const w = world({ preWritten: true });
    let reads = 0;
    const deps: PreviewDeps = {
      ...w.deps,
      health: () => {
        reads += 1;
        if (reads === 1) return Promise.resolve(undefined);
        if (reads === 2) return Promise.reject(new Error("ENOTFOUND"));
        if (reads === 3)
          return Promise.resolve({ appEnv: "preview", commit: "1".repeat(40) });
        return Promise.resolve({
          appEnv: "preview",
          commit: SHA.toUpperCase(),
        });
      },
    };
    const result = await resolvePreview(
      { pr: PR, sha: SHA, provision: false, attempts: 10, intervalMs: 1 },
      deps,
    );
    expect(result.ok).toBe(true);
    expect(reads).toBe(4);
  });
});

describe("main(), the command the jobs run (/break 263 hole 1)", () => {
  const quiet = () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  };
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const ENV = {
    RAILWAY_API_TOKEN: "t",
    RAILWAY_PROJECT_ID: "p",
    CLOUDFLARE_API_TOKEN: "t",
    CLOUDFLARE_ZONE_ID: ZONE,
  };

  it("exits 1 when no environment appears in the 15 minutes: fails, never skips (AC-26)", async () => {
    quiet();
    const w = world({ noEnvironment: true });
    expect(
      await main(["--provision", "--pr", "263", "--sha", SHA], ENV, w.deps),
    ).toBe(1);
    // All 45 attempts were made, 20 s apart on the injected clock.
    expect(
      w.calls.filter((call) => call === "query PreviewEnvironments").length,
    ).toBe(45);
  });

  it("exits 3 when an API refuses", async () => {
    quiet();
    const w = world({ railwayDown: true });
    expect(
      await main(["--provision", "--pr", "263", "--sha", SHA], ENV, w.deps),
    ).toBe(3);
  });

  it("writes preview_url to $GITHUB_OUTPUT and the URL to stdout on success", async () => {
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const dir = mkdtempSync(join(tmpdir(), "fo-gh-output-"));
    try {
      const output = join(dir, "output");
      writeFileSync(output, "");
      const w = world();
      expect(
        await main(
          ["--provision", "--pr", "263", "--sha", SHA],
          { ...ENV, GITHUB_OUTPUT: output },
          w.deps,
        ),
      ).toBe(0);
      expect(readFileSync(output, "utf8")).toBe(
        `preview_url=https://${HOST}\n`,
      );
      expect(out).toHaveBeenCalledWith(`https://${HOST}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("provisions only with --provision: without it, the same state times out having written nothing", async () => {
    quiet();
    const withFlag = world();
    expect(
      await main(
        ["--provision", "--pr", "263", "--sha", SHA],
        ENV,
        withFlag.deps,
      ),
    ).toBe(0);
    expect(withFlag.calls).toContain("mutation PreviewVariablesUpsert");
    const withoutFlag = world();
    expect(
      await main(["--pr", "263", "--sha", SHA], ENV, withoutFlag.deps),
    ).toBe(1);
    expect(
      withoutFlag.calls.filter(
        (call) =>
          call.startsWith("mutation") || /^(POST|PUT|DELETE) /u.test(call),
      ),
    ).toEqual([]);
  });

  it.each([["abc"], ["0"], ["-1"], ["263x"], [""]])(
    "exits 2 for --pr %j even with every credential present, and calls nothing",
    async (pr) => {
      quiet();
      const w = world();
      expect(
        await main(["--provision", "--pr", pr, "--sha", SHA], ENV, w.deps),
      ).toBe(2);
      expect(w.calls).toEqual([]);
    },
  );

  it("--sweep deletes the records of removed environments, and only those", async () => {
    quiet();
    const stale: CloudflareRecord = {
      ...goodRecord,
      id: "dd44",
      name: "pr-12.flowersoverseas.com",
    };
    const w = world({ preWritten: true, records: [stale, goodRecord] });
    expect(await main(["--sweep"], ENV, w.deps)).toBe(0);
    expect(w.calls.filter((call) => call.startsWith("DELETE"))).toEqual([
      `DELETE /zones/${ZONE}/dns_records/dd44`,
    ]);
    expect(w.records).toEqual([goodRecord]);
  });
});

describe("the live clients, over recorded HTTP (/break 263 hole 2)", () => {
  interface Sent {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | undefined;
  }
  const recorder = (answer: (url: string) => Response) => {
    const sent: Sent[] = [];
    const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      sent.push({
        url,
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return Promise.resolve(answer(url));
    }) as typeof fetch;
    return { sent, fetchImpl };
  };
  const ENV = {
    RAILWAY_API_TOKEN: "railway-token",
    RAILWAY_PROJECT_ID: "project-0000",
    CLOUDFLARE_API_TOKEN: "cloudflare-token",
    CLOUDFLARE_ZONE_ID: ZONE,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  it.each([401, 403])(
    "a Railway %i ends the run at once: one request, never a 15-minute retry",
    async (status) => {
      const { sent, fetchImpl } = recorder(() => json({}, status));
      const deps = {
        ...liveDeps(ENV, fetchImpl),
        sleep: () => Promise.resolve(),
      };
      await expect(
        resolvePreview(
          { pr: PR, sha: SHA, provision: true, attempts: 45, intervalMs: 1 },
          deps,
        ),
      ).rejects.toBeInstanceOf(PreviewScopeError);
      expect(sent.length).toBe(1);
    },
  );

  it("a Railway 500 is an API error, not a scope error", async () => {
    const { fetchImpl } = recorder(() => json({}, 500));
    const error = await liveDeps(ENV, fetchImpl)
      .railway("query X", {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreviewApiError);
    expect(error).not.toBeInstanceOf(PreviewScopeError);
  });

  it("GraphQL `errors` in a 200 refuse the request, naming the message", async () => {
    const { fetchImpl } = recorder(() =>
      json({ errors: [{ message: "Domain already exists" }] }),
    );
    await expect(
      liveDeps(ENV, fetchImpl).railway("mutation X", {}),
    ).rejects.toThrow("Railway API refused the request: Domain already exists");
  });

  it("sends the Railway token as a bearer header to the GraphQL endpoint", async () => {
    const { sent, fetchImpl } = recorder(() => json({ data: {} }));
    await liveDeps(ENV, fetchImpl).railway("query X", { a: 1 });
    expect(sent).toEqual([
      {
        url: "https://backboard.railway.com/graphql/v2",
        method: "POST",
        headers: {
          authorization: "Bearer railway-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: "query X", variables: { a: 1 } }),
      },
    ]);
  });

  it.each([
    ["GET", "/accounts/abc/tokens"],
    ["PATCH", `/zones/${ZONE}/dns_records/aa11`],
    ["PUT", `/zones/${ZONE}/settings/ssl`],
    ["DELETE", `/zones/${ZONE}`],
  ] as const)(
    "refuses Cloudflare %s %s before any request leaves",
    async (method, path) => {
      const { sent, fetchImpl } = recorder(() =>
        json({ success: true, result: [] }),
      );
      await expect(
        liveDeps(ENV, fetchImpl).cloudflare(method as "GET", path),
      ).rejects.toThrow("is not on PREVIEW_CLOUDFLARE_ENDPOINTS");
      expect(sent).toEqual([]);
    },
  );

  it("sends an allow-listed Cloudflare request with the zone token", async () => {
    const { sent, fetchImpl } = recorder(() =>
      json({ success: true, result: [] }),
    );
    await liveDeps(ENV, fetchImpl).cloudflare(
      "POST",
      `/zones/${ZONE}/dns_records`,
      { a: 1 },
    );
    expect(sent).toEqual([
      {
        url: `https://api.cloudflare.com/client/v4/zones/${ZONE}/dns_records`,
        method: "POST",
        headers: {
          authorization: "Bearer cloudflare-token",
          "content-type": "application/json",
        },
        body: '{"a":1}',
      },
    ]);
  });

  it("a Cloudflare 403 is a scope error, named as the missing DNS Edit", async () => {
    const { fetchImpl } = recorder(() => json({}, 403));
    const error = await liveDeps(ENV, fetchImpl)
      .cloudflare("GET", `/zones/${ZONE}/dns_records?name.contains=x`)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreviewScopeError);
    expect(String(error)).toContain("DNS Edit");
  });

  it("reads the served build from /api/health, and nothing from a 401 or a non-JSON body", async () => {
    const body = {
      status: "ok",
      commit: SHA,
      appEnv: "preview",
      region: "europe-west4",
    };
    expect(
      await liveDeps(ENV, recorder(() => json(body)).fetchImpl).health(
        `https://${HOST}`,
      ),
    ).toEqual({
      appEnv: "preview",
      commit: SHA,
    });
    expect(
      await liveDeps(ENV, recorder(() => json(body, 401)).fetchImpl).health(
        `https://${HOST}`,
      ),
    ).toBeUndefined();
    expect(
      await liveDeps(
        ENV,
        recorder(() => new Response("<html>")).fetchImpl,
      ).health(`https://${HOST}`),
    ).toBeUndefined();
  });
});

describe("a crowded project: the exact environment, service and domain are picked (/break 263 hole 8)", () => {
  const crowded = (): PreviewProjectResponse =>
    previewProjectResponseSchema.parse(
      JSON.parse(
        readFileSync(
          resolve(
            repoRoot,
            "tests/fixtures/railway/preview-project-crowded.json",
          ),
          "utf8",
        ),
      ),
    );

  it("reads as ready despite a decoy xpr-263 environment, a worker listed first and a second domain", () => {
    expect(decideOn(crowded())).toEqual({
      kind: "ready",
      url: `https://${HOST}`,
    });
  });

  it("writes the PR host's record, not the other domain's", () => {
    expect(decideOn(crowded(), { records: [], provision: true })).toEqual({
      kind: "write-records",
      records: [
        {
          name: HOST,
          type: "CNAME",
          content: "abc123.up.railway.app",
          proxied: true,
        },
      ],
    });
  });

  it.each(["flowers-overseas-xpr-263", "xpr-263", "pr-2633"])(
    "%s is not the PR's environment",
    (name) => {
      expect(isPreviewEnvironmentName(name, PR)).toBe(false);
    },
  );
});

describe("the 401 wall means 401 (/review 263 item 2)", () => {
  const answer = (
    status: number,
    headers: Record<string, string>,
    body = "",
  ) => ({
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body),
  });
  const health = JSON.stringify({
    status: "ok",
    commit: SHA,
    appEnv: "preview",
    region: "europe-west4-x",
  });
  const pageBody = (text: string) =>
    `<link rel="canonical" href="${text}/en"/>`;

  it.each([403, 500, 200])(
    "a %i with a Basic challenge fails the auth-wall property",
    async (status) => {
      const results = await previewProperties(
        `https://${HOST}`,
        SHA,
        "u:p",
        (url, init) =>
          Promise.resolve(
            url.endsWith("/api/health")
              ? answer(200, { "cf-ray": "x" }, health)
              : init.headers["authorization"] === undefined
                ? answer(status, {
                    "www-authenticate": 'Basic realm="staging"',
                    "cf-ray": "x",
                  })
                : answer(
                    200,
                    { "x-robots-tag": "noindex", "cf-ray": "x" },
                    pageBody(`https://${HOST}`),
                  ),
          ),
      );
      expect(results.find((r) => r.name === "auth wall")?.ok).toBe(false);
      expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
        "auth wall",
      ]);
    },
  );

  it("fails own origin when the page names both the PR host and staging's", async () => {
    const results = await previewProperties(
      `https://${HOST}`,
      SHA,
      "u:p",
      (url, init) =>
        Promise.resolve(
          url.endsWith("/api/health")
            ? answer(200, { "cf-ray": "x" }, health)
            : init.headers["authorization"] === undefined
              ? answer(401, { "www-authenticate": "Basic", "cf-ray": "x" })
              : answer(
                  200,
                  { "x-robots-tag": "noindex", "cf-ray": "x" },
                  pageBody(`https://${HOST}`) +
                    pageBody("https://staging.flowersoverseas.com"),
                ),
        ),
    );
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "own origin",
    ]);
  });

  it("names the region property, rather than throwing, when a 200 health body is not JSON", async () => {
    const results = await previewProperties(
      `https://${HOST}`,
      SHA,
      "u:p",
      (url, init) =>
        Promise.resolve(
          url.endsWith("/api/health")
            ? answer(200, { "cf-ray": "x" }, "<html>")
            : init.headers["authorization"] === undefined
              ? answer(401, { "www-authenticate": "Basic", "cf-ray": "x" })
              : answer(
                  200,
                  { "x-robots-tag": "noindex", "cf-ray": "x" },
                  pageBody(`https://${HOST}`),
                ),
        ),
    );
    expect(results.filter((r) => !r.ok).map((r) => r.name)).toEqual([
      "region",
      "build",
    ]);
  });
});
