/**
 * The boot's read of the existence manifest (spec 012b §2.3, AC-5; TASK-295).
 *
 * `instrumentation.ts` calls `loadExistenceManifest()` once at a server's start, outside the build:
 * it reads `.next/existence-manifest.json` (written by `scripts/build.ts` beside the server),
 * validates it and puts it in place for the process (`installExistenceManifest()`), so the existence
 * predicates on every render read memory and no render path imports `node:fs`. No file (a laptop,
 * `next dev`) leaves no manifest, which admits everything, as before publishing existed. A file
 * that does not validate throws: a deployment with a corrupt page list must not serve as if it
 * had none.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  EXISTENCE_MANIFEST_FILE,
  type ExistenceManifest,
  ExistenceManifestSchema,
  installExistenceManifest,
} from "./existence.ts";

/** Load `{dir}/.next/existence-manifest.json` into the process; the manifest, or `null` for none. */
export function loadExistenceManifest(
  dir: string = process.cwd(),
): ExistenceManifest | null {
  const file = join(dir, ".next", EXISTENCE_MANIFEST_FILE);
  if (!existsSync(file)) {
    installExistenceManifest(null);
    return null;
  }
  const manifest = ExistenceManifestSchema.parse(
    JSON.parse(readFileSync(file, "utf8")),
  );
  installExistenceManifest(manifest);
  return manifest;
}
