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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
  } = {},
) {
  const project = recorded();
  if (options.noEnvironment === true) {
    project.data.project.environments.edges.splice(1, 1);
  } else {
    const { web } = prWeb(project);
    web.domains.customDomains = [];
    if (web.latestDeployment?.meta)
      web.latestDeployment.meta["commitHash"] = "1".repeat(40);
  }
  let variables: Record<string, string> = {
    APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging",
    NEXT_PUBLIC_SITE_URL: "https://staging.flowersoverseas.com",
    DATABASE_URL: SENTINEL,
  };
  const records: CloudflareRecord[] = [];
  const calls: string[] = [];
  const logs: string[] = [];
  let clock = Date.parse("2026-10-18T21:00:00.000Z");
  const deps: PreviewDeps = {
    projectId: "project-0000",
    zoneId: ZONE,
    railway: (query, vars) => {
      calls.push(query.split("(")[0] ?? query);
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
      throw new Error(`unexpected ${method}`);
    },
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    now: () => new Date(clock),
    log: (line) => logs.push(line),
  };
  return { deps, calls, logs, records, variables: () => variables };
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
