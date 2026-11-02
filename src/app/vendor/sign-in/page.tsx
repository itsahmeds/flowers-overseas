/**
 * @purpose GET {base}/sign-in: the florist sign-in form and its states
 * @spec 011
 *
 * Artboards `florist-sign-in-desktop` / `-mobile` (TASK-212). `?state=` names the state and
 * nothing else (`sent`, `expired`, `signed-out`); `?hl=` the language before sign-in. No URL here
 * ever carries an address (AC-19). The form posts the address and the language to
 * `{base}/api/auth/request`, which answers every address with the same `303` to `?state=sent`
 * (AC-18): the "check your email" page is the same for everyone.
 */
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { z } from "zod";

import { FLORIST_PATHS, type FloristLanguage } from "@/config/florists";
import { signInStates } from "@/lib/auth/schema";
import { floristTranslator } from "@/modules/partners/auth/copy";
import { Button } from "@/modules/ui";
import {
  FloristMailDisc,
  FloristNotice,
  FloristSignInCard,
  FloristSignInTitle,
  FloristTextField,
} from "@/modules/ui/florist/FloristChrome";

import { SignedOutFrame } from "../chrome";
import { currentFloristLanguage } from "../request";

const StateSchema = z.object({
  state: z.enum(signInStates).optional().catch(undefined),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = floristTranslator(await currentFloristLanguage());
  return { title: t("floristAuth.title") };
}

function hrefFor(state: string | undefined) {
  return (language: FloristLanguage): string => {
    const query = new URLSearchParams();
    if (state !== undefined) query.set("state", state);
    query.set("hl", language);
    return `${FLORIST_PATHS.signIn}?${query.toString()}`;
  };
}

export default async function FloristSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { state } = StateSchema.parse(await searchParams);
  const language = await currentFloristLanguage();
  const t = floristTranslator(language);
  const body =
    state === "sent" ? (
      <>
        <FloristMailDisc />
        <FloristSignInTitle>{t("floristAuth.sentTitle")}</FloristSignInTitle>
        <p className="text-ink-2">{t("floristAuth.sentBody")}</p>
      </>
    ) : (
      <>
        <FloristSignInTitle>{t("floristAuth.title")}</FloristSignInTitle>
        {state === "expired" ? (
          <FloristNotice tone="warn">
            {t("floristAuth.expiredBody")}
          </FloristNotice>
        ) : null}
        <form
          method="post"
          action={FLORIST_PATHS.request}
          className="grid gap-[18px]"
        >
          <input type="hidden" name="hl" value={language} />
          <FloristTextField
            id="florist-sign-in-email"
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
    );
  return (
    <SignedOutFrame t={t} language={language} hrefFor={hrefFor(state)}>
      <FloristSignInCard>{body}</FloristSignInCard>
    </SignedOutFrame>
  );
}
