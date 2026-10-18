/**
 * @purpose GET /admin/sign-in: form and its states
 * @spec 012
 *
 * The only admin page reachable without a session (AC-1). `?state=` names the state and nothing
 * else; no URL here ever carries an address (AC-9). The form posts to the core's
 * `/admin/api/auth/request`, which answers every address with the same `303` to `?state=sent`.
 */
import type { ReactElement } from "react";
import { z } from "zod";

import { ADMIN_PATHS } from "@/lib/auth/admin";
import { signInStates } from "@/lib/auth/schema";
import { adminT } from "@/modules/admin";
import {
  AdminMailDisc,
  AdminSignInCard,
  AdminSignInTitle,
  AdminTextField,
  AdminTopBar,
} from "@/modules/ui/admin/AdminChrome";
import { Button } from "@/modules/ui";

import { adminEnvironment } from "../environment";

const StateSchema = z.object({
  state: z.enum(signInStates).optional().catch(undefined),
});

function SignInForm(): ReactElement {
  return (
    <form
      method="post"
      action="/admin/api/auth/request"
      className="grid gap-[18px]"
    >
      <AdminTextField
        id="admin-sign-in-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        label={adminT("admin.signIn.email")}
      />
      <Button type="submit" size="send" fullWidth>
        {adminT("admin.signIn.submit")}
      </Button>
    </form>
  );
}

export default async function AdminSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { state } = StateSchema.parse(await searchParams);
  const env = adminEnvironment();
  let body: ReactElement;
  if (state === "sent") {
    body = (
      <>
        <AdminMailDisc />
        <AdminSignInTitle>{adminT("admin.signIn.sentTitle")}</AdminSignInTitle>
        <p className="text-ink-2">{adminT("admin.signIn.sentBody")}</p>
      </>
    );
  } else if (state === "signed-out") {
    body = (
      <>
        <AdminSignInTitle>
          {adminT("admin.signIn.signedOutTitle")}
        </AdminSignInTitle>
        <p className="text-ink-2">{adminT("admin.signIn.signedOutBody")}</p>
        <Button href={ADMIN_PATHS.signIn} size="send" fullWidth>
          {adminT("admin.signIn.signInAgain")}
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <AdminSignInTitle>{adminT("admin.signIn.title")}</AdminSignInTitle>
        {state === "expired" ? (
          <p role="status" className="text-ink-2">
            {adminT("admin.signIn.expiredBody")}
          </p>
        ) : null}
        <SignInForm />
        <p className="text-ink-3 text-sm">{adminT("admin.signIn.note")}</p>
      </>
    );
  }
  return (
    <>
      <AdminTopBar
        brand={adminT("admin.shell.brand")}
        product={adminT("admin.shell.product")}
        environment={env.environment}
        environmentLabel={env.label}
      />
      <AdminSignInCard>{body}</AdminSignInCard>
    </>
  );
}
