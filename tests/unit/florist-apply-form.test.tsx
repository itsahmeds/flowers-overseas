/**
 * The application form's refused states as the page draws them (spec 011 §5.3 "Apply", §8
 * "Accessibility"; artboard `for-florists-apply-desktop.dc.html`, "errors" and the two small
 * states; TASK-213): T-12 (render half: the summary takes focus and links to each field, each
 * message is tied by `aria-describedby`, every answer is kept), T-13 (the too-many state offers
 * the phone and WhatsApp) and T-15 (the send-failed state keeps every answer and offers the phone).
 *
 * What a JavaScript-off post re-renders is this markup: the server action returns the state, and
 * `useActionState` hands it to the island during the server render.
 */
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { loadMessages } from "../../src/modules/i18n/index.ts";
import { MESSAGE_NAMESPACES } from "../../src/modules/i18n/messages.ts";
import type { ApplyFormState } from "../../src/modules/partners/application/state.ts";

vi.mock("next-intl/server", async () => {
  const { createTranslator: create } = await import("next-intl");
  const { loadMessages: load, MESSAGE_NAMESPACES: all } =
    await import("../../src/modules/i18n/messages.ts");
  return {
    setRequestLocale: (): void => undefined,
    getTranslations: ({ locale }: { locale: string }) =>
      Promise.resolve(create({ locale, messages: load(locale, [...all]) })),
  };
});

const { ApplyPage } =
  await import("../../src/modules/partners/ui/apply/ApplyPage.tsx");

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

const t = createTranslator({
  locale: "en",
  messages: loadMessages("en", [...MESSAGE_NAMESPACES]),
}) as unknown as (key: string, values?: Record<string, string>) => string;

/** The artboard's error state: three refused fields, the rest kept. Synthetic answers. */
const INVALID: ApplyFormState = {
  status: "invalid",
  attempt: 1,
  values: {
    businessName: "",
    contactName: "Piotr Nowak",
    email: "piotr.nowak@example",
    phone: "+48 512 345 678",
    country: "PL",
    town: "Kraków",
    capacityPerDay: "0",
    deliveryArea: "Stare Miasto, Kazimierz, Podgórze",
    weekendDelivery: "sometimes",
    contactPreference: "whatsapp",
    language: "en",
  },
  errors: {
    businessName: "forFlorists.apply.error.shopName",
    email: "forFlorists.apply.error.email",
    capacityPerDay: "forFlorists.apply.error.capacity",
  },
};

async function applyHtml(state?: ApplyFormState): Promise<string> {
  return render(
    await ApplyPage({
      locale: "en",
      form: "on",
      ...(state === undefined ? {} : { initialState: state }),
    }),
    "en",
  );
}

/** The opening tag of the control named `name`. */
function control(html: string, name: string): string {
  const tag = new RegExp(
    `<(input|select|textarea)[^>]*name="${name}"[^>]*>`,
    "u",
  ).exec(html)?.[0];
  if (tag === undefined) throw new Error(`no control ${name}`);
  return tag;
}

describe("T-12 (render half) / AC-12: field errors", () => {
  it("draws a summary that takes focus and links to each refused field, in the form's order", async () => {
    const html = await applyHtml(INVALID);
    const summary =
      /<div[^>]*id="ap-error-summary"[^>]*>[\s\S]*?<\/ul><\/div>/u.exec(
        html,
      )?.[0];
    expect(summary).toBeDefined();
    expect(summary).toMatch(/^<div[^>]*role="alert"/u);
    expect(summary).toMatch(/^<div[^>]*tabindex="-1"/u);
    expect(summary).toMatch(/^<div[^>]*autofocus=""/u);
    expect(summary).toContain(t("forFlorists.apply.errorSummary"));
    const links = [
      ...(summary ?? "").matchAll(/<a[^>]*href="#([^"]+)"[^>]*>([^<]+)<\/a>/gu),
    ].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["ap-shop", t("forFlorists.apply.error.shopName")],
      ["ap-email", t("forFlorists.apply.error.email")],
      ["ap-capacity", t("forFlorists.apply.error.capacity")],
    ]);
    // Each target exists.
    for (const [id] of links) expect(html).toContain(`id="${id ?? ""}"`);
  });

  it("puts each message under its field, tied by aria-describedby before the help text", async () => {
    const html = await applyHtml(INVALID);
    for (const [name, id, key, help] of [
      ["businessName", "ap-shop", "forFlorists.apply.error.shopName", true],
      ["email", "ap-email", "forFlorists.apply.error.email", false],
      [
        "capacityPerDay",
        "ap-capacity",
        "forFlorists.apply.error.capacity",
        true,
      ],
    ] as const) {
      const tag = control(html, name);
      expect(tag, name).toContain(
        `aria-describedby="${id}-error${help ? ` ${id}-help` : ""}"`,
      );
      expect(tag, name).toContain('aria-invalid="true"');
      expect(html).toContain(`<p class="`);
      expect(
        new RegExp(
          `<p[^>]*id="${id}-error"[^>]*>${t(key).replaceAll(".", "\\.")}</p>`,
          "u",
        ).test(html),
        name,
      ).toBe(true);
    }
    // A field that was not refused carries no error and no aria-invalid.
    expect(control(html, "contactName")).not.toContain("aria-invalid");
    expect(html).not.toContain('id="ap-name-error"');
  });

  it("keeps every answer, the refused ones included", async () => {
    const html = await applyHtml(INVALID);
    expect(control(html, "contactName")).toContain('value="Piotr Nowak"');
    expect(control(html, "email")).toContain('value="piotr.nowak@example"');
    expect(control(html, "phone")).toContain('value="+48 512 345 678"');
    expect(control(html, "town")).toContain('value="Kraków"');
    expect(control(html, "capacityPerDay")).toContain('value="0"');
    expect(html).toMatch(
      /<textarea[^>]*name="deliveryArea"[^>]*>Stare Miasto, Kazimierz, Podgórze<\/textarea>/u,
    );
    expect(html).toMatch(/<option value="PL" selected="">/u);
    expect(html).toMatch(
      /<input[^>]*name="weekendDelivery"[^>]*checked=""[^>]*value="sometimes"/u,
    );
    expect(html).toMatch(
      /<input[^>]*name="contactPreference"[^>]*checked=""[^>]*value="whatsapp"/u,
    );
  });

  it("draws no summary and no notice before the first post", async () => {
    const html = await applyHtml();
    expect(html).not.toContain("ap-error-summary");
    expect(html).not.toContain('id="ap-notice"');
    expect(html).toContain('data-fo-apply-state="idle"');
  });
});

describe("T-13 / T-15: the too-many and send-failed states", () => {
  for (const [status, key] of [
    ["failed", "forFlorists.apply.failed"],
    ["tooMany", "forFlorists.apply.tooMany"],
  ] as const) {
    it(`${status}: the notice takes focus, offers the phone and WhatsApp, and every answer is kept`, async () => {
      const html = await applyHtml({ ...INVALID, status, errors: {} });
      const notice = /<div[^>]*id="ap-notice"[^>]*>[\s\S]*?<\/p><\/div>/u.exec(
        html,
      )?.[0];
      expect(notice).toBeDefined();
      expect(notice).toMatch(/^<div[^>]*role="alert"/u);
      expect(notice).toMatch(/^<div[^>]*autofocus=""/u);
      expect(notice).toContain(`data-fo-apply-notice-state="${status}"`);
      const [before = ""] = t(key, { phoneDisplay: "\u0000" }).split("\u0000");
      expect(notice).toContain(before.replaceAll("'", "&#x27;"));
      expect(notice).toContain('href="tel:+12135925150"');
      expect(notice).toContain('href="https://wa.me/12135925150"');
      expect(html).not.toContain("ap-error-summary");
      expect(control(html, "contactName")).toContain('value="Piotr Nowak"');
    });
  }
});
