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
 *  - **Motion 3, the pending button.** On a form's submit, its `data-fo-pending` button takes
 *    `aria-busy="true"` and `disabled` in the next task (the submission has already read the form
 *    by then), and both come off on `pageshow`, when the back/forward cache brings the page back.
 *  - **Motion 4, the sentence's shimmer.** 800 ms after load, once, unless the form was touched.
 *  - **Motion 10's `Esc`** for the phone Menu (spec 004 AC-47; was `MenuEscape`, TASK-195): closes
 *    every open Menu and returns focus to its summary.
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
    const pending = "button[data-fo-pending]";
    let timer = 0;
    let touched = false;

    d.addEventListener("click", (event) => {
      const link = (event.target as Element).closest?.("a");
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
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        root.setAttribute("data-fo-nav", "pending");
      }, 150);
    });

    d.addEventListener("submit", (event) => {
      const button = (event.target as Element).querySelector(pending);
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
      for (const button of d.querySelectorAll(pending)) {
        button.removeAttribute(busy);
        button.removeAttribute("disabled");
      }
    });

    d.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        for (const menu of d.querySelectorAll<HTMLDetailsElement>(
          "details[data-fo-menu][open]",
        )) {
          menu.open = false;
          menu.querySelector("summary")?.focus();
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
