/**
 * @purpose Admin 404, noindex
 * @spec 012
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import {
  AdminSignInCard,
  AdminSignInTitle,
} from "@/modules/ui/admin/AdminChrome";
import { Button } from "@/modules/ui";

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
