/**
 * @purpose Admin 401, noindex (AC-1)
 * @spec 012
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import {
  AdminSignInCard,
  AdminSignInTitle,
} from "@/modules/ui/admin/AdminChrome";
import { Button } from "@/modules/ui";

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
