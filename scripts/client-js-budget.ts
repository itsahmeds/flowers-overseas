/**
 * `pnpm budget:client-js` — the AC-27 measurement (spec 003 §6 "CWV budget impact", T-27;
 * TASK-043).
 *
 * `plan/01` §7 caps an indexable page at **120 KB of gzipped JavaScript** and spec 003 §6 caps
 * the **serialised message payload handed to the client** at 4 KB gzipped. Lighthouse measures
 * the first number too, but only against a deployed preview and only as a pass/fail; this script
 * measures it from the build output, per URL, chunk by chunk, so a regression can be attributed
 * to the import that caused it instead of being reported as "script size went up".
 *
 * ## What it counts, and why that is the honest number
 *
 * The script set of a URL is read from the **prerendered document** in `.next/server/app/*.html`,
 * not from a chunk manifest: the document is what a browser receives, so its `<script src>` list
 * is what a browser fetches. Two consequences:
 *
 *  - **`noModule` bundles are reported but not counted.** Next emits its legacy polyfill bundle
 *    (~38 KB gz) as `<script noModule>`, which no module-supporting browser — and therefore no
 *    Lighthouse run — ever downloads. Counting it would inflate every number by a third and
 *    measure a browser nobody has.
 *  - **Third-party scripts are out of scope.** `vercel.live`'s preview-feedback script is injected
 *    into protected previews by the platform, is absent from production and is not in the build
 *    output at all. It is the reason a Lighthouse number from a preview reads higher than this
 *    one (recorded on TASK-043).
 *
 * Both a gzipped and a Brotli size are printed. The budget is stated in gzipped bytes, which is
 * what `plan/01` §7 and `lighthouserc.json` mean; Brotli is printed alongside because that is
 * what Vercel actually serves and therefore what Lighthouse's `resource-summary:script:size`
 * measures, and the two differ by ~15%. Only the gzipped number is compared against the budget.
 *
 * ## Exit code
 *
 * Non-zero when any measured URL exceeds the JS budget or any launch locale's message payload
 * exceeds 4 KB. The CI `build` job runs it with `continue-on-error: true` on the step for as long
 * as the framework floor recorded in spec 003 §14 A12 is above the budget — the same
 * informational treatment `lighthouse` carries, and for the same reason: the founder decides
 * whether the budget or the framework moves, and a permanently red required check decides nothing.
 *
 * Usage: `node scripts/client-js-budget.ts [--dist .next] [--url /en]…`
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { launchLocales } from "../src/config/locales.ts";
import { loadMessages, namespacesFor } from "../src/modules/i18n/messages.ts";

/** `plan/01` §7: 120 KB gzipped of JavaScript on an indexable page. */
export const CLIENT_JS_BUDGET_BYTES = 120 * 1024;

/** Spec 003 §6 / AC-27: the serialised client message payload, gzipped. */
export const MESSAGES_PAYLOAD_BUDGET_BYTES = 4 * 1024;

/** The URLs measured by default: the chooser and the two locales AC-27 names, plus `/de`. */
export const DEFAULT_URLS = ["/", "/en", "/de"] as const;

export const DEFAULT_DIST = ".next";

export interface ScriptTag {
  /** Path of the asset inside the dist directory, e.g. `static/chunks/abc.js`. */
  readonly asset: string;
  /** `<script noModule>`: served to legacy browsers only, so never fetched by a modern one. */
  readonly noModule: boolean;
}

export interface MeasuredAsset extends ScriptTag {
  readonly rawBytes: number;
  readonly gzipBytes: number;
  readonly brotliBytes: number;
}

export interface PageMeasurement {
  readonly url: string;
  /** Every `<script src="/_next/…">` of the document, biggest first. */
  readonly assets: readonly MeasuredAsset[];
  /** Gzipped total of the assets a modern browser fetches (`noModule` excluded). */
  readonly fetchedGzipBytes: number;
  readonly fetchedBrotliBytes: number;
  readonly withinBudget: boolean;
}

const SCRIPT_TAG =
  /<script\b[^>]*?\bsrc="\/_next\/(static\/[^"]+?\.js)"[^>]*>/g;

/**
 * The `/_next/` scripts of a prerendered document, in document order and de-duplicated. A chunk
 * listed twice is fetched once, so it is counted once.
 */
export function parseScriptTags(html: string): ScriptTag[] {
  const seen = new Set<string>();
  const tags: ScriptTag[] = [];
  for (const match of html.matchAll(SCRIPT_TAG)) {
    const asset = match[1];
    if (asset === undefined || seen.has(asset)) continue;
    seen.add(asset);
    tags.push({ asset, noModule: /\bnoModule\b/i.test(match[0]) });
  }
  return tags;
}

/**
 * The prerendered document of a URL. `/` is `index.html`; `/en` is `en.html` — Next writes the
 * route path with no leading slash, and a nested route would be `en/about.html`.
 */
export function documentPathFor(dist: string, url: string): string {
  const route = url.replace(/^\/+/, "").replace(/\/+$/, "");
  return join(dist, "server/app", `${route === "" ? "index" : route}.html`);
}

function measureAsset(dist: string, tag: ScriptTag): MeasuredAsset {
  const buffer = readFileSync(join(dist, tag.asset));
  return {
    ...tag,
    rawBytes: buffer.length,
    gzipBytes: gzipSync(buffer, { level: 9 }).length,
    brotliBytes: brotliCompressSync(buffer, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

/**
 * Measure each URL against the build output in `dist`. A missing document throws with the URL in
 * the message: "the page was not prerendered" and "the page ships no JavaScript" must never be
 * reported as the same 0 KB.
 */
export function measurePages(
  dist: string,
  urls: readonly string[],
): PageMeasurement[] {
  return urls.map((url) => {
    const documentPath = documentPathFor(dist, url);
    let html: string;
    try {
      html = readFileSync(documentPath, "utf8");
    } catch {
      throw new Error(
        `no prerendered document for ${url} at ${documentPath} — run \`pnpm build\` first`,
      );
    }
    const assets = parseScriptTags(html)
      .map((tag) => measureAsset(dist, tag))
      .sort((a, b) => b.gzipBytes - a.gzipBytes);
    const fetched = assets.filter((asset) => !asset.noModule);
    const fetchedGzipBytes = fetched.reduce(
      (total, asset) => total + asset.gzipBytes,
      0,
    );
    return {
      url,
      assets,
      fetchedGzipBytes,
      fetchedBrotliBytes: fetched.reduce(
        (total, asset) => total + asset.brotliBytes,
        0,
      ),
      withinBudget: fetchedGzipBytes <= CLIENT_JS_BUDGET_BYTES,
    };
  });
}

export interface MessagesPayloadSize {
  readonly locale: string;
  readonly rawBytes: number;
  readonly bytes: number;
  readonly withinBudget: boolean;
}

/**
 * The gzipped size of what `NextIntlClientProvider` serialises into a localised document: the
 * `localeDocument` namespace subset, per launch locale. No build output is needed — the subset is
 * a pure function of the catalogues (`src/modules/i18n/messages.ts`), which is the point of
 * `namespacesFor()`.
 */
export function messagesPayloadSizes(): MessagesPayloadSize[] {
  return launchLocales.map((locale) => {
    const payload = JSON.stringify(
      loadMessages(locale, namespacesFor("localeDocument")),
    );
    const bytes = gzipSync(Buffer.from(payload, "utf8")).length;
    return {
      locale,
      rawBytes: Buffer.byteLength(payload, "utf8"),
      bytes,
      withinBudget: bytes <= MESSAGES_PAYLOAD_BUDGET_BYTES,
    };
  });
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;

export function formatMarkdownTable(pages: readonly PageMeasurement[]): string {
  const lines = [
    "| URL | fetched JS (gz) | fetched JS (br) | budget 120 KB gz | scripts |",
    "|---|---|---|---|---|",
  ];
  for (const page of pages) {
    lines.push(
      `| \`${page.url}\` | ${kb(page.fetchedGzipBytes)} | ${kb(page.fetchedBrotliBytes)} | ${
        page.withinBudget ? "within" : "**over**"
      } | ${String(page.assets.filter((asset) => !asset.noModule).length)} |`,
    );
  }
  return lines.join("\n");
}

/** The per-chunk breakdown, so a growth is attributable to the import that caused it. */
export function formatChunkList(pages: readonly PageMeasurement[]): string {
  const lines: string[] = [];
  for (const page of pages) {
    lines.push(`${page.url}`);
    for (const asset of page.assets) {
      lines.push(
        `  ${kb(asset.gzipBytes).padStart(9)} gz  ${kb(asset.brotliBytes).padStart(9)} br  ${
          asset.noModule ? "[noModule, not fetched] " : ""
        }${asset.asset}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatMessagesTable(
  sizes: readonly MessagesPayloadSize[],
): string {
  const lines = [
    "| locale | client message payload (gz) | budget 4 KB gz |",
    "|---|---|---|",
  ];
  for (const size of sizes) {
    lines.push(
      `| \`${size.locale}\` | ${kb(size.bytes)} | ${size.withinBudget ? "within" : "**over**"} |`,
    );
  }
  return lines.join("\n");
}

function argValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (const [index, arg] of argv.entries()) {
    if (arg !== flag) continue;
    const value = argv[index + 1];
    if (value !== undefined && value !== "") values.push(value);
  }
  return values;
}

interface Writer {
  write: (chunk: string) => unknown;
}

export function main(
  argv: readonly string[],
  out: Writer = process.stdout,
  err: Writer = process.stderr,
): number {
  try {
    const dist = resolve(
      process.cwd(),
      argValues(argv, "--dist")[0] ?? DEFAULT_DIST,
    );
    const urls = argValues(argv, "--url");
    const pages = measurePages(dist, urls.length > 0 ? urls : DEFAULT_URLS);
    const messages = messagesPayloadSizes();

    const breaches = [
      ...pages
        .filter((page) => !page.withinBudget)
        .map(
          (page) =>
            `${page.url} ships ${kb(page.fetchedGzipBytes)} of gzipped JavaScript, over the 120 KB budget of plan/01 §7`,
        ),
      ...messages
        .filter((size) => !size.withinBudget)
        .map(
          (size) =>
            `the client message payload for ${size.locale} is ${kb(size.bytes)} gzipped, over the 4 KB budget of spec 003 §6`,
        ),
    ];

    out.write(
      [
        formatMarkdownTable(pages),
        "",
        formatMessagesTable(messages),
        "",
        formatChunkList(pages),
        "",
        breaches.length === 0
          ? "client-js-budget: every measured URL is within budget"
          : breaches.map((breach) => `client-js-budget: ${breach}`).join("\n"),
        "",
      ].join("\n"),
    );
    return breaches.length === 0 ? 0 : 1;
  } catch (error) {
    err.write(`client-js-budget: ${(error as Error).message}\n`);
    return 1;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exitCode = main(process.argv.slice(2));
}
