"use client";

/**
 * The lazy client boundary for the consent sheet (spec 004 §5.3, §5.4; TASK-051).
 *
 * The same three-line shape spec 003 used for the suggestion banner, and for the same reasons:
 * `next/dynamic({ ssr: false })` is only valid inside a Client Component, and the island must not
 * be server-rendered — a server pass would have to guess whether the visitor has already decided,
 * which would make the cached HTML differ between visitors and put a `Vary` on a document that
 * must not have one (§5.4).
 *
 * This file is the only consent code in the initial client bundle: a props pass-through with no
 * state, no effect, no message import and no register import. The island and the settings panel
 * arrive as two later chunks.
 */
import dynamic from "next/dynamic";

import type { ConsentBannerIslandProps } from "./ConsentBannerIsland";

const Island = dynamic(async () => import("./ConsentBannerIsland"), {
  ssr: false,
});

export function ConsentBannerLoader(props: ConsentBannerIslandProps) {
  return <Island {...props} />;
}
