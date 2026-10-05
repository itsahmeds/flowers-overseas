/**
 * The gate between the language popup and the consent sheet (spec 003 §14 A14 Shape as amended
 * by A16: "it shows before the consent sheet and never stacks on it"; AC-28 (f); spec 004 §14 A23
 * AC-39; TASK-119, `/break 205` holes 2 and 3).
 *
 * Two modules hold the two ends and import nothing from each other: the popup's
 * `src/modules/i18n/ui/localeGate.ts` writes the gate, and the consent sheet's
 * `src/modules/ui/consent/localeGateReader.ts` reads it. This file drives both against one fake
 * document, so a rename on either side, a wrong state, or a missing event turns it red:
 *
 *  - the document starts **pending**: the layout renders the attribute into every locale
 *    document, so the sheet waits before either island has loaded;
 *  - the popup **holds** it while open, and nothing else may release it then (the loader's
 *    fail-open timer releases only a gate still pending);
 *  - **release** clears it and tells the sheet.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOCALE_GATE_ATTRIBUTE,
  LOCALE_GATE_EVENT,
  LOCALE_GATE_TIMEOUT_MS,
  guardLocaleGate,
  holdLocaleGate,
  syncLocaleGate,
  localeGateDocumentAttributes,
  releaseAbandonedLocaleGate,
  releaseLocaleGate,
} from "../../src/modules/i18n/ui/localeGate.ts";
import {
  CONSENT_LOCALE_GATE_ATTRIBUTE,
  CONSENT_LOCALE_GATE_EVENT,
  localeGateHeld,
  subscribeLocaleGate,
} from "../../src/modules/ui/consent/localeGateReader.ts";

/** `<html>`: the attribute calls the two modules make, and nothing else. */
class FakeRoot {
  readonly attributes = new Map<string, string>();
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
}

let root: FakeRoot;

/** The document as the layout renders it: the gate pending before any script has run. */
function renderDocument(): void {
  for (const [name, value] of Object.entries(localeGateDocumentAttributes())) {
    root.setAttribute(name, value);
  }
}

beforeEach(() => {
  root = new FakeRoot();
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the two ends name the same gate", () => {
  it("one attribute and one event, restated on the consent side", () => {
    expect(CONSENT_LOCALE_GATE_ATTRIBUTE).toBe(LOCALE_GATE_ATTRIBUTE);
    expect(CONSENT_LOCALE_GATE_EVENT).toBe(LOCALE_GATE_EVENT);
  });

  it("the layout's attribute is the one the sheet reads", () => {
    expect(Object.keys(localeGateDocumentAttributes())).toEqual([
      CONSENT_LOCALE_GATE_ATTRIBUTE,
    ]);
  });
});

describe("the gate's states, read by the consent sheet", () => {
  it("is held from the first byte: the document starts pending", () => {
    expect(localeGateHeld()).toBe(false);
    renderDocument();
    expect(root.getAttribute(LOCALE_GATE_ATTRIBUTE)).toBe("pending");
    expect(localeGateHeld()).toBe(true);
  });

  it("stays held while the popup is open, and the fail-open timer cannot release it", () => {
    renderDocument();
    holdLocaleGate();
    expect(root.getAttribute(LOCALE_GATE_ATTRIBUTE)).toBe("open");
    releaseAbandonedLocaleGate();
    expect(localeGateHeld()).toBe(true);
  });

  it("is released when the popup closes, and the sheet hears it", () => {
    const heard = vi.fn();
    const unsubscribe = subscribeLocaleGate(heard);
    renderDocument();
    holdLocaleGate();
    heard.mockClear();

    releaseLocaleGate();

    expect(localeGateHeld()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
    unsubscribe();
    holdLocaleGate();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("tells the sheet when the popup takes the gate, so a sheet already showing steps back", () => {
    const heard = vi.fn();
    subscribeLocaleGate(heard);
    holdLocaleGate();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(localeGateHeld()).toBe(true);
  });

  it("fails open: a gate no popup took is released by the loader's timer", () => {
    renderDocument();
    releaseAbandonedLocaleGate();
    expect(localeGateHeld()).toBe(false);
  });
});

describe("the loader never hides the consent sheet for good (/break 205 hole 4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("releases at once when the island's chunk fails to load", async () => {
    renderDocument();
    const failed = Promise.reject(new Error("ChunkLoadError"));
    guardLocaleGate(failed);
    await vi.advanceTimersByTimeAsync(0);
    expect(localeGateHeld()).toBe(false);
  });

  it("releases after the timeout when the chunk never arrives", async () => {
    renderDocument();
    guardLocaleGate(new Promise<never>(() => undefined));
    await vi.advanceTimersByTimeAsync(LOCALE_GATE_TIMEOUT_MS - 1);
    expect(localeGateHeld()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(localeGateHeld()).toBe(false);
    expect(LOCALE_GATE_TIMEOUT_MS).toBeLessThanOrEqual(4000);
  });

  it("never releases a gate the open popup holds", async () => {
    renderDocument();
    guardLocaleGate(Promise.resolve({}));
    holdLocaleGate();
    await vi.advanceTimersByTimeAsync(LOCALE_GATE_TIMEOUT_MS * 2);
    expect(localeGateHeld()).toBe(true);
  });

  it("stops its timer on cleanup", async () => {
    renderDocument();
    const cleanup = guardLocaleGate(new Promise<never>(() => undefined));
    cleanup();
    await vi.advanceTimersByTimeAsync(LOCALE_GATE_TIMEOUT_MS * 2);
    expect(localeGateHeld()).toBe(true);
  });
});

describe("the island holds the gate before the dialog opens (/break 205 hole 3)", () => {
  function fakeDialog(): {
    open: boolean;
    showModal: () => void;
    heldAtOpen: string | null;
  } {
    const dialog = {
      open: false,
      heldAtOpen: null as string | null,
      showModal(): void {
        dialog.heldAtOpen = root.getAttribute(LOCALE_GATE_ATTRIBUTE);
        dialog.open = true;
      },
    };
    return dialog;
  }

  it("holds, then opens: the sheet has stepped back before the popup paints", () => {
    renderDocument();
    const dialog = fakeDialog();
    syncLocaleGate(dialog, true);
    expect(dialog.open).toBe(true);
    expect(dialog.heldAtOpen).toBe("open");
    expect(root.getAttribute(LOCALE_GATE_ATTRIBUTE)).toBe("open");
  });

  it("releases when the popup is not to be open (a valid cookie, or after closing)", () => {
    renderDocument();
    syncLocaleGate(fakeDialog(), false);
    expect(localeGateHeld()).toBe(false);
    holdLocaleGate();
    syncLocaleGate(null, true);
    expect(localeGateHeld()).toBe(false);
  });
});

describe("the components call the two effects (their wiring, pinned from source)", () => {
  const source = (path: string): string =>
    readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

  it("the loader guards the island's own import from an effect that runs once", () => {
    expect(source("src/modules/i18n/ui/LanguagePopupLoader.tsx")).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*guardLocaleGate\(\s*import\("\.\/LanguagePopupIsland\.tsx"\)\s*\),\s*\[\],?\s*\)/u,
    );
  });

  it("the island syncs the gate with its decision on every change", () => {
    expect(source("src/modules/i18n/ui/LanguagePopupIsland.tsx")).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*syncLocaleGate\(dialogRef\.current,\s*open\);\s*\},\s*\[open\]\)/u,
    );
  });
});
