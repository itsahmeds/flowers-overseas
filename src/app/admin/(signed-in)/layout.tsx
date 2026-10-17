/**
 * @purpose The signed-in admin group: no session redirects to /admin/sign-in (spec 012 §2.2, AC-1)
 *
 * Decided by session state, never by location (ADR-0006 is about geography; `src/proxy.ts` stays
 * redirect-free). Every page in the group calls the guard again, so a page never renders data on
 * the strength of the layout alone.
 */
import type { ReactNode } from "react";

import { requireAdminPage } from "@/modules/admin";

export default async function SignedInLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  await requireAdminPage();
  return children;
}
