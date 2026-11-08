/**
 * `partners.contract_reminders` (spec 030b §14.5, AC-42; TASK-442): the hourly job that tells the
 * founder about a current agreement or addendum's review date.
 *
 * For every current `agreement` or `dpa_addendum` with a `review_on`, `contractReminderDue` asks,
 * on the calendar day in the florist's country zone, whether the notice window is open (`due`:
 * today on or after `review_on - notice_days`) or the date has passed (`passed`). Each answer is
 * one founder email through spec 016's pipeline (`sendOpsJobNotification`), keyed
 * `job:partners.contract_reminders:{contractId}:{reviewOn}:{due|passed}` in
 * `notification_delivery`: a retry or the next hour finds the row and sends nothing, a superseded
 * version is not current and is not read, and an edited `review_on` makes a new key. Each send is
 * its own transaction, so one failing row (or `notifications.email` off, which holds the send)
 * does not stop the others; the next hour tries again.
 *
 * Logs ids only (§11): `partners.contract_reminder_sent` with the contract id and the state. No
 * legal name, note or address is read into a log line. Nothing reads the environment at import.
 */
import type { DbTransaction } from "@/lib/db";
import { type Logger, logger as defaultLogger } from "@/lib/logger";

import { contractReminderDue } from "./flags";
import { readReviewRows } from "./queries";

export const CONTRACT_REMINDERS_JOB = "partners.contract_reminders" as const;
export const CONTRACT_REMINDER_SENT_LOG = "partners.contract_reminder_sent";

export type ContractReminderTemplate =
  "contract-review-due" | "contract-review-passed";

/** One send: the job key's id (`{contractId}:{reviewOn}:{state}`) and the one template. */
export interface ContractReminderSend {
  readonly jobId: string;
  readonly template: ContractReminderTemplate;
}

export type ContractRemindersTransaction = <T>(
  fn: (db: DbTransaction) => Promise<T>,
) => Promise<T>;

export interface ContractRemindersDeps {
  readonly now?: () => Date;
  /** One transaction as `system`; `withSystemContext` in production. */
  readonly transaction?: ContractRemindersTransaction;
  /** The pipeline call; `sendOpsJobNotification` over `db` in production. */
  readonly send?: (
    db: DbTransaction,
    input: ContractReminderSend,
  ) => Promise<{ readonly sent: number }>;
  readonly log?: Logger;
}

export interface ContractRemindersResult {
  readonly sent: number;
  readonly skipped: number;
  readonly held: number;
}

const defaultTransaction: ContractRemindersTransaction = async (fn) => {
  const { withSystemContext } = await import("@/lib/db");
  return withSystemContext(CONTRACT_REMINDERS_JOB, fn);
};

const defaultSend: NonNullable<ContractRemindersDeps["send"]> = async (
  db,
  input,
) => {
  const { sendOpsJobNotification } = await import("@/modules/notifications");
  return sendOpsJobNotification(
    {
      async execute(query) {
        const rows: unknown = await db.execute(query);
        return rows as never;
      },
    },
    {
      job: CONTRACT_REMINDERS_JOB,
      jobId: input.jobId,
      template: input.template,
    },
  );
};

/** spec 030b §14.5 `partners.contract_reminders`: one run. Counts only. */
export async function runContractReminders(
  deps: ContractRemindersDeps = {},
): Promise<ContractRemindersResult> {
  const now = (deps.now ?? (() => new Date()))();
  const transaction = deps.transaction ?? defaultTransaction;
  const send = deps.send ?? defaultSend;
  const log = deps.log ?? defaultLogger;

  const rows = await transaction((db) => readReviewRows(db));
  let sent = 0;
  let skipped = 0;
  let held = 0;
  for (const row of rows) {
    const state = contractReminderDue(
      { reviewOn: row.review_on, noticeDays: row.notice_days },
      row.zone,
      now,
    );
    if (state === null) continue;
    const input: ContractReminderSend = {
      jobId: `${row.id}:${row.review_on}:${state}`,
      template:
        state === "due" ? "contract-review-due" : "contract-review-passed",
    };
    try {
      const outcome = await transaction((db) => send(db, input));
      if (outcome.sent > 0) {
        sent += 1;
        log.info({ contract_id: row.id, state }, CONTRACT_REMINDER_SENT_LOG);
      } else {
        skipped += 1;
      }
    } catch (error) {
      held += 1;
      log.warn(
        {
          contract_id: row.id,
          state,
          error_class: error instanceof Error ? error.name : "Error",
        },
        "partners.contract_reminder_not_sent",
      );
    }
  }
  return { sent, skipped, held };
}
