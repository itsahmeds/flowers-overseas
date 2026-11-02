/**
 * @purpose Tracking and not-working page bodies
 * @spec 018
 *
 * The tracking page's body (spec 018 §5.3 `track/[token]`, AC-3 to AC-6; the boards
 * `docs/design/wireframes/track-order-desktop.dc.html` and `-mobile.dc.html`; TASK-338).
 *
 * A Server Component that renders a `TrackingView` and nothing else: every word comes from the
 * `tracking` catalogue, every date and time through `formatDate` in the **destination's** zone
 * with the short zone name. The layout is the boards' `.s18-grid2`: the status column (postmark,
 * reference, the headline in a polite live region, the delivery line, the five-step `<ol>`) on
 * seven columns and the side column (photo, florist card, calendar and share tiles, help) on five
 * from `lg`; one column below, with the help line repeated in the phone dock.
 *
 * What it never prints (AC-4, AC-5; the founder's rulings of 2026-10-14): a recipient field, the
 * florist before production, the word "accepted", a refund or failure sentence (the cancelled and
 * refund lines are TASK-339's), a cancel control (the link is shared, §13 Q10).
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { COMPANY, whatsappHref } from "@/config/company";
import type { LocaleCode } from "@/config/locales";
import { formatDate, formatDateParts, localePath } from "@/modules/i18n";
import type {
  BuyerStep,
  TimelineStep,
  TimelineStepKey,
  TrackingView,
} from "@/modules/orders";
import {
  FIELD,
  FIELD_LABEL,
  INPUT,
  buttonClass,
} from "@/modules/ui/checkout/styles";
import { PAGE_FRAME } from "@/modules/ui/primitives/layout";
import { StickyActionBar } from "@/modules/ui/primitives/StickyActionBar";

import { ShareTile } from "./ShareTile";

/** The catalogue key of each buyer step (message keys are camelCase). */
export const STEP_KEY = {
  placed: "headline.placed",
  confirmed: "headline.confirmed",
  being_made: "headline.beingMade",
  on_its_way: "headline.onItsWay",
  delivered: "headline.delivered",
  closed: "headline.closed",
  cancelled: "headline.cancelled",
} as const satisfies Readonly<Record<BuyerStep, `headline.${string}`>>;

/** The help card's id: the phone dock's in-page twin. */
export const TRACK_HELP_ID = "track-help";

/** A date-only value (`YYYY-MM-DD`) as an instant that reads the same day in UTC. */
function calendarDay(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}

const CARD = "bg-card rounded-field shadow-[inset_0_0_0_1px_var(--color-rule)]";

const TILE = [
  "text-ink grid content-start gap-[4px] text-start no-underline",
  "md:rounded-field md:bg-card md:px-[16px] md:pt-[16px] md:pb-[18px] md:shadow-[inset_0_0_0_1px_var(--color-rule)]",
  "max-md:border-rule max-md:min-h-[64px] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:border-b max-md:border-solid max-md:py-[14px]",
  "[&>b]:font-display [&>b]:text-link [&>b]:text-[19px] [&>b]:leading-[1.2] [&>b]:font-(--font-weight-display) [&>b]:underline [&>b]:decoration-[1.5px] [&>b]:underline-offset-[5px]",
  "[&>span]:text-ink-2 [&>span]:text-sm [&>span]:leading-[1.4] max-md:[&>span]:col-start-1",
].join(" ");

const MARKER: Readonly<Record<TimelineStep["state"] | "cancelled", string>> = {
  done: "bg-stem text-card",
  current: "bg-sky text-card shadow-[0_0_0_5px_var(--color-sage-wash)]",
  future:
    "bg-card text-mark shadow-[inset_0_0_0_1.5px_var(--color-mark),inset_0_0_0_5px_var(--color-card),inset_0_0_0_6px_var(--color-mark)]",
  cancelled: "bg-ink text-paper font-body",
};

function Postmark({
  ring,
  day,
}: {
  readonly ring: string;
  readonly day: string;
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="h-[92px] w-[92px] flex-none -rotate-[8deg] drop-shadow-[0_6px_14px_var(--color-shade)] md:h-[168px] md:w-[168px]"
      data-fo-track-postmark=""
      focusable="false"
      viewBox="0 0 200 200"
    >
      <defs>
        <path
          d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0"
          id="track-postmark-ring"
        />
      </defs>
      <circle className="fill-card" cx="100" cy="100" r="97" />
      <circle
        className="stroke-mark fill-none"
        cx="100"
        cy="100"
        r="92"
        strokeWidth="2"
      />
      <circle
        className="stroke-mark fill-none"
        cx="100"
        cy="100"
        r="56"
        strokeWidth="1.5"
      />
      <text
        className="fill-mark font-body font-bold"
        fontSize="14"
        letterSpacing="2"
      >
        <textPath
          href="#track-postmark-ring"
          lengthAdjust="spacing"
          textLength="446"
        >
          {ring}
        </textPath>
      </text>
      <text
        className="fill-ink font-display"
        fontSize="54"
        textAnchor="middle"
        x="100"
        y="119"
      >
        {day}
      </text>
    </svg>
  );
}

export interface TrackingPageViewProps {
  readonly locale: LocaleCode;
  readonly view: TrackingView;
  /** `/{locale}/track/{token}/photo` and `/calendar.ics`, built by the route. */
  readonly photoHref: string;
  readonly calendarHref: string;
}

export async function TrackingPageView({
  locale,
  view,
  photoHref,
  calendarHref,
}: TrackingPageViewProps): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "tracking" });
  const zone = view.timeline.timeZone;
  const deliveryDay = calendarDay(view.deliveryDate);
  const deliveryLong = formatDate(
    deliveryDay,
    locale,
    "weekdayDayMonth",
    "UTC",
  );
  const stepTime = (at: Date): string =>
    formatDate(at, locale, "stepTime", zone);
  const delivered = view.timeline.steps.find(
    (step) => step.step === "delivered" && step.state !== "future",
  );
  const city = view.destinationCity;

  const lede =
    view.projection === "cancelled"
      ? null
      : delivered === undefined
        ? city === null
          ? t("lede.plannedNoCity", { date: deliveryLong })
          : t("lede.planned", { date: deliveryLong, city })
        : (() => {
            const date =
              delivered.at === null
                ? deliveryLong
                : formatDate(delivered.at, locale, "weekdayDayMonth", zone);
            return city === null
              ? t("lede.deliveredNoCity", { date })
              : t("lede.delivered", { date, city });
          })();

  const shortDate = formatDate(deliveryDay, locale, "deliveryDate", "UTC");
  const ringUnit = (city === null ? [shortDate] : [city, shortDate])
    .join(" · ")
    .toLocaleUpperCase(locale);
  const ring = `${ringUnit} · ${ringUnit} ·`;
  const day = formatDateParts(deliveryDay, locale, "UTC").day;

  const florist =
    view.floristCity === null
      ? null
      : view.floristFirstName === null
        ? t("floristLineNoName", { city: view.floristCity })
        : t("floristLine", {
            name: view.floristFirstName,
            city: view.floristCity,
          });

  const steps = view.timeline.steps;
  const cancelledAt = view.timeline.cancelledAt;
  const cancelled = view.projection === "cancelled";
  const help = t("help.whatsapp", { phone: COMPANY.contact.phoneDisplay });

  const stepLabel = (step: TimelineStepKey): string => t(STEP_KEY[step]);

  return (
    <main
      className={`${PAGE_FRAME} pb-[40px]`}
      data-fo-track="page"
      data-fo-track-step={view.projection}
      id="main"
    >
      {view.demo === null ? null : (
        <div
          className="bg-paper-3 border-rule text-ink-2 -mx-(--gutter-s) border-b border-solid px-(--gutter-s) py-[8px] text-sm md:-mx-(--gutter) md:px-(--gutter)"
          data-fo-track-demo={view.demo}
          role="note"
        >
          <p className="m-0">
            <strong className="text-ink font-bold">
              {t(view.demo === "demo" ? "demo.title" : "demo.testTitle")}
            </strong>{" "}
            {t(view.demo === "demo" ? "demo.body" : "demo.testBody")}
          </p>
        </div>
      )}
      <div className="grid items-start gap-[24px] pt-[16px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-[56px] lg:pt-[28px]">
        <div className="min-w-0">
          <div className="mb-[18px] flex items-center gap-[14px] md:gap-[24px]">
            <Postmark day={day} ring={ring} />
            <div className="min-w-0">
              <p className="eyebrow m-0 mb-[8px]">
                {t("eyebrow", { reference: view.reference })}
              </p>
              <div aria-live="polite">
                <h1
                  className="display text-3xl-fluid m-0 leading-[1.05]"
                  data-fo-track-headline={view.projection}
                >
                  {t(STEP_KEY[view.projection])}
                </h1>
              </div>
            </div>
          </div>
          {lede === null ? null : (
            <p className="text-ink-2 text-body mb-[24px] max-w-[40ch] md:text-[21px] md:leading-[1.5]">
              {lede}
            </p>
          )}
          <ol
            aria-label={t("timelineLabel")}
            className="m-0 grid list-none p-0"
          >
            {steps.map((step, index) => {
              const last = index === steps.length - 1 && cancelledAt === null;
              const marker = step.state === "done" ? "✓" : String(index + 1);
              return (
                <li
                  aria-current={step.state === "current" ? "step" : undefined}
                  className="relative grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-[18px] gap-y-[4px] pb-[22px] md:grid-cols-[52px_minmax(0,1fr)_auto]"
                  data-fo-track-state={step.state}
                  data-fo-track-timeline-step={step.step}
                  key={step.step}
                >
                  <span
                    aria-hidden="true"
                    className={`font-display text-ui md:text-h3 row-span-2 grid h-[38px] w-[38px] place-items-center rounded-full md:h-[44px] md:w-[44px] ${MARKER[step.state]}`}
                  >
                    {marker}
                  </span>
                  {last ? null : (
                    <span
                      aria-hidden="true"
                      className={`absolute start-[18px] top-[42px] bottom-[4px] border-s-2 md:start-[21px] md:top-[48px] ${step.state === "done" ? "border-stem border-solid" : "border-rule border-dashed"}`}
                    />
                  )}
                  <h3
                    className={`text-h3-s md:text-md m-0 pt-[6px] leading-[1.2] md:pt-[8px] ${step.state === "future" ? "text-ink-3" : "text-ink"}`}
                  >
                    {stepLabel(step.step)}
                  </h3>
                  {step.at === null ? null : (
                    <time
                      className="text-ink-3 col-start-2 text-sm tabular-nums md:col-start-auto md:pt-[12px]"
                      dateTime={step.at.toISOString()}
                    >
                      {stepTime(step.at)}
                    </time>
                  )}
                </li>
              );
            })}
            {cancelled ? (
              <li
                aria-current="step"
                className="relative grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-[18px] gap-y-[4px] pb-[22px] md:grid-cols-[52px_minmax(0,1fr)_auto]"
                data-fo-track-state="current"
                data-fo-track-timeline-step="cancelled"
              >
                <span
                  aria-hidden="true"
                  className={`text-ui md:text-h3 row-span-2 grid h-[38px] w-[38px] place-items-center rounded-full md:h-[44px] md:w-[44px] ${MARKER.cancelled}`}
                >
                  ×
                </span>
                <h3 className="text-h3-s md:text-md text-ink m-0 pt-[6px] leading-[1.2] md:pt-[8px]">
                  {t(STEP_KEY.cancelled)}
                </h3>
                {cancelledAt === null ? null : (
                  <time
                    className="text-ink-3 col-start-2 text-sm tabular-nums md:col-start-auto md:pt-[12px]"
                    dateTime={cancelledAt.toISOString()}
                  >
                    {stepTime(cancelledAt)}
                  </time>
                )}
              </li>
            ) : null}
          </ol>
          {view.substitution === null ? null : (
            <p
              className="bg-paper-2 text-ink-2 rounded-field text-ui m-0 mt-[4px] px-[18px] py-[14px]"
              data-fo-track-substitution=""
            >
              {t("substitution", { note: view.substitution })}
            </p>
          )}
        </div>

        <div className="grid min-w-0 content-start gap-[16px]">
          {view.photoState.kind === "available" ? (
            <figure className="m-0 grid gap-[10px]" data-fo-track-photo="">
              {/* A same-origin, token-checked proxy (AC-6). A plain `<picture>`, as
                  `MediaAsset` draws one: `next/image` would route the buyer's private photo
                  through the image optimiser and its cache. */}
              <picture className="contents">
                <img
                  alt={t("photoAlt", {
                    date: formatDate(
                      view.photoState.takenAt,
                      locale,
                      "weekdayDayMonth",
                      zone,
                    ),
                  })}
                  className="bg-paper-3 aspect-[4/5] w-full rounded-(--radius-photo) object-cover shadow-[inset_0_0_0_1px_var(--color-rule)] lg:rounded-(--radius-hero)"
                  decoding="async"
                  src={photoHref}
                />
              </picture>
              <figcaption className="text-ink-2 text-sm">
                {t("photoCaption", { time: stepTime(view.photoState.takenAt) })}
              </figcaption>
            </figure>
          ) : null}
          {view.photoState.kind === "deleted" ? (
            <p className="text-ink-2 m-0 text-sm" data-fo-track-photo="deleted">
              {t("photoDeleted", {
                date: formatDate(
                  view.photoState.deletedOn,
                  locale,
                  "dayMonth",
                  zone,
                ),
              })}
            </p>
          ) : null}
          {florist === null ? null : (
            <div
              className={`${CARD} grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-[16px] px-[18px] py-[16px]`}
              data-fo-track-florist=""
            >
              <i
                aria-hidden="true"
                className="bg-sage-wash font-display text-md text-sky-strong grid h-[52px] w-[52px] place-items-center rounded-full not-italic"
              >
                {(view.floristFirstName ?? view.floristCity ?? "")
                  .slice(0, 1)
                  .toLocaleUpperCase(locale)}
              </i>
              <p className="display text-h3-s md:text-h3 m-0 leading-[1.25]">
                {florist}
              </p>
            </div>
          )}
          {view.canShare ? (
            <div className="max-md:border-rule grid gap-0 max-md:border-t max-md:border-solid md:grid-cols-2 md:gap-[12px]">
              <a className={TILE} data-fo-track-calendar="" href={calendarHref}>
                <b>{t("calendar.title")}</b>
                <span>{t("calendar.when", { date: deliveryLong })}</span>
              </a>
              <ShareTile
                body={t("share.body")}
                className={`${TILE} cursor-pointer border-x-0 border-t-0 bg-transparent font-[inherit]`}
                copied={t("share.copied")}
                title={t("share.title")}
              />
            </div>
          ) : null}
          <div
            className={`${CARD} grid gap-[6px] px-[22px] py-[20px]`}
            id={TRACK_HELP_ID}
          >
            <h2 className="display text-h3 m-0">{t("help.title")}</h2>
            <p className="text-ink-2 m-0 text-sm leading-(--line-height-tight)">
              {t("help.quote", { reference: view.reference })}
            </p>
            <a
              className="font-display text-md text-link underline underline-offset-[5px]"
              href={whatsappHref(COMPANY.contact)}
            >
              {help}
            </a>
            <p className="text-ink-2 m-0 text-sm">{t("help.hours")}</p>
          </div>
        </div>
      </div>
      <StickyActionBar action={{ href: `#${TRACK_HELP_ID}`, label: help }} />
    </main>
  );
}

/**
 * The not-working page (spec 018 §5.3 "not working", AC-7; `track-order-*.dc.html` "not working";
 * TASK-338): one body per locale for an invalid, a forged, a rotated and an expired link, with the
 * lookup form and no order data. It reads nothing but the locale, so it cannot differ by cause.
 *
 * The form posts the reference and email to `/{locale}/track`, the lookup (`lookupTracking`,
 * TASK-339). It is a POST, so the email never enters an address.
 */
export async function NotWorkingView({
  locale,
}: {
  readonly locale: LocaleCode;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale, namespace: "tracking" });
  const form = await getTranslations({ locale, namespace: "trackLookup" });
  return (
    <main className={PAGE_FRAME} data-fo-track="not-working" id="main">
      <div className="grid max-w-[640px] justify-items-start gap-[16px] pt-[32px] pb-[16px] md:pt-[56px] md:pb-[24px]">
        <h1 className="display text-3xl-fluid m-0 leading-[1.12]">
          {t("notWorking.title")}
        </h1>
        <p className="text-ink-2 m-0 max-w-[52ch]">{t("notWorking.body")}</p>
      </div>
      <form
        action={localePath(locale, "home", "track")}
        className="bg-card mb-[56px] grid max-w-[560px] gap-[14px] rounded-(--radius-letter) px-[18px] pt-[22px] pb-[24px] shadow-(--shadow-letter) md:gap-[18px] md:px-[34px] md:pt-[30px] md:pb-[32px]"
        method="post"
      >
        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="track-reference">
            {form("reference")}
          </label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            className={INPUT}
            id="track-reference"
            maxLength={12}
            name="reference"
            placeholder={form("referencePlaceholder")}
            required
            spellCheck={false}
            type="text"
          />
        </div>
        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor="track-email">
            {form("email")}
          </label>
          <input
            autoComplete="email"
            className={INPUT}
            id="track-email"
            inputMode="email"
            maxLength={254}
            name="email"
            placeholder={form("emailPlaceholder")}
            required
            type="email"
          />
        </div>
        <div>
          <button className={buttonClass("primary", "md")} type="submit">
            {form("submit")}
          </button>
        </div>
      </form>
    </main>
  );
}
