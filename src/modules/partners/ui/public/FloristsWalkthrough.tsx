/**
 * The walkthrough, "How an order reaches you" (spec 011 §2 "The walkthrough", AC-3; artboards
 * `for-florists-walkthrough-desktop.dc.html` and `-mobile.dc.html`, `.wt-*`; TASK-210).
 *
 * Four steps, each its words beside a `<figure>`: the **real** inbox component from
 * `src/modules/partners/ui/inbox/` (the same exports the inbox page imports, asserted by import
 * identity), fed by `exampleFloristOrderView(locale)`, inside an `inert` phone frame with a
 * caption. No screenshot: the screens cannot drift from the product, cost no image bytes and are
 * text. Then the short sections (replacing a flower, when you are paid) and the closing call to
 * action. A server component with no client JavaScript.
 *
 * The screens draw no link and no form: every control in them is a plain button inside an inert
 * container, so a crawl of the page finds no florist route (which answers 404 in production).
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { infoPagePath } from "@/modules/content";
import type { InfoPageView, InfoSectionView } from "@/modules/content";
import { Button } from "@/modules/ui";

import { type FloristOrderView, listItemOf } from "../../inbox/view.ts";
import { InboxList } from "../inbox/InboxList.tsx";
import { OrderScreen } from "../inbox/OrderScreen.tsx";
import { PhotoStep } from "../inbox/PhotoStep.tsx";
import { InboxFrame } from "../inbox/parts.tsx";

import { PageHead } from "./PageHead.tsx";
import { PhoneFrame } from "./PhoneFrame.tsx";

export interface WalkthroughView {
  readonly page: InfoPageView;
  /** The example order before an answer, and after acceptance. */
  readonly offer: FloristOrderView;
  readonly accepted: FloristOrderView;
}

/** The inbox screen a step shows: the inbox's own components, as the inbox page composes them. */
function Screen({
  section,
  view,
}: {
  readonly section: InfoSectionView;
  readonly view: WalkthroughView;
}): ReactElement | null {
  const t = useTranslations("floristInbox");
  const locale = view.page.locale;
  switch (section.screen) {
    case "list":
      return (
        <InboxFrame>
          <InboxList
            locale={locale}
            title={t("orders")}
            titleAs="p"
            groups={[
              {
                id: "waiting",
                heading: t("stage.waiting"),
                items: [{ item: listItemOf(view.offer) }],
              },
            ]}
          />
        </InboxFrame>
      );
    case "offer":
      return (
        <InboxFrame
          dockWide
          dock={
            <>
              <Button variant="secondary">{t("decline")}</Button>
              <Button>{t("accept")}</Button>
            </>
          }
        >
          <OrderScreen
            view={view.offer}
            locale={locale}
            eyebrow={t("stage.waiting")}
            back={{ label: t("orders") }}
            titleAs="p"
          />
        </InboxFrame>
      );
    case "accepted":
      return (
        <InboxFrame dock={<Button>{t("outForDelivery")}</Button>}>
          <OrderScreen
            view={view.accepted}
            locale={locale}
            eyebrow={t("stage.inProgress")}
            back={{ label: t("orders") }}
            titleAs="p"
          />
        </InboxFrame>
      );
    case "photo":
      return (
        <InboxFrame dock={<Button>{t("photo.send")}</Button>}>
          <PhotoStep
            view={view.accepted}
            locale={locale}
            fieldId={`walkthrough-photo-${section.id}`}
          />
        </InboxFrame>
      );
    case undefined:
      return null;
  }
}

const H2 = "font-display text-2xl-fluid m-0 leading-[1.1] font-normal";

export function FloristsWalkthrough({
  view,
}: {
  readonly view: WalkthroughView;
}): ReactElement {
  const { page } = view;
  const steps = page.sections.filter((section) => section.screen !== undefined);
  const more = page.sections.filter((section) => section.screen === undefined);
  const apply = page.links.find((link) => link.to === "florist-apply");
  const landing = page.links.find((link) => link.to === "for-florists");
  return (
    <div data-fo-florists-walkthrough>
      <PageHead page={page} />
      <div className="mx-auto w-full max-w-[calc(var(--container-page)+2*var(--gutter))] px-(--gutter-s) md:px-(--gutter)">
        <ol className="m-0 grid list-none grid-cols-1 gap-y-[56px] p-0 pt-[36px] pb-[8px] [counter-reset:wt] lg:grid-cols-2 lg:gap-x-[clamp(24px,2.22vw,32px)] lg:pt-[56px] lg:pb-[16px]">
          {steps.map((section) => (
            <li
              className="grid grid-cols-1 items-center gap-y-[20px] [counter-increment:wt] md:grid-cols-[302px_minmax(0,1fr)] md:gap-x-[32px]"
              key={section.id}
              data-fo-walkthrough-step={section.id}
            >
              <div className="grid content-center gap-[12px] md:col-start-2 md:row-start-1">
                <h2
                  className={`${H2} before:font-body before:text-ui before:text-mark flex items-center gap-[12px] before:inline-grid before:size-[40px] before:shrink-0 before:place-items-center before:rounded-full before:font-bold before:shadow-[inset_0_0_0_1.5px_var(--color-mark)] before:content-[counter(wt)]`}
                >
                  {section.heading}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p className="text-ink-2 m-0 max-w-[40ch]" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
              </div>
              <div className="md:col-start-1 md:row-start-1">
                <PhoneFrame caption={section.caption ?? ""}>
                  <Screen section={section} view={view} />
                </PhoneFrame>
              </div>
            </li>
          ))}
        </ol>
        <div className="border-rule mt-[40px] grid grid-cols-1 gap-y-[32px] border-t py-[40px] md:grid-cols-12 md:gap-x-[clamp(24px,2.22vw,32px)]">
          {more.map((section, index) => (
            <div
              className={`grid content-start gap-[10px] ${index === 0 ? "md:col-span-5" : "md:col-span-5 md:col-start-7"}`}
              key={section.id}
              data-fo-walkthrough-more={section.id}
            >
              <h2 className={H2}>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p className="text-ink-2 m-0 max-w-[52ch]" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-[28px] gap-y-[16px] pb-[40px] md:pt-[8px] md:pb-[32px]">
          {apply === undefined ? null : (
            <Button href={infoPagePath("florist-apply", page.locale)}>
              {apply.label}
            </Button>
          )}
          {landing === undefined ? null : (
            <a
              className="text-link font-bold underline decoration-[1.5px] underline-offset-[5px]"
              href={landing.href}
            >
              {landing.label}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
