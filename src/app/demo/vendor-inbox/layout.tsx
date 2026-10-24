/**
 * @purpose Florist document: the member's language, noindex
 * @spec 011
 *
 * The florist surface's own document (spec 011 §5.3, §5.4, §7; TASK-212): `<html lang>` in the
 * member's `partner_member.locale_code`, or `?hl=` before sign-in; `noindex,nofollow` on every
 * document (the header half is `floristHeaderRules()` in `next.config.ts`); rendered per request.
 * No analytics, no consent island, no client script of the public site (§8 "Consent and
 * cookies"). In `production` the proxy answers 404 before this renders (§13 Q4).
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { fontVariables } from "@/modules/ui";

import { currentFloristLanguage } from "./request";

import "../../globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: "noindex,nofollow",
  referrer: "no-referrer",
};

export default async function FloristLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const language = await currentFloristLanguage();
  return (
    <html lang={language} className={fontVariables}>
      <body className="bg-paper text-ink min-h-dvh">{children}</body>
    </html>
  );
}
