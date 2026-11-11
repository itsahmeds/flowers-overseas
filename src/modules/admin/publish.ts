/**
 * The admin publish page's reads and the admin home's two counters (spec 012b §2.3, §5.3, AC-6;
 * TASK-295). Read-only: the Publish command itself is `requestPublishFromAdmin()` in
 * `src/lib/publish-runtime.ts`, called by the page's thin action.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { productTranslation } from "../../../db/schema/catalog";
import { mediaAsset } from "../../../db/schema/media";
import { reviewerLocale } from "../../../db/schema/review";
import { appEnvironment, commitSha } from "@/lib/env.schema";
import { runningManifest } from "@/lib/existence";
import {
  PUBLISH_DAILY_LIMIT,
  type PublishRun,
  selectPublishTarget,
  trackedRef,
} from "@/lib/publish";
import { dbPublishStore } from "@/lib/publish-store";
import type { DbActor } from "@/lib/db";
import { existenceDiff } from "@/modules/catalog";

import { can, type AdminRole } from "./permissions";
import { type AdminRunner, adminRunner } from "./users";

/** Why Publish is absent, when it is. */
export type PublishAbsence =
  "noTarget" | "noManifest" | "runOpen" | "dailyLimit" | "nothing";

/** Everything `/admin/publish` shows. */
export interface PublishPageView {
  readonly environment: string;
  readonly ref: string | null;
  readonly commit: string | undefined;
  readonly existenceHash: string | null;
  readonly dataAsOf: string | null;
  readonly diff: {
    readonly byLocale: readonly {
      readonly locale: string;
      readonly added: readonly string[];
      readonly removed: readonly string[];
    }[];
    readonly addedCount: number;
    readonly removedCount: number;
  };
  readonly openRun: PublishRun | null;
  readonly lastRun: PublishRun | null;
  readonly history: readonly PublishRun[];
  readonly today: number;
  readonly dailyLimit: number;
  /** `undefined` when Publish is offered. */
  readonly absence: PublishAbsence | undefined;
}

/** The audit actions of the publish reads. */
export const PUBLISH_ACTIONS = Object.freeze({
  view: "publish.view",
  home: "publish.home",
} as const);

/** The page's reads, in one admin transaction. */
export async function publishPageView(
  actor: DbActor,
  run: AdminRunner = adminRunner,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<PublishPageView> {
  const environment = appEnvironment(env);
  const manifest = runningManifest();
  const diff = await existenceDiff({ urls: manifest?.urls ?? [] });
  const { history, today, openRun } = await run(
    { ...actor, action: PUBLISH_ACTIONS.view },
    async (db) => {
      const store = dbPublishStore(db);
      const known = (["production", "staging", "preview"] as const).find(
        (candidate) => candidate === environment,
      );
      if (known === undefined) {
        return { history: [], today: 0, openRun: null };
      }
      return {
        history: await store.history(known, 20),
        today: await store.runsOnDay(known, new Date()),
        openRun: await store.openRun(known),
      };
    },
  );
  const target = selectPublishTarget(env, environment);
  const changes = diff.added.length + diff.removed.length;
  const absence: PublishAbsence | undefined =
    target.kind === "none" || trackedRef(environment) === null
      ? "noTarget"
      : manifest === null
        ? "noManifest"
        : openRun !== null
          ? "runOpen"
          : today >= PUBLISH_DAILY_LIMIT
            ? "dailyLimit"
            : changes === 0
              ? "nothing"
              : undefined;
  return {
    environment,
    ref: trackedRef(environment),
    commit: commitSha(env),
    existenceHash: manifest?.existenceHash ?? null,
    dataAsOf: manifest?.dataAsOf ?? null,
    diff: {
      byLocale: diff.byLocale,
      addedCount: diff.added.length,
      removedCount: diff.removed.length,
    },
    openRun,
    lastRun: history[0] ?? null,
    history,
    today,
    dailyLimit: PUBLISH_DAILY_LIMIT,
    absence,
  };
}

/** The admin home's two counters (§5.3): changes waiting to publish; items awaiting review. */
export interface PublishHomeCounts {
  readonly waitingToPublish: number;
  /** Per granted locale: product copy not reviewed in it. */
  readonly awaitingReview: readonly {
    readonly locale: string;
    readonly count: number;
  }[];
  /** Photos awaiting review, for a user with `media.review`; `undefined` otherwise. */
  readonly photosAwaitingReview: number | undefined;
}

export async function publishHomeCounts(
  actor: DbActor & {
    readonly userId: string;
    readonly roles: readonly AdminRole[];
  },
  run: AdminRunner = adminRunner,
): Promise<PublishHomeCounts> {
  const manifest = runningManifest();
  const diff =
    manifest === null
      ? undefined
      : await existenceDiff({ urls: manifest.urls });
  return run({ ...actor, action: PUBLISH_ACTIONS.home }, async (db) => {
    const granted = await db
      .select({ locale: reviewerLocale.localeCode })
      .from(reviewerLocale)
      .where(eq(reviewerLocale.userId, actor.userId));
    const locales = granted.map((row) => row.locale).sort();
    const counts =
      locales.length === 0
        ? []
        : await db
            .select({
              locale: productTranslation.localeCode,
              count: sql<number>`count(*)::int`,
            })
            .from(productTranslation)
            .where(
              and(
                inArray(productTranslation.localeCode, locales),
                eq(productTranslation.reviewed, false),
              ),
            )
            .groupBy(productTranslation.localeCode);
    const photos = can(actor.roles, "media.review")
      ? ((
          await db
            .select({ count: sql<number>`count(*)::int` })
            .from(mediaAsset)
            .where(eq(mediaAsset.reviewState, "pending"))
        )[0]?.count ?? 0)
      : undefined;
    return {
      waitingToPublish:
        diff === undefined ? 0 : diff.added.length + diff.removed.length,
      awaitingReview: locales.map((locale) => ({
        locale,
        count: counts.find((row) => row.locale === locale)?.count ?? 0,
      })),
      photosAwaitingReview: photos,
    };
  });
}
