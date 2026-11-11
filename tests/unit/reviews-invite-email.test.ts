/**
 * B9 `review-invite`, the review token, and the florist-template scan without a database (spec
 * 022a §10 T-09, T-10 unit half, T-11; AC-7, AC-9 to AC-11; TASK-370).
 *
 *  - T-09: B9 in `en`, `de` and `pl` carries the five star links (`r=1` to `r=5`), the policy link
 *    and the opt-out link, and none of the negative-framing words, the incentive words,
 *    `RELAY_PATTERNS`, a recipient's name or U+2014; a planted "discount" or "sorry" turns the
 *    scan red;
 *  - T-10: the snippet is written only when the props carry it, escaped so no value closes the
 *    script; the send input has no rating field (type-level);
 *  - T-11: V1 to V5 in every florist language and the florist inbox's words match no review or
 *    rating claim pattern of `src/config/honesty.ts`; a planted "rate us" turns the scan red;
 *  - the token is deterministic per invite and its stored form is the SHA-256 only.
 */
import { createHash } from "node:crypto";

import { describe, expect, expectTypeOf, it } from "vitest";

import { FLORIST_LANGUAGES } from "@/config/florists";
import {
  CLAIM_PATTERNS,
  type ClaimPattern,
  relayMatches,
} from "@/config/honesty";
import { loadMessages } from "@/modules/i18n";
import type { ReviewInviteNotificationInput } from "@/modules/notifications";
import {
  FLORIST_TEMPLATES,
  type FloristMessageFacts,
  optOutUrl,
  renderFloristEmail,
  renderReviewInvite,
  starUrl,
  trustpilotScript,
} from "@/modules/notifications/emails";
import {
  reviewCopyHits,
  reviewToken,
  reviewTokenHash,
  tokenHashOf,
} from "@/modules/reviews";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
const REVIEW_URL = `https://flowersoverseas.com/en/review/${TOKEN}`;
const LOCALES = ["en", "de", "pl"] as const;
type Lang = (typeof LOCALES)[number];

function props(locale: Lang, trustpilot = false) {
  return {
    locale,
    reference: "FO-7K2M-9QXA",
    reviewUrl: REVIEW_URL.replace("/en/", `/${locale}/`),
    policyUrl: `https://flowersoverseas.com/${locale}/legal/reviews`,
    trustpilot: trustpilot
      ? {
          recipientName: "Ada",
          recipientEmail: "ada@example.test",
          referenceId: "FO-7K2M-9QXA",
        }
      : null,
  };
}

/** The visible words of an HTML part: no tags, no style block, entities decoded. */
function visible(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gu, " ")
    .replace(/<script[\s\S]*?<\/script>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, " ");
}

function scanB9(text: string, locale: Lang): string[] {
  return [
    ...reviewCopyHits(text, locale),
    ...relayMatches(text, locale).map((match) => match.id),
    ...(text.includes("\u2014") ? ["U+2014"] : []),
  ];
}

describe("T-09: B9 in en, de and pl", () => {
  for (const locale of LOCALES) {
    it(`${locale}: five star links, the policy and the opt-out, nothing it may not say`, () => {
      const rendered = renderReviewInvite(props(locale));
      const url = props(locale).reviewUrl;
      for (const rating of [1, 2, 3, 4, 5]) {
        expect(rendered.html).toContain(`href="${starUrl(url, rating)}"`);
        expect(rendered.text).toContain(starUrl(url, rating));
      }
      expect(starUrl(url, 4)).toBe(`${url}?r=4`);
      expect(rendered.html).toContain(`href="${props(locale).policyUrl}"`);
      expect(optOutUrl(url)).toBe(`${url}/stop`);
      expect(rendered.html).toContain(`href="${url}/stop"`);
      expect(rendered.text).toContain(`${url}/stop`);
      expect(rendered.html).toContain(`lang="${locale}"`);
      for (const text of [
        rendered.subject,
        rendered.text,
        visible(rendered.html),
      ]) {
        expect(scanB9(text, locale)).toEqual([]);
      }
      // No recipient field exists to print; the fixture's recipient never appears.
      expect(rendered.html).not.toContain("Ada");
    });
  }

  it("en reads as the artboard: subject, lede, the minute line, policy and stop link", () => {
    const rendered = renderReviewInvite(props("en"));
    expect(rendered.subject).toBe("How did we do?");
    const words = visible(rendered.html);
    for (const line of [
      "Order FO-7K2M-9QXA",
      "How did we do?",
      "Tap a star to tell us about your order.",
      "It takes less than a minute.",
      "How we check reviews",
      "Prefer not to be asked? Stop these emails.",
    ]) {
      expect(words).toContain(line);
    }
    expect(rendered.html).toContain('aria-label="4 out of 5"');
    expect(rendered.text).toContain("1 star: ");
    expect(rendered.text).toContain("5 stars: ");
  });

  it("the scan bites: a planted 'discount' or 'sorry' is found", () => {
    expect(scanB9("Tap a star and get a discount.", "en")).toContain(
      "discount",
    );
    expect(scanB9("We are sorry it was late.", "en")).toContain("sorry");
    expect(scanB9("Leider war es spät.", "de")).toContain("leider");
    expect(scanB9("Niestety się spóźniło.", "pl")).toContain("niestety");
    expect(scanB9("Teil 1 \u2014 Teil 2", "de")).toContain("U+2014");
  });

  it("renders the same bytes twice (a retry is byte-identical)", () => {
    expect(renderReviewInvite(props("pl")).html).toBe(
      renderReviewInvite(props("pl")).html,
    );
  });
});

describe("T-10: the Trustpilot snippet", () => {
  it("is present only when the props carry it, and the visible email is unchanged", () => {
    const off = renderReviewInvite(props("en"));
    const on = renderReviewInvite(props("en", true));
    expect(off.html).not.toContain("application/json+trustpilot");
    expect(on.html).toContain(
      '<script type="application/json+trustpilot">{"recipientName":"Ada","recipientEmail":"ada@example.test","referenceId":"FO-7K2M-9QXA"}</script>',
    );
    expect(visible(on.html)).toBe(visible(off.html));
    expect(on.text).toBe(off.text);
  });

  it("escapes a value that tries to close the script", () => {
    const script = trustpilotScript({
      recipientName: "</script><b>",
      recipientEmail: "a@example.test",
      referenceId: "FO-AAAA-AAAA",
    });
    expect(script.match(/<\/script>/gu)).toHaveLength(1);
    expect(script).toContain("\\u003c/script\\u003e");
  });

  it("the send input has no rating field", () => {
    expectTypeOf<ReviewInviteNotificationInput>().not.toHaveProperty("rating");
    expectTypeOf<keyof ReviewInviteNotificationInput>().toEqualTypeOf<
      "inviteId" | "orderId" | "token" | "bcc"
    >();
  });
});

describe("the review token", () => {
  const INVITE = "6f1c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f60";

  it("is HMAC-SHA256 of the invite id, base64url, deterministic", () => {
    const token = reviewToken("s".repeat(40), INVITE);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(reviewToken("s".repeat(40), INVITE)).toBe(token);
    expect(reviewToken("t".repeat(40), INVITE)).not.toBe(token);
  });

  it("is stored as its SHA-256 only; a string that cannot be a token has no hash", () => {
    const token = reviewToken("s".repeat(40), INVITE);
    expect(reviewTokenHash(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(tokenHashOf(token)).toBe(reviewTokenHash(token));
    expect(tokenHashOf("short")).toBeNull();
    expect(tokenHashOf(`${token}x`)).toBeNull();
  });
});

describe("T-11: florists are never asked to solicit reviews", () => {
  const REVIEW_CLAIMS: readonly ClaimPattern[] = CLAIM_PATTERNS.filter(
    (claim) => claim.label === "review" || claim.label === "rating",
  );
  const claims = (text: string) =>
    REVIEW_CLAIMS.filter((claim) => claim.pattern.test(text)).map(
      (claim) => claim.label,
    );

  const FACTS: FloristMessageFacts = {
    assignmentId: "6f1c2e0a-0c1d-4a7e-9a55-1d2c3b4a5f60",
    productName: "Amber Hour",
    tierLabelKey: "catalog.tier.stems",
    tierStems: 18,
    addonKeys: ["catalog.addon.vase.name"],
    deliveryDate: "2026-10-08",
    timeZone: "Europe/Warsaw",
    town: "Warszawa",
    postcode: "00-001",
    payout: { amountMinor: 14900, currency: "PLN" },
    answerBy: new Date("2026-10-08T13:40:00Z"),
    partnerCode: "pl-waw-02",
    partnerName: "Kwiaciarnia Przykładowa",
  };

  it("finds both review and rating patterns", () => {
    expect(REVIEW_CLAIMS.map((claim) => claim.label).sort()).toEqual([
      "rating",
      "review",
    ]);
    expect(claims("Please rate us five stars")).toContain("rating");
    expect(claims("Leave us a review")).toContain("review");
  });

  for (const language of FLORIST_LANGUAGES) {
    it(`V1 to V5 in ${language} carry no review or rating request`, () => {
      for (const template of FLORIST_TEMPLATES) {
        const rendered = renderFloristEmail(template, FACTS, {
          language,
          link: "https://flowersoverseas.com/vendor/sign-in/confirm?t=x",
          timedOut: false,
        });
        for (const text of [
          rendered.subject,
          rendered.text,
          visible(rendered.html),
        ]) {
          expect(claims(text), `${template} ${language}`).toEqual([]);
        }
      }
    });

    it(`the florist inbox's words in ${language} carry no review or rating request`, () => {
      const messages = loadMessages(language, ["floristInbox"]);
      const flat = JSON.stringify(messages);
      expect(claims(flat)).toEqual([]);
      expect(claims(`${flat} Please rate us`)).toContain("rating");
    });
  }
});
