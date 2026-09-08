/**
 * 500 boundary for `/` (spec 001 §5.3, TASK-006; moved into the `(chooser)` root layout in
 * TASK-034).
 *
 * A Next error boundary must be a Client Component. It stays the empty shell: `/` carries no copy
 * until TASK-035 gives the chooser its localised text, and the localised 500 document for every
 * other URL lives at `src/app/[locale]/error.tsx` (spec 003 §5.3).
 */
"use client";

export default function ChooserError() {
  return <main />;
}
