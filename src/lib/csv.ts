/**
 * The RFC 4180 CSV writer (spec 030b §5.2 `src/lib/csv.ts`; AC-23; TASK-440), extracted from spec
 * 030a's `wiseCsv`, which now calls it with byte-identical output (030a's fixture still passes).
 *
 * **The one formatting path outside `Intl`.** These files are for spreadsheets and accounting
 * tools, never read as prose: amounts are machine decimal strings (`.` separator, no grouping,
 * the currency's own exponent), dates ISO `YYYY-MM-DD`. Every amount a person reads still goes
 * through `formatMoney`.
 *
 * Cells are typed:
 *  - a **text** cell is neutralised against formula injection (a leading `=`, `+`, `-`, `@`, tab
 *    or CR gets a `'`) and then quoted when RFC 4180 needs it (`"`, `,`, CR, LF), its quotes
 *    doubled;
 *  - an **amount** cell comes only from `signedDecimalString(amountMinor, exponent)` and must match
 *    `^-?[0-9]+(\.[0-9]+)?$`, so a negative amount stays a number: never prefixed, never quoted.
 *
 * Records end in CRLF; the text is UTF-8 with no BOM. Built in memory; nothing here touches disk.
 */

/** The largest exponent a currency in this system has (ISO 4217 uses 0 to 4). */
export const CSV_MAX_EXPONENT = 4;

/** `amountMinor ≥ 0` at `exponent` as a machine decimal (`149.00`, `149`, `1.234`). */
export function unsignedDecimalString(
  amountMinor: bigint | number,
  exponent: number,
): string {
  if (
    !Number.isInteger(exponent) ||
    exponent < 0 ||
    exponent > CSV_MAX_EXPONENT
  ) {
    throw new RangeError("an exponent is a whole number from 0 to 4");
  }
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError("an amount in minor units is a whole number");
  }
  const value = BigInt(amountMinor);
  if (value < 0n) throw new RangeError("an unsigned amount is not negative");
  return decimalDigits(value, exponent);
}

/** `value ≥ 0` with `exponent` decimals, by string arithmetic only. */
function decimalDigits(value: bigint, exponent: number): string {
  if (exponent === 0) return value.toString();
  const digits = value.toString().padStart(exponent + 1, "0");
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** The decimals of a rate cell: parts per million, six decimals always (`0.865000`). */
export const CSV_RATE_DECIMALS = 6;

/** Spec 030b §5.2: the absolute value's decimal string with `-` before a negative (`-0.19`). */
export function signedDecimalString(
  amountMinor: bigint | number,
  exponent: number,
): string {
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError("an amount in minor units is a whole number");
  }
  const value = BigInt(amountMinor);
  const text = unsignedDecimalString(value < 0n ? -value : value, exponent);
  return value < 0n ? `-${text}` : text;
}

/** The characters that make a spreadsheet read a cell as a formula. */
const FORMULA_LEAD = /^[=+\-@\t\r]/u;
/** The characters RFC 4180 quotes for. */
const NEEDS_QUOTES = /[",\r\n]/u;
const AMOUNT = /^-?[0-9]+(\.[0-9]+)?$/u;

/** One text cell: neutralised against formula injection, then quoted when RFC 4180 needs it. */
export function csvTextCell(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** One typed cell of a record. */
export type CsvCell =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "amount";
      readonly minor: bigint | number;
      readonly exponent: number;
    }
  | { readonly kind: "rate"; readonly ppm: bigint }
  | { readonly kind: "empty" };

export const csvText = (value: string): CsvCell => ({ kind: "text", value });
export const csvAmount = (
  minor: bigint | number,
  exponent: number,
): CsvCell => ({
  kind: "amount",
  minor,
  exponent,
});
/** A rate in parts per million as a six-decimal string (`865000n` is `0.865000`). */
export const csvRate = (ppm: bigint): CsvCell => {
  if (ppm <= 0n) throw new RangeError("a rate is positive");
  return { kind: "rate", ppm };
};
export const csvEmpty: CsvCell = { kind: "empty" };

function render(cell: CsvCell): string {
  if (cell.kind === "empty") return "";
  if (cell.kind === "text") return csvTextCell(cell.value);
  if (cell.kind === "rate") return decimalDigits(cell.ppm, CSV_RATE_DECIMALS);
  const text = signedDecimalString(cell.minor, cell.exponent);
  if (!AMOUNT.test(text))
    throw new RangeError("an amount cell is a decimal number");
  return text;
}

const CRLF = "\r\n";

/** The header as text cells, then each record; every line ends in CRLF. */
export function csvDocument(
  header: readonly string[],
  records: readonly (readonly CsvCell[])[],
): string {
  const lines = [
    header.map(csvTextCell).join(","),
    ...records.map((record) => {
      if (record.length !== header.length) {
        throw new RangeError("a CSV record has one cell per header column");
      }
      return record.map(render).join(",");
    }),
  ];
  return lines.map((line) => `${line}${CRLF}`).join("");
}
