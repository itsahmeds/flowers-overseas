/**
 * @purpose 401 inside admin: no data, noindex, a way back to sign-in (spec 012 §5.3, AC-1)
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import { AdminSignInCard, AdminSignInTitle, Button } from "@/modules/ui";

export default function AdminUnauthorized(): ReactElement {
  return (
    <AdminSignInCard>
      <AdminSignInTitle>
        {adminT("admin.errors.unauthorizedTitle")}
      </AdminSignInTitle>
      <p className="text-ink-2">{adminT("admin.errors.unauthorizedBody")}</p>
      <Button href="/admin/sign-in">
        {adminT("admin.signIn.signInAgain")}
      </Button>
    </AdminSignInCard>
  );
}
