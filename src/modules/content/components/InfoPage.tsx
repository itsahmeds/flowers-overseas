/**
 * One trust page (spec 041 §5.3; design round 2, spec 041 §14 A1; TASK-182).
 *
 * A Server Component with no client JavaScript (AC-24). Every string is a message key or the
 * page's own content file; nothing is a literal. The structure follows the round-2 artboards
 * (`how-it-works-*`, `guarantee-and-delivery-*`, `help-and-contact-*`, `about-*`):
 *
 *  - **The first band** on the page's own ground colour: the breadcrumb, then a 12-column grid
 *    with the `<h1>`, the not-open line and the intro on columns 1–6, and the page's one "action"
 *    on columns 8–12 (the guarantee's promise card, about's "Who runs it" card, delivery's
 *    destination sheet, help's contact card). How it works keeps its intro beside the `<h1>` and
 *    draws its four steps inside the band as an `<ol>` whose numbers are list counters.
 *  - **Help** (A1 clause 2): the `<h1>` and the not-open line sit above both columns; the contact
 *    block is first in the DOM and placed on columns 8–12 by `grid-row: 1`; the first four
 *    questions sit beside it, the other eight follow in two CSS columns in document order. Every
 *    question is a visible `<h2>` with its answer: no `<details>`, nothing hidden (AC-15). The
 *    01–12 numbers are `aria-hidden` decoration.
 *  - **About**: h1, status, intro, who runs it, why, today, the company. "Who runs it" names the
 *    company, never a person, and renders only once the company is registered (spec 041 §14
 *    A-founder-2026-10-23 clauses 3 and 4); the decorative repeat of a name is withdrawn.
 *  - **The rest** of each page: one section per heading, the heading on columns 1–4 and the prose
 *    on 5–11; the two promise lists of how it works side by side; the in-body links as chips.
 *
 * DOM order is the content file's order everywhere, so a screen reader and a crawler read the
 * page in the order the founder approved it.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { InfoPageId } from "@/config/info-pages";

import { formatList, sortBy } from "../../i18n/index.ts";
import { Breadcrumbs, Container, Display } from "../../ui/index.ts";
import {
  type InfoPageView,
  type InfoSectionView,
  infoPageView,
} from "../pages.ts";

import { label, localeCode, type Translator } from "./label.ts";

export interface InfoPageProps {
  readonly pageId: InfoPageId;
  readonly locale: string;
}

/** Where each trust page puts its sections in the first band (the artboards' Build rows). */
interface BandLayout {
  /** The band's ground: a complete class list, so Tailwind sees every token it needs. */
  readonly ground: string;
  /** The section drawn as the band's card on columns 8–12. */
  readonly aside?: string;
  /** The section drawn under the `<h1>` in the band's copy column. */
  readonly inCopy?: string;
  /** The section drawn across the band below its head (how it works' four steps). */
  readonly below?: string;
  /** The intro sits beside the `<h1>`, on the card's columns (how it works). */
  readonly introAside?: boolean;
  /** Top-align the copy and the card (delivery's `c57` grid) rather than centring them. */
  readonly alignStart?: boolean;
}

const BAND: Readonly<Record<string, BandLayout>> = {
  "how-it-works": {
    ground: "bg-sage-wash shadow-[0_0_0_100vmax_var(--color-sage-wash)]",
    below: "steps",
    introAside: true,
  },
  guarantee: {
    ground: "bg-leaf-wash shadow-[0_0_0_100vmax_var(--color-leaf-wash)]",
    aside: "promise",
  },
  help: { ground: "bg-butter shadow-[0_0_0_100vmax_var(--color-butter)]" },
  about: {
    ground: "bg-butter shadow-[0_0_0_100vmax_var(--color-butter)]",
    aside: "who-runs-it",
  },
  delivery: {
    ground: "bg-paper-2 shadow-[0_0_0_100vmax_var(--color-paper-2)]",
    inCopy: "how",
    aside: "where",
    alignStart: true,
  },
};

const NO_BAND: BandLayout = { ground: "bg-paper" };

const GRID =
  "grid grid-cols-1 gap-[24px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)]";
const CARD =
  "bg-card rounded-letter shadow-letter grid content-start gap-[14px] p-[22px] md:p-[32px]";
const LABEL =
  "m-0 font-body text-xs font-bold uppercase tracking-(--tracking-label) text-ink-3";
const PROSE =
  "grid max-w-(--measure) gap-(--space-md) text-[17px] leading-[1.55] text-ink-2 md:text-[19px]";

function Paragraphs({
  paragraphs,
}: {
  readonly paragraphs: readonly string[];
}): ReactElement | null {
  if (paragraphs.length === 0) return null;
  return (
    <div className={PROSE}>
      {paragraphs.map((paragraph) => (
        <p className="m-0" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/** The four steps: an `<ol>` whose numbers are list counters, rings joined by a dashed rule. */
function Steps({
  section,
}: {
  readonly section: InfoSectionView;
}): ReactElement {
  const headingId = `info-${section.id}`;
  return (
    <section aria-labelledby={headingId} data-fo-info-section={section.id}>
      <h2 className={`${LABEL} mt-[40px]`} id={headingId}>
        {section.heading}
      </h2>
      <ol
        className="m-0 mt-[24px] grid list-none grid-cols-1 gap-[28px] p-0 [counter-reset:step] md:mt-[36px] md:grid-cols-4"
        data-fo-info-items={section.id}
      >
        {section.items.map((item) => (
          <li
            className="before:bg-card before:font-display before:text-md before:text-mark md:[&:not(:last-child)]:after:border-accent relative grid content-start gap-[8px] ps-[70px] [counter-increment:step] before:absolute before:start-0 before:top-0 before:grid before:size-[54px] before:place-items-center before:rounded-full before:shadow-[inset_0_0_0_2px_var(--color-mark)] before:content-[counter(step)] md:ps-0 md:pt-[70px] md:[&:not(:last-child)]:after:absolute md:[&:not(:last-child)]:after:start-[62px] md:[&:not(:last-child)]:after:-end-[20px] md:[&:not(:last-child)]:after:top-[27px] md:[&:not(:last-child)]:after:border-t-2 md:[&:not(:last-child)]:after:border-dashed md:[&:not(:last-child)]:after:content-['']"
            key={item.title}
          >
            <h3 className="font-display text-md m-0 leading-[1.2]">
              {item.title}
            </h3>
            <p className="text-ui text-ink-2 m-0">{item.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CompanyBlock({
  view,
  t,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement | null {
  const company = view.company;
  if (company === undefined) return null;
  const text = company.registered
    ? label(t, "company.operatedBy", {
        legalName: company.legalName,
        address: company.address,
        registrationNumber: company.registrationNumber,
      })
    : // No address, registry, VAT or legal-form field before registration (AC-11).
      label(t, "infoPages.company.notRegistered");
  return (
    <div
      className="bg-card rounded-photo max-w-(--measure) p-[26px] shadow-[inset_0_0_0_1px_var(--color-rule)]"
      data-fo-company-block={company.registered ? "registered" : "unregistered"}
    >
      <p className="text-ink-2 m-0">{text}</p>
    </div>
  );
}

function DestinationTable({
  view,
  t,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement | null {
  const rows = view.destinations;
  if (rows === undefined) return null;
  const ordered = sortBy(rows, localeCode(view.locale), (row) =>
    label(t, row.nameKey),
  );
  const cell = "border-rule border-b py-[12px] text-start align-baseline";
  return (
    <table className="w-full border-collapse" data-fo-destination-table>
      <thead>
        <tr>
          <th scope="col" className={`${cell} ${LABEL}`}>
            {label(t, "occasionHub.countryColumn")}
          </th>
          <th scope="col" className={`${cell} ${LABEL}`}>
            {label(t, "infoPages.delivery.status")}
          </th>
        </tr>
      </thead>
      <tbody>
        {ordered.map((row) => (
          <tr key={row.iso2} data-fo-destination-row={row.iso2}>
            <th scope="row" className={`${cell} font-normal`}>
              {row.href === undefined ? (
                label(t, row.nameKey)
              ) : (
                <a className="link" href={row.href}>
                  {label(t, row.nameKey)}
                </a>
              )}
            </th>
            <td className={`${cell} text-ink-2 text-sm`}>
              {label(t, row.stateKey)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaymentMethods({
  view,
}: {
  readonly view: InfoPageView;
}): ReactElement | null {
  const methods = view.paymentMethods;
  if (methods === undefined || methods.length === 0) return null;
  return (
    <div className={PROSE} data-fo-payment-methods>
      <p className="m-0">
        {formatList(
          methods.map((method) => method.displayName),
          localeCode(view.locale),
        )}
      </p>
    </div>
  );
}

/** A section's content: its data block, then its prose. */
function SectionBody({
  section,
  view,
  t,
}: {
  readonly section: InfoSectionView;
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement {
  // The payment section lists the available methods, or says we are not taking payments yet
  // (its body) while there are none (spec 041 §2, AC-14).
  const listed =
    section.block === "payment" && (view.paymentMethods?.length ?? 0) > 0;
  return (
    <>
      {section.block === "company" ? <CompanyBlock t={t} view={view} /> : null}
      {section.block === "destinations" ? (
        <DestinationTable t={t} view={view} />
      ) : null}
      {listed ? (
        <PaymentMethods view={view} />
      ) : (
        <Paragraphs paragraphs={section.paragraphs} />
      )}
    </>
  );
}

/** A promise list (how it works' "What we promise" / "What we do not promise") as a tinted box. */
function PromiseBox({
  section,
  tint,
}: {
  readonly section: InfoSectionView;
  readonly tint: string;
}): ReactElement {
  const headingId = `info-${section.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-photo grid content-start gap-[18px] p-[24px] md:p-[32px] ${tint}`}
      data-fo-info-section={section.id}
    >
      <h2 className="font-display m-0 text-xl leading-[1.1]" id={headingId}>
        {section.heading}
      </h2>
      <dl className="m-0 grid gap-[14px]" data-fo-info-items={section.id}>
        {section.items.map((item) => (
          <div key={item.title}>
            <dt className="text-ink font-bold">{item.title}</dt>
            <dd className="text-ink-2 m-0">{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One body section: the heading on columns 1–4, the content on 5–11 (the artboards' `.two`). */
function Section({
  section,
  view,
  t,
}: {
  readonly section: InfoSectionView;
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement {
  const headingId = `info-${section.id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`${GRID} pt-[40px] md:pt-[64px]`}
      data-fo-info-section={section.id}
    >
      <Display as="h2" id={headingId} size="2xl" className="md:col-span-4">
        {section.heading}
      </Display>
      <div className="grid gap-[18px] md:col-span-7 md:col-start-5">
        <SectionBody section={section} t={t} view={view} />
      </div>
    </section>
  );
}

/** The band's card: the guarantee's promise, about's signature, delivery's destination sheet. */
function AsideCard({
  section,
  view,
  t,
}: {
  readonly section: InfoSectionView;
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement {
  const headingId = `info-${section.id}`;
  const [lead, ...rest] = section.paragraphs;
  const placement = "md:col-span-5 md:col-start-8";
  if (section.id === "who-runs-it") {
    return (
      <section
        aria-labelledby={headingId}
        className={`${CARD} ${placement}`}
        data-fo-info-section={section.id}
      >
        <h2 className={LABEL} id={headingId}>
          {section.heading}
        </h2>
        {section.paragraphs.map((paragraph) => (
          <p
            className="font-display text-md m-0 leading-[1.35]"
            key={paragraph}
          >
            {paragraph}
          </p>
        ))}
      </section>
    );
  }
  if (section.block === "destinations") {
    return (
      <section
        aria-labelledby={headingId}
        className={`${CARD} ${placement}`}
        data-fo-info-section={section.id}
      >
        <h2 className="font-display text-md m-0" id={headingId}>
          {section.heading}
        </h2>
        <SectionBody section={section} t={t} view={view} />
      </section>
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD} ${placement}`}
      data-fo-info-section={section.id}
    >
      <h2 className={`${LABEL} text-stem`} id={headingId}>
        {section.heading}
      </h2>
      {lead === undefined ? null : (
        <p className="font-display text-ink m-0 max-w-[30ch] text-[22px] leading-[1.3] md:text-[27px]">
          {lead}
        </p>
      )}
      {rest.map((paragraph) => (
        <p className="text-ui text-ink-2 m-0 max-w-[48ch]" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </section>
  );
}

/** The help page's contact card (spec 041 §2 "Help and contact", AC-12, AC-15, AC-34). */
function ContactBlock({
  view,
  t,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
}): ReactElement | null {
  const contact = view.contact;
  if (contact === undefined) return null;
  const row =
    "border-rule grid grid-cols-[92px_minmax(0,1fr)] items-center gap-x-[14px] border-b py-[10px] md:grid-cols-[110px_minmax(0,1fr)]";
  const number =
    "link font-display inline-flex min-h-(--target-min) items-center whitespace-nowrap text-[21px] md:text-[27px]";
  return (
    <section
      aria-labelledby="info-contact"
      className={`${CARD} md:col-span-5 md:col-start-8 md:row-start-1`}
      data-fo-contact-block
    >
      <h2 className="font-display text-lg-s m-0 md:text-xl" id="info-contact">
        {label(t, "infoPages.contact.heading")}
      </h2>
      <p className="text-ink-2 m-0">{label(t, "infoPages.contact.body")}</p>
      <dl className="m-0 grid gap-[10px]">
        <div className={row}>
          <dt className={LABEL}>{label(t, "infoPages.contact.phone")}</dt>
          <dd className="m-0">
            <a className={number} href={contact.telHref} data-fo-contact-phone>
              {contact.phoneDisplay}
            </a>
          </dd>
        </div>
        {contact.whatsappHref === undefined ? null : (
          <div className={row}>
            <dt className={LABEL}>{label(t, "company.support.whatsapp")}</dt>
            <dd className="m-0">
              <a
                className={number}
                href={contact.whatsappHref}
                data-fo-contact-whatsapp
              >
                {contact.phoneDisplay}
              </a>
            </dd>
          </div>
        )}
      </dl>
      {/* The mailbox, only once `company.ts` has one (§13 Q2): never an empty slot. */}
      {contact.supportEmail === undefined ? null : (
        <p className="m-0">
          <a
            className="link"
            href={`mailto:${contact.supportEmail}`}
            data-fo-contact-email
          >
            {contact.supportEmail}
          </a>
        </p>
      )}
      <p className="text-ink-2 m-0 text-sm">
        {contact.privacyHref === undefined ? (
          label(t, "infoPages.contact.privacy")
        ) : (
          <a className="link" href={contact.privacyHref}>
            {label(t, "infoPages.contact.privacy")}
          </a>
        )}
      </p>
    </section>
  );
}

function Question({
  item,
  n,
}: {
  readonly item: { readonly q: string; readonly a: string };
  readonly n: string;
}): ReactElement {
  return (
    <div
      className="border-rule grid break-inside-avoid gap-[8px] border-t py-[18px]"
      data-fo-faq-item
    >
      <span
        aria-hidden="true"
        className="text-mark font-body text-xs font-bold tracking-[0.08em] tabular-nums"
      >
        {n}
      </span>
      <h2 className="font-display text-h3-s md:text-h3 m-0 leading-(--line-height-title)">
        {item.q}
      </h2>
      <p className="text-ink-2 m-0">{item.a}</p>
    </div>
  );
}

function numbered(view: InfoPageView) {
  return view.faq.map((item, index) => ({
    item,
    n: String(index + 1).padStart(2, "0"),
  }));
}

function Band({
  layout,
  children,
}: {
  readonly layout: BandLayout;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      className={`flow-root pb-[40px] [clip-path:inset(0_-100vmax)] ${layout.ground}`}
      data-fo-info-band
    >
      {children}
    </section>
  );
}

function Head({
  view,
  t,
  children,
}: {
  readonly view: InfoPageView;
  readonly t: Translator;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="grid content-start justify-items-start gap-[14px]">
      <Display as="h1" size="display">
        {view.h1}
      </Display>
      {view.notYetOpen ? (
        <p
          className="border-sun text-ink-2 m-0 border-s-2 py-[4px] ps-[12px] text-sm"
          data-fo-not-yet-open
          role="note"
        >
          {label(t, "infoPages.status.notYetOpen")}
        </p>
      ) : null}
      {view.untranslated ? (
        <p
          className="border-sky text-ink-2 m-0 border-s-2 py-[4px] ps-[12px] text-sm"
          data-fo-untranslated
          role="note"
        >
          {label(t, "infoPages.status.untranslated")}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function Intro({
  text,
}: {
  readonly text: string | undefined;
}): ReactElement | null {
  if (text === undefined) return null;
  return (
    <p className="text-ink-2 m-0 max-w-[46ch] text-[19px] leading-[1.5] md:text-[21px]">
      {text}
    </p>
  );
}

export function InfoPage({
  pageId,
  locale,
}: InfoPageProps): ReactElement | null {
  const t = useTranslations();
  const a11y = useTranslations("a11y");
  const view = infoPageView(pageId, locale, {
    nameOf: (key) => label(t, key),
  });
  if (view === undefined) return null;

  const layout = BAND[view.pageId] ?? NO_BAND;
  const byId = (id: string | undefined) =>
    view.sections.find((section) => section.id === id);
  const aside = byId(layout.aside);
  const inCopy = byId(layout.inCopy);
  const below = byId(layout.below);
  const placed = new Set([layout.aside, layout.inCopy, layout.below]);
  const body = view.sections.filter((section) => !placed.has(section.id));
  const promiseBoxes = body.filter(
    (section) => section.items.length > 0 && !section.ordered,
  );
  const faq = numbered(view);

  const breadcrumb = (
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
  );

  return (
    <Container as="main" id="main" data-fo-info-page={view.pageId}>
      <Band layout={layout}>
        {breadcrumb}
        {view.contact !== undefined ? (
          <>
            <div className="pt-[24px]">
              <Head t={t} view={view} />
            </div>
            <div className={`${GRID} items-start pt-[20px]`} data-fo-help-grid>
              <ContactBlock t={t} view={view} />
              <div
                className="md:col-span-6 md:col-start-1 md:row-start-1"
                data-fo-faq-first
              >
                {faq.slice(0, 4).map(({ item, n }) => (
                  <Question item={item} key={item.q} n={n} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div
            className={`${GRID} pt-[28px] ${layout.introAside === true ? "md:items-end" : layout.alignStart === true ? "items-start" : "items-center"}`}
          >
            <div className="md:col-span-6">
              <Head t={t} view={view}>
                {layout.introAside === true ? null : (
                  <Intro text={view.intro} />
                )}
                {inCopy === undefined ? null : (
                  <section
                    aria-labelledby={`info-${inCopy.id}`}
                    className="grid gap-[10px] pt-[8px]"
                    data-fo-info-section={inCopy.id}
                  >
                    <h2
                      className="font-display text-md m-0"
                      id={`info-${inCopy.id}`}
                    >
                      {inCopy.heading}
                    </h2>
                    <Paragraphs paragraphs={inCopy.paragraphs} />
                  </section>
                )}
              </Head>
            </div>
            {layout.introAside === true ? (
              <div className="md:col-span-5 md:col-start-8">
                <Intro text={view.intro} />
              </div>
            ) : null}
            {aside === undefined ? null : (
              <AsideCard section={aside} t={t} view={view} />
            )}
          </div>
        )}
        {below === undefined ? null : <Steps section={below} />}
      </Band>

      {faq.length > 4 ? (
        <div
          className="pt-[32px] md:columns-2 md:gap-x-[56px]"
          data-fo-faq-rest
        >
          {faq.slice(4).map(({ item, n }) => (
            <Question item={item} key={item.q} n={n} />
          ))}
        </div>
      ) : null}

      {body.map((section) => {
        if (promiseBoxes.includes(section)) {
          // The two promise lists render once, side by side, at the first one's place.
          if (section !== promiseBoxes[0]) return null;
          return (
            <div
              className="grid grid-cols-1 gap-[24px] pt-[40px] md:grid-cols-2 md:pt-[64px]"
              key={section.id}
            >
              {promiseBoxes.map((box, index) => (
                <PromiseBox
                  key={box.id}
                  section={box}
                  tint={
                    index === 0
                      ? "bg-leaf-wash"
                      : "bg-paper-2 shadow-[inset_0_0_0_1px_var(--color-rule)]"
                  }
                />
              ))}
            </div>
          );
        }
        return <Section key={section.id} section={section} t={t} view={view} />;
      })}

      {view.links.length === 0 ? null : (
        <div
          className="border-rule mt-[48px] border-t pt-[28px] pb-[8px] md:mt-[72px]"
          data-fo-info-links
        >
          <ul className="m-0 flex list-none flex-wrap gap-(--space-sm) p-0">
            {view.links.map((link) => (
              <li key={link.to}>
                <a
                  className="bg-card text-link inline-flex min-h-(--target-min) items-center rounded-full px-[18px] font-bold no-underline shadow-[inset_0_0_0_1px_var(--color-rule)]"
                  href={link.href}
                  data-fo-info-link={link.to}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="pb-(--section-fluid)" />
    </Container>
  );
}
