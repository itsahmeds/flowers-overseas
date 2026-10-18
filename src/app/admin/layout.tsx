/**
 * @purpose Admin document: English, noindex (§5.3)
 * @spec 012
 *
 * Admin's own document layout (spec 012 §5.3; TASK-217): `lang` from the admin catalogue's locale
 * constant, `<meta name="robots" content="noindex,nofollow">` on every admin document (AC-5),
 * server-rendered per request (`no-store`), and no locale prefix (`plan/02` §4.1). The headers
 * half of AC-5 is `adminHeaderRules()` in `next.config.ts`.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ADMIN_LOCALE, adminT } from "@/modules/admin";
import { fontVariables } from "@/modules/ui";

import "../globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: adminT("admin.meta.title"),
  robots: "noindex,nofollow",
};

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang={ADMIN_LOCALE} className={fontVariables}>
      <body className="bg-paper text-ink min-h-dvh">{children}</body>
    </html>
  );
}
