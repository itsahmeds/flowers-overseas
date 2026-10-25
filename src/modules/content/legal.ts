/**
 * The legal documents as the application reads them (spec 041 §2 "The honest states", §5.3
 * "Legal document", "Imprint", "Cookies"; AC-9, AC-10, AC-11, AC-13, AC-17, AC-29; TASK-183).
 *
 * `legalDocumentView()` is the one view model of the five legal pages: the page, its `<head>`, its
 * JSON-LD and the sitemap read it, exactly as the trust family reads `infoPageView()`. It reads no
 * cookie, no header and no clock.
 *
 *  - **The state is data.** `inForce: false` gives "Not in force yet" in the version header and
 *    `infoPages.legal.notInForce` above the contents; `inForce: true` with `lawyerReviewed: false`
 *    gives the effective date and `infoPages.legal.unreviewed`; a reviewed document in force has
 *    no draft line. The imprint is a statement of fact and renders none of them (AC-9).
 *  - **Indexing needs the lawyer** (AC-17, §13 Q3): the `reviewed` term the engine reads is
 *    `reviewed && lawyerReviewed`, so the whole set is `noindex,follow` until a lawyer signs it.
 *  - **No person is named** (§14 A-founder-2026-10-23 clause 4): the controller sentence names the
 *    company (`legalName` once registered, the trading name before), the imprint has no
 *    representative row, and no field of this view can carry a person's name.
 *  - **The cookie notice's interim sections** render only while the privacy notice does not exist
 *    in the locale; once it does, one section with a link to it takes their place (AC-29).
 */
import { type Company, COMPANY, controllerName } from "@/config/company";
import {
  COOKIE_REGISTRY,
  type CookieCategory,
  type CookieRegistryEntry,
} from "@/config/cookies";
import { type InfoPageId, infoPage } from "@/config/info-pages";
import { CONSENT_POLICY_VERSION } from "@/lib/consent";

import { destinationsHubHref } from "../geo/index.ts";
import { localePath } from "../i18n/index.ts";

import {
  type LegalBlock,
  type LegalSpan,
  type LegalToken,
  legalBody,
} from "./legal-body.ts";
import {
  type InfoCrumbView,
  type InfoLinkView,
  type InfoPageOptions,
  infoContentLocale,
  infoPageExists,
  infoPagePath,
  infoPageView,
  isUntranslatedDraft,
  parsedInfoFiles,
} from "./pages.ts";
import type { ParsedInfoFile } from "./parse.ts";
import { staticInfoContentProvider } from "./provider.ts";
import type {
  FactsLabels,
  InfoLinkTarget,
  LegalDocument,
  RegisterLabels,
} from "./schemas.ts";

/** The draft line above the contents (AC-9): a message key, or none. */
export type LegalDraftLine =
  "infoPages.legal.notInForce" | "infoPages.legal.unreviewed";

/** The `aria-hidden` corner stamp (spec 041 §14 A1): the version header's state in two words. */
export type LegalStamp =
  "infoPages.legal.notInForceYet" | "infoPages.legal.inForce";

/** One row of the cookie register table (AC-13), in the register's order. */
export interface CookieRegisterRowView {
  readonly name: string;
  readonly category: CookieCategory;
  readonly purposeKey: string;
  /** The register entry, so the component formats its lifetime as the consent panel does. */
  readonly entry: CookieRegistryEntry;
  readonly status: "set" | "declared";
}

/** The imprint's facts (AC-11): present only under a complete trader identity. */
export interface ImprintFactsView {
  readonly legalName: string;
  readonly registryName: string;
  readonly registrationNumber: string;
  /** One line, as the footer colophon prints it. */
  readonly address: string;
  /** Only where one is issued: never a label without a value. */
  readonly vatId: string | undefined;
  readonly supportEmail: string;
  readonly phoneDisplay: string;
  readonly telHref: string;
}

/** The controller sentence's two data slots (`company.controller`, AC-29). */
export interface ControllerView {
  readonly name: string;
  readonly phone: string;
}

export type LegalBlockView =
  | { readonly kind: "paragraph"; readonly spans: readonly LegalSpan[] }
  | { readonly kind: "subheading"; readonly text: string }
  | {
      readonly kind: "list";
      readonly items: readonly (readonly LegalSpan[])[];
    }
  | { readonly kind: "register" }
  | { readonly kind: "reopen" }
  | { readonly kind: "controller" }
  | { readonly kind: "facts" }
  /** The link that replaces the interim sections once the privacy notice exists (AC-29). */
  | { readonly kind: "privacyLink"; readonly href: string };

export interface LegalSectionView {
  readonly id: string;
  readonly heading: string;
  readonly blocks: readonly LegalBlockView[];
}

export interface LegalDocumentView {
  readonly pageId: InfoPageId;
  readonly locale: string;
  readonly path: string;
  /** `imprint` is a statement of fact: no version header, stamp, draft line, contents or log. */
  readonly kind: "document" | "imprint";
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly h1: string;
  /** The file's own `reviewed` flag (the founder's copy approval). */
  readonly reviewed: boolean;
  /**
   * `infoPages.status.untranslated` renders under the draft line while this is true: an
   * unchecked `de`/`pl` draft (spec 041 §2 "Untranslated draft", AC-23).
   */
  readonly untranslated: boolean;
  readonly lawyerReviewed: boolean;
  /** What the indexability engine reads as `reviewed` (AC-17): both flags. */
  readonly indexReviewed: boolean;
  readonly updatedAt: string;
  readonly version: string;
  readonly inForce: boolean;
  /** ISO date, present exactly when `inForce` (the schema refuses the other case). */
  readonly effectiveFrom: string | undefined;
  readonly regime: "eu" | "uk";
  readonly draftLine: LegalDraftLine | undefined;
  readonly stamp: LegalStamp | undefined;
  readonly sections: readonly LegalSectionView[];
  /** The contents: exactly the rendered `##` headings, in order, with their anchors (AC-10). */
  readonly toc: readonly { readonly id: string; readonly heading: string }[];
  readonly changeLog: LegalDocument["changeLog"];
  readonly links: readonly InfoLinkView[];
  readonly register: readonly CookieRegisterRowView[] | undefined;
  readonly registerLabels: RegisterLabels | undefined;
  readonly policyVersion: number;
  readonly controller: ControllerView | undefined;
  readonly facts: ImprintFactsView | undefined;
  readonly factsLabels: FactsLabels | undefined;
  readonly breadcrumb: readonly InfoCrumbView[];
}

/** The legal file a locale renders, following `extends: en`; `undefined` when there is none. */
function legalFile(
  pageId: InfoPageId,
  locale: string,
  options: InfoPageOptions,
): Extract<ParsedInfoFile, { kind: "legal" }> | undefined {
  const files = parsedInfoFiles(options.provider ?? staticInfoContentProvider);
  const file = files.get(`${pageId}/${infoContentLocale(locale) ?? locale}`);
  if (file === undefined) return undefined;
  if (file.kind === "legal") return file;
  if (file.kind === "extends") {
    const parent = files.get(`${pageId}/${file.parent}`);
    return parent?.kind === "legal" ? parent : undefined;
  }
  return undefined;
}

/** The company's printed address on one line, as the footer colophon prints it (spec 004 AC-9). */
function addressLine(company: Company): string | undefined {
  const address = company.address;
  if (address === undefined) return undefined;
  return [...address.lines, address.postalCode, address.city].join(", ");
}

/**
 * The value of one data slot. A registry slot resolves only under a registered company with its
 * mailbox; the parser already refuses one in a document that exists before that, so reaching
 * `undefined` here is a corpus error, thrown rather than printed as an empty slot.
 */
function tokenValue(token: LegalToken, company: Company): string | undefined {
  switch (token) {
    case "phone":
      return company.contact.phoneDisplay;
    case "tradingName":
      return company.tradingName;
    case "legalName":
      return company.legalName;
    case "registryName":
      return company.registryName;
    case "registrationNumber":
      return company.registrationNumber;
    case "address":
      return addressLine(company);
    case "supportEmail":
      return company.supportEmail;
  }
}

function fillSpans(
  spans: readonly LegalSpan[],
  company: Company,
  where: string,
): readonly LegalSpan[] {
  return spans.map((span) => ({
    bold: span.bold,
    text: span.text.replaceAll(/\{([A-Za-z]+)\}/gu, (_match, name: string) => {
      const value = tokenValue(name as LegalToken, company);
      if (value === undefined) {
        throw new Error(
          `${where}: the data slot \`{${name}}\` has no value in company.ts; no page may print an empty slot (spec 041 AC-11)`,
        );
      }
      return value;
    }),
  }));
}

function blockView(
  block: LegalBlock,
  company: Company,
  where: string,
): LegalBlockView {
  switch (block.kind) {
    case "paragraph":
      return {
        kind: "paragraph",
        spans: fillSpans(block.spans, company, where),
      };
    case "subheading":
      return { kind: "subheading", text: block.text };
    case "list":
      return {
        kind: "list",
        items: block.items.map((item) => fillSpans(item, company, where)),
      };
    case "directive":
      return { kind: block.name };
  }
}

function linkHref(
  to: InfoLinkTarget,
  locale: string,
  options: InfoPageOptions,
): string | undefined {
  if (to === "destinations") return destinationsHubHref(locale);
  return infoPageExists(to, locale, options)
    ? infoPagePath(to, locale)
    : undefined;
}

function draftLineOf(doc: LegalDocument): LegalDraftLine | undefined {
  if (!doc.inForce) return "infoPages.legal.notInForce";
  if (!doc.lawyerReviewed) return "infoPages.legal.unreviewed";
  return undefined;
}

/**
 * The view model of one legal page, or `undefined` when the page does not exist in the locale
 * (a missing file, or a page that waits for the company: AC-2).
 */
export function legalDocumentView(
  pageId: InfoPageId,
  locale: string,
  options: InfoPageOptions = {},
): LegalDocumentView | undefined {
  if (infoPage(pageId).family !== "legal") return undefined;
  if (!infoPageExists(pageId, locale, options)) return undefined;
  const file = legalFile(pageId, locale, options);
  if (file === undefined) return undefined;
  const doc = file.content;
  const company = options.company ?? COMPANY;
  const where = `content/legal/${file.locale}/${pageId}.md`;
  const imprint = pageId === "imprint";

  // The cookie notice's interim sections give way to one link once the privacy notice exists.
  const privacyHref = infoPageExists("privacy", locale, options)
    ? infoPagePath("privacy", locale)
    : undefined;
  const interim = new Set(doc.interim?.sections ?? []);
  const sections: LegalSectionView[] = [];
  let replaced = false;
  for (const section of legalBody(file.body, pageId).sections) {
    if (privacyHref !== undefined && interim.has(section.id)) {
      if (!replaced && doc.interim !== undefined) {
        replaced = true;
        sections.push({
          id: "privacy-notice",
          heading: doc.interim.heading,
          blocks: [{ kind: "privacyLink", href: privacyHref }],
        });
      }
      continue;
    }
    sections.push({
      id: section.id,
      heading: section.heading,
      blocks: section.blocks.map((block) => blockView(block, company, where)),
    });
  }
  const has = (kind: LegalBlockView["kind"]) =>
    sections.some((section) =>
      section.blocks.some((block) => block.kind === kind),
    );

  const links: InfoLinkView[] = [];
  for (const link of doc.links ?? []) {
    const href = linkHref(link.to, locale, options);
    if (href !== undefined)
      links.push({ to: link.to, label: link.label, href });
  }

  const { legalName, registryName, registrationNumber, supportEmail } = company;
  const address = addressLine(company);
  const facts =
    has("facts") &&
    legalName !== undefined &&
    registryName !== undefined &&
    registrationNumber !== undefined &&
    address !== undefined &&
    supportEmail !== undefined
      ? {
          legalName,
          registryName,
          registrationNumber,
          address,
          vatId: company.vatId,
          supportEmail,
          phoneDisplay: company.contact.phoneDisplay,
          telHref: `tel:${company.contact.phoneE164}`,
        }
      : undefined;
  if (has("facts") && facts === undefined) {
    throw new Error(
      `${where}: the imprint exists but company.ts lacks a registry fact (spec 041 AC-11)`,
    );
  }

  const path = infoPagePath(pageId, locale);
  return {
    pageId,
    locale,
    path,
    kind: imprint ? "imprint" : "document",
    seoTitle: doc.seoTitle,
    seoDescription: doc.seoDescription,
    h1: doc.h1,
    reviewed: doc.reviewed,
    untranslated: isUntranslatedDraft(file.locale, doc.reviewed),
    lawyerReviewed: doc.lawyerReviewed,
    indexReviewed: doc.reviewed && doc.lawyerReviewed,
    updatedAt: doc.updatedAt,
    version: doc.version,
    inForce: doc.inForce,
    effectiveFrom: doc.effectiveFrom ?? undefined,
    regime: doc.regime,
    draftLine: imprint ? undefined : draftLineOf(doc),
    stamp: imprint
      ? undefined
      : doc.inForce
        ? "infoPages.legal.inForce"
        : "infoPages.legal.notInForceYet",
    sections,
    toc: imprint
      ? []
      : sections.map((section) => ({
          id: section.id,
          heading: section.heading,
        })),
    changeLog: doc.changeLog,
    links,
    register: has("register")
      ? COOKIE_REGISTRY.map((entry) => ({
          name: entry.name,
          category: entry.category,
          purposeKey: entry.purposeKey,
          entry,
          status: entry.status,
        }))
      : undefined,
    registerLabels: doc.labels?.register,
    policyVersion: CONSENT_POLICY_VERSION,
    controller: has("controller")
      ? { name: controllerName(company), phone: company.contact.phoneDisplay }
      : undefined,
    facts,
    factsLabels: doc.labels?.facts,
    breadcrumb: [
      {
        labelKey: "common.homeLink",
        href: localePath(locale, "home"),
        current: false,
      },
      { labelKey: "breadcrumb.entity", labelValue: doc.h1, current: true },
    ],
  };
}

/**
 * What a page's `<head>`, its JSON-LD breadcrumb and its sitemap row need, for either family:
 * the one place the legal half of AC-17 lives. A trust page's `reviewed` is its copy flag; a
 * legal page's is `reviewed && lawyerReviewed`, so no legal draft reaches an index.
 */
export interface InfoPageHeadView {
  readonly path: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly reviewed: boolean;
  readonly updatedAt: string;
  readonly breadcrumb: readonly InfoCrumbView[];
}

export function infoPageHeadView(
  pageId: InfoPageId,
  locale: string,
  options: InfoPageOptions = {},
): InfoPageHeadView | undefined {
  if (infoPage(pageId).family === "legal") {
    const view = legalDocumentView(pageId, locale, options);
    if (view === undefined) return undefined;
    return {
      path: view.path,
      seoTitle: view.seoTitle,
      seoDescription: view.seoDescription,
      reviewed: view.indexReviewed,
      updatedAt: view.updatedAt,
      breadcrumb: view.breadcrumb,
    };
  }
  const view = infoPageView(pageId, locale, options);
  if (view === undefined) return undefined;
  return {
    path: view.path,
    seoTitle: view.seoTitle,
    seoDescription: view.seoDescription,
    reviewed: view.reviewed,
    updatedAt: view.updatedAt,
    breadcrumb: view.breadcrumb,
  };
}
