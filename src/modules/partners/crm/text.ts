/**
 * `textHasContactDetails` (spec 030b §5.2 "Schemas", §8 "Minimisation of free text"; AC-28,
 * AC-29, AC-30; TASK-441).
 *
 * The CRM's free text (a note, a contact-log summary, the contact person) keeps to business facts:
 * an email address or a phone-shaped string is refused with `CRM_TEXT_HAS_CONTACT_DETAILS`, and the
 * form points to the contact fields instead. Three shapes are refused:
 *
 *  - an email address (`local@domain.tld`);
 *  - a `+` followed by 8 to 15 digits, single spaces allowed between them (`+48 600 100 200`);
 *  - 9 or more digits in a row, separated by nothing or single spaces (`600 100 200`).
 *
 * Dates (`2026-10-21`) and amounts (`149,00`) pass: a hyphen, a comma or a dot breaks a run.
 * Pure, no I/O; the text is never logged.
 */

/** The refusal code of a CRM text field that holds an email address or a phone number. */
export const CRM_TEXT_HAS_CONTACT_DETAILS = "CRM_TEXT_HAS_CONTACT_DETAILS";

const EMAIL = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[A-Za-z]{2,}/u;
const PLUS_PHONE = /\+\d(?: ?\d){7,14}/u;
const DIGIT_RUN = /\d(?: ?\d){8,}/u;

/** Whether `text` holds an email address or a phone-shaped string. */
export function textHasContactDetails(text: string): boolean {
  return EMAIL.test(text) || PLUS_PHONE.test(text) || DIGIT_RUN.test(text);
}
