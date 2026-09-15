/**
 * `pnpm budget:client-js` — the AC-27 measurement (spec 003 §6 "CWV budget impact", T-27;
 * TASK-043).
 *
 * `plan/01` §7 capped an indexable page at 120 KB of *gzipped* JavaScript; spec 004 §13 Q13
 * restates it, on the founder's decision of 2026-09-08 (option (a)), and §14 A1 corrects the
 * number to **≤ 128 KB of Brotli transfer** — 131 072 bytes, against the encoding Vercel
 * actually serves and Lighthouse actually measures (`resource-summary:script:size` is transfer
 * size). The gzip number is still printed beside it, because it is what every older note in
 * this repository quotes and dropping it would make two measurements incomparable; only the
 * Brotli number is compared against the budget. Spec 003 §6 caps the **serialised message
 * payload handed to the client** at 4 KB gzipped, unchanged.
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
 * The script set of a URL is **what a browser fetches for that URL**: the prerendered document's
 * own `<script src>` list, the chunks of the client references the document actually mounts, and
 * the `next/dynamic` chunks those chunks then request. It took two reviews to get there.
 *
 * `/review 26` fixed the first half. Reading only the document in `.next/server/app/*.html` misses
 * everything `next/dynamic` defers: the suggestion-banner island is rendered on every locale
 * document with `next/dynamic({ ssr: false })`, so the browser fetches its chunk immediately after
 * hydration — 72.5 KB Brotli of it at the time, because that chunk still contained zod — while
 * this script reported the page 72.5 KB lighter than a browser saw it. Those chunks come from
 * `.next/server/app/<entry>/react-loadable-manifest.json`.
 *
 * `/review 36` found what that fix over-counted, and TASK-085 fixed it. Turbopack writes the
 * **same** `next/dynamic` module ids into every route's loadable manifest — it is an app-level
 * list, not a per-route one — so `/` was charged the banner, consent and settings-panel chunk
 * groups although `(chooser)` mounts no island and a browser fetches none of them (`/review 36`:
 * 131 672 B charged against 116 429 B fetched; on TASK-085's base commit, 135 357 B charged
 * against 120 116 B fetched — 15 241 B of fiction). The route's manifest is now a *candidate*
 * list, filtered by reachability from what the document really loads:
 *
 *  1. the document's `<script src>` list, verbatim;
 *  2. the chunks of every client reference in the document's own flight payload — the
 *     `I[id,[chunks],"Name"]` rows Next emits for each Client Component it mounted. `/`'s payload
 *     names one application component (the root error boundary); a locale document's names the
 *     island loaders. A chunk named there and absent from the `<script src>` list is fetched
 *     during hydration, so it counts;
 *  3. every candidate lazy chunk whose asset path appears **as a string** inside a chunk already
 *     loaded, transitively. Turbopack writes the path verbatim
 *     (`Promise.all(["static/chunks/2-kq9….js"].map(…))`), so this follows the same edge the
 *     runtime does rather than inferring one.
 *
 * The closure starts from the **mounted** references rather than from every script the document
 * lists, and that is the whole of the fix: `/`'s HTML does list the banner loader's chunk, because
 * Turbopack puts an entry's client modules in the entry's script set, and that chunk does name the
 * island chunks — but `(chooser)` never mounts the loader, so the import never runs.
 *
 * The result is checked against a real browser rather than trusted:
 * `tests/e2e/client-js-budget.spec.ts` records every script response Chromium makes for the five
 * URLs of AC-24's set and asserts the two sets are equal, in both directions.
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
 * exceeds 4 KB, a forbidden module is found in a route's client bundle, or a catalogue value from
 * a namespace no client may read is found in a fetched chunk. The CI `build` job runs it with
 * `continue-on-error: true` on the step; TASK-056 owns the flip to blocking, together with
 * `lighthouse`. It stays informational until then because the framework floor is almost the whole
 * budget: after TASK-085 took the client provider and the catalogue import out, `/` measures
 * 116 778 B Brotli (14 294 B spare) and every locale document 122 360 B (8 712 B spare) against
 * 131 072 B — and 114 KB of the chooser's total is react-dom plus the App Router runtime, with no
 * application byte left to remove. TASK-056 owns the flip and the Lighthouse reconciliation (a
 * protected preview also runs `vercel.live`, which is not in this build output).
 *
 * Usage: `node scripts/client-js-budget.ts [--dist .next] [--url /en]…`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

import { launchLocales } from "../src/config/locales.ts";
import { loadMessages, namespacesFor } from "../src/modules/i18n/messages.ts";

import { FONT_BUDGET_BYTES, readManifest } from "./fonts/build-fonts.ts";

/**
 * `plan/01` §7 as restated by spec 004 §13 Q13 and **corrected by spec 004 §14 A1**: 128 KB —
 * 131 072 bytes — of **Brotli** script
 * transfer on an indexable page. The same number `lighthouserc.json` asserts as
 * `resource-summary:script:size`, now against the same encoding.
 */
export const CLIENT_JS_BUDGET_BYTES = 128 * 1024;

/** Spec 003 §6 / AC-27: the serialised client message payload, gzipped. */
export const MESSAGES_PAYLOAD_BUDGET_BYTES = 4 * 1024;

/**
 * The URLs measured by default: AC-24's five — the chooser and all four launch locale homes
 * (TASK-056 widened the list from spec 003's `/`, `/en`, `/de`; `lighthouse` measures the same
 * five, from `tests/fixtures/seo/lighthouse-urls.json`).
 */
export const DEFAULT_URLS = ["/", "/en", "/en-gb", "/de", "/pl"] as const;

export const DEFAULT_DIST = ".next";

/**
 * How far a public route's script transfer may grow against the committed baseline before this
 * script fails (spec 004 AC-25; TASK-056).
 *
 * The AC words it as "5 KB gz"; the budget itself became Brotli at §14 A1, and a guard measured in
 * one encoding against a budget measured in another is exactly the confusion that correction
 * removed — so the allowance is 5 KB of the **same** Brotli total the budget uses (spec 004 §14
 * A13). It exists because the absolute budget has ~9 KB of headroom on a locale document and no
 * application byte left to remove: without it, a 4 KB import lands green, and the next one has
 * nowhere to go.
 */
export const REGRESSION_ALLOWANCE_BYTES = 5 * 1024;

/** The committed table this script compares against, and rewrites with `--update-baseline`. */
export const BASELINE_FILE = "tests/fixtures/seo/bundle-baseline.json";

export interface ScriptTag {
  /** Path of the asset inside the dist directory, e.g. `static/chunks/abc.js`. */
  readonly asset: string;
  /** `<script noModule>`: served to legacy browsers only, so never fetched by a modern one. */
  readonly noModule: boolean;
  /**
   * How the browser gets it: `document` for a `<script src>` of the prerendered HTML, `lazy` for
   * a chunk fetched during or after hydration — a client reference the document mounts whose
   * chunk the HTML does not list, or a `next/dynamic` chunk one of those chunks then requests.
   * Both count; the distinction is printed so a growth is attributable.
   */
  readonly kind: "document" | "lazy";
}

/**
 * A Client Component the prerendered document actually mounts, as its own flight payload names it
 * (TASK-085).
 *
 * Next emits one `I[id,[chunks],"Name"]` row per client reference into the `self.__next_f.push(…)`
 * blocks of the HTML. That list is the honest answer to "which islands does *this* URL hydrate",
 * which the per-route `react-loadable-manifest.json` is not: Turbopack writes the same
 * `next/dynamic` ids into every route's copy of it. `/`'s payload names `global-error` and nothing
 * else; a locale document's names the banner loader, the consent loader, the finder and both error
 * boundaries. It is also what proves a removal: after TASK-085 no document names
 * `NextIntlClientProvider`.
 */
export interface ClientReference {
  readonly id: string;
  /** The exported name Next recorded — `default`, `*` or the component's own name. */
  readonly name: string;
  /** Asset paths inside the dist directory, e.g. `static/chunks/abc.js`. */
  readonly chunks: readonly string[];
}

export interface MeasuredAsset extends ScriptTag {
  readonly rawBytes: number;
  readonly gzipBytes: number;
  readonly brotliBytes: number;
}

export interface PageMeasurement {
  readonly url: string;
  /** Every script of the page — document `<script src>` and lazy chunk — biggest first. */
  readonly assets: readonly MeasuredAsset[];
  /** The Client Components this document mounts, from its flight payload (printed, not counted). */
  readonly references: readonly ClientReference[];
  /** Gzipped total of the assets a modern browser fetches (`noModule` excluded). Reported only. */
  readonly fetchedGzipBytes: number;
  /** Brotli total of the same assets. **This** is what the budget is compared against. */
  readonly fetchedBrotliBytes: number;
  /** Brotli total of the document's own `<script src>` list — the lower bound of the two. */
  readonly documentBrotliBytes: number;
  /** Brotli total of the route's `next/dynamic` chunks, printed so the delta is never hidden. */
  readonly lazyBrotliBytes: number;
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
    tags.push({
      asset,
      noModule: /\bnoModule\b/i.test(match[0]),
      kind: "document",
    });
  }
  return tags;
}

/**
 * Every client reference in a prerendered document's flight payload, de-duplicated by id.
 *
 * The payload is embedded in JS string literals, so the quotes arrive escaped
 * (`I[63491,[\"/_next/static/chunks/….js\"],\"default\"]`); the escapes are undone first so one
 * expression reads both the HTML form and the raw `.rsc` form. A row with no chunks (Next's own
 * boundary components share the framework chunk) is kept: the point of the list is *which
 * components this URL mounts*, and that is what the assertions in
 * `tests/unit/client-js-budget.test.ts` read.
 */
const CLIENT_REFERENCE = /I\[(\d+),\[([^\]]*)\],"([^"]*)"\]/g;
const REFERENCE_CHUNK = /"\/_next\/(static\/[^"]+?\.js)"/g;

export function parseClientReferences(html: string): ClientReference[] {
  const flight = html.replaceAll('\\"', '"');
  const seen = new Set<string>();
  const references: ClientReference[] = [];
  for (const match of flight.matchAll(CLIENT_REFERENCE)) {
    const [, id, chunkList, name] = match;
    if (id === undefined || name === undefined || seen.has(id)) continue;
    seen.add(id);
    references.push({
      id,
      name,
      chunks: [...(chunkList ?? "").matchAll(REFERENCE_CHUNK)].flatMap(
        (chunk) => (chunk[1] === undefined ? [] : [chunk[1]]),
      ),
    });
  }
  return references;
}

/**
 * The prerendered document of a URL. `/` is `index.html`; `/en` is `en.html` — Next writes the
 * route path with no leading slash, and a nested route would be `en/about.html`.
 */
export function documentPathFor(dist: string, url: string): string {
  const route = url.replace(/^\/+/, "").replace(/\/+$/, "");
  return join(dist, "server/app", `${route === "" ? "index" : route}.html`);
}

/**
 * The app-router entry key of a URL, e.g. `/` -> `/(chooser)/page` and `/de` -> `/[locale]/page`.
 *
 * Read from `.next/app-path-routes-manifest.json`, which maps every entry directory under
 * `.next/server/app/` to the route it serves. Matching is exact first, then segment by segment so
 * a `[param]` or `[...param]` segment matches — the manifest is the only place that mapping
 * exists, and a route group like `(chooser)` means the directory name cannot be derived from the
 * URL.
 */
export function routeEntryFor(dist: string, url: string): string | null {
  const manifestPath = join(dist, "app-path-routes-manifest.json");
  let manifest: Record<string, string>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      string
    >;
  } catch {
    throw new Error(
      `no ${manifestPath} — run \`pnpm build\` first (without it a next/dynamic chunk would go uncounted, which is what /review 26 caught)`,
    );
  }
  const wanted = url.replace(/\/+$/, "").split("/").filter(Boolean);
  // Literal routes before dynamic ones, and fewer dynamic segments before more: `/banner` is
  // served by `/banner/page`, not by `/[locale]/page`, exactly as the router resolves it.
  const candidates = Object.entries(manifest).sort(
    ([, a], [, b]) =>
      (a.match(/\[/g)?.length ?? 0) - (b.match(/\[/g)?.length ?? 0),
  );
  for (const [entry, route] of candidates) {
    const segments = route.split("/").filter(Boolean);
    if (segments.some((segment) => segment.startsWith("[..."))) {
      const fixed = segments.slice(0, -1);
      if (
        wanted.length >= fixed.length &&
        fixed.every((segment, index) => matchSegment(segment, wanted[index]))
      ) {
        return entry;
      }
      continue;
    }
    if (segments.length !== wanted.length) continue;
    if (
      segments.every((segment, index) => matchSegment(segment, wanted[index]))
    )
      return entry;
  }
  return null;
}

function matchSegment(segment: string, actual: string | undefined): boolean {
  if (actual === undefined) return false;
  return segment.startsWith("[") ? true : segment === actual;
}

/**
 * The `next/dynamic` chunks a URL's route **may** fetch: every file of every entry in the route's
 * `react-loadable-manifest.json`, de-duplicated. A candidate list, not a bill — see
 * `reachableAssets()` for what turns it into one.
 *
 * A route with no dynamic import has an empty manifest or none at all, which is `[]` — but a URL
 * with no entry in the routes manifest throws, because "this URL has no lazy chunks" and "this
 * script cannot tell" must not be the same answer (that equivalence is the `/review 26` bug).
 */
export function loadableAssetsFor(dist: string, url: string): ScriptTag[] {
  const entry = routeEntryFor(dist, url);
  if (entry === null) {
    throw new Error(
      `no app-router entry for ${url} in ${join(dist, "app-path-routes-manifest.json")}`,
    );
  }
  let manifest: Record<string, { files?: readonly string[] }>;
  try {
    manifest = JSON.parse(
      readFileSync(
        join(dist, "server/app", entry, "react-loadable-manifest.json"),
        "utf8",
      ),
    ) as Record<string, { files?: readonly string[] }>;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const tags: ScriptTag[] = [];
  for (const { files = [] } of Object.values(manifest)) {
    for (const file of files) {
      if (!file.endsWith(".js") || seen.has(file)) continue;
      seen.add(file);
      tags.push({ asset: file, noModule: false, kind: "lazy" });
    }
  }
  return tags;
}

/**
 * The candidates a browser actually reaches, starting from the chunks it has already loaded
 * (TASK-085; `/review 36`'s finding).
 *
 * Turbopack writes a lazily requested chunk's path verbatim into the chunk that requests it
 * (`Promise.all(["static/chunks/2-kq9….js"].map(t => e.l(t)))`), so "will this be fetched" is a
 * string search along the same edge the runtime follows — repeated until nothing new appears,
 * because a lazy chunk may request another. Restricted to the route's loadable candidates rather
 * than to every emitted chunk name: the candidate list is what Next wrote for this graph, and an
 * unrestricted search would count a chunk merely *named* in a manifest blob.
 *
 * This is the whole fix for `/`: `(chooser)` shares the app's loadable manifest with `[locale]`,
 * but nothing `/` loads mentions the island chunks, so `/` is charged none of them.
 */
export function reachableAssets(
  dist: string,
  loaded: readonly string[],
  candidates: readonly ScriptTag[],
): ScriptTag[] {
  const sources = new Map<string, string>();
  const read = (asset: string): string => {
    let source = sources.get(asset);
    if (source === undefined) {
      try {
        source = readFileSync(join(dist, asset), "utf8");
      } catch {
        // A chunk named in a manifest but absent from the output cannot be fetched either.
        source = "";
      }
      sources.set(asset, source);
    }
    return source;
  };
  const reached = new Set(loaded);
  const found: ScriptTag[] = [];
  let growing = true;
  while (growing) {
    growing = false;
    for (const candidate of candidates) {
      if (reached.has(candidate.asset)) continue;
      if ([...reached].some((asset) => read(asset).includes(candidate.asset))) {
        reached.add(candidate.asset);
        found.push(candidate);
        growing = true;
      }
    }
  }
  return found;
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
    const documentTags = parseScriptTags(html);
    const documented = new Set(documentTags.map((tag) => tag.asset));
    const references = parseClientReferences(html);
    // A chunk the document already lists is fetched once, so it is counted once — as a document
    // script, which is the honest label for it. What is left is fetched during hydration: the
    // chunks of the Client Components this document mounts, then the `next/dynamic` chunks those
    // go on to request.
    const referenced = new Set<string>();
    for (const reference of references) {
      for (const chunk of reference.chunks) {
        if (!documented.has(chunk)) referenced.add(chunk);
      }
    }
    const hydrationTags: ScriptTag[] = [...referenced].map((asset) => ({
      asset,
      noModule: false,
      kind: "lazy",
    }));
    // The closure starts from the chunks of the **mounted** client references, not from every
    // script the document lists. That distinction is the `/review 36` over-count: `/`'s HTML does
    // list the banner loader's 1 434 B chunk (Turbopack puts an entry's client modules in the
    // entry's script set), and that chunk names the island chunks — but `(chooser)` never mounts
    // the loader, so the dynamic import never runs and the browser fetches none of them. A
    // `next/dynamic` chunk is requested by the component that mounts, so the mounted set is the
    // honest seed.
    const loaded = references.flatMap((reference) => [...reference.chunks]);
    const lazyTags = reachableAssets(
      dist,
      loaded,
      loadableAssetsFor(dist, url).filter(
        (tag) => !documented.has(tag.asset) && !referenced.has(tag.asset),
      ),
    );
    const assets = [...documentTags, ...hydrationTags, ...lazyTags]
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
      references,
      fetchedGzipBytes: fetched.reduce(
        (total, asset) => total + asset.gzipBytes,
        0,
      ),
      fetchedBrotliBytes,
      documentBrotliBytes: fetched
        .filter((asset) => asset.kind === "document")
        .reduce((total, asset) => total + asset.brotliBytes, 0),
      lazyBrotliBytes: fetched
        .filter((asset) => asset.kind === "lazy")
        .reduce((total, asset) => total + asset.brotliBytes, 0),
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
 * Every forbidden module found in the scripts a modern browser fetches for these URLs — the lazy
 * `next/dynamic` chunks included, which is where zod actually was when `/review 26` looked.
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

/**
 * Namespaces whose copy no client chunk may contain (spec 004 §14 A1 addendum; TASK-085).
 *
 * The cliff this closes was measured twice. `src/modules/i18n/error-document.ts` imported all of
 * `messages/en.json` for four strings, and Turbopack tree-shakes a JSON import only below a size
 * threshold: once the catalogue crossed it, the **whole** file shipped in the chunk Next attaches
 * to the root error boundary — i.e. to every document, `/` included — so `home.*`, `catalog.*` and
 * `media.*` were in the initial script set of pages that never render them (4 751 B Brotli), and
 * every copy task paid 0 B or ~3.4 KB depending on which side of the threshold the file happened
 * to land that day (TASK-052, TASK-073). `src/modules/i18n/messages.ts` is the same trap with four
 * catalogues behind it.
 *
 * Bytes alone would not have caught it: 4.6 KB is inside the noise of a framework upgrade. So the
 * assertion is about *content*, and it is taken from the catalogue at run time rather than
 * hard-coded, so a copy edit cannot make it quietly vacuous.
 */
export const CLIENT_FORBIDDEN_NAMESPACES = [
  "home",
  "finder",
  "catalog",
  "media",
] as const;

/** The shortest usable probe length: long enough that a coincidental match is not credible. */
const PROBE_MIN_LENGTH = 24;

export interface CatalogueProbe {
  readonly namespace: string;
  readonly key: string;
  readonly value: string;
}

/**
 * One probe per forbidden namespace: its longest leaf value, with the flattened key it came from.
 * Read from the shipped `en` catalogue through `loadMessages()`, so the probe is a string that
 * really is in the bundle when the namespace leaks — and `tests/unit/client-js-budget.test.ts`
 * asserts a probe exists for every namespace, so a renamed namespace fails the test rather than
 * silencing the check.
 */
export function catalogueProbes(): CatalogueProbe[] {
  const catalogue = loadMessages("en", CLIENT_FORBIDDEN_NAMESPACES);
  const probes: CatalogueProbe[] = [];
  for (const namespace of CLIENT_FORBIDDEN_NAMESPACES) {
    let best: CatalogueProbe | undefined;
    const walk = (node: unknown, path: readonly string[]): void => {
      if (typeof node === "string") {
        if (
          node.length >= PROBE_MIN_LENGTH &&
          node.length > (best?.value.length ?? 0)
        ) {
          best = { namespace, key: path.join("."), value: node };
        }
        return;
      }
      if (typeof node !== "object" || node === null) return;
      for (const [key, value] of Object.entries(node)) {
        walk(value, [...path, key]);
      }
    };
    walk(catalogue[namespace], [namespace]);
    if (best !== undefined) probes.push(best);
  }
  return probes;
}

export interface CatalogueLeak {
  readonly url: string;
  readonly asset: string;
  readonly namespace: string;
  readonly key: string;
}

/**
 * Every server-only catalogue value found in a script one of these URLs fetches. `noModule`
 * assets are skipped for the same reason they are not counted: nobody downloads them.
 */
export function catalogueLeaks(
  dist: string,
  pages: readonly PageMeasurement[],
): CatalogueLeak[] {
  const probes = catalogueProbes();
  const leaks: CatalogueLeak[] = [];
  for (const page of pages) {
    for (const asset of page.assets) {
      if (asset.noModule) continue;
      const source = readFileSync(join(dist, asset.asset), "utf8");
      for (const probe of probes) {
        if (source.includes(probe.value)) {
          leaks.push({
            url: page.url,
            asset: asset.asset,
            namespace: probe.namespace,
            key: probe.key,
          });
        }
      }
    }
  }
  return leaks;
}

/**
 * The application-code markers no chunk of `/` may contain (spec 004 AC-12, AC-25; TASK-056).
 *
 * "`/` ships zero application JavaScript" is a claim spec 003 AC-7 made and every later spec
 * repeated, and until now nothing measured it: the chooser's byte total is the framework floor,
 * and a framework floor plus a small island looks like a framework floor. What separates the two
 * is *content*. Every component of the design system renders a `data-fo-*` attribute — it is how
 * the e2e, a11y and visual suites select anything at all — so a chunk that carries one carries
 * rendered application UI.
 *
 * The attribute, not a component name: Turbopack writes a `next/dynamic` module's *name* into the
 * loader stub of the entry that declares it, so `/`'s 1 434 B loader chunk mentions
 * `LocaleSuggestionBannerIsland` although the chooser never mounts it and the browser never
 * fetches the island (`/review 36`, §14 A1 addendum). A name proves nothing; markup does.
 */
export const APPLICATION_MARKUP_MARKER = /data-fo-[a-z-]+=/;

/** The route that must stay free of it, and the reason, so a failure explains itself. */
export const ZERO_APP_JS_URL = "/";

export interface ApplicationCodeHit {
  readonly url: string;
  readonly asset: string;
}

/**
 * Application markup found in a script `/` fetches, and the `next/dynamic` chunks it fetches at
 * all — either one contradicts AC-12's "zero application JS" for the chooser.
 */
export function applicationCodeHits(
  dist: string,
  pages: readonly PageMeasurement[],
): ApplicationCodeHit[] {
  const page = pages.find((candidate) => candidate.url === ZERO_APP_JS_URL);
  if (page === undefined) return [];
  const hits: ApplicationCodeHit[] = [];
  for (const asset of page.assets) {
    if (asset.noModule) continue;
    if (asset.kind === "lazy") {
      hits.push({ url: page.url, asset: asset.asset });
      continue;
    }
    const source = readFileSync(join(dist, asset.asset), "utf8");
    if (APPLICATION_MARKUP_MARKER.test(source)) {
      hits.push({ url: page.url, asset: asset.asset });
    }
  }
  return hits;
}

export interface FontTransfer {
  /** Named `transferBytes` and not `total…` because `fo/no-float-money` reads the latter as money. */
  readonly transferBytes: number;
  readonly budgetBytes: number;
  readonly withinBudget: boolean;
  readonly faces: readonly { readonly file: string; readonly bytes: number }[];
}

/**
 * Font transfer per page (spec 004 AC-4's ≤45 KB, restated as an AC-25 clause; TASK-056).
 *
 * Read from `src/modules/ui/fonts/subset.json`, the manifest `pnpm fonts:build` writes and
 * `tests/unit/fonts.test.ts` pins byte-for-byte against the committed `.woff2` files. Every
 * document preloads all three faces (`src/modules/ui/fonts/index.ts`), so the per-page transfer
 * *is* the manifest total; this reports it in the same table as the script budget because §11's
 * bundle table has a Fonts column and a budget printed nowhere is a budget nobody reads.
 */
export function fontTransfer(root: string): FontTransfer {
  const manifest = readManifest(root);
  const faces = manifest.faces.map((face) => ({
    file: face.file,
    bytes: face.bytes,
  }));
  const transferBytes = faces.reduce((sum, face) => sum + face.bytes, 0);
  return {
    transferBytes,
    budgetBytes: FONT_BUDGET_BYTES,
    withinBudget: transferBytes <= FONT_BUDGET_BYTES,
    faces,
  };
}

export interface BundleBaseline {
  readonly budgetBytes: number;
  readonly regressionAllowanceBytes: number;
  /** Route -> Brotli script transfer, the number the budget is compared against. */
  readonly routes: Readonly<Record<string, number>>;
}

export interface Regression {
  readonly url: string;
  readonly baselineBytes: number;
  readonly measuredBytes: number;
  readonly deltaBytes: number;
}

/**
 * The committed baseline, or `null` when there is none yet (the first run writes one with
 * `--update-baseline`). Parsed defensively rather than trusted: a baseline with a route missing
 * is a route with no guard, and that must be visible rather than silently permissive.
 */
export function readBaseline(root: string): BundleBaseline | null {
  try {
    const parsed = JSON.parse(
      readFileSync(join(root, BASELINE_FILE), "utf8"),
    ) as Partial<BundleBaseline>;
    if (typeof parsed.routes !== "object" || parsed.routes === null)
      return null;
    return {
      budgetBytes: parsed.budgetBytes ?? CLIENT_JS_BUDGET_BYTES,
      regressionAllowanceBytes:
        parsed.regressionAllowanceBytes ?? REGRESSION_ALLOWANCE_BYTES,
      routes: parsed.routes,
    };
  } catch {
    return null;
  }
}

/** Routes that grew more than the allowance, and routes the baseline does not cover. */
export function regressions(
  baseline: BundleBaseline | null,
  pages: readonly PageMeasurement[],
): { readonly grown: Regression[]; readonly unknown: string[] } {
  if (baseline === null) {
    return { grown: [], unknown: pages.map((page) => page.url) };
  }
  const grown: Regression[] = [];
  const unknown: string[] = [];
  for (const page of pages) {
    const baselineBytes = baseline.routes[page.url];
    if (baselineBytes === undefined) {
      unknown.push(page.url);
      continue;
    }
    const deltaBytes = page.fetchedBrotliBytes - baselineBytes;
    if (deltaBytes > baseline.regressionAllowanceBytes) {
      grown.push({
        url: page.url,
        baselineBytes,
        measuredBytes: page.fetchedBrotliBytes,
        deltaBytes,
      });
    }
  }
  return { grown, unknown };
}

/** `--update-baseline`: rewrite the committed table from this build, in Prettier's shape. */
export function writeBaseline(
  root: string,
  pages: readonly PageMeasurement[],
): string {
  const routes: Record<string, number> = {};
  for (const page of pages) routes[page.url] = page.fetchedBrotliBytes;
  const file = {
    "//": [
      "Committed bundle baseline (spec 004 §11, AC-25; TASK-056).",
      "Brotli script transfer per public route, as `pnpm budget:client-js` measures it from the",
      "build output. The absolute budget is `budgetBytes`; a route that grows more than",
      "`regressionAllowanceBytes` against the number here fails the gate even while it is inside",
      "the budget, because the budget's remaining headroom is the framework's, not ours.",
      "Regenerate deliberately with `pnpm budget:client-js --update-baseline` and say in the PR",
      "which import moved the number.",
    ],
    budgetBytes: CLIENT_JS_BUDGET_BYTES,
    regressionAllowanceBytes: REGRESSION_ALLOWANCE_BYTES,
    routes,
  };
  const path = join(root, BASELINE_FILE);
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  return path;
}

export interface MessagesPayloadSize {
  readonly locale: string;
  readonly rawBytes: number;
  readonly bytes: number;
  readonly withinBudget: boolean;
}

/**
 * The gzipped size of the `localeDocument` namespace subset, per launch locale — spec 003 §6 /
 * AC-27's 4 KB budget.
 *
 * Until TASK-085 this was literally what `NextIntlClientProvider` serialised into every localised
 * document. There is no provider now (spec 004 §14 A1 addendum) and no client payload at all, so
 * what this measures is the **upper bound**: the copy a locale document's own boundaries resolve,
 * i.e. what a payload would cost if one were ever reintroduced. The claim that today's payload is
 * zero is not made here, where it would be a comment; it is `catalogueLeaks()` above and
 * `tests/unit/client-message-graph.test.ts`, which read the built chunks and the import graph.
 * No build output is needed for this one — the subset is a pure function of the catalogues.
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

export function formatMarkdownTable(
  pages: readonly PageMeasurement[],
  fonts: FontTransfer,
  baseline: BundleBaseline | null,
): string {
  const lines = [
    "| Route | first-load JS (br) | + `next/dynamic` (br) | total (br) | total (gz) | vs baseline | fonts | budget |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const page of pages) {
    const baselineBytes = baseline?.routes[page.url];
    const delta =
      baselineBytes === undefined
        ? "no baseline"
        : `${page.fetchedBrotliBytes - baselineBytes >= 0 ? "+" : "−"}${kb(
            Math.abs(page.fetchedBrotliBytes - baselineBytes),
          )}`;
    lines.push(
      `| \`${page.url}\` | ${kb(page.documentBrotliBytes)} | ${kb(page.lazyBrotliBytes)} | ${kb(
        page.fetchedBrotliBytes,
      )} | ${kb(page.fetchedGzipBytes)} | ${delta} | ${kb(fonts.transferBytes)} | ${
        page.withinBudget ? "within 128 KB br" : "**over 128 KB br**"
      } |`,
    );
  }
  lines.push("");
  lines.push(
    `Fonts: ${kb(fonts.transferBytes)} for ${String(fonts.faces.length)} faces, budget ${kb(
      fonts.budgetBytes,
    )} — ${fonts.withinBudget ? "within" : "**over**"}. Regression allowance ${kb(
      baseline?.regressionAllowanceBytes ?? REGRESSION_ALLOWANCE_BYTES,
    )} br against \`${BASELINE_FILE}\`.`,
  );
  return lines.join("\n");
}

/** The per-chunk breakdown, so a growth is attributable to the import that caused it. */
export function formatChunkList(pages: readonly PageMeasurement[]): string {
  const lines: string[] = [];
  for (const page of pages) {
    lines.push(`${page.url}`);
    // The Client Components the document mounts, named. This is the line that shows a provider or
    // an island appearing on a URL that should not have one (TASK-085).
    lines.push(
      `  client references: ${
        page.references.length === 0
          ? "none"
          : page.references
              .map((reference) => reference.name)
              .sort()
              .join(", ")
      }`,
    );
    for (const asset of page.assets) {
      lines.push(
        `  ${kb(asset.gzipBytes).padStart(9)} gz  ${kb(asset.brotliBytes).padStart(9)} br  ${
          asset.noModule
            ? "[noModule, not fetched] "
            : asset.kind === "lazy"
              ? "[next/dynamic, fetched after hydration] "
              : ""
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
    const root = process.cwd();
    const pages = measurePages(dist, urls.length > 0 ? urls : DEFAULT_URLS);
    const messages = messagesPayloadSizes();
    const forbidden = forbiddenModuleHits(dist, pages);
    const leaks = catalogueLeaks(dist, pages);
    const fonts = fontTransfer(root);
    const applicationCode = applicationCodeHits(dist, pages);

    if (argv.includes("--update-baseline")) {
      const path = writeBaseline(root, pages);
      out.write(
        `${formatMarkdownTable(pages, fonts, readBaseline(root))}\n\nclient-js-budget: wrote ${path}\n`,
      );
      return 0;
    }
    const baseline = readBaseline(root);
    const { grown, unknown } = regressions(baseline, pages);

    const breaches = [
      ...pages
        .filter((page) => !page.withinBudget)
        .map(
          (page) =>
            `${page.url} ships ${kb(page.fetchedBrotliBytes)} of Brotli-encoded JavaScript, over the 128 KB budget of plan/01 §7 as restated by spec 004 §13 Q13 and corrected by §14 A1`,
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
      ...leaks.map(
        (leak) =>
          `${leak.url} ships the \`${leak.namespace}.*\` catalogue in a fetched chunk (${leak.asset}, e.g. \`${leak.key}\`) — no client may read a message catalogue since spec 004 §14 A1's addendum`,
      ),
      ...(fonts.withinBudget
        ? []
        : [
            `font transfer is ${kb(fonts.transferBytes)} across ${String(fonts.faces.length)} faces, over the ${kb(fonts.budgetBytes)} budget of spec 004 AC-4`,
          ]),
      ...applicationCode.map(
        (hit) =>
          `${hit.url} fetches ${hit.asset}, which is application JavaScript — the chooser ships none (spec 003 AC-7, spec 004 AC-12, AC-25)`,
      ),
      ...grown.map(
        (regression) =>
          `${regression.url} grew ${kb(regression.deltaBytes)} against \`${BASELINE_FILE}\` (${kb(
            regression.baselineBytes,
          )} -> ${kb(regression.measuredBytes)}), over the ${kb(REGRESSION_ALLOWANCE_BYTES)} allowance of spec 004 AC-25 — name the import in the PR and re-run with \`--update-baseline\``,
      ),
      ...unknown.map(
        (url) =>
          `${url} has no row in \`${BASELINE_FILE}\`, so nothing guards it against a regression — re-run with \`--update-baseline\``,
      ),
    ];

    out.write(
      [
        formatMarkdownTable(pages, fonts, baseline),
        "",
        formatMessagesTable(messages),
        "",
        formatChunkList(pages),
        "",
        forbidden.length === 0
          ? `client-js-budget: no measured URL ships ${FORBIDDEN_CLIENT_MODULES.map((module) => module.label).join(" or ")}`
          : "",
        leaks.length === 0
          ? `client-js-budget: no fetched chunk contains ${CLIENT_FORBIDDEN_NAMESPACES.map((namespace) => `${namespace}.*`).join(", ")} catalogue copy`
          : "",
        applicationCode.length === 0
          ? `client-js-budget: ${ZERO_APP_JS_URL} fetches no application JavaScript and no next/dynamic chunk`
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
