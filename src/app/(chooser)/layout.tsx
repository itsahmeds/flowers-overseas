import type { Metadata } from "next";
import type { ReactNode } from "react";

import { documentFallbackLocale } from "@/modules/i18n";

import "../globals.css";

/**
 * Root layout for the bare `/` (spec 003 §5.3 "Recommended file layout", AC-8; TASK-034).
 *
 * One of the three document layouts of the chosen shape (`docs/architecture.md` §2, and the
 * reasoning in `src/app/layout.tsx`): this group owns the single non-localised URL, `/`,
 * `src/app/[locale]/layout.tsx` owns everything with a locale prefix, and `src/app/not-found.tsx`
 * owns the 404. The app-root layout renders no document, so this one renders its own — and its
 * language is the **x-default locale read from the registry** (`plan/02` §3: `x-default` points at
 * `/en`) rather than the hard-coded English `lang` attribute spec 001 §7 left here for spec 003
 * to remove, so a database-backed locale set moves it too (AC-5). No `Accept-Language` is read anywhere (AC-9).
 *
 * Still no copy and no client provider here: the locale chooser's markup, its localised `<title>`
 * and the `noindex,follow` switch are TASK-035 (AC-7, AC-11, AC-25), which is also where the
 * `document-title` axe exception dies. Until then `/` keeps its spec 001 contract exactly — 200,
 * `noindex,nofollow`, no cookie, no script — so `tests/e2e/shell.spec.ts`, the axe exception list
 * and the committed visual baseline stay true.
 */
export const metadata: Metadata = { robots: "noindex,nofollow" };

export default function ChooserLayout({ children }: { children: ReactNode }) {
  const locale = documentFallbackLocale();
  return (
    <html lang={locale.bcp47} dir={locale.dir}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
