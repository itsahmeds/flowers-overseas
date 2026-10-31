/**
 * The delivery photo's field (spec 011 §2 "The delivery photo", §8 accessibility; `.fm-file`;
 * TASK-210 draws it, TASK-215 posts it).
 *
 * One labelled `<input type="file" accept="image/*" capture="environment">`: on a phone it opens
 * the camera, and the visible label is the whole drop area, so the target is far above 44 px. The
 * input is visually hidden, never `display: none`, so it keeps its place in the tab order and its
 * label. `name` is `photo`, the field TASK-215's route handler reads.
 */
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { CameraIcon } from "./parts.tsx";

export interface PhotoFieldProps {
  /** The input's id, unique on the page. */
  readonly id: string;
  /** A message under the label: the wrong-type or too-large error (TASK-215). */
  readonly error?: string;
}

export function PhotoField({ id, error }: PhotoFieldProps): ReactElement {
  const t = useTranslations("floristInbox");
  const errorId = `${id}-error`;
  return (
    <div className="grid content-start gap-[6px]" data-fo-photo-field>
      <label
        className={`bg-card grid min-h-[220px] cursor-pointer content-center justify-items-center gap-[10px] rounded-(--radius-photo) border-2 border-dashed p-[24px] text-center ${error === undefined ? "border-field-edge" : "border-danger"}`}
        htmlFor={id}
      >
        <CameraIcon />
        <b className="font-display text-h3 max-w-[22ch] leading-[1.25] font-normal">
          {t("photo.choose")}
        </b>
        <input
          className="sr-only"
          id={id}
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          {...(error === undefined
            ? {}
            : { "aria-invalid": true, "aria-describedby": errorId })}
        />
      </label>
      {error === undefined ? null : (
        <p className="text-danger m-0 text-sm font-bold" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
