/**
 * The push channel: the `PushChannel` interface, its Pushover adapter and a capturing double
 * (spec 025 §5.2, §5.6; AC-5, AC-12, AC-14; TASK-488).
 *
 * The adapter is the only place that names Pushover's API (https://pushover.net/api). It sends one
 * request per call, with `fetch` (no SDK) and a 10 s timeout; retries are the dispatcher's
 * (`CHANNEL_RETRIES`), because whether to retry depends on the status: a 4xx is never retried
 * (Pushover blocks an IP that repeats 4xx), a 5xx or no answer is. The token and user key travel
 * only in the request body (and the receipt query Pushover's API defines); no error carries them,
 * a URL or a response body: an error is a class name and an HTTP status.
 */
import { z } from "zod";

import {
  EMERGENCY_EXPIRE_SECONDS,
  PUSHOVER_LIMITS,
  PUSHOVER_TIMEOUT_MS,
} from "@/config/alerts";

/** One push (§5.5 "Message content"), validated against Pushover's limits. */
export const PushMessageSchema = z
  .object({
    title: z.string().min(1).max(PUSHOVER_LIMITS.titleMax),
    message: z.string().min(1).max(PUSHOVER_LIMITS.messageMax),
    url: z
      .url({ protocol: /^https?$/u })
      .max(PUSHOVER_LIMITS.urlMax)
      .optional(),
    priority: z.number().int().min(-1).max(2),
    retry: z.number().int().min(PUSHOVER_LIMITS.retryMinSeconds).optional(),
    expire: z.number().int().max(PUSHOVER_LIMITS.expireMaxSeconds).optional(),
    /** Comma-separated tags; the alert id, so an admin acknowledgement can cancel by tag. */
    tags: z.string().max(200).optional(),
    /** `backup` sends to `PUSHOVER_BACKUP_USER_KEY` (§5.5 "Escalation"). */
    recipient: z.enum(["primary", "backup"]).default("primary"),
  })
  .strict()
  .refine(
    (message) =>
      message.priority !== 2 ||
      (message.retry !== undefined && message.expire !== undefined),
    { message: "an emergency push needs retry and expire" },
  );
export type PushMessage = z.input<typeof PushMessageSchema>;

export const PushoverSendResponseSchema = z.object({
  status: z.literal(1),
  request: z.string().min(1).max(100),
  receipt: z.string().min(1).max(100).optional(),
});

export const PushoverReceiptSchema = z.object({
  status: z.literal(1),
  acknowledged: z.union([z.literal(0), z.literal(1)]),
  acknowledged_at: z.number().int(),
  expired: z.union([z.literal(0), z.literal(1)]),
});

export type PushResult =
  | {
      readonly ok: true;
      /** The receipt for an emergency push, else the request id. */
      readonly ref: string;
      readonly receipt: string | undefined;
      /** `X-Limit-App-Remaining`, when Pushover sent it. */
      readonly remaining: number | undefined;
    }
  | {
      readonly ok: false;
      /** `HttpError:400`, `Timeout`, `NetworkError`, `SchemaError:200`. */
      readonly errorClass: string;
      readonly httpStatus: number | undefined;
      /** A 5xx or no answer: worth another try. */
      readonly retryable: boolean;
    };

export type ReceiptStatus =
  | {
      readonly ok: true;
      readonly acknowledgedAt: Date | null;
      readonly expired: boolean;
    }
  | { readonly ok: false; readonly errorClass: string };

export interface PushChannel {
  send(message: PushMessage): Promise<PushResult>;
  receipt(ref: string): Promise<ReceiptStatus>;
  cancelByTag(tag: string): Promise<boolean>;
}

export const PUSHOVER_API = "https://api.pushover.net/1";

export interface PushoverCredentials {
  readonly appToken: string;
  readonly userKey: string;
  readonly backupUserKey: string | undefined;
}

function failure(
  errorClass: string,
  httpStatus: number | undefined,
): PushResult & { ok: false } {
  return {
    ok: false,
    errorClass,
    httpStatus,
    retryable: httpStatus === undefined || httpStatus >= 500,
  };
}

/** Pushover over `fetch`; `fetchImpl` is injectable so the contract test records the request. */
export function pushoverChannel(
  credentials: PushoverCredentials,
  fetchImpl: typeof fetch = fetch,
): PushChannel {
  // A JSON body (Pushover's API takes JSON as well as form fields), so the token, the user key and
  // the alert text are plainly a request body and never look like URL query keys (TASK-521).
  const post = async (path: string, body: Readonly<Record<string, string>>) =>
    fetchImpl(`${PUSHOVER_API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PUSHOVER_TIMEOUT_MS),
    });

  return {
    async send(input) {
      const message = PushMessageSchema.parse(input);
      const user =
        message.recipient === "backup"
          ? credentials.backupUserKey
          : credentials.userKey;
      if (user === undefined) return failure("NotConfigured", 400);
      const body: Record<string, string> = {
        token: credentials.appToken,
        user,
        title: message.title,
        message: message.message,
        priority: String(message.priority),
      };
      if (message.url !== undefined) body["url"] = message.url;
      if (message.priority === 2) {
        body["retry"] = String(message.retry);
        body["expire"] = String(message.expire ?? EMERGENCY_EXPIRE_SECONDS);
      }
      if (message.tags !== undefined) body["tags"] = message.tags;
      let response: Response;
      try {
        response = await post("/messages.json", body);
      } catch (error) {
        return failure(
          error instanceof Error && error.name === "TimeoutError"
            ? "Timeout"
            : "NetworkError",
          undefined,
        );
      }
      if (!response.ok) {
        return failure(`HttpError:${String(response.status)}`, response.status);
      }
      let parsed: z.infer<typeof PushoverSendResponseSchema>;
      try {
        parsed = PushoverSendResponseSchema.parse(await response.json());
      } catch {
        return failure(
          `SchemaError:${String(response.status)}`,
          response.status,
        );
      }
      const remainingHeader = response.headers.get("x-limit-app-remaining");
      const remaining =
        remainingHeader !== null && /^\d+$/u.test(remainingHeader)
          ? Number(remainingHeader)
          : undefined;
      return {
        ok: true,
        ref: parsed.receipt ?? parsed.request,
        receipt: parsed.receipt,
        remaining,
      };
    },
    async receipt(ref) {
      if (!/^[A-Za-z0-9]{1,100}$/u.test(ref)) {
        return { ok: false, errorClass: "InvalidReceipt" };
      }
      try {
        const response = await fetchImpl(
          `${PUSHOVER_API}/receipts/${ref}.json?${new URLSearchParams({ token: credentials.appToken }).toString()}`,
          { signal: AbortSignal.timeout(PUSHOVER_TIMEOUT_MS) },
        );
        if (!response.ok) {
          return {
            ok: false,
            errorClass: `HttpError:${String(response.status)}`,
          };
        }
        const parsed = PushoverReceiptSchema.parse(await response.json());
        return {
          ok: true,
          acknowledgedAt:
            parsed.acknowledged === 1
              ? new Date(parsed.acknowledged_at * 1000)
              : null,
          expired: parsed.expired === 1,
        };
      } catch {
        return { ok: false, errorClass: "NetworkError" };
      }
    },
    async cancelByTag(tag) {
      if (!/^[A-Za-z0-9-]{1,100}$/u.test(tag)) return false;
      try {
        const response = await post(`/receipts/cancel_by_tag/${tag}.json`, {
          token: credentials.appToken,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

export interface CapturedPush {
  readonly message: z.output<typeof PushMessageSchema>;
  readonly ref: string;
}

export interface CapturingPushChannel extends PushChannel {
  readonly sent: CapturedPush[];
  readonly cancelled: string[];
  /** The next `send` results to return instead of success (a failure script for the suites). */
  readonly script: PushResult[];
  /** Receipts reported acknowledged, by ref. */
  readonly acknowledged: Map<string, Date>;
}

/** A channel that keeps every push in memory (tests, and the admin test before keys exist). */
export function capturingPushChannel(): CapturingPushChannel {
  const sent: CapturedPush[] = [];
  const cancelled: string[] = [];
  const script: PushResult[] = [];
  const acknowledged = new Map<string, Date>();
  let next = 0;
  return {
    sent,
    cancelled,
    script,
    acknowledged,
    async send(input) {
      const message = PushMessageSchema.parse(input);
      const scripted = script.shift();
      if (scripted !== undefined && !scripted.ok) return scripted;
      next += 1;
      const ref = `r${String(next).padStart(8, "0")}`;
      sent.push({ message, ref });
      return Promise.resolve({
        ok: true,
        ref,
        receipt: message.priority === 2 ? ref : undefined,
        remaining: scripted?.ok === true ? scripted.remaining : undefined,
      });
    },
    async receipt(ref) {
      const at = acknowledged.get(ref);
      return Promise.resolve({
        ok: true,
        acknowledgedAt: at ?? null,
        expired: false,
      });
    },
    async cancelByTag(tag) {
      cancelled.push(tag);
      return Promise.resolve(true);
    },
  };
}
