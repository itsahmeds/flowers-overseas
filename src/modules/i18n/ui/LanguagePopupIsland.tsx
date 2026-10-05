"use client";

/**
 * The language popup (spec 003 §14 A14 Shape as amended by A16, AC-12, AC-28; spec 004 §14 A23
 * AC-38 L1, L3–L6, AC-39; `docs/design/wireframes/locale-popup-{desktop,mobile}.dc.html`;
 * TASK-119).
 *
 * The site's only language chooser. Everyone who enters through `/` lands on `/en` (one
 * unconditional 308, `src/lib/root-redirect.ts`), and on any localised page with no valid
 * `fo_locale` this island opens a modal native `<dialog>` after hydration: "Choose your preferred
 * language", the launch locales by native name in registry order, each a real `<a>`, English
 * marked as the default and the URL's locale marked as current (A16 Reading 1).
 *
 * ADR-0006 in its positive form:
 *
 *  - **The hint only highlights.** `decideLanguagePopup()` reads `navigator.languages` and nothing
 *    else (founder, 2026-10-05: "browser language only"): no IP, no country header, no request.
 *    The hinted option gets a word and a tint; nothing navigates, nothing is written and the list
 *    is not reordered until the visitor acts.
 *  - **Choosing follows a link.** No `location.assign`, no `preventDefault` on another locale: the
 *    cookie is written in the click handler and the browser follows the `<a href>` itself. Choosing
 *    the page's own locale only closes.
 *  - **Closing remembers.** The close button, `Esc` and a tap outside all end in the dialog's
 *    `close` event, which writes `fo_locale` for the page's locale (§13 Q4: closing is an explicit
 *    act). Either way the popup never opens again.
 *
 * Layout: a centred card from `md` up, a top sheet below it (top edge at y 0, at most 260 CSS px,
 * anything taller scrolling inside it). The dialog is in the top layer, so opening it moves
 * nothing (CLS 0), and nothing locks the document's scroll: the page under the sheet stays
 * scrollable. Every inline property is logical, so `/ar-XB` mirrors it.
 */
import {
  type MouseEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  type PopupCandidate,
  type PopupDecision,
  decideLanguagePopup,
  serialiseLocaleCookie,
} from "../hints.ts";

import type { LanguagePopupCopy } from "./languagePopupTypes.ts";
import { holdLocaleGate, releaseLocaleGate } from "./localeGate.ts";

export interface LanguagePopupIslandProps {
  /** The locale of the URL being viewed, from the path segment and nothing else. */
  locale: string;
  /** That locale's BCP 47 tag: the language of the marks and the heading. */
  pageLang: string;
  /** The x-default locale, which carries the default mark. */
  defaultLocale: string;
  /** The launch locales in registry order, projected and linked by the Server Component parent. */
  candidates: readonly PopupCandidate[];
  /** Every string this island renders, resolved on the server. */
  copy: LanguagePopupCopy;
}

/**
 * The one write in the module. `location.protocol` is the browser's own answer to "am I in
 * development": `http://localhost` gets no `Secure` (the browser would drop the cookie), every
 * deployed origin is https and gets it (§13 Q4). A code outside the launch set (a pseudo-locale
 * preview page) is not storable, so closing there remembers nothing.
 */
function writeLocaleCookie(
  locale: string,
  candidates: readonly PopupCandidate[],
): void {
  if (!candidates.some((candidate) => candidate.code === locale)) return;
  document.cookie = serialiseLocaleCookie(locale, {
    secure: window.location.protocol === "https:",
  });
}

/** True when a click landed on the backdrop: the dialog's own box does not contain the point. */
function outsideBox(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  if (event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return (
    event.clientY < box.top ||
    event.clientY > box.bottom ||
    event.clientX < box.left ||
    event.clientX > box.right
  );
}

/** A click the browser will not follow in this tab: the popup must close itself. */
function opensElsewhere(event: MouseEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function LanguagePopupIsland({
  locale,
  pageLang,
  defaultLocale,
  candidates,
  copy,
}: LanguagePopupIslandProps) {
  // The decision is the **initial** state, read on mount: the loader's import is `ssr: false`, so
  // there is no server pass to disagree with. Fail closed: whatever a browser or an extension does
  // to `navigator.languages` or `document.cookie`, the worst outcome is a page with no popup.
  const [decision, setDecision] = useState<PopupDecision>(() => {
    try {
      return decideLanguagePopup({
        urlLocale: locale,
        languages: window.navigator.languages,
        cookie: document.cookie,
        candidates,
      });
    } catch {
      return { open: false, reason: "error" };
    }
  });
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** Set when an option was chosen, so the `close` that may follow does not overwrite it. */
  const chosen = useRef(false);
  const open = decision.open;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || dialog === null) {
      releaseLocaleGate();
      return undefined;
    }
    holdLocaleGate();
    if (!dialog.open) dialog.showModal();
    return undefined;
  }, [open]);

  // Every way out ends here: the close button and a tap outside call `close()`, and `Esc` is the
  // browser's own `cancel` → `close`.
  const onClose = useCallback(() => {
    if (!chosen.current) writeLocaleCookie(locale, candidates);
    setDecision({ open: false, reason: "cookie" });
  }, [locale, candidates]);

  if (!decision.open) return null;
  const { current, hint } = decision;

  return (
    <dialog
      aria-labelledby={headingId}
      className={DIALOG}
      data-fo-language-popup=""
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (dialog !== null && outsideBox(dialog, event)) dialog.close();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <PopupBody
        candidates={candidates}
        copy={copy}
        current={current}
        defaultLocale={defaultLocale}
        headingId={headingId}
        hint={hint}
        pageLang={pageLang}
        onChoose={(code, event) => {
          if (code === locale) {
            event.preventDefault();
            dialogRef.current?.close();
            return;
          }
          chosen.current = true;
          writeLocaleCookie(code, candidates);
          if (opensElsewhere(event)) dialogRef.current?.close();
        }}
        onDismiss={() => {
          dialogRef.current?.close();
        }}
      />
    </dialog>
  );
}

/*
 * The artboard's `.lp` rules as utilities (`locale-popup-{mobile,desktop}.dc.html`). Mobile first:
 * the top sheet; from `md` the 620 px card the browser centres in the top layer.
 */
const DIALOG = [
  "text-ink bg-card shadow-md m-0 border-0 overflow-y-auto open:grid",
  // Mobile: a top sheet. `bottom-auto` frees the UA's `inset-block: 0`, so the box sits at y 0.
  "fixed top-0 bottom-auto start-0 end-0 w-full max-w-none max-h-[260px] rounded-es-photo rounded-ee-photo gap-[12px] px-[20px] pt-[14px] pb-[10px] backdrop:bg-scrim/50",
  // Desktop: a centred card over the dimmed page.
  "md:bottom-0 md:m-auto md:h-fit md:w-[620px] md:max-w-[calc(100%-2*var(--gutter))] md:max-h-[calc(100dvh-48px)] md:rounded-photo md:gap-[18px] md:px-[32px] md:pt-[30px] md:pb-[26px] md:backdrop:bg-scrim",
].join(" ");
const HEAD = "flex items-start justify-between gap-[16px]";
const HEADING =
  "display m-0 text-[22px] leading-[1.15] md:text-[34px] md:leading-[1.08]";
const CLOSE =
  "bg-card text-ink grid size-[48px] shrink-0 cursor-pointer place-items-center rounded-full border-0 text-[28px] leading-none shadow-[inset_0_0_0_1.5px_var(--color-ink)] md:size-[52px] md:text-[30px]";
const LIST = "m-0 grid list-none grid-cols-2 gap-[8px] p-0 md:gap-[12px]";
const OPTION =
  "text-ink flex min-h-[52px] items-center justify-between gap-[6px] rounded-field px-[12px] py-[6px] no-underline md:min-h-[76px] md:gap-[10px] md:px-[20px] md:py-[12px]";
const OPTION_PLAIN = "bg-paper shadow-[inset_0_0_0_1.5px_var(--color-rule)]";
const OPTION_CURRENT = "bg-paper shadow-[inset_0_0_0_2px_var(--color-ink)]";
const OPTION_HINT =
  "bg-sage-wash shadow-[inset_0_0_0_2px_var(--color-selected)]";
const NAME =
  "font-display font-(--font-weight-display) text-[19px] leading-[1.1] md:text-[27px]";
const MARKS =
  "flex flex-col text-end text-[10px] font-bold uppercase leading-[1.2] tracking-[0.06em] md:text-xs md:tracking-[0.08em]";
const FOOT = "text-ink-2 m-0 text-xs md:text-sm";
const GRIP =
  "bg-rule h-[4px] w-[44px] justify-self-center rounded-full md:hidden";

interface PopupBodyProps {
  candidates: readonly PopupCandidate[];
  copy: LanguagePopupCopy;
  current: string | null;
  hint: string | null;
  defaultLocale: string;
  /** The dialog's `aria-labelledby` target. */
  headingId: string;
  /** The page's BCP 47 tag, for the marks inside each option link. */
  pageLang: string;
  onChoose: (code: string, event: MouseEvent<HTMLAnchorElement>) => void;
  onDismiss: () => void;
}

/**
 * The markup, split out so it renders without a browser (`tests/unit/i18n-language-popup.test.tsx`):
 * no effect, no storage, no `document`. Every string arrives as a prop.
 *
 * Neither mark relies on colour alone (WCAG 1.4.1): "Current", "Default" and the browser match are
 * words, and the tint and the ring only repeat them.
 */
export function PopupBody({
  candidates,
  copy,
  current,
  hint,
  defaultLocale,
  headingId,
  pageLang,
  onChoose,
  onDismiss,
}: PopupBodyProps): ReactElement {
  return (
    <>
      <div className={HEAD}>
        <h2 className={HEADING} id={headingId}>
          {copy.heading}
        </h2>
        <button
          aria-label={copy.close}
          className={CLOSE}
          data-fo-language-popup-close=""
          onClick={onDismiss}
          type="button"
        >
          {/* No letters, so no key: the accessible name is `languagePopup.close` above. */}
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <ul aria-label={copy.listLabel} className={LIST}>
        {candidates.map((candidate) => {
          const isCurrent = candidate.code === current;
          const isDefault = candidate.code === defaultLocale;
          const isHint = candidate.code === hint;
          const tone = isHint
            ? OPTION_HINT
            : isCurrent
              ? OPTION_CURRENT
              : OPTION_PLAIN;
          return (
            <li className="flex" key={candidate.code}>
              <a
                aria-current={isCurrent ? "true" : undefined}
                className={`${OPTION} ${tone} w-full`}
                data-fo-language-option={candidate.code}
                href={candidate.href}
                hrefLang={candidate.bcp47}
                lang={candidate.bcp47}
                onClick={(event) => {
                  onChoose(candidate.code, event);
                }}
              >
                <span className={NAME}>{candidate.nativeName}</span>
                <Marks
                  beta={candidate.beta}
                  copy={copy}
                  isCurrent={isCurrent}
                  isDefault={isDefault}
                  isHint={isHint}
                  lang={pageLang}
                />
              </a>
            </li>
          );
        })}
      </ul>
      <p className={FOOT}>{copy.foot}</p>
      <span aria-hidden="true" className={GRIP} />
    </>
  );
}

interface MarksProps {
  copy: LanguagePopupCopy;
  isCurrent: boolean;
  isDefault: boolean;
  isHint: boolean;
  beta: boolean;
  lang: string;
}

/**
 * The words on an option: "Current · Default" on one line, the browser match on the next, "Beta"
 * last (the artboards' order). They are in the **page's** language, so they carry the page's
 * `lang` back inside an option link that carries the target language's (WCAG 3.1.2).
 */
function Marks({
  copy,
  isCurrent,
  isDefault,
  isHint,
  beta,
  lang,
}: MarksProps): ReactElement | null {
  if (!isCurrent && !isDefault && !isHint && !beta) return null;
  return (
    <small
      className={`${MARKS} ${isHint ? "text-sky-strong" : isCurrent ? "text-ink" : "text-ink-3"}`}
      lang={lang}
    >
      {isCurrent || isDefault ? (
        <span>
          {isCurrent ? (
            <span data-fo-mark="current">{copy.current}</span>
          ) : null}
          {isCurrent && isDefault ? <span aria-hidden="true"> · </span> : null}
          {isDefault ? (
            <span data-fo-mark="default">{copy.default}</span>
          ) : null}
        </span>
      ) : null}
      {isHint ? (
        <span data-fo-mark="hint">
          <span className="md:hidden">{copy.browserMatchShort}</span>
          <span className="hidden md:inline">{copy.browserMatch}</span>
        </span>
      ) : null}
      {beta ? <span data-fo-mark="beta">{copy.beta}</span> : null}
    </small>
  );
}

export default LanguagePopupIsland;
