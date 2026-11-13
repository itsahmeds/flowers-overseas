/**
 * The catalogue's backup warning (spec 012b §8 "Backups", AC-29; TASK-301).
 *
 * Once the database is the only copy of the catalogue, prices, photos and countries, admin warns
 * on every `/admin/catalogue`, `/admin/media`, `/admin/countries` and `/admin/publish` page while
 * the newest successful `db.backup_verify` (spec 002 AC-25) is older than 48 hours, or absent.
 * Production only: staging and previews share no buyer's data and are rebuilt from the seed.
 *
 * The verification record is spec 002's (TASK-028): until that task records each successful
 * restore, no verification exists, `lastBackupVerifiedAt()` answers `null`, and production shows
 * the warning, which is the truth. Spec 025's monitor treats the same absence as
 * `skipped: source_missing` (`src/modules/ops/monitor.ts`). The environment is decided first, so
 * no other environment reads anything.
 */
import { appEnvironment, type DeploymentEnvironment } from "@/lib/env.schema";

/** AC-29: the warning shows while the newest verified backup is older than this. */
export const BACKUP_WARNING_MAX_AGE_HOURS = 48;

const HOUR_MS = 3_600_000;

/** The admin nav sections whose pages carry the warning (AC-29). */
export const BACKUP_WARNING_SECTIONS = [
  "catalogue",
  "media",
  "countries",
  "publish",
] as const;

/**
 * True when the warning shows: in `production`, with no verified backup or with the newest one
 * strictly older than 48 hours at `now`. Pure.
 */
export function backupWarningDue(input: {
  readonly environment: DeploymentEnvironment;
  readonly lastVerifiedAt: Date | null;
  readonly now: Date;
}): boolean {
  if (input.environment !== "production") return false;
  if (input.lastVerifiedAt === null) return true;
  return (
    input.now.getTime() - input.lastVerifiedAt.getTime() >
    BACKUP_WARNING_MAX_AGE_HOURS * HOUR_MS
  );
}

/**
 * When the newest successful `db.backup_verify` finished, or `null` when none is recorded.
 * Spec 002's `db.backup_verify` has no handler and writes no record yet (TASK-028), so there is
 * nothing to read: `null`. TASK-028 replaces this body with the read of its record.
 */
export function lastBackupVerifiedAt(): Promise<Date | null> {
  return Promise.resolve(null);
}

export interface BackupWarningDeps {
  readonly environment: DeploymentEnvironment;
  readonly lastVerifiedAt: () => Promise<Date | null>;
  readonly now: () => Date;
}

/** Whether this request's page shows the warning. Reads the record only in `production`. */
export async function catalogueBackupWarning(
  deps: Partial<BackupWarningDeps> = {},
): Promise<boolean> {
  const environment = deps.environment ?? appEnvironment(process.env);
  if (environment !== "production") return false;
  const read = deps.lastVerifiedAt ?? lastBackupVerifiedAt;
  return backupWarningDue({
    environment,
    lastVerifiedAt: await read(),
    now: (deps.now ?? (() => new Date()))(),
  });
}
