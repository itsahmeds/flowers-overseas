/**
 * @purpose 404 inside admin: no data, noindex (spec 012 §5.3)
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import { AdminSignInCard, AdminSignInTitle, Button } from "@/modules/ui";

export default function AdminNotFound(): ReactElement {
  return (
    <AdminSignInCard>
      <AdminSignInTitle>
        {adminT("admin.errors.notFoundTitle")}
      </AdminSignInTitle>
      <p className="text-ink-2">{adminT("admin.errors.notFoundBody")}</p>
      <Button href="/admin" variant="secondary">
        {adminT("admin.errors.backHome")}
      </Button>
    </AdminSignInCard>
  );
}
