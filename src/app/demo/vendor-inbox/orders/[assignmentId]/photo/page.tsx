/**
 * @purpose GET {base}/orders/{assignmentId}/photo: the delivery photo step (AC-30)
 * @spec 011
 *
 * The photo step of the artboard (`florist-inbox-*`, "Photo step"): back to the order, the order
 * in one line, the camera field (TASK-210's `PhotoStep`), and "Send the photo", posted as
 * `multipart/form-data` with no JavaScript to the photo route (TASK-215). After a refused file
 * the step shows its message (`?error=wrong_type|too_large`). Offered only while the order is on
 * its way ("Delivered, add the photo") or delivered without a photo ("Add the photo"); otherwise
 * back to the order. Another florist's assignment is a 404.
 */
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";

import { FLORIST_PATHS } from "@/config/florists";
import { toDbContext } from "@/lib/auth/florist";
import { floristOrderView } from "@/modules/orders";
import { floristActions } from "@/modules/orders/florist-actions";
import { InboxDock, PhotoStep } from "@/modules/partners";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";

import { commandContextOf, oneOf } from "../../../actions";
import { SignedInFrame } from "../../../chrome";
import { currentFloristContext } from "../../../request";

const PHOTO_ERRORS = ["wrong_type", "too_large"] as const;

/** Appendix A's two photo messages. */
const ERROR_KEYS = {
  wrong_type: "floristInbox.photo.wrongType",
  too_large: "floristInbox.photo.tooLarge",
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const context = await currentFloristContext();
  const t = floristTranslator(context?.locale ?? "en");
  return { title: t("floristInbox.photo.send") };
}

export default async function FloristPhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { assignmentId } = await params;
  const error = oneOf(PHOTO_ERRORS, (await searchParams)["error"]);
  const context = await currentFloristContext();
  if (context === null) redirect(FLORIST_PATHS.signIn);
  setRequestLocale(context.locale);
  const t = floristTranslator(context.locale);
  const view = await floristOrderView(
    { ...toDbContext(context, randomUUID()), role: "partner" },
    assignmentId,
    { locale: context.locale },
  );
  if (view === null) notFound();
  const actions = await floristActions(
    commandContextOf(context),
    view.assignmentId,
  );
  if (!actions.includes("delivered") && !actions.includes("addPhoto")) {
    redirect(FLORIST_PATHS.order(view.assignmentId));
  }
  return (
    <SignedInFrame
      t={t}
      context={context}
      back={FLORIST_PATHS.photo(view.assignmentId)}
    >
      <form
        method="post"
        action={FLORIST_PATHS.photoFile(view.assignmentId)}
        encType="multipart/form-data"
      >
        <main className="@container grid content-start gap-[24px] px-[20px] pt-[20px] pb-[28px] md:mx-auto md:w-full md:max-w-[720px] md:px-[56px] md:pt-[36px] md:pb-[64px]">
          <PhotoStep
            view={view}
            locale={context.locale}
            backHref={FLORIST_PATHS.order(view.assignmentId)}
            fieldId="delivery-photo"
            {...(error === undefined ? {} : { error: t(ERROR_KEYS[error]) })}
          />
        </main>
        <InboxDock>
          <Button type="submit" className="min-h-[56px] px-[16px]">
            {t("floristInbox.photo.send")}
          </Button>
        </InboxDock>
      </form>
    </SignedInFrame>
  );
}
