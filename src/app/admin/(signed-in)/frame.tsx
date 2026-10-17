/**
 * @purpose The admin shell around a signed-in page: navigation for the role, the person, sign-out (spec 012 §5.3)
 */
import type { ReactElement, ReactNode } from "react";

import type { AdminSession } from "@/lib/auth/admin";
import { type AdminNavItem, adminNavFor, adminT } from "@/modules/admin";
import { AdminShell } from "@/modules/ui";

import { adminEnvironment } from "../environment";

export function AdminFrame({
  session,
  current,
  children,
}: {
  readonly session: AdminSession;
  readonly current: AdminNavItem["key"];
  readonly children: ReactNode;
}): ReactElement {
  const env = adminEnvironment();
  const roles = session.roles.map((role) => adminT(`admin.roles.${role}`));
  return (
    <AdminShell
      brand={adminT("admin.shell.brand")}
      product={adminT("admin.shell.product")}
      environment={env.environment}
      environmentLabel={env.label}
      navLabel={adminT("admin.shell.navLabel")}
      menuLabel={adminT("admin.shell.menu")}
      nav={adminNavFor(session.roles).map((item) => ({
        href: item.href,
        label: adminT(`admin.nav.${item.key}`),
        current: item.key === current,
      }))}
      personName={session.displayName}
      personLine={adminT("admin.shell.signedInAs", {
        roles: roles.join(", "),
        timeZone: session.timeZone,
      })}
      signOutLabel={adminT("admin.shell.signOut")}
      signOutAction="/admin/api/auth/sign-out"
    >
      {children}
    </AdminShell>
  );
}
