/**
 * The admin sign-in email (spec 012 §2.2, §5.2 `emails/`; artboard
 * `docs/design/wireframes/admin-sign-in-desktop.dc.html`, "The admin sign-in email"; TASK-217).
 *
 * English only, a plain-text part and a minimal HTML part, every word from the admin catalogue.
 * Rendered as strings rather than through React Email: no dependency is added for one message,
 * and the HTML is escaped here. The link carries no address (AC-9).
 */
import { adminT } from "@/modules/admin/messages";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAdminSignInEmail(link: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = adminT("admin.email.subject");
  const lead = adminT("admin.email.lead");
  const body = adminT("admin.email.body");
  const brand = adminT("admin.shell.brand");
  const text = `${brand}\n\n${lead} ${link}\n\n${body}\n`;
  const html = [
    `<!doctype html><html lang="en"><body>`,
    `<p><strong>${escapeHtml(brand)}</strong></p>`,
    `<p>${escapeHtml(lead)} <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    `<p>${escapeHtml(body)}</p>`,
    `</body></html>`,
  ].join("");
  return { subject, text, html };
}
