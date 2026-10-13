/**
 * The checkout's islands: their weight, what they may not reach, and what they do (spec 010
 * §5.4, **AC-38** island half, **T-38** island half, AC-14's focus; TASK-201).
 *
 * **Budget.** The four client modules of `src/modules/ui/checkout/` (`CardCounter`,
 * `BlurValidation`, `FocusOnMount`, `PlaceOrderButton`) are bundled together with the same minifier
 * class a production build uses (vite, reached through vitest's own dependency so no package is
 * added), React left external because it is the framework floor every route already pays, and
 * the result is Brotli-compressed at quality 11. AC-38 allows **4 096 B**. The route-level number
 * (the built `/checkout` document, 131 072 B first-load) is TASK-208's `pnpm budget:client-js`
 * run, once TASK-204 has built the route.
 *
 * **Reach.** The same bundle may contain no zod, no `next-intl`, no `Intl`, no network API
 * (`fetch`, XHR, a socket, a beacon, an `EventSource`, a dynamic `import()`), no storage and no
 * script injection. Importing zod into an island turns the zod and the budget assertions red.
 *
 * **Behaviour without a DOM.** The unit project runs in Node, so the islands' logic lives in plain
 * modules (`validation.ts`, `graphemes.ts`) and is driven here with fakes; the wiring is driven in
 * a browser by `tests/e2e/checkout-ui.spec.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { countGraphemes } from "../../src/modules/i18n";
import { BlurValidation } from "../../src/modules/ui/checkout/BlurValidation.tsx";
import { CardCounter } from "../../src/modules/ui/checkout/CardCounter.tsx";
import { FocusOnMount } from "../../src/modules/ui/checkout/FocusOnMount.tsx";
import { approximateGraphemes } from "../../src/modules/ui/checkout/graphemes.ts";
import { PlaceOrderButton } from "../../src/modules/ui/checkout/PlaceOrderButton.tsx";
import {
  announcement,
  applyFieldState,
  type ControlLike,
  type ErrorElementLike,
  fieldProblem,
  focusTarget,
} from "../../src/modules/ui/checkout/validation.ts";

/**
 * The unit project has no DOM, so the two hooks the islands call are stood in for: `useEffect`
 * records each effect and its dependencies (React re-runs an effect exactly when one dependency
 * changes by `Object.is`), and `useFormStatus` reports no submit in flight. Calling a component
 * as a function then gives its effect, its dependencies and its element, with nothing else
 * mocked.
 */
const hooks = vi.hoisted(() => ({
  effects: [] as { run: () => unknown; deps: readonly unknown[] | undefined }[],
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (run: () => unknown, deps?: readonly unknown[]) => {
    hooks.effects.push({ run, deps });
  },
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: false }),
}));

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CHECKOUT_UI = fileURLToPath(
  new URL("../../src/modules/ui/checkout/", import.meta.url),
);
const ENTRY = fileURLToPath(
  new URL("./support/checkout-islands-entry.ts", import.meta.url),
);

/** spec 010 §5.4, AC-38. */
const ISLAND_BUDGET_BROTLI_BYTES = 4096;

interface BuiltChunk {
  readonly type: string;
  readonly code?: string;
}

/** Bundles the islands entry with vite, the bundler vitest itself depends on. */
async function bundleIslands(): Promise<string> {
  const requireFromVitest = createRequire(
    createRequire(import.meta.url).resolve("vitest/package.json"),
  );
  const vite = (await import(requireFromVitest.resolve("vite"))) as {
    build: (config: Record<string, unknown>) => Promise<unknown>;
  };
  const result = await vite.build({
    configFile: false,
    logLevel: "silent",
    mode: "production",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    root: ROOT,
    resolve: { alias: { "@/": `${ROOT}src/` } },
    build: {
      write: false,
      minify: true,
      lib: { entry: ENTRY, formats: ["es"], fileName: "checkout-islands" },
      rollupOptions: {
        external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/],
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as {
    output: BuiltChunk[];
  }[];
  return outputs
    .flatMap((bundle) => bundle.output)
    .filter((chunk) => chunk.type === "chunk")
    .map((chunk) => chunk.code ?? "")
    .join("\n");
}

const bundled = bundleIslands();

function brotli(code: string): number {
  return brotliCompressSync(Buffer.from(code), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
}

describe("the checkout islands (AC-38)", () => {
  it("lists every client module of src/modules/ui/checkout in the measured entry", () => {
    const clientFiles = readdirSync(CHECKOUT_UI)
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) =>
        /^\s*["']use client["']/.test(
          readFileSync(`${CHECKOUT_UI}${file}`, "utf8"),
        ),
      )
      .sort();
    const entry = readFileSync(ENTRY, "utf8");
    const measured = [...entry.matchAll(/checkout\/([A-Za-z]+\.tsx)"/g)]
      .map((match) => match[1])
      .sort();
    expect(measured).toEqual(clientFiles);
  });

  it("weigh at most 4 096 B Brotli together", async () => {
    const code = await bundled;
    const bytes = brotli(code);
    expect(code.length).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(ISLAND_BUDGET_BROTLI_BYTES);
  });

  it("reach no zod, no next-intl and no Intl", async () => {
    const code = await bundled;
    expect(code).not.toMatch(/\$ZodType|ZodError|zod/);
    expect(code).not.toMatch(/next-intl|useTranslations|IntlMessageFormat/);
    expect(code).not.toMatch(/\bIntl\./);
  });

  it("make no network request and store nothing", async () => {
    const code = await bundled;
    for (const api of [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /sendBeacon/,
      /EventSource/,
      /\bimport\s*\(/,
      /localStorage|sessionStorage|indexedDB/,
      /document\.cookie/,
    ]) {
      expect(code, String(api)).not.toMatch(api);
    }
  });

  it("add no inline script", async () => {
    const code = await bundled;
    expect(code).not.toMatch(/createElement\(\s*["']script["']/);
    expect(code).not.toMatch(/dangerouslySetInnerHTML|innerHTML\s*=/);
    for (const file of readdirSync(CHECKOUT_UI)) {
      expect(readFileSync(`${CHECKOUT_UI}${file}`, "utf8"), file).not.toMatch(
        /<script|dangerouslySetInnerHTML/,
      );
    }
  });
});

describe("the card counter's count", () => {
  const FIXTURES = [
    "",
    "Happy birthday Mama!",
    "Wszystkiego najlepszego, Babciu! Całuję, Łucja",
    "С днём рождения",
    "Café au lait",
    "👨‍👩‍👧‍👦 and 👍🏽",
    "🇵🇱🇬🇧 flags",
    "line one\r\nline two",
    "é́ stacked",
    "❤️ heart with selector",
    // `/break` round 1, D3: ZWJ between letters, ZWNJ, a Devanagari conjunct, Thai SARA AM,
    // Persian with a ZWNJ, and a few longer words in the same scripts.
    "a\u200Db",
    "ab\u200Cc",
    "क्ष",
    "กำ",
    "می\u200Cخواهم",
    "नमस्ते क्षत्रिय",
    "สวัสดีครับ",
    "শুভ জন্মদিন",
    "\u200D leading joiner",
    "🏳️‍🌈 👩🏽‍💻",
    // `/break` round 2, hole 2: one conjunct or SARA AM per branch of the grapheme code (Lao
    // SARA AM, and the Gujarati, Oriya, Telugu and Malayalam viramas).
    "ຄຳ",
    "ક્ષ",
    "କ୍ଷ",
    "క్ష",
    "ക്ഷ",
  ];

  it.each(FIXTURES)("equals the server's countGraphemes for %j", (text) => {
    expect(approximateGraphemes(text)).toBe(countGraphemes(text, "en"));
  });
});

describe("the on-blur validation (BlurValidation's logic)", () => {
  function control(
    overrides: Partial<{
      dataset: Record<string, string>;
      valueMissing: boolean;
      patternMismatch: boolean;
      typeMismatch: boolean;
    }> = {},
  ): ControlLike & { attributes: Map<string, string> } {
    const attributes = new Map<string, string>();
    return {
      id: "name",
      dataset: {
        foValidate: "",
        foDirty: "",
        foMsgRequired: "Please fill this in to continue.",
        foMsgFormat: "Please enter it in the form 00-001.",
        ...overrides.dataset,
      },
      validity: {
        valueMissing: overrides.valueMissing ?? false,
        patternMismatch: overrides.patternMismatch ?? false,
        typeMismatch: overrides.typeMismatch ?? false,
      },
      attributes,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    };
  }

  function errorElement(source: "client" | "server" = "client"): {
    element: ErrorElementLike;
    text: { textContent: string | null };
  } {
    const text = { textContent: "" as string | null };
    return {
      text,
      element: {
        hidden: true,
        dataset: { foError: source },
        querySelector: (selector) =>
          selector === "[data-fo-error-text]" ? text : null,
      },
    };
  }

  it("maps validity to a problem", () => {
    expect(
      fieldProblem({
        valueMissing: true,
        patternMismatch: false,
        typeMismatch: false,
      }),
    ).toBe("required");
    expect(
      fieldProblem({
        valueMissing: false,
        patternMismatch: true,
        typeMismatch: false,
      }),
    ).toBe("format");
    expect(
      fieldProblem({
        valueMissing: false,
        patternMismatch: false,
        typeMismatch: true,
      }),
    ).toBe("format");
    expect(
      fieldProblem({
        valueMissing: false,
        patternMismatch: false,
        typeMismatch: false,
      }),
    ).toBeNull();
  });

  it("shows the required message on an edited empty field and marks it invalid", () => {
    const field = control({ valueMissing: true });
    const { element, text } = errorElement();
    expect(applyFieldState(field, { getElementById: () => element })).toBe(
      "required",
    );
    expect(element.hidden).toBe(false);
    expect(text.textContent).toBe("Please fill this in to continue.");
    expect(field.attributes.get("aria-invalid")).toBe("true");
  });

  it("shows the format message on a pattern mismatch", () => {
    const field = control({ patternMismatch: true });
    const { element, text } = errorElement();
    applyFieldState(field, { getElementById: () => element });
    expect(text.textContent).toBe("Please enter it in the form 00-001.");
  });

  it("hides its own message once the field is valid", () => {
    const field = control();
    field.attributes.set("aria-invalid", "true");
    const { element, text } = errorElement();
    element.hidden = false;
    text.textContent = "Please fill this in to continue.";
    expect(applyFieldState(field, { getElementById: () => element })).toBe(
      null,
    );
    expect(element.hidden).toBe(true);
    expect(text.textContent).toBe("");
    expect(field.attributes.has("aria-invalid")).toBe(false);
  });

  it("leaves a field the buyer has not edited alone", () => {
    const field = control({ valueMissing: true, dataset: {} });
    delete field.dataset.foDirty;
    const { element } = errorElement();
    expect(applyFieldState(field, { getElementById: () => element })).toBe(
      null,
    );
    expect(element.hidden).toBe(true);
  });

  it("never touches a message the server wrote", () => {
    const field = control();
    const { element, text } = errorElement("server");
    element.hidden = false;
    text.textContent =
      "Please enter the full phone number, with the country code.";
    applyFieldState(field, { getElementById: () => element });
    expect(element.hidden).toBe(false);
    expect(text.textContent).toBe(
      "Please enter the full phone number, with the country code.",
    );
  });
});

describe("the error summary's focus (FocusOnMount's logic, AC-14)", () => {
  it("focuses the element with the id", () => {
    let focused = 0;
    const target = {
      focus: () => {
        focused += 1;
      },
    };
    expect(
      focusTarget(
        { getElementById: (id) => (id === "summary" ? target : null) },
        "summary",
      ),
    ).toBe(true);
    expect(focused).toBe(1);
  });

  it("reports a missing target", () => {
    expect(focusTarget({ getElementById: () => null }, "summary")).toBe(false);
  });

  afterEach(() => {
    hooks.effects.length = 0;
    vi.unstubAllGlobals();
  });

  it("is what FocusOnMount runs on mount", () => {
    let focused = "";
    vi.stubGlobal("document", {
      getElementById: (id: string) => ({
        focus: () => {
          focused = id;
        },
      }),
    });
    FocusOnMount({ attempt: 1, targetId: "errors" });
    hooks.effects[0]?.run();
    expect(focused).toBe("errors");
  });

  /**
   * D2 of `/break` round 1: a second failed submit re-renders the same summary under the same id,
   * so the island stays mounted. Its effect must re-run on a new attempt, and only then.
   */
  it("refocuses on every new submit, even with the same summary id (D2)", () => {
    FocusOnMount({ attempt: 1, targetId: "errors" });
    FocusOnMount({ attempt: 2, targetId: "errors" });
    FocusOnMount({ attempt: 2, targetId: "errors" });
    const [first, second, again] = hooks.effects.map((effect) => effect.deps);
    const changed = (a?: readonly unknown[], b?: readonly unknown[]) =>
      a === undefined ||
      b === undefined ||
      a.length !== b.length ||
      a.some((value, index) => !Object.is(value, b[index]));
    expect(changed(first, second)).toBe(true);
    expect(changed(second, again)).toBe(false);
  });
});

describe("the place-order button while pending (hole 5)", () => {
  function click(forcePending: boolean): number {
    const element = PlaceOrderButton({
      forcePending,
      label: "Place demo order. Nothing is charged.",
      pendingLabel: "Placing your demo order…",
    });
    const onClick = (
      element.props as { onClick: (event: { preventDefault(): void }) => void }
    ).onClick;
    let prevented = 0;
    onClick({
      preventDefault: () => {
        prevented += 1;
      },
    });
    return prevented;
  }

  it("swallows a second click while the order is being placed", () => {
    expect(click(true)).toBe(1);
  });

  it("lets the first click through", () => {
    expect(click(false)).toBe(0);
  });
});

describe("the on-blur announcement (D1)", () => {
  function field(label: string | null): ControlLike {
    return {
      id: "recipient-postcode",
      labels: label === null ? [] : [{ textContent: ` ${label} ` }],
      dataset: {
        foValidate: "",
        foDirty: "",
        foMsgRequired: "Please fill this in to continue.",
      },
      validity: {
        valueMissing: true,
        patternMismatch: false,
        typeMismatch: false,
      },
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
    };
  }
  const errorSlot = (): ErrorElementLike => ({
    hidden: true,
    dataset: { foError: "client" },
    querySelector: () => ({ textContent: "" }),
  });

  it("says the field's label and the message in the form's live region", () => {
    const status = { textContent: "" as string | null };
    applyFieldState(
      field("Postcode"),
      { getElementById: errorSlot },
      { status, template: "{field}: {message}" },
    );
    expect(status.textContent).toBe(
      "Postcode: Please fill this in to continue.",
    );
  });

  it("clears the live region once the field is valid", () => {
    const status = {
      textContent: "Postcode: Please fill this in to continue.",
    };
    const valid = {
      ...field("Postcode"),
      validity: {
        valueMissing: false,
        patternMismatch: false,
        typeMismatch: false,
      },
    };
    applyFieldState(
      valid,
      { getElementById: errorSlot },
      { status, template: "{field}: {message}" },
    );
    expect(status.textContent).toBe("");
  });

  it("puts a label or message with a replacement pattern in verbatim", () => {
    expect(
      announcement(
        "{field}: {message}",
        field("Cost $& $1 $$"),
        "Fix $& {field}",
      ),
    ).toBe("Cost $& $1 $$: Fix $& {field}");
  });

  it("reads the template once: a placeholder inside the label or the message stays text (r3)", () => {
    expect(announcement("{field}: {message}", field("A {message}"), "M")).toBe(
      "A {message}: M",
    );
    expect(
      announcement("{message} ({field})", field("Postcode"), "Use {field}"),
    ).toBe("Use {field} (Postcode)");
  });

  it("says the message alone when the control has no label", () => {
    expect(
      announcement("{field}: {message}", field(null), "Please fill this in."),
    ).toBe("Please fill this in.");
  });
});

/**
 * The wiring of the two form islands, driven with stand-ins for the DOM classes and elements
 * (`/break` round 2, holes 1 and 3). The unit project has no DOM, so `instanceof` checks are
 * answered by small classes and `document` by a lookup.
 */
describe("the islands' event wiring", () => {
  type Listener = (event: unknown) => void;

  class FakeElement {
    readonly listeners = new Map<string, Listener[]>();
    readonly dataset: Record<string, string> = {};
    textContent: string | null = "";
    value = "";
    id = "";
    addEventListener(type: string, listener: Listener): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    removeEventListener(type: string, listener: Listener): void {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((fn) => fn !== listener),
      );
    }
    fire(type: string, event: unknown = { target: this }): void {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }
  class FakeTextArea extends FakeElement {}
  class FakeInput extends FakeElement {
    readonly attributes = new Map<string, string>();
    labels = [{ textContent: "Postcode" }];
    validity = {
      valueMissing: true,
      patternMismatch: false,
      typeMismatch: false,
    };
    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value);
    }
    removeAttribute(name: string): void {
      this.attributes.delete(name);
    }
  }

  function stubDom(elements: Record<string, unknown>): void {
    vi.stubGlobal("HTMLTextAreaElement", FakeTextArea);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    vi.stubGlobal("HTMLSelectElement", class {});
    vi.stubGlobal("document", {
      getElementById: (id: string) => elements[id] ?? null,
      querySelectorAll: () => [],
    });
  }

  afterEach(() => {
    hooks.effects.length = 0;
    vi.unstubAllGlobals();
  });

  describe("CardCounter (hole 1)", () => {
    function type(count: number): { counter: FakeElement } {
      const field = new FakeTextArea();
      const counter = new FakeElement();
      stubDom({ card: field, "card-count": counter });
      CardCounter({
        fieldId: "card",
        counterId: "card-count",
        template: "{count} of 200",
        max: 200,
      });
      hooks.effects[0]?.run();
      field.value = "x".repeat(count);
      field.fire("input");
      return { counter };
    }

    it("writes the count and is not over at exactly the limit", () => {
      const { counter } = type(200);
      expect(counter.textContent).toBe("200 of 200");
      expect(counter.dataset.over).toBe("false");
    });

    it("is over one past the limit", () => {
      const { counter } = type(201);
      expect(counter.textContent).toBe("201 of 200");
      expect(counter.dataset.over).toBe("true");
    });
  });

  describe("BlurValidation (hole 3)", () => {
    it("announces the message in the form's live region when a field loses focus", () => {
      const form = new FakeElement();
      const status = new FakeElement();
      const input = new FakeInput();
      input.id = "postcode";
      input.dataset.foValidate = "";
      input.dataset.foDirty = "";
      input.dataset.foMsgRequired = "Please fill this in.";
      const errorText = { textContent: "" as string | null };
      const error = {
        hidden: true,
        dataset: { foError: "client" },
        querySelector: () => errorText,
      };
      stubDom({
        step: form,
        "step-status": status,
        "postcode-error": error,
      });
      BlurValidation({
        formId: "step",
        announceTemplate: "{field}: {message}",
      });
      hooks.effects[0]?.run();
      form.fire("focusout", { target: input });
      expect(error.hidden).toBe(false);
      expect(errorText.textContent).toBe("Please fill this in.");
      expect(status.textContent).toBe("Postcode: Please fill this in.");
    });
  });
});
