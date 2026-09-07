/**
 * `pnpm check:no-literal-disable` (spec 001 AC-6 / T-07, TASK-003).
 *
 * "grep -r \"eslint-disable\" src/ | grep -c \"fo/no-literal-strings\"` returns 0 at merge":
 * no file under `src/` may switch `fo/no-literal-strings` off. Copy belongs in the message
 * catalogue (plan/03 §5), so there is no legitimate exception to grant.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DISABLE_PATTERN = /eslint-disable[^\n]*fo\/no-literal-strings/;

const SCANNED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
];

export interface DisableHit {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
      files.push(full);
  }
  return files;
}

export function findLiteralStringDisables(root: string): DisableHit[] {
  const srcDir = join(root, "src");
  if (!statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const hits: DisableHit[] = [];
  for (const file of walk(srcDir)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      if (DISABLE_PATTERN.test(text)) {
        hits.push({
          file: relative(root, file),
          line: index + 1,
          text: text.trim(),
        });
      }
    });
  }
  return hits;
}

const isMain =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  const hits = findLiteralStringDisables(root);
  if (hits.length > 0) {
    for (const hit of hits) {
      process.stderr.write(`${hit.file}:${String(hit.line)}: ${hit.text}\n`);
    }
    process.stderr.write(
      `${String(hits.length)} disable comment(s) for fo/no-literal-strings under src/ (spec 001 AC-6 allows none)\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    "no fo/no-literal-strings disable comments under src/ (AC-6)\n",
  );
}
