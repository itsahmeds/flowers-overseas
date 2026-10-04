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
 * so hashing it would only lengthen the header.
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
 * The `sha256-<base64>` source of every **inline, executable** script in a document, in document
 * order and without duplicates. External scripts (`src=`) are covered by `'self'` and by the
 * origin allowlist, not by a hash.
 *
 * The digest is over the UTF-8 bytes of the element's text, exactly as the browser computes it:
 * no trimming, no normalisation. An empty inline script is hashed too — the browser checks it.
 * Values are returned without the surrounding quotes, like `CspOptions.inlineHashes`.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(SCRIPT_ELEMENT)) {
    const attributes = match[1] ?? "";
    if (SRC_ATTRIBUTE.test(attributes)) continue;
    const type = TYPE_ATTRIBUTE.exec(attributes);
    const typeValue = (type?.[1] ?? type?.[2] ?? type?.[3] ?? "")
      .trim()
      .toLowerCase();
    if (!EXECUTABLE_TYPES.has(typeValue)) continue;
    const digest = createHash("sha256")
      .update(match[2] ?? "", "utf8")
      .digest("base64");
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
 * Put — or take away — the per-response policy on one cache entry value, in place.
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
 * Returns whether an enforcing header is now on the entry.
 */
export function stampCspHeaders(
  value: unknown,
  options: StampOptions,
): boolean {
  if (!isRecord(value)) return false;
  const html = value["html"];
  if (value["kind"] !== "APP_PAGE" || typeof html !== "string") return false;

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

  let stamped = false;
  if (options.enforce && options.staticPolicy !== undefined) {
    const policy = withScriptHashes(
      options.staticPolicy,
      inlineScriptHashes(html),
    );
    if (policy !== undefined) {
      headers[CSP_HEADER] = policy;
      stamped = true;
    }
  }
  value["headers"] = headers;
  return stamped;
}
