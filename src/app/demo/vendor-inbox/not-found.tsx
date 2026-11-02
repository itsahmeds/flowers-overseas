/**
 * @purpose The florist tree's 404: an order that is not this member's, or no longer theirs
 * @spec 011
 *
 * What `notFound()` renders under `{base}` (spec 011 §5.3 "Order: not found (404)"), in the
 * member's language (or `?hl=`), with a way back to the list. It says nothing about whose order
 * it was or whether it exists: another florist's assignment and a made-up id read the same.
 */
import type { ReactElement } from "react";

import { FLORIST_PATHS } from "@/config/florists";
import { floristTranslator } from "@/modules/partners/auth/copy";

import { currentFloristLanguage } from "./request";

export default async function FloristNotFound(): Promise<ReactElement> {
  const t = floristTranslator(await currentFloristLanguage());
  return (
    <main
      className="grid content-start gap-[16px] px-[20px] pt-[36px] pb-[64px] md:mx-auto md:w-full md:max-w-[720px] md:px-[56px]"
      data-fo-florist-not-found
    >
      <h1 className="font-display tracking-display text-ink m-0 text-[34px] leading-[1.08] font-normal">
        {t("floristInbox.page.notFoundTitle")}
      </h1>
      <p className="text-body text-ink-2 m-0">
        {t("floristInbox.page.notFoundLine")}
      </p>
      <a
        className="text-link inline-flex min-h-(--target-min) items-center justify-self-start font-bold"
        href={FLORIST_PATHS.base}
      >
        {t("floristInbox.orders")}
      </a>
    </main>
  );
}
