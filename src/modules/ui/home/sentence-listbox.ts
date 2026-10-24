/**
 * The home sentence's own listbox on a mouse (spec 004 §14 A-founder-2026-10-21d; AC-60 to AC-71;
 * TASK-326; `docs/design/wireframes/home-sentence-listbox-desktop.dc.html`, the "Sentence listbox"
 * group of `docs/design/system/components.dc.html`).
 *
 * `enhanceSentence(form)` runs inside `SentenceIsland`, so it ships in the sentence's lazy chunk
 * (the deferred set's `home-sentence` entry) and nothing of it is in the server HTML (clause 2):
 *
 *  - **When (clause 1).** Only while `(hover: hover) and (pointer: fine)` matches; the query is
 *    re-read on change and the enhancement is built or torn down whole. Without the popover API the
 *    native selects stay.
 *  - **Over the select (clause 3).** Each `<select>` stays in the form and the layout; its
 *    `data-fo-pick` span gets `data-fo-listbox`, which hides it (`visibility: hidden`), and a
 *    `<button type="button" data-fo-sentence-trigger>` is laid over its box: `inset-inline: 0`
 *    in CSS, the block offset and size copied from the select here. The select stays the source of
 *    truth: a choice is written to it and `input` then `change` are dispatched on it (clause 8).
 *  - **The panel escapes the hero card's `overflow: hidden` through the top layer** (clause 10):
 *    a `popover="manual"` element, placed from the trigger's rectangle with logical offsets through
 *    the CSSOM (no `style` attribute in the server HTML, so the CSP is unchanged). Manual, not
 *    auto: an auto popover's light dismiss would close on the trigger's own press and the click
 *    would reopen it. Every dismissal is handled here instead (clause 7).
 *  - **A select focused when this runs waits for its blur** (clause 11), so nothing is taken from a
 *    reader mid-choice.
 *
 * No cookie, no storage, no request, no analytics, no message key: the names are the fields'
 * existing labels, the option text is the select's.
 */
import {
  activation,
  collatorCompare,
  moveIndex,
  openingIndex,
  typeahead,
} from "./sentence-listbox-model.ts";

/** Clause 1: a primary pointer that is a mouse or a trackpad. */
export const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** The artboard's 8 px between the trigger and the panel, and 16 px kept from the viewport edge. */
const GAP = 8;
const EDGE = 16;

/**
 * The close fade is `--duration-fast` (120 ms, clause 9); the panel leaves the top layer once it has
 * run. A timer rather than `transitionend`: no transition runs where a stylesheet is missing.
 */
const CLOSE_MS = 140;

interface Control {
  readonly select: HTMLSelectElement;
  readonly trigger: HTMLButtonElement;
  readonly text: HTMLElement;
  readonly list: HTMLElement;
  /** In the top layer (open, or fading out). */
  shown: boolean;
  timer: number;
  undo: () => void;
}

function attributes(element: Element, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values))
    element.setAttribute(name, value);
}

/**
 * Enhances the sentence's three selects while the pointer is fine; returns the teardown, which
 * leaves the form exactly as the server wrote it.
 */
export function enhanceSentence(
  form: HTMLElement,
  win: Window & typeof globalThis = window,
): () => void {
  const doc = win.document;
  if (!("showPopover" in win.HTMLElement.prototype)) return () => undefined;
  const query = win.matchMedia(FINE_POINTER);
  const find = typeahead(collatorCompare(doc.documentElement.lang), () =>
    win.performance.now(),
  );
  let controls: Control[] = [];
  let waiting: (() => void)[] = [];
  let open: Control | undefined;
  let current = 0;
  /** Where the page stood when the listbox opened: a scroll closes it only if the page moved. */
  let at = "";
  const where = (): string => `${String(win.scrollX)},${String(win.scrollY)}`;

  const items = (control: Control): HTMLElement[] =>
    [...control.list.children] as HTMLElement[];

  /** Every trigger shows its select's current option text (clause 8). */
  const sync = (): void => {
    for (const control of controls)
      control.text.textContent = control.select.selectedOptions[0]?.text ?? "";
  };

  const focusAt = (index: number): void => {
    if (open === undefined || index < 0) return;
    current = index;
    const { list } = open;
    items(open).forEach((item, at) => {
      item.tabIndex = at === index ? 0 : -1;
    });
    const item = list.children[index] as HTMLElement;
    // Never the page: a page scroll closes the listbox (clause 7). The panel scrolls itself.
    item.focus({ preventScroll: true });
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  };

  const hide = (control: Control): void => {
    win.clearTimeout(control.timer);
    control.list.removeAttribute("data-fo-closing");
    if (!control.shown) return;
    control.shown = false;
    // Focus left inside goes to the document, never back to the trigger (clause 7).
    if (control.list.contains(doc.activeElement))
      (doc.activeElement as HTMLElement).blur();
    control.list.hidePopover();
  };

  const listen = (method: "addEventListener" | "removeEventListener"): void => {
    win[method]("pointerdown", dismiss, true);
    for (const type of ["scroll", "resize", "pagehide"])
      win[method](type, dismiss);
  };

  const close = (focus: boolean): void => {
    const control = open;
    if (control === undefined) return;
    open = undefined;
    listen("removeEventListener");
    control.trigger.setAttribute("aria-expanded", "false");
    control.list.setAttribute("data-fo-closing", "");
    control.timer = win.setTimeout(() => {
      hide(control);
    }, CLOSE_MS);
    if (focus) control.trigger.focus();
  };

  /**
   * A press outside the panel and its trigger, a page scroll, a resize or `pagehide` (clause 7).
   * A scroll event reaches us a frame after the scroll itself, so one that lands just after the
   * opening press may belong to a scroll that ended before it: it closes only if the page has
   * moved since the listbox opened.
   */
  function dismiss(event: Event): void {
    const target = event.target as Node;
    if (
      event.type === "scroll"
        ? where() !== at
        : event.type !== "pointerdown" ||
          !(open?.list.contains(target) || open?.trigger.contains(target))
    )
      close(false);
  }

  const place = ({ trigger, list }: Control): void => {
    const box = trigger.getBoundingClientRect();
    const { clientWidth, clientHeight } = doc.documentElement;
    const { style } = list;
    style.minInlineSize = `${String(box.width)}px`;
    style.maxBlockSize = "";
    const start =
      win.getComputedStyle(trigger).direction === "rtl"
        ? clientWidth - box.right
        : box.left;
    style.insetInlineStart = `${String(Math.max(0, Math.min(start, clientWidth - list.offsetWidth)))}px`;
    // Below unless the room below (to 16 px from the edge) cannot hold it and the room above is
    // larger; when neither side holds it, the larger side, scrolling inside itself.
    const need = list.offsetHeight;
    const below = clientHeight - box.bottom - GAP - EDGE;
    const above = box.top - GAP - EDGE;
    const up = need > below && above > below;
    const room = up ? above : below;
    if (need > room) style.maxBlockSize = `${String(room)}px`;
    style.insetBlockStart = `${String(up ? box.top - GAP - Math.min(need, room) : box.bottom + GAP)}px`;
  };

  const show = (control: Control): void => {
    close(false);
    const { select, list, trigger } = control;
    list.replaceChildren(
      ...[...select.options].map((option, index) => {
        const item = doc.createElement("div");
        item.id = `${list.id}-${String(index)}`;
        attributes(item, {
          role: "option",
          "aria-selected": String(option.selected),
        });
        if (option.disabled) item.setAttribute("aria-disabled", "true");
        item.tabIndex = -1;
        item.textContent = option.text;
        return item;
      }),
    );
    win.clearTimeout(control.timer);
    list.removeAttribute("data-fo-closing");
    if (!control.shown) list.showPopover();
    control.shown = true;
    place(control);
    trigger.setAttribute("aria-expanded", "true");
    open = control;
    at = where();
    listen("addEventListener");
    focusAt(
      openingIndex(
        [...select.options].map((option) => option.disabled),
        select.selectedIndex,
      ),
    );
  };

  /** Clause 8: the select takes the value and hears `input` then `change`, once. */
  const choose = (control: Control, index: number): void => {
    const { select } = control;
    if (select.selectedIndex !== index) {
      select.selectedIndex = index;
      for (const type of ["input", "change"])
        select.dispatchEvent(new Event(type, { bubbles: true }));
    }
    close(true);
  };

  const build = (select: HTMLSelectElement): Control => {
    const pick = select.parentElement as HTMLElement;
    const label = select.labels?.[0];
    const added = label !== undefined && label.id === "";
    if (added) label.id = `${select.id}-label`;
    const labelId = select.getAttribute("aria-labelledby") ?? label?.id ?? "";
    const trigger = doc.createElement("button");
    const text = doc.createElement("span");
    const list = doc.createElement("div");
    text.id = `${select.id}-value`;
    list.id = `${select.id}-listbox`;
    trigger.type = "button";
    attributes(trigger, {
      "data-fo-sentence-trigger": "",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-controls": list.id,
      "aria-labelledby": `${labelId} ${text.id}`,
    });
    attributes(list, {
      role: "listbox",
      "aria-labelledby": labelId,
      popover: "manual",
      "data-fo-sentence-listbox": "",
    });
    trigger.append(text);
    // The select's own box (clause 3), to the fraction of a pixel: the inline extent is the pick
    // span's, which is the select's; the block offset and size are read here.
    const box = select.getBoundingClientRect();
    trigger.style.insetBlockStart = `${String(box.top - pick.getBoundingClientRect().top)}px`;
    trigger.style.blockSize = `${String(box.height)}px`;
    const control: Control = {
      select,
      trigger,
      text,
      list,
      shown: false,
      timer: 0,
      undo: () => {
        hide(control);
        trigger.remove();
        list.remove();
        pick.removeAttribute("data-fo-listbox");
        if (added) label?.removeAttribute("id");
      },
    };
    trigger.addEventListener("click", () => {
      if (open === control) close(true);
      else show(control);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      show(control);
    });
    list.addEventListener("click", (event) => {
      const item = (event.target as Element).closest("[role=option]");
      if (item !== null && !item.hasAttribute("aria-disabled"))
        choose(control, items(control).indexOf(item as HTMLElement));
    });
    list.addEventListener("keydown", (event) => {
      const { key } = event;
      // Tab closes and lets focus move on: the panel follows its trigger in the document.
      if (key === "Tab") {
        close(false);
        return;
      }
      const all = items(control);
      let next = moveIndex(key, current, all.length);
      if (key === "Escape") close(true);
      else if (key === "Enter" || key === " ") {
        if (
          activation(all[current]?.hasAttribute("aria-disabled") ?? true) ===
          "select"
        )
          choose(control, current);
      } else if (
        next < 0 &&
        key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      )
        next = find(
          key,
          all.map((item) => item.textContent ?? ""),
          current,
        );
      else if (next < 0) return;
      // No arrow, Space, Home or End scrolls the page, and no Enter submits the form (clause 6).
      event.preventDefault();
      event.stopPropagation();
      focusAt(next);
    });
    pick.setAttribute("data-fo-listbox", "");
    pick.append(trigger, list);
    return control;
  };

  const attach = (): void => {
    for (const select of form.querySelectorAll("select")) {
      if (doc.activeElement !== select) {
        controls.push(build(select));
        continue;
      }
      const later = (): void => {
        controls.push(build(select));
        sync();
      };
      select.addEventListener("blur", later, { once: true });
      waiting.push(() => {
        select.removeEventListener("blur", later);
      });
    }
    sync();
  };

  const detach = (): void => {
    close(false);
    for (const control of controls) control.undo();
    for (const stop of waiting) stop();
    controls = [];
    waiting = [];
  };

  const update = (): void => {
    detach();
    if (query.matches) attach();
  };

  update();
  query.addEventListener("change", update);
  form.addEventListener("change", sync);
  win.addEventListener("pageshow", sync);
  return () => {
    query.removeEventListener("change", update);
    form.removeEventListener("change", sync);
    win.removeEventListener("pageshow", sync);
    detach();
  };
}
