/**
 * @purpose GET /admin/sign-in/confirm?t=: one "Continue" button; the GET uses nothing up (spec 012 §2.2, AC-9)
 *
 * A mail scanner's or a chat app's preview fetches this page and burns nothing: the token is
 * consumed only by the button's `POST` to `/admin/api/auth/confirm`. A malformed `t` shows the
 * expired state. `no-referrer`, so the token never leaves in a `Referer`.
 */
import type { Metadata } from "next";
import type { ReactElement } from "react";

import { ConfirmSignInSchema } from "@/lib/auth/schema";
import { adminT } from "@/modules/admin";
import {
  AdminSignInCard,
  AdminSignInTitle,
  AdminTopBar,
  Button,
} from "@/modules/ui";

import { adminEnvironment } from "../../environment";

export const metadata: Metadata = { referrer: "no-referrer" };

export default async function AdminConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const parsed = ConfirmSignInSchema.safeParse(await searchParams);
  const env = adminEnvironment();
  return (
    <>
      <AdminTopBar
        brand={adminT("admin.shell.brand")}
        product={adminT("admin.shell.product")}
        environment={env.environment}
        environmentLabel={env.label}
      />
      <AdminSignInCard>
        <AdminSignInTitle>{adminT("admin.signIn.title")}</AdminSignInTitle>
        {parsed.success ? (
          <form method="post" action="/admin/api/auth/confirm">
            <input type="hidden" name="t" value={parsed.data.t} />
            <Button type="submit" size="send" fullWidth>
              {adminT("admin.signIn.confirmSubmit")}
            </Button>
          </form>
        ) : (
          <>
            <p role="status" className="text-ink-2">
              {adminT("admin.signIn.expiredBody")}
            </p>
            <Button href="/admin/sign-in" size="send" fullWidth>
              {adminT("admin.signIn.signInAgain")}
            </Button>
          </>
        )}
      </AdminSignInCard>
    </>
  );
}
