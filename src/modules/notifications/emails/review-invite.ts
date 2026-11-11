/**
 * B9 `review-invite` (spec 022a §5.2 "B9", §8; AC-7, AC-9, AC-10; artboard
 * `email-buyer-{desktop,mobile}.dc.html`, "B9 review-invite"; TASK-370).
 *
 * "Order {reference}", the heading "How did we do?", "Tap a star to tell us about your order.",
 * five star links (`★` and the digit under it, each to `/{locale}/review/{token}?r=n`, named
 * "{n} out of 5"), "It takes less than a minute.", the link "How we check reviews" to the review
 * policy, the buyer footer, and "Prefer not to be asked? Stop these emails." to the opt-out page.
 *
 * **What it cannot say, by construction** (AC-9): `ReviewInviteEmailPropsSchema` is `.strict()`
 * and has no field for a recipient, a product, a price, a refund or an offer, so the template has
 * nothing of the kind to print. The Trustpilot snippet (AC-10) is the one place the buyer's first
 * name and address appear, in a `<script type="application/json+trustpilot">` block Trustpilot's
 * automatic feedback service reads; it is rendered only when the send carries Trustpilot's BCC.
 *
 * Pure: the same props render the same bytes, so a retried send is byte-identical (AC-7).
 */
import { sql } from "drizzle-orm";
import { z } from "zod";

import { type LocaleCode, isLocaleCode } from "@/config/locales";
import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from "@/config/reviews";

import { orderReference } from "@/modules/orders";

import {
  type NotificationRenderInput,
  notificationTemplate,
  registerNotificationTemplate,
  type RenderedNotification,
} from "../templates";

import { buyerFooterText, buyerFrame, emailTranslator } from "./copy";
import { firstNameOf } from "./first-name";
import { el, type SafeHtml, text } from "./html";
import {
  type Block,
  emailDocument,
  eyebrow,
  heading,
  note,
  paragraph,
  textLink,
} from "./layout";
import { EMAIL_FONTS, colour } from "./theme";

const HttpUrl = z.url({ protocol: /^https?$/u });

/** Trustpilot's structured snippet: who to invite and the order it is about (§13 Q2). */
export const TrustpilotSnippetSchema = z
  .object({
    recipientName: z.string().min(1).max(200),
    recipientEmail: z.email(),
    referenceId: z.string().min(1).max(32),
  })
  .strict();
export type TrustpilotSnippet = z.infer<typeof TrustpilotSnippetSchema>;

/** B9's whole input (AC-9): no recipient, product, amount, refund or incentive field. */
export const ReviewInviteEmailPropsSchema = z
  .object({
    locale: z.string().refine(isLocaleCode),
    reference: z.string().min(1).max(32),
    /** `/{locale}/review/{token}`, absolute, without a star. */
    reviewUrl: HttpUrl,
    policyUrl: HttpUrl,
    trustpilot: TrustpilotSnippetSchema.nullable(),
  })
  .strict();
export type ReviewInviteEmailProps = z.input<
  typeof ReviewInviteEmailPropsSchema
>;

/** The ratings, 1 to 5. */
export const STAR_VALUES: readonly number[] = Array.from(
  { length: REVIEW_RATING_MAX - REVIEW_RATING_MIN + 1 },
  (_, index) => REVIEW_RATING_MIN + index,
);

/** The link of star `n`: the review URL with `?r=n`. */
export function starUrl(reviewUrl: string, rating: number): string {
  const url = new URL(reviewUrl);
  url.searchParams.set("r", String(rating));
  return url.toString();
}

/** The opt-out page of the same token: `/{locale}/review/{token}/stop`. */
export function optOutUrl(reviewUrl: string): string {
  const url = new URL(reviewUrl);
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/stop`;
  url.search = "";
  return url.toString();
}

/** The five star links: one table row, five equal columns, 72 × 64 px targets. */
function starRow(reviewUrl: string, label: (rating: number) => string): Block {
  const cells = STAR_VALUES.map((rating) =>
    el(
      "td",
      {
        align: "center",
        width: "20%",
        style: { padding: "0" },
      },
      el(
        "a",
        {
          href: starUrl(reviewUrl, rating),
          "aria-label": label(rating),
          style: {
            display: "inline-block",
            "min-width": "72px",
            "min-height": "64px",
            "font-family": EMAIL_FONTS.body,
            color: colour("ink"),
            "text-decoration": "none",
            "text-align": "center",
            "line-height": "1",
          },
        },
        el(
          "span",
          {
            style: {
              display: "block",
              "font-size": "34px",
              "line-height": "40px",
            },
          },
          "★",
        ),
        el(
          "span",
          {
            style: {
              display: "block",
              "font-size": "15px",
              "font-weight": 700,
              "line-height": "24px",
            },
          },
          String(rating),
        ),
      ),
    ),
  );
  return {
    html: el(
      "table",
      {
        role: "presentation",
        width: "100%",
        cellpadding: 0,
        cellspacing: 0,
        style: { "border-collapse": "collapse", "table-layout": "fixed" },
      },
      el("tr", {}, ...cells),
    ),
  };
}

/** Trustpilot's snippet, its JSON escaped so no value can close the script element. */
export function trustpilotScript(snippet: TrustpilotSnippet): string {
  const json = JSON.stringify(TrustpilotSnippetSchema.parse(snippet))
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  return `<script type="application/json+trustpilot">${json}</script>`;
}

function link(label: string, href: string): SafeHtml {
  return el(
    "a",
    {
      href,
      style: {
        color: colour("link"),
        "font-weight": 700,
        "text-decoration": "underline",
        "text-underline-offset": "4px",
      },
    },
    label,
  );
}

/** Renders B9. */
export function renderReviewInvite(
  input: ReviewInviteEmailProps,
): RenderedNotification {
  const props = ReviewInviteEmailPropsSchema.parse(input);
  const locale = props.locale as LocaleCode;
  const t = emailTranslator(locale);
  const subject = t("emails.reviewInvite.subject");
  const lede = t("emails.reviewInvite.lede");
  const minute = t("emails.reviewInvite.minute");
  const policy = t("emails.reviewInvite.policy");
  const optOutLead = t("emails.reviewInvite.optOutLead");
  const optOutLink = t("emails.reviewInvite.optOutLink");
  const stopUrl = optOutUrl(props.reviewUrl);
  const frame = buyerFrame(t, props.reference);
  const html = emailDocument({
    locale,
    subject,
    preheader: lede,
    frame: {
      ...frame,
      footer: [
        ...frame.footer,
        {
          html: el(
            "span",
            {},
            text(`${optOutLead} `),
            link(optOutLink, stopUrl),
          ),
        },
      ],
    },
    blocks: [
      eyebrow(t("tracking.eyebrow", { reference: props.reference })),
      heading(subject),
      paragraph("body", lede),
      starRow(props.reviewUrl, (rating) =>
        t("emails.reviewInvite.starLabel", { n: rating }),
      ),
      note(minute),
      textLink(policy, props.policyUrl, 20),
    ],
  });
  const withSnippet =
    props.trustpilot === null
      ? html
      : html.replace("</body>", `${trustpilotScript(props.trustpilot)}</body>`);
  const starsText = STAR_VALUES.map(
    (rating) =>
      `${t("emails.reviewInvite.starText", { n: rating })}: ${starUrl(props.reviewUrl, rating)}`,
  ).join("\n");
  const plain = [
    t("tracking.eyebrow", { reference: props.reference }),
    subject,
    lede,
    starsText,
    minute,
    `${policy}: ${props.policyUrl}`,
    buyerFooterText(t, props.reference),
    `${optOutLead} ${optOutLink}: ${stopUrl}`,
  ].join("\n\n");
  return { subject, html: withSnippet, text: `${plain}\n` };
}

/** The HTML marker a test reads to tell the snippet is present. */
export const TRUSTPILOT_SCRIPT_TYPE = "application/json+trustpilot";

const BuyerRow = z.object({
  name: z.string().min(1),
  email: z.email(),
});

/** What the registration needs from outside: the review policy's absolute URL in a locale. */
export interface ReviewInviteSources {
  readonly policyUrl: (locale: LocaleCode) => string;
}

/**
 * Reads B9's facts at send time (the reference; the buyer's first name and address only when the
 * Trustpilot snippet goes in) and renders it.
 */
export async function renderReviewInviteNotification(
  input: NotificationRenderInput,
  sources: ReviewInviteSources,
): Promise<RenderedNotification> {
  if (input.orderId === null || input.reviewInvite === undefined) {
    throw new Error("REVIEW_INVITE_INPUT: B9 needs its order and its link");
  }
  if (!isLocaleCode(input.locale)) {
    throw new Error(
      "REVIEW_INVITE_INPUT: the buyer's locale is not one of ours",
    );
  }
  const reference = orderReference(input.orderId);
  let trustpilot: TrustpilotSnippet | null = null;
  if (input.reviewInvite.trustpilot) {
    const [row] = await input.executor.execute(sql`
      SELECT buyer_snapshot ->> 'name' AS name, buyer_snapshot ->> 'email' AS email
      FROM "order" WHERE id = ${input.orderId}`);
    const buyer = BuyerRow.parse(row);
    trustpilot = {
      recipientName: firstNameOf(buyer.name),
      recipientEmail: buyer.email,
      referenceId: reference,
    };
  }
  return renderReviewInvite({
    locale: input.locale,
    reference,
    reviewUrl: input.reviewInvite.reviewUrl,
    policyUrl: sources.policyUrl(input.locale),
    trustpilot,
  });
}

/** Registers B9 with the pipeline, once. */
export function registerReviewInviteTemplate(
  sources: ReviewInviteSources,
): void {
  if (notificationTemplate("review-invite") !== undefined) return;
  registerNotificationTemplate("review-invite", (input) =>
    renderReviewInviteNotification(input, sources),
  );
}
