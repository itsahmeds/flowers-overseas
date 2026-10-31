/**
 * `pnpm lighthouse:origin` — a Brotli reverse proxy in front of `next start` (spec 004 AC-24,
 * §14 A12; TASK-056).
 *
 * ## Why this exists
 *
 * AC-24 asserts `resource-summary:script:size ≤ 131 072 B`, and §14 A1 states that number as
 * **Brotli transfer** — the encoding Vercel serves and the one `pnpm budget:client-js` measures
 * from the build output. Lighthouse measures whatever the origin actually sent, and the two
 * origins available to this repository send neither:
 *
 *  - `next start` (local, and the only origin a reviewer or an implementer can run) negotiates
 *    **gzip**. The same build reads 148 298 B here and 124 314 B Brotli, so a gzip measurement
 *    against a Brotli budget fails a page that is inside it. That is the `/review 53` finding:
 *    "Lighthouse's `resource-summary.script.size` reads gzip (156 444 B) against a 119.5 KB br
 *    budget — make the blocking measurement Brotli".
 *  - a protected Vercel preview sends Brotli but also injects `vercel.live`, the platform's
 *    preview-feedback script — 25 376 B on `/` and ~48 KB on a locale document, none of it in
 *    this repository's build output and none of it present in production (`lighthouserc.json`'s
 *    own note, TASK-043). A budget that a platform script can blow is not a budget this
 *    repository can hold.
 *
 * So the blocking measurement is taken against **this repository's own bytes, Brotli-encoded**:
 * `next start` on :3000, this proxy on :3001, Lighthouse pointed at :3001. The number it asserts
 * is then the same number `pnpm budget:client-js` prints from `.next/`, and both are the number
 * an edge CDN serves. That is TASK-056's answer to the question `lighthouserc.json` left open
 * ("production URLs, or a first-party-only budget").
 *
 * ## What it does and does not do
 *
 * It forwards every request to the upstream unchanged, then re-encodes the response body with
 * Brotli at quality 11 (the CDN setting) whenever the client advertises `br` and the body is a
 * compressible type. It requests **identity** from the upstream so it never double-encodes, and
 * it drops `content-length` in favour of the encoded length. Nothing is cached and nothing is
 * rewritten. **Documents keep every header `next start` sent**, so a Lighthouse audit of
 * `Content-Security-Policy-Report-Only`, `X-Robots-Tag` or `Cache-Control` — and Chrome's own CSP
 * enforcement — sees exactly the application's contract.
 *
 * ## Why a subresource is served with fewer headers
 *
 * `resource-summary:script:size` is `transferSize`, which counts **headers as well as body**. This
 * process speaks HTTP/1.1, so it repeats every response header in full on every asset: measured,
 * 1 318 B per chunk, of which 774 B are the document-only `Content-Security-Policy-Report-Only`,
 * `Permissions-Policy` and `Reporting-Endpoints`. Ten chunks put a locale document 13 180 B over
 * its own body size and 6 499 B over the budget — a failure caused by the fixture's protocol and
 * by no byte this repository ships. The deployment speaks HTTP/2, where HPACK indexes those same
 * headers to a few bytes after the first response.
 *
 * So a **non-document** response carries only the headers that are not inert on a subresource
 * (`SUBRESOURCE_HEADERS`): a CSP on a JavaScript file governs nothing, `Permissions-Policy` and
 * COOP on a chunk govern nothing, and charging them at HTTP/1.1 prices measures this proxy rather
 * than the application. ~200 B per asset remains, which is still *more* than an h2 edge charges.
 * The application's real header contract is asserted where it belongs and against the real server:
 * `tests/e2e/security-headers.spec.ts` and `tests/unit/csp.test.ts`, both against `next start`.
 *
 * It is a measurement fixture, not a deployment: single-process, no TLS, no keep-alive tuning,
 * and it binds to localhost only.
 *
 * Usage: `node scripts/seo/brotli-origin.ts [--port 3001] [--upstream http://localhost:3000]`
 */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { brotliCompressSync, constants } from "node:zlib";

import { isMainModule } from "./lib.ts";

export const DEFAULT_PORT = 3001;
export const DEFAULT_UPSTREAM = "http://localhost:3000";

/**
 * Types worth encoding, by `content-type` prefix. Images, fonts and archives are already
 * compressed; re-encoding them would cost CPU and inflate several of them, and Lighthouse's
 * image budget is asserted on the same numbers an edge would serve.
 */
export const COMPRESSIBLE_TYPES = [
  "text/",
  "application/javascript",
  "application/json",
  "application/manifest+json",
  "application/xml",
  "image/svg+xml",
] as const;

export function isCompressible(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  const value = contentType.toLowerCase();
  return COMPRESSIBLE_TYPES.some((prefix) => value.startsWith(prefix));
}

/** Brotli at the quality an edge CDN uses, so the measured bytes are the deployed bytes. */
export function brotli(body: Buffer): Buffer {
  return brotliCompressSync(body, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
}

export function acceptsBrotli(header: string | undefined): boolean {
  return (header ?? "").split(",").some((part) => part.trim().startsWith("br"));
}

/**
 * The response headers a **subresource** keeps (see the header of this file). Everything else is
 * a document header that an edge would HPACK away and that governs nothing on a chunk.
 */
export const SUBRESOURCE_HEADERS = [
  "content-type",
  "content-encoding",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
  "vary",
  "x-content-type-options",
] as const;

/** Documents keep everything; a subresource keeps `SUBRESOURCE_HEADERS`. */
export function forwardedHeaders(
  contentType: string | undefined,
  name: string,
): boolean {
  if ((contentType ?? "").toLowerCase().startsWith("text/html")) return true;
  return (SUBRESOURCE_HEADERS as readonly string[]).includes(name);
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  upstream: string,
): Promise<void> {
  const target = new URL(request.url ?? "/", upstream);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (name === "host" || name === "accept-encoding" || name === "connection")
      continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  // Identity from the upstream: this process is the only encoder in the chain.
  headers.set("accept-encoding", "identity");

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : Buffer.concat(await collect(request));

  const upstreamResponse = await fetch(target, {
    method: request.method ?? "GET",
    headers,
    ...(body === undefined ? {} : { body }),
    redirect: "manual",
  });

  const payload = Buffer.from(await upstreamResponse.arrayBuffer());
  const contentType = upstreamResponse.headers.get("content-type") ?? undefined;
  const encode =
    acceptsBrotli(request.headers["accept-encoding"] as string | undefined) &&
    isCompressible(contentType) &&
    payload.length > 0;
  const out = encode ? brotli(payload) : payload;

  for (const [name, value] of upstreamResponse.headers.entries()) {
    if (name === "content-length" || name === "content-encoding") continue;
    if (!forwardedHeaders(contentType, name)) continue;
    response.setHeader(name, value);
  }
  if (encode) response.setHeader("content-encoding", "br");
  response.setHeader("content-length", String(out.length));
  response.statusCode = upstreamResponse.status;
  response.end(out);
}

async function collect(request: IncomingMessage): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return chunks;
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value === "" ? undefined : value;
}

export function main(argv: readonly string[]): void {
  const port = Number(
    argv.includes("--port") ? argValue(argv, "--port") : DEFAULT_PORT,
  );
  const upstream = argValue(argv, "--upstream") ?? DEFAULT_UPSTREAM;
  const server = createServer((request, response) => {
    handle(request, response, upstream).catch((error: unknown) => {
      response.statusCode = 502;
      response.end(`brotli-origin: ${(error as Error).message}`);
    });
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `brotli-origin: http://127.0.0.1:${String(port)} -> ${upstream} (br, quality 11)\n`,
    );
  });
}

if (isMainModule(import.meta.url)) main(process.argv.slice(2));
