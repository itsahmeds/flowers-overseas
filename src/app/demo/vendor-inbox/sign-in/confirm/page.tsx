/**
 * @purpose GET {base}/sign-in/confirm: one Continue button, uses nothing (AC-19)
 * @spec 011
 *
 * The emailed link opens this. A mail scanner's or a chat app's preview fetches it and burns
 * nothing: the token is consumed only by the button's `POST` to `{base}/api/auth/confirm`. A
 * malformed `t` shows the expired state. `no-referrer` (the layout), so the token never leaves in
 * a `Referer`. The language links keep the token on the page they lead to.
 */
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { z } from "zod";

import { FLORIST_PATHS, type FloristLanguage } from "@/config/florists";
import { ConfirmSignInSchema } from "@/lib/auth/schema";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";
import {
  FloristNotice,
  FloristSignInCard,
  FloristSignInTitle,
  FloristTextField,
} from "@/modules/ui/florist/FloristChrome";

import { SignedOutFrame } from "../../chrome";
import { currentFloristLanguage } from "../../request";

/** The link's `t` (the core's own rule); `?hl=` is the proxy's, so other keys are ignored. */
const ConfirmQuerySchema = z.object({ t: ConfirmSignInSchema.shape.t });

export async function generateMetadata(): Promise<Metadata> {
  const t = floristTranslator(await currentFloristLanguage());
  return { title: t("floristAuth.title") };
}

export default async function FloristConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const parsed = ConfirmQuerySchema.safeParse(await searchParams);
  const language = await currentFloristLanguage();
  const t = floristTranslator(language);
  const hrefFor = (next: FloristLanguage): string => {
    const query = new URLSearchParams();
    if (parsed.success) query.set("t", parsed.data.t);
    query.set("hl", next);
    return `${FLORIST_PATHS.confirm}?${query.toString()}`;
  };
  return (
    <SignedOutFrame t={t} language={language} hrefFor={hrefFor}>
      <FloristSignInCard>
        <FloristSignInTitle>{t("floristAuth.title")}</FloristSignInTitle>
        {parsed.success ? (
          <form method="post" action={FLORIST_PATHS.confirmPost}>
            <input type="hidden" name="t" value={parsed.data.t} />
            <input type="hidden" name="hl" value={language} />
            <Button type="submit" size="send" fullWidth>
              {t("floristAuth.confirmSubmit")}
            </Button>
          </form>
        ) : (
          <>
            <FloristNotice tone="warn">
              {t("floristAuth.expiredBody")}
            </FloristNotice>
            <form
              method="post"
              action={FLORIST_PATHS.request}
              className="grid gap-[18px]"
            >
              <input type="hidden" name="hl" value={language} />
              <FloristTextField
                id="florist-confirm-email"
                name="email"
                autoComplete="email"
                maxLength={254}
                label={t("floristAuth.email")}
              />
              <Button type="submit" size="send" fullWidth>
                {t("floristAuth.submit")}
              </Button>
            </form>
          </>
        )}
      </FloristSignInCard>
    </SignedOutFrame>
  );
}
