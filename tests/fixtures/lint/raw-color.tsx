/* Invalid fixture: raw colours in components (spec 004 AC-1, T-02; TASK-045). */
export function Swatch() {
  return (
    <div className="bg-[#ff0000] text-[rgb(0,0,0)]">
      <span className="border-[hsl(210_10%_50%)] shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
      <span className={cn("p-4", "text-[oklch(42%_0.1_155)]")} />
      <span style={{ color: "#0a0a0a" }} />
    </div>
  );
}
