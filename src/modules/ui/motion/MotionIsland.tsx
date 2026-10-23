"use client";

/**
 * `MotionIsland` — the one client module the approved motions need (spec 004 §14 A24 clause 9 (d),
 * AC-44, AC-25; TASK-194; `docs/design/system/motion.dc.html`).
 *
 * It renders nothing (`null`, so the header that mounts it keeps its server box, AC-7), adds no
 * dependency and only toggles attributes; every motion itself is CSS in `src/app/globals.css`, and
 * every rule that moves or hides something sits inside `prefers-reduced-motion: no-preference`, so
 * the media query, not this file, is the reduced-motion gate. It is written for bytes, because it
 * ships on every locale document inside AC-25's 131 072 B (the cost per motion is in
 * `docs/tasks/TASK-194.md`):
 *
 *  - **Motion 1, the route-loading bloom.** A plain click on a link to another page of this site
 *    (same origin, no new tab, no download, no modifier, not a jump inside this page) arms a
 *    150 ms timer; if the next document has not replaced this one by then, `<html data-fo-nav>`
 *    plays the header logo's bloom and the 2 px bar. The server's HTML never carries it, so no
 *    first load, reload, JavaScript-off load or `?page=2` response paints a loader (A24 (f)).
 *  - **Motion 3, the pending button** (every primary action, TASK-283). On a form's submit, its
 *    `data-fo-pending` button takes `aria-busy="true"` and `disabled` in the next task (the
 *    submission has already read the form by then); a `data-fo-pending` link the click above lets
 *    through takes `aria-busy="true"` and `aria-disabled="true"` (a link has no `disabled`), and
 *    plays instead of motion 1's header bloom, one flourish at a time. All of it comes off on
 *    `pageshow`, when the back/forward cache brings the page back.
 *  - **Motion 4, the sentence's shimmer.** 800 ms after load, once, unless the form was touched.
 *  - **The open phone Menu** (spec 004 §14 A-founder-2026-10-19c clause 3, AC-47; TASK-282). A tap
 *    on its scrim closes it; `Tab` and `Shift+Tab` keep focus inside it and its summary; Send
 *    flowers (any link to `#send`) closes it. On the page that holds `#send` (the home), at every
 *    width, Send flowers scrolls the sentence letter in below the sticky header and moves focus to
 *    its first choice instead of jumping to the anchor. With the module not loaded, the `<details>`
 *    and the `#send` link work natively (the scrim is not drawn without it, `globals.css`).
 *  - **Motion 10's close half and `Esc`** for the phone Menu (spec 004 AC-47; was `MenuEscape`,
 *    TASK-195; the close, TASK-283). A click on an open Menu's summary, or `Esc` (focus back on
 *    the summary), marks it `data-fo-closing`: the panel fades and rises out on the transition
 *    `globals.css` gives it, and the `<details>` closes when that transition ends (at once when
 *    nothing runs). `display` never transitions (AC-44), so the open state is held until then.
 *  - **Motion 11 and 12.** `<html data-fo-motion>` first; then only sections and not-yet-loaded
 *    images whose top is at or below the first viewport's foot take their `pending` start state,
 *    and each plays once (`in`). Nothing in the first viewport is ever hidden, and without
 *    JavaScript nothing is (A24 (g)).
 */
import { useEffect } from "react";

export function MotionIsland(): null {
  useEffect(() => {
    const d = document;
    const root = d.documentElement;
    const here = location;
    const fold = innerHeight;
    const busy = "aria-busy";
    const pending = "[data-fo-pending]";
    const closing = "data-fo-closing";
    const openMenu = "details[data-fo-menu][open]";
    let timer = 0;
    let touched = false;

    // Motion 10's close: hold the Menu open until its panel's transition ends.
    const close = (menu: HTMLDetailsElement): void => {
      if (menu.hasAttribute(closing)) return;
      menu.setAttribute(closing, "");
      void Promise.allSettled(
        (
          menu.querySelector("[data-fo-menu-panel]")?.getAnimations?.() ?? []
        ).map((animation) => animation.finished),
      ).then(() => {
        menu.open = false;
        menu.removeAttribute(closing);
      });
    };

    d.addEventListener("click", (event) => {
      const target = event.target as Element;
      const summary = target.closest?.("details[data-fo-menu][open]>summary");
      if (summary) {
        event.preventDefault();
        close(summary.parentElement as HTMLDetailsElement);
        return;
      }
      const scrim = target.closest?.("[data-fo-menu-scrim]");
      if (scrim) {
        close(scrim.parentElement as HTMLDetailsElement);
        return;
      }
      const link = target.closest?.("a");
      // Send flowers: the Menu closes; on the home, the letter comes in under the header and its
      // first choice takes focus (with its ring) rather than the page jumping to the anchor.
      if (link?.hash === "#send") {
        for (const menu of d.querySelectorAll<HTMLDetailsElement>(openMenu)) {
          close(menu);
        }
        const form =
          link.pathname === here.pathname && d.getElementById("send");
        if (form) {
          event.preventDefault();
          const card = form.closest("[data-fo-hero-card]");
          const letter =
            card && getComputedStyle(card).display !== "contents" ? card : form;
          const header = d.querySelector("[data-fo-header]");
          const under =
            header && getComputedStyle(header).position === "sticky"
              ? header.getBoundingClientRect().height
              : 0;
          scrollTo({
            top: scrollY + letter.getBoundingClientRect().top - under - 16,
          });
          form.querySelector<HTMLElement>("select,input,button")?.focus({
            preventScroll: true,
            focusVisible: true,
          } as FocusOptions);
          return;
        }
      }
      if (
        !link ||
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.defaultPrevented ||
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download") ||
        link.origin !== here.origin ||
        (link.hash &&
          link.pathname === here.pathname &&
          link.search === here.search)
      ) {
        return;
      }
      if (link.matches(pending)) {
        setTimeout(() => {
          link.setAttribute(busy, "true");
          link.setAttribute("aria-disabled", "true");
        });
        return;
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        root.setAttribute("data-fo-nav", "pending");
      }, 150);
    });

    d.addEventListener("submit", (event) => {
      const button = (event.target as Element).querySelector(
        `button${pending}`,
      );
      if (button && !event.defaultPrevented) {
        setTimeout(() => {
          button.setAttribute(busy, "true");
          button.setAttribute("disabled", "");
        });
      }
    });

    addEventListener("pageshow", () => {
      clearTimeout(timer);
      root.removeAttribute("data-fo-nav");
      for (const action of d.querySelectorAll(pending)) {
        action.removeAttribute(busy);
        action.removeAttribute(
          action.tagName === "A" ? "aria-disabled" : "disabled",
        );
      }
    });

    d.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        for (const menu of d.querySelectorAll<HTMLDetailsElement>(openMenu)) {
          close(menu);
          menu.querySelector("summary")?.focus();
        }
      }
      // Focus stays inside the open Menu and its summary (WCAG 2.4.3); `Esc` above always leaves.
      const menu = d.querySelector(`${openMenu}:not([${closing}])`);
      if (event.key === "Tab" && menu) {
        const stops = [
          ...menu.querySelectorAll<HTMLElement>(
            "summary,a[href],button,select,input",
          ),
        ].filter((stop) => stop.getClientRects().length);
        const active = d.activeElement;
        const edge = event.shiftKey ? stops[0] : stops.at(-1);
        if (stops.length && (!menu.contains(active) || active === edge)) {
          event.preventDefault();
          (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
        }
      }
    });

    const sentence = d.querySelector("form[data-fo-sentence]");
    if (sentence) {
      for (const type of ["pointerdown", "focusin", "keydown"]) {
        sentence.addEventListener(type, () => (touched = true));
      }
      setTimeout(() => {
        if (!touched) sentence.setAttribute("data-fo-shimmer", "");
      }, 800);
    }

    root.setAttribute("data-fo-motion", "");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-fo-reveal", "in");
          observer.unobserve(entry.target);
        }
      }
    });
    for (const element of d.querySelectorAll(
      "[data-fo-reveal],img[data-fo-fade]",
    )) {
      if (
        element.getBoundingClientRect().top < fold ||
        (element as HTMLImageElement).complete
      ) {
        continue;
      }
      if (element.tagName === "IMG") {
        element.setAttribute("data-fo-fade", "pending");
        const show = (): void => element.setAttribute("data-fo-fade", "in");
        element.addEventListener("load", show);
        element.addEventListener("error", show);
      } else {
        element.setAttribute("data-fo-reveal", "pending");
        observer.observe(element);
      }
    }
  }, []);
  return null;
}
