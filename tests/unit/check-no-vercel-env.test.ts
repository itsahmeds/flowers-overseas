/**
 * Spec 040 T-02 (AC-2), TASK-097 — the grep gate that makes "the abstraction is complete" a check.
 *
 * Two halves, and both matter. A planted read in a temporary tree must be **found and named**,
 * because a gate that reports nothing is indistinguishable from a gate that works; and the real
 * tree must **pass**, because that is the claim AC-2 makes about this repository on the day the
 * Railway cutover happens.
 *
 * The third group is the one that took the design decision: the tests of the abstraction have to
 * *write* `VERCEL_ENV` to exercise `appEnvironment()`'s fallback row, and the `.env` fixtures have
 * to carry the key. So the gate bans **reads** — member and index accesses — and leaves
 * object-literal keys, lists of key names and prose alone. Those rows are here so that a future
 * tightening of the regex fails loudly rather than making T-01 unwritable.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ALLOWED_FILES,
  BANNED_KEYS,
  SCANNED_PATHS,
  findVercelEnvReads,
} from "../../scripts/check-no-vercel-env.ts";

const repoRoot = resolve(__dirname, "../..");

/** A throwaway tree with one file per case, scanned as if it were the repository. */
function treeWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "fo-no-vercel-env-"));
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  created.push(root);
  return root;
}

const created: string[] = [];
afterAll(() => {
  // The OS reclaims its own temp directory; nothing here is worth an rm -rf in a test.
  created.length = 0;
});

/**
 * The planted lines are **assembled from the key at run time**, never written out: this file is
 * itself under `tests/`, the gate scans it, and a literal read here would make the "the real tree
 * passes" assertion below fail — which is exactly the behaviour being tested, just in the wrong
 * file.
 */
const dotted = (key: string): string => `const value = process.env.${key};`;
const bracketed = (key: string, quote = '"'): string =>
  `const value = source[${quote}${key}${quote}];`;
const field = (key: string): string => `const value = parsed.${key};`;

describe("a planted read is found and named (T-02)", () => {
  it.each([
    {
      name: "a dotted process.env read",
      line: dotted("VERCEL_ENV"),
      key: "VERCEL_ENV",
    },
    {
      name: "a bracketed source read",
      line: bracketed("VERCEL_ENV"),
      key: "VERCEL_ENV",
    },
    {
      name: "a single-quoted bracketed read",
      line: bracketed("NEXT_PUBLIC_VERCEL_ENV", "'"),
      key: "NEXT_PUBLIC_VERCEL_ENV",
    },
    {
      name: "a field read off a parsed env object",
      line: field("VERCEL_GIT_COMMIT_SHA"),
      key: "VERCEL_GIT_COMMIT_SHA",
    },
  ])("$name", ({ line, key }) => {
    const root = treeWith({ "src/modules/thing.ts": `${line}\n` });
    const hits = findVercelEnvReads(root);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe("src/modules/thing.ts");
    expect(hits[0]?.line).toBe(1);
    expect(hits[0]?.key).toBe(key);
  });

  it("reports the longer key under its own name, not as a suffix match", () => {
    const root = treeWith({
      "scripts/thing.ts": `${dotted("NEXT_PUBLIC_VERCEL_ENV")}\n`,
    });
    expect(findVercelEnvReads(root)[0]?.key).toBe("NEXT_PUBLIC_VERCEL_ENV");
  });

  it("finds a read under every scanned tree and reports the line", () => {
    const read = `${dotted("VERCEL_ENV")}\n`;
    const root = treeWith({
      "src/a.ts": `\n${read}`,
      "scripts/b.ts": read,
      "tests/unit/c.ts": read,
      "docs/d.ts": read,
    });
    const hits = findVercelEnvReads(root);
    // `docs/` is outside `SCANNED_PATHS` and is not a hit.
    expect(hits.map((hit) => hit.file)).toEqual([
      "scripts/b.ts",
      "src/a.ts",
      "tests/unit/c.ts",
    ]);
    expect(hits.find((hit) => hit.file === "src/a.ts")?.line).toBe(2);
  });

  it("exempts exactly the two modules spec 040 §5.2 names, and no others", () => {
    const root = treeWith({
      "src/lib/env.schema.ts": `${dotted("VERCEL_ENV")}\n`,
      "src/lib/sentry.ts": `${dotted("VERCEL_GIT_COMMIT_SHA")}\n`,
      "src/lib/env.server.ts": `${dotted("VERCEL_ENV")}\n`,
    });
    expect(findVercelEnvReads(root).map((hit) => hit.file)).toEqual([
      "src/lib/env.server.ts",
    ]);
    expect([...ALLOWED_FILES]).toEqual([
      "src/lib/env.schema.ts",
      "src/lib/sentry.ts",
    ]);
  });
});

describe("what is deliberately not a read", () => {
  it.each([
    {
      name: "an object-literal key",
      line: `appEnvironment({ ${"VERCEL_ENV"}: "preview" });`,
    },
    {
      name: "a quoted key in a list",
      line: `const keys = ["${"VERCEL_GIT_COMMIT_SHA"}"];`,
    },
    {
      name: "a prose mention",
      line: ` * ${"VERCEL_ENV"} is the compatibility fallback.`,
    },
    { name: "a computed key", line: "process.env[key] = value;" },
  ])("$name is left alone", ({ line }) => {
    const root = treeWith({ "tests/unit/x.ts": `${line}\n` });
    expect(findVercelEnvReads(root)).toEqual([]);
  });
});

describe("the real tree passes (AC-2)", () => {
  it("has no platform env read outside the abstraction", () => {
    expect(findVercelEnvReads(repoRoot)).toEqual([]);
  });

  it("bans the three keys spec 040 §5.2 names, over src, scripts and tests", () => {
    expect([...BANNED_KEYS]).toEqual([
      "VERCEL_ENV",
      "NEXT_PUBLIC_VERCEL_ENV",
      "VERCEL_GIT_COMMIT_SHA",
    ]);
    expect([...SCANNED_PATHS]).toEqual(["src", "scripts", "tests"]);
  });
});
