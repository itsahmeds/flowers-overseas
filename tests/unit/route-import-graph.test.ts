/**
 * No route handler loads `next/font` (spec 010 TASK-204; the 2026-10-25 local run).
 *
 * `next/font` is a compile-time call that Next rewrites in the page graph only. A route handler
 * whose static imports reach a file calling it evaluates `localFont()` as a plain function: under
 * `next dev` it returns `undefined` and the module throws at load, so every request to that route
 * answers 500. That is how `POST /api/checkout/start` ("Try a demo order") and `/api/health`
 * failed: route -> `modules/catalog` or `modules/geo` -> the `ui` barrel -> `ui/fonts`. The faces
 * now leave the barrel (the document layouts import `@/modules/ui/fonts`), and this test walks the
 * static import graph of every `route.ts` under `src/app` and fails on any file that imports
 * `next/font`, naming the chain.
 *
 * The walk reads `import … from`, `export … from` and bare `import "…"` statements, skips
 * type-only ones (erased at compile time), and resolves `@/` and relative specifiers to `.ts`,
 * `.tsx` or an `index` file. Packages are leaves.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SRC = join(ROOT, "src");

const STATEMENT =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/gu;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /^route\.tsx?$/u.test(name) ? [path] : [];
  });
}

function resolveSpecifier(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Only `{ type A, type B }` lists are erased; a list with one value import is not. */
function typeOnly(typeKeyword: string | undefined, clause: string): boolean {
  if (typeKeyword !== undefined) return true;
  const list = /^\{([\s\S]*)\}$/u.exec(clause.trim());
  if (list === null) return false;
  const names = (list[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names.length > 0 && names.every((name) => name.startsWith("type "));
}

/** The first chain from `entry` to a file that imports `next/font`, or `null`. */
export function chainToNextFont(entry: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() ?? "";
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const match of source.matchAll(STATEMENT)) {
      const specifier = match[3] ?? match[4] ?? "";
      if (match[4] === undefined && typeOnly(match[1], match[2] ?? "")) {
        continue;
      }
      if (specifier.startsWith("next/font")) {
        const chain = [file];
        let at = parent.get(file) ?? null;
        while (at !== null) {
          chain.push(at);
          at = parent.get(at) ?? null;
        }
        return chain.reverse().map((path) => relative(ROOT, path));
      }
      const next = resolveSpecifier(specifier, file);
      if (next !== null && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

describe("route handlers never load next/font", () => {
  const routes = routeFiles(join(SRC, "app"));

  it("finds the route handlers, the checkout start route among them", () => {
    expect(routes.length).toBeGreaterThan(5);
    expect(routes.map((route) => relative(ROOT, route))).toContain(
      "src/app/api/checkout/start/route.ts",
    );
  });

  it("sees next/font where it is: a document layout reaches it", () => {
    // The walk is not blind: the locale layout imports the faces on purpose.
    expect(
      chainToNextFont(join(SRC, "app", "[locale]", "layout.tsx")),
    ).not.toBeNull();
  });

  for (const route of routes) {
    it(`${relative(ROOT, route)} reaches no file that imports next/font`, () => {
      expect(chainToNextFont(route)).toBeNull();
    });
  }
});
