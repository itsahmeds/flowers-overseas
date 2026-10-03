/**
 * T-11 (unit half) / AC-9, plus the AC-14 and §8 honesty rules the footer is the site-wide
 * surface for (TASK-049).
 *
 * Rendered with `react-dom/server` against the **real** `messages/en.json` through the same
 * provider the layout uses, so the asserted copy is the shipped copy and a key that does not
 * resolve fails here rather than in a browser.
 *
 * The four assertions that matter, each of which is a compliance statement rather than a
 * styling one:
 *
 *  1. while `company.registered` is false the document contains **no** registry code, VAT id or
 *     address — and no bracketed placeholder from the design canvas either (AC-9, `plan/07` §6);
 *  2. `CompanySchema` refuses `registered: true` with a missing field, so the flag cannot be set
 *     without the data (AC-9's schema half; the fixture is rendered too, to prove the *other*
 *     direction: with all five fields the clauses appear);
 *  3. an unpublished link is **not drawn at all** — no `<a>`, no text, no heading over an empty
 *     column (AC-14 as spec 004 §14 A20 amends it; TASK-173);
 *  4. no payment method is named while none is `available`, and no logo image ships at all (§8).
 *
 * The parts that need a browser — the control re-opening the banner after TASK-051 wires it, the
 * form posting, the four locales — are `tests/e2e/footer.spec.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NextIntlClientProvider } from "next-intl";

import { CompanySchema, COMPANY } from "../../src/config/company.ts";
import {
  availablePaymentMethods,
  PAYMENT_METHODS,
} from "../../src/config/payment-methods.ts";
import {
  SITE_LINKS,
  SITE_LINK_GROUPS,
  type SiteLinkId,
  isPublished,
} from "../../src/config/site-links.ts";
import {
  loadMessages,
  MESSAGE_NAMESPACES,
} from "../../src/modules/i18n/messages.ts";
import { localePath } from "../../src/modules/i18n/routing.ts";
import {
  CONSENT_REOPEN_ATTRIBUTE,
  REMINDERS_ANCHOR,
  REMINDERS_ENDPOINT,
  SiteFooter,
} from "../../src/modules/ui/index.ts";
import {
  companyIdentity,
  footerView,
} from "../../src/modules/ui/layout/footerView.ts";

/** A registered OÜ, as `company.ts` will read the day the founder fills all five fields. */
const REGISTERED = {
  tradingName: "Flowers Overseas",
  registered: true,
  legalName: "Flowers Overseas OÜ",
  registryName: "Estonian Business Register",
  registrationNumber: "16123456",
  vatId: "EE102345678",
  address: {
    lines: ["Sepapaja 6"],
    postalCode: "15551",
    city: "Tallinn",
    countryIso2: "EE",
  },
  contact: COMPANY.contact,
  descriptionKey: COMPANY.descriptionKey,
  operatedByKey: COMPANY.operatedByKey,
} as const;

function render(node: React.ReactElement, locale = "en"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={loadMessages(locale, MESSAGE_NAMESPACES)}
      timeZone="UTC"
    >
      {node}
    </NextIntlClientProvider>,
  );
}

const phase0 = render(<SiteFooter locale="en" />);

describe("SiteFooter: the Phase-0 colophon", () => {
  it("is one `contentinfo` landmark and nothing nested inside another", () => {
    expect(phase0.match(/<footer/g)).toHaveLength(1);
    expect(phase0).not.toContain("<main");
  });

  it("renders the one link column with a page behind it, as a named nav, and no empty one", () => {
    // `Sending` keeps Destinations and Occasions. `Company` and the legal row have no entry with
    // a page (TASK-174 builds them), so neither is drawn: no heading over nothing, and no empty
    // `navigation` landmark (spec 004 §14 A20; TASK-173). The language list is spec 003's nav.
    expect(phase0).toContain('aria-labelledby="footer-group-sending"');
    expect(phase0).not.toContain('aria-labelledby="footer-group-company"');
    expect(phase0).not.toContain('aria-label="Legal"');
    expect(phase0.match(/<nav/g)).toHaveLength(2);
  });

  it("prints the labels whose page exists, and none of the ones whose page does not", () => {
    for (const label of ["Sending", ">Destinations<", ">Occasions<"]) {
      expect(phase0, label).toContain(label);
    }
    // Built from the registry, not typed: every footer link with no page, and the heading of
    // every group left with none, must be absent from the colophon in every launch locale. Each
    // one looked like a link on the live site and went nowhere (2026-10-03; spec 004 §14 A20).
    const unpublished = SITE_LINKS.filter(
      (link) => link.surfaces.includes("footer") && !isPublished(link.id),
    );
    const emptyGroups = SITE_LINK_GROUPS.filter(
      (group) =>
        group.surface === "footer" &&
        group.linkIds.every((id) => !isPublished(id as SiteLinkId)),
    );
    // The set is not vacuous: the guarantee, the Company column and the legal row are in it.
    expect(unpublished.map((link) => link.id)).toEqual(
      expect.arrayContaining([
        "guarantee",
        "for-florists",
        "imprint",
        "cookies",
      ]),
    );
    expect(emptyGroups.map((group) => group.id)).toEqual(["company", "legal"]);
    for (const locale of ["en", "en-gb", "de", "pl"]) {
      const html = render(<SiteFooter locale={locale} />, locale);
      const messages = loadMessages(locale, MESSAGE_NAMESPACES) as Record<
        string,
        unknown
      >;
      const keys = [
        ...unpublished.map((link) => link.labelKey ?? ""),
        ...emptyGroups.map((group) => group.headingKey),
      ];
      for (const key of keys) {
        const label = key
          .split(".")
          .reduce<unknown>(
            (node, part) =>
              typeof node === "object" && node !== null
                ? (node as Record<string, unknown>)[part]
                : undefined,
            messages,
          );
        expect(typeof label, `${locale} ${key}`).toBe("string");
        const escaped = String(label).replaceAll("&", "&amp;");
        expect(html, `${locale} ${key}`).not.toContain(`>${escaped}<`);
        expect(html, `${locale} ${key}`).not.toContain(`"${escaped}"`);
      }
    }
  });

  it("renders the language list and the cookie-settings control (AC-9)", () => {
    expect(phase0).toContain("Cookie settings");
    expect(phase0).toContain(CONSENT_REOPEN_ATTRIBUTE);
    // Spec 003's switcher, unchanged: the other three locales as links, this one as current.
    expect(phase0).toContain('href="/de"');
    expect(phase0).toContain('aria-current="page"');
  });
});

describe("AC-14 (spec 004 §14 A20): an unpublished target is not drawn at all", () => {
  it("renders an `<a>` for each published footer target and for nothing else (007 AC-20, 008 AC-20)", () => {
    const hrefs = [...phase0.matchAll(/href="([^"]*)"/g)].map(
      (match) => match[1],
    );
    // Every href in the footer belongs to the locale switcher, to `tel:`, or to a footer target
    // whose page exists: spec 007's all-destinations hub, and spec 008's occasions index from the
    // day TASK-113 built its route. No other `site-links.ts` row has a page, so no other row is a
    // link (spec 004 AC-14).
    const published = [
      localePath("en", "destinations"),
      localePath("en", "occasions"),
    ];
    expect(
      hrefs.filter(
        (href) =>
          href !== undefined &&
          !/^(?:\/(?:en|en-gb|de|pl)$|tel:)/.test(href) &&
          !published.includes(href),
      ),
    ).toEqual([]);
    for (const href of published) {
      expect(phase0).toContain(`href="${href}"`);
    }
  });

  it("publishes exactly the footer targets whose page exists (007 AC-20, 008 AC-20)", () => {
    const footerLinks = SITE_LINKS.filter((link) =>
      link.surfaces.includes("footer"),
    );
    expect(footerLinks.length).toBeGreaterThan(0);
    // The list is exact in both directions: publishing a sixth footer row, or dropping one of
    // these two, is a failing test rather than a link to a 404 in production.
    expect(
      footerLinks.filter((link) => link.published).map((l) => l.id),
    ).toEqual(["destinations", "occasions"]);
  });

  it("draws nothing for a published row whose page does not exist in this locale", () => {
    // **Permission is not existence** (spec 008 AC-20, spec 004 AC-14; TASK-113). `occasions` is
    // published, but a locale with no occasion hub has no occasions index, so the layout marks
    // it `unavailable` — and since TASK-173 the colophon prints neither the href nor the word.
    const german = render(
      <SiteFooter
        locale="de"
        view={footerView("de", { unavailable: ["occasions"] })}
      />,
      "de",
    );
    expect(german).not.toContain(">Occasions<");
    expect(german).not.toContain(`href="${localePath("de", "occasions")}"`);
    expect(german).toContain(`href="${localePath("de", "destinations")}"`);
    // And a column left with no entry at all is gone, heading included.
    const empty = render(
      <SiteFooter
        locale="de"
        view={footerView("de", {
          unavailable: ["occasions", "destinations"],
        })}
      />,
      "de",
    );
    expect(empty).not.toContain('aria-labelledby="footer-group-sending"');
    expect(empty).not.toContain(">Sending<");

    // And the same registry row, in a locale where the page exists, is a link — one option, two
    // outcomes, so neither branch is dead.
    const english = render(<SiteFooter locale="en" view={footerView("en")} />);
    expect(english).toContain(`href="${localePath("en", "occasions")}"`);
  });

  it("renders a link the moment a target is published, with no template edit", () => {
    // The `links-populated` state of §5.3, reached the way 007 will reach it: a published target.
    const view = footerView("en");
    const populated = {
      ...view,
      columns: view.columns.map((group) => ({
        ...group,
        links: group.links.map((link) =>
          link.id === "guarantee" ? { ...link, href: "/en/guarantee" } : link,
        ),
      })),
    };
    const markup = render(<SiteFooter locale="en" view={populated} />);
    expect(markup).toContain('href="/en/guarantee"');
    expect(markup).toContain(">The guarantee<");
    expect(phase0).not.toContain(">The guarantee<");
  });
});

describe("AC-9: the company block tells the truth about a company that does not exist", () => {
  it("prints the trading name, the first-person description and the contact channel", () => {
    expect(phase0).toContain("Flowers Overseas");
    expect(phase0).toContain("We send flowers across Europe");
    expect(phase0).toContain("Help &amp; WhatsApp");
    expect(phase0).toContain('href="tel:+12135925150"');
    expect(phase0).toContain("+1 (213) 592-5150");
    // Founder copy batch, 2026-10-04: the support line replaces "Mon–Sat 8–20 CET".
    expect(phase0).toContain(
      "Message us any time, 24/7 — we reply within a few hours.",
    );
    expect(phase0).not.toContain("Mon–Sat");
  });

  it("prints the sign-off as decoration, in Fraunces italic and never Caveat (A21 clause 3)", () => {
    const signoff = phase0.slice(
      phase0.lastIndexOf("<p", phase0.indexOf("data-fo-footer-signoff")),
    );
    const tag = signoff.slice(0, signoff.indexOf(">") + 1);
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).toContain("display-em");
    expect(tag).not.toContain("font-hand");
    expect(signoff).toContain(">With love, from wherever you are.</p>");
  });

  it("prints no registry code, VAT id or registered address while unregistered", () => {
    for (const forbidden of [
      "Operated by",
      "OÜ",
      "Business Register",
      "EE1",
      "Sepapaja",
      "Tallinn",
    ]) {
      expect(phase0, forbidden).not.toContain(forbidden);
    }
  });

  it("ships none of the canvas's bracketed placeholders", () => {
    for (const placeholder of [
      "[COMPANY LEGAL NAME]",
      "[REGISTERED ADDRESS]",
      "[REGISTRATION NO]",
    ]) {
      expect(phase0, placeholder).not.toContain(placeholder);
    }
    expect(phase0).not.toMatch(/\[[A-Z][A-Z ]+\]/);
  });

  it("rejects `registered: true` with a missing registry code (the schema half)", () => {
    const { registrationNumber, ...missing } = REGISTERED;
    expect(registrationNumber).not.toBe("");
    const result = CompanySchema.safeParse(missing);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      "registrationNumber",
    );
  });

  it("rejects a registry code set while `registered` is false", () => {
    const result = CompanySchema.safeParse({
      ...REGISTERED,
      registered: false,
    });
    expect(result.success).toBe(false);
  });

  it("prints the clauses once all five exist (the `company-registered` state)", () => {
    const company = CompanySchema.parse(REGISTERED);
    const view = footerView("en", { company, registered: true });
    const markup = render(<SiteFooter locale="en" view={view} />);
    expect(markup).toContain("Flowers Overseas OÜ");
    expect(markup).toContain("Sepapaja 6, 15551, Tallinn");
    expect(markup).toContain("16123456");
    expect(companyIdentity(company, true)?.vatId).toBe("EE102345678");
  });

  it("keeps the message keys the component renders and the registry names in step", () => {
    // The component reads `company.description`/`company.operatedBy` through the view; if the
    // registry ever renamed them the copy would silently disappear, so the two are pinned.
    expect(COMPANY.descriptionKey).toBe("company.description");
    expect(COMPANY.operatedByKey).toBe("company.operatedBy");
    expect(COMPANY.contact.labelKey).toBe("company.support.label");
    expect(COMPANY.contact.hoursKey).toBe("company.support.hours");
  });
});

describe("§8: the payment colophon claims nothing", () => {
  it("names no method while none is available", () => {
    expect(availablePaymentMethods()).toEqual([]);
    for (const method of PAYMENT_METHODS) {
      expect(phase0, method.displayName).not.toContain(method.displayName);
    }
  });

  it("prints the one sentence that is true today, and no processor sentence (§14 A10)", () => {
    // First person, as §14 A5 asks of every sentence a buyer reads (TASK-084): *we* show them.
    expect(phase0).toContain(
      "We show the payment methods you can use at checkout.",
    );
    // A10: "processed by Stripe" renders only once a payment integration ships. Phase 0
    // processes no payment, so the sentence would claim a capability that does not exist.
    expect(phase0).not.toContain("Stripe");
  });

  it("ships no image at all — no logo, no badge; only our own mark and outlined wordmark", () => {
    expect(phase0).not.toContain("<img");
    expect(phase0.match(/<svg/g)).toHaveLength(2);
    expect(phase0).toContain("data-fo-wordmark");
  });

  it("names the methods the moment one becomes available, with no template edit", () => {
    const view = footerView("en", {
      paymentMethods: [
        {
          id: "visa",
          displayName: "Visa",
          kind: "card",
          markets: [],
          available: true,
          processor: "stripe",
          owningSpec: "013",
        },
      ],
    });
    const flipped = render(<SiteFooter locale="en" view={view} />);
    expect(flipped).toContain("Visa");
    // With a method available the integration has shipped, so the processor sentence appears.
    expect(flipped).toContain("Card payments are processed by Stripe");
    // The names *or* the placeholder, never both: with a method flipped, "shown at checkout"
    // would hedge a list that is right there (`/review 30` nit 1, the canvas's payment column).
    expect(flipped).not.toContain("shown at checkout");
  });
});

describe("Phase 0 AC 6: nothing fabricated", () => {
  it("renders no review, rating, star, testimonial or florist count", () => {
    for (const forbidden of [
      "★",
      "Trustpilot",
      "review",
      "Review",
      "rating",
      "Rating",
      "testimonial",
    ]) {
      expect(phase0, forbidden).not.toContain(forbidden);
    }
    // A florist *count*, not the word: the `For florists` link label is legitimate copy, and
    // `common.floristCount` stays unrendered (the TASK-040 carry-forward, spec §2).
    expect(phase0).not.toMatch(/\d+\s*florists?/i);
  });

  it("renders `TrustMarks` as nothing visible and no reserved box (§5.3)", () => {
    // The empty state is the *absence* of an element: the footer with marks is strictly longer.
    const populated = render(
      <SiteFooter
        locale="en"
        marks={[{ id: "example", name: "Example", licenceRef: "agreement-0" }]}
      />,
    );
    expect(populated.length).toBeGreaterThan(phase0.length);
    expect(populated).toContain("Example");
    expect(phase0).not.toContain("Example");
  });
});

describe("no control that does nothing (spec 004 §14 A20, A21 clause 1)", () => {
  it("renders no occasion-reminder form: its endpoint stores and sends nothing", () => {
    for (const control of [
      "<form",
      "<input",
      REMINDERS_ENDPOINT,
      REMINDERS_ANCHOR,
    ]) {
      expect(phase0, control).not.toContain(control);
    }
    expect(phase0).not.toContain("Occasion reminders");
    expect(phase0).not.toContain("Remind me");
    // The one control left is the consent re-open button, which does something.
    expect([...phase0.matchAll(/<button/g)]).toHaveLength(1);
  });
});

describe("the v2 colophon's look (chrome artboards, A21)", () => {
  it("carries the footer's airmail edge on paper-2", () => {
    const footer = phase0.slice(0, phase0.indexOf(">") + 1);
    expect(footer).toContain("airmail-edge-footer");
    expect(footer).toContain("bg-surface-raised");
  });

  it("links the logo home, named by the outlined wordmark (A21 clause 3)", () => {
    for (const locale of ["en", "de"] as const) {
      const html = render(<SiteFooter locale={locale} />, locale);
      const logo = html.slice(
        html.indexOf(`href="${localePath(locale, "home")}"`),
      );
      expect(logo.slice(0, logo.indexOf("</a>"))).toContain(
        `role="img" aria-label="${COMPANY.tradingName}"`,
      );
    }
    expect(phase0).not.toContain(`>${COMPANY.tradingName}<`);
  });

  it("gives every footer link the 44 px target", () => {
    const own = [...phase0.matchAll(/<a\s[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => !tag.includes('class="underline"'));
    expect(own.length).toBeGreaterThan(0);
    for (const tag of own) {
      expect(tag, tag).toContain("min-h-(--target-min)");
    }
    // The language list's links get it from their wrapper.
    expect(phase0).toContain("[&amp;_a]:min-h-(--target-min)");
  });

  it("prints the German footer in German (reviewed: false drafts)", () => {
    const de = render(<SiteFooter locale="de" />, "de");
    for (const word of [
      "Versand",
      "Zielländer",
      "Cookie-Einstellungen",
      "Zahlung",
    ]) {
      expect(de, word).toContain(word);
    }
    for (const word of ["Sending", "Cookie settings", "Payment"]) {
      expect(de, word).not.toContain(`>${word}<`);
    }
  });
});

describe("logical CSS and tokens only (AC-1, AC-5)", () => {
  const markup = [
    phase0,
    render(<SiteFooter locale="pl" />, "pl"),
    render(<SiteFooter locale="de" />, "de"),
  ].join("\n");

  it("emits no physical utility", () => {
    for (const physical of [
      /\bml-/,
      /\bmr-/,
      /\bpl-/,
      /\bpr-/,
      /\bleft-/,
      /\bright-/,
      /\btext-left\b/,
      /\btext-right\b/,
      /\bborder-l\b/,
      /\bborder-r\b/,
    ]) {
      expect(markup, String(physical)).not.toMatch(physical);
    }
  });

  it("emits no colour literal", () => {
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(markup).not.toMatch(/(?<![a-z])(?:rgba?|hsla?)\s*\(/);
  });
});
