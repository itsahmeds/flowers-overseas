/**
 * Locale switcher (spec 003 §2 "Header locale switcher", §5.3, §6 "Internal links", §8
 * "Accessibility"; TASK-035).
 *
 * Four plain links — nothing else. No `"use client"`, no state, no JavaScript: switching locale is
 * a navigation, so it works with scripting disabled and it is crawlable, which is what gives every
 * locale root a link from every other locale root (`plan/02` §11 and the whole Phase 0
 * internal-link graph, §6). ADR-0006 lives here in its positive form: the user chooses by
 * following a link to a real URL, and no response ever chooses for them.
 *
 * Why in `src/modules/i18n/` and not under `src/app/[locale]/_components/`: `plan/01` §5 keeps
 * `app/` to "routes only; thin", and from spec 004 onward this component is rendered by the header
 * of every localised page, not by one route. It is exported from the module barrel (AC-3 allows
 * functions and types; a Server Component is a function and carries no configuration).
 *
 * Accessibility (§8):
 *
 *  - Each link declares the language it leads to with `lang` **and** `hrefLang`, so a screen
 *    reader pronounces "Deutsch" in German rather than in the page's language (WCAG 3.1.2
 *    Language of Parts). The visible label is the locale's `nativeName` — a language name, never a
 *    country flag (`plan/03` §2).
 *  - The current locale is not a link. It renders as a `<span aria-current="page">` carrying the
 *    same `lang`, which is the "current-locale disabled" state of §5.3 without the trap of a
 *    disabled interactive element.
 *  - The `<nav>` has an accessible name from the `a11y` namespace, because a page may hold several
 *    navigation landmarks from spec 004 onward. `useTranslations` rather than
 *    `await getTranslations()` keeps the component **synchronous**: an `async` component cannot be
 *    rendered inside another component by `react-dom/server`, and a switcher that only a browser
 *    could render would not be unit-testable at the layer that proves the `aria-current` and
 *    `hreflang` contract. next-intl resolves it from the request locale on the server and from the
 *    provider on the client, so the same file serves spec 004's header wherever it mounts it.
 *
 * The only styling is `underline` on the links: Tailwind's preflight resets `text-decoration` on
 * `<a>`, and a link indistinguishable from surrounding text is a usability failure rather than a
 * neutral default. It is direction-agnostic, so `fo/no-physical-css` is satisfied and spec 004's
 * header styling has nothing to unpick (§13 Q3).
 *
 * `betaLocales` is the typed seam for the `plan/03` §6 5 % rule: `localeBetaTag()` and
 * `unreviewedShare()` arrive with TASK-039, and the marker is rendered then. It is accepted and
 * deliberately unread here so that the callers TASK-039 touches are the ones that *compute* the
 * share, not every page that renders a switcher.
 */
import { useTranslations } from "next-intl";

import { type PageType, launchLocales, localePath } from "../routing.ts";

export interface LocaleSwitcherProps {
  /** The locale of the page the switcher is rendered on; it is the one entry that is not a link. */
  locale: string;
  /**
   * The page the sibling links point at, in each locale's own path segments. Defaults to the
   * locale home, which is the only page type that exists in Phase 0 (§5.3 "falling back to the
   * locale home").
   */
  pageType?: PageType;
  /**
   * Locales to mark as machine-drafted ("beta", `plan/03` §6). Typed here, rendered by TASK-039
   * once `unreviewedShare()` exists; passing it today changes nothing.
   */
  betaLocales?: readonly string[];
}

export function LocaleSwitcher({
  locale,
  pageType = "home",
}: LocaleSwitcherProps) {
  const t = useTranslations("a11y");

  return (
    <nav aria-label={t("localeSwitcher")}>
      <ul>
        {launchLocales().map((target) =>
          target.code === locale ? (
            <li key={target.code}>
              <span aria-current="page" lang={target.bcp47}>
                {target.nativeName}
              </span>
            </li>
          ) : (
            <li key={target.code}>
              <a
                className="underline"
                href={localePath(target.code, pageType)}
                lang={target.bcp47}
                hrefLang={target.bcp47}
              >
                {target.nativeName}
              </a>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
