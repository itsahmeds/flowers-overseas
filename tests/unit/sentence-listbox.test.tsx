// @vitest-environment jsdom
/**
 * T-66 / AC-61, AC-69 and the unit halves of AC-62 to AC-65 (spec 004 §14 A-founder-2026-10-21d;
 * TASK-326): `enhanceSentence()` over the **real** server HTML of `SentencePicker`, in jsdom with
 * a mocked `matchMedia` and the popover API stubbed (jsdom has neither).
 *
 *  - one trigger per control while `(hover: hover) and (pointer: fine)` matches, none when it does
 *    not; a change to coarse removes them and gives the form back byte for byte; a change back
 *    builds exactly one per control, never two; a focused select waits for its blur;
 *  - the names, roles and states of AC-62, the keys of AC-63, the pointer of AC-64 and the value
 *    flow of AC-65, with `SentenceIsland` mounted so the possessive sync runs as on the page.
 *
 * Geometry, motion and focus rings need a layout engine: `tests/e2e/home-sentence-listbox.spec.ts`.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { loadMessages } from "../../src/modules/i18n";
import { SentenceIsland } from "../../src/modules/ui/home/SentenceIsland.tsx";
import { SentencePicker } from "../../src/modules/ui/home/SentencePicker.tsx";
import {
  FINE_POINTER,
  enhanceSentence,
} from "../../src/modules/ui/home/sentence-listbox.ts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const NAMESPACES = [
  "home",
  "finder",
  "corridor",
  "destinations",
  "occasions",
] as const;

function serverHtml(locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...NAMESPACES])}
      timeZone="UTC"
    >
      <SentencePicker locale={locale} shopCountries={["PL"]} />
    </NextIntlClientProvider>,
  );
}

/** `matchMedia` whose answer the test flips, telling its listeners as a browser would. */
const media = {
  fine: true,
  listeners: new Set<() => void>(),
  set(fine: boolean): void {
    this.fine = fine;
    for (const listener of [...this.listeners]) listener();
  },
};

const shown = new Set<Element>();

beforeEach(() => {
  media.fine = true;
  media.listeners.clear();
  shown.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === FINE_POINTER && media.fine;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      media.listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      media.listeners.delete(listener);
    },
  })) as unknown as typeof window.matchMedia;
  // jsdom renders a `[popover]` as hidden and never matches `:popover-open`, so the stub shows the
  // panel with an inline `display` to make its options focusable, as the top layer does.
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      shown.add(this);
      this.style.display = "block";
    },
    hidePopover(this: HTMLElement) {
      shown.delete(this);
      this.style.removeProperty("display");
    },
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
  delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
});

function page(locale = "en"): HTMLFormElement {
  document.documentElement.lang = locale;
  document.body.innerHTML = serverHtml(locale);
  const form = document.querySelector<HTMLFormElement>("form#send");
  if (form === null) throw new Error("no sentence form");
  return form;
}

const select = (id: string): HTMLSelectElement =>
  document.querySelector<HTMLSelectElement>(`#send-${id}`) as HTMLSelectElement;
const trigger = (id: string): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>(
    `[data-fo-sentence-trigger][aria-controls="send-${id}-listbox"]`,
  ) as HTMLButtonElement;
const listbox = (id: string): HTMLElement =>
  document.getElementById(`send-${id}-listbox`) as HTMLElement;
const options = (id: string): HTMLElement[] => [
  ...listbox(id).querySelectorAll<HTMLElement>('[role="option"]'),
];
const triggers = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>(
    'button[data-fo-sentence-trigger][aria-haspopup="listbox"]',
  ),
];
const expanded = (): string[] =>
  triggers()
    .filter((button) => button.getAttribute("aria-expanded") === "true")
    .map((button) => button.getAttribute("aria-controls") ?? "");

function key(target: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

/** The accessible name `aria-labelledby` gives: each id's text, joined by a space. */
function labelledBy(element: Element): string {
  return (element.getAttribute("aria-labelledby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? `#${id}?`)
    .join(" ");
}

describe("T-66: built on a fine pointer, torn down on a coarse one (AC-61, AC-69)", () => {
  it("builds exactly one closed listbox trigger per control and hides each select", () => {
    const form = page();
    enhanceSentence(form);

    expect(triggers()).toHaveLength(3);
    for (const id of ["who", "country", "occasion"]) {
      const pick = select(id).parentElement as HTMLElement;
      expect(
        pick.querySelectorAll(
          'button[aria-haspopup="listbox"][aria-expanded="false"]',
        ),
        id,
      ).toHaveLength(1);
      // `[data-fo-pick][data-fo-listbox] > select { visibility: hidden }` reads this.
      expect(pick.hasAttribute("data-fo-listbox"), id).toBe(true);
      expect(pick.hasAttribute("data-fo-pick"), id).toBe(true);
      expect(select(id).closest("form"), id).toBe(form);
    }
  });

  it("builds nothing where the query does not match (a phone, a tablet)", () => {
    media.fine = false;
    const form = page();
    const before = form.outerHTML;
    enhanceSentence(form);

    expect(triggers()).toHaveLength(0);
    expect(form.outerHTML).toBe(before);
  });

  it("builds nothing without the popover API, and leaves the form alone", () => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
    const form = page();
    const before = form.outerHTML;
    enhanceSentence(form);

    expect(triggers()).toHaveLength(0);
    expect(form.outerHTML).toBe(before);
  });

  it("tears down to the server's HTML on a change to coarse, and rebuilds one per control on a change back", () => {
    const form = page();
    const server = form.outerHTML;
    enhanceSentence(form);
    act(() => {
      trigger("country").click();
    });
    expect(expanded()).toEqual(["send-country-listbox"]);

    media.set(false);
    expect(triggers()).toHaveLength(0);
    expect(shown.size).toBe(0);
    expect(form.outerHTML).toBe(server);

    media.set(true);
    expect(triggers()).toHaveLength(3);
    media.set(true);
    expect(triggers()).toHaveLength(3);
    for (const id of ["who", "country", "occasion"]) {
      expect(
        select(id).parentElement?.querySelectorAll(
          "[data-fo-sentence-trigger]",
        ),
        id,
      ).toHaveLength(1);
    }
  });

  it("waits for a focused select's blur before replacing it (clause 11)", () => {
    const form = page();
    select("country").focus();
    enhanceSentence(form);

    expect(triggers()).toHaveLength(2);
    expect(trigger("country")).toBeNull();
    expect(document.activeElement).toBe(select("country"));

    select("country").blur();
    expect(triggers()).toHaveLength(3);
    expect(trigger("country").textContent).toBe("Poland");
  });

  it("does not build a waiting control after its teardown", () => {
    const form = page();
    select("who").focus();
    const stop = enhanceSentence(form);
    stop();
    select("who").blur();

    expect(triggers()).toHaveLength(0);
  });

  it("gives the form back exactly as the server wrote it when the island unmounts", () => {
    const form = page();
    const server = form.outerHTML;
    const stop = enhanceSentence(form);
    act(() => {
      trigger("who").click();
    });
    stop();

    expect(form.outerHTML).toBe(server);
    expect(shown.size).toBe(0);
  });
});

describe("AC-62: names, roles and states", () => {
  it("names each trigger by its field's label and the selected text, and controls its listbox", () => {
    enhanceSentence(page());

    expect(labelledBy(trigger("who"))).toBe("Start with who it's for my mum");
    expect(labelledBy(trigger("country"))).toBe("Country Poland");
    expect(labelledBy(trigger("occasion"))).toBe("Occasion her birthday");
    for (const id of ["who", "country", "occasion"]) {
      expect(trigger(id).getAttribute("aria-controls")).toBe(listbox(id).id);
      expect(trigger(id).type).toBe("button");
    }
  });

  it("opens a listbox named by the label, one option per <option>, the value selected, not-yet disabled, one roving stop focused", () => {
    enhanceSentence(page());
    act(() => {
      trigger("country").click();
    });
    const list = listbox("country");
    const items = options("country");

    expect(list.getAttribute("role")).toBe("listbox");
    expect(list.getAttribute("popover")).toBe("manual");
    expect(labelledBy(list)).toBe("Country");
    expect(items).toHaveLength(select("country").options.length);
    expect(items.map((item) => item.textContent)).toEqual(
      [...select("country").options].map((option) => option.text),
    );
    const selected = items.filter(
      (item) => item.getAttribute("aria-selected") === "true",
    );
    expect(selected.map((item) => item.textContent)).toEqual(["Poland"]);
    expect(
      items
        .filter((item) => item.getAttribute("aria-disabled") === "true")
        .map((item) => item.textContent),
    ).toEqual(
      [...select("country").options]
        .filter((option) => option.disabled)
        .map((option) => option.text),
    );
    expect(items.filter((item) => item.tabIndex === 0)).toEqual(selected);
    expect(document.activeElement).toBe(selected[0]);
    expect(trigger("country").getAttribute("aria-expanded")).toBe("true");
    expect(shown.has(list)).toBe(true);
  });
});

describe("AC-63: the keyboard", () => {
  it.each(["ArrowDown", "ArrowUp"])(
    "%s on the trigger opens it with focus on the selected option, and scrolls nothing",
    (name) => {
      enhanceSentence(page());
      const event = key(trigger("country"), name);

      expect(event.defaultPrevented).toBe(true);
      expect(trigger("country").getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement?.textContent).toBe("Poland");
    },
  );

  it("moves without wrapping, goes Home and End, and prevents the page's scroll", () => {
    enhanceSentence(page());
    key(trigger("country"), "ArrowDown");
    const list = listbox("country");

    expect(key(list, "End").defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe("Spain (not yet)");
    expect(key(list, "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement?.textContent).toBe("Spain (not yet)");
    key(list, "Home");
    expect(document.activeElement?.textContent).toBe("France (not yet)");
    key(list, "ArrowUp");
    expect(document.activeElement?.textContent).toBe("France (not yet)");
    key(list, "ArrowDown");
    expect(document.activeElement?.textContent).toBe("Germany (not yet)");
    expect(
      options("country").filter((item) => item.tabIndex === 0),
    ).toHaveLength(1);
    expect(options("country").find((item) => item.tabIndex === 0)).toBe(
      document.activeElement,
    );
  });

  it("type-ahead: n goes to Netherlands, then po (after the window) to Poland", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    enhanceSentence(page());
    key(trigger("country"), "ArrowDown");
    const list = listbox("country");

    key(list, "n");
    expect(document.activeElement?.textContent).toBe("Netherlands (not yet)");
    now.mockReturnValue(10_600);
    key(list, "p");
    now.mockReturnValue(10_700);
    key(list, "o");
    expect(document.activeElement?.textContent).toBe("Poland");
    now.mockRestore();
  });

  it("type-ahead on /pl: po goes to Polska", () => {
    enhanceSentence(page("pl"));
    key(trigger("country"), "ArrowDown");
    key(listbox("country"), "Home");
    key(listbox("country"), "p");
    key(listbox("country"), "o");

    expect(document.activeElement?.textContent).toBe("Polska");
  });

  it.each(["Enter", " "])(
    "%s on an enabled option chooses it: value, text, focus, input then change once, no submit",
    (name) => {
      const form = page();
      enhanceSentence(form);
      const heard: string[] = [];
      for (const type of ["input", "change"]) {
        select("occasion").addEventListener(type, () => heard.push(type));
      }
      const submitted = vi.fn((event: Event) => {
        event.preventDefault();
      });
      form.addEventListener("submit", submitted);
      key(trigger("occasion"), "ArrowDown");
      key(listbox("occasion"), "ArrowDown");
      const event = key(listbox("occasion"), name);

      expect(event.defaultPrevented).toBe(true);
      expect(select("occasion").value).toBe("nameDay");
      expect(trigger("occasion").textContent).toBe(
        select("occasion").selectedOptions[0]?.text,
      );
      expect(trigger("occasion").textContent).toBe("her name day");
      expect(document.activeElement).toBe(trigger("occasion"));
      expect(trigger("occasion").getAttribute("aria-expanded")).toBe("false");
      expect(heard).toEqual(["input", "change"]);
      expect(submitted).not.toHaveBeenCalled();
    },
  );

  it("Enter on a not-yet destination keeps the list open and the value", () => {
    enhanceSentence(page());
    key(trigger("country"), "ArrowDown");
    key(listbox("country"), "ArrowUp");
    expect(document.activeElement?.textContent).toBe("Netherlands (not yet)");
    key(listbox("country"), "Enter");

    expect(select("country").value).toBe("PL");
    expect(trigger("country").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Netherlands (not yet)");
  });

  it("Escape closes, keeps the value and returns focus to the trigger", () => {
    enhanceSentence(page());
    key(trigger("country"), "ArrowDown");
    key(listbox("country"), "Home");
    const event = key(listbox("country"), "Escape");

    expect(event.defaultPrevented).toBe(true);
    expect(select("country").value).toBe("PL");
    expect(trigger("country").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger("country"));
    vi.advanceTimersByTime(200);
    expect(shown.has(listbox("country"))).toBe(false);
  });

  it("Tab closes without choosing and leaves focus where Tab takes it (not prevented, not the trigger)", () => {
    enhanceSentence(page());
    key(trigger("who"), "ArrowDown");
    key(listbox("who"), "ArrowDown");
    const event = key(listbox("who"), "Tab");

    expect(event.defaultPrevented).toBe(false);
    expect(select("who").value).toBe("mum");
    expect(trigger("who").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).not.toBe(trigger("who"));
  });
});

describe("AC-64: the pointer", () => {
  it("toggles on the trigger's click", () => {
    enhanceSentence(page());
    trigger("who").click();
    expect(trigger("who").getAttribute("aria-expanded")).toBe("true");
    trigger("who").click();
    expect(trigger("who").getAttribute("aria-expanded")).toBe("false");
  });

  it("chooses an enabled option on click, closes and focuses the trigger; a not-yet one does nothing", () => {
    enhanceSentence(page());
    trigger("country").click();
    options("country")[3]?.click();
    expect(trigger("country").getAttribute("aria-expanded")).toBe("true");
    expect(select("country").value).toBe("PL");

    trigger("who").click();
    options("who")[1]?.click();
    expect(select("who").value).toBe("dad");
    expect(trigger("who").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger("who"));
  });

  it("keeps one listbox open at a time", () => {
    enhanceSentence(page());
    trigger("who").click();
    trigger("country").dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );
    trigger("country").click();

    expect(expanded()).toEqual(["send-country-listbox"]);
  });

  it.each([
    [
      "a press outside",
      () =>
        document.body.dispatchEvent(
          new Event("pointerdown", { bubbles: true }),
        ),
    ],
    [
      "a page scroll",
      () => document.dispatchEvent(new Event("scroll", { bubbles: true })),
    ],
    ["a resize", () => window.dispatchEvent(new Event("resize"))],
    ["pagehide", () => window.dispatchEvent(new Event("pagehide"))],
  ])(
    "%s closes it, value unchanged, focus not sent to the trigger",
    (_name, act) => {
      enhanceSentence(page());
      trigger("country").click();
      key(listbox("country"), "Home");
      act();

      expect(trigger("country").getAttribute("aria-expanded")).toBe("false");
      expect(select("country").value).toBe("PL");
      expect(document.activeElement).not.toBe(trigger("country"));
      vi.advanceTimersByTime(200);
      expect(shown.size).toBe(0);
    },
  );

  it("a press inside the panel or on its trigger does not close it", () => {
    enhanceSentence(page());
    trigger("country").click();
    options("country")[0]?.dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );
    trigger("country").dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );

    expect(trigger("country").getAttribute("aria-expanded")).toBe("true");
  });

  it("an option's own scroll does not close it (only the page's does)", () => {
    enhanceSentence(page());
    trigger("country").click();
    listbox("country").dispatchEvent(new Event("scroll"));

    expect(trigger("country").getAttribute("aria-expanded")).toBe("true");
  });
});

describe("AC-65: the value flow, with the possessive island mounted", () => {
  it("dad turns the occasion trigger to his birthday, the who select keeps no name, nothing is stored or sent", async () => {
    const form = page();
    const cookie = document.cookie;
    const local = JSON.stringify({ ...localStorage });
    const session = JSON.stringify({ ...sessionStorage });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SentenceIsland formId="send" />);
      await Promise.resolve();
    });
    expect(triggers()).toHaveLength(3);

    act(() => {
      trigger("who").click();
    });
    act(() => {
      options("who")[1]?.click();
    });

    expect(select("who").value).toBe("dad");
    expect(expanded()).toEqual([]);
    expect(trigger("occasion").textContent).toBe(
      select("occasion").selectedOptions[0]?.text,
    );
    expect(trigger("occasion").textContent).toBe("his birthday");
    expect(select("who").hasAttribute("name")).toBe(false);
    expect(
      [...new FormData(form).keys()],
      "the form submits these and nothing else",
    ).toEqual(["country", "occasion"]);
    expect(document.cookie).toBe(cookie);
    expect(JSON.stringify({ ...localStorage })).toBe(local);
    expect(JSON.stringify({ ...sessionStorage })).toBe(session);
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    expect(triggers()).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it("reads the select's value on mount and again on pageshow (a back/forward restore)", () => {
    const form = page();
    select("country").value = "PL";
    select("occasion").value = "sympathy";
    enhanceSentence(form);
    expect(trigger("occasion").textContent).toBe(
      select("occasion").selectedOptions[0]?.text,
    );

    select("occasion").value = "newBaby";
    window.dispatchEvent(new Event("pageshow"));
    expect(trigger("occasion").textContent).toBe("a new baby");
  });
});

describe("placement from the trigger's rectangle (clause 5, AC-67's unit half)", () => {
  function geometry(top: number, height: number): void {
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 1440,
    });
    trigger("occasion").getBoundingClientRect = () =>
      ({
        top,
        bottom: top + 44,
        left: 120,
        right: 320,
        width: 200,
        height: 44,
      }) as DOMRect;
    Object.defineProperty(listbox("occasion"), "offsetHeight", {
      configurable: true,
      value: height,
    });
  }

  it("opens below, 8 px from the trigger, at least as wide, inline-start aligned, when it fits", () => {
    enhanceSentence(page());
    geometry(200, 282);
    trigger("occasion").click();
    const { style } = listbox("occasion");

    expect(style.insetBlockStart).toBe("252px");
    expect(style.insetInlineStart).toBe("120px");
    expect(style.minInlineSize).toBe("200px");
    expect(style.maxBlockSize).toBe("");
  });

  it("opens upward when the room below is too small and above is larger", () => {
    enhanceSentence(page());
    // 900 − 744 − 8 − 16 = 132 below; 700 − 8 − 16 = 676 above.
    geometry(700, 282);
    trigger("occasion").click();

    expect(listbox("occasion").style.insetBlockStart).toBe(
      `${String(700 - 8 - 282)}px`,
    );
    expect(listbox("occasion").style.maxBlockSize).toBe("");
  });

  it("takes the larger side and scrolls inside itself when neither holds it", () => {
    enhanceSentence(page());
    // 900 − 344 − 24 = 532 below, 300 − 24 = 276 above, 600 needed.
    geometry(300, 600);
    trigger("occasion").click();

    expect(listbox("occasion").style.insetBlockStart).toBe("352px");
    expect(listbox("occasion").style.maxBlockSize).toBe("532px");
  });
});
