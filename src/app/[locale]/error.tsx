"use client";

import { useTranslations } from "next-intl";

/**
 * Localised 500 boundary (spec 003 §5.3; TASK-034).
 *
 * A Next error boundary must be a Client Component, which is why `[locale]/layout.tsx` wraps its
 * children in `NextIntlClientProvider` with the `localeDocument` namespace subset: the copy here
 * comes from that subset (`errors`), not from a second catalogue and not from a literal string
 * (`fo/no-literal-strings`, AC-26). The correct status code is Next's own (spec 001 T-16).
 *
 * `reset` is offered as a button because the boundary now has a translated label for it.
 */
export default function LocaleError({ reset }: { reset: () => void }) {
  const t = useTranslations("errors");

  return (
    <main id="main">
      <h1>{t("serverError.heading")}</h1>
      <p>{t("serverError.body")}</p>
      <button type="button" onClick={reset}>
        {t("serverError.retry")}
      </button>
    </main>
  );
}
