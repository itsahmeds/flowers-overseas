/**
 * The declared Cloudflare zone and the comparisons `pnpm cloudflare:check` and
 * `pnpm cloudflare:apply` make (spec 040 §5.4, AC-15, AC-17, AC-23, AC-24; TASK-100).
 *
 * `config/cloudflare/zone-settings.json` is the declared state: the protocol/TLS table of §5.4
 * and its do-not-enable table, each row with its reason. This module parses it with zod, reads
 * the live zone through a {@link ZoneClient}, and diffs the two. The logic lives here rather than
 * in `scripts/cloudflare/apply-zone-settings.ts` so every rule is a test on a function, and the
 * script is argument parsing, one `fetch` and printing (the `src/lib/railway.ts` pattern).
 *
 * Three rules the module exists to keep:
 *
 *  - **`--check` never writes.** A client made in `check` mode refuses every verb but `GET`
 *    before the request reaches the transport, so a write cannot be added to the check path
 *    without the check itself failing (AC-23).
 *  - **Only the allow-listed endpoints are callable.** Every request is matched against
 *    {@link ALLOWED_ENDPOINTS}, with `{zone_id}` bound to the one configured zone. Nothing under
 *    `/accounts/` can be on the list ({@link validateAllowList}) or be called (AC-24).
 *  - **A 403 names the missing scope.** Each allow-listed endpoint carries the token scope it
 *    needs, so a refusal is reported as "the token is missing scope X", never as a stack trace.
 *
 * The token itself never reaches this module: the transport holds it.
 */
import { z } from "zod";

/** Path of the declaration, relative to the repository root. */
export const ZONE_SETTINGS_PATH = "config/cloudflare/zone-settings.json";

/** Cloudflare's v4 API root. */
export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

/** Any JSON value a setting can take (`"on"`, `"1.2"`, `{ css: "off", … }`, `false`). */
export type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };
const jsonSchema: z.ZodType<Json> = z.json();

const identifier = z.string().regex(/^[a-z0-9_]+$/);
const prose = z.string().min(1);

const protocolRowSchema = z.strictObject({
  setting: identifier,
  feature: prose,
  value: jsonSchema,
  reason: prose,
});

const settingEqualsSchema = z.strictObject({
  source: z.literal("setting"),
  setting: identifier,
  value: jsonSchema,
  /** Set when Cloudflare has retired the setting: its endpoint may answer 404 (or 400). */
  retired: prose.optional(),
});

const settingNotEqualsSchema = z.strictObject({
  source: z.literal("setting"),
  setting: identifier,
  /** The one value the setting must not have; nothing is declared to write in its place. */
  notValue: jsonSchema,
});

const botFieldSchema = z.strictObject({
  source: z.literal("bot_management"),
  field: identifier,
  value: jsonSchema,
});

const checkSchema = z.union([
  settingEqualsSchema,
  settingNotEqualsSchema,
  botFieldSchema,
]);

const doNotEnableRowSchema = z
  .strictObject({
    feature: prose,
    state: prose,
    reason: prose,
    checks: z.array(checkSchema),
    /** The gate that owns a row the zone token cannot read. Required when `checks` is empty. */
    checkedElsewhere: prose.optional(),
  })
  .refine(
    (row) => row.checks.length > 0 || row.checkedElsewhere !== undefined,
    {
      message:
        "a row with no checks must name the gate that checks it (checkedElsewhere)",
    },
  );

/** The whole of `config/cloudflare/zone-settings.json`. */
export const zoneSettingsSchema = z
  .strictObject({
    $comment: z.string().optional(),
    zone: z.string().regex(/^[a-z0-9.-]+$/),
    protocol: z.array(protocolRowSchema).min(1),
    doNotEnable: z.array(doNotEnableRowSchema).min(1),
  })
  .superRefine((file, context) => {
    const seen = new Set<string>();
    const keys = [
      ...file.protocol.map((row) => row.setting),
      ...file.doNotEnable.flatMap((row) =>
        row.checks.map((check) => checkKey(check)),
      ),
    ];
    for (const key of keys) {
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: `${key} is declared twice`,
        });
      }
      seen.add(key);
    }
  });
export type ZoneSettings = z.infer<typeof zoneSettingsSchema>;
type Check = z.infer<typeof checkSchema>;

function checkKey(check: Check): string {
  return check.source === "setting"
    ? check.setting
    : `bot_management.${check.field}`;
}

/** One live value the zone must (or must not) have, flattened from both tables. */
export interface Expectation {
  readonly source: "setting" | "bot_management";
  /** The setting id, or the `bot_management` field. */
  readonly key: string;
  /** The label printed on a drift line: the setting id, or `bot_management.<field>`. */
  readonly label: string;
  /** The §5.4 row's name, printed beside the label so the failure names the feature. */
  readonly feature: string;
  readonly expect: { readonly equals: Json } | { readonly notEquals: Json };
  readonly retired?: string | undefined;
}

/** Both tables as one list, in file order: protocol rows first, then every do-not-enable check. */
export function expectations(declared: ZoneSettings): Expectation[] {
  const protocol = declared.protocol.map((row): Expectation => ({
    source: "setting",
    key: row.setting,
    label: row.setting,
    feature: row.feature,
    expect: { equals: row.value },
  }));
  const doNotEnable = declared.doNotEnable.flatMap((row) =>
    row.checks.map((check): Expectation => {
      if (check.source === "bot_management") {
        return {
          source: "bot_management",
          key: check.field,
          label: checkKey(check),
          feature: row.feature,
          expect: { equals: check.value },
        };
      }
      if ("notValue" in check) {
        return {
          source: "setting",
          key: check.setting,
          label: check.setting,
          feature: row.feature,
          expect: { notEquals: check.notValue },
        };
      }
      return {
        source: "setting",
        key: check.setting,
        label: check.setting,
        feature: row.feature,
        expect: { equals: check.value },
        retired: check.retired,
      };
    }),
  );
  return [...protocol, ...doNotEnable];
}

// ---------------------------------------------------------------------------------------------
// Errors a run can end on; each message is printable as it is

/** A request outside {@link ALLOWED_ENDPOINTS}. Raised before the transport is called. */
export class EndpointNotAllowedError extends Error {
  override readonly name = "EndpointNotAllowedError";
}

/** A write attempted by a client made in `check` mode. Raised before the transport is called. */
export class WriteInCheckModeError extends Error {
  override readonly name = "WriteInCheckModeError";
}

/** Cloudflare answered 403: the token lacks the endpoint's scope. */
export class MissingScopeError extends Error {
  override readonly name = "MissingScopeError";
  readonly scope: string;
  readonly request: string;
  constructor(scope: string, request: string) {
    super(`the token is missing scope ${scope} (${request} answered 403)`);
    this.scope = scope;
    this.request = request;
  }
}

/** Any other refusal or malformed answer. Carries Cloudflare's error codes, never the token. */
export class CloudflareApiError extends Error {
  override readonly name = "CloudflareApiError";
  readonly status: number;
  readonly request: string;
  constructor(status: number, request: string, detail: string) {
    super(`${request} answered ${String(status)}: ${detail}`);
    this.status = status;
    this.request = request;
  }
}

// ---------------------------------------------------------------------------------------------
// The endpoint allow-list (AC-24, T-25)

export type HttpMethod = "GET" | "PATCH";

/** One endpoint the scripts may call, with the token scope Cloudflare requires for it. */
export interface AllowedEndpoint {
  readonly method: HttpMethod;
  /** `{zone_id}` is bound to the configured zone; `{setting_id}` to a lower-case identifier. */
  readonly pattern: string;
  readonly scope: string;
}

/**
 * Every endpoint `cloudflare:check` and `cloudflare:apply` may call. Pinned by
 * `tests/unit/cloudflare-zone-endpoints.test.ts`: adding one fails that test until it is pinned
 * there too, and nothing under `/accounts/` can be added at all ({@link validateAllowList}).
 *
 * The runbook's token holds Zone Read, Zone Settings Edit, DNS Edit and Cache Purge on the one
 * zone (spec 040 AC-24). The fourth entry needs a fifth, read-only scope: the do-not-enable rows
 * for Bot Fight Mode, managed `robots.txt` and AI-crawler blocking live in the zone's
 * `bot_management` object, which Cloudflare serves only to a token holding Bot Management Read.
 * TASK-100 escalation E-1 asks for that scope; without it the check fails on a named 403.
 */
export const ALLOWED_ENDPOINTS: readonly AllowedEndpoint[] = [
  { method: "GET", pattern: "/zones/{zone_id}", scope: "Zone → Zone → Read" },
  {
    method: "GET",
    pattern: "/zones/{zone_id}/settings/{setting_id}",
    scope: "Zone → Zone Settings → Edit",
  },
  {
    method: "PATCH",
    pattern: "/zones/{zone_id}/settings/{setting_id}",
    scope: "Zone → Zone Settings → Edit",
  },
  {
    method: "GET",
    pattern: "/zones/{zone_id}/bot_management",
    scope: "Zone → Bot Management → Read",
  },
];

/** Throws when an entry could reach beyond the one zone: every pattern is under `/zones/{zone_id}`. */
export function validateAllowList(list: readonly AllowedEndpoint[]): void {
  for (const entry of list) {
    const zoneScoped =
      entry.pattern === "/zones/{zone_id}" ||
      entry.pattern.startsWith("/zones/{zone_id}/");
    if (!zoneScoped || entry.pattern.includes("/accounts")) {
      throw new EndpointNotAllowedError(
        `${entry.method} ${entry.pattern} is not zone-scoped: no account-level endpoint may be allow-listed`,
      );
    }
  }
}
validateAllowList(ALLOWED_ENDPOINTS);

const SETTING_ID = /^[a-z0-9_]+$/;

/** Segment by segment: `{zone_id}` is the configured zone exactly, `{setting_id}` an identifier. */
function patternMatches(
  pattern: string,
  path: string,
  zoneId: string,
): boolean {
  const expected = pattern.split("/");
  const actual = path.split("/");
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => {
    const part = actual[index] ?? "";
    if (segment === "{zone_id}") return part === zoneId;
    if (segment === "{setting_id}") return SETTING_ID.test(part);
    return part === segment;
  });
}

/** The allow-listed endpoint a request matches, or `undefined`. */
export function matchEndpoint(
  method: string,
  path: string,
  zoneId: string,
  list: readonly AllowedEndpoint[] = ALLOWED_ENDPOINTS,
): AllowedEndpoint | undefined {
  if (path.includes("/accounts")) return undefined;
  return list.find(
    (entry) =>
      entry.method === method && patternMatches(entry.pattern, path, zoneId),
  );
}

// ---------------------------------------------------------------------------------------------
// The client

export interface ApiRequest {
  readonly method: HttpMethod;
  /** Path under {@link CLOUDFLARE_API_BASE}, e.g. `/zones/<id>/settings/ssl`. */
  readonly path: string;
  readonly body?: Json | undefined;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** The one seam between this module and the network (or a recorded response). */
export type Transport = (request: ApiRequest) => Promise<ApiResponse>;

const envelopeSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(z.object({ code: z.number(), message: z.string() }))
    .default([]),
  result: z.unknown(),
});

const settingResultSchema = z.object({
  id: z.string(),
  value: jsonSchema,
  editable: z.boolean().optional(),
});
export type SettingResult = z.infer<typeof settingResultSchema>;

const zoneResultSchema = z.object({ id: z.string(), name: z.string() });

const botManagementResultSchema = z.record(z.string(), jsonSchema);

/** A retired setting whose endpoint Cloudflare no longer serves. */
export interface RetiredSetting {
  readonly retired: true;
  readonly status: number;
}

export type ClientMode = "check" | "apply";

export interface ZoneClient {
  readonly mode: ClientMode;
  getZone(): Promise<{ readonly id: string; readonly name: string }>;
  /** `tolerateRetired`: a 404 or 400 answers {@link RetiredSetting} instead of throwing. */
  getSetting(
    id: string,
    tolerateRetired?: boolean,
  ): Promise<SettingResult | RetiredSetting>;
  patchSetting(id: string, value: Json): Promise<SettingResult>;
  getBotManagement(): Promise<Record<string, Json>>;
}

export interface ZoneClientOptions {
  readonly zoneId: string;
  readonly mode: ClientMode;
  readonly transport: Transport;
}

class RetiredResponse {
  readonly status: number;
  constructor(status: number) {
    this.status = status;
  }
}

export function createZoneClient(options: ZoneClientOptions): ZoneClient {
  const { zoneId, mode, transport } = options;
  const zonePath = `/zones/${zoneId}`;

  async function request(
    call: ApiRequest,
    tolerateRetired = false,
  ): Promise<unknown> {
    const label = `${call.method} ${call.path.replace(zonePath, "/zones/{zone_id}")}`;
    const endpoint = matchEndpoint(call.method, call.path, zoneId);
    if (endpoint === undefined) {
      throw new EndpointNotAllowedError(
        `${label} is not on the endpoint allow-list (src/lib/cloudflare-zone.ts ALLOWED_ENDPOINTS)`,
      );
    }
    if (mode === "check" && call.method !== "GET") {
      throw new WriteInCheckModeError(
        `${label} refused: cloudflare:check performs no write`,
      );
    }
    const response = await transport(call);
    if (response.status === 403) {
      throw new MissingScopeError(endpoint.scope, label);
    }
    if (
      tolerateRetired &&
      (response.status === 404 || response.status === 400)
    ) {
      return new RetiredResponse(response.status);
    }
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
    return envelope.data.result;
  }

  function parse<T>(schema: z.ZodType<T>, result: unknown, what: string): T {
    const parsed = schema.safeParse(result);
    if (!parsed.success) {
      throw new CloudflareApiError(
        200,
        what,
        `unexpected result shape (${parsed.error.issues.map((issue) => issue.path.join(".") || "result").join(", ")})`,
      );
    }
    return parsed.data;
  }

  return {
    mode,
    async getZone() {
      const result = await request({ method: "GET", path: zonePath });
      return parse(zoneResultSchema, result, "GET /zones/{zone_id}");
    },
    async getSetting(id, tolerateRetired = false) {
      const result = await request(
        { method: "GET", path: `${zonePath}/settings/${id}` },
        tolerateRetired,
      );
      if (result instanceof RetiredResponse) {
        return { retired: true, status: result.status };
      }
      return parse(settingResultSchema, result, `GET settings/${id}`);
    },
    async patchSetting(id, value) {
      const result = await request({
        method: "PATCH",
        path: `${zonePath}/settings/${id}`,
        body: { value },
      });
      return parse(settingResultSchema, result, `PATCH settings/${id}`);
    },
    async getBotManagement() {
      const result = await request({
        method: "GET",
        path: `${zonePath}/bot_management`,
      });
      return parse(
        botManagementResultSchema,
        result,
        "GET /zones/{zone_id}/bot_management",
      );
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Check and apply

/** Stable JSON for comparison and printing: object keys sorted, so `{js, css}` equals `{css, js}`. */
export function canonical(value: Json | undefined): string {
  if (value === undefined) return "absent";
  if (Array.isArray(value)) {
    return `[${value.map((item: Json) => canonical(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as { readonly [key: string]: Json };
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** One declared value the live zone does not have. */
export interface Drift {
  readonly expectation: Expectation;
  /** The live value, `undefined` when the API does not report the field. */
  readonly live: Json | undefined;
  /** Whether the live setting reported itself `editable`. */
  readonly editable: boolean;
}

/** `setting · declared · live` (spec 040 §5.4), then the §5.4 row it belongs to. */
export function driftLine(drift: Drift): string {
  const { expectation } = drift;
  const declared =
    "equals" in expectation.expect
      ? canonical(expectation.expect.equals)
      : `not ${canonical(expectation.expect.notEquals)}`;
  return `${expectation.label} · declared ${declared} · live ${canonical(drift.live)} · ${expectation.feature}`;
}

/** A drift `cloudflare:apply` can write: an equality on a live, editable zone setting. */
export function isWritable(drift: Drift): boolean {
  return (
    drift.expectation.source === "setting" &&
    "equals" in drift.expectation.expect &&
    drift.expectation.retired === undefined &&
    drift.editable
  );
}

export interface ZoneCheckReport {
  readonly ok: boolean;
  readonly drifts: readonly Drift[];
  /** Everything printed, in order: drift lines, notes on retired settings, the verdict. */
  readonly lines: readonly string[];
}

function holds(expectation: Expectation, live: Json | undefined): boolean {
  if (live === undefined) return false;
  return "equals" in expectation.expect
    ? canonical(live) === canonical(expectation.expect.equals)
    : canonical(live) !== canonical(expectation.expect.notEquals);
}

/**
 * Read every declared value and diff it (AC-15, AC-17). Issues `GET`s only. A zone whose name is
 * not the declared zone stops the run: comparing another zone's settings would be meaningless.
 */
export async function checkZone(
  declared: ZoneSettings,
  client: ZoneClient,
): Promise<ZoneCheckReport> {
  const zone = await client.getZone();
  if (zone.name !== declared.zone) {
    return {
      ok: false,
      drifts: [],
      lines: [
        `zone · declared ${declared.zone} · live ${zone.name} · CLOUDFLARE_ZONE_ID names another zone`,
      ],
    };
  }

  const settings = new Map<string, SettingResult | RetiredSetting>();
  let botManagement: Record<string, Json> | undefined;
  const drifts: Drift[] = [];
  const notes: string[] = [];

  for (const expectation of expectations(declared)) {
    let live: Json | undefined;
    let editable = false;
    if (expectation.source === "bot_management") {
      botManagement ??= await client.getBotManagement();
      live = botManagement[expectation.key];
    } else {
      let setting = settings.get(expectation.key);
      if (setting === undefined) {
        setting = await client.getSetting(
          expectation.key,
          expectation.retired !== undefined,
        );
        settings.set(expectation.key, setting);
      }
      if ("retired" in setting) {
        notes.push(
          `${expectation.label} · retired by Cloudflare (${String(setting.status)}) · counts as off · ${expectation.retired ?? expectation.feature}`,
        );
        continue;
      }
      live = setting.value;
      editable = setting.editable !== false;
    }
    if (!holds(expectation, live)) {
      drifts.push({ expectation, live, editable });
    }
  }

  const ok = drifts.length === 0;
  const checked = expectations(declared).length;
  const verdict = ok
    ? `cloudflare:check: ${String(checked)} declared values match ${ZONE_SETTINGS_PATH}`
    : `cloudflare:check: ${String(drifts.length)} of ${String(checked)} declared values differ from ${ZONE_SETTINGS_PATH}`;
  return {
    ok,
    drifts,
    lines: [...drifts.map((drift) => driftLine(drift)), ...notes, verdict],
  };
}

export interface ZoneApplyReport {
  readonly ok: boolean;
  /** The number of settings written; a second run reports `0 changes` (AC-23). */
  readonly changes: number;
  /** Drifts this script does not write: read-only, retired or `notValue` rows. */
  readonly manual: readonly Drift[];
  readonly lines: readonly string[];
}

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

/**
 * Write every writable drift, then report (AC-23). Idempotent: it writes only what `checkZone`
 * reports as different, so a second run finds nothing and prints `0 changes`. A drift it cannot
 * write — a `bot_management` field, Under Attack mode, a setting the plan makes read-only — is
 * printed as `manual:` and fails the run.
 */
export async function applyZone(
  declared: ZoneSettings,
  client: ZoneClient,
): Promise<ZoneApplyReport> {
  const report = await checkZone(declared, client);
  if (!report.ok && report.drifts.length === 0) {
    return { ok: false, changes: 0, manual: [], lines: [...report.lines] };
  }
  const lines: string[] = [];
  const manual: Drift[] = [];
  let changes = 0;
  for (const drift of report.drifts) {
    const { expectation } = drift;
    if (!isWritable(drift) || !("equals" in expectation.expect)) {
      manual.push(drift);
      lines.push(`manual: ${driftLine(drift)}`);
      continue;
    }
    const written = await client.patchSetting(
      expectation.key,
      expectation.expect.equals,
    );
    if (canonical(written.value) !== canonical(expectation.expect.equals)) {
      throw new CloudflareApiError(
        200,
        `PATCH settings/${expectation.key}`,
        `Cloudflare answered ${canonical(written.value)} after the write`,
      );
    }
    changes += 1;
    lines.push(
      `changed ${expectation.label} · ${canonical(drift.live)} → ${canonical(expectation.expect.equals)} · ${expectation.feature}`,
    );
  }
  lines.push(
    manual.length === 0
      ? `cloudflare:apply: ${plural(changes, "change")}`
      : `cloudflare:apply: ${plural(changes, "change")}, ${String(manual.length)} to change by hand (lines marked manual:)`,
  );
  return { ok: manual.length === 0, changes, manual, lines };
}

// ---------------------------------------------------------------------------------------------
// Recorded responses: the mock API behind `--fixture` and the contract tests (T-15, T-17, T-24)

const recordedResponseSchema = z.object({
  status: z.number().int(),
  body: z.unknown(),
});

/** A file under `tests/fixtures/cloudflare/`: one recorded answer per `METHOD /path`. */
export const recordedZoneSchema = z.object({
  $comment: z.string().optional(),
  zoneId: z.string().min(1),
  /** Keyed `GET /zones/{zone_id}/settings/ssl`: the zone id is a placeholder in the key. */
  responses: z.record(z.string(), recordedResponseSchema),
});
export type RecordedZone = z.infer<typeof recordedZoneSchema>;

export interface RecordedTransport {
  readonly transport: Transport;
  /** Every request made, in order, as `METHOD /zones/{zone_id}/…`. */
  readonly calls: string[];
}

const recordedSettingSchema = z.object({
  success: z.literal(true),
  errors: z.array(z.unknown()),
  messages: z.array(z.unknown()).optional(),
  result: settingResultSchema.loose(),
});

/**
 * Answers from the recorded responses, and behaves like the API on a write: a `PATCH` to a
 * setting replaces the recorded `value`, so a later `GET` sees it (T-24's second run). A setting
 * recorded `editable: false` refuses the write with 400, as Cloudflare does. A request with no
 * recording answers 404.
 */
export function createRecordedTransport(
  recorded: RecordedZone,
): RecordedTransport {
  const responses = new Map(
    Object.entries(structuredClone(recorded.responses)),
  );
  const calls: string[] = [];
  const zonePath = `/zones/${recorded.zoneId}`;
  const notFound: ApiResponse = {
    status: 404,
    body: {
      success: false,
      errors: [
        { code: 7003, message: "Could not route to the requested path" },
      ],
      messages: [],
      result: null,
    },
  };

  const transport: Transport = (request) => {
    const key = `${request.method} ${request.path.replace(zonePath, "/zones/{zone_id}")}`;
    calls.push(key);
    if (request.method === "GET") {
      return Promise.resolve(responses.get(key) ?? notFound);
    }
    const getKey = key.replace(/^PATCH /, "GET ");
    const current = responses.get(getKey);
    if (current === undefined) return Promise.resolve(notFound);
    if (current.status !== 200) return Promise.resolve(current);
    const setting = recordedSettingSchema.parse(current.body);
    if (setting.result.editable === false) {
      return Promise.resolve({
        status: 400,
        body: {
          success: false,
          errors: [{ code: 1007, message: "This setting is not editable" }],
          messages: [],
          result: null,
        },
      });
    }
    const value = z.object({ value: jsonSchema }).parse(request.body).value;
    const updated = {
      status: 200,
      body: { ...setting, result: { ...setting.result, value } },
    };
    responses.set(getKey, updated);
    return Promise.resolve(updated);
  };
  return { transport, calls };
}
