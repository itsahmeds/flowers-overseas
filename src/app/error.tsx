/**
 * 500 shell (spec 001 §5.3, TASK-006).
 *
 * A Next error boundary must be a Client Component; it renders the same empty shell as `/` and
 * carries no text (spec 003 adds the message). No `reset` button for the same reason — a button
 * needs a label, and `fo/no-literal-strings` correctly forbids one before 003.
 */
"use client";

export default function AppError() {
  return <main />;
}
