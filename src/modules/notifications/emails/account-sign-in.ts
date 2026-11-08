/**
 * T14 `buyer_sign_in`, the buyer's sign-in link (spec 018 §14 A-founder-2026-10-22 C.3, C.15
 * `emails.account.signIn.*`; AC-48; `docs/design/wireframes/email-account-*`; TASK-344).
 *
 * One template for a first and a returning sign-in, so nothing in it says whether an account
 * exists. In the locale of the page the link was asked from. One heading, one sentence, the button
 * to `/{locale}/account/sign-in/confirm?t=…` (the link carries only `t`, never the address), the
 * link again as plain text, the note for someone who did not ask, and the buyer footer whose last
 * line says why the address received it. No order detail, no partner or florist wording.
 */
import type { LocaleCode } from "@/config/locales";

import { accountFooterText, accountFrame, emailTranslator } from "./copy";
import {
  button,
  emailDocument,
  heading,
  note,
  paragraph,
  pasteBlock,
} from "./layout";

export interface AccountSignInEmailInput {
  readonly locale: LocaleCode;
  /** The absolute confirm link the core minted. */
  readonly link: string;
}

export interface RenderedAccountSignInEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const WHY_KEY = "emails.account.signIn.why";

/** T14: subject, HTML part in the buyer frame, plain text. */
export function renderAccountSignInEmail(
  input: AccountSignInEmailInput,
): RenderedAccountSignInEmail {
  const t = emailTranslator(input.locale);
  const subject = t("emails.account.signIn.subject");
  const body = t("emails.account.signIn.body");
  const action = t("emails.account.signIn.button");
  const paste = t("emails.account.signIn.paste");
  const ignore = t("emails.account.signIn.ignore");
  const html = emailDocument({
    locale: input.locale,
    subject,
    preheader: t("emails.account.signIn.preheader"),
    frame: accountFrame(t, WHY_KEY),
    blocks: [
      heading(subject),
      paragraph("body", body),
      button(action, input.link),
      note(paste),
      pasteBlock(input.link),
      note(ignore),
    ],
  });
  const textPart = [
    subject,
    body,
    `${action}:\n${input.link}`,
    ignore,
    accountFooterText(t, WHY_KEY),
  ].join("\n\n");
  return { subject, html, text: `${textPart}\n` };
}
