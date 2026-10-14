/**
 * `pnpm cloudflare:check` on the edge: DNS records, cache rules, the `www` redirect, the rate limit
 * (spec 040 AC-14 / T-14, AC-16 / T-16, AC-21 / T-21, AC-24, ADR-0006; TASK-101).
 *
 * A contract test because `tests/fixtures/cloudflare/edge-*.json` is the shape of a boundary we do
 * not own (Cloudflare's DNS and Rulesets APIs): if that shape changes, the parse fails here rather
 * than the gate reporting "no difference" on an answer it no longer understands.
 *
 * Each failure case writes out the one line it expects. A rule dropped from the comparison, or
 * from the lint, leaves its case expecting a line that no longer comes, so the case goes red.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  loadDeclaredEdge,
  run,
} from "../../scripts/cloudflare/apply-zone-settings.ts";
import {
  EDGE_ENDPOINTS,
  type EdgeDeclaration,
  type Phase,
  RATE_LIMIT_EXPRESSION,
  TOKEN_SCOPES,
  bypassExpression,
  checkEdge,
  edgeGet,
  hostsMatched,
  lintEdge,
  localePrefixes,
} from "../../scripts/cloudflare/edge.ts";
import {
  CloudflareApiError,
  EndpointNotAllowedError,
  MissingScopeError,
  type RecordedZone,
  createRecordedTransport,
  matchEndpoint,
  recordedZoneSchema,
} from "../../src/lib/cloudflare-zone";
import {
  bypassProbes,
  hostOf,
  productionRefusal,
} from "../e2e/cloudflare-edge-target.ts";

const repoRoot = resolve(__dirname, "../..");
const declared = loadDeclaredEdge(repoRoot);

const load = (name: string): RecordedZone =>
  recordedZoneSchema.parse(
    JSON.parse(
      readFileSync(
        resolve(repoRoot, "tests/fixtures/cloudflare", name),
        "utf8",
      ),
    ),
  );
const asDeclared = load("edge-as-declared.json");
const beforeCutover = load("edge-before-cutover.json");

const DNS_KEY = "GET /zones/{zone_id}/dns_records";
const phaseKey = (phase: Phase) =>
  `GET /zones/{zone_id}/rulesets/phases/${phase}/entrypoint`;

interface Envelope<T> {
  result: T;
  result_info?: { count: number; total_count: number };
}
interface Rec {
  name: string;
  type: string;
  content: string;
  proxied: boolean;
}
interface Rule {
  description: string;
  expression: string;
  action: string;
  action_parameters?: Record<string, unknown>;
  ratelimit?: Record<string, unknown>;
  enabled: boolean;
}

/** The declaration as TASK-104 leaves it: the cutover done, every stage active. */
function cutoverDone(edge: EdgeDeclaration = declared): EdgeDeclaration {
  const copy = structuredClone(edge);
  copy.cutover.state = "done";
  return copy;
}

function withRecords(
  base: RecordedZone,
  change: (records: Rec[]) => Rec[],
): RecordedZone {
  const copy = structuredClone(base);
  const envelope = copy.responses[DNS_KEY]?.body as Envelope<Rec[]>;
  envelope.result = change(envelope.result);
  if (envelope.result_info !== undefined) {
    envelope.result_info.count = envelope.result.length;
    envelope.result_info.total_count = envelope.result.length;
  }
  return copy;
}

function withRules(
  base: RecordedZone,
  phase: Phase,
  change: (rules: Rule[]) => Rule[],
): RecordedZone {
  const copy = structuredClone(base);
  const envelope = copy.responses[phaseKey(phase)]?.body as Envelope<{
    rules: Rule[];
  }>;
  envelope.result.rules = change(envelope.result.rules);
  return copy;
}

const record = (
  name: string,
  type: string,
  content: string,
  proxied = true,
) => ({
  id: "f".repeat(32),
  name,
  type,
  content,
  proxied,
  ttl: 1,
});

const named =
  (description: string, change: (rule: Rule) => Rule) => (rules: Rule[]) =>
    rules.map((rule) =>
      rule.description === description ? change(rule) : rule,
    );

async function check(recorded: RecordedZone, edge = cutoverDone()) {
  const { transport, calls } = createRecordedTransport(recorded);
  const report = await checkEdge(edge, transport, recorded.zoneId);
  return { report, calls };
}

const VERDICT_OK =
  "cloudflare:check: the edge matches config/cloudflare/edge.json";

// ---------------------------------------------------------------------------------------------

describe("the declaration (AC-14, AC-16, AC-21)", () => {
  it("lints clean, and declares the three hosts, the cutover pending and _dmarc kept", () => {
    expect(lintEdge(declared)).toEqual([]);
    expect(
      declared.dns.records.map((r) => [r.name, r.type, r.proxied, r.stage]),
    ).toEqual([
      ["flowersoverseas.com", "CNAME", true, "cutover"],
      ["www.flowersoverseas.com", "CNAME", true, "cutover"],
      ["staging.flowersoverseas.com", "CNAME", true, "now"],
    ]);
    expect(declared.cutover).toMatchObject({
      state: "pending",
      owner: "TASK-104",
    });
    expect(declared.dns.keep.map((k) => `${k.name} ${k.type}`)).toEqual([
      "_dmarc.flowersoverseas.com TXT",
    ]);
  });

  it("bypasses the six dynamic paths bare and under every locale prefix of the registry", () => {
    expect(declared.bypass.paths).toEqual([
      "/api/",
      "/checkout",
      "/account",
      "/admin",
      "/vendor",
      "/track",
    ]);
    expect(localePrefixes()).toEqual([
      "en",
      "en-gb",
      "de",
      "pl",
      "en-XA",
      "ar-XB",
    ]);
    const bypass = declared.phases[0]?.rules.at(-1);
    expect(bypass?.description).toBe("fo: bypass dynamic paths");
    expect(bypass?.expression).toBe(
      bypassExpression(declared.bypass.paths, localePrefixes()),
    );
    for (const path of [
      "/api/",
      "/checkout",
      "/pl/checkout",
      "/ar-XB/track",
      "/de/account",
    ]) {
      expect(bypass?.expression).toContain(
        `starts_with(http.request.uri.path, "${path}")`,
      );
    }
  });

  it("caches documents on the production host only, from the origin's TTL: no Cache Everything", () => {
    const cache = declared.phases[0]?.rules ?? [];
    expect(cache.map((rule) => rule.description)).toEqual([
      "fo: cache documents",
      "fo: bypass dynamic paths",
    ]);
    expect(cache[0]).toMatchObject({
      expression: '(http.host eq "flowersoverseas.com")',
      action_parameters: {
        cache: true,
        edge_ttl: { mode: "respect_origin" },
        browser_ttl: { mode: "respect_origin" },
      },
    });
    expect(JSON.stringify(cache)).not.toContain("override_origin");
    expect(JSON.stringify(cache)).not.toContain("custom_key");
  });

  it("declares one rate-limit rule on /api/ only, in the Free plan's terms", () => {
    const limits = declared.phases[2]?.rules ?? [];
    expect(limits).toHaveLength(1);
    expect(limits[0]).toMatchObject({
      expression: RATE_LIMIT_EXPRESSION,
      action: "block",
      ratelimit: {
        characteristics: ["cf.colo.id", "ip.src"],
        period: 10,
        requests_per_period: 10,
        mitigation_timeout: 10,
      },
    });
  });
});

describe("the lint fails on each unsafe declaration, naming it", () => {
  const lint = (
    change: (edge: EdgeDeclaration) => void,
    locales?: string[],
  ) => {
    const copy = structuredClone(declared);
    change(copy);
    return lintEdge(copy, locales);
  };
  const cacheRules = (edge: EdgeDeclaration) => edge.phases[0]?.rules ?? [];

  it("a locale added to the registry and not to the bypass names the six paths it misses", () => {
    expect(lint(() => undefined, [...localePrefixes(), "fr"])).toEqual([
      'rule "fo: bypass dynamic paths" does not bypass /fr/api/, /fr/checkout, /fr/account, /fr/admin, /fr/vendor, /fr/track: every path, bare and under every locale prefix',
    ]);
  });

  it("a clause dropped from the bypass", () => {
    expect(
      lint((edge) => {
        const bypass = cacheRules(edge)[1];
        if (bypass) {
          bypass.expression = bypass.expression.replace(
            ' or starts_with(http.request.uri.path, "/pl/checkout")',
            "",
          );
        }
      }),
    ).toEqual([
      'rule "fo: bypass dynamic paths" does not bypass /pl/checkout: every path, bare and under every locale prefix',
    ]);
  });

  it("the bypass above the caching rule, where the caching rule would win", () => {
    expect(
      lint((edge) => {
        cacheRules(edge).reverse();
      }),
    ).toEqual([
      'rule "fo: bypass dynamic paths" must be the last cache rule: a later cache rule wins over an earlier one',
    ]);
  });

  it("Cache Everything: an edge TTL that overrides the origin", () => {
    expect(
      lint((edge) => {
        const rule = cacheRules(edge)[0];
        if (rule)
          rule.action_parameters = {
            cache: true,
            edge_ttl: { mode: "override_origin", default: 7200 },
          };
      }),
    ).toEqual([
      'rule "fo: cache documents": Cache Everything: the edge TTL overrides the origin\'s Cache-Control, so a no-store page would be cached',
      'rule "fo: cache documents": a rule that makes a page eligible for cache must take its edge TTL from the origin (edge_ttl.mode respect_origin)',
    ]);
  });

  it("a cookie in the cache key", () => {
    expect(
      lint((edge) => {
        const rule = cacheRules(edge)[0];
        if (rule?.action_parameters) {
          rule.action_parameters["cache_key"] = {
            custom_key: { cookie: { include: ["fo_locale"] } },
          };
        }
      }),
    ).toEqual([
      'rule "fo: cache documents": a cookie in the cache key: a cached response would vary by cookie',
    ]);
  });

  it("caching the walled staging host", () => {
    expect(
      lint((edge) => {
        const rule = cacheRules(edge)[0];
        if (rule)
          rule.expression =
            '(http.host in {"flowersoverseas.com" "staging.flowersoverseas.com"})';
      }),
    ).toEqual([
      'rule "fo: cache documents": only the production host may be cached; staging.flowersoverseas.com and PR hosts are behind a basic-auth wall a shared cache would leak',
    ]);
  });

  it("a rate limit that would count documents", () => {
    expect(
      lint((edge) => {
        const rule = edge.phases[2]?.rules[0];
        if (rule) rule.expression = '(starts_with(http.request.uri.path, "/"))';
      }),
    ).toEqual([
      `exactly one rate-limit rule, on ${RATE_LIMIT_EXPRESSION} only: documents must never be counted (AC-21)`,
    ]);
  });

  it("a second rate-limit rule", () => {
    expect(
      lint((edge) => {
        const rules = edge.phases[2]?.rules;
        const first = rules?.[0];
        if (rules && first)
          rules.push({ ...first, description: "fo: another limit" });
      }),
    ).toEqual([
      `exactly one rate-limit rule, on ${RATE_LIMIT_EXPRESSION} only: documents must never be counted (AC-21)`,
    ]);
  });

  for (const [what, change] of [
    ["a 302", (p: Record<string, unknown>) => ({ ...p, status_code: 302 })],
    [
      "the query dropped",
      (p: Record<string, unknown>) => ({ ...p, preserve_query_string: false }),
    ],
    [
      "the path dropped",
      (p: Record<string, unknown>) => ({
        ...p,
        target_url: { value: "https://flowersoverseas.com/" },
      }),
    ],
  ] as const) {
    it(`the www redirect with ${what}`, () => {
      expect(
        lint((edge) => {
          const rule = edge.phases[1]?.rules[0];
          const from = rule?.action_parameters?.["from_value"];
          if (
            rule?.action_parameters &&
            from &&
            typeof from === "object" &&
            !Array.isArray(from)
          ) {
            rule.action_parameters["from_value"] = change(
              from as Record<string, unknown>,
            ) as never;
          }
        }),
      ).toEqual([
        "exactly one redirect rule: www.flowersoverseas.com → https://flowersoverseas.com with the path, 301, query kept (plan/02 §7)",
      ]);
    });
  }

  it("a rule that reads the visitor's country (ADR-0006)", () => {
    expect(
      lint((edge) => {
        const rule = edge.phases[1]?.rules[0];
        if (rule)
          rule.expression =
            '(http.host eq "www.flowersoverseas.com" and ip.src.country eq "DE")';
      }),
    ).toContain(
      'rule "fo: www to apex" reads the visitor\'s location: no IP redirects, ever (ADR-0006)',
    );
  });

  it("a response-header rule that sets a cookie", () => {
    expect(
      lint((edge) => {
        edge.phases[3]?.rules.push({
          description: "fo: tag visitors",
          stage: "now",
          founderStep: "E9",
          reason: "x",
          expression: "true",
          action: "rewrite",
          action_parameters: {
            headers: { "Set-Cookie": { operation: "set", value: "a=b" } },
          },
        });
      }),
    ).toEqual([
      'rule "fo: tag visitors": sets Set-Cookie: no cached response may carry a cookie or a Vary (spec 007 AC-23)',
    ]);
  });

  it("staging moved to the cutover, the apex brought forward, _dmarc dropped", () => {
    expect(
      lint((edge) => {
        const [apex, , staging] = edge.dns.records;
        if (apex) apex.stage = "now";
        if (staging) staging.stage = "cutover";
        edge.dns.keep = [];
      }),
    ).toEqual([
      "dns flowersoverseas.com must have stage cutover",
      "dns staging.flowersoverseas.com must have stage now",
      "dns _dmarc.flowersoverseas.com TXT must be kept (spec 040 §5.4)",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------

describe("DNS against recorded records (AC-14, T-14)", () => {
  it("after the cutover: apex, www and staging proxied to Railway, _dmarc kept → clean", async () => {
    const { report } = await check(asDeclared);
    expect(report.drifts).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.lines.at(-1)).toBe(VERDICT_OK);
  });

  it("a GoDaddy parking A record at the apex beside the CNAME → red, naming it", async () => {
    const { report } = await check(
      withRecords(asDeclared, (records) => [
        ...records,
        record("flowersoverseas.com", "A", "192.0.2.10", false),
      ]),
    );
    expect(report.ok).toBe(false);
    expect(report.drifts).toEqual([
      "dns flowersoverseas.com · declared CNAME *.up.railway.app proxied · live A 192.0.2.10 DNS only · a GoDaddy parking or builder record: delete it · AC-14 · founder step C3",
    ]);
  });

  it("a parking AAAA record at www → red", async () => {
    const { report } = await check(
      withRecords(asDeclared, (records) => [
        ...records,
        record("www.flowersoverseas.com", "AAAA", "2001:db8::10"),
      ]),
    );
    expect(report.drifts).toContain(
      "dns www.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live AAAA 2001:db8::10 proxied · a GoDaddy parking or builder record: delete it · AC-14 · founder step C3",
    );
  });

  it("the GoDaddy apex left in place at the cutover → red on both A records", async () => {
    const { report } = await check(beforeCutover);
    expect(report.drifts.filter((line) => line.startsWith("dns "))).toEqual([
      "dns flowersoverseas.com · declared CNAME *.up.railway.app proxied · live A 192.0.2.10 proxied · a GoDaddy parking or builder record: delete it · AC-14 · founder step C3",
      "dns flowersoverseas.com · declared CNAME *.up.railway.app proxied · live A 192.0.2.11 proxied · a GoDaddy parking or builder record: delete it · AC-14 · founder step C3",
      "dns www.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live CNAME flowersoverseas.com proxied · not the Railway target: a GoDaddy parking or builder record, or a typo · AC-14 · founder step C3",
    ]);
  });

  it("before the cutover the same records are reported pending, not failed", async () => {
    const { report } = await check(beforeCutover, declared);
    expect(report.ok).toBe(true);
    expect(report.notes.slice(0, 2)).toEqual([
      "pending cutover (TASK-104) · dns flowersoverseas.com · declared CNAME *.up.railway.app proxied · live A 192.0.2.10 proxied, A 192.0.2.11 proxied · founder step C3",
      "pending cutover (TASK-104) · dns www.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live CNAME flowersoverseas.com proxied · founder step C3",
    ]);
  });

  it("staging is not pending: absent before the cutover → red, naming founder step E2", async () => {
    const { report } = await check(
      withRecords(beforeCutover, (records) =>
        records.filter((r) => r.name !== "staging.flowersoverseas.com"),
      ),
      declared,
    );
    expect(report.ok).toBe(false);
    expect(report.drifts).toEqual([
      "dns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live absent · AC-14 · founder step E2",
    ]);
  });

  it("a parking A record beside staging's CNAME, before the cutover → red now", async () => {
    const { report } = await check(
      withRecords(beforeCutover, (records) => [
        ...records,
        record("staging.flowersoverseas.com", "A", "192.0.2.10"),
      ]),
      declared,
    );
    expect(report.ok).toBe(false);
    expect(report.drifts).toEqual([
      "dns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live A 192.0.2.10 proxied · a GoDaddy parking or builder record: delete it · AC-14 · founder step E2",
    ]);
  });

  it("staging left grey (DNS only) → red", async () => {
    const { report } = await check(
      withRecords(beforeCutover, (records) =>
        records.map((r) =>
          r.name === "staging.flowersoverseas.com"
            ? { ...r, proxied: false }
            : r,
        ),
      ),
      declared,
    );
    expect(report.drifts).toEqual([
      "dns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live CNAME g05ns7.up.railway.app DNS only · not proxied: switch the cloud to orange · AC-14 · founder step E2",
    ]);
  });

  it("_dmarc deleted with the GoDaddy records → red", async () => {
    const { report } = await check(
      withRecords(asDeclared, (records) =>
        records.filter((r) => r.type !== "TXT"),
      ),
    );
    expect(report.drifts).toEqual([
      "dns _dmarc.flowersoverseas.com · declared TXT kept · live absent · the domain’s DMARC policy; spec 040 §5.4 keeps it when the GoDaddy records go",
    ]);
  });

  it("more records than one page → a named error, never a partial pass", async () => {
    const copy = structuredClone(asDeclared);
    const envelope = copy.responses[DNS_KEY]?.body as Envelope<Rec[]>;
    if (envelope.result_info) envelope.result_info.total_count = 140;
    await expect(check(copy)).rejects.toThrow(
      "GET /zones/{zone_id}/dns_records answered 200: 140 records and one page of 4: the check reads one page only",
    );
  });
});

describe("rules against recorded rulesets (AC-16, AC-21, T-16, T-21 contract half)", () => {
  it("as declared, with the R2 media host's own rule beside them → clean", async () => {
    const { report, calls } = await check(asDeclared);
    expect(report.ok).toBe(true);
    expect(calls).toEqual([
      DNS_KEY,
      phaseKey("http_request_cache_settings"),
      phaseKey("http_request_dynamic_redirect"),
      phaseKey("http_ratelimit"),
      phaseKey("http_response_headers_transform"),
    ]);
  });

  it("Cache Everything on the documents rule → red, named", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_request_cache_settings",
        named("fo: cache documents", (rule) => ({
          ...rule,
          action_parameters: {
            cache: true,
            edge_ttl: { mode: "override_origin", default: 7200 },
            browser_ttl: { mode: "respect_origin" },
          },
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: cache documents" · http_request_cache_settings · action_parameters.edge_ttl.mode · declared "respect_origin" · live "override_origin" · founder step C1',
      'rule "fo: cache documents" · http_request_cache_settings · Cache Everything: the edge TTL overrides the origin\'s Cache-Control, so a no-store page would be cached · delete it',
    ]);
  });

  it("an undeclared Cache Everything rule on every host → red, twice named", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_cache_settings", (rules) => [
        ...rules,
        {
          description: "Cache everything",
          expression: "true",
          action: "set_cache_settings",
          action_parameters: {
            cache: true,
            edge_ttl: { mode: "override_origin", default: 7200 },
          },
          enabled: true,
        },
      ]),
    );
    expect(report.drifts).toEqual([
      'rule "Cache everything" · http_request_cache_settings · Cache Everything: the edge TTL overrides the origin\'s Cache-Control, so a no-store page would be cached · delete it',
      'rule "Cache everything" · http_request_cache_settings · not declared in config/cloudflare/edge.json · delete it, or declare it',
      'rule "Cache everything" · http_request_cache_settings · comes after the bypass rule and wins over it: drag the bypass rule to the bottom of the list',
    ]);
  });

  it("a rule naming the media host and the apex is not foreign: it is checked", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_cache_settings", (rules) =>
        rules.map((rule, index) =>
          index === 0
            ? {
                ...rule,
                expression:
                  '(http.host in {"media.flowersoverseas.com" "flowersoverseas.com"})',
              }
            : rule,
        ),
      ),
    );
    expect(report.ok).toBe(false);
    expect(report.drifts).toContain(
      'rule "media.flowersoverseas.com cache" · http_request_cache_settings · not declared in config/cloudflare/edge.json · delete it, or declare it',
    );
  });

  it("the bypass dragged above the documents rule → red", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_cache_settings", (rules) => [
        rules[0] as Rule,
        rules[2] as Rule,
        rules[1] as Rule,
      ]),
    );
    expect(report.drifts).toEqual([
      'rule "fo: cache documents" · http_request_cache_settings · comes after the bypass rule and wins over it: drag the bypass rule to the bottom of the list',
    ]);
  });

  it("a locale missing from the live bypass → red, the expression named", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_request_cache_settings",
        named("fo: bypass dynamic paths", (rule) => ({
          ...rule,
          expression: rule.expression.replace(
            ' or starts_with(http.request.uri.path, "/pl/checkout")',
            "",
          ),
        })),
      ),
    );
    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0]).toMatch(
      /^rule "fo: bypass dynamic paths" · http_request_cache_settings · expression · declared ".*\/pl\/checkout.*" · live "(?!.*\/pl\/checkout).*" · founder step E4$/,
    );
  });

  it("the bypass switched off → red", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_request_cache_settings",
        named("fo: bypass dynamic paths", (rule) => ({
          ...rule,
          enabled: false,
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: bypass dynamic paths" · http_request_cache_settings · enabled · declared true · live false · founder step E4',
    ]);
  });

  it("a cookie added to the live cache key → red", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_request_cache_settings",
        named("fo: cache documents", (rule) => ({
          ...rule,
          action_parameters: {
            ...rule.action_parameters,
            cache_key: { custom_key: { cookie: { include: ["fo_currency"] } } },
          },
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: cache documents" · http_request_cache_settings · a cookie in the cache key: a cached response would vary by cookie · delete it',
    ]);
  });

  it("the rate limit widened to every path → red (documents would be counted, AC-21)", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_ratelimit",
        named("fo: api rate limit", (rule) => ({
          ...rule,
          expression: '(starts_with(http.request.uri.path, "/"))',
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: api rate limit" · http_ratelimit · expression · declared "(starts_with(http.request.uri.path, \\"/api/\\"))" · live "(starts_with(http.request.uri.path, \\"/\\"))" · founder step E5',
    ]);
  });

  it("the rate limit's threshold changed → red", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_ratelimit",
        named("fo: api rate limit", (rule) => ({
          ...rule,
          ratelimit: { ...rule.ratelimit, requests_per_period: 2 },
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: api rate limit" · http_ratelimit · ratelimit.requests_per_period · declared 10 · live 2 · founder step E5',
    ]);
  });

  it("the www redirect as a 302 → red", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_request_dynamic_redirect",
        named("fo: www to apex", (rule) => ({
          ...rule,
          action_parameters: {
            from_value: {
              ...(rule.action_parameters?.["from_value"] as object),
              status_code: 302,
            },
          },
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: www to apex" · http_request_dynamic_redirect · action_parameters.from_value.status_code · declared 301 · live 302 · founder step C2',
    ]);
  });

  it("an IP-geolocation redirect anywhere → red (ADR-0006)", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_dynamic_redirect", (rules) => [
        ...rules,
        {
          description: "Germans to /de",
          expression: '(ip.src.country eq "DE")',
          action: "redirect",
          action_parameters: {
            from_value: {
              status_code: 302,
              target_url: { value: "https://flowersoverseas.com/de" },
            },
          },
          enabled: true,
        },
      ]),
    );
    expect(report.drifts).toEqual([
      'rule "Germans to /de" · http_request_dynamic_redirect · reads the visitor\'s location: no IP redirects, ever (ADR-0006) · delete it',
      'rule "Germans to /de" · http_request_dynamic_redirect · not declared in config/cloudflare/edge.json · delete it, or declare it',
    ]);
  });

  for (const header of ["Set-Cookie", "Vary"]) {
    it(`a response-header rule setting ${header} → red`, async () => {
      const { report } = await check(
        withRules(asDeclared, "http_response_headers_transform", (rules) => [
          ...rules,
          {
            description: "add header",
            expression: "true",
            action: "rewrite",
            action_parameters: {
              headers: { [header]: { operation: "set", value: "x" } },
            },
            enabled: true,
          },
        ]),
      );
      expect(report.drifts).toEqual([
        `rule "add header" · http_response_headers_transform · sets ${header}: no cached response may carry a cookie or a Vary (spec 007 AC-23) · delete it`,
        'rule "add header" · http_response_headers_transform · not declared in config/cloudflare/edge.json · delete it, or declare it',
      ]);
    });
  }

  it("a declared rule absent from a readable phase → red, naming the founder step", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_ratelimit", () => []),
    );
    expect(report.drifts).toEqual([
      'rule "fo: api rate limit" · http_ratelimit · live absent · founder step E5',
    ]);
  });

  it("a phase with no entrypoint yet (404) counts as no rules", async () => {
    const copy = structuredClone(asDeclared);
    copy.responses[phaseKey("http_ratelimit")] = {
      status: 404,
      body: {
        success: false,
        errors: [{ code: 10003, message: "could not find entrypoint ruleset" }],
        messages: [],
        result: null,
      },
    };
    const { report } = await check(copy);
    expect(report.drifts).toEqual([
      'rule "fo: api rate limit" · http_ratelimit · live absent · founder step E5',
    ]);
  });
});

describe("the token's five scopes and the allow-list (AC-24, spec 040 §14 A5)", () => {
  it("allows exactly five GETs under the one zone, and nothing else", () => {
    expect(
      EDGE_ENDPOINTS.map((e) => `${e.method} ${e.pattern} · ${e.scope}`),
    ).toEqual([
      "GET /zones/{zone_id}/dns_records · Zone → DNS → Edit",
      "GET /zones/{zone_id}/rulesets/phases/http_request_cache_settings/entrypoint · Zone → Cache Rules → Read",
      "GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint · Zone → Single Redirect → Read",
      "GET /zones/{zone_id}/rulesets/phases/http_ratelimit/entrypoint · Zone → Zone WAF → Read",
      "GET /zones/{zone_id}/rulesets/phases/http_response_headers_transform/entrypoint · Zone → Transform Rules → Read",
    ]);
    const zone = asDeclared.zoneId;
    expect(
      matchEndpoint("GET", `/zones/${zone}/dns_records`, zone, EDGE_ENDPOINTS),
    ).toBeDefined();
    for (const [method, path] of [
      ["PATCH", `/zones/${zone}/dns_records`],
      ["PUT", `/zones/${zone}/rulesets/phases/http_ratelimit/entrypoint`],
      ["GET", `/zones/another/dns_records`],
      ["GET", `/accounts/abc/rulesets`],
      [
        "GET",
        `/zones/${zone}/rulesets/phases/http_request_firewall_custom/entrypoint`,
      ],
    ] as const) {
      expect(
        matchEndpoint(method, path, zone, EDGE_ENDPOINTS),
        `${method} ${path}`,
      ).toBeUndefined();
    }
  });

  it("names the five scopes of A5, and DNS is one of them", () => {
    expect(TOKEN_SCOPES).toEqual([
      "Zone → Zone Settings → Edit",
      "Zone → DNS → Edit",
      "Zone → Cache Purge → Purge",
      "Zone → Zone → Read",
      "Zone → Bot Management → Read",
    ]);
  });

  it("today's token: every ruleset answers 403 → unverified, named; the run passes on DNS", async () => {
    const { report } = await check(beforeCutover, declared);
    expect(report.ok).toBe(true);
    expect(report.notes.slice(2)).toEqual([
      "unverified · http_request_cache_settings · the token has no Zone → Cache Rules → Read, which spec 040 §14 A5 keeps out of it · checked by tests/e2e/cloudflare-edge.spec.ts against staging and by eye in founder step E6 (rules of steps C1, E4)",
      "unverified · http_request_dynamic_redirect · the token has no Zone → Single Redirect → Read, which spec 040 §14 A5 keeps out of it · checked by tests/e2e/cloudflare-edge.spec.ts against staging and by eye in founder step E6 (rules of steps C2)",
      "unverified · http_ratelimit · the token has no Zone → Zone WAF → Read, which spec 040 §14 A5 keeps out of it · checked by tests/e2e/cloudflare-edge.spec.ts against staging and by eye in founder step E6 (rules of steps E5)",
      "unverified · http_response_headers_transform · the token has no Zone → Transform Rules → Read, which spec 040 §14 A5 keeps out of it · checked by tests/e2e/cloudflare-edge.spec.ts against staging and by eye in founder step E6",
    ]);
    expect(report.lines.at(-1)).toBe(`${VERDICT_OK} (6 notes above)`);
  });

  it("a 403 on DNS, a scope the token must hold, is an error naming it, not unverified", async () => {
    const copy = structuredClone(beforeCutover);
    copy.responses[DNS_KEY] = copy.responses[phaseKey("http_ratelimit")] ?? {
      status: 403,
      body: null,
    };
    const failure = await check(copy, declared).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(MissingScopeError);
    expect((failure as Error).message).toBe(
      "the token is missing scope Zone → DNS → Edit (GET /zones/{zone_id}/dns_records answered 403)",
    );
  });

  it("a 403 on a rules phase whose scope the token is meant to hold is an error, not unverified", async () => {
    const { transport } = createRecordedTransport(beforeCutover);
    const failure = await checkEdge(declared, transport, beforeCutover.zoneId, [
      ...TOKEN_SCOPES,
      "Zone → Cache Rules → Read",
    ]).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(MissingScopeError);
    expect((failure as Error).message).toBe(
      "the token is missing scope Zone → Cache Rules → Read (GET /zones/{zone_id}/rulesets/phases/http_request_cache_settings/entrypoint answered 403)",
    );
  });

  it("issues GETs only, across a check of every phase", async () => {
    const { calls } = await check(beforeCutover, declared);
    expect(calls.every((call) => call.startsWith("GET "))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

describe("the CLI: `cloudflare:check` reads the edge (AC-14, AC-16)", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cloudflare-edge-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
  const fixtureFile = (name: string, recorded: unknown): string => {
    const path = join(scratch, name);
    writeFileSync(path, JSON.stringify(recorded));
    return path;
  };
  const ZONE = "tests/fixtures/cloudflare/zone-as-declared.json";

  it("today's zone: exit 0, pending and unverified lines printed after the zone's", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/cloudflare/apply-zone-settings.ts",
        "--check",
        "--fixture",
        ZONE,
        "--edge-fixture",
        "tests/fixtures/cloudflare/edge-before-cutover.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "test" },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toContain(
      "cloudflare:check: 26 declared values match config/cloudflare/zone-settings.json",
    );
    expect(lines.at(-1)).toBe(`${VERDICT_OK} (6 notes above)`);
  });

  it("staging missing: exit 1, the line names founder step E2, the edge failure on stderr", async () => {
    const result = await run(
      [
        "--check",
        "--fixture",
        ZONE,
        "--edge-fixture",
        fixtureFile(
          "no-staging.json",
          withRecords(beforeCutover, (records) =>
            records.filter((r) => r.name !== "staging.flowersoverseas.com"),
          ),
        ),
      ],
      {},
      repoRoot,
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "\ndns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live absent · AC-14 · founder step E2\n",
    );
    expect(result.stderr).toBe(
      "cloudflare:check failed: the edge differs from config/cloudflare/edge.json; the token cannot change it, so each line names the founder step that does.\n",
    );
  });

  it("apply prints an edge difference as manual: and fails, writing nothing at the edge", async () => {
    const result = await run(
      [
        "--fixture",
        ZONE,
        "--edge-fixture",
        fixtureFile(
          "apply-no-staging.json",
          withRecords(beforeCutover, (records) =>
            records.filter((r) => r.name !== "staging.flowersoverseas.com"),
          ),
        ),
      ],
      {},
      repoRoot,
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "\nmanual: dns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live absent · AC-14 · founder step E2\n",
    );
    expect(result.stdout).toContain("cloudflare:apply: 0 changes\n");
  });

  it("--edge-fixture beside the live zone is refused, exit 2", async () => {
    const result = await run(
      [
        "--check",
        "--edge-fixture",
        "tests/fixtures/cloudflare/edge-as-declared.json",
      ],
      {},
      repoRoot,
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      "cloudflare:check: --edge-fixture needs --fixture: a recorded edge is replayed beside a recorded zone, never beside the live one\n",
    );
  });

  it("an unsafe declaration fails before the token is looked at: exit 1 even with none", async () => {
    const root = join(scratch, "repo");
    mkdirSync(join(root, "config"), { recursive: true });
    cpSync(
      join(repoRoot, "config/cloudflare"),
      join(root, "config/cloudflare"),
      {
        recursive: true,
      },
    );
    const edgePath = join(root, "config/cloudflare/edge.json");
    const edge = JSON.parse(readFileSync(edgePath, "utf8")) as EdgeDeclaration;
    const rule = edge.phases[0]?.rules[0];
    if (rule)
      rule.action_parameters = {
        cache: true,
        edge_ttl: { mode: "override_origin", default: 7200 },
      };
    writeFileSync(edgePath, JSON.stringify(edge));
    const result = await run(["--check"], {}, root);
    expect(result.code).toBe(1);
    expect(result.stdout.split("\n")[0]).toBe(
      'config/cloudflare/edge.json · rule "fo: cache documents": Cache Everything: the edge TTL overrides the origin\'s Cache-Control, so a no-store page would be cached',
    );
    expect(result.stderr).toBe(
      "cloudflare:check failed: config/cloudflare/edge.json is unsafe to apply; each line above names the rule it breaks.\n",
    );
  });
});

describe("the founder steps carry the declared values verbatim", () => {
  const runbook = readFileSync(
    resolve(repoRoot, "docs/runbooks/railway-cloudflare-setup.md"),
    "utf8",
  );
  const section = runbook.slice(
    runbook.indexOf(
      "## Founder steps in the Cloudflare and Railway dashboards",
    ),
  );

  it("has the section", () => {
    expect(
      section.startsWith(
        "## Founder steps in the Cloudflare and Railway dashboards",
      ),
    ).toBe(true);
  });

  it("names every founder step the declaration points at", () => {
    const steps = new Set([
      ...declared.dns.records.map((r) => r.founderStep),
      ...declared.phases.flatMap((p) => p.rules.map((r) => r.founderStep)),
      "E1",
      "E6",
    ]);
    for (const id of steps) {
      expect(section, id).toMatch(new RegExp(`\\n${id}\\. `));
    }
  });

  it("quotes every rule name and expression exactly as declared", () => {
    for (const rule of declared.phases.flatMap((p) => p.rules)) {
      expect(section, rule.description).toContain(`\`${rule.description}\``);
      expect(section, rule.description).toContain(rule.expression);
    }
    expect(section).toContain(
      'concat("https://flowersoverseas.com", http.request.uri.path)',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// /break 180 round 1 (8a9c0fca) and /review 180 round 1: one case per hole, each red on the
// breaker's mutation.

describe("the lint, each rule the breaker could switch off (holes 2, 3, 6–10, 15)", () => {
  const lint = (change: (edge: EdgeDeclaration) => void) => {
    const copy = structuredClone(declared);
    change(copy);
    return lintEdge(copy);
  };
  const rules = (edge: EdgeDeclaration, index: number) =>
    edge.phases[index]?.rules ?? [];
  const documents = (edge: EdgeDeclaration) => rules(edge, 0)[0];
  const extra = (
    edge: EdgeDeclaration,
    phase: number,
    expression: string,
  ): void => {
    rules(edge, phase).push({
      description: "fo: extra",
      stage: "now",
      founderStep: "E4",
      reason: "a case",
      expression,
      action: "rewrite",
      action_parameters: { headers: {} },
    });
  };

  it("hole 2: the bypass rule dropped → named", () => {
    expect(
      lint((edge) => {
        rules(edge, 0).pop();
      }),
    ).toEqual([
      "no cache rule bypasses the dynamic paths (spec 040 §5.4 rule 1)",
    ]);
  });

  it("hole 2: the bypass rule no longer bypassing (cache not false) → named", () => {
    expect(
      lint((edge) => {
        const bypass = rules(edge, 0)[1];
        if (bypass) bypass.action_parameters = {};
      }),
    ).toEqual([
      "no cache rule bypasses the dynamic paths (spec 040 §5.4 rule 1)",
    ]);
  });

  it("hole 3: the bypass staged at the cutover → named", () => {
    expect(
      lint((edge) => {
        const bypass = rules(edge, 0)[1];
        if (bypass) bypass.stage = "cutover";
      }),
    ).toEqual(['rule "fo: bypass dynamic paths" must have stage now']);
  });

  it("hole 3: the rate limit staged at the cutover → named", () => {
    expect(
      lint((edge) => {
        const limit = rules(edge, 2)[0];
        if (limit) limit.stage = "cutover";
      }),
    ).toEqual([
      'rule "fo: api rate limit" must have stage now: the rate limit is proven on staging first (spec 040 §12 step 4)',
    ]);
  });

  it("hole 3: the documents rule brought forward to now → named (E-4)", () => {
    expect(
      lint((edge) => {
        const rule = documents(edge);
        if (rule) rule.stage = "now";
      }),
    ).toEqual([
      'rule "fo: cache documents" must have stage cutover: only the production host is cached, from the cutover on (spec 040 §14 A7)',
    ]);
  });

  const REDIRECT =
    "exactly one redirect rule: www.flowersoverseas.com → https://flowersoverseas.com with the path, 301, query kept (plan/02 §7)";

  it("hole 6: a second redirect rule → named", () => {
    expect(
      lint((edge) => {
        const www = rules(edge, 1)[0];
        if (www) rules(edge, 1).push({ ...www, description: "fo: second" });
      }),
    ).toEqual([REDIRECT]);
  });

  it("hole 6: the redirect's host changed → named", () => {
    expect(
      lint((edge) => {
        const www = rules(edge, 1)[0];
        if (www)
          www.expression = '(http.host eq "staging.flowersoverseas.com")';
      }),
    ).toEqual([REDIRECT]);
  });

  it("hole 7: origin Cache-Control ignored on the documents rule → named", () => {
    expect(
      lint((edge) => {
        const rule = documents(edge);
        if (rule)
          rule.action_parameters = {
            ...rule.action_parameters,
            origin_cache_control: false,
          };
      }),
    ).toEqual([
      'rule "fo: cache documents": origin Cache-Control ignored: a no-store page would be cached',
    ]);
  });

  it("hole 7: a request header in the cache key → named", () => {
    expect(
      lint((edge) => {
        const rule = documents(edge);
        if (rule)
          rule.action_parameters = {
            ...rule.action_parameters,
            cache_key: {
              custom_key: { header: { include: ["accept-language"] } },
            },
          };
      }),
    ).toEqual([
      'rule "fo: cache documents": a request header in the cache key: a cached response would vary by header',
    ]);
  });

  it("hole 15: the visitor's country and language in the cache key (custom_key.user) → named", () => {
    expect(
      lint((edge) => {
        const rule = documents(edge);
        if (rule)
          rule.action_parameters = {
            ...rule.action_parameters,
            cache_key: {
              custom_key: {
                user: { geo: true, lang: true, device_type: false },
              },
            },
          };
      }),
    ).toEqual([
      'rule "fo: cache documents": the visitor\'s geo, lang in the cache key (custom_key.user): a cached response would vary by visitor (ADR-0006)',
    ]);
  });

  for (const [what, expression] of [
    [
      "the cf-ipcountry header",
      '(http.request.headers["cf-ipcountry"][0] eq "PL")',
    ],
    ["the IP's network (ip.geoip.asnum)", "(ip.geoip.asnum eq 13335)"],
  ] as const) {
    it(`hole 8: a rule reading ${what} → named (ADR-0006)`, () => {
      expect(
        lint((edge) => {
          extra(edge, 3, expression);
        }),
      ).toEqual([
        'rule "fo: extra" reads the visitor\'s location: no IP redirects, ever (ADR-0006)',
      ]);
    });
  }

  it("hole 9: the phases out of order → named", () => {
    expect(
      lint((edge) => {
        const [a, b] = [edge.phases[2], edge.phases[3]];
        if (a && b) edge.phases.splice(2, 2, b, a);
      }),
    ).toEqual([
      "phases must be, in order: http_request_cache_settings, http_request_dynamic_redirect, http_ratelimit, http_response_headers_transform",
    ]);
  });

  it("hole 10: a dns name declared twice → named", () => {
    expect(
      lint((edge) => {
        const staging = edge.dns.records.find(
          (entry) => entry.name === "staging.flowersoverseas.com",
        );
        if (staging) edge.dns.records.push({ ...staging });
      }),
    ).toEqual(["a dns name is declared twice"]);
  });

  it("hole 10: a rule description used twice → named", () => {
    expect(
      lint((edge) => {
        const limit = rules(edge, 2)[0];
        if (limit) limit.description = "fo: www to apex";
      }),
    ).toEqual(["a rule description is used twice"]);
  });
});

describe("the live diff, each path the breaker found unguarded (holes 4, 5, 12–15)", () => {
  const cacheEverything = (expression: string): Rule => ({
    description: "media.flowersoverseas.com everything",
    expression,
    action: "set_cache_settings",
    action_parameters: {
      cache: true,
      edge_ttl: { mode: "override_origin", default: 7200 },
    },
    enabled: true,
  });

  for (const expression of [
    '(http.host ne "media.flowersoverseas.com")',
    '(http.host eq "media.flowersoverseas.com" or starts_with(http.request.uri.path, "/"))',
  ]) {
    it(`hole 13 (/review 180 change 1): ${expression} matches other hosts, so its Cache Everything is checked → red`, async () => {
      const { report } = await check(
        withRules(asDeclared, "http_request_cache_settings", (rules) => [
          ...rules,
          cacheEverything(expression),
        ]),
      );
      expect(report.drifts).toEqual([
        'rule "media.flowersoverseas.com everything" · http_request_cache_settings · Cache Everything: the edge TTL overrides the origin\'s Cache-Control, so a no-store page would be cached · delete it',
        'rule "media.flowersoverseas.com everything" · http_request_cache_settings · not declared in config/cloudflare/edge.json · delete it, or declare it',
        'rule "media.flowersoverseas.com everything" · http_request_cache_settings · comes after the bypass rule and wins over it: drag the bypass rule to the bottom of the list',
      ]);
    });
  }

  it("hole 13: the same rule restricted to the media host alone is the media host's own → clean", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_cache_settings", (rules) => [
        ...rules,
        cacheEverything('(http.host eq "media.flowersoverseas.com")'),
      ]),
    );
    expect(report.drifts).toEqual([]);
  });

  it("hole 13: a host match alone is read as its hosts; anything more is not a host match", () => {
    expect(hostsMatched('(http.host eq "media.flowersoverseas.com")')).toEqual([
      "media.flowersoverseas.com",
    ]);
    expect(
      hostsMatched('http.host in {"media.flowersoverseas.com" "a.example"}'),
    ).toEqual(["media.flowersoverseas.com", "a.example"]);
    for (const expression of [
      '(http.host ne "media.flowersoverseas.com")',
      '(http.host eq "media.flowersoverseas.com" or true)',
      '(not http.host eq "media.flowersoverseas.com")',
      '(http.host eq "media.flowersoverseas.com") or (true)',
    ]) {
      expect(hostsMatched(expression), expression).toBeUndefined();
    }
  });

  it("hole 14: a second live rule carrying a declared name (the walled staging host, before the bypass) → red", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_cache_settings", (rules) => {
        const documents = rules.find(
          (rule) => rule.description === "fo: cache documents",
        ) as Rule;
        return [
          ...rules.slice(0, 2),
          {
            ...documents,
            expression: '(http.host eq "staging.flowersoverseas.com")',
          },
          ...rules.slice(2),
        ];
      }),
    );
    expect(report.drifts).toEqual([
      'rule "fo: cache documents" · http_request_cache_settings · 2 live rules carry this name · delete all but the declared one · founder step C1',
    ]);
  });

  it("hole 15: the visitor's country added to the live cache key → red", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_request_cache_settings",
        named("fo: cache documents", (rule) => ({
          ...rule,
          action_parameters: {
            ...rule.action_parameters,
            cache_key: { custom_key: { user: { geo: true } } },
          },
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: cache documents" · http_request_cache_settings · the visitor\'s geo in the cache key (custom_key.user): a cached response would vary by visitor (ADR-0006) · delete it',
    ]);
  });

  it("hole 5: the rate limit's action switched from block → red, naming the action", async () => {
    const { report } = await check(
      withRules(
        asDeclared,
        "http_ratelimit",
        named("fo: api rate limit", (rule) => ({
          ...rule,
          action: "managed_challenge",
        })),
      ),
    );
    expect(report.drifts).toEqual([
      'rule "fo: api rate limit" · http_ratelimit · action · declared "block" · live "managed_challenge" · founder step E5',
    ]);
  });

  it("hole 4: before the cutover a cutover rule absent live is pending, not failed; a now rule absent fails", async () => {
    const { report } = await check(
      withRules(asDeclared, "http_request_cache_settings", (rules) =>
        rules.filter((rule) => rule.description !== "fo: cache documents"),
      ),
      declared,
    );
    expect(report.drifts).toEqual([]);
    expect(report.notes).toContain(
      'pending cutover (TASK-104) · rule "fo: cache documents" · http_request_cache_settings · live absent · founder step C1',
    );
    const now = await check(
      withRules(asDeclared, "http_ratelimit", () => []),
      declared,
    );
    expect(now.report.drifts).toEqual([
      'rule "fo: api rate limit" · http_ratelimit · live absent · founder step E5',
    ]);
  });

  it("hole 12: two Railway CNAMEs at one name → red on both", async () => {
    const { report } = await check(
      withRecords(asDeclared, (records) => [
        ...records,
        record("staging.flowersoverseas.com", "CNAME", "x7k2pq.up.railway.app"),
      ]),
    );
    expect(report.drifts).toEqual([
      "dns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live CNAME g05ns7.up.railway.app proxied · a second CNAME at the name · AC-14 · founder step E2",
      "dns staging.flowersoverseas.com · declared CNAME *.up.railway.app proxied · live CNAME x7k2pq.up.railway.app proxied · a second CNAME at the name · AC-14 · founder step E2",
    ]);
  });
});

describe("edgeGet's refusals (hole 11)", () => {
  const ZONE = asDeclared.zoneId;
  const DNS = `/zones/${ZONE}/dns_records`;
  const answering =
    (status: number, body: unknown) =>
    (): Promise<{ status: number; body: unknown }> =>
      Promise.resolve({ status, body });
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (error: unknown) => error,
    );

  it("a 401 → the token refused, named", async () => {
    const error = await failure(edgeGet(answering(401, null), ZONE, DNS));
    expect(error).toBeInstanceOf(CloudflareApiError);
    expect((error as Error).message).toBe(
      "GET /zones/{zone_id}/dns_records answered 401: the token was refused (invalid, expired or revoked)",
    );
  });

  it("a 500 envelope → an error with Cloudflare's codes, never an empty phase", async () => {
    const error = await failure(
      edgeGet(
        answering(500, {
          success: false,
          errors: [{ code: 10000, message: "internal error" }],
          result: null,
        }),
        ZONE,
        `/zones/${ZONE}/rulesets/phases/http_response_headers_transform/entrypoint`,
        true,
      ),
    );
    expect((error as Error).message).toBe(
      "GET /zones/{zone_id}/rulesets/phases/http_response_headers_transform/entrypoint answered 500: 10000 internal error",
    );
  });

  it("a 200 with success:false → an error, never a result", async () => {
    const error = await failure(
      edgeGet(
        answering(200, { success: false, errors: [], result: [] }),
        ZONE,
        DNS,
      ),
    );
    expect((error as Error).message).toBe(
      "GET /zones/{zone_id}/dns_records answered 200: no error detail",
    );
  });

  it("a path off the allow-list is refused before the transport is called", async () => {
    const transport = vi.fn(answering(200, { success: true, result: [] }));
    const error = await failure(
      edgeGet(transport, ZONE, `/zones/${ZONE}/settings/ssl`),
    );
    expect(error).toBeInstanceOf(EndpointNotAllowedError);
    expect((error as Error).message).toBe(
      "GET /zones/{zone_id}/settings/ssl is not on the edge allow-list (scripts/cloudflare/edge.ts EDGE_ENDPOINTS)",
    );
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("the CLI with a token reads the live edge (hole 1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cloudflare:check with the two secrets diffs the zone and then the edge, GETs only", async () => {
    const zone = load("zone-as-declared.json");
    const responses = { ...zone.responses, ...beforeCutover.responses };
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        const key = `${init.method ?? "GET"} ${new URL(url).pathname.replace(/^\/client\/v4/, "").replace(`/zones/${zone.zoneId}`, "/zones/{zone_id}")}`;
        requested.push(key);
        const answer = responses[key] ?? { status: 404, body: null };
        return Promise.resolve(
          new Response(JSON.stringify(answer.body), { status: answer.status }),
        );
      }),
    );
    const result = await run(
      ["--check", "--require-token"],
      {
        CLOUDFLARE_API_TOKEN: "a-token-for-the-stub",
        CLOUDFLARE_ZONE_ID: zone.zoneId,
      },
      repoRoot,
    );
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(requested).toContain(DNS_KEY);
    expect(requested.every((key) => key.startsWith("GET "))).toBe(true);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toContain(
      "cloudflare:check: 26 declared values match config/cloudflare/zone-settings.json",
    );
    expect(lines.at(-1)).toBe(`${VERDICT_OK} (6 notes above)`);
  });
});

describe("the edge suite's production guard (hole 16)", () => {
  it("refuses production however the URL spells it", () => {
    for (const url of [
      "https://flowersoverseas.com",
      "https://flowersoverseas.com.",
      "https://FlowersOverseas.com./en",
      "https://www.flowersoverseas.com.:443",
      "https://staging.flowersoverseas.com@flowersoverseas.com",
    ]) {
      expect(productionRefusal(url), url).toBe(
        `STAGING_URL names production (${hostOf(url)}): this suite never runs there`,
      );
    }
    expect(hostOf("https://flowersoverseas.com.")).toBe("flowersoverseas.com");
  });

  it("lets staging through", () => {
    expect(
      productionRefusal("https://staging.flowersoverseas.com"),
    ).toBeUndefined();
  });

  it("is what the suite's first hook throws on", () => {
    const spec = readFileSync(
      resolve(repoRoot, "tests/e2e/cloudflare-edge.spec.ts"),
      "utf8",
    );
    expect(spec).toContain(
      "const refusal = productionRefusal(STAGING_URL);\n    if (refusal !== undefined) throw new Error(refusal);",
    );
  });
});

describe("the T-16 e2e probes every bypass clause, not a sample (hole 17)", () => {
  it("builds one probe per path under every locale prefix of the registry, 42 today", () => {
    const probes = bypassProbes(
      declared.bypass.paths,
      localePrefixes(),
      "p.css",
    );
    expect(probes).toHaveLength(42);
    expect(new Set(probes).size).toBe(42);
    for (const probe of [
      "/api/p.css",
      "/pl/checkout/p.css",
      "/de/api/p.css",
      "/en-XA/vendor/p.css",
      "/ar-XB/track/p.css",
    ]) {
      expect(probes).toContain(probe);
    }
  });

  it("is what the T-16 case walks", () => {
    const spec = readFileSync(
      resolve(repoRoot, "tests/e2e/cloudflare-edge.spec.ts"),
      "utf8",
    );
    expect(spec).toContain("const EVERY_CLAUSE_PROBE = bypassProbes(");
    expect(spec).toContain("for (const probe of EVERY_CLAUSE_PROBE) {");
  });
});
