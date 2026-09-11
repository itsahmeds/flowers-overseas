/**
 * The notice shell is one skin, shared by four documents that cannot share a component (spec 004
 * AC-12; TASK-055).
 *
 * `src/modules/ui/layout/noticeShell.ts` exists because `src/app/[locale]/error.tsx` and
 * `src/app/global-error.tsx` are Client Components whose chunks Next attaches to every document,
 * and `/` must reach no client module at all — so none of them may import a React component from
 * the design system. That is a real constraint and it has an obvious failure mode: four documents
 * quietly drifting into four different-looking pages, or one of them keeping a hand-written class
 * list after the shell moved on.
 *
 * Three claims, all executable:
 *
 *  1. the module imports **nothing**, so importing it costs a client chunk only the strings;
 *  2. every one of the four documents actually uses it — asserted by reading the sources, because
 *     "uses the shared skin" is a property of the files, not of a rendered tree;
 *  3. the two action skins are `Button`'s `primary` and `secondary`, class for class, so a change
 *     to the design system's button reaches the failure pages instead of leaving them behind.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "../../src/modules/ui/primitives/Button.tsx";
import {
  NOTICE_ACTION_PRIMARY,
  NOTICE_ACTION_SECONDARY,
  NOTICE_BODY,
  NOTICE_HEADING,
  NOTICE_LOCKUP,
  NOTICE_MAIN,
  NOTICE_META,
  NOTICE_WORDMARK,
} from "../../src/modules/ui/layout/noticeShell.ts";

import { importClosure } from "./support/import-closure.ts";

const repoRoot = resolve(__dirname, "../..");
const source = (path: string): string =>
  readFileSync(resolve(repoRoot, path), "utf8");

/** The four documents, and the constant each one must be reading the shell through. */
const DOCUMENTS = [
  { path: "src/modules/ui/layout/NoticeDocument.tsx", boundary: false },
  { path: "src/app/[locale]/error.tsx", boundary: true },
  { path: "src/app/global-error.tsx", boundary: true },
] as const;

describe("noticeShell.ts", () => {
  it("imports nothing at all, so a client boundary pays only for the strings", () => {
    const closure = importClosure(
      resolve(repoRoot, "src/modules/ui/layout/noticeShell.ts"),
    );

    expect([...closure.files]).toEqual([
      resolve(repoRoot, "src/modules/ui/layout/noticeShell.ts"),
    ]);
    expect([...closure.packages]).toEqual([]);
    expect([...closure.json]).toEqual([]);
  });

  it("is the centred `--measure` column, in logical properties only", () => {
    expect(NOTICE_MAIN).toContain("mx-auto");
    expect(NOTICE_MAIN).toContain("max-w-prose");
    // `fo/no-physical-css` bans the physical forms; this is the second belt, on the one file
    // whose strings the linter sees as data rather than as a `className`.
    for (const constant of [
      NOTICE_MAIN,
      NOTICE_LOCKUP,
      NOTICE_WORDMARK,
      NOTICE_META,
      NOTICE_HEADING,
      NOTICE_BODY,
      NOTICE_ACTION_PRIMARY,
      NOTICE_ACTION_SECONDARY,
    ]) {
      expect(constant, constant).not.toMatch(
        /\b(?:ml|mr|pl|pr|left|right|border-l|border-r|text-left|text-right)-/,
      );
    }
  });

  it("names the canvas's voices rather than restating them", () => {
    // The `.display` and `.label` utilities of `src/app/globals.css`, so the notice documents
    // inherit a change to the type system instead of pinning a size.
    expect(NOTICE_HEADING).toContain("display");
    expect(NOTICE_HEADING).toContain("text-display-s");
    expect(NOTICE_META).toBe("label");
    expect(NOTICE_WORDMARK).toContain("display");
  });

  it("writes no colour literal: every colour is a semantic token", () => {
    const all = [
      NOTICE_MAIN,
      NOTICE_BODY,
      NOTICE_ACTION_PRIMARY,
      NOTICE_ACTION_SECONDARY,
    ].join(" ");
    expect(all).not.toMatch(
      /\b(?:bg|text|border)-(?:white|black|neutral|gray|slate|zinc|stone)\b/,
    );
    expect(all).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("the two action skins are `Button`'s", () => {
  const classesOf = (markup: string): Set<string> =>
    new Set((/class="([^"]*)"/.exec(markup)?.[1] ?? "").split(" ").sort());

  it("matches `Button` variant=primary size=md, class for class", () => {
    const rendered = classesOf(
      renderToStaticMarkup(Button({ children: "x", variant: "primary" })),
    );
    expect(new Set(NOTICE_ACTION_PRIMARY.split(" ").sort())).toEqual(rendered);
  });

  it("matches `Button` variant=secondary size=md, class for class", () => {
    const rendered = classesOf(
      renderToStaticMarkup(Button({ children: "x", variant: "secondary" })),
    );
    expect(new Set(NOTICE_ACTION_SECONDARY.split(" ").sort())).toEqual(
      rendered,
    );
  });
});

describe("every notice document reads its skin from the shell", () => {
  for (const { path, boundary } of DOCUMENTS) {
    it(`${path} imports it and hand-writes no column of its own`, () => {
      const text = source(path);

      expect(text).toMatch(
        /from "(?:@\/modules\/ui\/layout\/noticeShell|\.\/noticeShell\.ts)"/,
      );
      expect(text).toContain("NOTICE_MAIN");
      expect(text).toContain("NOTICE_HEADING");

      if (boundary) {
        // The reason the shell is strings: an error boundary may import no component from the
        // design system, because Next attaches its chunk to every document (spec 004 §14 A1).
        expect(text).not.toMatch(/from "@\/modules\/ui"/);
        expect(text).not.toMatch(
          /from "@\/modules\/ui\/(?!layout\/noticeShell)/,
        );
      }
    });
  }

  it("the 404 and the chooser render it through `NoticeDocument`", () => {
    for (const path of [
      "src/app/not-found.tsx",
      "src/app/(chooser)/page.tsx",
    ]) {
      expect(source(path), path).toContain(
        'from "@/modules/ui/layout/NoticeDocument"',
      );
    }
  });
});
