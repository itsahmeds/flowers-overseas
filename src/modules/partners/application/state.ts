/**
 * The application form's state between posts (spec 011 §2, §5.2, §5.3 "Apply"; AC-12, AC-13,
 * AC-15; TASK-213): what `useActionState` holds and what a JavaScript-off post re-renders with.
 *
 * Plain data only (no React element), so React can encode it into the JavaScript-off form state.
 * `values` are the answers the applicant just typed, on their own device: never logged, never in a
 * URL, never in a cookie. `errors` are message keys (`forFlorists.apply.error.*`), never text.
 * `attempt` counts refused posts, so a second refusal with the same errors still moves focus.
 *
 * No import: the client island reads this file, and nothing else of the application module may
 * reach the browser.
 */

/** `idle` (nothing posted yet), or why the form is back. */
export type ApplyFormStatus = "idle" | "invalid" | "failed" | "tooMany";

export interface ApplyFormState {
  readonly status: ApplyFormStatus;
  readonly attempt: number;
  /** Field name → the answer as posted (only the form's own fields). */
  readonly values: Readonly<Record<string, string>>;
  /** Field name → `forFlorists.apply.error.*` key. */
  readonly errors: Readonly<Record<string, string>>;
}

export const INITIAL_APPLY_STATE: ApplyFormState = Object.freeze({
  status: "idle",
  attempt: 0,
  values: Object.freeze({}),
  errors: Object.freeze({}),
});
