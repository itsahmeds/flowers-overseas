/**
 * `node scripts/railway-preview.ts` — the Railway PR environment behind Cloudflare, resolved for
 * CI (spec 040 §5.5 "`preview` job", AC-12, AC-26, §14 A2; TASK-099).
 *
 * Railway forks an environment from `staging` for every pull request (the project's PR
 * environments setting, founder step P1 of `docs/runbooks/railway-cloudflare-setup.md` "PR
 * environments") and deletes it when the pull request closes. Railway gives it a variable set
 * copied from staging, so on its own it would build as `APP_ENV=staging` with staging's
 * `NEXT_PUBLIC_SITE_URL`, and it would answer only on a `*.up.railway.app` host that Cloudflare
 * never sees. This command closes both gaps and then waits:
 *
 *  1. finds the environment whose name ends in `pr-<number>` (Railway prefixes the project name);
 *  2. **provision** (`--provision`, the `preview` job only): gives its `web` service the custom
 *     domain `pr-<number>.flowersoverseas.com`, writes the DNS records Railway asks for into the
 *     Cloudflare zone (the CNAME **proxied**, so every request crosses the same edge production
 *     does), and sets `APP_ENV=preview`, `NEXT_PUBLIC_APP_ENV=preview` and
 *     `NEXT_PUBLIC_SITE_URL=https://pr-<number>.flowersoverseas.com` on the environment (with
 *     the two preview-only switches, `previewVariables`), which makes Railway rebuild it with its
 *     own origin baked in (spec 040 §14 A1);
 *  3. waits until the environment's latest `web` deployment is of the pull request's head SHA,
 *     made after any variable change of this run, and `SUCCESS`;
 *  4. prints `https://pr-<number>.flowersoverseas.com` on stdout (and to `$GITHUB_OUTPUT` as
 *     `preview_url` when that file is set).
 *
 * Without `--provision` (the `lighthouse` job) it changes nothing and only waits for the same
 * state, so two jobs never race to create one domain.
 *
 * **It fails; it never skips** (AC-26). A missing credential exits 2 naming it. No environment,
 * no `SUCCESS` deployment of the head SHA, or no proxied record within 45 × 20 s (15 minutes)
 * exits 1 naming what was still missing. A deployment of the head SHA that `FAILED` or `CRASHED`,
 * one Railway is holding for "Wait for CI" (`WAITING`: it would wait for this very job, so the two
 * would deadlock until the timeout), or one that needs approval exits 1 at once, naming the
 * founder step that clears it.
 *
 * `--sweep` (the nightly `cloudflare-check` job) deletes the zone's `pr-<n>` records whose
 * environment Railway has already removed, so no proxied name is left pointing at a Railway
 * target nobody owns.
 *
 * Credentials, from the environment only: `RAILWAY_API_TOKEN`, `RAILWAY_PROJECT_ID`,
 * `CLOUDFLARE_API_TOKEN` (the zone token of spec 040 AC-24: its DNS Edit scope is the one used
 * here), `CLOUDFLARE_ZONE_ID`. Nothing this command prints carries a variable value or a token:
 * the variables query is parsed into `PREVIEW_VARIABLE_KEYS` and nothing else is kept.
 *
 * Exit codes: 0 ready (or swept) · 1 not ready in time, or a deployment that cannot become ready ·
 * 2 a missing credential or argument · 3 an API refused a request or the request was not
 * allow-listed.
 *
 * @purpose Railway PR environment for CI: provision the proxied host, wait for the head SHA
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { RAILWAY_API_URL } from "../src/lib/railway.ts";

/** The zone every PR host lives under: one label below the apex, so Universal SSL covers it. */
export const PREVIEW_ZONE = "flowersoverseas.com";

/** 45 × 20 s: the 15 minutes AC-26 allows, the budget the Vercel wait had (§5.5). */
export const PREVIEW_ATTEMPTS = 45;
export const PREVIEW_INTERVAL_MS = 20_000;

/** The values `--provision` writes; nothing else in the environment is touched. */
export const PREVIEW_APP_ENV = "preview";

export const WEB_SERVICE = "web";

/** `pr-<n>.flowersoverseas.com`. */
export function previewHost(pr: number): string {
  return `pr-${String(pr)}.${PREVIEW_ZONE}`;
}

export function previewUrl(pr: number): string {
  return `https://${previewHost(pr)}`;
}

/**
 * The variables a PR environment must carry instead of staging's (AC-12): its own environment
 * name and origin, and the two switches `.env.example` says are `true` "on previews (where the
 * visual and a11y suites run)" and that the schema refuses on staging, which the environment was
 * forked from: the `pseudo-rtl` visual project and `/dev/components` need them.
 */
export function previewVariables(pr: number): Readonly<Record<string, string>> {
  return {
    APP_ENV: PREVIEW_APP_ENV,
    NEXT_PUBLIC_APP_ENV: PREVIEW_APP_ENV,
    NEXT_PUBLIC_SITE_URL: previewUrl(pr),
    ENABLE_PSEUDO_LOCALES: "true",
    ENABLE_DEV_UI: "true",
  };
}

/** The names `previewVariables` sets: the only variables this command ever reads back. */
export const PREVIEW_VARIABLE_KEYS = [
  "APP_ENV",
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_SITE_URL",
  "ENABLE_PSEUDO_LOCALES",
  "ENABLE_DEV_UI",
] as const;

/**
 * Railway names a PR environment `<project>-pr-<n>`. The match is anchored on the number, so
 * `pr-12` never matches `pr-123`, and the bare `pr-<n>` of §5.5 matches too.
 */
export function isPreviewEnvironmentName(name: string, pr: number): boolean {
  return new RegExp(`(^|-)pr-${String(pr)}$`, "u").test(name);
}

/** A `pr-<n>` record of the zone, or a verification record Railway asked for beside it. */
export function previewRecordNumber(name: string): number | undefined {
  const match = /^(?:_[a-z0-9-]+\.)?pr-(\d+)\.flowersoverseas\.com$/u.exec(
    name,
  );
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

// ---------------------------------------------------------------------------------------------
// Railway's answers (zod at the boundary)
// ---------------------------------------------------------------------------------------------

const dnsRecordSchema = z.object({
  fqdn: z.string().nullable().optional(),
  hostlabel: z.string().nullable().optional(),
  recordType: z.string(),
  requiredValue: z.string(),
});

const customDomainSchema = z.object({
  id: z.string(),
  domain: z.string(),
  status: z
    .object({ dnsRecords: z.array(dnsRecordSchema) })
    .nullable()
    .optional(),
});

const deploymentSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.string(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

const instanceSchema = z.object({
  serviceId: z.string(),
  serviceName: z.string(),
  latestDeployment: deploymentSchema.nullable().optional(),
  domains: z.object({ customDomains: z.array(customDomainSchema) }),
});

export const previewProjectResponseSchema = z.object({
  data: z.object({
    project: z.object({
      id: z.string(),
      environments: z.object({
        edges: z.array(
          z.object({
            node: z.object({
              id: z.string(),
              name: z.string(),
              serviceInstances: z.object({
                edges: z.array(z.object({ node: instanceSchema })),
              }),
            }),
          }),
        ),
      }),
    }),
  }),
});
export type PreviewProjectResponse = z.infer<
  typeof previewProjectResponseSchema
>;

/** Only `PREVIEW_VARIABLE_KEYS`; every other value is dropped at the boundary and can never be printed. */
export const previewVariablesResponseSchema = z
  .object({ data: z.object({ variables: z.record(z.string(), z.unknown()) }) })
  .transform(({ data }) => {
    const picked: Partial<
      Record<(typeof PREVIEW_VARIABLE_KEYS)[number], string>
    > = {};
    for (const key of PREVIEW_VARIABLE_KEYS) {
      const value = data.variables[key];
      if (typeof value === "string") picked[key] = value;
    }
    return picked;
  });
export type PreviewVariables = z.output<typeof previewVariablesResponseSchema>;

const cloudflareRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  content: z.string(),
  proxied: z.boolean().optional(),
});
export type CloudflareRecord = z.infer<typeof cloudflareRecordSchema>;

export const cloudflareRecordsResponseSchema = z.object({
  success: z.literal(true),
  result: z.array(cloudflareRecordSchema),
});

// ---------------------------------------------------------------------------------------------
// The decision, pure
// ---------------------------------------------------------------------------------------------

/** One DNS record Railway requires for the custom domain, in Cloudflare's terms. */
export interface RequiredRecord {
  readonly name: string;
  readonly type: "CNAME" | "TXT";
  readonly content: string;
  /** CNAMEs are proxied (the whole point); a TXT record cannot be. */
  readonly proxied: boolean;
}

export interface PreviewState {
  readonly environment:
    | {
        readonly id: string;
        readonly name: string;
        readonly web:
          | {
              readonly serviceId: string;
              readonly deployment:
                | {
                    readonly id: string;
                    readonly status: string;
                    readonly createdAt: string;
                    readonly commit: string | undefined;
                  }
                | undefined;
              /** `undefined` when the service has no custom domain for the PR host yet. */
              readonly required: readonly RequiredRecord[] | undefined;
            }
          | undefined;
      }
    | undefined;
  readonly variables: PreviewVariables | undefined;
  /** The zone's records named for this PR (the host and any verification name). */
  readonly records: readonly CloudflareRecord[];
}

export type PreviewStep =
  | { readonly kind: "wait"; readonly reason: string }
  | { readonly kind: "create-domain" }
  | { readonly kind: "write-records"; readonly records: RequiredRecord[] }
  | { readonly kind: "set-variables" }
  | { readonly kind: "fail"; readonly reason: string }
  | { readonly kind: "ready"; readonly url: string };

/** Railway's `recordType` enum (`DNS_RECORD_TYPE_CNAME`, …) or a bare type, as Cloudflare's. */
function cloudflareType(recordType: string): "CNAME" | "TXT" | undefined {
  const upper = recordType.toUpperCase();
  if (upper.endsWith("CNAME")) return "CNAME";
  if (upper.endsWith("TXT")) return "TXT";
  return undefined;
}

/** Railway's required records for the PR host, or a reason they cannot be used. */
export function requiredRecords(
  domain: z.infer<typeof customDomainSchema>,
): RequiredRecord[] | string {
  const records = domain.status?.dnsRecords ?? [];
  const out: RequiredRecord[] = [];
  for (const record of records) {
    const type = cloudflareType(record.recordType);
    if (type === undefined) {
      return `Railway asks for a ${record.recordType} record for ${domain.domain}, which this command does not write`;
    }
    const name =
      record.fqdn !== undefined && record.fqdn !== null && record.fqdn !== ""
        ? record.fqdn
        : record.hostlabel !== undefined &&
            record.hostlabel !== null &&
            record.hostlabel !== "" &&
            record.hostlabel !== "@"
          ? `${record.hostlabel}.${PREVIEW_ZONE}`
          : domain.domain;
    out.push({
      name: name.replace(/\.$/u, ""),
      type,
      content: record.requiredValue,
      proxied: type === "CNAME",
    });
  }
  return out;
}

/** Read the parts of Railway's answer this command decides on. */
export function previewState(
  project: PreviewProjectResponse,
  variables: PreviewVariables | undefined,
  records: readonly CloudflareRecord[],
  pr: number,
): PreviewState | string {
  const environment = project.data.project.environments.edges
    .map((edge) => edge.node)
    .find((node) => isPreviewEnvironmentName(node.name, pr));
  if (environment === undefined) {
    return { environment: undefined, variables, records };
  }
  const instance = environment.serviceInstances.edges
    .map((edge) => edge.node)
    .find((node) => node.serviceName === WEB_SERVICE);
  if (instance === undefined) {
    return {
      environment: {
        id: environment.id,
        name: environment.name,
        web: undefined,
      },
      variables,
      records,
    };
  }
  const domain = instance.domains.customDomains.find(
    (candidate) => candidate.domain === previewHost(pr),
  );
  const required = domain === undefined ? undefined : requiredRecords(domain);
  if (typeof required === "string") return required;
  const deployment = instance.latestDeployment ?? undefined;
  const commit = deployment?.meta?.["commitHash"];
  return {
    environment: {
      id: environment.id,
      name: environment.name,
      web: {
        serviceId: instance.serviceId,
        deployment:
          deployment === undefined
            ? undefined
            : {
                id: deployment.id,
                status: deployment.status,
                createdAt: deployment.createdAt,
                commit:
                  typeof commit === "string" ? commit.toLowerCase() : undefined,
              },
        required,
      },
    },
    variables,
    records,
  };
}

/** Statuses after which the deployment of this SHA will never become `SUCCESS` on its own. */
const TERMINAL: Readonly<Record<string, string>> = {
  FAILED:
    "failed to build or deploy: read its build log in Railway; the pull request has to fix it",
  CRASHED: "crashed after starting: read its deploy log in Railway",
  WAITING:
    "is held by Railway's “Wait for CI”, which would wait for this very job: turn it off for PR environments (founder step P3 of docs/runbooks/railway-cloudflare-setup.md “PR environments”)",
  NEEDS_APPROVAL:
    "needs approval in Railway before it deploys (founder step P4 of docs/runbooks/railway-cloudflare-setup.md “PR environments”)",
  SKIPPED:
    "was skipped by Railway (a skipped deploy is what “Wait for CI” does after a red check): founder step P3 of docs/runbooks/railway-cloudflare-setup.md “PR environments”",
};

export interface DecideOptions {
  readonly pr: number;
  readonly sha: string;
  readonly provision: boolean;
  /** ISO time of this run's variable write, if it made one: older deployments do not count. */
  readonly variablesWrittenAt: string | undefined;
}

/**
 * What to do next, given what Railway and Cloudflare say now. Order matters: the domain before
 * its records (Railway names the target only once the domain exists), the records before the
 * variables (a rebuild that finishes before its host resolves would be measured nowhere), and the
 * deployment last.
 */
export function decide(
  state: PreviewState,
  options: DecideOptions,
): PreviewStep {
  const host = previewHost(options.pr);
  const { environment } = state;
  if (environment === undefined) {
    return {
      kind: "wait",
      reason: `no Railway environment named …pr-${String(options.pr)} yet (PR environments on, base staging: founder step P1)`,
    };
  }
  const { web } = environment;
  if (web === undefined) {
    return {
      kind: "wait",
      reason: `environment ${environment.name} has no \`${WEB_SERVICE}\` service yet`,
    };
  }
  if (web.required === undefined) {
    return options.provision
      ? { kind: "create-domain" }
      : {
          kind: "wait",
          reason: `${host} is not yet a custom domain of ${environment.name}'s \`${WEB_SERVICE}\` (the preview job adds it)`,
        };
  }
  if (web.required.length === 0) {
    return {
      kind: "wait",
      reason: `Railway has not yet named the DNS target for ${host}`,
    };
  }
  const missing = web.required.filter(
    (wanted) =>
      !state.records.some(
        (live) =>
          live.name === wanted.name &&
          live.type === wanted.type &&
          live.content === wanted.content &&
          (live.proxied ?? false) === wanted.proxied,
      ),
  );
  if (missing.length > 0) {
    return options.provision
      ? { kind: "write-records", records: missing }
      : {
          kind: "wait",
          reason: `the zone does not yet carry ${missing.map((r) => `${r.type} ${r.name}`).join(", ")} (the preview job writes it)`,
        };
  }
  const wanted = previewVariables(options.pr);
  const variables = state.variables;
  const wrong = Object.keys(wanted).filter(
    (key) => variables?.[key as keyof PreviewVariables] !== wanted[key],
  );
  if (wrong.length > 0) {
    return options.provision
      ? { kind: "set-variables" }
      : {
          kind: "wait",
          reason: `${environment.name} does not yet carry its own ${wrong.join(", ")} (the preview job sets them)`,
        };
  }
  const deployment = web.deployment;
  if (deployment === undefined) {
    return {
      kind: "wait",
      reason: `${environment.name} has no deployment yet`,
    };
  }
  const sha = options.sha.toLowerCase();
  if (deployment.commit !== sha) {
    return {
      kind: "wait",
      reason: `${environment.name}'s latest deployment is of ${deployment.commit ?? "an unnamed commit"}, not the head ${sha}`,
    };
  }
  if (
    options.variablesWrittenAt !== undefined &&
    Date.parse(deployment.createdAt) < Date.parse(options.variablesWrittenAt)
  ) {
    return {
      kind: "wait",
      reason: `${environment.name}'s latest deployment predates its own variables; waiting for the rebuild`,
    };
  }
  const terminal = TERMINAL[deployment.status];
  if (terminal !== undefined) {
    return {
      kind: "fail",
      reason: `deployment ${deployment.id} of ${sha} in ${environment.name} ${terminal}`,
    };
  }
  if (deployment.status !== "SUCCESS") {
    return {
      kind: "wait",
      reason: `deployment ${deployment.id} of ${sha} is ${deployment.status}`,
    };
  }
  return { kind: "ready", url: previewUrl(options.pr) };
}

// ---------------------------------------------------------------------------------------------
// The APIs, behind two narrow clients
// ---------------------------------------------------------------------------------------------

export class PreviewApiError extends Error {
  override name = "PreviewApiError";
}

export type RailwayCall = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;

export type CloudflareCall = (
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<unknown>;

/**
 * Every Cloudflare request this command may make (spec 040 AC-24's rule, applied here): DNS
 * records of the one zone, nothing under `/accounts/`, no settings, no rules. A request that
 * matches none of these is refused before it leaves the process.
 */
export const PREVIEW_CLOUDFLARE_ENDPOINTS: readonly {
  readonly method: "GET" | "POST" | "PUT" | "DELETE";
  readonly pattern: RegExp;
}[] = [
  { method: "GET", pattern: /^\/zones\/[a-f0-9]+\/dns_records\?[^/]*$/u },
  { method: "POST", pattern: /^\/zones\/[a-f0-9]+\/dns_records$/u },
  { method: "PUT", pattern: /^\/zones\/[a-f0-9]+\/dns_records\/[a-f0-9]+$/u },
  {
    method: "DELETE",
    pattern: /^\/zones\/[a-f0-9]+\/dns_records\/[a-f0-9]+$/u,
  },
];

export function isAllowedCloudflareRequest(
  method: string,
  path: string,
): boolean {
  return PREVIEW_CLOUDFLARE_ENDPOINTS.some(
    (endpoint) => endpoint.method === method && endpoint.pattern.test(path),
  );
}

export const PREVIEW_PROJECT_QUERY = `query PreviewEnvironments($projectId: String!) {
  project(id: $projectId) {
    id
    environments {
      edges {
        node {
          id
          name
          serviceInstances {
            edges {
              node {
                serviceId
                serviceName
                latestDeployment { id status createdAt meta }
                domains { customDomains { id domain status { dnsRecords { fqdn hostlabel recordType requiredValue } } } }
              }
            }
          }
        }
      }
    }
  }
}`;

export const PREVIEW_VARIABLES_QUERY = `query PreviewVariables($projectId: String!, $environmentId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId)
}`;

export const CUSTOM_DOMAIN_CREATE = `mutation PreviewDomain($input: CustomDomainCreateInput!) {
  customDomainCreate(input: $input) { id domain }
}`;

/** Shared variables (no `serviceId`): the set `railway:check --env` reads, `worker` included. */
export const VARIABLES_UPSERT = `mutation PreviewVariablesUpsert($input: VariableCollectionUpsertInput!) {
  variableCollectionUpsert(input: $input)
}`;

export interface PreviewDeps {
  readonly railway: RailwayCall;
  readonly cloudflare: CloudflareCall;
  readonly projectId: string;
  readonly zoneId: string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

async function readState(
  deps: PreviewDeps,
  pr: number,
): Promise<PreviewState | string> {
  const project = previewProjectResponseSchema.parse(
    await deps.railway(PREVIEW_PROJECT_QUERY, { projectId: deps.projectId }),
  );
  const environment = project.data.project.environments.edges
    .map((edge) => edge.node)
    .find((node) => isPreviewEnvironmentName(node.name, pr));
  const variables =
    environment === undefined
      ? undefined
      : previewVariablesResponseSchema.parse(
          await deps.railway(PREVIEW_VARIABLES_QUERY, {
            projectId: deps.projectId,
            environmentId: environment.id,
          }),
        );
  const records = await listRecords(deps, pr);
  return previewState(project, variables, records, pr);
}

async function listRecords(
  deps: PreviewDeps,
  pr: number | undefined,
): Promise<CloudflareRecord[]> {
  const query =
    pr === undefined
      ? `name.endswith=.${PREVIEW_ZONE}&per_page=1000`
      : `name.contains=pr-${String(pr)}.${PREVIEW_ZONE}&per_page=100`;
  const answer = cloudflareRecordsResponseSchema.parse(
    await deps.cloudflare("GET", `/zones/${deps.zoneId}/dns_records?${query}`),
  );
  return pr === undefined
    ? answer.result
    : answer.result.filter((record) => previewRecordNumber(record.name) === pr);
}

/** Write each missing record: update the one of that name and type, else create it. */
async function writeRecords(
  deps: PreviewDeps,
  state: PreviewState,
  records: readonly RequiredRecord[],
  pr: number,
): Promise<void> {
  for (const record of records) {
    const body = {
      type: record.type,
      name: record.name,
      content: record.content,
      proxied: record.proxied,
      ttl: 1,
      comment: `Railway PR environment for pull request #${String(pr)} (spec 040 AC-12; removed by the nightly sweep once the environment is gone)`,
    };
    const existing = state.records.find(
      (live) => live.name === record.name && live.type === record.type,
    );
    if (existing === undefined) {
      await deps.cloudflare("POST", `/zones/${deps.zoneId}/dns_records`, body);
      deps.log(`railway-preview: created ${record.type} ${record.name}`);
    } else {
      await deps.cloudflare(
        "PUT",
        `/zones/${deps.zoneId}/dns_records/${existing.id}`,
        body,
      );
      deps.log(`railway-preview: updated ${record.type} ${record.name}`);
    }
  }
}

export interface ResolveOptions {
  readonly pr: number;
  readonly sha: string;
  readonly provision: boolean;
  readonly attempts: number;
  readonly intervalMs: number;
}

export type ResolveResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

/** The polling loop: one decision per attempt, acted on, until ready, failed or out of time. */
export async function resolvePreview(
  options: ResolveOptions,
  deps: PreviewDeps,
): Promise<ResolveResult> {
  let variablesWrittenAt: string | undefined;
  let lastReason = "nothing was read";
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const state = await readState(deps, options.pr);
    if (typeof state === "string") return { ok: false, reason: state };
    const step = decide(state, {
      pr: options.pr,
      sha: options.sha,
      provision: options.provision,
      variablesWrittenAt,
    });
    switch (step.kind) {
      case "ready":
        return { ok: true, url: step.url };
      case "fail":
        return { ok: false, reason: step.reason };
      case "create-domain": {
        const environment = state.environment;
        const web = environment?.web;
        if (environment === undefined || web === undefined) break;
        await deps.railway(CUSTOM_DOMAIN_CREATE, {
          input: {
            domain: previewHost(options.pr),
            environmentId: environment.id,
            projectId: deps.projectId,
            serviceId: web.serviceId,
          },
        });
        deps.log(
          `railway-preview: added ${previewHost(options.pr)} to ${environment.name} \`${WEB_SERVICE}\``,
        );
        continue;
      }
      case "write-records":
        await writeRecords(deps, state, step.records, options.pr);
        continue;
      case "set-variables": {
        const environment = state.environment;
        if (environment === undefined) break;
        variablesWrittenAt = deps.now().toISOString();
        await deps.railway(VARIABLES_UPSERT, {
          input: {
            projectId: deps.projectId,
            environmentId: environment.id,
            variables: previewVariables(options.pr),
          },
        });
        deps.log(
          `railway-preview: set ${Object.keys(previewVariables(options.pr)).join(", ")} on ${environment.name} (names only; Railway rebuilds it)`,
        );
        continue;
      }
      case "wait":
        lastReason = step.reason;
        break;
    }
    deps.log(
      `railway-preview: attempt ${String(attempt)}/${String(options.attempts)}: ${lastReason}`,
    );
    if (attempt < options.attempts) await deps.sleep(options.intervalMs);
  }
  return {
    ok: false,
    reason: `not ready after ${String(options.attempts)} attempts ${String(options.intervalMs / 1000)} s apart: ${lastReason}`,
  };
}

/** Records of `pr-<n>` hosts whose environment Railway no longer lists. Pure. */
export function staleRecords(
  records: readonly CloudflareRecord[],
  environmentNames: readonly string[],
): CloudflareRecord[] {
  return records.filter((record) => {
    const pr = previewRecordNumber(record.name);
    return (
      pr !== undefined &&
      !environmentNames.some((name) => isPreviewEnvironmentName(name, pr))
    );
  });
}

export async function sweep(deps: PreviewDeps): Promise<number> {
  const project = previewProjectResponseSchema.parse(
    await deps.railway(PREVIEW_PROJECT_QUERY, { projectId: deps.projectId }),
  );
  const names = project.data.project.environments.edges.map(
    (edge) => edge.node.name,
  );
  const stale = staleRecords(await listRecords(deps, undefined), names);
  for (const record of stale) {
    await deps.cloudflare(
      "DELETE",
      `/zones/${deps.zoneId}/dns_records/${record.id}`,
    );
    deps.log(
      `railway-preview: deleted ${record.type} ${record.name} (its environment is gone)`,
    );
  }
  deps.log(`railway-preview: sweep removed ${String(stale.length)} record(s)`);
  return stale.length;
}

// ---------------------------------------------------------------------------------------------
// The three properties of AC-26, asserted on the resolved URL (`--assert`)
// ---------------------------------------------------------------------------------------------

/** The Amsterdam region Railway reports for the replica (`config/railway.json`'s region). */
export const AMSTERDAM_REGION_PREFIX = "europe-west4";

export interface PropertyResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export type FetchLike = (
  url: string,
  init: {
    readonly headers: Record<string, string>;
    readonly redirect: "manual";
  },
) => Promise<{
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

const healthSchema = z.object({
  status: z.string(),
  commit: z.string(),
  appEnv: z.string(),
  region: z.string(),
});

/**
 * AC-26's three properties in their Railway form (spec 040 §14 A2 clause 1), plus the two facts
 * that make them about *this* pull request: the request crossed Cloudflare, and the deployment
 * answering is the head SHA built as `preview` with its own origin.
 *
 *  1. **auth wall**: `/en` without a credential → 401 with a `Basic` challenge (not an SSO 302);
 *  2. **region**: `/api/health` (exempt from the wall) reports a region in `europe-west4`, and an
 *     `x-fo-region` header, when the response carries one, agrees with it;
 *  3. **noindex**: `/en` with the credential → 200 and `X-Robots-Tag: noindex`;
 *  4. **edge**: the response carries `cf-ray`, so the URL the suites get is Cloudflare's;
 *  5. **build**: `/api/health` says `appEnv` `preview` and `commit` the head SHA, and `/en`
 *     names the PR host and not staging's (its own `NEXT_PUBLIC_SITE_URL`, AC-12).
 */
export async function previewProperties(
  url: string,
  sha: string,
  credential: string,
  fetchFn: FetchLike,
): Promise<PropertyResult[]> {
  const results: PropertyResult[] = [];
  const authorization = `Basic ${Buffer.from(credential).toString("base64")}`;

  const bare = await fetchFn(`${url}/en`, { headers: {}, redirect: "manual" });
  const challenge = bare.headers.get("www-authenticate") ?? "";
  results.push({
    name: "auth wall",
    ok: bare.status === 401 && /^basic\b/iu.test(challenge),
    detail: `GET /en without a credential → ${String(bare.status)}, WWW-Authenticate ${challenge === "" ? "absent" : `\`${challenge.split(" ")[0] ?? ""}\``}`,
  });
  results.push({
    name: "edge",
    ok: (bare.headers.get("cf-ray") ?? "") !== "",
    detail: `cf-ray ${bare.headers.get("cf-ray") === null ? "absent: the URL does not cross Cloudflare" : "present"}`,
  });

  const healthResponse = await fetchFn(`${url}/api/health`, {
    headers: {},
    redirect: "manual",
  });
  const parsed = healthSchema.safeParse(
    healthResponse.status === 200
      ? (JSON.parse(await healthResponse.text()) as unknown)
      : undefined,
  );
  const health = parsed.success ? parsed.data : undefined;
  const header = healthResponse.headers.get("x-fo-region");
  const regionOk =
    health !== undefined &&
    health.region.startsWith(AMSTERDAM_REGION_PREFIX) &&
    (header === null || header.startsWith(AMSTERDAM_REGION_PREFIX));
  results.push({
    name: "region",
    ok: regionOk,
    detail:
      health === undefined
        ? `GET /api/health → ${String(healthResponse.status)}, no health body`
        : `region ${health.region}; x-fo-region ${header ?? "absent"}`,
  });
  results.push({
    name: "build",
    ok:
      health !== undefined &&
      health.appEnv === PREVIEW_APP_ENV &&
      health.commit.toLowerCase() === sha.toLowerCase(),
    detail:
      health === undefined
        ? "no health body"
        : `appEnv ${health.appEnv}, commit ${health.commit}`,
  });

  const authed = await fetchFn(`${url}/en`, {
    headers: { authorization },
    redirect: "manual",
  });
  const robots = authed.headers.get("x-robots-tag") ?? "";
  results.push({
    name: "noindex",
    ok: authed.status === 200 && /\bnoindex\b/u.test(robots),
    detail: `GET /en with the credential → ${String(authed.status)}, X-Robots-Tag ${robots === "" ? "absent" : robots}`,
  });
  const body = authed.status === 200 ? await authed.text() : "";
  results.push({
    name: "own origin",
    ok:
      body.includes(`${url}/`) && !body.includes("staging.flowersoverseas.com"),
    detail: body.includes(`${url}/`)
      ? body.includes("staging.flowersoverseas.com")
        ? "the page still names staging's origin"
        : `the page names ${url}`
      : `the page does not name ${url}: NEXT_PUBLIC_SITE_URL is not the PR host`,
  });
  return results;
}

// ---------------------------------------------------------------------------------------------
// The command line
// ---------------------------------------------------------------------------------------------

export const PREVIEW_CREDENTIALS = [
  "RAILWAY_API_TOKEN",
  "RAILWAY_PROJECT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
] as const;

/** The credentials that are absent or blank, in a stable order. */
export function missingCredentials(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return PREVIEW_CREDENTIALS.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });
}

export interface CliArgs {
  readonly pr: number | undefined;
  readonly sha: string | undefined;
  readonly provision: boolean;
  readonly sweep: boolean;
  readonly assert: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const pr = value("--pr");
  return {
    pr: pr !== undefined && /^[1-9]\d*$/u.test(pr) ? Number(pr) : undefined,
    sha: value("--sha"),
    provision: argv.includes("--provision"),
    sweep: argv.includes("--sweep"),
    assert: argv.includes("--assert"),
  };
}

function liveDeps(
  env: Readonly<Record<string, string | undefined>>,
): PreviewDeps {
  const railwayToken = env["RAILWAY_API_TOKEN"] ?? "";
  const cloudflareToken = env["CLOUDFLARE_API_TOKEN"] ?? "";
  return {
    projectId: env["RAILWAY_PROJECT_ID"] ?? "",
    zoneId: env["CLOUDFLARE_ZONE_ID"] ?? "",
    async railway(query, variables) {
      const response = await fetch(RAILWAY_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${railwayToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) {
        throw new PreviewApiError(
          `Railway API answered ${String(response.status)} (no body is printed: it can carry variable values)`,
        );
      }
      const json = (await response.json()) as {
        errors?: { message?: string }[];
      };
      if (Array.isArray(json.errors) && json.errors.length > 0) {
        throw new PreviewApiError(
          `Railway API refused the request: ${json.errors.map((error) => error.message ?? "unnamed error").join("; ")}`,
        );
      }
      return json;
    },
    async cloudflare(method, path, body) {
      if (!isAllowedCloudflareRequest(method, path)) {
        throw new PreviewApiError(
          `${method} ${path.replace(/\?.*$/u, "")} is not on PREVIEW_CLOUDFLARE_ENDPOINTS`,
        );
      }
      const response = await fetch(
        `https://api.cloudflare.com/client/v4${path}`,
        {
          method,
          headers: {
            authorization: `Bearer ${cloudflareToken}`,
            "content-type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      if (response.status === 403) {
        throw new PreviewApiError(
          `Cloudflare answered 403 to ${method} ${path.replace(/\?.*$/u, "")}: the zone token lacks DNS Edit (spec 040 AC-24)`,
        );
      }
      if (!response.ok) {
        throw new PreviewApiError(
          `Cloudflare answered ${String(response.status)} to ${method} ${path.replace(/\?.*$/u, "")}`,
        );
      }
      return response.json();
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    now: () => new Date(),
    log: (line) => process.stderr.write(`${line}\n`),
  };
}

/** `--assert`: AC-26's properties on the PR host, one line each; exit 1 when any is false. */
export async function assertMain(
  pr: number,
  sha: string,
  env: Readonly<Record<string, string | undefined>>,
  fetchFn: FetchLike,
): Promise<number> {
  const credential = env["STAGING_BASIC_AUTH"] ?? "";
  if (credential.trim() === "") {
    process.stderr.write(
      "railway-preview --assert: missing STAGING_BASIC_AUTH: the noindex property is read behind the wall, and this check fails rather than skips (spec 040 AC-26). Founder step P2 of docs/runbooks/railway-cloudflare-setup.md “PR environments” adds it as a repository secret.\n",
    );
    return 2;
  }
  const results = await previewProperties(
    previewUrl(pr),
    sha,
    credential,
    fetchFn,
  );
  for (const result of results) {
    process.stdout.write(
      `${result.ok ? "ok  " : "FAIL"} ${result.name}: ${result.detail}\n`,
    );
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

const nodeFetch: FetchLike = (url, init) => fetch(url, init);

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  deps: PreviewDeps | undefined = undefined,
  fetchFn: FetchLike = nodeFetch,
): Promise<number> {
  const args = parseArgs(argv);
  if (!args.sweep && (args.pr === undefined || args.sha === undefined)) {
    process.stderr.write(
      "railway-preview: needs --pr <number> and --sha <head sha> (or --sweep)\n",
    );
    return 2;
  }
  if (args.assert) {
    return assertMain(args.pr ?? 0, args.sha ?? "", env, fetchFn);
  }
  const missing = deps === undefined ? missingCredentials(env) : [];
  if (missing.length > 0) {
    process.stderr.write(
      `railway-preview: missing ${missing.join(", ")}: a PR environment cannot be resolved without them, and this check fails rather than skips (spec 040 AC-26). Founder step P2 of docs/runbooks/railway-cloudflare-setup.md “PR environments” adds them as repository secrets.\n`,
    );
    return 2;
  }
  const live = deps ?? liveDeps(env);
  try {
    if (args.sweep) {
      await sweep(live);
      return 0;
    }
    const result = await resolvePreview(
      {
        pr: args.pr ?? 0,
        sha: args.sha ?? "",
        provision: args.provision,
        attempts: PREVIEW_ATTEMPTS,
        intervalMs: PREVIEW_INTERVAL_MS,
      },
      live,
    );
    if (!result.ok) {
      process.stderr.write(`railway-preview: ${result.reason}\n`);
      return 1;
    }
    process.stdout.write(`${result.url}\n`);
    const output = env["GITHUB_OUTPUT"];
    if (output !== undefined && output !== "") {
      appendFileSync(output, `preview_url=${result.url}\n`);
    }
    return 0;
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? `an API answer did not have the expected shape: ${error.issues.map((issue) => issue.path.join(".")).join(", ")}`
        : error instanceof Error
          ? error.message
          : "unknown error";
    process.stderr.write(`railway-preview: ${message}\n`);
    return 3;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exitCode = await main(process.argv.slice(2));
}
