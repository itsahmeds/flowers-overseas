"use client";

/**
 * The photo upload's one client island (spec 012b §5.3 "client islands only for the upload
 * progress"; T-38 "the upload progress announces through a polite live region"; TASK-299).
 *
 * The form is server-rendered and works without JavaScript: it posts `multipart/form-data` to
 * `POST /admin/api/media`, which answers a plain post with a `303`. With JavaScript this island:
 *
 *  - shows only the provenance fields of the chosen source (`data-source-group`), the others
 *    `hidden` and `disabled`, so a hidden field is never posted;
 *  - sends the same form with `XMLHttpRequest` (the one browser API that reports upload
 *    progress) and `Accept: application/json`, and announces the progress in a polite live
 *    region, at most once per ten per cent;
 *  - on the answer, goes to the photo's page, or back to the upload with the refusal's reason.
 *
 * Words arrive as props.
 */
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const STEP = 0.1;

export function MediaUploadForm({
  action,
  progressLabels,
  failedHref,
  children,
}: {
  readonly action: string;
  /** "Uploading: 0 %" to "Uploading: 100 %", one per ten per cent, formatted on the server. */
  readonly progressLabels: readonly string[];
  /** Where a network failure goes (the upload with its refusal). */
  readonly failedHref: string;
  readonly children: ReactNode;
}): ReactElement {
  const form = useRef<HTMLFormElement>(null);
  const [announced, setAnnounced] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(0);

  useEffect(() => {
    const element = form.current;
    if (element === null) return undefined;
    const sync = (): void => {
      const chosen = new FormData(element).get("source");
      for (const group of element.querySelectorAll<HTMLFieldSetElement>(
        "[data-source-group]",
      )) {
        const on = group.dataset["sourceGroup"] === chosen;
        group.hidden = !on;
        group.disabled = !on;
      }
    };
    sync();
    element.addEventListener("change", sync);
    return () => {
      element.removeEventListener("change", sync);
    };
  }, []);

  const router = useRouter();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const request = new XMLHttpRequest();
    let last = -1;
    setBusy(true);
    request.upload.addEventListener("progress", (progress) => {
      if (!progress.lengthComputable) return;
      const loaded = progress.loaded / progress.total;
      setShare(loaded);
      const bucket = Math.floor(loaded / STEP);
      if (bucket === last) return;
      last = bucket;
      setAnnounced(
        progressLabels[Math.min(bucket, progressLabels.length - 1)] ?? "",
      );
    });
    request.addEventListener("load", () => {
      let target = failedHref;
      try {
        const body = JSON.parse(request.responseText) as {
          ok?: boolean;
          assetId?: string;
          reason?: string;
        };
        if (body.ok === true && typeof body.assetId === "string") {
          target = `/admin/media/${encodeURIComponent(body.assetId)}?result=uploaded`;
        } else if (typeof body.reason === "string") {
          target = `/admin/media?upload=1&result=refused&reason=${encodeURIComponent(body.reason)}`;
        }
      } catch {
        // Not JSON (a proxy's error page): the failure route below.
      }
      router.push(target);
    });
    request.addEventListener("error", () => {
      router.push(failedHref);
    });
    request.open("POST", action);
    request.setRequestHeader("Accept", "application/json");
    request.send(new FormData(element));
  };

  return (
    <form
      ref={form}
      action={action}
      method="post"
      encType="multipart/form-data"
      onSubmit={submit}
      aria-busy={busy}
      className="grid gap-[16px]"
    >
      {children}
      {busy ? (
        <progress
          max={1}
          value={share}
          aria-hidden="true"
          className="accent-sky h-[8px] w-full"
        />
      ) : null}
      <p role="status" aria-live="polite" className="text-ink-2 text-[14px]">
        {announced}
      </p>
    </form>
  );
}
