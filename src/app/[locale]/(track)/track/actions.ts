/**
 * The tracking lookup's server action (spec 018 §5.2 `lookupTracking`, §5.3 `track`; AC-8;
 * TASK-339).
 *
 * Thin, as `plan/01` §5 asks of `app/`: the lookup form (`./LookupForm.tsx`, on `/{locale}/track`
 * and on the not-working page) binds the page's locale and posts the reference and the email in
 * the body, so the email never enters an address. Everything that decides is `lookupTracking`
 * (`src/modules/orders/tracking-lookup.ts`), run by `./lookup.ts`.
 *
 * **One answer for every case (AC-8).** The action reads nothing back from the lookup: it hands
 * the work to `after()`, so the database reads, the counter and the send run once the response is
 * on its way, and then redirects, `303`, to `/{locale}/track?sent=1`. A match, a wrong email, an
 * unknown reference, an over-limit request and an input that does not parse therefore get the
 * same bytes in the same time, and the page they land on is the one "If that order exists…" page.
 * The query string says only that a form was sent; it carries nothing typed (`CLAUDE.md`: no PII
 * in URLs). Works with JavaScript off (a native POST of the form); Next's server actions keep their
 * own `Origin` check. Only the action is exported: every export of a `"use server"` file is an
 * endpoint.
 */
"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { isLocaleCode } from "@/config/locales";
import { routableLocale } from "@/modules/i18n";

import { lookupSentPath, runLookup } from "./lookup";

/** The bound locale: a short string; anything else lands on the site root. */
const BoundLocaleSchema = z.string().max(16).catch("");
/** The post itself: form data, or nothing to read. */
const LookupFormSchema = z.instanceof(FormData).nullable().catch(null);

export async function lookupTrackingAction(
  locale: string,
  form: FormData,
): Promise<never> {
  const code = routableLocale(BoundLocaleSchema.parse(locale))?.code;
  if (code === undefined || !isLocaleCode(code)) redirect("/");
  const data = LookupFormSchema.parse(form);
  // The two fields as posted; `lookupTracking` parses them (`TrackingLookupInputSchema`) after
  // the answer, so a field that does not parse gets the same answer as any other.
  const input = {
    reference: data?.get("reference") ?? null,
    email: data?.get("email") ?? null,
  };
  after(() => runLookup(input, code));
  redirect(lookupSentPath(code));
}
