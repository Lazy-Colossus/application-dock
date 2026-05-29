const SUFFIX_RE = /^(\d{4}-\d{2}-\d{2})-(\d+)$/;

export function formatSessionLabel(label: string): string {
  const m = label.match(SUFFIX_RE);
  return m ? `${m[1]} #${m[2]}` : label;
}

interface NamedSession {
  label: string;
  name?: string;
}

// Story 6.2: show the user-facing name. When the name is still the date-default
// (equal to the canonical label) fall back to the formatted-label rule so
// auto-suffixed labels read as "YYYY-MM-DD #N".
export function displaySessionName(session: NamedSession): string {
  if (!session.name || session.name === session.label) {
    return formatSessionLabel(session.label);
  }
  return session.name;
}

export function useSessionLabel() {
  return { format: formatSessionLabel, displayName: displaySessionName };
}
