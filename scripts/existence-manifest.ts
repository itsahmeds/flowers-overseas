/**
 * @purpose The existence manifest step of `pnpm build`: `dataAsOf` before the build, the manifest after it (spec 012b §2.3, AC-5, AC-38)
 *
 * TASK-295. `scripts/build.ts` calls both; they live here so that the build entry itself writes no
 * file (spec 005 AC-31's scan of `scripts/build.ts`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

import {
  EXISTENCE_MANIFEST_FILE,
  existenceManifestOf,
} from "../src/lib/existence.ts";

/** The database's `now()`, or `null` for a build that reads no database. */
export async function readDataAsOf(
  url: string | undefined,
): Promise<string | null> {
  if (url === undefined || url === "") return null;
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const [row] = await sql<{ now: string }[]>`
      SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`;
    if (row === undefined) throw new Error("SELECT now() returned no row");
    return row.now;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Write the manifest of the build in `distDir` (and its standalone copy). */
export function writeExistenceManifest(
  distDir: string,
  dataAsOf: string | null,
): { count: number; existenceHash: string } {
  const prerender = JSON.parse(
    readFileSync(join(distDir, "prerender-manifest.json"), "utf8"),
  ) as { routes?: Record<string, unknown> };
  const manifest = existenceManifestOf(
    Object.keys(prerender.routes ?? {}),
    dataAsOf,
  );
  const body = `${JSON.stringify(manifest)}\n`;
  writeFileSync(join(distDir, EXISTENCE_MANIFEST_FILE), body);
  const standalone = join(distDir, "standalone", ".next");
  if (existsSync(join(distDir, "standalone"))) {
    mkdirSync(standalone, { recursive: true });
    writeFileSync(join(standalone, EXISTENCE_MANIFEST_FILE), body);
  }
  return { count: manifest.urls.length, existenceHash: manifest.existenceHash };
}
