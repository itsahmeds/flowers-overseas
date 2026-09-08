// Invalid fixture: `toLocaleString` formats with the ambient locale and no configuration
// (spec 003 AC-21, TASK-037). One violation.
export const grouped = (1234.5).toLocaleString("de");
