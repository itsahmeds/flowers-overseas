/**
 * @purpose The finance overview's loading state: the heading and a line, no digit drawn (030b §5.3)
 * @spec 030b
 *
 * The route's loading skeleton (orchestrator ruling on the artboard, 2026-10-23): nothing is
 * read here, so no figure can show before the server has computed it.
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";
import { AdminPageTitle } from "@/modules/ui/admin/AdminChrome";

export default function FinanceLoading(): ReactElement {
  return (
    <div className="grid gap-[16px] p-[16px] md:p-[24px]">
      <AdminPageTitle>{adminT("admin.finance.title")}</AdminPageTitle>
      <p role="status" className="text-ink-2 m-0 text-[14px]">
        {adminT("admin.finance.loading")}
      </p>
    </div>
  );
}
