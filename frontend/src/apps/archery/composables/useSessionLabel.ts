const SUFFIX_RE = /^(\d{4}-\d{2}-\d{2})-(\d+)$/;

export function formatSessionLabel(label: string): string {
  const m = label.match(SUFFIX_RE);
  return m ? `${m[1]} #${m[2]}` : label;
}

export function useSessionLabel() {
  return { format: formatSessionLabel };
}
