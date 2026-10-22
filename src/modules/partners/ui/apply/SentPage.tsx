/**
 * The application's sent page (spec 011 §2, §5.3 "Sent"; the second frame of
 * `for-florists-apply-*`, `.ap-sent`; TASK-210).
 *
 * One state: a thank-you, what happens next, the phone, and the walkthrough link. No query string
 * and nothing personal on the page: it is the same document for everyone, cached like the others,
 * and `noindex,follow` in every combination. Its keys render only here (`review-scope.ts`).
 */
import { getTranslations } from "next-intl/server";
import type { ReactElement } from "react";

import { type Company, COMPANY } from "@/config/company";
import { infoPagePath } from "@/modules/content";
import { Button } from "@/modules/ui";

export async function SentPage({
  locale,
  company = COMPANY,
}: {
  readonly locale: string;
  readonly company?: Company;
}): Promise<ReactElement> {
  const t = await getTranslations({ locale });
  const phone = company.contact.phoneDisplay;
  const body = t.rich("forFlorists.sent.body", {
    phoneDisplay: () => (
      <a
        className="text-link font-bold underline underline-offset-4"
        href={`tel:${company.contact.phoneE164}`}
      >
        {phone}
      </a>
    ),
  });
  return (
    <div
      className="mx-auto grid w-full max-w-[calc(var(--container-page)+2*var(--gutter))] gap-[16px] px-(--gutter-s) pt-[56px] pb-[96px] md:px-(--gutter)"
      data-fo-florist-sent
    >
      <span className="bg-leaf-wash text-stem grid size-[56px] place-items-center rounded-full">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-[28px]"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <h1 className="font-display md:text-title-fluid m-0 max-w-[18ch] text-[38px] leading-(--line-height-display) font-normal">
        {t("forFlorists.sent.h1")}
      </h1>
      <p className="text-lede-fluid text-ink-2 m-0 max-w-[52ch]">{body}</p>
      <div className="mt-[8px] flex flex-wrap gap-[12px]">
        <Button
          href={infoPagePath("how-orders-work", locale)}
          variant="secondary"
        >
          {t("forFlorists.sent.walkthrough")}
        </Button>
      </div>
    </div>
  );
}
