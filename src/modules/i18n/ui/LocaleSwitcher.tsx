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
 * `betaLocales` implements the `plan/03` §6 5 % rule (TASK-039). It **defaults** to
 * `localeBetaTag()` over the live locales, so no page has to compute the share and adding a
 * locale stays a data change (AC-31): a fifth locale with no catalogue appears here marked beta
 * with no edit under `src/app/`. The prop stays for the caller that legitimately knows better —
 * spec 012's translation admin previewing a locale it has just reviewed — and because
 * `unreviewedShare()` reads repo JSON that a Postgres overlay may later contradict.
 *
 * The marker sits **outside** the link and carries the page's own language on purpose: inside the
 * `lang`-annotated link a screen reader would pronounce the English word "Beta" in German, which
 * is the pronunciation bug the `lang`/`hrefLang` pair exists to avoid (WCAG 3.1.2). It is text,
 * never a colour or a shape, so it survives spec 004's styling pass and needs no icon.
 */
import { useTranslations } from "next-intl";

import { localeBetaTag } from "../review.ts";
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
   * Locales to mark as machine-drafted ("beta", `plan/03` §6). Defaults to the live locales whose
   * unreviewed share is above the 5 % threshold, computed by `localeBetaTag()`.
   */
  betaLocales?: readonly string[];
}

export function LocaleSwitcher({
  locale,
  pageType = "home",
  betaLocales,
}: LocaleSwitcherProps) {
  const t = useTranslations("a11y");
  const common = useTranslations("common");
  const locales = launchLocales();
  const beta = new Set(
    betaLocales ??
      locales
        .filter((target) => localeBetaTag(target.code))
        .map((target) => target.code),
  );

  return (
    <nav aria-label={t("localeSwitcher")}>
      <ul>
        {locales.map((target) => (
          <li key={target.code}>
            {target.code === locale ? (
              <span aria-current="page" lang={target.bcp47}>
                {target.nativeName}
              </span>
            ) : (
              <a
                className="underline"
                href={localePath(target.code, pageType)}
                lang={target.bcp47}
                hrefLang={target.bcp47}
              >
                {target.nativeName}
              </a>
            )}
            {beta.has(target.code) ? (
              // `ms-1` (logical, `fo/no-physical-css`-clean) rather than a literal space: a JSX
              // text node next to an expression makes React emit a `<!-- -->` separator into the
              // streamed HTML, which a text assertion in an e2e or a11y suite then has to know
              // about. Spacing is presentation; spec 004 restyles it without touching the markup.
              <span className="ms-1" data-beta="true">
                {common("beta")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
