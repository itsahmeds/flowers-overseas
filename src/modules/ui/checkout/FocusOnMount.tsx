"use client";

/**
 * `FocusOnMount` — moves focus to the error summary when it appears (spec 010 AC-14: "an error
 * summary that receives focus"; TASK-201).
 *
 * With JavaScript off, the summary's server-rendered `autofocus` takes focus when the document
 * loads. With JavaScript on, a step's server action re-renders the page in place and React does
 * not honour `autofocus` on a `<div>`, so this renderless island focuses it on mount. It is the
 * same few bytes for every summary and counts toward the checkout's 4 096 B (AC-38).
 */
import { useEffect } from "react";

import { focusTarget } from "./validation.ts";

export interface FocusOnMountProps {
  readonly targetId: string;
}

export function FocusOnMount({ targetId }: FocusOnMountProps): null {
  useEffect(() => {
    focusTarget(document, targetId);
  }, [targetId]);
  return null;
}
