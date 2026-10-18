/**
 * The committed info-page content, read from disk (spec 041 §2 "The content model"; TASK-182).
 *
 * **Node-only, and off the render path**, as `src/modules/geo/content/corpus-files.ts` is: its
 * only callers are `pnpm pages:check` and `pnpm pages:index`. The application reads the content
 * through the generated typed index (`corpus.generated.ts`), so no `node:fs` reaches the bundle.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { InfoSourceFile } from "./parse.ts";

/** The two content directories, relative to `content/`. */
export const INFO_CONTENT_DIRS = ["pages", "legal"] as const;

/** The repository root, resolved from this module rather than from the process's cwd. */
export function repoRootFromContentModule(): string {
  return resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

/** Every `.md` file under `content/pages/*` and `content/legal/*`, sorted by path. */
export function readInfoContent(
  root: string = repoRootFromContentModule(),
): readonly InfoSourceFile[] {
  const files: InfoSourceFile[] = [];
  for (const dir of INFO_CONTENT_DIRS) {
    const base = join(root, "content", dir);
    if (statSync(base, { throwIfNoEntry: false })?.isDirectory() !== true)
      continue;
    for (const locale of readdirSync(base, { withFileTypes: true })) {
      if (!locale.isDirectory()) continue;
      for (const entry of readdirSync(join(base, locale.name), {
        withFileTypes: true,
      })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const path = `${dir}/${locale.name}/${entry.name}`;
        files.push({
          path,
          source: readFileSync(join(root, "content", path), "utf8"),
        });
      }
    }
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1));
}
