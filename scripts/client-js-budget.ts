/**
 * `pnpm budget:client-js` — the AC-27 measurement (spec 003 §6 "CWV budget impact", T-27;
 * TASK-043).
 *
 * `plan/01` §7 capped an indexable page at 120 KB of *gzipped* JavaScript; spec 004 §13 Q13
 * restates it, on the founder's decision of 2026-09-08 (option (a)), as **≤ 120 KB of Brotli
 * transfer** — 122 880 bytes, the same number against the encoding Vercel actually serves and
 * Lighthouse actually measures (`resource-summary:script:size` is transfer size). The gzip number
 * is still printed beside it, because it is what every older note in this repository quotes and
 * dropping it would make two measurements incomparable; only the Brotli number is compared
 * against the budget. Spec 003 §6 caps the **serialised message payload handed to the client** at
 * 4 KB gzipped, unchanged.
 *
 * Lighthouse measures the script number too, but only against a deployed preview and only as a
 * pass/fail; this script measures it from the build output, per URL, chunk by chunk, so a
 * regression can be attributed to the import that caused it instead of being reported as "script
 * size went up".
 *
 * It also asserts, from the same documents, that **no public route's client bundle contains zod or
 * the browser Sentry SDK** (spec 004 AC-25's precondition, TASK-046). Both were reachable from
 * `src/app/global-error.tsx`, whose client chunk Next attaches to every document; zod alone was
 * ~70 KB Brotli of the budget. Asserted from the build output rather than by inspection, because
 * "nothing imports it" is a claim about a graph nobody can hold in their head.
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
 * Both a gzipped and a Brotli size are printed, and the **Brotli** one is the budget (see above).
 * The two differ by ~15%, which is exactly why the restatement was needed: the same build was
 * "13 KB over" or "6 KB under" depending on which encoding the reader had in mind.
 *
 * ## Exit code
 *
 * Non-zero when any measured URL exceeds the JS budget, any launch locale's message payload
 * exceeds 4 KB, or a forbidden module is found in a route's client bundle. The CI `build` job runs
 * it with `continue-on-error: true` on the step; TASK-056 owns the flip to blocking, together with
 * `lighthouse`. The step stays informational for now because one clause of it is still a founder
 * decision: with zod gone, `/` measures 113.7 KB Brotli (within) and `/en` 124.5 KB (3.7% over) —
 * the Next 16.3.4 client runtime alone is ~112 KB Brotli, so a locale document has ~8 KB of
 * headroom and `NextIntlClientProvider` costs 10.5 KB. Spec 004 §13 Q13 option (b) is the
 * fallback and it is not this script's to take.
 *
 * Usage: `node scripts/client-js-budget.ts [--dist .next] [--url /en]…`
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { launchLocales } from "../src/config/locales.ts";
import { loadMessages, namespacesFor } from "../src/modules/i18n/messages.ts";

/**
 * `plan/01` §7 as restated by spec 004 §13 Q13: 120 KB — 122 880 bytes — of **Brotli** script
 * transfer on an indexable page. The same number `lighthouserc.json` asserts as
 * `resource-summary:script:size`, now against the same encoding.
 */
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
  /** Gzipped total of the assets a modern browser fetches (`noModule` excluded). Reported only. */
  readonly fetchedGzipBytes: number;
  /** Brotli total of the same assets. **This** is what the budget is compared against. */
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
    const fetchedBrotliBytes = fetched.reduce(
      (total, asset) => total + asset.brotliBytes,
      0,
    );
    return {
      url,
      assets,
      fetchedGzipBytes: fetched.reduce(
        (total, asset) => total + asset.gzipBytes,
        0,
      ),
      fetchedBrotliBytes,
      withinBudget: fetchedBrotliBytes <= CLIENT_JS_BUDGET_BYTES,
    };
  });
}

/**
 * Modules that must not appear in any public route's client bundle (spec 004 AC-25, §13 Q8/Q13).
 *
 * Detected by a marker string in the emitted chunk rather than by walking an import graph: what
 * matters is whether the bytes shipped, and a minifier that renames every identifier still leaves
 * these behind — zod's error class name is in its own source as a string, and the Sentry SDK
 * carries its package path. A marker that a future release renames shows up as this check going
 * quiet, which `tests/unit/client-js-budget.test.ts` guards by asserting that the patterns match a
 * chunk that *does* contain the module.
 */
export const FORBIDDEN_CLIENT_MODULES: readonly {
  readonly label: string;
  readonly pattern: RegExp;
}[] = [
  // `$ZodError` is zod v4's exported error class; `_zod` prefixes its internal namespace.
  { label: "zod", pattern: /\$ZodError|_zod\./ },
  // The browser SDK is off public routes in Phase 0 and returns scoped to checkout in spec 013.
  { label: "@sentry/", pattern: /@sentry\/|SentryError/ },
];

export interface ForbiddenModuleHit {
  readonly url: string;
  readonly asset: string;
  readonly label: string;
}

/**
 * Every forbidden module found in the scripts a modern browser fetches for these URLs.
 * `noModule` assets are skipped for the same reason they are not counted: nobody downloads them.
 */
export function forbiddenModuleHits(
  dist: string,
  pages: readonly PageMeasurement[],
): ForbiddenModuleHit[] {
  const hits: ForbiddenModuleHit[] = [];
  for (const page of pages) {
    for (const asset of page.assets) {
      if (asset.noModule) continue;
      const source = readFileSync(join(dist, asset.asset), "utf8");
      for (const { label, pattern } of FORBIDDEN_CLIENT_MODULES) {
        if (pattern.test(source)) {
          hits.push({ url: page.url, asset: asset.asset, label });
        }
      }
    }
  }
  return hits;
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
    "| URL | fetched JS (gz) | fetched JS (br) | budget 120 KB br | scripts |",
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
    const forbidden = forbiddenModuleHits(dist, pages);

    const breaches = [
      ...pages
        .filter((page) => !page.withinBudget)
        .map(
          (page) =>
            `${page.url} ships ${kb(page.fetchedBrotliBytes)} of Brotli-encoded JavaScript, over the 120 KB budget of plan/01 §7 as restated by spec 004 §13 Q13`,
        ),
      ...messages
        .filter((size) => !size.withinBudget)
        .map(
          (size) =>
            `the client message payload for ${size.locale} is ${kb(size.bytes)} gzipped, over the 4 KB budget of spec 003 §6`,
        ),
      ...forbidden.map(
        (hit) =>
          `${hit.url} ships \`${hit.label}\` in its client bundle (${hit.asset}), which spec 004 AC-25 forbids on a public route`,
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
        forbidden.length === 0
          ? `client-js-budget: no measured URL ships ${FORBIDDEN_CLIENT_MODULES.map((module) => module.label).join(" or ")}`
          : "",
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
