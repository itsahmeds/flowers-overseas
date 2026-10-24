/**
 * The build's own list of the URLs it emitted, as the blog reads it (spec 044 §2.5, §2.7, AC-8;
 * spec 012b §2.3 "existence at runtime is the database says so AND the manifest has it";
 * TASK-322).
 *
 * Spec 012b's existence manifest (TASK-295) is not built yet. Until it is, the blog reads the one
 * manifest every `next build` already writes: `.next/prerender-manifest.json`, whose `routes` are
 * exactly the union of every route's `generateStaticParams` output, the definition spec 012b gives
 * its own manifest. A post first published after the build is not in it, so it answers 404 (the
 * router's `dynamicParams = false`) **and** is absent from the index, the sitemap and every link
 * until the next build, which is AC-8's "404 until its publish run is verified" with the next
 * deploy standing in for the run. TASK-295 replaces this file's reader with `existsNow()`.
 *
 * Read once per process and kept: a deployment's manifest never changes. A missing or unreadable
 * file in a production server is the empty set (nothing is linked, nothing 404s that the router
 * would serve), never "everything".
 *
 * `node:fs` is imported on first use, not at module load: the file is Next's own output, shipped
 * beside the server in every deployment (`.next/standalone/.next/` in the container), so reading
 * it is not the "render path reads the content corpus" fault `corridor-corpus-index.test.ts`
 * guards against, and no page that never asks about a blog URL loads the reader.
 */
import { z } from "zod";

/** Which paths the running build emitted. */
export interface BuildManifest {
  has(path: string): boolean;
}

/** The two keys of Next's prerender manifest the blog reads; the rest is Next's own business. */
const PrerenderManifestSchema = z.object({
  routes: z.record(z.string(), z.unknown()),
});

/** A manifest over a known set of paths (tests, and the parsed file). */
export function manifestOf(paths: Iterable<string>): BuildManifest {
  const set = new Set(paths);
  return { has: (path) => set.has(path) };
}

/** Nothing was emitted: the fail-closed answer for a missing or malformed file. */
export const EMPTY_MANIFEST: BuildManifest = manifestOf([]);

/** Parse the file's text; anything that is not a prerender manifest is the empty set. */
export function parsePrerenderManifest(text: string): BuildManifest {
  try {
    const parsed = PrerenderManifestSchema.safeParse(JSON.parse(text));
    return parsed.success
      ? manifestOf(Object.keys(parsed.data.routes))
      : EMPTY_MANIFEST;
  } catch {
    return EMPTY_MANIFEST;
  }
}

let cached: Promise<BuildManifest> | undefined;

async function readManifest(
  directory: string | undefined,
): Promise<BuildManifest> {
  const [{ readFile }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  try {
    const file = join(
      directory ?? join(process.cwd(), ".next"),
      "prerender-manifest.json",
    );
    return parsePrerenderManifest(await readFile(file, "utf8"));
  } catch {
    return EMPTY_MANIFEST;
  }
}

/** The running deployment's manifest, read from `{cwd}/.next/prerender-manifest.json` once. */
export function runningBuildManifest(
  directory?: string,
): Promise<BuildManifest> {
  cached ??= readManifest(directory);
  return cached;
}

/** Drop the kept manifest (tests only). */
export function resetBuildManifest(): void {
  cached = undefined;
}
