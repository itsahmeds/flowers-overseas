"use client";

/**
 * `MotionIsland` — the one client module the approved motions need (spec 004 §14 A24 clause 9 (d),
 * AC-44, AC-25; TASK-194; `docs/design/system/motion.dc.html`).
 *
 * It renders nothing (`null`, so the header that mounts it keeps its server box, AC-7), adds no
 * dependency and only toggles attributes: every motion itself is CSS in `src/app/globals.css`.
 *
 *  - **Motion 1, the route-loading bloom.** A click that starts a navigation of this tab to another
 *    page of the site (`startsNavigation`) arms a 150 ms timer; if the next document has not
 *    replaced this one by then, `<html data-fo-nav="pending">` draws the header logo's bloom and the
 *    2 px bar. The server's HTML never carries it, so no first load, reload, JavaScript-off load or
 *    `?page=2` response paints a loader (A24 clause 9 (f)).
 *  - **Motion 3, the pending button.** On a form's submit, its `pending` button takes
 *    `aria-busy="true"` and `disabled` in the next task (so the submission itself has already read
 *    the form), and both come off on `pageshow`, when the back/forward cache brings the page back.
 *  - **Motion 4, the sentence's shimmer.** 800 ms after load, once, if nobody has touched the
 *    form.
 *  - **Motion 11 and 12, image fade-in and sections fading up.** `<html data-fo-motion>` first;
 *    then only sections and lazy images whose top is at or below the first viewport's foot take
 *    their hidden start state, and an observer plays each once. Nothing in the first viewport is
 *    ever hidden, and without JavaScript nothing is.
 *
 * With `prefers-reduced-motion: reduce` it still sets `aria-busy`/`disabled` (a state, not a
 * motion) and nothing else: no bloom, no shimmer, no hidden start state.
 */
import { useEffect } from "react";

import {
  FADE_ATTRIBUTE,
  MOTION_ROOT_ATTRIBUTE,
  NAV_ATTRIBUTE,
  NAV_DELAY_MS,
  NAV_PENDING,
  PENDING_BUTTON_SELECTOR,
  REVEAL_ATTRIBUTE,
  SENTENCE_SELECTOR,
  SHIMMER_ATTRIBUTE,
  SHIMMER_DELAY_MS,
  startsBelowFold,
  startsNavigation,
} from "./motion-model.ts";

function onPendingSubmit(event: SubmitEvent): void {
  if (event.defaultPrevented) return;
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const submitter = event.submitter;
  const button =
    submitter instanceof HTMLButtonElement &&
    submitter.matches(PENDING_BUTTON_SELECTOR)
      ? submitter
      : form.querySelector<HTMLButtonElement>(PENDING_BUTTON_SELECTOR);
  if (button === null) return;
  // After the submission has built its form data: a disabled submitter is left out of it.
  window.setTimeout(() => {
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
  }, 0);
}

function releasePending(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    PENDING_BUTTON_SELECTOR,
  )) {
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
}

export function MotionIsland(): null {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers: number[] = [];
    let navTimer = 0;

    const onClick = (event: MouseEvent): void => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      const facts = {
        button: event.button,
        defaultPrevented: event.defaultPrevented,
        modified:
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        href: anchor?.href ?? null,
        target: anchor?.target ?? "",
        download: anchor?.hasAttribute("download") ?? false,
      };
      if (reduced || !startsNavigation(facts, window.location.href)) return;
      window.clearTimeout(navTimer);
      navTimer = window.setTimeout(() => {
        root.setAttribute(NAV_ATTRIBUTE, NAV_PENDING);
      }, NAV_DELAY_MS);
    };

    const onPageShow = (): void => {
      // The back/forward cache restores this page as it was left: no loader, no busy button.
      window.clearTimeout(navTimer);
      root.removeAttribute(NAV_ATTRIBUTE);
      releasePending();
    };

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onPendingSubmit);
    window.addEventListener("pageshow", onPageShow);

    let observer: IntersectionObserver | undefined;
    if (!reduced) {
      root.setAttribute(MOTION_ROOT_ATTRIBUTE, "");

      const sentence = document.querySelector(SENTENCE_SELECTOR);
      if (sentence !== null) {
        let touched = false;
        const touch = (): void => {
          touched = true;
        };
        for (const type of ["pointerdown", "focusin", "keydown", "input"]) {
          sentence.addEventListener(type, touch, { once: true });
        }
        timers.push(
          window.setTimeout(() => {
            if (!touched) sentence.setAttribute(SHIMMER_ATTRIBUTE, "");
          }, SHIMMER_DELAY_MS),
        );
      }

      if ("IntersectionObserver" in window) {
        const fold = window.innerHeight;
        observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.setAttribute(REVEAL_ATTRIBUTE, "in");
            observer?.unobserve(entry.target);
          }
        });
        for (const section of document.querySelectorAll(
          `[${REVEAL_ATTRIBUTE}]`,
        )) {
          if (!startsBelowFold(section.getBoundingClientRect().top, fold)) {
            continue;
          }
          section.setAttribute(REVEAL_ATTRIBUTE, "pending");
          observer.observe(section);
        }
        for (const image of document.querySelectorAll<HTMLImageElement>(
          `img[${FADE_ATTRIBUTE}]`,
        )) {
          if (image.complete) continue;
          if (!startsBelowFold(image.getBoundingClientRect().top, fold)) {
            continue;
          }
          image.setAttribute(FADE_ATTRIBUTE, "pending");
          const show = (): void => {
            image.setAttribute(FADE_ATTRIBUTE, "in");
          };
          image.addEventListener("load", show, { once: true });
          image.addEventListener("error", show, { once: true });
        }
      }
    }

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onPendingSubmit);
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(navTimer);
      for (const timer of timers) window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);
  return null;
}
