/**
 * The suggestion strip's per-tab dismissal is gone for good (spec 003 §14 A14 Shape as amended by
 * A16: "the strip goes: `LocaleSuggestionBanner*`, its copy, and the
 * `fo_locale_suggestion_dismissed` `sessionStorage` key"; TASK-119, `/break 205` hole 1).
 *
 * The popup is remembered by `fo_locale` alone. A second "not now" store would let the popup
 * reopen with a different rule, and it would be storage the cookie register no longer declares.
 * So no file under `src/` may name the key, and no `sessionStorage` write may exist there.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs|json)$/u.test(name) ? [path] : [];
  });
}

const files = sourceFiles(join(repoRoot, "src"));

describe("no per-tab language dismissal (/break 205 hole 1)", () => {
  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("names `fo_locale_suggestion_dismissed` nowhere under src/", () => {
    const hits = files
      .filter((file) =>
        readFileSync(file, "utf8").includes("suggestion_dismissed"),
      )
      .map((file) => relative(repoRoot, file));
    expect(hits).toEqual([]);
  });

  it("writes to sessionStorage nowhere under src/", () => {
    const hits = files
      .filter((file) =>
        /sessionStorage\s*\.\s*setItem|sessionStorage\s*\[/u.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(repoRoot, file));
    expect(hits).toEqual([]);
  });

  it("is not in the cookie register or a catalogue", () => {
    for (const path of [
      "docs/compliance/cookie-register.md",
      "messages/en.json",
      "messages/en.meta.json",
    ]) {
      expect(readFileSync(join(repoRoot, path), "utf8"), path).not.toMatch(
        /suggestion_?[Dd]ismissed/u,
      );
    }
  });
});
