/**
 * T16 `tracking_link`, the lookup's answer (spec 018 §5.2 "Emails", §7 `emails.account`; AC-8,
 * AC-39's T16 half; TASK-339).
 *
 * The buyer asked for the link on `/{locale}/track` with the order's reference and email; this is
 * what the order's own address receives, in the language of the page they asked from. One heading,
 * one sentence naming the reference, the button to the signed link, the link again as plain text
 * (a client that strips buttons still has it), and the note for someone who did not ask. In the
 * buyer frame, whose footer names the reference.
 *
 * It carries no personal data beyond the `To:` address (§5.2): no name, no recipient, no city, no
 * date. The link is the signed tracking link (`tracking.linkFor`); nothing else is a credential.
 * Written in the buyer's voice: no florist, no partner, no refund (A-founder-2026-10-14).
 */
import type { LocaleCode } from "@/config/locales";

import { buyerFooterText, buyerFrame, emailTranslator } from "./copy";
import {
  button,
  emailDocument,
  heading,
  note,
  paragraph,
  pasteBlock,
} from "./layout";

export interface TrackingLinkEmailInput {
  readonly locale: LocaleCode;
  /** The order's `FO-XXXX-XXXX` reference. */
  readonly reference: string;
  /** The absolute `/{locale}/track/{token}` link. */
  readonly link: string;
}

export interface RenderedTrackingLinkEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/** T16: subject, HTML part in the buyer frame, plain text. */
export function renderTrackingLinkEmail(
  input: TrackingLinkEmailInput,
): RenderedTrackingLinkEmail {
  const t = emailTranslator(input.locale);
  const subject = t("emails.account.trackingLink.subject", {
    reference: input.reference,
  });
  const title = t("emails.account.trackingLink.heading");
  const body = t("emails.account.trackingLink.body", {
    reference: input.reference,
  });
  const action = t("emails.account.trackingLink.button");
  const paste = t("emails.account.trackingLink.paste");
  const ignore = t("emails.account.trackingLink.ignore");
  const html = emailDocument({
    locale: input.locale,
    subject,
    preheader: t("emails.account.trackingLink.preheader"),
    frame: buyerFrame(t, input.reference),
    blocks: [
      heading(title),
      paragraph("body", body),
      button(action, input.link),
      note(paste),
      pasteBlock(input.link),
      note(ignore),
    ],
  });
  const textPart = [
    title,
    body,
    `${action}:\n${input.link}`,
    ignore,
    buyerFooterText(t, input.reference),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}
