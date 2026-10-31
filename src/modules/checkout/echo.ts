/**
 * The checkout's refused-post echo: what a step screen is drawn again with after a post the
 * server refused (spec 010 §5.3 "Everything works with JavaScript disabled", AC-7, AC-14, AC-27,
 * AC-33; TASK-204).
 *
 * A refused post (field errors, "Use sample details", the daily cap) answers like a saved one:
 * a 303 back to the same screen (post, redirect, get). What the screen needs to draw the refusal
 * travels in the `fo_checkout_echo` cookie for that one hop: the step and line it belongs to, the
 * posted values, each field's message keys and a counter that moves focus to the error summary
 * again on each attempt. The page reads it and draws it only on the screen it names; the next post
 * of any checkout form deletes it, and it lives five minutes at most.
 *
 * Why a cookie and not the action's return value: a React element as `useActionState`'s state
 * cannot be encoded into a JavaScript-off form (React answers "Failed to serialize an action for
 * progressive enhancement" and the form stops posting), and the client islands inside the body
 * cannot be server-rendered from it. A cookie survives both paths with one mechanism.
 *
 * The values are what the buyer just typed, on the buyer's own device: `HttpOnly; Secure;
 * SameSite=Lax`, scoped to `/{locale}/checkout`, never logged, never in a URL (spec 010 §8). An
 * echo that would not fit a cookie keeps its messages and drops the values, so the screen falls
 * back to what the basket holds.
 */
import { z } from "zod";

import { CHECKOUT_STEPS, type CheckoutStep } from "@/config/checkout";
import { isLocaleCode } from "@/config/locales";

/** The cookie's name, as the cookie register lists it. */
export const CHECKOUT_ECHO_COOKIE_NAME = "fo_checkout_echo";

/** Five minutes: one hop, with room for a slow connection. */
export const CHECKOUT_ECHO_MAX_AGE_SECONDS = 300;

/** Below the 4 096-byte cookie limit with the name and attributes beside it. */
export const CHECKOUT_ECHO_MAX_BYTES = 3_600;

const MAX_VALUE_LENGTH = 1_000;
const MAX_FIELDS = 40;

const IssueSchema = z
  .object({
    key: z.string().regex(/^[A-Za-z0-9_.]{1,120}$/u),
    params: z
      .record(z.string().max(40), z.union([z.string().max(200), z.number()]))
      .optional(),
  })
  .strict();

const ValueSchema = z.union([
  z.string().max(MAX_VALUE_LENGTH),
  z.array(z.string().max(120)).max(MAX_FIELDS),
]);

export const CheckoutEchoSchema = z
  .object({
    step: z.enum(CHECKOUT_STEPS),
    line: z.number().int().min(1).max(99),
    values: z
      .record(z.string().max(60), ValueSchema)
      .refine((record) => Object.keys(record).length <= MAX_FIELDS),
    errors: z
      .record(z.string().max(60), z.array(IssueSchema).max(10))
      .refine((record) => Object.keys(record).length <= MAX_FIELDS),
    attempt: z.number().int().nonnegative(),
    refused: z.enum(["cap", "unable"]).optional(),
  })
  .strict();

/** What a refused post is drawn again with, and the screen it belongs to. */
export interface CheckoutEchoState {
  readonly step: CheckoutStep;
  readonly line: number;
  readonly values: Readonly<Record<string, string | readonly string[]>>;
  readonly errors: Readonly<
    Record<
      string,
      readonly {
        readonly key: string;
        readonly params?: Readonly<Record<string, string | number>> | undefined;
      }[]
    >
  >;
  readonly attempt: number;
  readonly refused?: "cap" | "unable" | undefined;
}

/** What `encodeCheckoutEcho` takes: a step state's messages carry params of any type. */
export interface CheckoutEchoInput {
  readonly step: CheckoutStep;
  readonly line: number;
  readonly values: Readonly<Record<string, string | readonly string[]>>;
  readonly errors: Readonly<
    Record<
      string,
      readonly {
        readonly key: string;
        readonly params?: Readonly<Record<string, unknown>> | undefined;
      }[]
    >
  >;
  readonly attempt: number;
  readonly refused?: "cap" | "unable" | undefined;
}

/** Only the params a message can format: strings and numbers. */
function plainParams(
  params: Readonly<Record<string, unknown>> | undefined,
): Record<string, string | number> | undefined {
  if (params === undefined) return undefined;
  const plain: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string" || typeof value === "number") {
      plain[name] = value;
    }
  }
  return plain;
}

/**
 * The cookie value for an echo: base64url JSON, or the same echo without its values when it would
 * not fit, or `null` when even that does not fit or does not validate.
 */
export function encodeCheckoutEcho(echo: CheckoutEchoInput): string | null {
  const errors: Record<
    string,
    { key: string; params?: Record<string, string | number> }[]
  > = {};
  for (const [field, issues] of Object.entries(echo.errors)) {
    errors[field] = issues.map((issue) => {
      const params = plainParams(issue.params);
      return params === undefined
        ? { key: issue.key }
        : { key: issue.key, params };
    });
  }
  const values: Record<string, string | string[]> = {};
  for (const [field, value] of Object.entries(echo.values)) {
    values[field] = typeof value === "string" ? value : [...value];
  }
  const full = {
    step: echo.step,
    line: echo.line,
    values,
    errors,
    attempt: echo.attempt,
    ...(echo.refused === undefined ? {} : { refused: echo.refused }),
  };
  for (const candidate of [full, { ...full, values: {} }]) {
    const parsed = CheckoutEchoSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const encoded = Buffer.from(JSON.stringify(parsed.data), "utf8").toString(
      "base64url",
    );
    if (encoded.length <= CHECKOUT_ECHO_MAX_BYTES) return encoded;
  }
  return null;
}

/** The echo a cookie value carries, or `null` for anything else. */
export function decodeCheckoutEcho(
  value: string | null | undefined,
): CheckoutEchoState | null {
  if (
    value === null ||
    value === undefined ||
    value.length > CHECKOUT_ECHO_MAX_BYTES ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const parsed = CheckoutEchoSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The cookie's attributes for a locale's checkout (`cookies().set()` / `.delete()`). */
export function checkoutEchoCookieAttributes(locale: string): {
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: "lax";
  readonly path: string;
  readonly maxAge: number;
} {
  if (!isLocaleCode(locale)) {
    throw new Error("refusing an echo cookie for an unknown locale");
  }
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: `/${locale}/checkout`,
    maxAge: CHECKOUT_ECHO_MAX_AGE_SECONDS,
  };
}
