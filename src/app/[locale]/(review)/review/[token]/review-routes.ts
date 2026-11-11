/**
 * The review pages' fixed segments (spec 022a §5.3; TASK-371): where the two actions land. Never
 * a token, because a token is 43 characters of base64url.
 */
export const THANKS = "thanks";
export const STOPPED = "done";

/** The error codes a refused submission comes back with (`?error=`), and nothing else. */
export const FORM_ERRORS = ["rating", "long"] as const;
export type FormError = (typeof FORM_ERRORS)[number];

export function formErrorOf(value: string | undefined): FormError | undefined {
  return FORM_ERRORS.find((error) => error === value);
}
