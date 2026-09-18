/**
 * The overlay gate that orders the two first-visit surfaces (spec 003 §14 A14 "shown before the
 * consent sheet, which waits for the dialog to close"; spec 004 AC-13; TASK-119).
 *
 * The contract lives in two files that may not import each other — a Client Component in
 * `src/modules/i18n` may only reach `src/modules/ui` through that module's public barrel, which
 * would pull the locale registry and zod into the consent chunk (spec 004 §14 A1, the 70 KB
 * regression `/review 26` found). So the attribute and the event name are **restated** in the
 * consent island, and this file is what makes that safe: it pins the two copies equal in both
 * directions, and it pins the two properties the ordering depends on.
 *
 * Why each assertion exists rather than "the e2e covers it": the browser test proves the order on
 * the machine it ran on, and a rename on one side of the contract would make that test fail with
 * "consent sheet not visible" — a symptom three files away from the cause.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LOCALE_GATE_ATTRIBUTE,
  LOCALE_GATE_RELEASED_EVENT,
  LOCALE_GATE_TIMEOUT_MS,
} from "../../src/modules/i18n/ui/localeGate.ts";

const repoRoot = resolve(__dirname, "../..");

const consentIsland = readFileSync(
  resolve(repoRoot, "src/modules/ui/consent/ConsentBannerIsland.tsx"),
  "utf8",
);
const loader = readFileSync(
  resolve(repoRoot, "src/modules/i18n/ui/LocaleSuggestionDialogLoader.tsx"),
  "utf8",
);
const island = readFileSync(
  resolve(repoRoot, "src/modules/i18n/ui/LocaleSuggestionDialogIsland.tsx"),
  "utf8",
);

/** `const NAME = "value";` in a source file, whichever module declared it. */
function declared(source: string, name: string): string | undefined {
  return new RegExp(`const ${name} = "([^"]+)"`).exec(source)?.[1];
}

describe("the two copies of the contract", () => {
  it("names the same attribute on both sides", () => {
    expect(LOCALE_GATE_ATTRIBUTE).toBe("data-fo-locale-gate");
    expect(declared(consentIsland, "LOCALE_GATE_ATTRIBUTE")).toBe(
      LOCALE_GATE_ATTRIBUTE,
    );
  });

  it("names the same event on both sides", () => {
    expect(LOCALE_GATE_RELEASED_EVENT).toBe("fo:locale-gate-released");
    expect(declared(consentIsland, "LOCALE_GATE_RELEASED_EVENT")).toBe(
      LOCALE_GATE_RELEASED_EVENT,
    );
  });

  it("keeps the consent island free of the i18n module, which is why they are restated", () => {
    // Imports, not prose: the island's header *names* `localeGate.ts` as the other copy, which is
    // the documentation this test enforces.
    const imports = [...consentIsland.matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(imports.filter((path) => path?.includes("modules/i18n"))).toEqual(
      [],
    );
    expect(imports.filter((path) => path?.includes("localeGate"))).toEqual([]);
  });
});

describe("the ordering it produces", () => {
  it("is claimed during hydration, before any lazy island can mount", () => {
    // In the loader's effect, not in the island's: the island arrives in a `next/dynamic` chunk,
    // which resolves *after* the consent island has already read the flag.
    expect(loader).toContain("claimLocaleGate();");
    expect(island).not.toContain("claimLocaleGate");
    expect(loader).toContain("useEffect(() => {");
  });

  it("is held while a dialog is open or a country is in flight, and released otherwise", () => {
    expect(island).toContain("holdLocaleGate();");
    expect(island).toContain("releaseLocaleGate();");
  });

  it("fails open on both sides, so a language courtesy can never suppress consent", () => {
    // The loader gives the screen back if its own island never arrives…
    expect(loader).toContain("releaseAbandonedLocaleGate");
    expect(LOCALE_GATE_TIMEOUT_MS).toBeGreaterThan(0);
    // …and the consent island shows the sheet anyway if the event never comes.
    const fallback = /const LOCALE_GATE_FALLBACK_MS = ([\d_]+)/.exec(
      consentIsland,
    )?.[1];
    expect(fallback).toBeDefined();
    // Longer than the loader's own timeout, so the two fallbacks cannot race: the suggestion
    // gives up first and the consent sheet's timer is the last line of defence.
    expect(Number(fallback!.replaceAll("_", ""))).toBeGreaterThan(
      LOCALE_GATE_TIMEOUT_MS,
    );
    expect(consentIsland).toContain("window.setTimeout(release,");
  });

  it("withholds the sheet without deciding anything: no cookie, no request, no state", () => {
    const gatedReturn = consentIsland.slice(
      consentIsland.indexOf("if (localeGated) return null;") - 400,
      consentIsland.indexOf("if (localeGated) return null;") + 40,
    );
    expect(gatedReturn).toContain("if (localeGated) return null;");
    // The guard sits after the `hidden` check and before any render, and writes nothing.
    expect(gatedReturn).not.toContain("document.cookie");
    expect(gatedReturn).not.toContain("fetch(");
  });

  it("is cleared by an explicit reopen, because then there is no dialog in front", () => {
    expect(consentIsland).toContain("setLocaleGated(false);");
  });
});
