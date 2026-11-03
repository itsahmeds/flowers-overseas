/**
 * The buyer templates B1 to B6 and B8, plugged into the pipeline's template registry (spec 016
 * §5.2; `../templates.ts`; TASK-333).
 *
 * Each renderer reads its facts at send time through the delivery's transaction, in the buyer's
 * locale (`input.locale`: `purchase.locale_code` for B1, `order.locale_code` for the rest), and
 * renders. The sources a template cannot read itself (the succeeded refunds, which live behind the
 * `payments` module, and the photo's bytes in the private bucket) are handed in by the worker
 * (`src/jobs/handlers.ts`), so nothing a page imports reaches them. Registration is idempotent.
 */
import {
  type NotificationRenderInput,
  notificationTemplate,
  registerNotificationTemplate,
  type RenderedNotification,
} from "../templates";

import {
  BUYER_TEMPLATES,
  type BuyerTemplate,
  renderBeingMade,
  renderCancelled,
  renderCreditNote,
  renderDeliveredPhoto,
  renderOrderReceived,
  renderOutForDelivery,
  renderRefund,
} from "./buyer";
import {
  type BuyerFactSources,
  EmailFactsMissing,
  buyerLocaleOf,
  loadBuyerOrderFacts,
  loadCancelledFacts,
  loadDeliveredFacts,
  loadDocumentFacts,
  loadPurchaseFacts,
  loadRefundFacts,
} from "./buyer-facts";

function orderOf(input: NotificationRenderInput): string {
  if (input.orderId === null) {
    throw new EmailFactsMissing(`${input.template} has no order`);
  }
  return input.orderId;
}

/** Renders one buyer template for the buyer of one delivery. */
export async function renderBuyerNotification(
  template: BuyerTemplate,
  input: NotificationRenderInput,
  sources: BuyerFactSources,
): Promise<RenderedNotification> {
  const locale = buyerLocaleOf(input.locale);
  const { executor } = input;
  switch (template) {
    case "order-received": {
      if (input.purchaseId === null) {
        throw new EmailFactsMissing("order-received has no purchase");
      }
      return renderOrderReceived(
        await loadPurchaseFacts(executor, input.purchaseId, locale, sources),
        locale,
      );
    }
    case "being-made":
      return renderBeingMade(
        await loadBuyerOrderFacts(executor, orderOf(input), locale, sources),
        locale,
      );
    case "out-for-delivery":
      return renderOutForDelivery(
        await loadBuyerOrderFacts(executor, orderOf(input), locale, sources),
        locale,
      );
    case "delivered-photo":
      return renderDeliveredPhoto(
        await loadDeliveredFacts(executor, orderOf(input), locale, sources),
        locale,
      );
    case "cancelled":
      return renderCancelled(
        await loadCancelledFacts(executor, orderOf(input), locale, sources),
        locale,
      );
    case "refund":
      return renderRefund(
        await loadRefundFacts(executor, orderOf(input), locale, sources),
        locale,
      );
    case "credit-note": {
      if (input.invoiceId === null) {
        throw new EmailFactsMissing("credit-note has no document");
      }
      return renderCreditNote(
        await loadDocumentFacts(executor, input.invoiceId, sources),
        locale,
      );
    }
  }
}

/** Registers B1 to B6 and B8 with the pipeline, once. */
export function registerBuyerEmailTemplates(sources: BuyerFactSources): void {
  for (const template of BUYER_TEMPLATES) {
    if (notificationTemplate(template) !== undefined) continue;
    registerNotificationTemplate(template, (input) =>
      renderBuyerNotification(template, input, sources),
    );
  }
}
