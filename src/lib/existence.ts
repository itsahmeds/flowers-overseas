/**
 * The existence manifest (spec 012b §2.3, §5.2 "`existence.ts`", AC-5, AC-38; TASK-295).
 *
 * `next build` emits a fixed set of URLs (`dynamicParams = false` binds every depth of the
 * `[locale]` tree, spec 012b §2.0 item 1). The build wrapper (`scripts/build.ts`) writes that set
 * here, as one manifest: every prerendered public path, sorted, with the database's `now()` read
 * before the build's first catalogue query (`dataAsOf`, advisor F1). Its SHA-256 over the URL list
 * is the deployment's `existenceHash`, which `GET /api/health` reports beside the commit.
 *
 * At runtime, existence is **"the database says so AND the manifest has it"**: `manifestAdmits()`
 * is the manifest half, composed into every existence predicate that feeds the resolver, the
 * listings, the links, the sitemaps and the hreflang clusters (`src/modules/catalog/product.ts`,
 * `listing.ts`, `src/modules/geo/corridor.ts`). Without a manifest (a laptop, the tests, and the
 * build itself, which is what makes the manifest) it admits everything, which is exactly the
 * behaviour before publishing existed.
 *
 * Node-runnable (relative imports only): the build wrapper imports the pure half. No file is read
 * here, so nothing on a render path imports `node:fs` (`tests/unit/corridor-corpus-index.test.ts`):
 * the server's boot reads the file once (`./existence-load.ts`, from `instrumentation.ts`) and puts
 * it in place with `installExistenceManifest()`.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import { z } from "zod";

import { LOCALES } from "../config/locales.ts";

/** The internal product route's segment (`src/lib/product-rewrites.ts`). */
const PRODUCT_ROUTE_SEGMENT = "-product";

/** The manifest's file name, under `.next/` beside the server it describes. */
export const EXISTENCE_MANIFEST_FILE = "existence-manifest.json";

/** The manifest, validated wherever it is read (a file is a boundary). */
export const ExistenceManifestSchema = z
  .object({
    version: z.literal(1),
    /** Every public path the build emitted, sorted, unique. */
    urls: z.array(z.string().regex(/^\/[^\s?#]*$/u)),
    /** The database's `now()` before the build's first catalogue query; `null` without one. */
    dataAsOf: z.iso.datetime({ offset: true }).nullable(),
    /** SHA-256 (hex) of the URL list: `existenceHashOf(urls)`. */
    existenceHash: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict()
  .refine(
    (manifest) => manifest.existenceHash === existenceHashOf(manifest.urls),
    {
      message: "existenceHash is not the SHA-256 of the URL list",
    },
  );

export type ExistenceManifest = z.infer<typeof ExistenceManifestSchema>;

/** The hash of a URL set: SHA-256 over the sorted, de-duplicated paths joined by newlines. */
export function existenceHashOf(urls: Iterable<string>): string {
  const sorted = [...new Set(urls)].sort();
  return createHash("sha256").update(sorted.join("\n")).digest("hex");
}

const LOCALE_CODES = new Set(LOCALES.map((locale) => locale.code));

/**
 * The public path a prerendered route path stands for, or `undefined` when it is no public page:
 * a path outside the `[locale]` tree, a rewrite target such as the query-string variants, or the
 * internal product route, which maps back to the product's public address
 * (`/{locale}/-product/{country}/{segment}/{slug}` → `/{locale}/{country}/{segment}/{slug}`).
 */
export function publicPathOf(routePath: string): string | undefined {
  const parts = routePath.split("/").filter(Boolean);
  const [locale, ...rest] = parts;
  if (locale === undefined || !LOCALE_CODES.has(locale)) return undefined;
  if (rest.some((part) => part.startsWith("%5F") || part.startsWith("_"))) {
    return undefined;
  }
  if (rest[0] === PRODUCT_ROUTE_SEGMENT) {
    return rest.length === 4
      ? `/${[locale, ...rest.slice(1)].join("/")}`
      : undefined;
  }
  return `/${parts.join("/")}`;
}

/** The manifest of a build, from its prerendered route paths (`prerender-manifest.json`). */
export function existenceManifestOf(
  routePaths: Iterable<string>,
  dataAsOf: string | null,
): ExistenceManifest {
  const urls = [
    ...new Set(
      [...routePaths]
        .map(publicPathOf)
        .filter((path): path is string => path !== undefined),
    ),
  ].sort();
  return { version: 1, urls, dataAsOf, existenceHash: existenceHashOf(urls) };
}

/* -------------------------------------------------------------------------- */
/* The running deployment's manifest.                                         */
/* -------------------------------------------------------------------------- */

interface Loaded {
  readonly manifest: ExistenceManifest | null;
  readonly urls: ReadonlySet<string>;
}

const SLOT = Symbol.for("flowers-overseas.existence-manifest");
type Holder = { [SLOT]?: Loaded };

/** No manifest in place: before the boot has loaded one, on a laptop, in the tests, in the build. */
const NONE: Loaded = { manifest: null, urls: new Set() };

/** The manifest the boot put in place, shared by every bundle of the process (`globalThis`). */
function loaded(): Loaded {
  return (globalThis as Holder)[SLOT] ?? NONE;
}

/** The running deployment's manifest, or `null` where there is none. */
export function runningManifest(): ExistenceManifest | null {
  return loaded().manifest;
}

/**
 * The manifest half of every existence predicate: `true` when there is no manifest, else whether
 * the build emitted `path`. A page the database made after the build is not in it, so it stays
 * out of every list and link until a publish (AC-5).
 */
export function manifestAdmits(path: string): boolean {
  if (databaseOnlyScope.getStore() === true) return true;
  const { manifest, urls } = loaded();
  return manifest === null || urls.has(path);
}

/**
 * Whether the manifest half applies here: a manifest is running and this async context is not
 * inside `databaseOnly()`. A caller that must build a path to ask `manifestAdmits()` asks this
 * first, so that without a manifest nothing changes, not even for a page with no path.
 */
export function manifestInForce(): boolean {
  if (databaseOnlyScope.getStore() === true) return false;
  return loaded().manifest !== null;
}

const databaseOnlyScope = new AsyncLocalStorage<boolean>();

/**
 * Run `body` with the manifest half switched off, for this async context only: the existence
 * predicates then answer what **the database** says, which is the URL set the next build would
 * emit (`existenceDiff()`). Concurrent requests keep the composed answer.
 */
export function databaseOnly<T>(body: () => Promise<T>): Promise<T> {
  return databaseOnlyScope.run(true, body);
}

/** Put `manifest` in place as the running one (`null` for none); the test seam. */
export function installExistenceManifest(
  manifest: ExistenceManifest | null,
): void {
  (globalThis as Holder)[SLOT] = {
    manifest,
    urls: new Set(manifest?.urls ?? []),
  };
}

/** Forget the loaded manifest, so the next read loads the file again (tests). */
export function resetExistenceManifest(): void {
  delete (globalThis as Holder)[SLOT];
}
