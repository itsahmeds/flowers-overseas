/**
 * The deferred set (spec 004 §14 A-founder-2026-10-15b clauses 1 to 3, AC-55, T-60 unit half;
 * TASK-244).
 *
 * T-60 asks the unit layer for "the deferred set lists the motions, the popup and the Menu", and,
 * as spec 004 §14 A-founder-2026-10-19a amends it, that "the motions entry resolves to TASK-194's
 * module once that module is on `main`; red with the entry left reserved". The Menu's `Esc` lives
 * inside that module since TASK-194 (it replaced `MenuEscape`), so the motions entry is also the
 * Menu enhancement's, and a case below proves it from source. This file reads `DEFERRED_ISLANDS`
 * and names each entry, then pins, from source, the three things the
 * e2e (`tests/e2e/deferred-chunks.spec.ts`) can only see after a build:
 *
 *  - **no static import** of a deferred module anywhere under `src/`: an eager import puts the
 *    island into a chunk the document requests at once, which is T-60's red case;
 *  - **one loader** per island, holding the only `import()` of its chunk: `next/dynamic` with
 *    `ssr: false` after the paint, `React.lazy` for an island that waits for input;
 *  - **one mount**, inside `<AfterPaint island="…" on="…">`, so the loader's `import()` waits.
 *
 * It also drives `whenReady()` (`src/modules/ui/deferred/paintSignal.ts`) through every path
 * against a fake browser, and checks that every `"use client"` module under `src/` is either in
 * the set or in `NOT_DEFERRED` with its reason (clause 2: "every other island").
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AfterPaint } from "../../src/modules/ui/deferred/AfterPaint.tsx";
import { SENTENCE_IDS } from "../../src/modules/ui/home/sentence-model.ts";
import {
  DEFERRED_ISLANDS,
  type DeferredIsland,
  NOT_DEFERRED,
} from "../../src/modules/ui/deferred/deferredSet.ts";
import {
  FIRST_INTERACTION_EVENTS,
  IDLE_TIMEOUT_MS,
  type ReadyEnvironment,
  whenReady,
} from "../../src/modules/ui/deferred/paintSignal.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const SET_FILE = "src/modules/ui/deferred/deferredSet.ts";

/** Every `.ts`/`.tsx` file under `src/`, repo-relative, with its text. */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/u.test(entry.name)) {
        out.push({
          path: relative(ROOT, full),
          text: readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(join(ROOT, "src"));
  return out;
}

/** The file with its block and line comments removed: a commented-out import is not an edge. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

function isClientModule(text: string): boolean {
  return /^\s*["']use client["'];/u.test(code(text));
}

/** Resolve an import specifier written in `from` to a repo-relative path, or null. */
function resolveSpecifier(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join("src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(from), specifier);
  else return null;
  return base.replace(/\.(tsx?|jsx?)$/u, "");
}

/** Every value import of a module: `import x from`, `import { x } from`, `export … from`, `import "…"`. */
function valueImports(path: string, text: string): string[] {
  const found: string[] = [];
  const statement =
    /^\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/gmu;
  for (const match of code(text).matchAll(statement)) {
    if (match[2] !== undefined) continue; // `import type … from`
    const clause = match[3] ?? "";
    // `import { type A, type B } from`: every binding is a type, so nothing is loaded.
    const named = /^\{([^}]*)\}$/u.exec(clause.trim());
    if (
      named !== null &&
      (named[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .every((part) => part.startsWith("type "))
    ) {
      continue;
    }
    const target = resolveSpecifier(path, match[4] ?? "");
    if (target !== null) found.push(target);
  }
  for (const match of code(text).matchAll(/^\s*import\s+["']([^"']+)["']/gmu)) {
    const target = resolveSpecifier(path, match[1] ?? "");
    if (target !== null) found.push(target);
  }
  return found;
}

/** Every `import("…")` expression, resolved. */
function dynamicImports(path: string, text: string): string[] {
  return [...code(text).matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)]
    .map((match) => resolveSpecifier(path, match[1] ?? ""))
    .filter((target): target is string => target !== null);
}

const withoutExtension = (path: string): string =>
  path.replace(/\.(tsx?|jsx?)$/u, "");

const ALL = sources();
const byPath = (path: string): string => {
  const file = ALL.find((source) => source.path === path);
  if (file === undefined) throw new Error(`${path} is not under src/`);
  return file.text;
};
const deferred = DEFERRED_ISLANDS.filter(
  (
    island,
  ): island is DeferredIsland & {
    module: string;
    chunk: string;
    loader: string;
    mountedBy: string;
    mounts: string;
  } =>
    island.status === "deferred" &&
    island.module !== null &&
    island.chunk !== null &&
    island.loader !== null &&
    island.mountedBy !== null &&
    island.mounts !== null,
);

describe("the deferred set names its islands (T-60 unit, clause 2)", () => {
  it("is exactly the motions (with the Menu's Esc), the language popup and the home sentence", () => {
    expect(DEFERRED_ISLANDS.map((island) => island.id)).toEqual([
      "motions",
      "language-popup",
      "home-sentence",
    ]);
  });

  it("resolves the motions' entry to TASK-194's module, after the paint, mounted by the header (A-founder-2026-10-19a)", () => {
    expect(DEFERRED_ISLANDS.find((island) => island.id === "motions")).toEqual({
      id: "motions",
      status: "deferred",
      trigger: "paint",
      control: null,
      what: expect.stringContaining("motions") as unknown,
      task: "TASK-194",
      module: "src/modules/ui/motion/MotionIsland.tsx",
      chunk: "src/modules/ui/motion/MotionIsland.tsx",
      loader: "src/modules/ui/deferred/MotionLoader.tsx",
      mountedBy: "src/modules/ui/layout/SiteHeader.tsx",
      mounts: "MotionLoader",
      marker: "details[data-fo-menu][open]",
    });
    // A reserved entry, or one with a field left null, is not a deferred island: every entry is.
    expect(deferred.map((island) => island.id)).toEqual(
      DEFERRED_ISLANDS.map((island) => island.id),
    );
  });

  it("is the Menu enhancement's entry too: the Menu's Esc is in the motion module and in no other client module", () => {
    const motions = byPath("src/modules/ui/motion/MotionIsland.tsx");
    // The Esc handler: the key, and the open Menus it closes.
    expect(code(motions)).toMatch(/event\.key === "Escape"/u);
    expect(code(motions)).toContain('"details[data-fo-menu][open]"');
    const elsewhere = ALL.filter(
      (source) =>
        source.path !== "src/modules/ui/motion/MotionIsland.tsx" &&
        isClientModule(source.text) &&
        /data-fo-menu\]?\[open\]|\bmenu\.open = false/u.test(code(source.text)),
    ).map((source) => source.path);
    expect(elsewhere).toEqual([]);
  });

  it("defers the language popup's island after the paint, mounted by the locale layout", () => {
    expect(
      DEFERRED_ISLANDS.find((island) => island.id === "language-popup"),
    ).toMatchObject({
      status: "deferred",
      trigger: "paint",
      control: null,
      module: "src/modules/i18n/ui/LanguagePopupIsland.tsx",
      chunk: "src/modules/i18n/ui/LanguagePopupIsland.tsx",
      loader: "src/modules/i18n/ui/LanguagePopupLoader.tsx",
      mountedBy: "src/app/[locale]/layout.tsx",
      mounts: "LanguagePopup",
      marker: "data-fo-language-popup",
    });
  });

  it("defers the home sentence's island to the first interaction, mounted by the sentence", () => {
    expect(
      DEFERRED_ISLANDS.find((island) => island.id === "home-sentence"),
    ).toMatchObject({
      status: "deferred",
      trigger: "interaction",
      control: "#send",
      module: "src/modules/ui/home/SentenceIsland.tsx",
      chunk: "src/modules/ui/deferred/lazyIslands.ts",
      loader: "src/modules/ui/deferred/InteractionLoaders.tsx",
      mountedBy: "src/modules/ui/home/SentencePicker.tsx",
      mounts: "SentenceLoader",
      marker: "fo:deferred:home-sentence",
    });
  });

  it("names each interaction island's control by the id or attribute its server component writes", () => {
    expect(
      DEFERRED_ISLANDS.find((island) => island.id === "home-sentence")?.control,
    ).toBe(`#${SENTENCE_IDS.form}`);
    expect(code(byPath("src/modules/ui/layout/MenuSheet.tsx"))).toMatch(
      /^\s*data-fo-menu=""$/mu,
    );
  });

  it("keeps the consent banner out of the set (clause 2)", () => {
    const modules = DEFERRED_ISLANDS.map((island) => island.module ?? "");
    for (const consent of [
      "src/modules/ui/consent/ConsentBannerLoader.tsx",
      "src/modules/ui/consent/ConsentBannerIsland.tsx",
    ]) {
      expect(modules).not.toContain(consent);
      expect(NOT_DEFERRED[consent]).toMatch(/clause 2/u);
    }
  });
});

describe.each(deferred.map((island) => [island.id, island] as const))(
  "%s waits for the paint (clause 1)",
  (_id, island) => {
    it("is a client module carrying its marker, and no other client module carries it", () => {
      const text = byPath(island.module);
      expect(isClientModule(text)).toBe(true);
      expect(code(text)).toContain(island.marker);
      if (island.trigger === "interaction") {
        // The interaction islands record a User Timing mark when they mount.
        expect(code(text)).toContain(`performance.mark("${island.marker}")`);
      }
      const elsewhere = ALL.filter(
        (source) =>
          source.path !== island.module &&
          isClientModule(source.text) &&
          source.text.includes(island.marker),
      ).map((source) => source.path);
      expect(elsewhere).toEqual([]);
    });

    it("is imported statically by no module under src/ but its lazy chunk's entry (type imports aside)", () => {
      const allowed = island.chunk === island.module ? [] : [island.chunk];
      const target = withoutExtension(island.module);
      const eager = ALL.filter((source) =>
        valueImports(source.path, source.text).includes(target),
      ).map((source) => source.path);
      expect(eager).toEqual(allowed);
      // And the chunk's entry, where it is not the module, is imported statically by nobody.
      const entry = withoutExtension(island.chunk);
      expect(
        ALL.filter((source) =>
          valueImports(source.path, source.text).includes(entry),
        ).map((source) => source.path),
      ).toEqual([]);
    });

    it("is reached only by import() of its chunk, from the set's loaders", () => {
      const target = withoutExtension(island.chunk);
      const importers = ALL.flatMap((source) =>
        dynamicImports(source.path, source.text)
          .filter((resolved) => resolved === target)
          .map(() => source.path),
      );
      expect(importers).toContain(island.loader);
      // Every other importer of the chunk is the loader of another entry in the same chunk.
      expect([...new Set(importers)].sort()).toEqual(
        [
          ...new Set(
            deferred
              .filter((other) => other.chunk === island.chunk)
              .map((other) => other.loader),
          ),
        ].sort(),
      );
      expect(isClientModule(byPath(island.loader))).toBe(true);
    });

    it(
      island.trigger === "paint"
        ? "loads through next/dynamic with ssr: false, which budget:client-js charges to the page load"
        : "loads through React.lazy, outside the page-load model, because nothing fetches it without input",
      () => {
        const loader = code(byPath(island.loader));
        if (island.trigger === "paint") {
          expect(loader).toMatch(/import dynamic from "next\/dynamic";/u);
          expect(loader).toMatch(/\{\s*ssr:\s*false\s*\}/u);
        } else {
          expect(loader).not.toMatch(/next\/dynamic/u);
          expect(loader).toMatch(/import \{ lazy \} from "react";/u);
        }
      },
    );

    it("is mounted once, inside <AfterPaint island on> with its trigger, and rendered nowhere else", () => {
      const mount = code(byPath(island.mountedBy));
      expect(isClientModule(byPath(island.mountedBy))).toBe(false);
      const control =
        island.control === null
          ? ""
          : `\\s+control="${island.control.replace(/[[\]]/gu, "\\$&")}"`;
      expect(mount).toMatch(
        new RegExp(
          `<AfterPaint\\s+island="${island.id}"\\s+on="${String(island.trigger)}"${control}\\s*>\\s*<${island.mounts}[\\s/>]`,
          "u",
        ),
      );
      const renders = ALL.flatMap((source) =>
        [
          ...code(source.text).matchAll(
            new RegExp(`<${island.mounts}[\\s/>]`, "gu"),
          ),
        ].map(() => source.path),
      );
      expect(renders).toEqual([island.mountedBy]);
    });
  },
);

describe("every other client module is accounted for (clause 2: every other island)", () => {
  it("is in the set (module or loader) or in NOT_DEFERRED with a reason", () => {
    const declared = new Set<string>([
      ...deferred.flatMap((island) => [island.module, island.loader]),
      ...Object.keys(NOT_DEFERRED),
    ]);
    const clients = ALL.filter((source) => isClientModule(source.text)).map(
      (source) => source.path,
    );
    expect(clients.filter((path) => !declared.has(path))).toEqual([]);
    // And the list names nothing stale.
    expect(
      Object.keys(NOT_DEFERRED).filter((path) => !clients.includes(path)),
    ).toEqual([]);
  });

  it("no client module imports a value from the set, so each marker ships in its island only", () => {
    const target = withoutExtension(SET_FILE);
    expect(
      ALL.filter(
        (source) =>
          isClientModule(source.text) &&
          valueImports(source.path, source.text).includes(target),
      ).map((source) => source.path),
    ).toEqual([]);
  });
});

describe("AfterPaint renders nothing until it is time (clause 3: the first paint is unchanged)", () => {
  it("renders no markup on the server after the paint, whatever its children", () => {
    expect(
      renderToStaticMarkup(
        <AfterPaint island="language-popup" on="paint">
          <p>island</p>
        </AfterPaint>,
      ),
    ).toBe("");
  });

  it("renders no markup on the server on interaction, whatever its children", () => {
    expect(
      renderToStaticMarkup(
        <AfterPaint island="home-sentence" on="interaction" control="#send">
          <p>island</p>
        </AfterPaint>,
      ),
    ).toBe("");
  });
});

/** A browser the test steps by hand: listeners (with `once` and `signal`), frames, idle, timeouts. */
function fakeBrowser(
  readyState: DocumentReadyState,
  options: { idle?: boolean } = {},
) {
  /** One listener table per target: the window, and the control `#control`. */
  const table = () => {
    const listeners = new Map<string, Set<() => void>>();
    return {
      listeners,
      addEventListener(
        type: string,
        listener: () => void,
        opts: AddEventListenerOptions,
      ) {
        const set = listeners.get(type) ?? new Set();
        const call = (): void => {
          if (opts.once === true) set.delete(call);
          listener();
        };
        set.add(call);
        listeners.set(type, set);
        opts.signal?.addEventListener("abort", () => set.delete(call));
      },
      dispatch(type: string): void {
        for (const call of [...(listeners.get(type) ?? [])]) call();
      },
      listening: () =>
        [...listeners.entries()]
          .filter(([, set]) => set.size > 0)
          .map(([type]) => type)
          .sort(),
    };
  };
  const win = table();
  const control = table();
  let frames: (() => void)[] = [];
  let idles: { cb: () => void; timeout: number }[] = [];
  let timeouts: (() => void)[] = [];
  const env: ReadyEnvironment = {
    document: {
      readyState,
      querySelector: (selector: string) =>
        selector === "#control" ? control : null,
    },
    addEventListener: win.addEventListener,
    requestAnimationFrame(cb: () => void) {
      frames.push(cb);
      return frames.length;
    },
    ...(options.idle === false
      ? {}
      : {
          requestIdleCallback(cb: () => void, opts: { timeout: number }) {
            idles.push({ cb, timeout: opts.timeout });
            return idles.length;
          },
        }),
    setTimeout(cb: () => void) {
      timeouts.push(cb);
      return timeouts.length;
    },
  };
  return {
    env,
    dispatch: win.dispatch,
    listening: win.listening,
    onControl: control.dispatch,
    controlListening: control.listening,
    frame(): void {
      const pending = frames;
      frames = [];
      for (const cb of pending) cb();
    },
    idle(): void {
      const pending = idles;
      idles = [];
      for (const { cb } of pending) cb();
    },
    timeout(): void {
      const pending = timeouts;
      timeouts = [];
      for (const cb of pending) cb();
    },
    idleTimeouts: () => idles.map((idle) => idle.timeout),
    queued: () => frames.length + idles.length + timeouts.length,
  };
}

/** Starts `whenReady()` and counts how often it fires. */
function counting(
  browser: ReturnType<typeof fakeBrowser>,
  control?: string,
): { fired: () => number; stop: () => void } {
  let fired = 0;
  const stop = whenReady(
    () => {
      fired += 1;
    },
    browser.env,
    control,
  );
  return { fired: () => fired, stop };
}

describe("whenReady() with no control: after load, a frame and idle, or the first interaction", () => {
  it("waits for load, then a frame, then the idle period after it", () => {
    const browser = fakeBrowser("loading");
    const run = counting(browser);

    expect(browser.queued()).toBe(0); // nothing scheduled before `load`
    browser.dispatch("load");
    browser.idle();
    expect(run.fired()).toBe(0); // no idle callback before the frame
    browser.frame();
    expect(run.fired()).toBe(0); // the frame asks for idle; it does not fire
    expect(browser.idleTimeouts()).toEqual([IDLE_TIMEOUT_MS]);
    browser.idle();
    expect(run.fired()).toBe(1);
    expect(browser.listening()).toEqual([]);
  });

  it("starts at the frame when the document has already loaded", () => {
    const browser = fakeBrowser("complete");
    const run = counting(browser);
    browser.frame();
    browser.frame();
    browser.idle();
    expect(run.fired()).toBe(1);
  });

  it("takes a zero timeout where the browser has no requestIdleCallback", () => {
    const browser = fakeBrowser("complete", { idle: false });
    const run = counting(browser);
    browser.frame();
    browser.frame();
    expect(run.fired()).toBe(0);
    browser.timeout();
    expect(run.fired()).toBe(1);
  });

  it.each(FIRST_INTERACTION_EVENTS)(
    "fires at once on the first %s, before load, and never again",
    (type) => {
      const browser = fakeBrowser("loading");
      const run = counting(browser);
      browser.dispatch(type);
      expect(run.fired()).toBe(1);
      // Only the window's one-shot `load` is left; when it runs, it finds the signal aborted.
      expect(browser.listening()).toEqual(["load"]);
      browser.dispatch("load");
      browser.frame();
      browser.frame();
      browser.idle();
      for (const other of FIRST_INTERACTION_EVENTS) browser.dispatch(other);
      expect(run.fired()).toBe(1);
      expect(browser.listening()).toEqual([]);
    },
  );

  it("an interaction between the frame and idle wins, and the queued idle callback does nothing", () => {
    const browser = fakeBrowser("complete");
    const run = counting(browser);
    browser.frame();
    browser.dispatch("pointerdown");
    expect(run.fired()).toBe(1);
    browser.frame();
    browser.idle();
    expect(run.fired()).toBe(1);
  });

  it("the cleanup stops it: no interaction listener left, and nothing queued fires", () => {
    const browser = fakeBrowser("complete");
    const run = counting(browser);
    browser.frame();
    run.stop();
    expect(browser.listening()).toEqual([]);
    browser.dispatch("focusin");
    browser.frame();
    browser.idle();
    browser.timeout();
    expect(run.fired()).toBe(0);
  });
});

describe("whenReady() with a control: the first interaction with that control only", () => {
  it("never fires on load, frames, idle or an interaction elsewhere: an untouched load never requests the island", () => {
    const browser = fakeBrowser("loading");
    const run = counting(browser, "#control");
    expect(browser.listening()).toEqual([]);
    expect(browser.controlListening()).toEqual(
      [...FIRST_INTERACTION_EVENTS].sort(),
    );
    browser.dispatch("load");
    browser.frame();
    browser.frame();
    browser.idle();
    browser.timeout();
    for (const type of FIRST_INTERACTION_EVENTS) browser.dispatch(type);
    expect(run.fired()).toBe(0);
    expect(browser.queued()).toBe(0);
  });

  it.each(FIRST_INTERACTION_EVENTS)(
    "fires on the first %s on the control, once",
    (type) => {
      const browser = fakeBrowser("complete");
      const run = counting(browser, "#control");
      browser.onControl(type);
      browser.onControl(type);
      expect(run.fired()).toBe(1);
      expect(browser.controlListening()).toEqual([]);
    },
  );

  it("with a control that is not in the document, never loads and listens to nothing", () => {
    const browser = fakeBrowser("complete");
    const run = counting(browser, "#absent");
    expect(browser.listening()).toEqual([]);
    expect(browser.controlListening()).toEqual([]);
    for (const type of FIRST_INTERACTION_EVENTS) browser.dispatch(type);
    run.stop();
    expect(run.fired()).toBe(0);
  });

  it("the cleanup removes the control's listeners", () => {
    const browser = fakeBrowser("complete");
    const run = counting(browser, "#control");
    run.stop();
    expect(browser.controlListening()).toEqual([]);
    browser.onControl("pointerdown");
    expect(run.fired()).toBe(0);
  });

  it("listens for the pointer, the focus and the input", () => {
    expect([...FIRST_INTERACTION_EVENTS]).toEqual([
      "pointerdown",
      "focusin",
      "input",
    ]);
  });
});
