/**
 * Spec 010's checkout primitives, rendered (spec 010 §5.3; **AC-14** component half, **T-14**
 * component half, **AC-39** component half; TASK-201; `docs/design/wireframes/
 * checkout-{desktop,mobile}.dc.html`).
 *
 * Rendered with `react-dom/server`, the HTML a buyer without JavaScript receives. Each assertion
 * names the one value it is about (CLAUDE.md DoD §4): the id the link targets, the amount
 * `formatMoney` printed, the attribute that takes focus.
 *
 * The A17 guard at the end: no file under `src/modules/ui/checkout/` names a `checkout.*` or
 * `confirmation.*` key or imports `next-intl` (spec 003 §14 A17 clause 2, check 11, which lands
 * with TASK-224).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { findPhysicalUtility } from "../../eslint/fo/no-physical-css.js";
import { MoneySchema, formatMoney } from "../../src/modules/i18n";
import {
  localeRegistryOf,
  staticLocaleRegistry,
  withLocaleRegistry,
} from "../../src/modules/i18n/registry.ts";
import { BlurValidation } from "../../src/modules/ui/checkout/BlurValidation.tsx";
import { isOverLimit } from "../../src/modules/ui/checkout/counter-slot.ts";
import { FocusOnMount } from "../../src/modules/ui/checkout/FocusOnMount.tsx";
import { PrintedCardPreview } from "../../src/modules/ui/product/PrintedCardPreview.tsx";
import {
  ConfirmationRecap,
  DemoBanner,
  ErrorSummary,
  InlinePrivacyNotice,
  OrderSummaryPanel,
  PlaceOrderButton,
  PriceChangedNotice,
  RadioChipGroup,
  SampleDetailsButton,
  SelectField,
  StepProgress,
  StickyTotalBar,
  SubmitButton,
  TextAreaWithCounter,
  TextField,
} from "../../src/modules/ui/checkout";

const html = (node: ReactElement): string => renderToStaticMarkup(node);
const gbp = (amountMinor: number) =>
  MoneySchema.parse({ amountMinor, currency: "GBP" });
const pln = (amountMinor: number) =>
  MoneySchema.parse({ amountMinor, currency: "PLN" });

/** The opening tag of the element with `id`. */
function tagWithId(markup: string, id: string): string {
  const match = new RegExp(`<[a-z]+[^>]*\\sid="${id}"[^>]*>`).exec(markup);
  if (match === null) throw new Error(`no element with id ${id}`);
  return match[0];
}

function attribute(tag: string, name: string): string | undefined {
  // React writes `autoComplete` and `inputMode` in camelCase; HTML attribute names are
  // case-insensitive, so the browser reads them as `autocomplete` and `inputmode`.
  return new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
}

describe("ErrorSummary (AC-14)", () => {
  const items = [
    {
      fieldId: "recipient-name",
      text: "Recipient's name: Please fill this in to continue.",
    },
    {
      fieldId: "recipient-postcode",
      text: "Postcode: Please enter it in the form 00-001.",
    },
  ];
  const markup = html(
    <ErrorSummary
      id="errors"
      items={items}
      title="Please check these details"
    />,
  );
  const summary = tagWithId(markup, "errors");

  it("takes focus without JavaScript: focusable and autofocused", () => {
    expect(attribute(summary, "tabindex")).toBe("-1");
    expect(summary).toMatch(/\sautofocus=""/);
  });

  it("is announced and named by its title", () => {
    expect(attribute(summary, "role")).toBe("alert");
    expect(attribute(summary, "aria-labelledby")).toBe("errors-title");
    expect(tagWithId(markup, "errors-title")).toMatch(/^<h2/);
  });

  it("links each item to its field, in order, with the item's text", () => {
    const links = [
      ...markup.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g),
    ];
    expect(links.map((link) => link[1])).toEqual([
      "#recipient-name",
      "#recipient-postcode",
    ]);
    expect(links[0]?.[2]).toBe(
      "Recipient&#x27;s name: Please fill this in to continue.",
    );
  });

  it("renders nothing with no errors", () => {
    expect(html(<ErrorSummary items={[]} title="x" />)).toBe("");
  });

  it("does not autofocus in the gallery's static state", () => {
    const still = html(
      <ErrorSummary focusOnMount={false} id="still" items={items} title="t" />,
    );
    expect(tagWithId(still, "still")).not.toMatch(/autofocus/);
  });
});

describe("TextField (AC-14, §5.3 form quality)", () => {
  const errored = html(
    <TextField
      autoComplete="address-line1"
      defaultValue="Przykładowa"
      error="Please fill this in to continue."
      hint="Street, then number."
      id="street"
      label="Street and number"
      name="street"
      required
    />,
  );
  const input = tagWithId(errored, "street");

  it("ties the error and the hint by aria-describedby, error first", () => {
    expect(attribute(input, "aria-describedby")).toBe(
      "street-error street-hint",
    );
    expect(tagWithId(errored, "street-error")).not.toMatch(/\shidden/);
    expect(errored).toContain(
      '<span data-fo-error-text="">Please fill this in to continue.</span>',
    );
  });

  it("keeps the value the buyer typed", () => {
    expect(attribute(input, "value")).toBe("Przykładowa");
  });

  it("marks the error in text and with a mark, not by colour alone", () => {
    expect(attribute(input, "aria-invalid")).toBe("true");
    const error = tagWithId(errored, "street-error");
    expect(attribute(error, "data-fo-error")).toBe("server");
    expect(errored).toContain("before:content-[&#x27;!&#x27;]");
  });

  it("carries the visible label, autocomplete, 16 px type and a 50 px box", () => {
    expect(errored).toContain(
      '<label class="text-sm font-bold text-ink" for="street">',
    );
    expect(attribute(input, "autocomplete")).toBe("address-line1");
    expect(attribute(input, "class")).toMatch(/(^|\s)text-ui(\s|$)/);
    expect(attribute(input, "class")).toMatch(/min-h-\[50px\]/);
  });

  it("renders a hidden, empty error slot and no aria-invalid when valid", () => {
    const valid = html(<TextField id="name" label="Name" name="name" />);
    expect(tagWithId(valid, "name-error")).toMatch(/\shidden=""/);
    expect(tagWithId(valid, "name")).not.toMatch(/aria-invalid/);
    expect(attribute(tagWithId(valid, "name"), "aria-describedby")).toBe(
      "name-error",
    );
  });

  it("ties a warning too, and keeps inputmode tel for phones", () => {
    const phone = html(
      <TextField
        id="phone"
        inputMode="tel"
        label="Phone"
        name="phone"
        type="tel"
        warning="This does not look like a phone number in Poland."
      />,
    );
    const tag = tagWithId(phone, "phone");
    expect(attribute(tag, "aria-describedby")).toBe(
      "phone-error phone-warning",
    );
    expect(attribute(tag, "inputmode")).toBe("tel");
    expect(phone).toContain("before:content-[&#x27;i&#x27;]");
  });

  it("puts the on-blur messages on the control for the island", () => {
    const live = html(
      <TextField
        clientMessages={{ required: "Fill it", format: "Like 00-001" }}
        id="pc"
        label="Postcode"
        name="pc"
        pattern="\d{2}-\d{3}"
        required
      />,
    );
    const tag = tagWithId(live, "pc");
    expect(attribute(tag, "data-fo-msg-required")).toBe("Fill it");
    expect(attribute(tag, "data-fo-msg-format")).toBe("Like 00-001");
    expect(tag).toMatch(/\srequired=""/);
  });

  it("shows the optional label only on an optional field", () => {
    expect(
      html(
        <TextField id="o" label="Phone" name="o" optionalLabel="optional" />,
      ),
    ).toContain(">optional</span>");
    expect(
      html(
        <TextField
          id="r"
          label="Phone"
          name="r"
          optionalLabel="optional"
          required
        />,
      ),
    ).not.toContain("optional");
  });
});

describe("SelectField and RadioChipGroup", () => {
  it("keeps the chosen country and ties its error", () => {
    const markup = html(
      <SelectField
        defaultValue="de"
        error="Please choose a country from the list."
        id="country"
        label="Country you live in"
        name="country"
        options={[
          { value: "pl", label: "Poland" },
          { value: "de", label: "Germany" },
        ]}
      />,
    );
    expect(markup).toContain('<option value="de" selected="">Germany</option>');
    expect(attribute(tagWithId(markup, "country"), "aria-describedby")).toBe(
      "country-error",
    );
  });

  it("renders real radios in a fieldset with the default checked", () => {
    const markup = html(
      <RadioChipGroup
        defaultValue="hospital"
        id="place"
        legend="Where is it going?"
        name="placeKind"
        options={[
          { value: "home", label: "A home" },
          { value: "hospital", label: "A hospital" },
        ]}
      />,
    );
    expect(markup).toMatch(/^<fieldset/);
    expect(markup).toContain("<legend");
    const checked = [...markup.matchAll(/<input[^>]*checked=""[^>]*>/g)];
    expect(checked).toHaveLength(1);
    expect(attribute(checked[0]?.[0] ?? "", "value")).toBe("hospital");
  });
});

describe("TextAreaWithCounter", () => {
  const props = {
    counterTemplate: "{count} of 200 characters",
    id: "card",
    label: "Card message",
    max: 200,
    name: "cardMessage",
  } as const;

  it("draws the server's count and ties the counter", () => {
    const markup = html(
      <TextAreaWithCounter
        {...props}
        count={20}
        defaultValue="Happy birthday Mama!"
        formattedCount="20"
      />,
    );
    expect(tagWithId(markup, "card-count")).toMatch(/data-over="false"/);
    expect(markup).toContain(">20 of 200 characters</p>");
    expect(attribute(tagWithId(markup, "card"), "aria-describedby")).toBe(
      "card-error card-count",
    );
    expect(markup).toContain(">Happy birthday Mama!</textarea>");
  });

  it("flags a count over the limit", () => {
    const markup = html(
      <TextAreaWithCounter
        {...props}
        count={205}
        defaultValue="x"
        formattedCount="205"
      />,
    );
    expect(tagWithId(markup, "card-count")).toMatch(/data-over="true"/);
  });

  it("isolates the card and the signature in the preview", () => {
    const markup = html(
      <TextAreaWithCounter
        {...props}
        count={5}
        defaultValue="Hello"
        formattedCount="5"
        preview={{
          label: "Preview of the printed card",
          printed: "Printed on our card · included",
          signature: "Love, Anna",
          signatureFieldId: "sign",
        }}
      />,
    );
    expect(markup).toContain(
      '<bdi data-fo-mirror="card" dir="auto">Hello</bdi>',
    );
    expect(markup).toContain(
      '<bdi data-fo-mirror="sign" dir="auto">Love, Anna</bdi>',
    );
    expect(markup).toContain("Printed on our card · included</figcaption>");
  });
});

/**
 * Spec 042 AC-11 / T-11 (unit half; TASK-308): checkout step 2's preview is the product page's
 * component, `PrintedCardPreview`, so the root attribute, the card and the message line's face are
 * the product page's by construction; these cases pin that the primitive renders it, with the
 * kept values, the signature and `card.preview` as its caption, and no sample. The page half (the
 * e2e at `/{locale}/checkout` step 2 with JavaScript off) is TASK-204's.
 */
describe("TextAreaWithCounter's card preview is the product page's (spec 042 AC-11)", () => {
  const props = {
    counterTemplate: "{count} of 200 characters",
    id: "card",
    label: "Card message",
    max: 200,
    name: "cardMessage",
  } as const;
  const checkoutEn = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../messages/en.json", import.meta.url)),
      "utf8",
    ),
  ) as {
    checkout: { card: { preview: string; previewLabel: string } };
    product: { card: { printed: string } };
  };
  const preview = {
    label: checkoutEn.checkout.card.previewLabel,
    printed: checkoutEn.checkout.card.preview,
    signatureFieldId: "sign",
  };

  /** The `<figure>` the primitive draws. */
  const figureOf = (markup: string): string =>
    /<figure[^>]*>[\s\S]*<\/figure>/u.exec(markup)?.[0] ?? "";
  /** The class of the first element carrying `attribute`. */
  const classOf = (markup: string, attribute: string): string =>
    new RegExp(`<\\w+[^>]*? class="([^"]*)"[^>]*${attribute}`, "u").exec(
      markup,
    )?.[1] ?? "";

  const checkout = html(
    <TextAreaWithCounter
      {...props}
      count={20}
      defaultValue="Happy birthday Mama!"
      formattedCount="20"
      preview={{ ...preview, signature: "Love, Anna" }}
    />,
  );
  const product = html(
    <PrintedCardPreview
      caption={checkoutEn.product.card.printed}
      messageFieldId="pdp-card-message"
      sample="Your message, printed on our card and tucked into the bouquet."
    />,
  );

  it("renders the one card component: the same root, card and words line as the product page", () => {
    const figure = figureOf(checkout);
    expect(figure).toMatch(
      /^<figure aria-label="Preview of the printed card"/u,
    );
    expect(figure).toContain('data-fo-card-preview="true"');
    // The card's classes are the product page's, plus the phone's order (above the field).
    expect(classOf(checkout, "data-fo-card-preview")).toBe(
      `${classOf(product, "data-fo-card-preview")} max-md:order-first`,
    );
    // The words line carries the same classes on both pages, so the same computed face: Caveat
    // (`font-hand`), not checkout's old display face.
    const line = classOf(checkout, "data-fo-card-text");
    expect(line).toBe(classOf(product, "data-fo-card-text"));
    expect(line.split(" ")).toContain("font-hand");
    expect(figure).not.toMatch(/font-display/u);
    // The Caveat variables are in scope on the card itself (`handFontVariables`).
    expect(classOf(checkout, "data-fo-card-preview")).toMatch(
      /^\S+ \S+ bg-card /u,
    );
  });

  it("renders the server's kept message and signature, each isolated, and `card.preview` as the caption", () => {
    const figure = figureOf(checkout);
    expect(checkoutEn.checkout.card.preview).toBe(
      "Printed on our card · included",
    );
    expect(figure).toContain(
      '<p class="font-hand m-0 text-[22px] leading-[1.25] font-[500] wrap-anywhere whitespace-pre-line col-start-1 row-start-1 text-ink" data-fo-card-text="true"><bdi data-fo-mirror="card" dir="auto">Happy birthday Mama!</bdi></p>',
    );
    expect(figure).toContain(
      '<p class="font-hand m-0 text-[22px] leading-[1.25] font-[500] wrap-anywhere whitespace-pre-line text-ink" data-fo-card-signature="true"><bdi data-fo-mirror="sign" dir="auto">Love, Anna</bdi></p>',
    );
    expect(figure).toMatch(
      /<figcaption[^>]*>Printed on our card · included<\/figcaption><\/figure>$/u,
    );
  });

  it("has no sample and no crossfade at checkout; an empty card is the mark and the caption (PR 297 escalation 1)", () => {
    const empty = figureOf(
      html(
        <TextAreaWithCounter
          {...props}
          count={0}
          formattedCount="0"
          preview={preview}
        />,
      ),
    );
    expect(empty).not.toContain("data-fo-card-sample");
    expect(empty).not.toContain("data-fo-card-swap");
    expect(empty).toContain('<bdi data-fo-mirror="card" dir="auto"></bdi>');
    expect(empty).toContain('<bdi data-fo-mirror="sign" dir="auto"></bdi>');
    // No words anywhere on the card but the caption.
    expect(empty.replaceAll(/<[^>]+>/gu, "")).toBe(
      "Printed on our card · included",
    );
  });

  it("draws the signature alone when the message is blank", () => {
    const signatureOnly = figureOf(
      html(
        <TextAreaWithCounter
          {...props}
          count={0}
          formattedCount="0"
          preview={{ ...preview, signature: "Love, Anna" }}
        />,
      ),
    );
    expect(signatureOnly.replaceAll(/<[^>]+>/gu, "")).toBe(
      "Love, AnnaPrinted on our card · included",
    );
  });
});

describe("StepProgress", () => {
  const markup = html(
    <StepProgress
      compactLabel="Step 2 of 3 · Card and you"
      current={1}
      label="Checkout steps"
      locale="en"
      steps={[
        { id: "recipient", name: "Recipient", href: "?step=recipient" },
        { id: "card", name: "Card and you" },
        { id: "review", name: "Check" },
      ]}
    />,
  );

  it("is a labelled list with one current step", () => {
    expect(markup).toContain('<ol aria-label="Checkout steps"');
    const current = [
      ...markup.matchAll(/aria-current="step"[^>]*data-fo-step="([a-z]+)"/g),
    ];
    expect(current.map((match) => match[1])).toEqual(["card"]);
  });

  it("links the completed step and only that one", () => {
    const links = [...markup.matchAll(/<a[^>]*href="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(links).toEqual(["?step=recipient"]);
  });
});

describe("OrderSummaryPanel: price shown = price charged", () => {
  const markup = html(
    <OrderSummaryPanel
      card={{ message: "Happy birthday Mama!", signature: "Love, Anna" }}
      currencyLine="You pay in GBP. Our florist is paid in złoty."
      id="sum"
      includedLabel="included"
      item={{ name: "Amber Hour", details: ["18 stems"] }}
      lines={[
        {
          id: "bouquet",
          label: "18 stems",
          amount: { kind: "money", money: gbp(4590) },
        },
        { id: "delivery", label: "Delivery", amount: { kind: "included" } },
      ]}
      locale="en-gb"
      title="Your order"
      total={gbp(4590)}
      totalLabel="You pay"
      vatLines={[{ id: "vat-800", label: "Of which VAT 8%", money: gbp(340) }]}
    />,
  );

  it("prints the quote's total through formatMoney in a polite live region", () => {
    const total =
      /<div aria-atomic="true" aria-live="polite"[^>]*data-fo-total=""[^>]*>(.*?)<\/div>/.exec(
        markup,
      );
    expect(total?.[1]).toContain(
      `>${formatMoney(gbp(4590), "en-gb")}</strong>`,
    );
  });

  it("shows the VAT inside the total and the currency line", () => {
    expect(markup).toContain(`>${formatMoney(gbp(340), "en-gb")}</dd>`);
    expect(markup).toContain(
      ">You pay in GBP. Our florist is paid in złoty.</p>",
    );
    expect(markup).toMatch(
      /data-fo-line="delivery"[^>]*><dt[^>]*>Delivery<\/dt><dd[^>]*>included<\/dd>/,
    );
  });

  it("isolates the product name and the card", () => {
    expect(markup).toContain("<bdi>Amber Hour</bdi>");
    expect(markup).toContain(
      "<bdi>Happy birthday Mama!</bdi> <bdi>Love, Anna</bdi>",
    );
  });

  it("formats in the page's locale, not the currency's", () => {
    const pl = html(
      <OrderSummaryPanel
        includedLabel="w cenie"
        item={{ name: "Amber Hour", details: [] }}
        lines={[]}
        locale="pl"
        title="Twoje zamówienie"
        total={pln(22900)}
        totalLabel="Płacisz"
      />,
    );
    expect(pl).toContain(`>${formatMoney(pln(22900), "pl")}</strong>`);
  });
});

describe("StickyTotalBar (AC-39 component half)", () => {
  const markup = html(
    <StickyTotalBar
      action={
        <SubmitButton form="step-1">Continue to your details</SubmitButton>
      }
      locale="en-gb"
      total={gbp(4590)}
      totalLabel="You pay"
    />,
  );
  const bar =
    /<div[^>]*data-fo-sticky-total=""[^>]*>.*$/.exec(markup)?.[0] ?? "";

  it("carries the total through formatMoney", () => {
    expect(bar).toContain(`>${formatMoney(gbp(4590), "en-gb")}</strong>`);
    expect(bar).toContain(">You pay</small>");
  });

  it("carries the step's primary action, submitting the step's form", () => {
    const button = /<button[^>]*>/.exec(bar)?.[0] ?? "";
    expect(attribute(button, "form")).toBe("step-1");
    expect(attribute(button, "type")).toBe("submit");
    expect(bar).toContain(">Continue to your details</button>");
  });

  it("is fixed to the bottom below lg, hidden from lg, with a spacer in the flow", () => {
    const tag =
      /<div[^>]*data-fo-sticky-total=""[^>]*>/.exec(markup)?.[0] ?? "";
    expect(tag).toMatch(/\bfixed\b/);
    expect(tag).toMatch(/\bbottom-0\b/);
    expect(tag).toMatch(/\blg:hidden\b/);
    expect(markup).toMatch(
      /^<div aria-hidden="true" class="h-\[76px\] lg:hidden"><\/div>/,
    );
  });

  it("is not a second live region", () => {
    expect(bar).not.toContain("aria-live");
  });
});

describe("notices, banner and buttons", () => {
  it("names both prices, formatted, and confirms at the new one", () => {
    const seen: string[] = [];
    const markup = html(
      <PriceChangedNotice
        confirmLabel={(current) => `Continue at ${current}`}
        current={gbp(4620)}
        locale="en-gb"
        message={({ previous, current }) => {
          seen.push(previous, current);
          return `${previous} to ${current}`;
        }}
        previous={gbp(4590)}
      />,
    );
    expect(seen).toEqual([
      formatMoney(gbp(4590), "en-gb"),
      formatMoney(gbp(4620), "en-gb"),
    ]);
    expect(markup).toMatch(/role="alert"/);
    const confirm = /<button[^>]*>/.exec(markup)?.[0] ?? "";
    expect(attribute(confirm, "name")).toBe("confirmedTotalMinor");
    expect(attribute(confirm, "value")).toBe("4620");
    expect(markup).toContain(
      `>Continue at ${formatMoney(gbp(4620), "en-gb")}</button>`,
    );
  });

  it("the demo banner has no control and is a note", () => {
    const markup = html(
      <DemoBanner body="Nothing is charged." title="This is a demo order." />,
    );
    expect(markup).not.toMatch(/<button|<a\s/);
    expect(markup).toMatch(/role="note"/);
    expect(markup).toContain("<strong");
  });

  it("the sample-details button is a submit with its intent", () => {
    const markup = html(
      <InlinePrivacyNotice
        action={<SampleDetailsButton label="Use sample details" />}
        message="Please use sample details."
      />,
    );
    const button = /<button[^>]*>/.exec(markup)?.[0] ?? "";
    expect(attribute(button, "name")).toBe("intent");
    expect(attribute(button, "value")).toBe("sample");
    expect(attribute(button, "type")).toBe("submit");
    expect(markup).toContain(">Use sample details</button>");
  });

  it("the place button shows its label, and the pending label when pending", () => {
    const idle = html(
      <PlaceOrderButton
        label="Place demo order. Nothing is charged."
        pendingLabel="Placing your demo order…"
      />,
    );
    expect(idle).toContain(">Place demo order. Nothing is charged.</span>");
    expect(idle).not.toContain("aria-disabled");
    const busy = html(
      <PlaceOrderButton
        forcePending
        label="Place demo order. Nothing is charged."
        pendingLabel="Placing your demo order…"
      />,
    );
    expect(busy).toContain(
      '<span aria-live="polite">Placing your demo order…</span>',
    );
    expect(busy).toMatch(/aria-disabled="true"/);
    expect(busy).toMatch(/type="submit"/);
  });
});

describe("ConfirmationRecap", () => {
  it("isolates the recipient and the card, and prints the total", () => {
    const markup = html(
      <ConfirmationRecap
        card={{ message: "Happy birthday Mama!", signature: "Love, Anna" }}
        date="8 October"
        item={{ name: "Amber Hour", details: ["18 stems"] }}
        labels={{ recipient: "Recipient", date: "Date", card: "Card" }}
        locale="en-gb"
        note="Nothing was charged."
        recipient={{
          name: "Anna Przykładowa",
          address: "ul. Marszałkowska 10/5, 00-001 Warszawa",
        }}
        title="Your order"
        total={gbp(4590)}
        totalLabel="You pay"
      />,
    );
    expect(markup).toContain(
      "<bdi>Anna Przykładowa</bdi><br/><bdi>ul. Marszałkowska 10/5, 00-001 Warszawa</bdi>",
    );
    expect(markup).toContain(`>${formatMoney(gbp(4590), "en-gb")}</strong>`);
    expect(markup).not.toMatch(/@|\+48/);
  });
});

describe("spec 003 A17: the primitives name no checkout key", () => {
  const dir = fileURLToPath(
    new URL("../../src/modules/ui/checkout/", import.meta.url),
  );
  for (const file of readdirSync(dir)) {
    it(`${file} names no checkout or confirmation key and imports no next-intl`, () => {
      const source = readFileSync(`${dir}${file}`, "utf8");
      // The usage scan of `i18n:check` (and A17's check 11) matches a fully-qualified key
      // anywhere in a file, comments included, so none may appear here.
      expect(source).not.toMatch(/\b(checkout|confirmation)\.[a-z]\w*\.\w/);
      expect(source).not.toMatch(/from "next-intl/);
    });
  }
});

/**
 * `/break` round 1 on PR 206 (TASK-201): each case below is the one a surviving mutation needed.
 * The hole it closes is named in the case.
 */
describe("the cases the first breaker round asked for", () => {
  it("binds the label to the control's id, not its name (hole 2)", () => {
    const markup = html(
      <TextField
        id="recipient-postcode"
        label="Postcode"
        name="postcode"
        required
      />,
    );
    expect(markup).toContain('for="recipient-postcode"');
    expect(markup).not.toContain('for="postcode"');
    expect(attribute(tagWithId(markup, "recipient-postcode"), "name")).toBe(
      "postcode",
    );
  });

  it("pads the sticky bar above the phone's home indicator (hole 3, AC-39)", () => {
    const markup = html(
      <StickyTotalBar locale="en-gb" total={gbp(4590)} totalLabel="You pay" />,
    );
    const tag =
      /<div[^>]*data-fo-sticky-total=""[^>]*>/.exec(markup)?.[0] ?? "";
    expect(attribute(tag, "class")?.split(/\s+/)).toContain(
      "pb-[calc(14px+env(safe-area-inset-bottom))]",
    );
  });

  it("names no physical-direction utility in any class string of the module (hole 4)", () => {
    // `fo/no-physical-css` reads literal `className` values only; a class kept in a constant
    // (`position`, `CHIP`, the shared `styles.ts`) is read here, by the rule's own tables.
    const directory = fileURLToPath(
      new URL("../../src/modules/ui/checkout/", import.meta.url),
    );
    const offenders = readdirSync(directory)
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const source = readFileSync(`${directory}${file}`, "utf8");
        return [...source.matchAll(/"([^"\n]*)"|`([^`]*)`|'([^'\n]*)'/g)]
          .flatMap((match) =>
            (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/),
          )
          .filter(
            (token) => token !== "" && findPhysicalUtility(token) !== null,
          )
          .map((token) => `${file}: ${token}`);
      });
    expect(offenders).toEqual([]);
  });

  it("links a step only when it is behind the current one, whatever href it carries (hole 6)", () => {
    const markup = html(
      <StepProgress
        compactLabel="Step 2 of 3"
        current={1}
        label="Checkout steps"
        locale="en"
        steps={[
          { id: "recipient", name: "Recipient", href: "#step-recipient" },
          { id: "card", name: "Card and you", href: "#step-card" },
          { id: "review", name: "Check", href: "#step-review" },
        ]}
      />,
    );
    const links = [...markup.matchAll(/<a[^>]*href="([^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(links).toEqual(["#step-recipient"]);
  });

  it("renders no link for a done step that has no href (low)", () => {
    const markup = html(
      <StepProgress
        compactLabel="Step 2 of 3"
        current={1}
        label="Checkout steps"
        locale="en"
        steps={[
          { id: "recipient", name: "Recipient" },
          { id: "card", name: "Card and you" },
          { id: "review", name: "Check" },
        ]}
      />,
    );
    expect(markup).not.toContain("<a");
  });

  it("allows a card of exactly the limit (hole 7)", () => {
    expect(isOverLimit(200, 200)).toBe(false);
    expect(isOverLimit(201, 200)).toBe(true);
    const markup = html(
      <TextAreaWithCounter
        count={200}
        counterTemplate="{count} of 200 characters"
        defaultValue="x"
        formattedCount="200"
        id="card"
        label="Card message"
        max={200}
        name="cardMessage"
      />,
    );
    expect(attribute(tagWithId(markup, "card-count"), "data-over")).toBe(
      "false",
    );
  });

  it("lets the card text set its own direction (hole 8)", () => {
    const markup = html(
      <TextAreaWithCounter
        count={0}
        counterTemplate="{count} of 200 characters"
        formattedCount="0"
        id="card"
        label="Card message"
        max={200}
        name="cardMessage"
      />,
    );
    expect(attribute(tagWithId(markup, "card"), "dir")).toBe("auto");
  });

  it("marks an errored select invalid, and every chip radio required (hole 9)", () => {
    const select = html(
      <SelectField
        error="Please choose a country from the list."
        id="country"
        label="Country"
        name="country"
        options={[{ value: "pl", label: "Poland" }]}
      />,
    );
    expect(attribute(tagWithId(select, "country"), "aria-invalid")).toBe(
      "true",
    );
    const radios = html(
      <RadioChipGroup
        id="place"
        legend="Where is it going?"
        name="placeKind"
        options={[
          { value: "home", label: "A home" },
          { value: "work", label: "A workplace" },
        ]}
        required
      />,
    );
    const inputs = [...radios.matchAll(/<input[^>]*>/g)].map((m) => m[0]);
    expect(inputs).toHaveLength(2);
    for (const input of inputs) expect(input).toMatch(/\srequired=""/);
  });

  it("announces the privacy notice as a note, not an alert (hole 10)", () => {
    const markup = html(
      <InlinePrivacyNotice message="Please use sample details." />,
    );
    const tag =
      /<div[^>]*data-fo-privacy-notice=""[^>]*>/.exec(markup)?.[0] ?? "";
    expect(attribute(tag, "role")).toBe("note");
  });

  it("writes the step numbers in the locale's digits (hole 11)", async () => {
    // A registry where `de` formats with Arabic-Indic digits: `String(index + 1)` would still
    // print 1, 2, 3.
    const registry = localeRegistryOf(
      staticLocaleRegistry
        .list()
        .map((locale) =>
          locale.code === "de"
            ? { ...locale, formattingTag: "ar-EG-u-nu-arab" }
            : locale,
        ),
    );
    const markup = await withLocaleRegistry(registry, () =>
      html(
        <StepProgress
          compactLabel="x"
          current={0}
          label="Schritte"
          locale="de"
          steps={[
            { id: "recipient", name: "Empfänger" },
            { id: "card", name: "Karte" },
            { id: "review", name: "Prüfen" },
          ]}
        />,
      ),
    );
    expect(markup).toContain("١ · Empfänger");
    expect(markup).toContain("٣ · Prüfen");
  });

  it("mounts the focus island on the summary, keyed on the submit (hole 12, D2)", () => {
    const tree = ErrorSummary({
      attempt: 2,
      id: "errors",
      items: [{ fieldId: "street", text: "Street: Please fill this in." }],
      title: "Please check these details",
    });
    const found: ReactElement[] = [];
    const walk = (node: ReactNode): void => {
      if (Array.isArray(node)) {
        for (const child of node as ReactNode[]) walk(child);
        return;
      }
      if (!isValidElement(node)) return;
      if (node.type === FocusOnMount) found.push(node);
      walk((node.props as { children?: ReactNode }).children);
    };
    walk(tree);
    expect(found.map((node) => node.props)).toEqual([
      { attempt: 2, targetId: "errors" },
    ]);
  });

  it("renders the form's polite live region for the on-blur messages (D1)", () => {
    const markup = html(
      <BlurValidation announceTemplate="{field}: {message}" formId="step-1" />,
    );
    const tag = tagWithId(markup, "step-1-status");
    expect(attribute(tag, "role")).toBe("status");
    expect(attribute(tag, "aria-live")).toBe("polite");
    expect(attribute(tag, "class")).toBe("sr-only");
  });

  it.each([
    ["an empty string", ""],
    ["null", null],
    ["false", false],
  ])("draws no error and no aria-invalid for %s (nit)", (_name, error) => {
    for (const markup of [
      html(<TextField error={error} id="f" label="Name" name="f" />),
      html(
        <SelectField
          error={error}
          id="f"
          label="Country"
          name="f"
          options={[{ value: "pl", label: "Poland" }]}
        />,
      ),
      html(
        <TextAreaWithCounter
          count={0}
          counterTemplate="{count} of 200"
          error={error}
          formattedCount="0"
          id="f"
          label="Card"
          max={200}
          name="f"
        />,
      ),
    ]) {
      expect(tagWithId(markup, "f")).not.toMatch(/aria-invalid/);
      const slot = tagWithId(markup, "f-error");
      expect(slot).toMatch(/\shidden=""/);
      expect(attribute(slot, "data-fo-error")).toBe("client");
    }
  });
});
