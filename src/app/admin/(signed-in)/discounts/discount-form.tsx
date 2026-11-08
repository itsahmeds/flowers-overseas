"use client";

/**
 * @purpose The discount code form island: fields, Generate, per-field errors, the live cost preview (047 AC-2, AC-4, AC-6)
 * @spec 047
 *
 * Artboards `admin-discounts-{desktop,mobile}` (spec 047 §5.3; TASK-446): the form card beside the
 * cost preview on the desktop, stacked at 390. Create and edit share it:
 *
 *  - **Generate** proposes 10 characters from the look-alike-free alphabet of
 *    `src/config/discounts.ts`, drawn with `crypto.getRandomValues`;
 *  - **the offer** (kind, percent, the amounts off) is read only once the code has a counted live
 *    use (`frozen`, AC-4); it still posts, so the server compares and keeps it;
 *  - **errors** come back from the server action per field, already worded, and the typed values
 *    stay (the form posts in a transition, so React does not reset it); without JavaScript the
 *    form posts normally;
 *  - **the cost preview** asks `previewDiscountCostAction` again 400 ms after the last change and
 *    renders what it returns; nothing is saved.
 *
 * Imports nothing that reaches the database: every word arrives in `copy`, every figure as text.
 */
import {
  type FormEvent,
  type ReactElement,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  DISCOUNT_GENERATED_ALPHABET,
  DISCOUNT_GENERATED_LENGTH,
} from "@/config/discounts";
import { adminButtonClass } from "@/modules/ui/admin/AdminControls";
import {
  AdminField,
  adminControlClass,
  adminFieldAria,
} from "@/modules/ui/admin/AdminData";

import { previewDiscountCostAction } from "./actions";
import type {
  DiscountChoice,
  DiscountFormCopy,
  DiscountFormState,
  DiscountFormValues,
  DiscountPreviewView,
} from "./form-types";

const PREVIEW_DELAY_MS = 400;

function generated(): string {
  const bytes = new Uint32Array(DISCOUNT_GENERATED_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((value) =>
      DISCOUNT_GENERATED_ALPHABET.charAt(
        value % DISCOUNT_GENERATED_ALPHABET.length,
      ),
    )
    .join("");
}

function ChoiceList({
  name,
  legend,
  hint,
  all,
  chosenText,
  choices,
  initial,
  disabled,
}: {
  readonly name: string;
  readonly legend: string;
  readonly hint: string;
  readonly all: string;
  readonly chosenText: string;
  readonly choices: readonly DiscountChoice[];
  readonly initial: readonly string[];
  readonly disabled: boolean;
}): ReactElement {
  const [count, setCount] = useState(initial.length);
  return (
    <fieldset className="grid min-w-0 content-start gap-[4px]">
      <legend className="text-ink-2 text-[13px] font-bold">{legend}</legend>
      <details className="bg-card rounded-[8px] shadow-[inset_0_0_0_1px_var(--color-field-edge)]">
        <summary className="min-h-[40px] cursor-pointer px-[12px] py-[9px] text-[14px]">
          {count === 0 ? all : chosenText.replace("#", String(count))}
        </summary>
        <div
          className="grid max-h-[240px] gap-[2px] overflow-y-auto px-[12px] pb-[10px]"
          onChange={(event) => {
            const box = event.currentTarget;
            setCount(box.querySelectorAll("input:checked").length);
          }}
        >
          {choices.map((choice) => (
            <label
              key={choice.value}
              className="flex min-h-[32px] items-center gap-[8px] text-[14px]"
            >
              <input
                type="checkbox"
                name={name}
                value={choice.value}
                defaultChecked={initial.includes(choice.value)}
                disabled={disabled}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </details>
      <p className="text-ink-3 text-[13px]">{hint}</p>
    </fieldset>
  );
}

export function DiscountForm({
  action,
  copy,
  values,
  currencies,
  countries,
  products,
  zones,
  initialPreview,
  id,
  frozen,
  readOnly,
  cancelHref,
  children,
}: {
  readonly action: (
    state: DiscountFormState,
    formData: FormData,
  ) => Promise<DiscountFormState>;
  readonly copy: DiscountFormCopy;
  readonly values: DiscountFormValues;
  readonly currencies: readonly string[];
  readonly countries: readonly DiscountChoice[];
  readonly products: readonly DiscountChoice[];
  readonly zones: readonly string[];
  readonly initialPreview: DiscountPreviewView;
  /** The code's id when editing. */
  readonly id?: string;
  readonly frozen: boolean;
  /** `finance`: everything read only, no buttons (absent, not disabled). */
  readonly readOnly: boolean;
  readonly cancelHref: string;
  /** Extra controls after Save (the disable dialog). */
  readonly children?: ReactElement | null;
}): ReactElement {
  const [state, formAction] = useActionState(action, {
    result: null,
    errors: {},
  });
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState(values.kind);
  const [preview, setPreview] = useState(initialPreview);
  const [updating, setUpdating] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const code = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerLocked = frozen || readOnly;

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const refresh = (): void => {
    if (readOnly || form.current === null) return;
    if (timer.current !== null) clearTimeout(timer.current);
    const element = form.current;
    timer.current = setTimeout(() => {
      setUpdating(true);
      void previewDiscountCostAction(new FormData(element))
        .then(setPreview)
        .finally(() => {
          setUpdating(false);
        });
    }, PREVIEW_DELAY_MS);
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  };

  const error = (field: string): string | undefined => state.errors[field];
  const text = (
    field: string,
    label: string,
    defaultValue: string,
    options: {
      readonly hint?: string;
      readonly full?: boolean;
      readonly type?: "text" | "datetime-local";
      readonly inputMode?: "numeric" | "decimal";
      readonly locked?: boolean;
      readonly multiline?: boolean;
    } = {},
  ): ReactElement => {
    const fieldId = `discount-${field}`;
    const message = error(field);
    const shared = {
      id: fieldId,
      name: field,
      defaultValue,
      readOnly: readOnly || options.locked === true,
      ...adminFieldAria(fieldId, options.hint, message),
      className: adminControlClass(message !== undefined),
    };
    return (
      <AdminField
        id={fieldId}
        label={label}
        hint={options.hint}
        error={message}
        full={options.full ?? false}
      >
        {options.multiline === true ? (
          <textarea {...shared} rows={3} />
        ) : (
          <input
            {...shared}
            type={options.type ?? "text"}
            {...(options.inputMode === undefined
              ? {}
              : { inputMode: options.inputMode })}
          />
        )}
      </AdminField>
    );
  };

  const codeError = error("code");
  return (
    <div className="grid gap-[16px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      <form
        ref={form}
        action={formAction}
        onSubmit={submit}
        onChange={refresh}
        className="bg-card grid grid-cols-1 gap-x-[16px] gap-y-[14px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:grid-cols-2 md:px-[20px] md:py-[18px]"
      >
        {id === undefined ? null : <input type="hidden" name="id" value={id} />}
        <h2 className="col-span-full text-[16px] font-bold">{copy.section}</h2>
        {copy.frozen === null ? null : (
          <p className="bg-butter col-span-full rounded-[8px] px-[12px] py-[9px] text-[14px]">
            {copy.frozen}
          </p>
        )}
        {state.result === null ? null : (
          <p
            role="alert"
            className="text-danger col-span-full text-[14px] font-bold"
          >
            {state.result === "invalid" ? copy.invalid : copy.notFound}
          </p>
        )}

        <AdminField
          id="discount-code"
          label={copy.code}
          hint={copy.codeHint}
          error={codeError}
          full
        >
          <div className="flex gap-[8px]">
            <input
              ref={code}
              id="discount-code"
              name="code"
              defaultValue={values.code}
              readOnly={offerLocked}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              {...adminFieldAria("discount-code", copy.codeHint, codeError)}
              className={`${adminControlClass(codeError !== undefined)} font-mono`}
            />
            {offerLocked ? null : (
              <button
                type="button"
                className={adminButtonClass("ghost")}
                onClick={() => {
                  if (code.current !== null) code.current.value = generated();
                  refresh();
                }}
              >
                {copy.generate}
              </button>
            )}
          </div>
        </AdminField>
        {text("campaignLabel", copy.campaign, values.campaignLabel, {
          hint: copy.campaignHint,
          full: true,
        })}

        <fieldset className="col-span-full grid gap-[8px]">
          <legend className="text-ink-2 text-[13px] font-bold">
            {copy.offer}
          </legend>
          {offerLocked ? (
            <input type="hidden" name="kind" value={kind} />
          ) : null}
          <div className="flex flex-wrap gap-[16px]">
            {(["percent", "fixed"] as const).map((option) => (
              <label
                key={option}
                className="flex min-h-[32px] items-center gap-[8px] text-[14px]"
              >
                <input
                  type="radio"
                  name={offerLocked ? "kindShown" : "kind"}
                  value={option}
                  checked={kind === option}
                  disabled={offerLocked}
                  onChange={() => {
                    setKind(option);
                  }}
                />
                {option === "percent" ? copy.kindPercent : copy.kindFixed}
              </label>
            ))}
          </div>
          {error("kind") === undefined ? null : (
            <p className="text-danger text-[13px] font-bold">{error("kind")}</p>
          )}
        </fieldset>
        {kind === "percent"
          ? text("percent", copy.percent, values.percent, {
              hint: copy.percentHint,
              inputMode: "decimal",
              locked: frozen,
            })
          : null}

        <fieldset className="col-span-full grid gap-[6px]">
          <legend className="text-ink-2 text-[13px] font-bold">
            {copy.perCurrency}
          </legend>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="text-ink-3 text-start text-[12px] uppercase">
                <th scope="col" className="py-[6px] text-start">
                  {copy.currency}
                </th>
                <th scope="col" className="py-[6px] text-start">
                  {copy.amountOff}
                </th>
                <th scope="col" className="py-[6px] text-start">
                  {copy.minOrder}
                </th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((currency) => {
                const amountError = error(`amount_${currency}`);
                const minError = error(`min_${currency}`);
                const labels = copy.amountLabels[currency];
                return (
                  <tr key={currency} className="align-top">
                    <th
                      scope="row"
                      className="py-[6px] pe-[8px] text-start font-bold"
                    >
                      {currency}
                    </th>
                    <td className="py-[6px] pe-[8px]">
                      <input
                        name={`amount_${currency}`}
                        aria-label={labels?.amount ?? currency}
                        defaultValue={values.amounts[currency]?.amount ?? ""}
                        placeholder={kind === "fixed" ? "" : copy.fixedOnly}
                        disabled={kind !== "fixed"}
                        readOnly={offerLocked}
                        inputMode="decimal"
                        aria-invalid={
                          amountError === undefined ? undefined : true
                        }
                        className={adminControlClass(amountError !== undefined)}
                      />
                      {amountError === undefined ? null : (
                        <p className="text-danger text-[13px] font-bold">
                          {amountError}
                        </p>
                      )}
                    </td>
                    <td className="py-[6px]">
                      <input
                        name={`min_${currency}`}
                        aria-label={labels?.min ?? currency}
                        defaultValue={values.amounts[currency]?.min ?? ""}
                        readOnly={readOnly}
                        inputMode="decimal"
                        aria-invalid={minError === undefined ? undefined : true}
                        className={adminControlClass(minError !== undefined)}
                      />
                      {minError === undefined ? null : (
                        <p className="text-danger text-[13px] font-bold">
                          {minError}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {error("currencies") === undefined ? null : (
            <p className="text-danger text-[13px] font-bold">
              {error("currencies")}
            </p>
          )}
        </fieldset>

        {text("startsAt", copy.starts, values.startsAt, {
          type: "datetime-local",
          hint: copy.startsHint,
        })}
        {text("endsAt", copy.ends, values.endsAt, {
          type: "datetime-local",
          hint: copy.optional,
        })}
        <AdminField id="discount-zone" label={copy.zone}>
          <select
            id="discount-zone"
            name="zone"
            defaultValue={values.zone}
            disabled={readOnly}
            className={adminControlClass(false)}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </AdminField>
        <div aria-hidden="true" className="hidden md:block" />
        {text("maxRedemptions", copy.maxRedemptions, values.maxRedemptions, {
          hint: copy.maxRedemptionsHint,
          inputMode: "numeric",
        })}
        {text("maxPerEmail", copy.maxPerEmail, values.maxPerEmail, {
          hint: copy.maxPerEmailHint,
          inputMode: "numeric",
        })}
        <ChoiceList
          name="countryIds"
          legend={copy.destinations}
          hint={copy.destinationsHint}
          all={copy.allDestinations}
          chosenText={copy.chosen}
          choices={countries}
          initial={values.countryIds}
          disabled={readOnly}
        />
        <ChoiceList
          name="productIds"
          legend={copy.bouquets}
          hint={copy.bouquetsHint}
          all={copy.allBouquets}
          chosenText={copy.chosen}
          choices={products}
          initial={values.productIds}
          disabled={readOnly}
        />
        {text("note", copy.note, values.note, { full: true, multiline: true })}
        {readOnly ? null : (
          <div className="col-span-full flex flex-wrap items-center gap-[10px]">
            <button type="submit" className={adminButtonClass("primary")}>
              {copy.submit}
            </button>
            {children}
            <a href={cancelHref} className={adminButtonClass("ghost")}>
              {copy.cancel}
            </a>
          </div>
        )}
      </form>

      <section
        aria-labelledby="discount-preview-title"
        className="bg-card grid gap-[12px] rounded-[12px] px-[16px] py-[14px] shadow-[inset_0_0_0_1px_var(--color-rule)] md:px-[20px] md:py-[18px]"
      >
        <header>
          <h2 id="discount-preview-title" className="text-[16px] font-bold">
            {copy.previewTitle}
          </h2>
          <p className="text-ink-3 mt-[4px] text-[13px]">{copy.previewLead}</p>
          <p aria-live="polite" className="text-ink-3 text-[13px]">
            {updating ? copy.previewUpdating : ""}
          </p>
        </header>
        {preview.belowTitle === null ? null : (
          <div
            role="status"
            className="bg-blush rounded-[8px] px-[12px] py-[10px] text-[14px]"
          >
            <p className="font-bold">{preview.belowTitle}</p>
            {preview.belowItems.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
        {preview.claimItems.length === 0 ? null : (
          <div
            role="status"
            className="bg-butter rounded-[8px] px-[12px] py-[10px] text-[14px]"
          >
            <p className="font-bold">{copy.claimTitle}</p>
            {preview.claimItems.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
        {preview.rows.length === 0 ? (
          <p className="text-ink-3 text-[14px]">{copy.previewEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-ink-3 text-[11px] uppercase">
                  <th scope="col" className="py-[6px] pe-[8px] text-start">
                    {copy.columns.bouquet}
                  </th>
                  <th scope="col" className="py-[6px] pe-[8px] text-start">
                    {copy.columns.destination}
                  </th>
                  <th scope="col" className="py-[6px] pe-[8px] text-end">
                    {copy.columns.price}
                  </th>
                  <th scope="col" className="py-[6px] pe-[8px] text-end">
                    {copy.columns.discount}
                  </th>
                  <th scope="col" className="py-[6px] pe-[8px] text-end">
                    {copy.columns.vat}
                  </th>
                  <th scope="col" className="py-[6px] pe-[8px] text-end">
                    {copy.columns.payout}
                  </th>
                  <th scope="col" className="py-[6px] text-end">
                    {copy.columns.margin}
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr
                    key={row.key}
                    className={`border-rule border-t ${row.belowCost ? "bg-blush text-accent-strong font-bold" : ""}`}
                  >
                    <td className="py-[6px] pe-[8px]">{row.product}</td>
                    <td className="py-[6px] pe-[8px]">{row.destination}</td>
                    <td className="py-[6px] pe-[8px] text-end whitespace-nowrap tabular-nums">
                      {row.price}
                    </td>
                    <td className="py-[6px] pe-[8px] text-end whitespace-nowrap tabular-nums">
                      {row.discount}
                    </td>
                    <td className="py-[6px] pe-[8px] text-end whitespace-nowrap tabular-nums">
                      {row.vat}{" "}
                      <span className="text-ink-3">{row.vatRate}</span>
                    </td>
                    <td className="py-[6px] pe-[8px] text-end whitespace-nowrap tabular-nums">
                      {row.payout}
                    </td>
                    <td className="py-[6px] text-end whitespace-nowrap tabular-nums">
                      {row.margin}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {preview.truncated === null ? null : (
          <p className="text-ink-3 text-[13px]">{preview.truncated}</p>
        )}
      </section>
    </div>
  );
}
