/**
 * The payout statement's PDF for the `payouts.statement_email` job (spec 030a §5.2, AC-21;
 * TASK-365): the worker (`src/jobs/handlers.ts`) hands it to `runStatementEmailJob`, so neither
 * barrel carries the statement's copy or PDFKit. The renderer loads on the first call.
 */
import type { FloristLanguage } from "@/config/florists";
import type { OrderExecutor } from "@/modules/orders";

/** The sent payout's statement PDF in `language`, read through `executor`'s transaction. */
export async function payoutStatementPdf(
  executor: OrderExecutor,
  payoutId: string,
  language: FloristLanguage,
): Promise<Uint8Array> {
  const { loadPayoutStatementView } = await import("./payout-statement");
  const { renderPayoutStatementPdf } = await import("./payout-statement-pdf");
  return renderPayoutStatementPdf(
    await loadPayoutStatementView(executor, payoutId, language),
  );
}
