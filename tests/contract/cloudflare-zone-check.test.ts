/**
 * `pnpm cloudflare:check` and `pnpm cloudflare:apply` against recorded zone responses (spec 040
 * AC-15 / T-15, AC-17 / T-17, AC-23 / T-24, AC-24; TASK-100).
 *
 * A contract test because `tests/fixtures/cloudflare/` is the shape of a boundary we do not own:
 * if Cloudflare renames a setting or changes its envelope, the parse fails here, loudly, rather
 * than the gate reporting "no drift" on an answer it no longer understands.
 *
 * The case lists below are written out, not derived from `config/cloudflare/zone-settings.json`:
 * a row dropped from the declaration, or skipped by the comparison, leaves its case expecting a
 * named failure that no longer comes, so the case goes red.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  loadDeclaredZone,
  run,
} from "../../scripts/cloudflare/apply-zone-settings.ts";
import {
  ALLOWED_ENDPOINTS,
  CloudflareApiError,
  type Json,
  type RecordedZone,
  applyZone,
  checkZone,
  createRecordedTransport,
  createZoneClient,
  matchEndpoint,
  recordedZoneSchema,
} from "../../src/lib/cloudflare-zone";

const repoRoot = resolve(__dirname, "../..");
const declared = loadDeclaredZone(repoRoot);
const asDeclared: RecordedZone = recordedZoneSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(repoRoot, "tests/fixtures/cloudflare/zone-as-declared.json"),
      "utf8",
    ),
  ),
);
const recorded403 = JSON.parse(
  readFileSync(
    resolve(repoRoot, "tests/fixtures/cloudflare/response-403.json"),
    "utf8",
  ),
) as { status: number; body: unknown };

const settingKey = (id: string) => `GET /zones/{zone_id}/settings/${id}`;
const BOT_KEY = "GET /zones/{zone_id}/bot_management";

interface Envelope {
  success: boolean;
  errors: unknown[];
  messages: unknown[];
  result: Record<string, Json>;
}

/** The recorded zone with one setting answering `value` (recorded 200 even where it was not). */
function withSetting(id: string, value: Json, base = asDeclared): RecordedZone {
  const copy = structuredClone(base);
  copy.responses[settingKey(id)] = {
    status: 200,
    body: {
      success: true,
      errors: [],
      messages: [],
      result: {
        id,
        value,
        editable: true,
        modified_on: "2026-09-30T08:00:00.000000Z",
      },
    },
  };
  return copy;
}

/** The recorded zone with one `bot_management` field answering `value`. */
function withBotField(
  field: string,
  value: Json,
  base = asDeclared,
): RecordedZone {
  const copy = structuredClone(base);
  const entry = copy.responses[BOT_KEY];
  if (entry === undefined) throw new Error("fixture has no bot_management");
  const envelope = entry.body as Envelope;
  envelope.result[field] = value;
  return copy;
}

function checkOf(recorded: RecordedZone) {
  const { transport, calls } = createRecordedTransport(recorded);
  const client = createZoneClient({
    zoneId: recorded.zoneId,
    mode: "check",
    transport,
  });
  return { report: checkZone(declared, client), calls };
}

describe("the recorded zone parses and matches the declaration", () => {
  it("passes, with Mirage noted as retired and nothing else printed", async () => {
    const { report } = checkOf(asDeclared);
    const result = await report;
    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
    expect(result.lines).toEqual([
      "mirage · retired by Cloudflare (404) · counts as off · Cloudflare sunset Mirage in January 2026 with no replacement",
      "cloudflare:check: 26 declared values match config/cloudflare/zone-settings.json",
    ]);
  });
});

/** AC-15's nine settings, the value each must have, a wrong value, and the §5.4 row name. */
const PROTOCOL_CASES: readonly [string, string, string, string][] = [
  ["ssl", "strict", "full", "SSL/TLS mode"],
  ["always_use_https", "on", "off", "Always Use HTTPS"],
  ["min_tls_version", "1.2", "1.0", "Minimum TLS"],
  ["tls_1_3", "zrt", "on", "TLS 1.3 (with 0-RTT)"],
  ["0rtt", "on", "off", "0-RTT"],
  ["http2", "on", "off", "HTTP/2"],
  ["http3", "on", "off", "HTTP/3 (QUIC)"],
  ["brotli", "on", "off", "Brotli"],
  ["early_hints", "on", "off", "Early Hints"],
];

describe("each protocol/TLS setting wrong in turn → one named failure (AC-15, T-15)", () => {
  for (const [id, value, wrong, feature] of PROTOCOL_CASES) {
    it(`${id} = ${wrong}`, async () => {
      const result = await checkOf(withSetting(id, wrong)).report;
      expect(result.ok).toBe(false);
      expect(result.drifts.map((drift) => drift.expectation.label)).toEqual([
        id,
      ]);
      expect(result.lines[0]).toBe(
        `${id} · declared "${value}" · live "${wrong}" · ${feature}`,
      );
      expect(result.lines.at(-1)).toBe(
        "cloudflare:check: 1 of 26 declared values differ from config/cloudflare/zone-settings.json",
      );
    });
  }

  it("keeps Automatic HTTPS Rewrites off as well: it rewrites HTML", async () => {
    const result = await checkOf(withSetting("automatic_https_rewrites", "on"))
      .report;
    expect(result.lines[0]).toBe(
      'automatic_https_rewrites · declared "off" · live "on" · Automatic HTTPS Rewrites',
    );
  });
});

/** Every check of §5.4's do-not-enable table, switched on. `bot` marks a `bot_management` field. */
const DO_NOT_ENABLE_CASES: readonly {
  feature: string;
  key: string;
  bot?: true;
  declared: string;
  on: Json;
}[] = [
  {
    feature: "Rocket Loader",
    key: "rocket_loader",
    declared: '"off"',
    on: "on",
  },
  {
    feature: "Auto Minify (HTML/CSS/JS)",
    key: "minify",
    declared: '{"css":"off","html":"off","js":"off"}',
    on: { css: "off", html: "on", js: "off" },
  },
  {
    feature: "Email Address Obfuscation",
    key: "email_obfuscation",
    declared: '"off"',
    on: "on",
  },
  {
    feature: "Server-Side Excludes",
    key: "server_side_exclude",
    declared: '"off"',
    on: "on",
  },
  {
    feature: "Mirage / Polish (on HTML documents)",
    key: "mirage",
    declared: '"off"',
    on: "on",
  },
  {
    feature: "Mirage / Polish (on HTML documents)",
    key: "polish",
    declared: '"off"',
    on: "lossless",
  },
  {
    feature: "Hotlink Protection / Scrape Shield changes",
    key: "hotlink_protection",
    declared: '"off"',
    on: "on",
  },
  {
    feature: "Managed robots.txt / Bot Preference Sync",
    key: "is_robots_txt_managed",
    bot: true,
    declared: "false",
    on: true,
  },
  {
    feature: "Managed robots.txt / Bot Preference Sync",
    key: "bot_preference_sync_enabled",
    bot: true,
    declared: "false",
    on: true,
  },
  {
    feature: "Bot Fight Mode / Super Bot Fight Mode",
    key: "fight_mode",
    bot: true,
    declared: "false",
    on: true,
  },
  ...(
    [
      "ai_bots_protection",
      "crawler_protection",
      "ai_search",
      "ai_user",
      "ai_training",
    ] as const
  ).map((key) => ({
    feature:
      "AI Scrapers & Crawlers blocking / AI Labyrinth / pay-per-crawl; Search, Agent and Training set to Allow",
    key,
    bot: true as const,
    declared: '"disabled"',
    on: key === "crawler_protection" ? "enabled" : "block",
  })),
  {
    feature: "Under Attack mode",
    key: "security_level",
    declared: 'not "under_attack"',
    on: "under_attack",
  },
];

describe("each do-not-enable feature switched on → the check fails naming it (AC-17, T-17)", () => {
  for (const row of DO_NOT_ENABLE_CASES) {
    const label = row.bot === true ? `bot_management.${row.key}` : row.key;
    it(`${label} = ${JSON.stringify(row.on)}`, async () => {
      const recorded =
        row.bot === true
          ? withBotField(row.key, row.on)
          : withSetting(row.key, row.on);
      const result = await checkOf(recorded).report;
      expect(result.ok).toBe(false);
      expect(result.drifts.map((drift) => drift.expectation.label)).toEqual([
        label,
      ]);
      expect(result.lines[0]).toBe(
        `${label} · declared ${row.declared} · live ${JSON.stringify(row.on)} · ${row.feature}`,
      );
    });
  }

  it("has a case above for every check the declaration makes", () => {
    const declaredLabels = declared.doNotEnable.flatMap((row) =>
      row.checks.map((check) =>
        check.source === "setting"
          ? check.setting
          : `bot_management.${check.field}`,
      ),
    );
    const caseLabels = DO_NOT_ENABLE_CASES.map((row) =>
      row.bot === true ? `bot_management.${row.key}` : row.key,
    );
    expect(caseLabels).toEqual(declaredLabels);
  });

  it("declares every row of §5.4's table, and names the gate for the four the zone token cannot read", () => {
    expect(declared.doNotEnable.map((row) => row.feature)).toEqual([
      "Rocket Loader",
      "Auto Minify (HTML/CSS/JS)",
      "Email Address Obfuscation",
      "Server-Side Excludes",
      "Mirage / Polish (on HTML documents)",
      "Hotlink Protection / Scrape Shield changes",
      "Managed robots.txt / Bot Preference Sync",
      "Bot Fight Mode / Super Bot Fight Mode",
      "AI Scrapers & Crawlers blocking / AI Labyrinth / pay-per-crawl; Search, Agent and Training set to Allow",
      "Under Attack mode",
      "IP-geolocation redirect rules; any use of `cf-ipcountry` to route",
      "Cloudflare Access on production",
      "Cloudflare Access / basic-auth on staging and PR",
      "Workers / Snippets injecting HTML",
    ]);
    expect(
      declared.doNotEnable
        .filter((row) => row.checks.length === 0)
        .map((row) => row.feature),
    ).toEqual(declared.doNotEnable.slice(10).map((row) => row.feature));
    for (const row of declared.doNotEnable) {
      expect(row.reason, row.feature).not.toBe("");
    }
  });

  it("fails on a bot_management field the API stops reporting, rather than passing it", async () => {
    const copy = structuredClone(asDeclared);
    const envelope = copy.responses[BOT_KEY]?.body as Envelope;
    delete envelope.result["fight_mode"];
    const result = await checkOf(copy).report;
    expect(result.lines[0]).toBe(
      "bot_management.fight_mode · declared false · live absent · Bot Fight Mode / Super Bot Fight Mode",
    );
  });

  it("tolerates a 404 only on a retired setting: a missing live setting is an error, not a pass", async () => {
    const copy = structuredClone(asDeclared);
    copy.responses[settingKey("rocket_loader")] = {
      status: 404,
      body: {
        success: false,
        errors: [{ code: 1003, message: "Invalid or missing zone setting id" }],
        messages: [],
        result: null,
      },
    };
    const failure = await checkOf(copy).report.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CloudflareApiError);
    expect((failure as Error).message).toBe(
      "GET /zones/{zone_id}/settings/rocket_loader answered 404: 1003 Invalid or missing zone setting id",
    );
  });

  it("stops on a zone that is not flowersoverseas.com and compares nothing", async () => {
    const copy = structuredClone(asDeclared);
    const zone = copy.responses["GET /zones/{zone_id}"]?.body as Envelope;
    zone.result["name"] = "example.com";
    const { report, calls } = checkOf(copy);
    const result = await report;
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "zone · declared flowersoverseas.com · live example.com · CLOUDFLARE_ZONE_ID names another zone",
    ]);
    expect(calls).toEqual(["GET /zones/{zone_id}"]);
  });
});

/** Four editable settings drifted at once: what a first `cloudflare:apply` meets. */
const drifted = withSetting(
  "rocket_loader",
  "on",
  withSetting(
    "early_hints",
    "off",
    withSetting("brotli", "off", withSetting("ssl", "full")),
  ),
);

/**
 * Cloudflare's `tls_1_3` takes `"on"`, `"zrt"` or `"off"`, and `zrt` is TLS 1.3 with 0-RTT
 * (developers.cloudflare.com/ssl/edge-certificates/additional-options/tls-13/). `0rtt` is the same
 * switch seen from the other side: writing `0rtt: "on"` turns `tls_1_3` into `"zrt"`, and writing
 * `tls_1_3: "on"` turns 0-RTT off. The founder's live run of 2026-10-03 found it: apply, apply,
 * check gave 8 changes, then `changed tls_1_3 · "zrt" → "on"`, then `0rtt · declared "on" · live
 * "off"`. The recorded transport models the coupling, so that sequence is replayed here.
 */
describe("TLS 1.3 and 0-RTT are one switch at Cloudflare (AC-15, AC-23, T-24)", () => {
  /** The zone before the founder's first apply, as far as these two settings go. */
  const beforeFirstApply = withSetting(
    "0rtt",
    "off",
    withSetting("tls_1_3", "on"),
  );
  const clientOver = (recorded: RecordedZone) => {
    const { transport, calls } = createRecordedTransport(recorded);
    return {
      client: createZoneClient({
        zoneId: recorded.zoneId,
        mode: "apply",
        transport,
      }),
      calls,
    };
  };

  it('replays the 2026-10-03 live run on the old declaration (tls_1_3 "on"): it never settles', async () => {
    const old = structuredClone(declared);
    const tls = old.protocol.find((row) => row.setting === "tls_1_3");
    if (tls === undefined) throw new Error("no tls_1_3 row");
    tls.value = "on";
    const { client } = clientOver(beforeFirstApply);

    const first = await applyZone(old, client);
    expect(first.lines).toEqual([
      'changed 0rtt · "off" → "on" · 0-RTT',
      "cloudflare:apply: 1 change",
    ]);
    const second = await applyZone(old, client);
    expect(second.lines).toEqual([
      'changed tls_1_3 · "zrt" → "on" · TLS 1.3 (with 0-RTT)',
      "cloudflare:apply: 1 change",
    ]);
    const check = await checkZone(old, client);
    expect(check.lines[0]).toBe('0rtt · declared "on" · live "off" · 0-RTT');
    expect(check.ok).toBe(false);
  });

  it('the declaration (tls_1_3 "zrt"): apply, then 0 changes, then a clean check', async () => {
    const { client, calls } = clientOver(beforeFirstApply);

    const first = await applyZone(declared, client);
    expect(first.lines).toEqual([
      'changed tls_1_3 · "on" → "zrt" · TLS 1.3 (with 0-RTT)',
      'changed 0rtt · "off" → "on" · 0-RTT',
      "cloudflare:apply: 2 changes",
    ]);
    const before = calls.length;
    const second = await applyZone(declared, client);
    expect(second.lines).toEqual(["cloudflare:apply: 0 changes"]);
    expect(calls.slice(before).every((call) => call.startsWith("GET "))).toBe(
      true,
    );
    const check = await checkZone(declared, client);
    expect(check.ok).toBe(true);
    expect(check.lines.at(-1)).toBe(
      "cloudflare:check: 26 declared values match config/cloudflare/zone-settings.json",
    );
  });

  it("settles from TLS 1.3 switched off as well: one write of `zrt` brings 0-RTT with it", async () => {
    const off = withSetting("tls_1_3", "off", withSetting("0rtt", "off"));
    const { client } = clientOver(off);
    const first = await applyZone(declared, client);
    expect(first.lines.at(-1)).toBe("cloudflare:apply: 2 changes");
    expect((await applyZone(declared, client)).changes).toBe(0);
    expect((await checkZone(declared, client)).ok).toBe(true);
  });
});

describe("apply is idempotent and --check never writes (AC-23, T-24)", () => {
  it("writes the four differences, then reports 0 changes on the second run", async () => {
    const { transport, calls } = createRecordedTransport(drifted);
    const client = createZoneClient({
      zoneId: drifted.zoneId,
      mode: "apply",
      transport,
    });

    const first = await applyZone(declared, client);
    expect(first.changes).toBe(4);
    expect(first.ok).toBe(true);
    expect(first.lines.filter((line) => line.startsWith("changed "))).toEqual([
      'changed ssl · "full" → "strict" · SSL/TLS mode',
      'changed brotli · "off" → "on" · Brotli',
      'changed early_hints · "off" → "on" · Early Hints',
      'changed rocket_loader · "on" → "off" · Rocket Loader',
    ]);
    expect(first.lines.at(-1)).toBe("cloudflare:apply: 4 changes");
    expect(calls.filter((call) => call.startsWith("PATCH "))).toEqual([
      "PATCH /zones/{zone_id}/settings/ssl",
      "PATCH /zones/{zone_id}/settings/brotli",
      "PATCH /zones/{zone_id}/settings/early_hints",
      "PATCH /zones/{zone_id}/settings/rocket_loader",
    ]);

    const before = calls.length;
    const second = await applyZone(declared, client);
    expect(second.changes).toBe(0);
    expect(second.lines).toEqual(["cloudflare:apply: 0 changes"]);
    expect(calls.slice(before).every((call) => call.startsWith("GET "))).toBe(
      true,
    );
  });

  it("--check on the drifted zone issues GETs only: one for the zone, each setting and bot management", async () => {
    const { report, calls } = checkOf(drifted);
    const result = await report;
    expect(result.drifts).toHaveLength(4);
    expect(calls.filter((call) => !call.startsWith("GET "))).toEqual([]);
    // 1 zone + 18 distinct settings + 1 bot_management: every declared value is read once.
    expect(calls).toHaveLength(20);
    expect(new Set(calls).size).toBe(20);
  });

  it("calls nothing outside the allow-list across a check and two applies", async () => {
    const { transport, calls } = createRecordedTransport(drifted);
    const client = createZoneClient({
      zoneId: drifted.zoneId,
      mode: "apply",
      transport,
    });
    await applyZone(declared, client);
    await applyZone(declared, client);
    for (const call of calls) {
      const [method = "", path = ""] = call.split(" ");
      const concrete = path.replace("{zone_id}", drifted.zoneId);
      expect(
        matchEndpoint(method, concrete, drifted.zoneId),
        call,
      ).toBeDefined();
    }
    expect(ALLOWED_ENDPOINTS.length).toBe(4);
  });

  it("does not switch Under Attack mode off itself: it reports it as manual and fails", async () => {
    const recorded = withSetting("security_level", "under_attack");
    const { transport, calls } = createRecordedTransport(recorded);
    const client = createZoneClient({
      zoneId: recorded.zoneId,
      mode: "apply",
      transport,
    });
    const result = await applyZone(declared, client);
    expect(result.ok).toBe(false);
    expect(result.changes).toBe(0);
    expect(result.lines).toEqual([
      'manual: security_level · declared not "under_attack" · live "under_attack" · Under Attack mode',
      "cloudflare:apply: 0 changes, 1 to change by hand (lines marked manual:)",
    ]);
    expect(calls.filter((call) => call.startsWith("PATCH "))).toEqual([]);
  });

  it("reports a read-only setting and a bot_management field as manual, without writing either", async () => {
    const readOnly = structuredClone(withBotField("fight_mode", true));
    const http2 = readOnly.responses[settingKey("http2")]?.body as Envelope;
    http2.result["value"] = "off";
    const { transport, calls } = createRecordedTransport(readOnly);
    const client = createZoneClient({
      zoneId: readOnly.zoneId,
      mode: "apply",
      transport,
    });
    const result = await applyZone(declared, client);
    expect(result.manual.map((drift) => drift.expectation.label)).toEqual([
      "http2",
      "bot_management.fight_mode",
    ]);
    expect(calls.filter((call) => call.startsWith("PATCH "))).toEqual([]);
  });

  it("stops when Cloudflare answers a write with another value than the one written", async () => {
    const recorded = withSetting("ssl", "full");
    const { transport } = createRecordedTransport(recorded);
    const client = createZoneClient({
      zoneId: recorded.zoneId,
      mode: "apply",
      transport: async (request) => {
        const answer = await transport(request);
        if (request.method !== "PATCH") return answer;
        const body = structuredClone(answer.body) as Envelope;
        body.result["value"] = "flexible";
        return { status: 200, body };
      },
    });
    await expect(applyZone(declared, client)).rejects.toThrow(
      'PATCH settings/ssl answered 200: Cloudflare answered "flexible" after the write',
    );
  });
});

describe("the CLI (AC-23, AC-24): exit codes, credentials, and nothing secret printed", () => {
  const scratch = mkdtempSync(join(tmpdir(), "cloudflare-check-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
  const fixtureFile = (name: string, recorded: unknown): string => {
    const path = join(scratch, name);
    writeFileSync(path, JSON.stringify(recorded));
    return path;
  };
  const SENTINEL = "SENTINEL-TOKEN-VALUE";

  const spawn = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      ["scripts/cloudflare/apply-zone-settings.ts", ...args],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "", NODE_ENV: "test", ...env },
      },
    );

  it("without credentials: `skipped: no token`, exit 0", () => {
    const result = spawn(["--check"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("skipped: no token\n");
  });

  it("without credentials under --require-token (the CI job): exit 2 naming both", () => {
    const result = spawn(["--check", "--require-token"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "cloudflare:check needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID, and neither is set. In CI they are the repository secrets of the same names (docs/runbooks/railway-cloudflare-setup.md, section Cloudflare zone settings); this run must not pass without them.\n",
    );
  });

  it("with the token only: exit 2 naming the zone id, and the token never printed", async () => {
    const result = await run(
      ["--check"],
      { CLOUDFLARE_API_TOKEN: SENTINEL },
      repoRoot,
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      "cloudflare:check needs CLOUDFLARE_ZONE_ID: CLOUDFLARE_API_TOKEN is set and CLOUDFLARE_ZONE_ID is not (docs/runbooks/railway-cloudflare-setup.md, section Cloudflare zone settings)\n",
    );
    expect(result.stdout + result.stderr).not.toContain(SENTINEL);
  });

  it("with the zone id only: exit 2 naming the token", async () => {
    const result = await run(
      ["--check", "--require-token"],
      { CLOUDFLARE_ZONE_ID: "z" },
      repoRoot,
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      "cloudflare:check needs CLOUDFLARE_API_TOKEN:",
    );
  });

  it("--check on drift: one line per difference on stdout, exit 1", () => {
    const result = spawn([
      "--check",
      "--fixture",
      fixtureFile("drifted.json", drifted),
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout.split("\n").slice(0, 4)).toEqual([
      'ssl · declared "strict" · live "full" · SSL/TLS mode',
      'brotli · declared "on" · live "off" · Brotli',
      'early_hints · declared "on" · live "off" · Early Hints',
      'rocket_loader · declared "off" · live "on" · Rocket Loader',
    ]);
    expect(result.stderr).toBe(
      "cloudflare:check failed: each line above names a setting that differs from config/cloudflare/zone-settings.json.\n",
    );
  });

  it("--check on the declared zone: exit 0", () => {
    const result = spawn([
      "--check",
      "--fixture",
      "tests/fixtures/cloudflare/zone-as-declared.json",
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("a recorded 403 on bot_management: exit 3 naming the missing scope, not a stack trace", () => {
    const copy = structuredClone(asDeclared);
    copy.responses[BOT_KEY] = recorded403;
    const result = spawn([
      "--check",
      "--fixture",
      fixtureFile("forbidden.json", copy),
    ]);
    expect(result.status).toBe(3);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "cloudflare:check: the token is missing scope Zone → Bot Management → Read (GET /zones/{zone_id}/bot_management answered 403)\n",
    );
  });

  it("apply against a drifted recording: 4 changes, exit 0", async () => {
    const result = await run(
      ["--fixture", fixtureFile("apply.json", drifted)],
      {},
      repoRoot,
    );
    expect(result.code).toBe(0);
    expect(result.stdout.trimEnd().split("\n").at(-1)).toBe(
      "cloudflare:apply: 4 changes",
    );
  });
});
