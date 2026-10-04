/**
 * The Cloudflare edge as code: DNS records, cache rules, the `www` → apex redirect, the rate limit
 * and the response-header rules (spec 040 §5.4, §12, AC-14, AC-16, AC-21; TASK-101).
 *
 * `config/cloudflare/edge.json` is the declared state. `pnpm cloudflare:check` (and
 * `cloudflare:apply`, through `apply-zone-settings.ts`) uses this module in two ways:
 *
 *  - **The lint** ({@link lintEdge}) runs on every invocation, token or not. It is where the
 *    rules that make the edge safe for ranking are kept: no Cache Everything (no edge-TTL
 *    override, origin `Cache-Control` respected), the bypass covering every locale prefix of the
 *    registry, the bypass last in its phase, caching only on the production host (staging is
 *    behind a basic-auth wall a shared cache would leak), no cookie or header in the cache key,
 *    one rate-limit rule on `/api/` only, a `www` → apex 301, no rule that reads the visitor's
 *    country (ADR-0006), no rule that sets a cookie or a `Vary`.
 *  - **The live diff** ({@link checkEdge}) reads the zone's DNS records and the four rulesets
 *    through a GET-only client and compares them with the declaration. Every difference is one
 *    line naming the founder step of `docs/runbooks/railway-cloudflare-setup.md` that fixes it:
 *    the token holds no rules scope (spec 040 §14 A5), so nothing here writes.
 *
 * Two states the live diff understands, so the required `cloudflare-check` job is honest today:
 *
 *  - `cutover.state: "pending"`: records and rules with `stage: "cutover"` are TASK-104's. Until
 *    it flips the state to `done`, their live state is printed as `pending cutover` and does not
 *    fail. After it, a GoDaddy parking or builder record at the apex or `www` fails, naming it.
 *  - A phase whose read scope the spec keeps out of the token answers 403: it is printed as
 *    `unverified`, naming the scope and the gate that checks it instead (the e2e suite against
 *    `staging.` and the founder's look in the dashboard). A 403 on a scope the token is meant to
 *    hold (DNS) is still an error, exit 3, as in TASK-100.
 */
import { z } from "zod";

import {
  LAUNCH_LOCALE_DATA,
  PSEUDO_LOCALE_DATA,
} from "../../src/config/locales.data.ts";
import {
  type AllowedEndpoint,
  CloudflareApiError,
  EndpointNotAllowedError,
  type Json,
  MissingScopeError,
  type Transport,
  canonical,
  matchEndpoint,
  validateAllowList,
} from "../../src/lib/cloudflare-zone.ts";

/** Path of the declaration, relative to the repository root. */
export const EDGE_PATH = "config/cloudflare/edge.json";

/** The runbook section every drift line points at. */
export const FOUNDER_SECTION =
  "docs/runbooks/railway-cloudflare-setup.md, section Founder steps in the Cloudflare and Railway dashboards";

/**
 * The five scopes of the runbook's token, exactly (spec 040 AC-24 as amended by §14 A5). A 403 on
 * an endpoint needing one of them is an error; a 403 on any other scope is `unverified`.
 */
export const TOKEN_SCOPES: readonly string[] = [
  "Zone → Zone Settings → Edit",
  "Zone → DNS → Edit",
  "Zone → Cache Purge → Purge",
  "Zone → Zone → Read",
  "Zone → Bot Management → Read",
];

/** A Railway custom-domain target: Railway shows it when the domain is added (e.g. `g05ns7.up.railway.app`). */
export const RAILWAY_TARGET = /^[a-z0-9-]+\.up\.railway\.app$/;

/** Fields and headers that read the visitor's location. Any of them in a rule breaks ADR-0006. */
export const GEO_FIELD =
  /ip\.(?:src|geoip)\.(?:country|continent|region|region_code|subdivision_\d_iso_code|city|lat|lon|postal_code|metro_code|timezone\.name|is_in_european_union)|ip\.geoip\.|cf-ipcountry|cf\.ip_country/i;

const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const prose = z.string().min(1);
const host = z.string().regex(/^[a-z0-9.-]+$/);
const stage = z.enum(["now", "cutover"]);
const founderStep = z.string().regex(/^[EC]\d+$/);

const recordSchema = z.strictObject({
  name: host,
  type: z.literal("CNAME"),
  target: z.literal("railway"),
  proxied: z.literal(true),
  stage,
  founderStep,
  reason: prose,
});
export type DeclaredRecord = z.infer<typeof recordSchema>;

const keepSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9._-]+$/),
  type: z.enum(["TXT", "MX", "CNAME"]),
  reason: prose,
});

const ruleSchema = z.strictObject({
  description: z.string().regex(/^fo: [a-z ]+$/),
  stage,
  founderStep,
  reason: prose,
  expression: prose,
  action: z.enum(["set_cache_settings", "redirect", "block"]),
  action_parameters: z.record(z.string(), jsonSchema).optional(),
  ratelimit: z.record(z.string(), jsonSchema).optional(),
});
export type DeclaredRule = z.infer<typeof ruleSchema>;

export const PHASES = [
  "http_request_cache_settings",
  "http_request_dynamic_redirect",
  "http_ratelimit",
  "http_response_headers_transform",
] as const;
export type Phase = (typeof PHASES)[number];

const phaseSchema = z.strictObject({
  phase: z.enum(PHASES),
  scope: prose,
  rules: z.array(ruleSchema),
});

/** The whole of `config/cloudflare/edge.json`. */
export const edgeSchema = z.strictObject({
  $comment: z.string().optional(),
  zone: host,
  hosts: z.strictObject({
    production: host,
    www: host,
    staging: host,
    foreign: z.array(host),
    reason: prose,
  }),
  cutover: z.strictObject({
    state: z.enum(["pending", "done"]),
    owner: z.string().regex(/^TASK-\d+$/),
    reason: prose,
  }),
  dns: z.strictObject({
    records: z.array(recordSchema).min(1),
    keep: z.array(keepSchema),
  }),
  bypass: z.strictObject({
    paths: z.array(z.string().regex(/^\/[a-z]+\/?$/)).min(1),
    reason: prose,
  }),
  phases: z.array(phaseSchema).length(PHASES.length),
});
export type EdgeDeclaration = z.infer<typeof edgeSchema>;

/** Every locale URL prefix the app can serve: the launch locales and the two pseudo-locales. */
export function localePrefixes(): readonly string[] {
  return [...LAUNCH_LOCALE_DATA, ...PSEUDO_LOCALE_DATA].map(
    (locale) => locale.code,
  );
}

/** One `starts_with` clause per path, bare and under each locale prefix, in that order. */
export function bypassClauses(
  paths: readonly string[],
  locales: readonly string[],
): string[] {
  const prefixes = ["", ...locales.map((code) => `/${code}`)];
  return prefixes.flatMap((prefix) =>
    paths.map(
      (path) => `starts_with(http.request.uri.path, "${prefix}${path}")`,
    ),
  );
}

/** The bypass rule's expression, exactly as the declaration must carry it. */
export function bypassExpression(
  paths: readonly string[],
  locales: readonly string[],
): string {
  return `(${bypassClauses(paths, locales).join(" or ")})`;
}

/** The expression of a cache rule that may make a document eligible for cache. */
export function documentCacheExpression(productionHost: string): string {
  return `(http.host eq "${productionHost}")`;
}

/** The one rate-limit expression the Free plan can express for `/api/*` (path field only). */
export const RATE_LIMIT_EXPRESSION =
  '(starts_with(http.request.uri.path, "/api/"))';

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

/** Why a cache rule is unsafe, or `undefined`: the checks shared by the lint and the live diff. */
export function cacheRuleHazards(parameters: unknown): string[] {
  const hazards: string[] = [];
  if (at(parameters, "edge_ttl", "mode") === "override_origin") {
    hazards.push(
      "Cache Everything: the edge TTL overrides the origin's Cache-Control, so a no-store page would be cached",
    );
  }
  if (at(parameters, "origin_cache_control") === false) {
    hazards.push(
      "origin Cache-Control ignored: a no-store page would be cached",
    );
  }
  if (at(parameters, "cache_key", "custom_key", "cookie") !== undefined) {
    hazards.push(
      "a cookie in the cache key: a cached response would vary by cookie",
    );
  }
  if (at(parameters, "cache_key", "custom_key", "header") !== undefined) {
    hazards.push(
      "a request header in the cache key: a cached response would vary by header",
    );
  }
  return hazards;
}

/** Why a response-header rule is unsafe: it sets a cookie or a `Vary` on a cacheable response. */
export function headerRuleHazards(parameters: unknown): string[] {
  const headers = at(parameters, "headers");
  if (!isRecord(headers)) return [];
  return Object.keys(headers)
    .filter((name) => ["set-cookie", "vary"].includes(name.toLowerCase()))
    .map(
      (name) =>
        `sets ${name}: no cached response may carry a cookie or a Vary (spec 007 AC-23)`,
    );
}

function phaseOf(edge: EdgeDeclaration, phase: Phase): readonly DeclaredRule[] {
  return edge.phases.find((entry) => entry.phase === phase)?.rules ?? [];
}

/**
 * Lint the declaration (AC-14, AC-16, AC-21, ADR-0006). Returns one problem per line; empty means
 * the file is safe to apply. Runs without a token, on every `cloudflare:check`.
 */
export function lintEdge(
  edge: EdgeDeclaration,
  locales: readonly string[] = localePrefixes(),
): string[] {
  const problems: string[] = [];
  const { hosts } = edge;

  if (edge.phases.map((entry) => entry.phase).join() !== PHASES.join()) {
    problems.push(`phases must be, in order: ${PHASES.join(", ")}`);
  }

  // DNS (AC-14)
  const names = edge.dns.records.map((record) => record.name);
  for (const [name, wanted] of [
    [hosts.production, "cutover"],
    [hosts.www, "cutover"],
    [hosts.staging, "now"],
  ] as const) {
    const record = edge.dns.records.find((entry) => entry.name === name);
    if (record === undefined) {
      problems.push(`dns ${name} is not declared`);
    } else if (record.stage !== wanted) {
      problems.push(`dns ${name} must have stage ${wanted}`);
    }
  }
  if (new Set(names).size !== names.length) {
    problems.push("a dns name is declared twice");
  }
  if (!edge.dns.keep.some((entry) => entry.name === `_dmarc.${edge.zone}`)) {
    problems.push(`dns _dmarc.${edge.zone} TXT must be kept (spec 040 §5.4)`);
  }

  // Every rule: unique names, no geolocation (ADR-0006).
  const all = edge.phases.flatMap((entry) => entry.rules);
  const descriptions = all.map((rule) => rule.description);
  if (new Set(descriptions).size !== descriptions.length) {
    problems.push("a rule description is used twice");
  }
  for (const rule of all) {
    if (
      GEO_FIELD.test(
        `${rule.expression} ${canonical(rule.action_parameters ?? null)}`,
      )
    ) {
      problems.push(
        `rule "${rule.description}" reads the visitor's location: no IP redirects, ever (ADR-0006)`,
      );
    }
  }

  // Cache rules (AC-16).
  const cache = phaseOf(edge, "http_request_cache_settings");
  const expected = bypassExpression(edge.bypass.paths, locales);
  const bypassIndex = cache.findIndex(
    (rule) => at(rule.action_parameters, "cache") === false,
  );
  const bypass = cache[bypassIndex];
  if (bypass === undefined) {
    problems.push(
      "no cache rule bypasses the dynamic paths (spec 040 §5.4 rule 1)",
    );
  } else {
    if (bypass.stage !== "now") {
      problems.push(`rule "${bypass.description}" must have stage now`);
    }
    if (squash(bypass.expression) !== expected) {
      const have = new Set(
        squash(bypass.expression)
          .replace(/^\(|\)$/g, "")
          .split(" or "),
      );
      const missing = bypassClauses(edge.bypass.paths, locales).filter(
        (clause) => !have.has(clause),
      );
      problems.push(
        missing.length > 0
          ? `rule "${bypass.description}" does not bypass ${missing.map((clause) => clause.replace(/^.*"(.*)"\)$/, "$1")).join(", ")}: every path, bare and under every locale prefix`
          : `rule "${bypass.description}" expression differs from the one built from the locale registry and bypass.paths`,
      );
    }
    if (bypassIndex !== cache.length - 1) {
      problems.push(
        `rule "${bypass.description}" must be the last cache rule: a later cache rule wins over an earlier one`,
      );
    }
  }
  for (const rule of cache) {
    for (const hazard of cacheRuleHazards(rule.action_parameters)) {
      problems.push(`rule "${rule.description}": ${hazard}`);
    }
    if (at(rule.action_parameters, "cache") === true) {
      if (at(rule.action_parameters, "edge_ttl", "mode") !== "respect_origin") {
        problems.push(
          `rule "${rule.description}": a rule that makes a page eligible for cache must take its edge TTL from the origin (edge_ttl.mode respect_origin)`,
        );
      }
      if (
        squash(rule.expression) !== documentCacheExpression(hosts.production)
      ) {
        problems.push(
          `rule "${rule.description}": only the production host may be cached; ${hosts.staging} and PR hosts are behind a basic-auth wall a shared cache would leak`,
        );
      }
    }
  }

  // The redirect (AC-14).
  const redirects = phaseOf(edge, "http_request_dynamic_redirect");
  const www = redirects[0];
  if (
    redirects.length !== 1 ||
    www === undefined ||
    squash(www.expression) !== `(http.host eq "${hosts.www}")` ||
    at(www.action_parameters, "from_value", "status_code") !== 301 ||
    at(www.action_parameters, "from_value", "preserve_query_string") !== true ||
    at(www.action_parameters, "from_value", "target_url", "expression") !==
      `concat("https://${hosts.production}", http.request.uri.path)`
  ) {
    problems.push(
      `exactly one redirect rule: ${hosts.www} → https://${hosts.production} with the path, 301, query kept (plan/02 §7)`,
    );
  }

  // The rate limit (AC-21).
  const limits = phaseOf(edge, "http_ratelimit");
  const limit = limits[0];
  if (
    limits.length !== 1 ||
    limit === undefined ||
    squash(limit.expression) !== RATE_LIMIT_EXPRESSION
  ) {
    problems.push(
      `exactly one rate-limit rule, on ${RATE_LIMIT_EXPRESSION} only: documents must never be counted (AC-21)`,
    );
  }

  // Response headers: nothing sets a cookie or a Vary.
  for (const rule of phaseOf(edge, "http_response_headers_transform")) {
    for (const hazard of headerRuleHazards(rule.action_parameters)) {
      problems.push(`rule "${rule.description}": ${hazard}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The GET-only client

/**
 * Every endpoint the edge check may call: GETs only, under the one zone. Pinned by
 * `tests/contract/cloudflare-edge-check.test.ts`. The DNS read uses the token's DNS Edit scope;
 * the four ruleset reads need scopes spec 040 §14 A5 keeps out of the token, so today they answer
 * 403 and their phases are reported `unverified`.
 */
export const EDGE_ENDPOINTS: readonly AllowedEndpoint[] = [
  {
    method: "GET",
    pattern: "/zones/{zone_id}/dns_records",
    scope: "Zone → DNS → Edit",
  },
  ...PHASES.map((phase): AllowedEndpoint => ({
    method: "GET",
    pattern: `/zones/{zone_id}/rulesets/phases/${phase}/entrypoint`,
    scope: {
      http_request_cache_settings: "Zone → Cache Rules → Read",
      http_request_dynamic_redirect: "Zone → Single Redirect → Read",
      http_ratelimit: "Zone → Zone WAF → Read",
      http_response_headers_transform: "Zone → Transform Rules → Read",
    }[phase],
  })),
];
validateAllowList(EDGE_ENDPOINTS);

const envelopeSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(z.object({ code: z.number(), message: z.string() }))
    .default([]),
  result: z.unknown(),
  result_info: z.object({ total_count: z.number().int() }).loose().optional(),
});

/** A GET through the edge allow-list. `undefined` when `missingIsEmpty` and the API answered 404. */
export async function edgeGet(
  transport: Transport,
  zoneId: string,
  path: string,
  missingIsEmpty = false,
): Promise<z.infer<typeof envelopeSchema> | undefined> {
  const label = `GET ${path.replace(`/zones/${zoneId}`, "/zones/{zone_id}")}`;
  const endpoint = matchEndpoint("GET", path, zoneId, EDGE_ENDPOINTS);
  if (endpoint === undefined) {
    throw new EndpointNotAllowedError(
      `${label} is not on the edge allow-list (scripts/cloudflare/edge.ts EDGE_ENDPOINTS)`,
    );
  }
  const response = await transport({ method: "GET", path });
  if (response.status === 403)
    throw new MissingScopeError(endpoint.scope, label);
  if (response.status === 404 && missingIsEmpty) return undefined;
  if (response.status === 401) {
    throw new CloudflareApiError(
      401,
      label,
      "the token was refused (invalid, expired or revoked)",
    );
  }
  const envelope = envelopeSchema.safeParse(response.body);
  if (!envelope.success) {
    throw new CloudflareApiError(
      response.status,
      label,
      "the answer is not a Cloudflare API envelope",
    );
  }
  if (
    response.status < 200 ||
    response.status > 299 ||
    !envelope.data.success
  ) {
    const codes = envelope.data.errors
      .map((error) => `${String(error.code)} ${error.message}`)
      .join("; ");
    throw new CloudflareApiError(
      response.status,
      label,
      codes === "" ? "no error detail" : codes,
    );
  }
  return envelope.data;
}

const liveRecordSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    content: z.string(),
    proxied: z.boolean().optional(),
  })
  .loose();
export type LiveRecord = z.infer<typeof liveRecordSchema>;

const liveRuleSchema = z
  .object({
    description: z.string().default(""),
    expression: z.string(),
    action: z.string(),
    action_parameters: jsonSchema.optional(),
    ratelimit: jsonSchema.optional(),
    enabled: z.boolean().default(true),
  })
  .loose();
export type LiveRule = z.infer<typeof liveRuleSchema>;

const rulesetSchema = z
  .object({ rules: z.array(liveRuleSchema).default([]) })
  .loose();

// ---------------------------------------------------------------------------------------------
// The live diff

export interface EdgeReport {
  readonly ok: boolean;
  /** Lines that fail the check. */
  readonly drifts: readonly string[];
  /** Lines that inform: pending cutover, unverified phases. */
  readonly notes: readonly string[];
  readonly lines: readonly string[];
}

const ADDRESS_TYPES = new Set(["A", "AAAA", "CNAME"]);

function describeRecord(record: LiveRecord): string {
  return `${record.type} ${record.content}${record.proxied === true ? " proxied" : " DNS only"}`;
}

const step = (id: string): string => `founder step ${id}`;

/** Compare the live records with the declaration (AC-14). */
export function diffDns(
  edge: EdgeDeclaration,
  live: readonly LiveRecord[],
): { drifts: string[]; notes: string[] } {
  const drifts: string[] = [];
  const notes: string[] = [];
  for (const declared of edge.dns.records) {
    const here = live.filter(
      (record) =>
        record.name === declared.name && ADDRESS_TYPES.has(record.type),
    );
    const active = declared.stage === "now" || edge.cutover.state === "done";
    const want = `CNAME *.up.railway.app proxied`;
    if (!active) {
      notes.push(
        `pending cutover (${edge.cutover.owner}) · dns ${declared.name} · declared ${want} · live ${here.length === 0 ? "absent" : here.map(describeRecord).join(", ")} · ${step(declared.founderStep)}`,
      );
      continue;
    }
    const good = here.filter(
      (record) =>
        record.type === "CNAME" &&
        RAILWAY_TARGET.test(record.content) &&
        record.proxied === true,
    );
    if (here.length === 0) {
      drifts.push(
        `dns ${declared.name} · declared ${want} · live absent · AC-14 · ${step(declared.founderStep)}`,
      );
      continue;
    }
    for (const record of here) {
      if (good.includes(record) && good.length === 1) continue;
      const why =
        record.type !== "CNAME"
          ? "a GoDaddy parking or builder record: delete it"
          : !RAILWAY_TARGET.test(record.content)
            ? "not the Railway target: a GoDaddy parking or builder record, or a typo"
            : record.proxied !== true
              ? "not proxied: switch the cloud to orange"
              : "a second CNAME at the name";
      drifts.push(
        `dns ${declared.name} · declared ${want} · live ${describeRecord(record)} · ${why} · AC-14 · ${step(declared.founderStep)}`,
      );
    }
  }
  for (const kept of edge.dns.keep) {
    if (
      !live.some(
        (record) => record.name === kept.name && record.type === kept.type,
      )
    ) {
      drifts.push(
        `dns ${kept.name} · declared ${kept.type} kept · live absent · ${kept.reason}`,
      );
    }
  }
  return { drifts, notes };
}

function hostsNamed(expression: string, zone: string): string[] {
  const pattern = new RegExp(
    `(?:[a-z0-9-]+\\.)*${zone.replace(/\./g, "\\.")}`,
    "gi",
  );
  return [...expression.matchAll(pattern)].map((match) =>
    match[0].toLowerCase(),
  );
}

/** Whether a live rule names only hosts this file leaves alone (the R2 media host). */
export function isForeign(edge: EdgeDeclaration, rule: LiveRule): boolean {
  const named = hostsNamed(rule.expression, edge.zone);
  return (
    named.length > 0 && named.every((name) => edge.hosts.foreign.includes(name))
  );
}

function isJsonObject(
  value: Json | undefined,
): value is { readonly [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Each declared field the live value does not carry, as `path · declared · live`. */
function fieldDiffs(
  declared: Json | undefined,
  live: Json | undefined,
  path: string,
): string[] {
  if (declared === undefined) return [];
  if (isJsonObject(declared) && isJsonObject(live)) {
    return Object.keys(declared).flatMap((key) =>
      fieldDiffs(declared[key], live[key], `${path}.${key}`),
    );
  }
  return canonical(declared) === canonical(live)
    ? []
    : [`${path} · declared ${canonical(declared)} · live ${canonical(live)}`];
}

/** Compare one phase's live rules with its declaration (AC-16, AC-21, ADR-0006). */
export function diffPhase(
  edge: EdgeDeclaration,
  phase: Phase,
  live: readonly LiveRule[],
): { drifts: string[]; notes: string[] } {
  const drifts: string[] = [];
  const notes: string[] = [];
  const declared = phaseOf(edge, phase);

  for (const rule of declared) {
    const active = rule.stage === "now" || edge.cutover.state === "done";
    const match = live.find((entry) => entry.description === rule.description);
    const where = `rule "${rule.description}" · ${phase}`;
    if (match === undefined) {
      if (active) {
        drifts.push(`${where} · live absent · ${step(rule.founderStep)}`);
      } else {
        notes.push(
          `pending cutover (${edge.cutover.owner}) · ${where} · live absent · ${step(rule.founderStep)}`,
        );
      }
      continue;
    }
    const diffs = [
      ...(squash(match.expression) === squash(rule.expression)
        ? []
        : [
            `expression · declared ${JSON.stringify(rule.expression)} · live ${JSON.stringify(match.expression)}`,
          ]),
      ...fieldDiffs(rule.action, match.action, "action"),
      ...fieldDiffs(
        rule.action_parameters,
        match.action_parameters,
        "action_parameters",
      ),
      ...fieldDiffs(rule.ratelimit, match.ratelimit, "ratelimit"),
      ...(match.enabled ? [] : ["enabled · declared true · live false"]),
    ];
    for (const diff of diffs) {
      drifts.push(`${where} · ${diff} · ${step(rule.founderStep)}`);
    }
  }

  const names = new Set(declared.map((rule) => rule.description));
  for (const rule of live) {
    const where = `rule "${rule.description}" · ${phase}`;
    if (
      GEO_FIELD.test(
        `${rule.expression} ${canonical(rule.action_parameters ?? null)}`,
      )
    ) {
      drifts.push(
        `${where} · reads the visitor's location: no IP redirects, ever (ADR-0006) · delete it`,
      );
    }
    if (isForeign(edge, rule)) continue;
    const hazards =
      phase === "http_request_cache_settings"
        ? cacheRuleHazards(rule.action_parameters)
        : phase === "http_response_headers_transform"
          ? headerRuleHazards(rule.action_parameters)
          : [];
    for (const hazard of hazards)
      drifts.push(`${where} · ${hazard} · delete it`);
    if (!names.has(rule.description)) {
      drifts.push(
        `${where} · not declared in ${EDGE_PATH} · delete it, or declare it`,
      );
    }
  }

  if (phase === "http_request_cache_settings") {
    const bypassAt = live.findIndex((rule) =>
      declared.some(
        (entry) =>
          entry.description === rule.description &&
          at(entry.action_parameters, "cache") === false,
      ),
    );
    const laterCaching = live.findIndex(
      (rule, index) =>
        index > bypassAt &&
        !isForeign(edge, rule) &&
        at(rule.action_parameters, "cache") === true,
    );
    if (bypassAt !== -1 && laterCaching !== -1) {
      drifts.push(
        `rule "${live[laterCaching]?.description ?? ""}" · ${phase} · comes after the bypass rule and wins over it: drag the bypass rule to the bottom of the list`,
      );
    }
  }
  return { drifts, notes };
}

/** Read the zone's edge and diff it against the declaration. GETs only. */
export async function checkEdge(
  edge: EdgeDeclaration,
  transport: Transport,
  zoneId: string,
): Promise<EdgeReport> {
  const drifts: string[] = [];
  const notes: string[] = [];

  const dns = await edgeGet(transport, zoneId, `/zones/${zoneId}/dns_records`);
  const records = z.array(liveRecordSchema).parse(dns?.result ?? []);
  const total = dns?.result_info?.total_count;
  if (total !== undefined && total > records.length) {
    throw new CloudflareApiError(
      200,
      "GET /zones/{zone_id}/dns_records",
      `${String(total)} records and one page of ${String(records.length)}: the check reads one page only`,
    );
  }
  const dnsDiff = diffDns(edge, records);
  drifts.push(...dnsDiff.drifts);
  notes.push(...dnsDiff.notes);

  for (const { phase, scope } of edge.phases) {
    let envelope;
    try {
      envelope = await edgeGet(
        transport,
        zoneId,
        `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`,
        true,
      );
    } catch (error) {
      if (
        error instanceof MissingScopeError &&
        !TOKEN_SCOPES.includes(error.scope)
      ) {
        const steps = phaseOf(edge, phase).map((rule) => rule.founderStep);
        notes.push(
          `unverified · ${phase} · the token has no ${scope}, which spec 040 §14 A5 keeps out of it · checked by tests/e2e/cloudflare-edge.spec.ts against staging and by eye in founder step E6${steps.length > 0 ? ` (rules of steps ${steps.join(", ")})` : ""}`,
        );
        continue;
      }
      throw error;
    }
    const rules = rulesetSchema.parse(envelope?.result ?? {}).rules;
    const diff = diffPhase(edge, phase, rules);
    drifts.push(...diff.drifts);
    notes.push(...diff.notes);
  }

  const ok = drifts.length === 0;
  const verdict = ok
    ? `cloudflare:check: the edge matches ${EDGE_PATH}${notes.length > 0 ? ` (${String(notes.length)} notes above)` : ""}`
    : `cloudflare:check: ${String(drifts.length)} edge difference${drifts.length === 1 ? "" : "s"} from ${EDGE_PATH}; each names the step of ${FOUNDER_SECTION} that fixes it`;
  return { ok, drifts, notes, lines: [...drifts, ...notes, verdict] };
}
