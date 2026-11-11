/**
 * @purpose Signed-in admin shell: nav, person, sign-out, and spec 012b's backup warning
 * @spec 012
 *
 * `backupWarning` (spec 012b AC-29): the catalogue, photos, countries and publish pages pass
 * `await catalogueBackupWarning()`; true puts the warning above the page's own content.
 */
import type { ReactElement, ReactNode } from "react";

import type { AdminSession } from "@/lib/auth/admin";
import { type AdminNavItem, adminNavFor, adminT } from "@/modules/admin";
import { AdminShell } from "@/modules/ui/admin/AdminChrome";
import { AdminBanner } from "@/modules/ui/admin/AdminRecord";

import { adminEnvironment } from "../environment";

export function AdminFrame({
  session,
  current,
  backupWarning = false,
  children,
}: {
  readonly session: AdminSession;
  readonly current: AdminNavItem["key"];
  readonly backupWarning?: boolean;
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
      {backupWarning ? (
        <div className="mb-[16px]" data-backup-warning="">
          <AdminBanner tone="warn">
            <b>{adminT("admin.catalogue.backupWarning.title")}</b>
            <span>{adminT("admin.catalogue.backupWarning.body")}</span>
          </AdminBanner>
        </div>
      ) : null}
      {children}
    </AdminShell>
  );
}
