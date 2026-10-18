/**
 * @purpose 403 inside admin: no data, noindex (spec 012 §5.3)
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import {
  AdminSignInCard,
  AdminSignInTitle,
} from "@/modules/ui/admin/AdminChrome";
import { Button } from "@/modules/ui";

export default function AdminForbidden(): ReactElement {
  return (
    <AdminSignInCard>
      <AdminSignInTitle>
        {adminT("admin.errors.forbiddenTitle")}
      </AdminSignInTitle>
      <p className="text-ink-2">{adminT("admin.errors.forbiddenBody")}</p>
      <Button href="/admin" variant="secondary">
        {adminT("admin.errors.backHome")}
      </Button>
    </AdminSignInCard>
  );
}
