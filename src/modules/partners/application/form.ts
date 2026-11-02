/**
 * One post of the application form, from `FormData` to the next screen (spec 011 §2 "Abuse
 * controls", §5.2 "Server action", §5.3 "Apply"; AC-11, AC-12, AC-13, AC-15; TASK-213).
 *
 * The server action under `src/app/` is thin: it binds the locale, calls `applicationPost` with
 * the application's seams, and either redirects to the sent page (`{ kind: "sent" }`) or returns
 * the state the form re-renders with. Everything that decides is here, testable without Next.
 *
 * The per-instance limit (`createRateLimiter`, `src/lib/csp-report.ts`) counts every post before
 * anything is read, honeypot posts included, because a flood is what it is for; per instance is
 * global on Railway's single replica (ADR-0018). Past it the form comes back in the "too many at
 * once" state with every answer kept and the phone and WhatsApp offered (the artboard's state; a
 * server action has no status code of its own, so the 429 of AC-13 is this state). The 64 KB body
 * bound is enforced before the action runs, by the proxy (`src/lib/application-gate.ts`), because
 * Next's action runtime has parsed the body by the time this code sees it. Nothing here reads an IP address or a user
 * agent (spec 004 §8's rule for every form).
 */
import type { RateLimiter } from "@/lib/csp-report";

import { formEntries, keptAnswers } from "./schema.ts";
import type { ApplyFormState } from "./state.ts";
import { type SubmitDeps, submitFloristApplication } from "./submit.ts";

/** Posts accepted per window, per running instance. Applications are a few a day. */
export const APPLICATION_RATE_LIMIT = 10;
export const APPLICATION_WINDOW_MS = 60_000;

/** The largest body the apply page's `POST` is read for (§2: 64 KB). */
export const APPLICATION_MAX_BYTES = 64 * 1024;

export type ApplicationPostOutcome =
  | { readonly kind: "sent" }
  | { readonly kind: "render"; readonly state: ApplyFormState };

export interface ApplicationPostDeps extends SubmitDeps {
  readonly limiter: RateLimiter;
}

export async function applicationPost(
  form: FormData,
  previous: ApplyFormState,
  deps: ApplicationPostDeps,
): Promise<ApplicationPostOutcome> {
  const attempt = previous.attempt + 1;
  const read = formEntries(form);
  const values = read.ok ? keptAnswers(read.entries) : {};

  if (!deps.limiter.allow()) {
    deps.logger.warn(
      { florist_application_rate_limited: 1 },
      "florist application",
    );
    return {
      kind: "render",
      state: { status: "tooMany", attempt, values, errors: {} },
    };
  }

  if (!read.ok) {
    deps.logger.info({ florist_application_invalid: 1 }, "florist application");
    return {
      kind: "render",
      state: { status: "invalid", attempt, values, errors: {} },
    };
  }

  const result = await submitFloristApplication(read.entries, deps);
  if (result.ok) return { kind: "sent" };
  return {
    kind: "render",
    state: {
      status: result.kind,
      attempt,
      values,
      errors: result.fieldErrors,
    },
  };
}
