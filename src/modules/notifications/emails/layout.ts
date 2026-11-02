/**
 * The one email layout and the parts every template is built from (spec 016 §5.3 "Email
 * templates": one layout, logo, body, footer with trader identity and support contact, HTML plus
 * plain text, `lang` and `dir` per locale, logical spacing only; artboard
 * `docs/design/wireframes/email-layout-{desktop,mobile}.dc.html`; AC-21; TASK-332).
 *
 * `emailDocument` takes an **audience** (the artboard's three frames):
 *  - `buyer`: the full footer, i.e. what we do, help and WhatsApp, the trader identity (only once
 *    the company is registered), and why you got this email;
 *  - `florist`: help and why, and the "For our florists" label in the header;
 *  - `ops`: the founder's frame, the "Internal" label and the "sent to" line.
 *
 * The copy of each frame is passed in by the caller (already translated: florist and buyer copy
 * from the public catalogues, ops copy from the admin catalogue), so this module holds no string a
 * reader sees. One 600 px column on a `paper-2` ground; at 620 px and below (phones) the card
 * fills the screen with 20 px padding and the button goes full width, through the `<style>` block's
 * one media query (inline styles carry the desktop values, which every client reads).
 *
 * Every part returns a `Block`: its markup and how it spaces against its neighbours (20 px apart,
 * 18 on a phone; 12 px after an eyebrow and before a note under a button, the artboard's `-8px`).
 */
import { type LocaleCode, localeConfig } from "@/config/locales";

import {
  type Child,
  el,
  fragment,
  type SafeHtml,
  type Style,
  text,
  trusted,
} from "./html";
import { EMAIL_FONTS, EMAIL_MEASURES as M, colour } from "./theme";

export type EmailAudience = "buyer" | "florist" | "ops";

/** One block of the body. */
export interface Block {
  readonly html: SafeHtml;
  /** 12 px (not 20) between this block and the one after it: an eyebrow. */
  readonly tightAfter?: boolean;
  /** 12 px (not 20) between the block before and this one: a note under a button. */
  readonly tightBefore?: boolean;
}

/** One line of the footer. */
export interface FooterLine {
  readonly html: SafeHtml;
  /** The help line: ink, not ink-2. */
  readonly ink?: boolean;
}

/** What the layout prints around the body, already translated. */
export interface EmailFrame {
  readonly audience: EmailAudience;
  /** The header's label at the inline end ("For our florists", "Internal"); none for a buyer. */
  readonly audienceLabel: string | null;
  /** The brand as the wordmark prints it (`TRADING_NAME`). */
  readonly brand: string;
  /** Footer lines in order, each a paragraph, in ink-2; the help line is printed in ink. */
  readonly footer: readonly FooterLine[];
}

export interface EmailDocumentInput {
  readonly locale: LocaleCode;
  /** The `<title>`: the subject. */
  readonly subject: string;
  /** The inbox preview line, hidden in the body. */
  readonly preheader: string;
  readonly frame: EmailFrame;
  /** The founder's alert band under the header (butter), when the template has one. */
  readonly band?: SafeHtml | null;
  readonly blocks: readonly Block[];
}

const BODY_TEXT: Style = {
  "font-family": EMAIL_FONTS.body,
  "font-size": M.body,
  "line-height": "1.55",
  color: colour("ink"),
};

/** The phone rules; inline styles hold the desktop values. Class names are `fo-*` only. */
const PHONE_CSS = [
  "@media only screen and (max-width:620px){",
  `.fo-ground{padding:0!important;background:${colour("card")}!important}`,
  ".fo-card{width:100%!important;max-width:100%!important;border:0!important;border-radius:0!important}",
  ".fo-top{padding:20px 20px 16px!important}",
  ".fo-band{padding:12px 20px!important}",
  ".fo-body{padding:24px 20px 28px!important}",
  ".fo-foot{padding:20px 20px 28px!important}",
  `.fo-gap{margin-bottom:${M.phoneBlockGap}px!important}`,
  `.fo-h1{font-size:${M.phoneHeading}px!important}`,
  `.fo-p{font-size:${M.phoneBody}px!important}`,
  ".fo-fact th,.fo-fact td{display:block!important;width:auto!important}",
  ".fo-fact th{padding-bottom:2px!important;border-bottom:0!important}",
  ".fo-fact td{padding-top:0!important}",
  ".fo-btn-table{width:100%!important}",
  ".fo-btn{display:block!important}",
  "}",
].join("");

/** The mark of the committed lockup, drawn as on the artboard (Gmail drops it; the wordmark stays). */
function logoMark(): SafeHtml {
  const ink = colour("logo-ink");
  const accent = colour("logo-accent");
  return trusted(
    `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" focusable="false" aria-hidden="true" style="display:block">` +
      `<circle cx="8" cy="40" r="3" fill="${accent}"/>` +
      `<path d="M8 40 C 20 40, 26 34, 30 22" stroke="${ink}" fill="none" stroke-width="2.4" stroke-linecap="round"/>` +
      `<g transform="translate(31 16)" stroke="${ink}" fill="none" stroke-width="2.2">` +
      `<circle cx="0" cy="-6" r="4"/><circle cx="5.7" cy="-1.9" r="4"/><circle cx="3.5" cy="4.9" r="4"/>` +
      `<circle cx="-3.5" cy="4.9" r="4"/><circle cx="-5.7" cy="-1.9" r="4"/>` +
      `<circle cx="0" cy="0" r="2" fill="${accent}" stroke="none"/></g></svg>`,
  );
}

function header(frame: EmailFrame): SafeHtml {
  return el(
    "tr",
    {},
    el(
      "td",
      {
        class: "fo-top",
        style: {
          padding: `28px ${M.gutter}px 20px`,
          "border-bottom": `1px solid ${colour("rule")}`,
        },
      },
      el(
        "table",
        {
          role: "presentation",
          width: "100%",
          cellpadding: 0,
          cellspacing: 0,
          style: { "border-collapse": "collapse" },
        },
        el(
          "tr",
          {},
          el(
            "td",
            { width: 28, style: { width: "28px", "vertical-align": "middle" } },
            logoMark(),
          ),
          el(
            "td",
            {
              style: {
                "padding-inline-start": "10px",
                "vertical-align": "middle",
                "font-family": EMAIL_FONTS.logo,
                "font-size": 20,
                "letter-spacing": "0.04em",
                color: colour("logo-ink"),
                "white-space": "nowrap",
              },
            },
            frame.brand,
          ),
          frame.audienceLabel === null
            ? null
            : el(
                "td",
                {
                  style: {
                    "text-align": "end",
                    "vertical-align": "middle",
                    "font-family": EMAIL_FONTS.body,
                    "font-size": M.label,
                    "font-weight": 700,
                    "letter-spacing": "0.14em",
                    "text-transform": "uppercase",
                    color: colour("ink-3"),
                  },
                },
                frame.audienceLabel,
              ),
        ),
      ),
    ),
  );
}

function bandRow(band: SafeHtml): SafeHtml {
  return el(
    "tr",
    {},
    el(
      "td",
      {
        class: "fo-band",
        style: {
          padding: `12px ${M.gutter}px`,
          background: colour("butter"),
          "border-bottom": `1px solid ${colour("rule")}`,
          "font-family": EMAIL_FONTS.body,
          "font-size": 16,
          "font-weight": 700,
          "line-height": "1.5",
          color: colour("ink"),
        },
      },
      band,
    ),
  );
}

function bodyRow(blocks: readonly Block[]): SafeHtml {
  const spaced = blocks.map((block, index) => {
    const next = blocks[index + 1];
    const last = next === undefined;
    const tight = block.tightAfter === true || next?.tightBefore === true;
    const gap = last ? 0 : tight ? M.blockGap - 8 : M.blockGap;
    return el(
      "div",
      {
        class: last || tight ? null : "fo-gap",
        style: { margin: `0 0 ${gap}px` },
      },
      block.html,
    );
  });
  return el(
    "tr",
    {},
    el(
      "td",
      {
        class: "fo-body",
        style: { padding: `32px ${M.gutter}px 36px`, ...BODY_TEXT },
      },
      ...spaced,
    ),
  );
}

function footerRow(frame: EmailFrame): SafeHtml {
  return el(
    "tr",
    {},
    el(
      "td",
      {
        class: "fo-foot",
        style: {
          padding: `24px ${M.gutter}px 32px`,
          background: colour("paper-2"),
          "border-top": `1px solid ${colour("rule")}`,
          "border-radius": `0 0 ${M.radiusCard}px ${M.radiusCard}px`,
        },
      },
      ...frame.footer.map((line, index) =>
        el(
          "p",
          {
            style: {
              margin: index === frame.footer.length - 1 ? "0" : "0 0 8px",
              "font-family": EMAIL_FONTS.body,
              "font-size": M.small,
              "line-height": "1.5",
              color: line.ink === true ? colour("ink") : colour("ink-2"),
            },
          },
          line.html,
        ),
      ),
    ),
  );
}

/** The whole HTML part: doctype, `lang` and `dir` from the locale config, the card. */
export function emailDocument(input: EmailDocumentInput): string {
  const config = localeConfig(input.locale);
  const card = el(
    "table",
    {
      class: "fo-card",
      role: "presentation",
      width: M.card,
      cellpadding: 0,
      cellspacing: 0,
      style: {
        width: `${M.card}px`,
        "max-width": `${M.card}px`,
        margin: "0 auto",
        background: colour("card"),
        border: `1px solid ${colour("rule")}`,
        "border-radius": `${M.radiusCard}px`,
        "border-collapse": "separate",
      },
    },
    header(input.frame),
    input.band === undefined || input.band === null
      ? null
      : bandRow(input.band),
    bodyRow(input.blocks),
    footerRow(input.frame),
  );
  const page = el(
    "html",
    { lang: config.bcp47, dir: config.dir },
    el(
      "head",
      {},
      el("meta", { charset: "utf-8" }),
      el("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      }),
      el("meta", { name: "color-scheme", content: "light" }),
      el("meta", { name: "supported-color-schemes", content: "light" }),
      el("title", {}, input.subject),
      el("style", {}, trusted(PHONE_CSS)),
    ),
    el(
      "body",
      {
        style: {
          margin: "0",
          padding: "0",
          background: colour("paper-2"),
          "-webkit-text-size-adjust": "100%",
        },
      },
      el(
        "div",
        {
          style: {
            display: "none",
            "max-height": "0",
            overflow: "hidden",
            "mso-hide": "all",
          },
        },
        input.preheader,
      ),
      el(
        "table",
        {
          role: "presentation",
          width: "100%",
          cellpadding: 0,
          cellspacing: 0,
          style: {
            "border-collapse": "collapse",
            background: colour("paper-2"),
          },
        },
        el(
          "tr",
          {},
          el(
            "td",
            {
              class: "fo-ground",
              align: "center",
              style: { padding: "32px 0 40px" },
            },
            card,
          ),
        ),
      ),
    ),
  );
  return `<!doctype html>${page.html}`;
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                       */
/* -------------------------------------------------------------------------- */

/** The heading: Fraunces 400, 32 px (26 on a phone). */
export function heading(...children: readonly Child[]): Block {
  return {
    html: el(
      "h1",
      {
        class: "fo-h1",
        style: {
          margin: "0",
          "font-family": EMAIL_FONTS.display,
          "font-weight": 400,
          "font-size": M.heading,
          "line-height": "1.15",
          "letter-spacing": "-0.01em",
          color: colour("ink"),
        },
      },
      ...children,
    ),
  };
}

/** The 13 px label above a heading. */
export function eyebrow(...children: readonly Child[]): Block {
  return {
    tightAfter: true,
    html: el(
      "p",
      {
        style: {
          margin: "0",
          "font-family": EMAIL_FONTS.body,
          "font-size": M.label,
          "font-weight": 700,
          "letter-spacing": "0.14em",
          "text-transform": "uppercase",
          color: colour("eyebrow"),
        },
      },
      ...children,
    ),
  };
}

/** A paragraph: `body` in ink, `sub` in ink-2. 17 px (16 on a phone), line height 1.55. */
export function paragraph(
  tone: "body" | "sub",
  ...children: readonly Child[]
): Block {
  return {
    html: el(
      "p",
      {
        class: "fo-p",
        style: {
          margin: "0",
          ...BODY_TEXT,
          color: tone === "body" ? colour("ink") : colour("ink-2"),
        },
      },
      ...children,
    ),
  };
}

/** A product name inside a line: Fraunces 19 px. */
export function productName(name: string): SafeHtml {
  return el(
    "span",
    {
      style: {
        "font-family": EMAIL_FONTS.display,
        "font-size": 19,
      },
    },
    name,
  );
}

/** Code-like text: a florist's shop code, an env var name. */
export function code(value: string): SafeHtml {
  return el(
    "code",
    {
      style: {
        "font-family": EMAIL_FONTS.mono,
        "font-size": "0.9em",
      },
    },
    value,
  );
}

/** Bold text. */
export function strong(...children: readonly Child[]): SafeHtml {
  return el("b", {}, ...children);
}

/** Lining, tabular figures for a time, an amount, a phone number. */
export function numeric(value: string): SafeHtml {
  return el(
    "span",
    { style: { "font-variant-numeric": "lining-nums tabular-nums" } },
    value,
  );
}

/** One label and value of a facts list. */
export interface Fact {
  readonly label: string;
  readonly value: SafeHtml | string;
}

/** The facts list: label column 148 px, rules between rows; label above value on a phone. */
export function facts(rows: readonly Fact[]): Block {
  const rule = `1px solid ${colour("rule")}`;
  return {
    html: el(
      "table",
      {
        width: "100%",
        cellpadding: 0,
        cellspacing: 0,
        style: { "border-collapse": "collapse", "border-top": rule },
      },
      ...rows.map((row) =>
        el(
          "tr",
          { class: "fo-fact" },
          el(
            "th",
            {
              scope: "row",
              width: M.factLabel,
              style: {
                width: `${M.factLabel}px`,
                padding: "11px 0",
                "padding-inline-end": "16px",
                "border-bottom": rule,
                "text-align": "start",
                "vertical-align": "baseline",
                "font-family": EMAIL_FONTS.body,
                "font-size": M.label,
                "font-weight": 700,
                "letter-spacing": "0.1em",
                "text-transform": "uppercase",
                color: colour("ink-3"),
              },
            },
            row.label,
          ),
          el(
            "td",
            {
              style: {
                padding: "11px 0",
                "border-bottom": rule,
                "vertical-align": "baseline",
                "font-family": EMAIL_FONTS.body,
                "font-size": M.body,
                "line-height": "1.4",
                color: colour("ink"),
              },
            },
            row.value,
          ),
        ),
      ),
    ),
  };
}

/** The answer-by badge: a blush pill in accent-strong, with a clock. */
export function answerBy(label: string): Block {
  const clock = trusted(
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px;margin-inline-end:8px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  );
  return {
    html: el(
      "p",
      {
        style: {
          margin: "0",
          display: "inline-block",
          "padding-block": "6px",
          "padding-inline": "10px 14px",
          "border-radius": "9999px",
          background: colour("blush"),
          color: colour("accent-strong"),
          "font-family": EMAIL_FONTS.body,
          "font-size": M.body,
          "font-weight": 700,
          "font-variant-numeric": "lining-nums tabular-nums",
        },
      },
      clock,
      label,
    ),
  };
}

/** The payout row: leaf wash, the label at the start and the amount at the end. */
export function payoutRow(label: string, amount: string): Block {
  return {
    html: el(
      "table",
      {
        role: "presentation",
        width: "100%",
        cellpadding: 0,
        cellspacing: 0,
        style: {
          "border-collapse": "separate",
          background: colour("leaf-wash"),
          "border-radius": `${M.radiusBox}px`,
        },
      },
      el(
        "tr",
        {},
        el(
          "td",
          {
            style: {
              padding: "14px 18px",
              "font-family": EMAIL_FONTS.body,
              "font-size": M.body,
              "font-weight": 700,
              color: colour("ink"),
            },
          },
          label,
        ),
        el(
          "td",
          {
            style: {
              padding: "14px 18px",
              "text-align": "end",
              "white-space": "nowrap",
              "font-family": EMAIL_FONTS.display,
              "font-size": 24,
              "font-weight": 400,
              "font-variant-numeric": "lining-nums",
              color: colour("ink"),
            },
          },
          amount,
        ),
      ),
    ),
  };
}

/** The one action: a bulletproof poppy pill, 52 px, full width on a phone. */
export function button(label: string, href: string): Block {
  return {
    html: el(
      "table",
      {
        class: "fo-btn-table",
        role: "presentation",
        cellpadding: 0,
        cellspacing: 0,
        style: { "border-collapse": "separate" },
      },
      el(
        "tr",
        {},
        el(
          "td",
          {
            align: "center",
            style: {
              "border-radius": "9999px",
              background: colour("accent"),
            },
          },
          el(
            "a",
            {
              class: "fo-btn",
              href,
              style: {
                display: "inline-block",
                padding: "0 30px",
                "line-height": `${M.button}px`,
                "border-radius": "9999px",
                "font-family": EMAIL_FONTS.body,
                "font-size": M.body,
                "font-weight": 700,
                color: colour("accent-ink"),
                "text-decoration": "none",
                "text-align": "center",
              },
            },
            label,
          ),
        ),
      ),
    ),
  };
}

/** The 14 px note under a button (12 px below it). */
export function note(...children: readonly Child[]): Block {
  return {
    tightBefore: true,
    html: el(
      "p",
      {
        style: {
          margin: "0",
          "font-family": EMAIL_FONTS.body,
          "font-size": M.small,
          "line-height": "1.45",
          color: colour("ink-3"),
        },
      },
      ...children,
    ),
  };
}

/** A tinted box: information (sage), stop (blush), alert (butter). */
export function box(
  tone: "sage" | "blush" | "butter",
  ...children: readonly Child[]
): Block {
  const background =
    tone === "sage"
      ? colour("sage-wash")
      : tone === "blush"
        ? colour("blush")
        : colour("butter");
  return {
    html: el(
      "p",
      {
        style: {
          margin: "0",
          padding: "14px 18px",
          "border-radius": `${M.radiusBox}px`,
          background,
          "font-family": EMAIL_FONTS.body,
          "font-size": 16,
          "line-height": "1.5",
          color: colour("ink"),
        },
      },
      ...children,
    ),
  };
}

/** The attempts table of the founder's alert: `#`, florist, outcome. */
export function attemptsTable(
  caption: string,
  head: readonly [string, string, string],
  rows: readonly (readonly [Child, Child, Child])[],
): Block {
  const rule = `1px solid ${colour("rule")}`;
  const cell = (
    tag: "th" | "td",
    index: number,
    last: boolean,
    header: boolean,
    child: Child,
  ): SafeHtml =>
    el(
      tag,
      {
        scope: header ? "col" : null,
        width: index === 0 ? 28 : index === 1 ? 120 : null,
        style: {
          padding: "10px 14px",
          ...(index === 0 ? {} : { "padding-inline-start": "0" }),
          "border-bottom": last ? "0" : rule,
          "text-align": "start",
          "vertical-align": "baseline",
          "font-family": EMAIL_FONTS.body,
          ...(header
            ? {
                background: colour("paper-2"),
                "font-size": 12,
                "font-weight": 700,
                "letter-spacing": "0.1em",
                "text-transform": "uppercase",
                color: colour("ink-3"),
              }
            : { "font-size": 15, color: colour("ink") }),
        },
      },
      child,
    );
  return {
    html: el(
      "table",
      {
        width: "100%",
        cellpadding: 0,
        cellspacing: 0,
        "aria-label": caption,
        style: {
          "border-collapse": "separate",
          border: rule,
          "border-radius": `${M.radiusBox}px`,
        },
      },
      el(
        "tr",
        {},
        ...head.map((child, index) => cell("th", index, false, true, child)),
      ),
      ...rows.map((row, rowIndex) =>
        el(
          "tr",
          {},
          ...row.map((child, index) =>
            cell("td", index, rowIndex === rows.length - 1, false, child),
          ),
        ),
      ),
    ),
  };
}

/** The paste block: plain text, line breaks only, a stem rule at the inline start. */
export function pasteBlock(value: string): Block {
  return {
    html: el(
      "p",
      {
        style: {
          margin: "0",
          padding: "18px 20px",
          "border-radius": `${M.radiusBox}px`,
          background: colour("paper-2"),
          "border-inline-start": `4px solid ${colour("stem")}`,
          "font-family": EMAIL_FONTS.body,
          "font-size": 16,
          "line-height": "1.55",
          "white-space": "pre-wrap",
          color: colour("ink"),
        },
      },
      value,
    ),
  };
}

/** Re-exported for the templates. */
export { fragment, text };
