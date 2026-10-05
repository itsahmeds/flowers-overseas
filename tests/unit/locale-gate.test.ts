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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOCALE_GATE_ATTRIBUTE,
  LOCALE_GATE_EVENT,
  holdLocaleGate,
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
