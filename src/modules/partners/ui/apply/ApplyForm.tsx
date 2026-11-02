"use client";

/**
 * The application form (spec 011 §2 "The application form", §5.3 "Apply", §8 "Accessibility";
 * AC-10, AC-12, AC-13, AC-15; artboards `for-florists-apply-desktop.dc.html` and `-mobile`,
 * `.fm-*`, the "errors" state and the two small states; TASK-213).
 *
 * The one client island of the apply page, and only because `useActionState` is what carries the
 * server action's answer back into the form, with JavaScript on **and off**: off, the form posts
 * to its own URL, the action runs, and the page re-renders server-side with the returned state.
 * Everything it draws is decided on the server: the copy arrives as strings, the send-failed and
 * too-many notices and the submit button as server-rendered nodes, and the state is plain data
 * (`../../application/state.ts`). It imports nothing else of the application module, so no
 * schema, sink or mailer reaches the browser.
 *
 * States: empty; field errors (the summary takes focus and links to each field, each message sits
 * between its field and its help text and is tied by `aria-describedby`, every answer is kept);
 * send failed and too many at once (the notice above the first field takes focus, every answer is
 * kept, the phone is linked). The honeypot is hidden from sight, assistive technology and the tab
 * order.
 */
import {
  type ReactElement,
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
} from "react";

import {
  type ApplyFormState,
  INITIAL_APPLY_STATE,
} from "../../application/state.ts";

export type ApplyFormAction = (
  previous: ApplyFormState,
  form: FormData,
) => Promise<ApplyFormState>;

export interface FieldCopy {
  readonly label: string;
  readonly help?: string;
}

export interface ChoiceCopy {
  readonly legend: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export interface ApplyFormCopy {
  readonly optional: string;
  readonly errorSummary: string;
  readonly honeypot: string;
  readonly shopName: FieldCopy;
  readonly contactName: FieldCopy;
  readonly email: FieldCopy;
  readonly phone: FieldCopy;
  readonly country: FieldCopy & { readonly choose: string };
  readonly town: FieldCopy;
  readonly capacity: FieldCopy;
  readonly area: FieldCopy;
  readonly weekends: ChoiceCopy;
  readonly registration: FieldCopy;
  readonly website: FieldCopy;
  readonly contactBy: ChoiceCopy;
  readonly language: ChoiceCopy;
  /** Every `forFlorists.apply.error.*` key, resolved. */
  readonly errors: Readonly<Record<string, string>>;
}

export interface ApplyFormProps {
  /** The bound server action; absent where nothing posts (the component gallery, unit tests). */
  readonly action?: ApplyFormAction;
  readonly copy: ApplyFormCopy;
  readonly countries: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  /** The page locale's language, prefilled (§2). */
  readonly defaultLanguage: string;
  readonly failedNotice: ReactNode;
  readonly tooManyNotice: ReactNode;
  readonly submit: ReactNode;
}

/** Each field's control id: the error summary's link target. Radio groups link to the first. */
export const APPLY_FIELD_IDS: Readonly<Record<string, string>> = Object.freeze({
  businessName: "ap-shop",
  contactName: "ap-name",
  email: "ap-email",
  phone: "ap-phone",
  country: "ap-country",
  town: "ap-town",
  capacityPerDay: "ap-capacity",
  deliveryArea: "ap-area",
  weekendDelivery: "ap-weekends",
  registrationNumber: "ap-registration",
  website: "ap-website",
  contactPreference: "ap-contact-by",
  language: "ap-language",
});

const FIELD = "grid min-w-0 content-start gap-[6px]";
const LABEL = "text-ui text-ink font-bold";
const HINT = "text-ink-2 m-0 text-sm leading-(--line-height-tight)";
const INPUT =
  "bg-card text-ui text-ink min-h-[50px] w-full rounded-(--radius-field) border-(length:--rule-field) border-field-edge px-[14px] focus-visible:outline-(--focus-ring) focus-visible:outline-offset-2 aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--color-danger)]";
const ERROR =
  "text-danger m-0 flex items-baseline gap-[8px] text-sm leading-(--line-height-tight) font-bold before:bg-danger before:text-on-danger before:inline-grid before:size-[18px] before:flex-none before:place-items-center before:rounded-full before:text-[12px] before:content-['!']";
const NOTICE =
  "bg-blush text-ui text-ink m-0 grid gap-[6px] rounded-(--radius-field) px-[18px] py-[16px] leading-(--line-height-tight) focus:outline-(--focus-ring) focus:outline-offset-[3px]";

/** `aria-describedby`: the error first (it is the news), then the help text. */
function describedBy(
  ...ids: readonly (string | undefined)[]
): string | undefined {
  const present = ids.filter((id): id is string => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}

/** One labelled control with its error and help text, in the artboard's order. */
function Field({
  id,
  copy,
  error,
  optional,
  wide = false,
  children,
}: {
  readonly id: string;
  readonly copy: FieldCopy;
  readonly error?: string | undefined;
  readonly optional?: string | undefined;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      className={`${FIELD} ${wide ? "md:col-span-2" : ""}`}
      data-fo-apply-field={id}
    >
      <label className={LABEL} htmlFor={id}>
        {copy.label}
        {optional === undefined ? null : (
          <span className="text-ink-3 font-normal"> {optional}</span>
        )}
      </label>
      {children}
      {error === undefined ? null : (
        <p className={ERROR} id={`${id}-error`}>
          {error}
        </p>
      )}
      {copy.help === undefined ? null : (
        <p className={HINT} id={`${id}-help`}>
          {copy.help}
        </p>
      )}
    </div>
  );
}

/** A radio group as the artboard's pills (`.fm-opts`), with its legend and its error. */
function Choice({
  id,
  name,
  copy,
  value,
  error,
}: {
  readonly id: string;
  readonly name: string;
  readonly copy: ChoiceCopy;
  readonly value: string | undefined;
  readonly error?: string | undefined;
}): ReactElement {
  const errorId = error === undefined ? undefined : `${id}-error`;
  return (
    <fieldset
      className="m-0 grid min-w-0 content-start gap-[6px] border-0 p-0 md:col-span-2"
      data-fo-apply-field={name}
      aria-describedby={errorId}
    >
      <legend className={`${LABEL} p-0`}>{copy.legend}</legend>
      <div className="flex flex-wrap gap-[8px]">
        {copy.options.map((option, index) => (
          <label
            className="bg-card text-ui inline-flex min-h-(--target-min) cursor-pointer items-center gap-[10px] rounded-full ps-[14px] pe-[18px] shadow-[inset_0_0_0_1.5px_var(--color-rule)] has-checked:shadow-[inset_0_0_0_2px_var(--color-selected)]"
            key={option.value}
          >
            <input
              className="accent-selected size-[18px]"
              type="radio"
              id={index === 0 ? id : undefined}
              name={name}
              value={option.value}
              required
              defaultChecked={option.value === value}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error === undefined ? null : (
        <p className={ERROR} id={errorId}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Moves focus to `id` when a refused post re-renders the form (JavaScript on). */
function useFocusOn(id: string | undefined, attempt: number): void {
  const last = useRef(0);
  useEffect(() => {
    if (id === undefined || attempt === last.current) return;
    last.current = attempt;
    document.getElementById(id)?.focus();
  }, [id, attempt]);
}

const passThrough: ApplyFormAction = (previous) => Promise.resolve(previous);

export function ApplyForm({
  action,
  copy,
  countries,
  defaultLanguage,
  failedNotice,
  tooManyNotice,
  submit,
}: ApplyFormProps): ReactElement {
  const [state, formAction] = useActionState(
    action ?? passThrough,
    INITIAL_APPLY_STATE,
  );
  const value = (name: string): string => state.values[name] ?? "";
  const error = (name: string): string | undefined => {
    const key = state.errors[name];
    return key === undefined ? undefined : (copy.errors[key] ?? key);
  };
  const invalid = (name: string): true | undefined =>
    state.errors[name] === undefined ? undefined : true;
  const describe = (name: string, help: boolean): string | undefined => {
    const id = APPLY_FIELD_IDS[name] ?? name;
    return describedBy(
      state.errors[name] === undefined ? undefined : `${id}-error`,
      help ? `${id}-help` : undefined,
    );
  };

  const summaryItems = Object.keys(APPLY_FIELD_IDS).flatMap((name) => {
    const text = error(name);
    const id = APPLY_FIELD_IDS[name];
    return text === undefined || id === undefined ? [] : [{ id, text }];
  });
  const notice =
    state.status === "failed"
      ? failedNotice
      : state.status === "tooMany"
        ? tooManyNotice
        : null;
  const focusId =
    notice !== null
      ? "ap-notice"
      : summaryItems.length > 0
        ? "ap-error-summary"
        : undefined;
  useFocusOn(focusId, state.attempt);

  return (
    <form
      className="bg-card grid gap-[20px] rounded-(--radius-photo) px-[18px] pt-[20px] pb-[24px] shadow-[inset_0_0_0_1px_var(--color-rule),var(--shadow-sm)] md:col-span-7 md:gap-[24px] md:px-[34px] md:pt-[32px] md:pb-[34px]"
      {...(action === undefined ? { method: "post" } : { action: formAction })}
      noValidate
      data-fo-apply-form
      data-fo-apply-state={state.status}
    >
      {notice === null ? null : (
        <div
          className={NOTICE}
          id="ap-notice"
          role="alert"
          tabIndex={-1}
          autoFocus
          data-fo-apply-notice-state={state.status}
        >
          {notice}
        </div>
      )}
      {summaryItems.length === 0 ? null : (
        <div
          aria-labelledby="ap-error-summary-title"
          autoFocus={notice === null}
          className="bg-card grid gap-[8px] rounded-(--radius-field) px-[20px] py-[18px] shadow-[inset_0_0_0_2px_var(--color-danger)] focus:outline-offset-[3px] focus:outline-(--focus-ring)"
          id="ap-error-summary"
          role="alert"
          tabIndex={-1}
          data-fo-apply-error-summary
        >
          <h2
            className="font-display text-h3 text-ink m-0 leading-[1.25] font-normal"
            id="ap-error-summary-title"
          >
            {copy.errorSummary}
          </h2>
          <ul className="m-0 grid list-none gap-[4px] p-0">
            {summaryItems.map((item) => (
              <li key={item.id}>
                <a
                  className="text-danger inline-flex min-h-(--target-min) items-center font-bold underline underline-offset-4"
                  href={`#${item.id}`}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 gap-[20px] md:grid-cols-2">
        <Field
          id="ap-shop"
          copy={copy.shopName}
          error={error("businessName")}
          wide
        >
          <input
            className={INPUT}
            id="ap-shop"
            name="businessName"
            autoComplete="organization"
            required
            maxLength={200}
            defaultValue={value("businessName")}
            aria-invalid={invalid("businessName")}
            aria-describedby={describe("businessName", true)}
          />
        </Field>
        <Field
          id="ap-name"
          copy={copy.contactName}
          error={error("contactName")}
        >
          <input
            className={INPUT}
            id="ap-name"
            name="contactName"
            autoComplete="name"
            required
            maxLength={200}
            defaultValue={value("contactName")}
            aria-invalid={invalid("contactName")}
            aria-describedby={describe("contactName", false)}
          />
        </Field>
        <Field id="ap-email" copy={copy.email} error={error("email")}>
          <input
            className={INPUT}
            id="ap-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            defaultValue={value("email")}
            aria-invalid={invalid("email")}
            aria-describedby={describe("email", false)}
          />
        </Field>
        <Field id="ap-phone" copy={copy.phone} error={error("phone")}>
          <input
            className={INPUT}
            id="ap-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={20}
            defaultValue={value("phone")}
            aria-invalid={invalid("phone")}
            aria-describedby={describe("phone", true)}
          />
        </Field>
        <Field id="ap-country" copy={copy.country} error={error("country")}>
          <select
            className={INPUT}
            id="ap-country"
            name="country"
            autoComplete="country"
            required
            defaultValue={value("country")}
            aria-invalid={invalid("country")}
            aria-describedby={describe("country", false)}
          >
            <option value="" disabled>
              {copy.country.choose}
            </option>
            {countries.map((country) => (
              <option key={country.value} value={country.value}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ap-town" copy={copy.town} error={error("town")}>
          <input
            className={INPUT}
            id="ap-town"
            name="town"
            autoComplete="address-level2"
            required
            maxLength={200}
            defaultValue={value("town")}
            aria-invalid={invalid("town")}
            aria-describedby={describe("town", false)}
          />
        </Field>
        <Field
          id="ap-capacity"
          copy={copy.capacity}
          error={error("capacityPerDay")}
        >
          <input
            className={INPUT}
            id="ap-capacity"
            name="capacityPerDay"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            required
            maxLength={3}
            defaultValue={value("capacityPerDay")}
            aria-invalid={invalid("capacityPerDay")}
            aria-describedby={describe("capacityPerDay", true)}
          />
        </Field>
        <Field id="ap-area" copy={copy.area} error={error("deliveryArea")} wide>
          <textarea
            className={`${INPUT} min-h-[96px] py-[12px]`}
            id="ap-area"
            name="deliveryArea"
            required
            maxLength={1000}
            rows={3}
            defaultValue={value("deliveryArea")}
            aria-invalid={invalid("deliveryArea")}
            aria-describedby={describe("deliveryArea", true)}
          />
        </Field>
        <Choice
          id="ap-weekends"
          name="weekendDelivery"
          copy={copy.weekends}
          value={state.values["weekendDelivery"]}
          error={error("weekendDelivery")}
        />
        <Field
          id="ap-registration"
          copy={copy.registration}
          error={error("registrationNumber")}
          optional={copy.optional}
        >
          <input
            className={INPUT}
            id="ap-registration"
            name="registrationNumber"
            autoComplete="off"
            maxLength={100}
            defaultValue={value("registrationNumber")}
            aria-invalid={invalid("registrationNumber")}
            aria-describedby={describe("registrationNumber", true)}
          />
        </Field>
        <Field
          id="ap-website"
          copy={copy.website}
          error={error("website")}
          optional={copy.optional}
        >
          <input
            className={INPUT}
            id="ap-website"
            name="website"
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={300}
            defaultValue={value("website")}
            aria-invalid={invalid("website")}
            aria-describedby={describe("website", false)}
          />
        </Field>
        <Choice
          id="ap-contact-by"
          name="contactPreference"
          copy={copy.contactBy}
          value={state.values["contactPreference"]}
          error={error("contactPreference")}
        />
        <Choice
          id="ap-language"
          name="language"
          copy={copy.language}
          value={state.values["language"] ?? defaultLanguage}
          error={error("language")}
        />
      </div>
      {/* The honeypot (§2 "Abuse controls"): hidden from sight, assistive technology and the tab
          order; a filled value answers as success and writes nothing. */}
      <div className="hidden" aria-hidden="true">
        <label>
          {copy.honeypot}
          <input name="hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {submit}
    </form>
  );
}
