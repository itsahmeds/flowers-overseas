/**
 * One legal page (spec 041 §5.3 "Legal document", "Imprint", "Cookies"; design round 2, spec 041
 * §14 A1: `legal-template-*`, `cookies-*`; TASK-183).
 *
 * A Server Component with no client JavaScript (AC-24). It renders a view model handed in by the
 * route (`legalDocumentView()`), so a test can mount the imprint, the terms and the privacy notice
 * under a `registered: true` fixture (AC-11, AC-27) without the committed company. Every string is
 * a message key or the document's own content file.
 *
 * The round-2 structure, in DOM order:
 *
 *  - the breadcrumb on a cream ground, then **one white `<article>` sheet** holding the document;
 *  - in its corner an `aria-hidden` **stamp** that repeats the state in two words
 *    (`infoPages.legal.notInForceYet` or `infoPages.legal.inForce`), because the version header
 *    below is the accessible statement of the same fact (AC-9, AC-10);
 *  - the `<h1>`, the **version header** (version · in force since / not in force yet · applies
 *    to), the **draft line** as a note;
 *  - a 3∶8 grid: the **contents** as a labelled `<nav>` whose entries are exactly the `##`
 *    headings with links to their anchors, and the document's sections, then **what changed**;
 *  - the in-body links as chips, after the sheet.
 *
 * The cookie notice adds the register as a captioned table with header scope (AC-13), the
 * "Change cookie settings" button carrying `data-fo-consent-reopen` (the consent loader's delegated
 * handler binds it, as it binds the footer's control; no new island), and, on a phone, the same
 * button docked in spec 004 AC-48's bar. The imprint is a statement of fact: no stamp, no version
 * header, no draft line, no contents and no log; its identity is a `<dl>` (AC-11).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { CookieCategory } from "@/config/cookies";

import { formatDate } from "../../i18n/index.ts";
import {
  Breadcrumbs,
  CONSENT_REOPEN_ATTRIBUTE,
  Container,
  Display,
  lifetimeLabel,
} from "../../ui/index.ts";
import type {
  LegalBlockView,
  LegalDocumentView,
  LegalSectionView,
} from "../legal.ts";
import type { LegalSpan } from "../legal-body.ts";

import { label, localeCode, type Translator } from "./label.ts";

export interface LegalDocumentPageProps {
  readonly view: LegalDocumentView;
}

/** The register's category names: the consent panel's own keys, written out for the usage scan. */
const CATEGORY_NAME: Readonly<Record<CookieCategory, string>> = {
  essential: "consent.category.essential.name",
  analytics: "consent.category.analytics.name",
  marketing: "consent.category.marketing.name",
};

const LABEL =
  "m-0 font-body text-xs font-bold uppercase tracking-(--tracking-label) text-ink-3";
const PROSE = "text-ink-2 m-0 max-w-(--measure)";
/** The page's own re-open control: the secondary pill's skin on a `<button>`. */
const REOPEN =
  "fo-pill inline-flex min-h-(--target-min) cursor-pointer items-center justify-center rounded-full bg-transparent px-[22px] font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--color-ink)] [--fo-pill-active:var(--color-surface-muted)] [--fo-pill-hover:var(--color-surface-raised)] [--fo-pill-inset:1.5px]";

const reopenAttribute = { [CONSENT_REOPEN_ATTRIBUTE]: "" };

function Spans({
  spans,
}: {
  readonly spans: readonly LegalSpan[];
}): ReactElement {
  return (
    <>
      {spans.map((span, index) =>
        span.bold ? (
          <strong className="text-ink" key={index}>
            {span.text}
          </strong>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}

function RegisterTable({
  view,
  t,
}: {
  readonly view: LegalDocumentView;
  readonly t: Translator;
}): ReactElement | null {
  const rows = view.register;
  const labels = view.registerLabels;
  if (rows === undefined || labels === undefined) return null;
  const cell = "border-rule border-b py-[12px] pe-[16px] text-start align-top";
  const translate = (key: string, values?: Record<string, number | string>) =>
    (
      t as unknown as (k: string, v?: Record<string, number | string>) => string
    )(key, values);
  return (
    <div className="overflow-x-auto" data-fo-cookie-register-wrap>
      <table
        className="w-full min-w-[640px] border-collapse text-sm"
        data-fo-cookie-register
      >
        <caption className="text-ink-2 pb-[10px] text-start">
          {labels.caption}
        </caption>
        <thead>
          <tr>
            {[
              labels.name,
              labels.category,
              labels.purpose,
              labels.lifetime,
              labels.status,
            ].map((heading) => (
              <th className={`${cell} ${LABEL}`} key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr data-fo-cookie-row={row.name} key={row.name}>
              <th className={`${cell} font-bold break-all`} scope="row">
                {row.name}
              </th>
              <td className={cell}>{label(t, CATEGORY_NAME[row.category])}</td>
              <td className={`${cell} text-ink-2`}>
                {label(t, row.purposeKey)}
              </td>
              <td className={`${cell} whitespace-nowrap`}>
                {lifetimeLabel(row.entry, translate)}
              </td>
              <td
                className={`${cell} ${row.status === "set" ? "text-stem font-bold" : "text-ink-2"}`}
                data-fo-cookie-status={row.status}
              >
                {row.status === "set" ? labels.setToday : labels.planned}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Facts({
  view,
}: {
  readonly view: LegalDocumentView;
}): ReactElement | null {
  const facts = view.facts;
  const labels = view.factsLabels;
  if (facts === undefined || labels === undefined) return null;
  const row =
    "border-rule grid grid-cols-1 gap-x-[24px] gap-y-[4px] border-b py-[14px] md:grid-cols-[200px_minmax(0,1fr)]";
  const items: readonly {
    readonly key: string;
    readonly term: string;
    readonly value: ReactElement | string;
  }[] = [
    { key: "name", term: labels.name, value: facts.legalName },
    { key: "register", term: labels.register, value: facts.registryName },
    {
      key: "registrationNumber",
      term: labels.registrationNumber,
      value: facts.registrationNumber,
    },
    { key: "address", term: labels.address, value: facts.address },
    // DDG §5(1) no. 6 asks for a VAT ID only where the trader has one: no label without a value.
    ...(facts.vatId === undefined
      ? []
      : [{ key: "vatId", term: labels.vatId, value: facts.vatId }]),
    {
      key: "email",
      term: labels.email,
      value: (
        <a className="link" href={`mailto:${facts.supportEmail}`}>
          {facts.supportEmail}
        </a>
      ),
    },
    {
      key: "phone",
      term: labels.phone,
      value: (
        <a className="link" href={facts.telHref}>
          {facts.phoneDisplay}
        </a>
      ),
    },
  ];
  return (
    <dl className="border-rule m-0 grid border-t" data-fo-imprint-facts>
      {items.map((item) => (
        <div className={row} data-fo-imprint-fact={item.key} key={item.key}>
          <dt className={LABEL}>{item.term}</dt>
          <dd className="text-ink m-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Block({
  block,
  view,
  t,
}: {
  readonly block: LegalBlockView;
  readonly view: LegalDocumentView;
  readonly t: Translator;
}): ReactElement | null {
  switch (block.kind) {
    case "paragraph":
      return (
        <p className={PROSE}>
          <Spans spans={block.spans} />
        </p>
      );
    case "subheading":
      return (
        <h3 className="font-display text-md m-0 mt-[6px] leading-(--line-height-title)">
          {block.text}
        </h3>
      );
    case "list":
      return (
        <ul className={`${PROSE} grid list-disc gap-[8px] ps-[22px]`}>
          {block.items.map((item, index) => (
            <li key={index}>
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );
    case "register":
      return <RegisterTable t={t} view={view} />;
    case "reopen":
      return (
        <div
          className="grid justify-items-start gap-[10px]"
          id="change-cookie-settings"
        >
          <button className={REOPEN} type="button" {...reopenAttribute}>
            {label(t, "infoPages.cookies.change")}
          </button>
          {view.registerLabels === undefined ? null : (
            <p className="text-ink-2 m-0 text-sm" data-fo-policy-version>
              {view.registerLabels.policyVersion.replace(
                "{version}",
                String(view.policyVersion),
              )}
            </p>
          )}
        </div>
      );
    case "controller":
      return view.controller === undefined ? null : (
        <p className={PROSE} data-fo-controller>
          {label(t, "company.controller", {
            name: view.controller.name,
            phone: view.controller.phone,
          })}
        </p>
      );
    case "facts":
      return <Facts view={view} />;
    case "privacyLink":
      return (
        <p className={PROSE}>
          <a className="link" data-fo-privacy-link href={block.href}>
            {label(t, "consent.privacyLink")}
          </a>
        </p>
      );
  }
}

function Section({
  section,
  view,
  t,
}: {
  readonly section: LegalSectionView;
  readonly view: LegalDocumentView;
  readonly t: Translator;
}): ReactElement {
  return (
    <section
      aria-labelledby={section.id}
      className="grid gap-[14px]"
      data-fo-legal-section={section.id}
    >
      <h2
        className="font-display text-lg-s m-0 leading-[1.12] md:text-xl"
        id={section.id}
      >
        {section.heading}
      </h2>
      {section.blocks.map((block, index) => (
        <Block block={block} key={index} t={t} view={view} />
      ))}
    </section>
  );
}

function VersionHeader({
  view,
  t,
}: {
  readonly view: LegalDocumentView;
  readonly t: Translator;
}): ReactElement {
  const state =
    view.inForce && view.effectiveFrom !== undefined
      ? label(t, "infoPages.legal.inForceSince", {
          date: formatDate(
            new Date(`${view.effectiveFrom}T12:00:00Z`),
            localeCode(view.locale),
            "calendarDate",
            "UTC",
          ),
        })
      : label(t, "infoPages.legal.notInForceYet");
  const items = [
    label(t, "infoPages.legal.version", { version: view.version }),
    state,
    label(
      t,
      view.regime === "uk"
        ? "infoPages.legal.appliesTo.uk"
        : "infoPages.legal.appliesTo.eu",
    ),
  ];
  return (
    <ul
      className="text-ink-2 [&>li+li]:before:text-ink-3 m-0 flex list-none flex-wrap gap-y-[6px] p-0 text-sm [&>li+li]:before:mx-[10px] [&>li+li]:before:content-['·']"
      data-fo-legal-version-header
    >
      {items.map((item, index) => (
        <li
          className={index === 0 ? "text-ink font-bold" : undefined}
          data-fo-legal-version={index === 0 ? view.version : undefined}
          key={item}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function LegalDocumentPage({
  view,
}: LegalDocumentPageProps): ReactElement {
  const t = useTranslations();
  const a11y = useTranslations("a11y");
  const document = view.kind === "document";
  const hasReopen = view.sections.some((section) =>
    section.blocks.some((block) => block.kind === "reopen"),
  );

  return (
    <Container as="main" id="main" data-fo-info-page={view.pageId}>
      <section
        className="bg-paper-2 flow-root pb-(--section-fluid) shadow-[0_0_0_100vmax_var(--color-paper-2)] [clip-path:inset(0_-100vmax)]"
        data-fo-info-band
      >
        <Breadcrumbs
          label={a11y("breadcrumb")}
          crumbs={view.breadcrumb.map((crumb) => ({
            key: crumb.labelKey,
            label:
              crumb.labelValue === undefined
                ? label(t, crumb.labelKey)
                : label(t, crumb.labelKey, { name: crumb.labelValue }),
            href: crumb.href,
            current: crumb.current,
          }))}
        />
        <article
          className="bg-card md:rounded-letter relative mt-[24px] grid gap-[20px] rounded-md px-[18px] pt-[26px] pb-[30px] shadow-(--shadow-paper) md:px-[52px] md:pt-[44px] md:pb-[52px]"
          data-fo-legal-document={view.pageId}
        >
          {view.stamp === undefined ? null : (
            <p
              aria-hidden="true"
              className={`bg-card m-0 justify-self-start rounded-md border-[2.5px] px-[16px] py-[8px] text-xs font-bold tracking-(--tracking-label) uppercase md:absolute md:end-[36px] md:top-[30px] md:text-sm ${view.stamp === "infoPages.legal.inForce" ? "border-stem text-stem" : "border-accent text-accent-strong"}`}
              data-fo-legal-stamp={view.stamp}
            >
              {label(t, view.stamp)}
            </p>
          )}
          <header className="grid max-w-[980px] gap-[20px]">
            <Display as="h1" size="display">
              {view.h1}
            </Display>
            {document ? <VersionHeader t={t} view={view} /> : null}
            {view.draftLine === undefined ? null : (
              <p
                className={`text-ui text-ink m-0 max-w-(--measure) rounded-(--radius-field) px-[20px] py-[16px] leading-(--line-height-tight) shadow-[inset_0_0_0_1px_var(--color-rule)] ${view.draftLine === "infoPages.legal.notInForce" ? "bg-blush" : "bg-butter"}`}
                data-fo-legal-draft-line={view.draftLine}
                role="note"
              >
                {label(t, view.draftLine)}
              </p>
            )}
          </header>
          {document ? (
            <div className="mt-[8px] grid grid-cols-1 items-start gap-[24px] md:mt-[28px] md:grid-cols-[minmax(0,3fr)_minmax(0,8fr)] md:gap-[56px]">
              <nav
                aria-labelledby="legal-contents"
                className="bg-paper-2 rounded-(--radius-field) px-[18px] py-[18px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:sticky md:top-[24px] md:px-[24px] md:py-[22px]"
                data-fo-legal-toc
              >
                <h2 className={`${LABEL} mb-[8px]`} id="legal-contents">
                  {label(t, "infoPages.legal.contents")}
                </h2>
                <ol className="marker:text-mark m-0 grid list-decimal ps-[22px] text-sm marker:font-bold">
                  {view.toc.map((entry) => (
                    <li key={entry.id}>
                      <a
                        className="text-ink inline-flex min-h-(--target-min) items-center leading-[1.3] underline-offset-4"
                        href={`#${entry.id}`}
                      >
                        {entry.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="grid max-w-[780px] gap-[40px] md:gap-[52px]">
                {view.sections.map((section) => (
                  <Section
                    key={section.id}
                    section={section}
                    t={t}
                    view={view}
                  />
                ))}
                <section
                  aria-labelledby="legal-changes"
                  className="grid gap-[14px]"
                  data-fo-legal-changelog
                >
                  <h2
                    className="font-display text-lg-s m-0 leading-[1.12] md:text-xl"
                    id="legal-changes"
                  >
                    {label(t, "infoPages.legal.changeLog")}
                  </h2>
                  <ul className="border-rule m-0 grid list-none border-t p-0">
                    {view.changeLog.map((entry) => (
                      <li
                        className="border-rule text-ink-2 grid grid-cols-[64px_minmax(0,1fr)] gap-[12px] border-b py-[12px] text-sm md:grid-cols-[80px_140px_minmax(0,1fr)]"
                        data-fo-legal-change={entry.version}
                        key={`${entry.version}-${entry.date}`}
                      >
                        <b className="text-ink">{entry.version}</b>
                        <span>
                          {formatDate(
                            new Date(`${entry.date}T12:00:00Z`),
                            localeCode(view.locale),
                            "calendarDate",
                            "UTC",
                          )}
                        </span>
                        <span className="col-span-2 md:col-span-1">
                          {entry.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          ) : (
            <div className="grid max-w-[780px] gap-[40px]">
              {view.sections.map((section) => (
                <Section key={section.id} section={section} t={t} view={view} />
              ))}
            </div>
          )}
        </article>
        {view.links.length === 0 ? null : (
          <div
            className="border-rule mt-[48px] border-t pt-[22px] pb-[8px] md:mt-[72px] md:pt-[28px]"
            data-fo-info-links
          >
            <ul className="m-0 flex list-none flex-wrap gap-(--space-sm) p-0">
              {view.links.map((link) => (
                <li key={link.to}>
                  <a
                    className="bg-card text-link inline-flex min-h-(--target-min) items-center rounded-full px-[18px] font-bold no-underline shadow-[inset_0_0_0_1px_var(--color-rule)]"
                    data-fo-info-link={link.to}
                    href={link.href}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {hasReopen ? (
        // Spec 004 AC-48's phone bar (spec 041 §14 A1 "Phone docks"): it repeats the page's own
        // button, so it carries the same attribute and adds no control the page lacks.
        <div
          className="action-bar md:hidden"
          data-fo-action-bar="shown"
          data-fo-legal-dock
        >
          <div className="flex min-w-0 flex-1 [&>*]:min-h-[52px] [&>*]:flex-1">
            <button
              className={`${REOPEN} bg-card`}
              type="button"
              {...reopenAttribute}
            >
              {label(t, "infoPages.cookies.change")}
            </button>
          </div>
        </div>
      ) : null}
    </Container>
  );
}
