/**
 * @purpose The finance order list's loading state: the heading and a line, no digit drawn (030b §5.3)
 * @spec 030b
 *
 * The route's loading skeleton (orchestrator ruling on the artboard, 2026-10-23).
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";

export default function FinanceOrdersLoading(): ReactElement {
  return (
    <div className="grid gap-[16px] p-[16px] md:p-[24px]">
      <AdminPageTitle>{adminT("admin.finance.orders.title")}</AdminPageTitle>
      <p role="status" className="text-ink-2 m-0 text-[14px]">
        {adminT("admin.finance.orders.loading")}
      </p>
    </div>
  );
}
