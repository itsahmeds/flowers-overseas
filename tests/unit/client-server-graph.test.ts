/**
 * No `"use client"` file reaches server code (TASK-503).
 *
 * Staging failed every deploy from 2026-11-04 because two client islands imported `formatMoney`
 * from the `@/modules/i18n` barrel, which also re-exports the review ledger; the ledger's
 * `import("./db/ledger.ts")` reaches `src/lib/db.ts`, `server-only`, `next/server`'s `after`,
 * `next/cache` and Node built-ins, and Turbopack follows a dynamic `import()` into the client
 * graph like a static one. `typecheck`, `lint` and the unit tests were all green; only `next build`
 * said so, and that is CI's expensive gate.
 *
 * This walks the same graph in a fraction of a second: every file under `src/` whose first
 * statement is `"use client"`, plus every module's client-safe entry (`src/modules/<m>/client.ts`,
 * which `eslint/modules.js` lets other modules import), followed through static imports,
 * re-exports and dynamic `import()` with `@/` and relative paths resolved. Type-only imports are
 * skipped (they are erased), and so are `"use server"` files (a client calls a server action by
 * reference; its imports stay on the server). A path ends in a violation when it reaches a
 * server-only package, a Node built-in, or one of the server-only files below.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = join(repoRoot, "src");

/** Packages a browser bundle must never contain. */
const SERVER_PACKAGES = new Set([
  "server-only",
  "next/server",
  "next/cache",
  "next/headers",
  "postgres",
  "pg",
  "pg-boss",
  "drizzle-orm",
]);

/** Repo files that are server-only whatever imports them. */
const SERVER_FILES = new Set(["src/lib/db.ts", "src/lib/env.server.ts"]);

const NODE_BUILTINS = new Set(builtinModules);

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !name.endsWith(".d.ts"))
      out.push(full);
  }
  return out;
}

/** The directive, if the file's first statement is one (comments may precede it). */
function directive(source: string): string | null {
  const body = source.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  const match = /^(["'])(use client|use server)\1/.exec(body);
  return match?.[2] ?? null;
}

/** Specifiers a file loads at runtime: static, re-export, side-effect and dynamic imports. */
export function runtimeSpecifiers(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  const specifiers: string[] = [];
  const statement =
    /(?:^|[;\n])\s*(import|export)\s+([^;]*?)\s*from\s*(["'])([^"']+)\3/g;
  for (const m of code.matchAll(statement)) {
    const clause = (m[2] ?? "").trim();
    if (/^type\b/.test(clause)) continue;
    const named = /\{([^}]*)\}/.exec(clause);
    const outside = clause.replace(/\{[^}]*\}/, "").replace(/[\s,]/g, "");
    if (named && outside === "") {
      const parts = (named[1] ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 0 && parts.every((p) => /^type\s/.test(p))) continue;
    }
    specifiers.push(m[4] ?? "");
  }
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s*(["'])([^"']+)\1/g))
    specifiers.push(m[2] ?? "");
  for (const m of code.matchAll(/\bimport\(\s*(["'])([^"']+)\1\s*\)/g))
    specifiers.push(m[2] ?? "");
  return specifiers;
}

function resolveLocal(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(srcRoot, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

function packageName(specifier: string): string {
  const bare = specifier.replace(/^node:/, "");
  if (specifier.startsWith("node:")) return specifier;
  const parts = bare.split("/");
  return bare.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? "");
}

function forbiddenPackage(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  if (SERVER_PACKAGES.has(specifier)) return true;
  if (SERVER_PACKAGES.has(packageName(specifier))) return true;
  return NODE_BUILTINS.has(packageName(specifier));
}

/** Every chain from `entry` to server code, as `a -> b -> … -> offender`. */
export function serverReach(
  entry: string,
  read: (file: string) => string = (f) => readFileSync(f, "utf8"),
): string[] {
  const rel = (f: string) => relative(repoRoot, f);
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  const found: string[] = [];
  const chain = (file: string): string[] => {
    const names: string[] = [];
    for (let f: string | null = file; f; f = parent.get(f) ?? null)
      names.unshift(rel(f));
    return names;
  };
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const source = read(file);
    if (file !== entry && directive(source) === "use server") continue;
    if (SERVER_FILES.has(rel(file))) {
      found.push(chain(file).join(" -> "));
      continue;
    }
    for (const specifier of runtimeSpecifiers(source)) {
      const local = resolveLocal(file, specifier);
      if (local) {
        if (!parent.has(local)) {
          parent.set(local, file);
          queue.push(local);
        }
      } else if (
        !specifier.startsWith(".") &&
        !specifier.startsWith("@/") &&
        forbiddenPackage(specifier)
      ) {
        found.push([...chain(file), specifier].join(" -> "));
      }
    }
  }
  return found;
}

const allFiles = walk(srcRoot);
const clientEntries = allFiles.filter(
  (f) =>
    directive(readFileSync(f, "utf8")) === "use client" ||
    /src\/modules\/[^/]+\/client\.(ts|tsx)$/.test(f),
);

describe("client graph reaches no server code (TASK-503)", () => {
  it("finds the client entries it guards", () => {
    const names = clientEntries.map((f) => relative(repoRoot, f));
    expect(names).toContain("src/modules/ui/admin/AdminSelectionSummary.tsx");
    expect(names).toContain(
      "src/app/admin/(signed-in)/orders/[id]/refund-form.tsx",
    );
    expect(names).toContain("src/modules/i18n/client.ts");
  });

  it("no client file or client entry imports a server package, a built-in or db code", () => {
    const violations = clientEntries.flatMap((f) => serverReach(f));
    expect(violations).toEqual([]);
  });

  it("catches the i18n barrel, which reaches the database through the review ledger", () => {
    const probe = join(srcRoot, "modules/ui/admin/__probe__.tsx");
    const reach = serverReach(probe, (f) =>
      f === probe
        ? '"use client";\nimport { formatMoney } from "@/modules/i18n";\n'
        : readFileSync(f, "utf8"),
    );
    expect(reach.some((c) => c.includes("src/lib/db.ts"))).toBe(true);
  });

  it("parses type-only imports as erased and dynamic imports as loaded", () => {
    expect(
      runtimeSpecifiers(
        [
          'import type { A } from "a";',
          'import { type B, type C } from "b";',
          'export type { D } from "d";',
          'import { e, type F } from "e";',
          'const g = await import("g");',
          'import "h";',
          'export { i } from "i";',
        ].join("\n"),
      ),
    ).toEqual(["e", "i", "h", "g"]);
  });
});
