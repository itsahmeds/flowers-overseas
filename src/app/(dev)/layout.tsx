import type { Metadata } from "next";
import type { ReactNode } from "react";

import { documentFallbackLocale } from "@/modules/i18n";
import { fontVariables } from "@/modules/ui";

import "../globals.css";

/**
 * Document layout for the `(dev)` route group — today only `/dev/components` (spec 004 §2
 * "Component gallery", §13 Q10, AC-28; TASK-045).
 *
 * A fourth document layout next to `(chooser)`, `[locale]` and `not-found.tsx`, for the same
 * reason they exist: the app-root layout renders no document (see `src/app/layout.tsx`), so
 * whichever leaf knows the language renders `<html>`/`<body>` itself. The gallery has no locale of
 * its own — it renders components, not copy — so its language is the **x-default locale from the
 * registry**, exactly as `/` and the 404 do, and no locale literal is introduced (spec 003 AC-6).
 *
 * `noindex,nofollow` is inherited from the pass-through root layout and restated on the page with
 * the reason. The route's *existence* is gated by `ENABLE_DEV_UI` in `page.tsx`, and the env
 * schema refuses that flag in production (`src/lib/env.schema.ts`), so this document cannot be
 * served from the production alias at all.
 *
 * No `NextIntlClientProvider` and no client island: the gallery is server-rendered HTML, which is
 * what lets it be the visual-regression and axe surface for every component state without adding
 * a byte of client JavaScript to the measurement.
 */
export const metadata: Metadata = { robots: "noindex,nofollow" };

export default function DevLayout({ children }: { children: ReactNode }) {
  const locale = documentFallbackLocale();
  return (
    <html lang={locale.bcp47} dir={locale.dir} className={fontVariables}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
