/**
 * Copy text to the clipboard, returning whether it landed.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost).
 * This app is often reached over plain HTTP on a LAN, where that API is
 * undefined — so a share link "copied" through it silently does nothing. The
 * fallback drops to a hidden textarea + `execCommand("copy")`, which works in
 * insecure contexts too.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or unavailable despite the API existing — fall back.
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
