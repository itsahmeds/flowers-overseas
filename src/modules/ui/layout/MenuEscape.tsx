"use client";

/**
 * `MenuEscape` — the one piece of JavaScript the phone Menu has (spec 004 §14 A24 clause 3,
 * AC-47; TASK-195).
 *
 * The Menu is a native `<details>`/`<summary>` (`./MenuSheet.tsx`), so it opens and closes with
 * JavaScript off. A disclosure has no `Esc` of its own, and AC-47 asks for one with JavaScript on:
 * `Esc` closes every open Menu and returns focus to its summary. This island renders **nothing**
 * (`null`), so the header's box is the same before and after hydration (AC-7), and it is one
 * document listener, a few hundred bytes inside the client budget (AC-25), rather than a module of
 * its own.
 */
import { useEffect } from "react";

/**
 * The attribute `MenuSheet` writes on its `<details>`. Not exported: a server component that
 * imported it from this `"use client"` module would receive a client reference, not the string.
 */
const MENU_ATTRIBUTE = "data-fo-menu";

export function MenuEscape(): null {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const open = document.querySelectorAll<HTMLDetailsElement>(
        `details[${MENU_ATTRIBUTE}][open]`,
      );
      for (const menu of open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
