/**
 * Spec 011 task 1's pages as rendered HTML (TASK-210): T-02 / AC-2 (the landing's blocks, order
 * and absences, the status line), T-03 / AC-3 (the walkthrough's four inert, captioned screens and
 * their import identity), T-10 / AC-10 (the apply page off and on), and the unit halves of T-08 /
 * AC-8 (the text scan) and T-09 / AC-9 (the links).
 *
 * Server components rendered to static markup, with JavaScript off by construction: what a crawler
 * and a no-JS visitor receive.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextIntlClientProvider, createTranslator } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CLAIM_PATTERNS,
  PRICE_LITERAL_PATTERN,
  SCALE_CLAIM_PATTERN,
} from "../../src/config/honesty.ts";
import { bannedVoiceWordsIn } from "../../src/config/voice.ts";
import { infoPagePath, infoPageView } from "../../src/modules/content/index.ts";
import { loadMessages } from "../../src/modules/i18n/index.ts";
import * as partners from "../../src/modules/partners/index.ts";
import { InboxList } from "../../src/modules/partners/ui/inbox/InboxList.tsx";
import { OrderScreen } from "../../src/modules/partners/ui/inbox/OrderScreen.tsx";
import { PhotoStep } from "../../src/modules/partners/ui/inbox/PhotoStep.tsx";
import { InboxFrame } from "../../src/modules/partners/ui/inbox/parts.tsx";

vi.mock("next-intl/server", async () => {
  const { createTranslator: create } = await import("next-intl");
  const { loadMessages: load, MESSAGE_NAMESPACES } =
    await import("../../src/modules/i18n/messages.ts");
  return {
    setRequestLocale: (): void => undefined,
    getTranslations: ({ locale }: { locale: string }) =>
      Promise.resolve(
        create({
          locale,
          messages: load(locale, [...MESSAGE_NAMESPACES]),
        }),
      ),
  };
});

const { ApplyPage } =
  await import("../../src/modules/partners/ui/apply/ApplyPage.tsx");
const { SentPage } =
  await import("../../src/modules/partners/ui/apply/SentPage.tsx");
const { MESSAGE_NAMESPACES } =
  await import("../../src/modules/i18n/messages.ts");

const LOCALES = ["en", "en-gb", "de", "pl"] as const;
const ROOT = resolve(import.meta.dirname, "../..");

function render(node: ReactElement, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, [...MESSAGE_NAMESPACES])}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

/** The visible text, one block per line, so a heading and its paragraph are two sentences. */
function textOf(html: string): string {
  return html
    .replaceAll(/<(script|style|template)[\s\S]*?<\/\1>/gu, " ")
    .replaceAll(
      /<\/(p|h[1-6]|li|dt|dd|div|section|figcaption|a|span|b|strong)>/gu,
      "\n",
    )
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll(/[ \t]+/gu, " ");
}

async function landingHtml(
  locale: string,
  datesOpen?: boolean,
): Promise<string> {
  const view = await partners.floristsLandingView(locale);
  if (view === undefined) throw new Error(`no landing in ${locale}`);
  const page =
    datesOpen === undefined
      ? view.page
      : infoPageView("for-florists", locale, { datesOpen });
  if (page === undefined) throw new Error("no page");
  return render(<partners.FloristsLanding view={{ ...view, page }} />, locale);
}

async function walkthroughHtml(locale: string): Promise<string> {
  const view = await partners.walkthroughView(locale);
  if (view === undefined) throw new Error(`no walkthrough in ${locale}`);
  return render(<partners.FloristsWalkthrough view={view} />, locale);
}

async function applyHtml(locale: string, form: "off" | "on"): Promise<string> {
  return render(await ApplyPage({ locale, form }), locale);
}

async function sentHtml(locale: string): Promise<string> {
  return render(await SentPage({ locale }), locale);
}

describe("T-02 / AC-2: the landing's blocks, in §2's order", () => {
  it("renders the blocks in order: band, what we do, receive, steps, questions, talk, close", async () => {
    const html = await landingHtml("en");
    const order = [...html.matchAll(/data-fo-block="([a-z-]+)"/gu)].map(
      (match) => match[1],
    );
    expect(order).toEqual([
      "hero",
      "what-we-do",
      "receive",
      "steps",
      "questions",
      "talk",
      "close",
    ]);
  });

  it("puts every content section's heading in the content's order", async () => {
    const html = await landingHtml("en");
    const view = infoPageView("for-florists", "en");
    const headings = (view?.sections ?? []).map((section) =>
      section.heading.replaceAll("*", ""),
    );
    const text = textOf(html).replaceAll(/\s+/gu, " ");
    let from = 0;
    for (const heading of headings) {
      const at = text.indexOf(heading, from);
      expect(at, heading).toBeGreaterThanOrEqual(from);
      from = at;
    }
  });

  it("shows the status line under the h1 while no delivery date is open", async () => {
    const html = await landingHtml("en", false);
    const h1 = html.indexOf("</h1>");
    const status = html.indexOf("data-fo-status-line");
    expect(h1).toBeGreaterThan(0);
    expect(status).toBeGreaterThan(h1);
    expect(html).toContain(">We are not taking orders yet.</p>");
    expect(html).toMatch(/role="status"[^>]*data-fo-status-line/u);
  });

  it("drops the status line when a delivery date is open", async () => {
    const html = await landingHtml("en", true);
    expect(html).not.toContain("data-fo-status-line");
    expect(html).not.toContain("We are not taking orders yet.");
  });

  it.each(LOCALES)(
    "has no image, photo slot, logo, count, rating, review or testimonial in %s",
    async (locale) => {
      const html = await landingHtml(locale);
      expect(html).not.toMatch(/<img|<picture|data-fo-media|data-fo-photo\b/u);
      const text = textOf(html);
      expect(SCALE_CLAIM_PATTERN.exec(text)?.[0]).toBeUndefined();
      for (const claim of CLAIM_PATTERNS.filter((pattern) =>
        ["rating", "review", "florist count"].includes(pattern.label),
      )) {
        expect(claim.pattern.exec(text)?.[0], claim.label).toBeUndefined();
      }
      expect(text.toLowerCase()).not.toContain("testimonial");
    },
  );

  it("prints the payout example as two formatMoney lines and nothing about VAT, fees or our share", async () => {
    const view = await partners.floristsLandingView("en");
    const html = await landingHtml("en");
    expect(html).toMatch(
      new RegExp(
        `data-fo-payout-retail="true">${view?.payout.retailLabel ?? "-"}<`,
        "u",
      ),
    );
    expect(html).toMatch(
      new RegExp(
        `data-fo-payout-florist="true">${view?.payout.payoutLabel ?? "-"}<`,
        "u",
      ),
    );
    const card = html.slice(
      html.indexOf("data-fo-payout-example"),
      html.indexOf("data-fo-payout-example") + 2000,
    );
    expect(card).not.toMatch(/processing|commission|what we keep|net of/iu);
  });

  it("marks the de and pl drafts with the untranslated line, and not en", async () => {
    expect(await landingHtml("en")).not.toContain("data-fo-untranslated");
    expect(await landingHtml("de")).toContain(
      "Diese Übersetzung wurde noch nicht geprüft.",
    );
    expect(await landingHtml("pl")).toContain(
      "To tłumaczenie nie zostało jeszcze sprawdzone.",
    );
  });
});

describe("T-03 / AC-3: the walkthrough's screens are the inbox's own components", () => {
  it("renders four figures, each an inert phone frame with the inbox inside and a caption", async () => {
    const html = await walkthroughHtml("en");
    const figures = html.split("<figure").slice(1);
    expect(figures).toHaveLength(4);
    for (const figure of figures) {
      expect(figure).toMatch(/<div[^>]* inert=""[^>]*data-fo-phone-screen/u);
      expect(figure).toContain("data-fo-inbox-frame");
      expect(figure).toMatch(/<figcaption[^>]*>[^<]+<\/figcaption>/u);
    }
    expect(figures[0]).toContain("data-fo-inbox-list");
    expect(figures[1]).toContain('data-fo-order-screen="offer"');
    expect(figures[2]).toContain('data-fo-order-screen="accepted"');
    expect(figures[3]).toContain("data-fo-photo-step");
  });

  it("requests no image, draws no link or form inside a screen, and ships no script", async () => {
    const html = await walkthroughHtml("en");
    expect(html).not.toMatch(/<img|<picture|<script/u);
    for (const figure of html.split("<figure").slice(1)) {
      const inside = figure.slice(0, figure.indexOf("</figure>"));
      // A screen may print the recipient's `tel:` link (the real component does); it holds no link
      // a crawler would follow, and no form.
      expect(inside).not.toMatch(/<a [^>]*href="(?!tel:)/u);
      expect(inside).not.toContain("<form");
    }
  });

  it("shows the recipient only after acceptance, and never the buyer (§2, §8)", async () => {
    const html = await walkthroughHtml("en");
    const [, list, offer, accepted] = html.split("<figure");
    const recipient = "Anna Przykładowa";
    expect(list).not.toContain(recipient);
    expect(offer).not.toContain(recipient);
    expect(offer).toContain("Answer by");
    expect(accepted).toContain(recipient);
    expect(accepted).toContain("tel:+48220000000");
    expect(accepted).toContain("Happy birthday, Mama!");
  });

  it("imports the inbox components the partners barrel exports: one identity", () => {
    expect(partners.InboxList).toBe(InboxList);
    expect(partners.OrderScreen).toBe(OrderScreen);
    expect(partners.PhotoStep).toBe(PhotoStep);
    expect(partners.InboxFrame).toBe(InboxFrame);
    const source = readFileSync(
      resolve(ROOT, "src/modules/partners/ui/public/FloristsWalkthrough.tsx"),
      "utf8",
    );
    for (const specifier of [
      "../inbox/InboxList.tsx",
      "../inbox/OrderScreen.tsx",
      "../inbox/PhotoStep.tsx",
      "../inbox/parts.tsx",
    ]) {
      expect(source).toContain(`from "${specifier}"`);
    }
    // The barrel re-exports from the same files, so the inbox page (TASK-214) and the walkthrough
    // render one component, not two copies.
    const barrel = readFileSync(
      resolve(ROOT, "src/modules/partners/index.ts"),
      "utf8",
    );
    for (const file of [
      "./ui/inbox/InboxList.tsx",
      "./ui/inbox/OrderScreen.tsx",
      "./ui/inbox/PhotoStep.tsx",
      "./ui/inbox/parts.tsx",
    ]) {
      expect(barrel).toContain(`from "${file}"`);
    }
  });

  it("feeds the screens exampleFloristOrderView, typed by the inbox's own schema", async () => {
    const offer = await partners.exampleFloristOrderView("en", "offer");
    const accepted = await partners.exampleFloristOrderView("en", "accepted");
    expect(partners.FloristOrderViewSchema.parse(offer)).toEqual(offer);
    expect(offer.stage).toBe("offer");
    expect("recipient" in offer).toBe(false);
    expect(accepted.stage).toBe("accepted");
    const view = await partners.walkthroughView("en");
    expect(view?.offer).toEqual(offer);
    expect(view?.accepted).toEqual(accepted);
  });
});

describe("T-10 / AC-10: the application form's switch", () => {
  it.each(LOCALES)(
    "off: no <form>, the contact-first block with the phone and WhatsApp in %s",
    async (locale) => {
      const html = await applyHtml(locale, "off");
      expect(html).not.toContain("<form");
      expect(html).toContain("data-fo-apply-off");
      expect(html).toContain('href="tel:+12135925150"');
      expect(html).toContain('href="https://wa.me/12135925150"');
      expect(html).toContain("data-fo-apply-notice");
    },
  );

  it("on: the form of §2, every field with its label, help text and autocomplete token", async () => {
    const html = await applyHtml("en", "on");
    expect(html).toMatch(/<form[^>]*method="post"/u);
    const fields: readonly (readonly [
      string,
      string,
      string | undefined,
      string | undefined,
    ])[] = [
      [
        "businessName",
        "Name of your shop",
        "As it appears on your shopfront",
        "organization",
      ],
      ["contactName", "Your name", undefined, "name"],
      ["email", "Email", undefined, "email"],
      [
        "phone",
        "Phone or WhatsApp",
        "The number we call and send orders to",
        "tel",
      ],
      ["country", "Country", undefined, "country"],
      ["town", "Town or city", undefined, "address-level2"],
      [
        "deliveryArea",
        "Where you deliver",
        "Districts, postcodes or a distance from your shop",
        undefined,
      ],
      [
        "capacityPerDay",
        "Orders a day you could take",
        "An honest number. We would rather send you fewer and have every one delivered.",
        "off",
      ],
      [
        "registrationNumber",
        "Registration number",
        "NIP, KRS, Handelsregister or your country&#x27;s equivalent",
        "off",
      ],
      ["website", "Instagram or website", undefined, "url"],
    ];
    for (const [name, label, help, autocomplete] of fields) {
      const tag = new RegExp(
        `<(input|select|textarea)[^>]*name="${name}"[^>]*>`,
        "u",
      ).exec(html)?.[0];
      expect(tag, name).toBeDefined();
      const id = /id="([^"]+)"/u.exec(tag ?? "")?.[1];
      expect(html, `${name} label`).toContain(`for="${id ?? "-"}">${label}`);
      if (help !== undefined) {
        expect(html, `${name} help`).toContain(
          `id="${id ?? "-"}-help">${help}</p>`,
        );
        expect(tag, `${name} aria-describedby`).toContain(
          `aria-describedby="${id ?? "-"}-help"`,
        );
      }
      if (autocomplete !== undefined) {
        expect(tag, `${name} autocomplete`).toContain(
          `autoComplete="${autocomplete}"`,
        );
      }
    }
    expect(html).toMatch(
      /name="capacityPerDay"[^>]*inputMode="numeric"|inputMode="numeric"[^>]*name="capacityPerDay"/u,
    );
    for (const [name, legend, values] of [
      [
        "weekendDelivery",
        "Do you deliver at weekends?",
        ["yes", "sometimes", "no"],
      ],
      [
        "contactPreference",
        "How should we contact you?",
        ["email", "whatsapp", "phone"],
      ],
      ["language", "Language", ["en", "pl", "de"]],
    ] as const) {
      expect(html).toContain(
        `<legend class="text-ui text-ink font-bold p-0">${legend}</legend>`,
      );
      for (const value of values) {
        expect(html, `${name}=${value}`).toMatch(
          new RegExp(
            `type="radio"[^>]*name="${name}"[^>]*value="${value}"`,
            "u",
          ),
        );
      }
    }
    // The page's own language is preselected; no upload field and no bank field (§2, §13 Q5).
    expect(html).toMatch(/name="language" checked="" value="en"/u);
    expect(html).not.toMatch(/name="language" checked="" value="(pl|de)"/u);
    expect(html).not.toMatch(
      /type="file"|<(input|select|textarea)[^>]*name="[^"]*(iban|bank|account)/iu,
    );
    // The honeypot: hidden from assistive technology and out of the tab order.
    const honeypot =
      /<div class="hidden" aria-hidden="true">[\s\S]*?<\/div>/u.exec(
        html,
      )?.[0] ?? "";
    expect(honeypot).toMatch(/<input[^>]*name="hp"/u);
    expect(honeypot).toMatch(/<input[^>]*tabindex="-1"/iu);
  });

  it("orders the country list by the locale's collator", async () => {
    const html = await applyHtml("en", "on");
    const options = [
      ...html.matchAll(/<option value="([A-Z]{2})">([^<]+)<\/option>/gu),
    ].map((m) => m[2] ?? "");
    expect(options.length).toBeGreaterThan(1);
    expect(options).toEqual(
      [...options].sort((a, b) => a.localeCompare(b, "en")),
    );
  });
});

describe("T-08 / AC-8 (unit half): the four public pages' text in four locales", () => {
  it.each(LOCALES)(
    "finds no banned word, count, rating, review, testimonial or stray price literal in %s",
    async (locale) => {
      const landing = await partners.floristsLandingView(locale);
      const payout = [
        landing?.payout.retailLabel ?? "",
        landing?.payout.payoutLabel ?? "",
      ];
      const pages = {
        landing: await landingHtml(locale),
        walkthrough: await walkthroughHtml(locale),
        apply: await applyHtml(locale, "off"),
        sent: await sentHtml(locale),
      };
      for (const [name, html] of Object.entries(pages)) {
        let text = textOf(html);
        expect(bannedVoiceWordsIn(text), `${locale} ${name}`).toEqual([]);
        expect(
          SCALE_CLAIM_PATTERN.exec(text)?.[0],
          `${locale} ${name}`,
        ).toBeUndefined();
        for (const claim of CLAIM_PATTERNS.filter((pattern) =>
          ["rating", "review", "florist count"].includes(pattern.label),
        )) {
          expect(
            claim.pattern.exec(text)?.[0],
            `${locale} ${name} ${claim.label}`,
          ).toBeUndefined();
        }
        for (const label of payout) text = text.replaceAll(label, " ");
        expect(
          PRICE_LITERAL_PATTERN.exec(text)?.[0],
          `${locale} ${name}`,
        ).toBeUndefined();
      }
    },
  );
});

describe("T-09 / AC-9 (unit half): the landing's links", () => {
  it.each(LOCALES)(
    "links to the walkthrough, the apply page and, where they exist, help and the guides in %s",
    async (locale) => {
      const html = await landingHtml(locale);
      const hrefs = [...html.matchAll(/href="([^"]+)"/gu)].map(
        (m) => m[1] ?? "",
      );
      expect(hrefs).toContain(infoPagePath("how-orders-work", locale));
      expect(hrefs).toContain(infoPagePath("florist-apply", locale));
      const view = infoPageView("for-florists", locale);
      const help = view?.links.find((link) => link.to === "help");
      if (help === undefined) {
        expect(hrefs).not.toContain(`/${locale}/help`);
      } else {
        expect(hrefs).toContain(help.href);
      }
      const guides = (view?.guides ?? []).map((guide) => guide.href);
      const guideLinks = hrefs.filter((href) =>
        /\/(send-flowers-to|blumen-verschicken|wyslij-kwiaty)\//u.test(href),
      );
      expect(guideLinks).toEqual(guides);
      // Nothing points into the florist inbox, which answers 404 in production.
      expect(hrefs.filter((href) => href.startsWith("/demo/"))).toEqual([]);
    },
  );

  it("links to every guide that exists in en, and to none in de, which has none", () => {
    expect(
      (infoPageView("for-florists", "en")?.guides ?? []).length,
    ).toBeGreaterThan(0);
    expect(infoPageView("for-florists", "de")?.guides).toEqual([]);
  });
});

describe("the sent page", () => {
  it.each(LOCALES)(
    "thanks, offers the phone and the walkthrough, and has no form in %s",
    async (locale) => {
      const html = await sentHtml(locale);
      expect(html).toContain("<h1");
      expect(html).toContain('href="tel:+12135925150"');
      expect(html).toContain(
        `href="${infoPagePath("how-orders-work", locale)}"`,
      );
      expect(html).not.toContain("<form");
    },
  );
});

// The translator the apply page uses resolves ICU values, so a missing argument would throw here.
describe("the apply page's copy resolves in every locale", () => {
  it.each(LOCALES)("%s", (locale) => {
    const t = createTranslator({
      locale,
      messages: loadMessages(locale, [...MESSAGE_NAMESPACES]),
    });
    expect(t("forFlorists.apply.formOff", { phoneDisplay: "+1" })).toContain(
      "+1",
    );
  });
});
