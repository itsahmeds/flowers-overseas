/**
 * `lighthouse-urls` (spec 001 §2 "CI", AC-23 / T-24, TASK-009).
 *
 * Prints one `--collect.url=<absolute url>` argument per line for every path in
 * `tests/fixtures/seo/lighthouse-urls.json`, resolved against the base URL of the run:
 *
 * ```sh
 * pnpm exec lhci autorun $(node scripts/seo/lighthouse-urls.ts)
 * ```
 *
 * Lighthouse CI cannot read a URL list out of a JSON file of our shape, and `lighthouserc.json`
 * cannot interpolate the preview URL, so the list stays data (spec 007 extends it without
 * touching CI) and this script is the only place that joins it to a base URL.
 *
 * Base URL: `LHCI_BASE_URL`, else `PLAYWRIGHT_BASE_URL` (the preview URL the `preview` CI job
 * resolved — same variable the Playwright suites use), else `http://localhost:3000`.
 *
 * Usage: `node scripts/seo/lighthouse-urls.ts [--file <path>] [--base <url>]`
 *
 * ## `--warm`: fetch every audited page and its subresources first (spec 004 §14 A18; TASK-235)
 *
 * A18 makes the measurement basis "the Brotli origin, warmed", because a server start-up cost
 * "would decide a required check by whichever run happened to be first". Until TASK-235 the job
 * warmed by `curl`ing each document once: no `br`, and none of what the document names. The
 * stylesheets, the preloaded fonts, the LCP image's candidates and the script chunks were first
 * fetched, and the origin's Brotli path first exercised, by a measured run.
 *
 * `--warm` requests every document of the list and every same-origin `<link rel="stylesheet|
 * preload|modulepreload|icon">` (including a preload's `imageSrcSet`), `<script src>`,
 * `<img src|srcset>` and `<source srcset>` it names, each URL once across the set, with
 * `accept-encoding: br` and the `accept` Chrome sends, so the bytes and the code path are the ones
 * the measured runs use. Cross-origin URLs (the media CDN) are skipped: they do not pass through
 * the origin. It lives here, not in a script of its own, because this is the one place that joins
 * the URL list to a base URL.
 *
 * What TASK-235 measured, and what this does **not** fix, is in the brief's `## Result`: the edge
 * the LCP sits on is not a cold path.
 *
 * It exits 1 when a document or a subresource does not answer 2xx, or when a document names no
 * subresource at all: a warm-up that silently warms nothing is the defect it replaces.
 *
 * Usage: `node scripts/seo/lighthouse-urls.ts --warm [--file <path>] [--base <url>]`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

import { exitWith, formatZodError, isMainModule } from "./lib.ts";

export const DEFAULT_FILE = "tests/fixtures/seo/lighthouse-urls.json";
export const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * The URL list: non-empty, root-relative paths only. Root-relative because the same list is
 * measured against localhost, a preview and (from spec 007) production.
 */
export const lighthouseUrlsSchema = z
  .array(
    z
      .string()
      .min(1)
      .refine((path) => path.startsWith("/"), {
        message: "must be a root-relative path starting with '/'",
      })
      .refine((path) => !path.startsWith("//"), {
        message: "must not start with '//' (that is a protocol-relative URL)",
      }),
  )
  .min(1);

export function parseUrlList(raw: string): string[] {
  const parsed = lighthouseUrlsSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${DEFAULT_FILE} is not a non-empty array of root-relative paths (${formatZodError(parsed.error)})`,
    );
  }
  return [...parsed.data];
}

export function resolveBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const base =
    env["LHCI_BASE_URL"] ?? env["PLAYWRIGHT_BASE_URL"] ?? DEFAULT_BASE_URL;
  const trimmed = base.trim().replace(/\/+$/, "");
  if (trimmed === "") throw new Error("the Lighthouse base URL is empty");
  return trimmed;
}

export function collectUrlArgs(
  baseUrl: string,
  paths: readonly string[],
): string[] {
  return paths.map((path) => `--collect.url=${baseUrl}${path}`);
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  return value === "" ? undefined : value;
}

export function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  out: { write: (chunk: string) => unknown } = process.stdout,
  err: { write: (chunk: string) => unknown } = process.stderr,
): number {
  try {
    const file = resolve(
      process.cwd(),
      argValue(argv, "--file") ?? DEFAULT_FILE,
    );
    const baseUrl = argValue(argv, "--base") ?? resolveBaseUrl(env);
    const args = collectUrlArgs(
      baseUrl,
      parseUrlList(readFileSync(file, "utf8")),
    );
    out.write(`${args.join("\n")}\n`);
    return 0;
  } catch (error) {
    err.write(`lighthouse-urls: ${(error as Error).message}\n`);
    return 1;
  }
}

/** What Chrome sends for a navigation and for an image; the origin negotiates on these. */
export const DOCUMENT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
export const IMAGE_ACCEPT =
  "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
/** The encoding the measured runs ask for, so the warm-up exercises the same Brotli path. */
export const ACCEPT_ENCODING = "gzip, deflate, br, zstd";

export type SubresourceKind = "style" | "script" | "font" | "image" | "other";

export interface Subresource {
  readonly url: string;
  readonly kind: SubresourceKind;
}

const TAG = /<(link|script|img|source)\b([^>]*)>/gi;
const ATTRIBUTE =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Attributes of one tag, names lower-cased (React writes `srcSet`, `imageSrcSet`). */
export function attributes(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? "").toLowerCase();
    if (name === "") continue;
    result.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return result;
}

/** HTML's ASCII whitespace: space, tab, LF, FF and CR (not `\s`, which also matches NBSP). */
const ASCII_WHITESPACE = /[\t\n\f\r ]/;
const WHITESPACE_OR_COMMA = /[\t\n\f\r ,]/;

/**
 * Every URL of a `srcset`, in order: `a.avif 384w, b.avif 640w` → `[a.avif, b.avif]`.
 *
 * It follows the HTML standard's candidate parser, not a split on every comma: a URL runs to the
 * next ASCII whitespace and only its trailing commas are dropped, so a `data:` candidate (whose
 * comma is part of the URL) stays one URL and is skipped as such by `subresourceUrls`. The
 * descriptors run to the next comma outside parentheses; "(" enters the paren state and the
 * first ")" leaves it, with no nesting, as the standard's descriptor tokenizer does.
 */
export function srcsetUrls(srcset: string): string[] {
  const urls: string[] = [];
  let position = 0;
  const at = (index: number): string => srcset.charAt(index);
  while (position < srcset.length) {
    while (position < srcset.length && WHITESPACE_OR_COMMA.test(at(position))) {
      position++;
    }
    if (position >= srcset.length) break;
    const start = position;
    while (position < srcset.length && !ASCII_WHITESPACE.test(at(position))) {
      position++;
    }
    let url = srcset.slice(start, position);
    if (url.endsWith(",")) {
      // No descriptors: the trailing commas end the candidate.
      url = url.replace(/,+$/, "");
    } else {
      // Skip the descriptors, up to the comma that ends the candidate (one inside parentheses
      // does not).
      let inParens = false;
      while (position < srcset.length) {
        const character = at(position);
        if (inParens) {
          if (character === ")") inParens = false;
        } else if (character === "(") {
          inParens = true;
        } else if (character === ",") {
          break;
        }
        position++;
      }
    }
    if (url !== "") urls.push(url);
  }
  return urls;
}

function linkKind(as: string | undefined, rel: string): SubresourceKind {
  if (rel.includes("stylesheet") || as === "style") return "style";
  if (rel.includes("modulepreload") || as === "script") return "script";
  if (as === "font") return "font";
  if (as === "image") return "image";
  return "other";
}

/**
 * The same-origin subresources a document names, de-duplicated, in document order. This is the
 * set Chrome requests on the way to the LCP: render-blocking stylesheets, preloaded fonts and the
 * LCP image's candidates, and the script chunks that share the origin's connections with them.
 */
export function subresourceUrls(
  html: string,
  documentUrl: string,
): Subresource[] {
  const origin = new URL(documentUrl).origin;
  const seen = new Set<string>();
  const found: Subresource[] = [];
  const add = (raw: string, kind: SubresourceKind): void => {
    if (raw === "" || raw.startsWith("data:")) return;
    let url: URL;
    try {
      url = new URL(raw, documentUrl);
    } catch {
      return;
    }
    if (url.origin !== origin) return;
    url.hash = "";
    const href = url.toString();
    if (href === documentUrl || seen.has(href)) return;
    seen.add(href);
    found.push({ url: href, kind });
  };

  for (const match of html.matchAll(TAG)) {
    const tag = (match[1] ?? "").toLowerCase();
    const attrs = attributes(match[2] ?? "");
    if (tag === "link") {
      const rel = (attrs.get("rel") ?? "").toLowerCase();
      if (!/\b(stylesheet|preload|modulepreload|icon)\b/.test(rel)) continue;
      const kind = rel.includes("icon")
        ? "image"
        : linkKind(attrs.get("as")?.toLowerCase(), rel);
      add(attrs.get("href") ?? "", kind);
      for (const url of srcsetUrls(attrs.get("imagesrcset") ?? "")) {
        add(url, "image");
      }
    } else if (tag === "script") {
      add(attrs.get("src") ?? "", "script");
    } else {
      add(attrs.get("src") ?? "", "image");
      for (const url of srcsetUrls(attrs.get("srcset") ?? "")) {
        add(url, "image");
      }
    }
  }
  return found;
}

export function requestHeaders(kind: SubresourceKind | "document"): Headers {
  const headers = new Headers({ "accept-encoding": ACCEPT_ENCODING });
  if (kind === "document") headers.set("accept", DOCUMENT_ACCEPT);
  else if (kind === "image") headers.set("accept", IMAGE_ACCEPT);
  else if (kind === "style") headers.set("accept", "text/css,*/*;q=0.1");
  else headers.set("accept", "*/*");
  return headers;
}

/**
 * The slice of `fetch` this script uses. Node's `fetch` decodes `br` itself, so `text()` is the
 * HTML whatever encoding the origin chose; the bytes still crossed the wire encoded.
 */
export type Fetch = (
  url: string,
  init: { readonly headers: Headers; readonly signal: AbortSignal },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** A hung origin fails the step after this, not after undici's 300 s per request. */
export const REQUEST_TIMEOUT_MS = 30_000;

const requestInit = (
  kind: SubresourceKind | "document",
): { headers: Headers; signal: AbortSignal } => ({
  headers: requestHeaders(kind),
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

export interface PageReport {
  readonly path: string;
  readonly subresources: number;
}

export interface WarmReport {
  readonly pages: readonly PageReport[];
  /** Subresource URLs fetched, each once across the whole set. */
  readonly warmed: readonly string[];
  readonly problems: readonly string[];
}

/**
 * Warms every path: the document, then every subresource it names (each URL once across the
 * whole set). Every body is read to the end, so the origin finishes the response it began.
 */
export async function warm(
  baseUrl: string,
  paths: readonly string[],
  fetchImpl: Fetch,
): Promise<WarmReport> {
  const pages: PageReport[] = [];
  const problems: string[] = [];
  const warmed: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const documentUrl = `${baseUrl}${path}`;
    const document = await fetchImpl(documentUrl, requestInit("document"));
    const html = await document.text();
    if (!document.ok) {
      problems.push(`${path}: document answered ${String(document.status)}`);
      pages.push({ path, subresources: 0 });
      continue;
    }
    const subresources = subresourceUrls(html, documentUrl);
    if (subresources.length === 0) {
      problems.push(
        `${path}: the document names no same-origin subresource, so nothing was warmed`,
      );
    }
    for (const { url, kind } of subresources) {
      if (seen.has(url)) continue;
      seen.add(url);
      const response = await fetchImpl(url, requestInit(kind));
      await response.arrayBuffer();
      warmed.push(url);
      if (!response.ok) {
        problems.push(
          `${path}: ${new URL(url).pathname} answered ${String(response.status)}`,
        );
      }
    }
    pages.push({ path, subresources: subresources.length });
  }
  return { pages, warmed, problems };
}

/**
 * The pull request's Railway environment sits behind the staging wall (spec 040 AC-25), so on that
 * path the `lighthouse` job sets `LHCI_AUTHORIZATION` (`Basic …`) and every warm-up request to the
 * audited origin carries it, as Lighthouse's own runs do through `extraHeaders` (TASK-099). It is
 * never sent to another origin, and nothing here prints it.
 */
export function withAuthorization(
  fetchImpl: Fetch,
  baseUrl: string,
  authorization: string | undefined,
): Fetch {
  if (authorization === undefined || authorization.trim() === "") {
    return fetchImpl;
  }
  const origin = new URL(baseUrl).origin;
  return (url, init) => {
    if (new URL(url).origin === origin) {
      init.headers.set("authorization", authorization);
    }
    return fetchImpl(url, init);
  };
}

/** Node's `fetch`, with the request init (headers and the timeout signal) passed through whole. */
export const defaultFetch: Fetch = (url, init) => fetch(url, init);

export async function warmMain(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  out: { write: (chunk: string) => unknown } = process.stdout,
  err: { write: (chunk: string) => unknown } = process.stderr,
  fetchImpl: Fetch = defaultFetch,
): Promise<number> {
  try {
    const file = resolve(
      process.cwd(),
      argValue(argv, "--file") ?? DEFAULT_FILE,
    );
    const baseUrl = argValue(argv, "--base") ?? resolveBaseUrl(env);
    const paths = parseUrlList(readFileSync(file, "utf8"));
    const report = await warm(
      baseUrl,
      paths,
      withAuthorization(fetchImpl, baseUrl, env["LHCI_AUTHORIZATION"]),
    );
    for (const page of report.pages) {
      out.write(
        `lighthouse-warmup: ${page.path} + ${String(page.subresources)} subresources\n`,
      );
    }
    out.write(
      `lighthouse-warmup: ${String(report.pages.length)} documents, ${String(report.warmed.length)} distinct subresources warmed\n`,
    );
    for (const problem of report.problems) {
      err.write(`lighthouse-warmup: ${problem}\n`);
    }
    return report.problems.length === 0 ? 0 : 1;
  } catch (error) {
    err.write(`lighthouse-warmup: ${(error as Error).message}\n`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--warm")) void warmMain(argv).then(exitWith);
  else exitWith(main(argv));
}
