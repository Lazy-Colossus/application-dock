// A quiet relative time for "edited" subtext. Local to this app rather than
// imported from another one: apps are self-contained, and the shell's shared
// components are primitives only.
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, (now - then) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
