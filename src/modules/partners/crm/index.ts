/**
 * Public barrel for `partners/crm` (spec 030b §2.7, §5.2; TASK-441): the florist relationship
 * record (notes, contact log, follow-ups, contact person). Server only; imported by
 * `src/app/admin` and this module's tests, nowhere else (AC-5). Not re-exported by the
 * `partners` barrel, so no public page's graph reaches it.
 */
export {
  addNote,
  CRM_ACTIONS,
  type CrmCommandResult,
  deleteNote,
  editContact,
  editNote,
  logContact,
  markFollowUpDone,
  saveContactName,
} from "./commands";
export {
  type CrmContactEntry,
  type CrmNote,
  type FollowUpDue,
  followUpsDue,
  type PartnerCrmColumns,
  partnerListCrm,
  type PartnerRelationship,
  partnerRelationship,
  readFollowUpsDue,
  readRelationship,
} from "./queries";
export {
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  type ContactChannel,
  type ContactDirection,
  type ContactTopic,
  type CrmFieldError,
  crmFieldErrors,
  NOTE_MAX,
  parseContactName,
  SUMMARY_MAX,
} from "./schemas";
export { CRM_TEXT_HAS_CONTACT_DETAILS, textHasContactDetails } from "./text";
