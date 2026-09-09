/* Valid fixture: the same component painted from tokens (spec 004 AC-1, T-02; TASK-045). */
export function Swatch() {
  return (
    <div className="bg-accent text-on-accent">
      <span className="border-rule shadow-sm" />
      <span className={cn("p-4", "text-ink-muted")} />
      {/* The one legitimate inline case: a token, by reference. */}
      <span style={{ color: "var(--color-ink-3)" }} />
    </div>
  );
}
