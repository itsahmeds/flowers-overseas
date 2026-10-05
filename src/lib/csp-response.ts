/**
 * The per-response Content-Security-Policy of a cached HTML document (spec 004 §14 A2, AC-23,
 * ADR-0016; TASK-058).
 *
 * **Loaded by Node directly, not by the bundler.** `src/lib/csp-cache-handler.ts` imports this
 * file, and Next loads that handler with a bare `import()` at server start, in `next start` and in
 * the standalone container alike, so both files run on Node's own type stripping. Hence the rules
 * every line here keeps: erasable TypeScript only (no enum, no parameter property, no namespace —
 * `erasableSyntaxOnly` in `tsconfig.json` enforces it), relative imports with their `.ts`
 * extension, no `@/` alias, and no import that pulls in the app (`./logger.ts` included). The
 * bundled side (`src/lib/csp.ts`, the tests) imports the same file, so the header names and the
 * hashing rule have one definition.
 *
 * ## The problem this solves
 *
 * Next 16 writes the React flight payload into the document as a run of inline
 * `<script>self.__next_f.push(…)</script>` blocks next to the one application inline script, the
 * Consent-Mode bootstrap. The static policy of ADR-0016 authorises the bootstrap by hash and
 * nothing else, so enforcing it blocks hydration on every page (`/review 28`). The flight blocks
 * carry the page's data, so their bytes differ per route, per build and per ISR regeneration: no
 * static header can name them.
 *
 * ## Hash per response, not nonce
 *
 * A hash describes bytes, not a request. Every visitor who receives one cached document receives
 * the same bytes, so the same hash list is correct for all of them and the header can be cached
 * beside the body — by Next's ISR cache and by Cloudflare — without becoming a shared secret. A
 * nonce is the opposite: it is only worth anything if nobody else ever sees it, which a cached
 * response cannot promise. That is ADR-0016's rule, and this file keeps it: no nonce is generated
 * anywhere here.
 *
 * **Only the framework's own flight pushes are hashed** (`flightScriptHashes`). Hashing every
 * inline script in the stored HTML would authorise a script injected before the entry was cached,
 * which for stored XSS is `'unsafe-inline'` by another name (`/review 196` item 1). The residual
 * risk is stated in ADR-0020: an injected script that is *itself* a well-formed flight push is
 * hashed, but it can only push data into React's payload — it runs no code of its own.
 *
 * The hashes are computed from the HTML **as it is stored in the cache entry**, which is the HTML
 * that is served: `src/lib/csp-cache-handler.ts` stamps the entry when Next writes it (build-time
 * prerender, ISR regeneration, first on-demand render) and again when Next reads it, so an entry
 * written before a flag change is served with the policy the running server asks for.
 */
import { createHash } from "node:crypto";

export const CSP_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

/** The env key that switches enforcement on (`src/lib/env.schema.ts`, `.env.example`). */
export const CSP_REPORT_ONLY_KEY = "CSP_REPORT_ONLY";

/**
 * Whether the per-response policy is **enforced**. Asymmetric like `cspReportOnly()` in
 * `src/lib/env.schema.ts`: only the exact string `"false"` enforces, so absence, a typo and every
 * other value stay report-only.
 */
export function cspEnforced(
  source: Readonly<Record<string, string | undefined>>,
): boolean {
  return source[CSP_REPORT_ONLY_KEY] === "false";
}

/**
 * Script `type` values a browser executes — and therefore the ones CSP governs. A
 * `type="application/ld+json"` block is data, never run and never checked against `script-src`,
 * so it is never hashed.
 */
const EXECUTABLE_TYPES: ReadonlySet<string> = new Set([
  "",
  "text/javascript",
  "application/javascript",
  "module",
]);

/** `<script …>…</script>`; the body ends at the first `</script`, which is the HTML rule. */
const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu;
const SRC_ATTRIBUTE = /(?:^|\s)src\s*=/iu;
const TYPE_ATTRIBUTE =
  /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/iu;

/**
 * The two statement shapes Next 16 writes into a document, and nothing else
 * (`next/dist/server/app-render/use-flight-response.js`, `writeInitialInstructions` and
 * `writeFlightDataInstruction`; surveyed over all 4 808 prerendered documents at `/break 196`):
 *
 *  - the bootstrap, `(self.__next_f=self.__next_f||[]).push([0])`, optionally followed by one
 *    form-state push `;self.__next_f.push([2,<json>])`;
 *  - one data push per chunk, `self.__next_f.push([1,"<json string>"])`, or `[3,"<base64>"]` for a
 *    chunk that is not valid UTF-8.
 *
 * The argument is JSON written by `JSON.stringify` and escaped by `htmlEscapeJsonString`, so the
 * test is `JSON.parse` on the whole argument plus the exact array shape — not a regular expression
 * over its contents. `self.__next_f.push([1,"x"]);alert(1)` fails it: the greedy capture is
 * `[1,"x"]);alert(1` and that is not JSON.
 */
const FLIGHT_DATA = /^self\.__next_f\.push\((\[[\s\S]*\])\)$/u;
const FLIGHT_BOOTSTRAP =
  /^\(self\.__next_f=self\.__next_f\|\|\[\]\)\.push\(\[0\]\)(?:;self\.__next_f\.push\((\[[\s\S]*\])\))?$/u;

function parsedArray(argument: string): unknown[] | undefined {
  try {
    const value: unknown = JSON.parse(argument);
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a script body is exactly a statement Next emits for the flight payload. Pure data
 * pushes only: nothing that matches can run code of its own, which is the property that makes
 * hashing it at serve time safe. Exported for the tests.
 */
export function isFlightScript(body: string): boolean {
  const data = FLIGHT_DATA.exec(body);
  if (data !== null) {
    const value = parsedArray(data[1] ?? "");
    return (
      value !== undefined &&
      value.length === 2 &&
      (value[0] === 1 || value[0] === 3) &&
      typeof value[1] === "string"
    );
  }
  const bootstrap = FLIGHT_BOOTSTRAP.exec(body);
  if (bootstrap === null) return false;
  if (bootstrap[1] === undefined) return true;
  const formState = parsedArray(bootstrap[1]);
  return formState?.length === 2 && formState[0] === 2;
}

/**
 * The HTML parser turns CR LF and lone CR into LF before a script's text exists, so the browser
 * hashes the normalised text. Normalising here keeps a stray `\r` from producing a hash that can
 * never match (`/review 196` nit 3).
 */
const normaliseNewlines = (text: string): string =>
  text.replace(/\r\n?/gu, "\n");

/**
 * The `sha256-<base64>` source of every inline script **Next wrote for the flight payload**, in
 * document order and without duplicates (`isFlightScript`). Nothing else is hashed:
 *
 *  - the Consent-Mode bootstrap is authorised by the static build-time hash already in the policy
 *    (`src/lib/consent-bootstrap.ts`), so its exact bytes are the only bytes that pass;
 *  - external scripts (`src=`) are covered by `'self'` and the origin allowlist;
 *  - **any other inline script** — one that reached the HTML through a stored injection before the
 *    entry was cached (`/review 196` item 1, `/break 196` hole 1) — gets no hash, so the browser
 *    blocks it and reports it as `script-src-elem` / `inline` / `enforce`.
 *
 * The digest is over the UTF-8 bytes of the element's text after newline normalisation, exactly
 * as the browser computes it: no trimming. Values carry no surrounding quotes, like
 * `CspOptions.inlineHashes`.
 */
export function flightScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(SCRIPT_ELEMENT)) {
    const attributes = match[1] ?? "";
    if (SRC_ATTRIBUTE.test(attributes)) continue;
    const type = TYPE_ATTRIBUTE.exec(attributes);
    const typeValue = (type?.[1] ?? type?.[2] ?? type?.[3] ?? "")
      .trim()
      .toLowerCase();
    if (!EXECUTABLE_TYPES.has(typeValue)) continue;
    const body = normaliseNewlines(match[2] ?? "");
    if (!isFlightScript(body)) continue;
    const digest = createHash("sha256").update(body, "utf8").digest("base64");
    const source = `sha256-${digest}`;
    if (!hashes.includes(source)) hashes.push(source);
  }
  return hashes;
}

/**
 * `policy` with `hashes` appended to its `script-src` directive, each quoted once. Every other
 * directive — and the directive order a reviewer reads diffs in — is untouched, so the
 * per-response policy is the static policy of `src/lib/csp.ts` plus exactly the hashes of one
 * document. `undefined` when the policy has no `script-src`: a policy this function cannot
 * extend is not one it should guess at.
 */
export function withScriptHashes(
  policy: string,
  hashes: readonly string[],
): string | undefined {
  const directives = policy
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const index = directives.findIndex(
    (part) => part === "script-src" || part.startsWith("script-src "),
  );
  if (index === -1) return undefined;
  const tokens = (directives[index] ?? "").split(/\s+/u);
  for (const hash of hashes) {
    const quoted = `'${hash}'`;
    if (!tokens.includes(quoted)) tokens.push(quoted);
  }
  directives[index] = tokens.join(" ");
  return `${directives.join("; ")};`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * The static policy this build sends, read from Next's `routes-manifest.json` — the file
 * `next.config.ts`'s `headers()` is compiled into. Reading it back (instead of recomputing it
 * here) is what keeps one source of truth: the per-response policy can only ever be the static
 * policy plus hashes, never a second hand-written copy that drifts.
 */
export function staticPolicyFromRoutesManifest(
  manifest: unknown,
): string | undefined {
  if (!isRecord(manifest) || !Array.isArray(manifest["headers"])) {
    return undefined;
  }
  for (const rule of manifest["headers"] as unknown[]) {
    if (!isRecord(rule) || !Array.isArray(rule["headers"])) continue;
    for (const header of rule["headers"] as unknown[]) {
      if (!isRecord(header)) continue;
      const key = header["key"];
      const value = header["value"];
      if (
        typeof key === "string" &&
        typeof value === "string" &&
        key.toLowerCase() === CSP_REPORT_ONLY_HEADER.toLowerCase()
      ) {
        return value;
      }
    }
  }
  return undefined;
}

export interface StampOptions {
  /** The static policy, from `staticPolicyFromRoutesManifest()`; `undefined` fails open. */
  readonly staticPolicy: string | undefined;
  /** `cspEnforced(process.env)`. */
  readonly enforce: boolean;
}

/**
 * Put — or take away — the per-response policy on one cache entry value, in place. The policy is
 * the static policy plus `flightScriptHashes(html)`: the framework's own pushes, never an
 * arbitrary inline script that happens to be in the stored HTML.
 *
 * In place because Next hands the **same** value object to the cache handler's `set()` and to
 * the response it is about to send (`server/response-cache`), so stamping it here is what puts
 * the header on the first response as well as on every later hit.
 *
 * Only `APP_PAGE` entries with a string body are touched; route handlers, fetch entries and
 * images pass through unchanged. Both CSP names are removed first, so an entry written under
 * one setting and read under another carries only what the running server asks for:
 * `Content-Security-Policy` with the hashes when enforcing, nothing when report-only (the
 * static `Content-Security-Policy-Report-Only` from `next.config.ts` still reaches every
 * response, so the report-only period keeps exactly its pre-TASK-058 evidence).
 *
 * Returns what happened: `skipped` (not a cached HTML page), `report-only` (CSP names removed,
 * nothing added), `enforced` (the enforcing header is on the entry) or `failed-open` (enforcement
 * was asked for but no policy could be built, so the page goes out unenforced — which
 * `src/lib/csp-state.ts` records for `/api/health`).
 */
export type StampOutcome =
  "skipped" | "report-only" | "enforced" | "failed-open";

export function stampCspHeaders(
  value: unknown,
  options: StampOptions,
): StampOutcome {
  if (!isRecord(value)) return "skipped";
  const html = value["html"];
  if (value["kind"] !== "APP_PAGE" || typeof html !== "string") {
    return "skipped";
  }

  const headers: Record<string, unknown> = {};
  const existing = value["headers"];
  if (isRecord(existing)) {
    for (const [key, header] of Object.entries(existing)) {
      const lower = key.toLowerCase();
      if (
        lower === CSP_HEADER.toLowerCase() ||
        lower === CSP_REPORT_ONLY_HEADER.toLowerCase()
      ) {
        continue;
      }
      headers[key] = header;
    }
  }

  let outcome: StampOutcome = "report-only";
  if (options.enforce) {
    const policy =
      options.staticPolicy === undefined
        ? undefined
        : withScriptHashes(options.staticPolicy, flightScriptHashes(html));
    if (policy === undefined) {
      outcome = "failed-open";
    } else {
      headers[CSP_HEADER] = policy;
      outcome = "enforced";
    }
  }
  value["headers"] = headers;
  return outcome;
}
