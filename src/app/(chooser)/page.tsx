import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { COMPANY } from "@/config/company";
import {
  documentFallbackLocale,
  launchLocales,
  localePath,
} from "@/modules/i18n";
// Deep import, not the `@/modules/ui` barrel, for the reason `./layout.tsx` deep-imports
// `@/modules/ui/fonts`: the barrel re-exports the module's client islands, and a route whose
// module graph reaches them downloads them. `/` reaches no client module at all, and this is how
// it stays that way (`tests/unit/client-js-budget.test.ts`, AC-7, AC-27).
import { NoticeDocument } from "@/modules/ui/layout/NoticeDocument";
import {
  NOTICE_LOCALE_ITEM,
  NOTICE_LOCALE_LINK,
  NOTICE_LOCALE_LIST,
  NOTICE_LOCALE_NAME,
  NOTICE_LOCALE_PATH,
} from "@/modules/ui/layout/noticeShell";

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
 * application JS" this comment used to assert): **136 067 B gzipped / 116 393 B Brotli**, all of
 * it Next 16.3.4's own client runtime and route shells — react-dom 62 564 B, the App Router
 * runtime 39 763 B, ~13.5 KB of bootstrap (TASK-046 measured it with a browser against
 * `pnpm build && pnpm start`). Until TASK-046 it was 226 575 B gz / 190 706 B br, because the
 * module graph of `src/app/global-error.tsx` — the root error boundary, which Next requires to be
 * a Client Component and attaches to every document, `/` included — reached the message
 * catalogue's schema and therefore zod; the 500 document now reads plain constants
 * (`docs/architecture.md` §2). This route group contributes no client component at all; that is
 * the part AC-7 and AC-27 can hold, and it is asserted rather than described
 * (`tests/unit/client-js-budget.test.ts`). `pnpm budget:client-js` prints the number per chunk,
 * lazily fetched route chunks included.
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
 * **Visual design (spec 004 AC-12; TASK-055).** The document is `NoticeDocument` — the centred
 * `--measure` column, the masthead's lockup at the masthead's own metrics and the `.display`
 * heading that the 404 and the two 500 documents also render, so the four pages a visitor can
 * reach without a locale read as one site. The locale list is the bordered two-column grid of
 * `docs/design/wireframes/locale-chooser-desktop.dc.html`, with each locale's own name in the
 * `.display` voice and the path it leads to in the `.label` voice. The wireframe's masthead,
 * category row and colophon are deliberately **not** here: the footer's cookie-settings control is
 * a client island, the category row needs a locale, and `/` may reach neither (AC-7, AC-27).
 * Nothing else moved — the markup is still four `<a href>`s in a named `<nav>`, each declaring its
 * target language, and the `underline` class is gone only because the rows are now visibly rows.
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
    <NoticeDocument
      body={t("intro")}
      heading={t("heading")}
      wordmark={COMPANY.tradingName}
    >
      <nav aria-label={a11y("localeChooser")}>
        <ul className={NOTICE_LOCALE_LIST}>
          {launchLocales().map((target) => {
            const href = localePath(target.code, "home");
            return (
              <li className={NOTICE_LOCALE_ITEM} key={target.code}>
                <a
                  className={NOTICE_LOCALE_LINK}
                  href={href}
                  lang={target.bcp47}
                  hrefLang={target.bcp47}
                >
                  <span className={NOTICE_LOCALE_NAME}>
                    {target.nativeName}
                  </span>
                  {/* The URL the link goes to, in the `.label` voice — the wireframe's `<code>/en</code>`
                      column. A path is not copy, so it needs no message key and no translation; it is
                      isolated with `<bdi>` so an RTL document cannot reorder it
                      (`docs/runbooks/i18n-translations.md`). */}
                  <bdi className={NOTICE_LOCALE_PATH}>{href}</bdi>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </NoticeDocument>
  );
}
