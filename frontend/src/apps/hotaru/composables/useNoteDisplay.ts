import type { HotaruUser, Note } from "@/apps/hotaru/types";

// Per-user identity hue, reused from the avatar system (DESIGN.md: Dani=violet,
// Jake=amber, Jim=magenta). Identity — distinct from the lock, which signals
// privacy.
const AUTHOR_COLORS: Record<string, string> = {
  dani: "#9b6bff",
  jake: "#ffce5c",
  jim: "#ff5cc8",
};

// Shared note-presentation helpers, used by both the notes dialog and the drill
// card so the two render authorship/time identically (no duplicated logic).
// `users`/`activeUser` are accessors so the helpers read current prop values.
export function useNoteDisplay(
  users: () => HotaruUser[],
  activeUser: () => string | undefined,
) {
  function authorName(id: string): string {
    return users().find((u) => u.id === id)?.name ?? id;
  }

  // The active user sees their own notes attributed to "You".
  function displayName(n: Note): string {
    return n.author === activeUser() ? "You" : authorName(n.author);
  }

  function authorInitial(id: string): string {
    return ((authorName(id) ?? "")[0] ?? "?").toUpperCase();
  }

  function authorColor(id: string): string {
    return AUTHOR_COLORS[id] ?? "#7c78b8";
  }

  // A whisper-quiet relative time — informational, never a countdown/debt.
  function formatTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const secs = Math.max(0, (Date.now() - then) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
    return new Date(then).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  }

  return { authorName, displayName, authorInitial, authorColor, formatTime };
}
