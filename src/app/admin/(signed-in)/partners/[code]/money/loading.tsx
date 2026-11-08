/**
 * @purpose The florist Money tab's loading state: a line, no figure drawn (030b §5.3)
 * @spec 030b
 *
 * The route's loading skeleton (orchestrator ruling on the artboard, 2026-10-23): nothing is
 * read here, so nothing can show before the server has read it.
 */
import type { ReactElement } from "react";

import { adminT } from "@/modules/admin";

export default function PartnerTabLoading(): ReactElement {
  return (
    <div className="grid gap-[16px] p-[16px] md:p-[24px]">
      <p role="status" className="text-ink-2 m-0 text-[14px]">
        {adminT("admin.partners.money.loading")}
      </p>
    </div>
  );
}
