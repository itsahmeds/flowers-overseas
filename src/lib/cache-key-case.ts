/**
 * Case-exact cache files: a cache key may only ever read or write the file whose name it spells
 * (spec 003 §6 "Canonical": exactly one URL form per (locale, path) is reachable, unknown case
 * 404s; spec 007 §2; TASK-247, QA-2 N-01).
 *
 * ## The defect
 *
 * Next's `FileSystemCache` stores a page under `.next/server/app/<path>.html` at build time and,
 * once the page is regenerated (after its revalidate window, or a tag revalidation), under
 * `.next/server/route-cache/APP_PAGE/<owner>/$/<path>.html`. The key is the request path exactly
 * as it arrived, so `/EN` and `/en` are two keys. On a **case-insensitive volume** (macOS APFS,
 * where the founder and the QA agents run `pnpm start`) they are one file. Reproduced on a
 * production build (TASK-247 `## Result`): after `/en` had been regenerated, a request for `/EN`
 * answered **200 with the real page** (a duplicate URL), Next then regenerated the variant as the
 * router's 404 and wrote it through `$/EN.html` into `$/en.html`, and from the next restart (or
 * the next memory-cache eviction) `/en` itself answered 404, across restarts until `.next` was
 * deleted (QA-2 N-01: nine real pages in 25 minutes). On case-sensitive Linux (CI, the Railway
 * container) the two keys are two files and `/EN` is a miss, which `dynamicParams = false`
 * answers as a 404.
 *
 * ## The rule
 *
 * Before a response entry (`APP_PAGE`, `APP_ROUTE`, `PAGES`) is read or written, the file it
 * names is resolved to its true on-disk spelling. If a file exists there **under another
 * spelling**, the key is not that file's key: the read is a miss and the write is skipped. A
 * case-variant URL therefore behaves exactly as it does on Linux (a router 404, nothing cached),
 * and the lowercase page's files are only ever touched by the lowercase key. The rule is about
 * file names, not URLs, so it also covers any other folding the volume does (Unicode case folding
 * and normalisation on APFS), which no URL pattern could list.
 *
 * On a case-sensitive volume nothing can collide, so the check is skipped entirely: production
 * pays no system call for it (`caseInsensitiveVolume`, measured once per dist directory).
 *
 * Loaded by Node's type stripping through `src/lib/csp-cache-handler.ts`: erasable syntax only,
 * relative `.ts` imports, no `@/` alias, no app import (see `src/lib/csp-response.ts`).
 */
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

/** Resolves a path to its true on-disk spelling, or `undefined` when nothing is there. */
export type TrueCasePath = (file: string) => string | undefined;

/** `realpath(3)` returns the stored spelling of every component on APFS and NTFS. */
export const realTrueCasePath: TrueCasePath = (file) => {
  try {
    return realpathSync.native(file);
  } catch {
    return undefined;
  }
};

/** The cache kinds whose entries are files named after the request path. */
const RESPONSE_KINDS = new Set(["APP_PAGE", "APP_ROUTE", "PAGES"]);

/** Next's marker between a scoped key's owner prefix and the request path (16.3 route cache). */
const SCOPE_MARKER = "/$/";

/** Next's directory for scoped response entries, under `serverDistDir` (16.3 route cache). */
const SCOPED_PREFIX = "/route-cache/";

/**
 * The files a response-cache key reads or writes, relative to `serverDistDir`, as Next's
 * `FileSystemCache.getFilePath` places them: a plain key under `app/` (`pages/`), a scoped key
 * (`/route-cache/<kind>/<owner>/$/<path>`) under `serverDistDir` itself, plus the build seed of
 * its request path under `app/`, which `FileSystemCache.get` also consults.
 */
export function responseCacheFiles(key: string, kind: string): string[] {
  if (!RESPONSE_KINDS.has(kind)) return [];
  const root = kind === "PAGES" ? "pages" : "app";
  const suffix = kind === "APP_ROUTE" ? ".body" : ".html";
  if (!key.startsWith(SCOPED_PREFIX)) return [`${root}${key}${suffix}`];
  const files = [`${key.slice(1)}${suffix}`];
  const marker = key.indexOf(SCOPE_MARKER);
  if (marker !== -1) {
    files.push(
      `${root}${key.slice(marker + SCOPE_MARKER.length - 1)}${suffix}`,
    );
  }
  return files;
}

/**
 * Whether `key` names, on this volume, a file that is stored under a different spelling — the
 * file of another key. A file that does not exist collides with nothing.
 */
export function keyCollidesWithOtherCase(
  serverDistDir: string,
  key: string,
  kind: string,
  trueCasePath: TrueCasePath = realTrueCasePath,
): boolean {
  const base = trueCasePath(serverDistDir);
  if (base === undefined) return false;
  return responseCacheFiles(key, kind).some((relative) => {
    const actual = trueCasePath(path.join(serverDistDir, relative));
    return actual !== undefined && actual !== path.join(base, relative);
  });
}

const volumes = new Map<string, boolean>();

/**
 * Whether `serverDistDir` sits on a case-insensitive volume: the directory is still found when
 * its own name is spelled in the other case. Memoised per directory; `false` when the directory
 * does not exist yet (nothing to collide with).
 */
export function caseInsensitiveVolume(serverDistDir: string): boolean {
  const known = volumes.get(serverDistDir);
  if (known !== undefined) return known;
  const name = path.basename(serverDistDir);
  const swapped =
    name === name.toUpperCase() ? name.toLowerCase() : name.toUpperCase();
  const insensitive =
    swapped !== name &&
    existsSync(serverDistDir) &&
    existsSync(path.join(path.dirname(serverDistDir), swapped));
  volumes.set(serverDistDir, insensitive);
  return insensitive;
}

/**
 * The two volume questions the cache handler asks, as one injectable value: the real volume in
 * production, a simulated case-insensitive one in the unit tests that run on Linux.
 */
export interface CaseProbe {
  readonly caseInsensitive: (serverDistDir: string) => boolean;
  readonly trueCasePath: TrueCasePath;
}

export const defaultCaseProbe: CaseProbe = {
  caseInsensitive: caseInsensitiveVolume,
  trueCasePath: realTrueCasePath,
};
