// Pill color helpers (Story 2.1). A todo's color is one `#rrggbb` string —
// preset swatches and the custom picker both resolve to it.

export const PRESET_COLORS = [
  "#f28b82",
  "#fbbc04",
  "#fff475",
  "#ccff90",
  "#a7ffeb",
  "#cbf0f8",
  "#aecbfa",
  "#d7aefb",
  "#fdcfe8",
  "#e8eaed",
  "#5f6368",
  "#202124",
] as const;

export const DEFAULT_COLOR = "#aecbfa";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(hex: string): boolean {
  return HEX_RE.test(hex);
}

function toChannels(hex: string): [number, number, number] {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). Invalid input reads as white. */
export function relativeLuminance(hex: string): number {
  if (!isHexColor(hex)) return 1;
  const [r, g, b] = toChannels(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Pick black or white text for a pill background, whichever contrasts more.
 * 0.179 is the luminance where contrast against black and white is equal.
 */
export function readableTextColor(background: string): "#000000" | "#ffffff" {
  return relativeLuminance(background) > 0.179 ? "#000000" : "#ffffff";
}
