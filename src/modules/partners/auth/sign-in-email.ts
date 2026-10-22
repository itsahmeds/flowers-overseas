/**
 * The florist sign-in email (spec 011 §2 "The `Mailer` seam", §5.2, AC-19, AC-32; artboard
 * `florist-sign-in-*.dc.html`, "The sign-in email"; TASK-212).
 *
 * In the member's language (`partner_member.locale_code`), with a plain-text part and a minimal
 * HTML part, every word from `emails.floristSignIn.*`. Kept here rather than under a top-level
 * `emails/` directory for the reason the admin email gives (`src/modules/admin/sign-in-email.ts`):
 * a new code root would need every repository-wide scan widened, and no React Email dependency is
 * added for one message. The link carries no address (AC-19); the address is never in the body.
 */
import { TRADING_NAME } from "@/config/company.data";
import type { FloristLanguage } from "@/config/florists";

import { floristTranslator } from "./copy";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A placeholder no translation contains, swapped for the escaped anchor in the HTML part. */
const LINK_SLOT = "\u0000link\u0000";

export function renderFloristSignInEmail(
  link: string,
  language: FloristLanguage,
): { subject: string; text: string; html: string } {
  const t = floristTranslator(language);
  const subject = t("emails.floristSignIn.subject");
  const text = `${TRADING_NAME}\n\n${t("emails.floristSignIn.body", { link })}\n`;
  const [before = "", after = ""] = t("emails.floristSignIn.body", {
    link: LINK_SLOT,
  }).split(LINK_SLOT);
  const anchor = `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`;
  const html = [
    `<!doctype html><html lang="${language}"><body>`,
    `<p><strong>${escapeHtml(TRADING_NAME)}</strong></p>`,
    `<p>${escapeHtml(before)}${anchor}${escapeHtml(after)}</p>`,
    `</body></html>`,
  ].join("");
  return { subject, text, html };
}
