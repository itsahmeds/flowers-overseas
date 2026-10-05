/**
 * T-44 / AC-42 (spec 004 §14 A23 clause 9; TASK-186): the laptop band's seven tokens are pinned.
 *
 * `src/app/globals.css` and `docs/design/system/tokens.css` each declare **exactly** clause 9's
 * value for the seven tokens of its table, once, and the two files agree. Clause 9 also says what
 * does not change: the minima, `--text-lede-fluid`, the body steps and the gutters, so those are
 * pinned here too, at their shipped values. T-01 (`tokens.test.ts`) already fails when the two files
 * disagree on any token; this file fails on the value itself, so changing both files together to a
 * wrong value is red as well.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

const FILES = {
  code: "src/app/globals.css",
  design: "docs/design/system/tokens.css",
} as const;

/** Clause 9's table, name for name and value for value. */
export const LAPTOP_BAND = {
  "--text-hero-fluid": "clamp(50px, min(5.2vw, 8.6vh), 76px)",
  "--text-display-fluid": "clamp(42px, min(5vw, 8vh), 70px)",
  "--text-title-fluid": "clamp(44px, min(4.2vw, 6.8vh), 58px)",
  "--text-3xl-fluid": "clamp(32px, min(3.6vw, 5.8vh), 46px)",
  "--text-2xl-fluid": "clamp(30px, 3vw, 38px)",
  "--section-fluid": "clamp(64px, min(7vw, 11vh), 104px)",
  "--hero-photo-max": "min(520px, 60svh)",
} as const;

/** "Nothing else changes" (clause 9): the tokens the band must leave alone. */
const UNCHANGED = {
  "--text-lede-fluid": "clamp(18px, 1.5vw, 21px)",
  "--text-body": "18px",
  "--text-body-s": "17px",
  "--text-ui": "16px",
  "--text-sm": "15px",
  "--text-fine": "14px",
  "--text-xs": "13px",
  "--gutter": "56px",
  "--gutter-s": "20px",
  "--container-page": "1328px",
  "--page-max": "1328px",
} as const;

/** Every declaration of `name` in `css` (comments stripped), whitespace collapsed. */
function declarations(css: string, name: string): string[] {
  const stripped = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const pattern = new RegExp(
    `(?:^|[;{\\s])${name.replaceAll("-", "\\-")}\\s*:\\s*([^;]+);`,
    "g",
  );
  return [...stripped.matchAll(pattern)].map((match) =>
    (match[1] ?? "").replaceAll(/\s+/g, " ").trim(),
  );
}

const sources = {
  code: readFileSync(resolve(repoRoot, FILES.code), "utf8"),
  design: readFileSync(resolve(repoRoot, FILES.design), "utf8"),
};

describe("T-44: the laptop band's seven tokens (AC-42)", () => {
  for (const [file, path] of Object.entries(FILES) as [
    keyof typeof FILES,
    string,
  ][]) {
    for (const [name, value] of Object.entries(LAPTOP_BAND)) {
      it(`${path} declares ${name}: ${value}, once`, () => {
        expect(declarations(sources[file], name)).toEqual([value]);
      });
    }
  }

  it("the two files agree on all seven", () => {
    for (const name of Object.keys(LAPTOP_BAND)) {
      expect(
        declarations(sources.code, name),
        `${name} differs between ${FILES.code} and ${FILES.design}`,
      ).toEqual(declarations(sources.design, name));
    }
  });

  it("clause 9 changes nothing else: minima, lede, body steps and gutters keep their values", () => {
    for (const [name, value] of Object.entries(UNCHANGED)) {
      expect(declarations(sources.code, name), `${FILES.code} ${name}`).toEqual(
        [value],
      );
      if (name === "--container-page") continue; // code-side Tailwind namespace only
      expect(
        declarations(sources.design, name),
        `${FILES.design} ${name}`,
      ).toEqual([value]);
    }
  });

  it("the fluid minima are the phone sizes clause 9 keeps (50, 42, 44, 32, 30, 64 px)", () => {
    const minima = Object.entries(LAPTOP_BAND)
      .filter(([name]) => name !== "--hero-photo-max")
      .map(([, value]) => /^clamp\((\d+)px,/.exec(value)?.[1]);
    expect(minima).toEqual(["50", "42", "44", "32", "30", "64"]);
  });
});
