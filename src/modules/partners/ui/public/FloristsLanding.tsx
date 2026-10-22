/**
 * The for-florists landing (spec 011 §2 "Landing blocks", §5.3, AC-2, AC-4, AC-9; artboards
 * `for-florists-desktop.dc.html` and `-mobile.dc.html`, `.ff-*`; TASK-210).
 *
 * A server component with no client JavaScript (AC-35), no image (AC-2) and no literal copy: the
 * prose is `content/pages/{locale}/for-florists.md` through `infoPageView()`, the two keyed lines
 * are `forFlorists.status.choosingFirst` and `infoPages.status.untranslated`, and every number is
 * data (`formatMoney`, `formatDate`).
 *
 * §2's blocks in §2's order, which is also the DOM order: the ink band (breadcrumb, the `<h1>`,
 * the intro's first sentence, the two calls to action, the status line while no delivery date is
 * open, and beside them an example order drawn as a docket, marked "Example"); the rest of the
 * intro and what we do and what you do; what you receive (the payout example, when you are paid,
 * what we never ask for); how an order reaches you; the questions; talk to us first; where we
 * start with each country guide that exists; the closing call to action. Absent, not placeholder:
 * no count, testimonial, logo, photograph or photo slot.
 */
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { infoPagePath } from "@/modules/content";
import type { InfoPageView, InfoSectionView } from "@/modules/content";
import { Breadcrumbs, Button } from "@/modules/ui";

import type { FloristOrderView } from "../../inbox/view.ts";
import type { PayoutExampleView } from "../../public/payout.ts";
import { deliveryDateLabel, label, tierLabel } from "../inbox/format.ts";

import { Emphasised, introParts, sectionById } from "./text.tsx";

export interface FloristsLandingView {
  readonly page: InfoPageView;
  readonly payout: PayoutExampleView;
  /** The walkthrough's example order at its offer stage, drawn as the docket. */
  readonly example: FloristOrderView;
}

const SECTION = "py-[48px] md:py-[56px]";
const H2 =
  "font-display m-0 mb-[20px] text-3xl-fluid leading-(--line-height-heading) font-normal tracking-(--tracking-display) md:mb-[28px]";
const H3 = "font-display text-h3 m-0 font-normal leading-[1.25]";
const BOX =
  "grid content-start gap-[18px] rounded-(--radius-photo) px-[20px] py-[22px] md:px-[34px] md:py-[32px]";
const TICKS =
  "m-0 grid list-none p-0 [&>li]:border-b [&>li]:border-ink/12 [&>li]:py-[10px] [&>li]:text-ink [&>li]:before:me-[10px] [&>li]:before:font-bold [&>li]:before:text-stem [&>li]:before:content-['✓']";

/** One section by its authored id; the content gate (`pages:check`) guarantees every one exists. */
function section(view: InfoPageView, id: string): InfoSectionView {
  return sectionById(view, id);
}

function Docket({
  view,
  example,
}: {
  readonly view: FloristsLandingView;
  readonly example: FloristOrderView;
}): ReactElement {
  const t = useTranslations();
  const labels = view.page.florists;
  if (labels === undefined)
    throw new Error("for-florists has no `florists` labels");
  return (
    <aside
      aria-label={labels.docket.heading}
      className="bg-card text-ink relative grid gap-[14px] rounded-(--radius-letter) px-[18px] py-[20px] shadow-(--shadow-letter) after:absolute after:start-0 after:end-0 after:-bottom-[10px] after:h-[10px] after:bg-[radial-gradient(circle_at_8px_0,var(--color-card)_7px,transparent_7.5px)] after:bg-[length:16px_10px] after:bg-repeat-x after:content-[''] md:col-span-5 md:col-start-8 md:px-[28px] md:pt-[26px] md:pb-[24px]"
      data-fo-docket
    >
      <p className="text-ink-3 m-0 flex items-center justify-between gap-[12px] text-xs font-bold tracking-(--tracking-label) uppercase">
        <span>{labels.docket.heading}</span>
        <span className="bg-accent text-card rounded-full px-[10px] py-[3px] tracking-[0.06em]">
          {labels.example}
        </span>
      </p>
      <p className="font-display m-0 text-xl leading-[1.1]">
        {example.product.name} · {tierLabel(t, example.product.tier)}
      </p>
      <dl className="border-rule m-0 grid gap-[8px] border-y border-dashed py-[12px]">
        <div className="text-ui grid grid-cols-[120px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-ink-3 text-sm">{labels.docket.deliver}</dt>
          <dd className="m-0">
            {deliveryDateLabel(
              example.delivery.date,
              view.page.locale,
              example.delivery.timeZone,
            )}
            , <bdi>{example.delivery.town}</bdi>
          </dd>
        </div>
        <div className="text-ui grid grid-cols-[120px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-ink-3 text-sm">{labels.docket.card}</dt>
          <dd className="m-0">{labels.docket.cardText}</dd>
        </div>
        <div className="text-ui grid grid-cols-[120px_minmax(0,1fr)] gap-[12px]">
          <dt className="text-ink-3 text-sm">{labels.docket.payout}</dt>
          <dd className="m-0">{labels.docket.payoutText}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 gap-[10px]" aria-hidden="true">
        <span className="bg-stem text-card text-ui grid min-h-[46px] place-items-center rounded-full font-bold">
          {t("floristInbox.accept")}
        </span>
        <span className="text-ink-2 text-ui grid min-h-[46px] place-items-center rounded-full font-bold shadow-[inset_0_0_0_1.5px_var(--color-ink-3)]">
          {t("floristInbox.decline")}
        </span>
      </div>
    </aside>
  );
}

function PayoutCard({
  view,
}: {
  readonly view: FloristsLandingView;
}): ReactElement {
  const labels = view.page.florists;
  if (labels === undefined)
    throw new Error("for-florists has no `florists` labels");
  return (
    <div
      className="bg-card grid gap-[14px] rounded-(--radius-letter) px-[18px] py-[20px] shadow-(--shadow-letter) md:col-span-5 md:px-[28px] md:py-[26px]"
      data-fo-payout-example
    >
      <div className="flex items-baseline justify-between gap-[12px]">
        <h3 className={H3}>{labels.payout.heading}</h3>
        <span className="bg-accent text-card rounded-full px-[10px] py-[3px] text-xs font-bold tracking-[0.08em] uppercase">
          {labels.example}
        </span>
      </div>
      <dl className="border-rule m-0 grid border-t">
        <div className="border-rule flex items-baseline justify-between gap-[16px] border-b py-[14px]">
          <dt className="text-ink-2 text-ui">{labels.payout.buyerPays}</dt>
          <dd
            className="font-display text-md m-0 whitespace-nowrap lining-nums tabular-nums"
            data-fo-payout-retail
          >
            {view.payout.retailLabel}
          </dd>
        </div>
        <div className="bg-leaf-wash -mx-[12px] flex items-baseline justify-between gap-[16px] rounded-md px-[12px] py-[14px]">
          <dt className="text-ink text-ui font-bold">
            {labels.payout.youReceive}
          </dt>
          <dd
            className="font-display text-md m-0 whitespace-nowrap lining-nums tabular-nums"
            data-fo-payout-florist
          >
            {view.payout.payoutLabel}
          </dd>
        </div>
      </dl>
      <p className="text-ink-2 m-0 text-sm leading-[1.5]">
        {labels.payout.note}
      </p>
    </div>
  );
}

function Bullets({
  items,
  className,
}: {
  readonly items: readonly string[];
  readonly className: string;
}): ReactElement {
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function FloristsLanding({
  view,
}: {
  readonly view: FloristsLandingView;
}): ReactElement {
  const t = useTranslations();
  const { page, example } = view;
  const labels = page.florists;
  if (labels === undefined)
    throw new Error("for-florists has no `florists` labels");
  const locale = page.locale;
  const applyHref = infoPagePath("florist-apply", locale);
  const walkthroughHref = infoPagePath("how-orders-work", locale);
  const [lede, rest] = introParts(page.intro);
  const weDo = section(page, "what-we-do");
  const youDo = section(page, "what-you-do");
  const receive = section(page, "receive");
  const paid = section(page, "paid");
  const never = section(page, "never");
  const steps = section(page, "steps");
  const questions = section(page, "questions");
  const talk = section(page, "talk");
  const start = section(page, "start");
  const help = page.links.find((link) => link.to === "help");

  const sectionHeading = (s: InfoSectionView, id: string): ReactNode => (
    <h2 className={H2} id={id}>
      <Emphasised text={s.heading} />
    </h2>
  );

  return (
    <div data-fo-florists-landing>
      {/* 1. The ink band: heading, intro, calls to action, the status line, the docket. */}
      <section
        className="bg-surface-inverse text-on-inverse pb-[52px] md:pb-[48px]"
        data-fo-block="hero"
      >
        <div className="mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) md:px-(--gutter)">
          <Breadcrumbs
            label={t("a11y.breadcrumb")}
            className="[&_a]:text-paper/85 [&_ol]:text-paper/85 [&_span[aria-current]]:text-paper/85"
            crumbs={page.breadcrumb.map((crumb) => ({
              key: crumb.labelKey,
              label:
                crumb.labelValue === undefined
                  ? label(t, crumb.labelKey)
                  : label(t, crumb.labelKey, { name: crumb.labelValue }),
              href: crumb.href,
              current: crumb.current,
            }))}
          />
          <div className="grid grid-cols-1 items-center gap-[32px] pt-[14px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)] md:pt-[32px]">
            <div className="grid gap-[22px] md:col-span-6">
              <p className="text-on-inverse-accent m-0 text-xs font-bold tracking-(--tracking-label) uppercase">
                {t("nav.forFlorists")}
              </p>
              <h1 className="font-display text-display-fluid [&_em]:text-on-inverse-accent m-0 leading-(--line-height-display) font-normal tracking-(--tracking-hero) text-balance [&_em]:font-(--font-weight-display-em)">
                <Emphasised text={page.h1Marked} />
              </h1>
              {page.untranslated ? (
                <p
                  className="bg-paper-2 text-ink m-0 rounded-(--radius-field) px-[14px] py-[12px] text-sm"
                  data-fo-untranslated
                >
                  {t("infoPages.status.untranslated")}
                </p>
              ) : null}
              {lede === undefined ? null : (
                <p className="text-body-s md:text-lede-fluid text-paper/85 m-0 max-w-[46ch] leading-[1.5]">
                  {lede}
                </p>
              )}
              <div className="grid grid-cols-1 gap-[12px] md:flex md:flex-wrap">
                <Button href={applyHref} fullWidth className="md:w-auto">
                  {labels.apply}
                </Button>
                <Button
                  href={walkthroughHref}
                  variant="secondary"
                  fullWidth
                  className="text-on-inverse ring-paper/60 shadow-none ring-[1.5px] ring-inset md:w-auto"
                >
                  {labels.walkthrough}
                </Button>
              </div>
              {page.notYetOpen ? (
                <p
                  className="text-on-inverse border-paper/22 before:bg-sun m-0 inline-flex items-baseline gap-[10px] border-t pt-[14px] text-sm before:size-[8px] before:shrink-0 before:-translate-y-px before:rounded-full before:content-['']"
                  role="status"
                  data-fo-status-line
                >
                  {t("forFlorists.status.choosingFirst")}
                </p>
              ) : null}
            </div>
            <Docket view={view} example={example} />
          </div>
        </div>
      </section>

      {/* 2. The rest of the intro; what we do and what you do. */}
      <section
        className={`mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) md:px-(--gutter) ${SECTION}`}
        aria-labelledby="ff-we-do ff-you-do"
        data-fo-block="what-we-do"
      >
        {rest === undefined ? null : (
          <p className="text-body-s md:text-lede-fluid text-ink-2 m-0 mb-[20px] max-w-[62ch] leading-[1.5] md:mb-[28px]">
            {rest}
          </p>
        )}
        <div className="grid grid-cols-1 gap-[16px] md:grid-cols-2 md:gap-[24px]">
          <div className={`bg-sage-wash ${BOX}`}>
            <h2
              className="font-display text-lg-s m-0 leading-[1.1] font-normal md:text-lg"
              id="ff-we-do"
            >
              {weDo.heading}
            </h2>
            <Bullets items={weDo.bullets} className={TICKS} />
          </div>
          <div className={`bg-leaf-wash ${BOX}`}>
            <h2
              className="font-display text-lg-s m-0 leading-[1.1] font-normal md:text-lg"
              id="ff-you-do"
            >
              {youDo.heading}
            </h2>
            <Bullets items={youDo.bullets} className={TICKS} />
          </div>
        </div>
      </section>

      {/* 3. What you receive: the example, when you are paid, what we never ask for. */}
      <section
        className={`bg-paper-2 ${SECTION}`}
        aria-labelledby="ff-receive"
        data-fo-block="receive"
      >
        <div className="mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) md:px-(--gutter)">
          {sectionHeading(receive, "ff-receive")}
          <div className="grid grid-cols-1 items-start gap-y-[32px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)]">
            <PayoutCard view={view} />
            <div className="grid content-start gap-[28px] md:col-span-6 md:col-start-7">
              <div>
                <h3 className={`${H3} mb-[8px]`}>{paid.heading}</h3>
                {paid.paragraphs.map((paragraph) => (
                  <p className="text-ink-2 m-0" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
              </div>
              <div>
                <h3 className={`${H3} mb-[8px]`}>{never.heading}</h3>
                <Bullets
                  items={never.bullets}
                  className="[&>li]:border-rule [&>li]:text-ui [&>li]:text-ink m-0 grid list-none grid-cols-1 gap-x-[24px] p-0 md:grid-cols-2 [&>li]:border-b [&>li]:py-[9px]"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. How an order reaches you, four steps and the walkthrough link. */}
      <section
        className={`mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) md:px-(--gutter) ${SECTION}`}
        aria-labelledby="ff-steps"
        data-fo-block="steps"
      >
        {sectionHeading(steps, "ff-steps")}
        <ol className="m-0 grid list-none grid-cols-1 p-0 [counter-reset:ffs] md:grid-cols-4 md:gap-x-[clamp(24px,2.22vw,32px)]">
          {steps.bullets.map((step) => (
            <li
              className="text-ui text-ink border-rule before:font-display before:text-mark md:border-ink grid grid-cols-[36px_minmax(0,1fr)] items-baseline gap-[12px] border-t py-[14px] [counter-increment:ffs] before:text-lg before:leading-none before:content-[counter(ffs)] md:grid-cols-1 md:content-start md:border-t-2 md:pt-[18px] md:pb-0 md:before:text-xl"
              key={step}
            >
              {step}
            </li>
          ))}
        </ol>
        <p className="m-0 mt-[24px]">
          <a
            className="text-link font-bold underline decoration-[1.5px] underline-offset-[5px]"
            href={walkthroughHref}
          >
            {labels.screenByScreen}
          </a>
        </p>
      </section>

      {/* 5. The questions: every one a visible heading with its answer, nothing collapsed. */}
      <section
        className="mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) pb-[48px] md:px-(--gutter) md:pb-[56px]"
        aria-labelledby="ff-questions"
        data-fo-block="questions"
      >
        {sectionHeading(questions, "ff-questions")}
        <div className="grid grid-cols-1 md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)]">
          {page.faq.map((item) => (
            <div
              className="border-rule grid gap-[6px] border-t py-[16px] md:col-span-6 md:py-[20px]"
              key={item.q}
              data-fo-faq-item
            >
              <h3 className="font-display text-h3-s md:text-h3 m-0 leading-[1.25] font-normal">
                {item.q}
              </h3>
              <p className="text-ink-2 text-ui m-0 max-w-[58ch]">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 6. Talk to us first; where we start; the closing call to action. */}
      <section
        className={`bg-paper-2 ${SECTION}`}
        aria-labelledby="ff-talk ff-start"
        data-fo-block="talk"
      >
        <div className="mx-auto grid w-full max-w-[calc(var(--container-page)+2*var(--gutter))] grid-cols-1 items-start gap-y-[32px] px-(--gutter-s) md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)] md:gap-y-[40px] md:px-(--gutter)">
          <div className="grid justify-items-start gap-[12px] md:col-span-6">
            <h2
              className="font-display md:text-3xl-fluid m-0 text-[30px] leading-(--line-height-heading) font-normal"
              id="ff-talk"
            >
              <Emphasised text={talk.heading} />
            </h2>
            <p className="text-ink-2 m-0 max-w-[48ch]">
              {talk.paragraphs.join(" ")}
            </p>
            {page.contact?.whatsappHref === undefined ? null : (
              <a
                className="font-display text-md text-link underline-offset-[5px]"
                href={page.contact.whatsappHref}
                data-fo-whatsapp
              >
                {t("company.support.whatsapp")} {page.contact.phoneDisplay}
              </a>
            )}
            {help === undefined ? null : (
              <a
                className="text-link font-bold underline decoration-[1.5px] underline-offset-[5px]"
                href={help.href}
              >
                {help.label}
              </a>
            )}
          </div>
          <div className="grid justify-items-start gap-[12px] md:col-span-6">
            <h2
              className="font-display md:text-3xl-fluid m-0 text-[30px] leading-(--line-height-heading) font-normal"
              id="ff-start"
            >
              <Emphasised text={start.heading} />
            </h2>
            {start.paragraphs.map((paragraph) => (
              <p className="text-ink-2 m-0 max-w-[48ch]" key={paragraph}>
                {paragraph}
              </p>
            ))}
            {(page.guides ?? []).length === 0 ? null : (
              <ul className="m-0 grid list-none gap-[8px] p-0" data-fo-guides>
                {(page.guides ?? []).map((guide) => (
                  <li key={guide.iso2}>
                    <a
                      className="text-link font-bold underline decoration-[1.5px] underline-offset-[5px]"
                      href={guide.href}
                    >
                      {t("delivery.corridorLink", {
                        country: label(t, guide.nameKey),
                      })}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div
            className="border-rule flex flex-wrap items-center gap-x-[24px] gap-y-[12px] border-t pt-[32px] md:col-span-12"
            data-fo-block="close"
          >
            <Button href={applyHref} fullWidth className="md:w-auto">
              {labels.apply}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
