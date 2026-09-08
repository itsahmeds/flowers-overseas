import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  documentFallbackLocale,
  launchLocales,
  localePath,
} from "@/modules/i18n";

/**
 * `/` — the locale chooser (spec 003 §2, §5.3, §5.4, §6, §13 Q3; AC-7, AC-25; TASK-035).
 *
 * The site's only non-localised URL and its only `follow` document in Phase 0. It exists to be
 * crawled through: four plain `<a href>`s put every locale root at crawl depth 1 (`plan/02` §7,
 * §11) while the chooser itself stays out of the index. `noindex,follow` overrides the
 * `noindex,nofollow` default the pass-through root layout gives every other document — and it is
 * the *only* document that overrides it until spec 007 lifts indexability by rule (§6, ADR-0007).
 *
 * **Rendering: SSG.** It depends on `src/config/locales.ts` and `messages/en.json` and on nothing
 * else — no request header, no cookie, no `Accept-Language`, no geo lookup, so the response is
 * byte-identical for every client, carries no `Vary`, sets no cookie and emits no `Location`
 * (AC-7, AC-9, AC-12, ADR-0006). Adding a locale is a data change: the list comes from the
 * registry (AC-31).
 *
 * **No JavaScript of its own.** No client component, no provider, no island: the copy is resolved
 * on the server and the links are links, so `/` works with scripting disabled (AC-7). The
 * locale-suggestion banner that TASK-041 adds is a `[locale]` concern; it never lands here,
 * because a visitor on `/` has not chosen anything yet.
 *
 * What `/` does still download is measured rather than claimed (TASK-043, correcting the "zero
 * application JS" this comment used to assert): **221.3 KB gzipped**, of which 130.1 KB is Next
 * 16.3.4's own client runtime and 91.1 KB is the module graph of `src/app/global-error.tsx` — the
 * root error boundary, which Next requires to be a Client Component and attaches to every
 * document, `/` included, and which needs the message catalogue to render a localised 500 page.
 * Most of that is zod, reached through the catalogue's own schema. This route group contributes
 * no client component at all; that is the part AC-7 and AC-27 can hold, and it is asserted rather
 * than described (`tests/unit/client-js-budget.test.ts`). `pnpm budget:client-js` prints the
 * number per chunk; spec 003 §14 A12 records the rest, including what it would take to get `/` to
 * 132.1 KB and why that decision is not this route's to take.
 *
 * Accessibility (§8): the document's language is the x-default locale (WCAG 3.1.1), the `<title>`
 * below is localised and non-empty (2.4.2 — this is the document that made the axe
 * `document-title` exception of TASK-008 die), and each link declares its target language with
 * `lang`/`hrefLang` so "Deutsch" is pronounced in German (3.1.2). Language names, never country
 * flags (`plan/03` §2).
 *
 * Deliberately **not** shipped: §7's third `chooser` key, a link `aria-label`. An English
 * accessible name on a link whose content is German would override the `lang`-declared native text
 * and defeat the 3.1.2 requirement AC-7 asks for, and an unused key fails `i18n:check` (TASK-040).
 * The `<nav>` takes its name from `a11y` instead, as §2 specifies.
 *
 * Visual design is spec 004's (§13 Q3): the markup here is semantic and all but unstyled, so
 * there is nothing for 004 to undo and no physical CSS to get wrong. The single exception is
 * `underline` on the links, because Tailwind's preflight resets `text-decoration` on `<a>` and a
 * link that is visually indistinguishable from body text is not "unstyled", it is unusable — and
 * `underline` is direction-agnostic, so `fo/no-physical-css` has nothing to object to.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = documentFallbackLocale();
  const t = await getTranslations({ locale: locale.code, namespace: "meta" });

  return {
    // The one deliberate `follow` in Phase 0 (§6; `plan/02` §7).
    robots: "noindex,follow",
    title: t("chooser.title"),
    description: t("chooser.description"),
  };
}

export default async function ChooserPage() {
  const locale = documentFallbackLocale();
  const t = await getTranslations({
    locale: locale.code,
    namespace: "chooser",
  });
  const a11y = await getTranslations({
    locale: locale.code,
    namespace: "a11y",
  });

  return (
    <main id="main">
      <h1>{t("heading")}</h1>
      <p>{t("intro")}</p>
      <nav aria-label={a11y("localeChooser")}>
        <ul>
          {launchLocales().map((target) => (
            <li key={target.code}>
              <a
                className="underline"
                href={localePath(target.code, "home")}
                lang={target.bcp47}
                hrefLang={target.bcp47}
              >
                {target.nativeName}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
