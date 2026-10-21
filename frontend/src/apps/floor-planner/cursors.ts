import { FLOORS, solidFill, type Brush } from "./codes";

// Each cursor is a crosshair, whose centre is the point that paints, with a badge
// down and to the right showing the tool, so the plan says which one is out.
const INK = "#1c1c1a";
const HOT = 8;
const CROSS =
  `<path d="M8 1v14M1 8h14" stroke="#fff" stroke-width="3" stroke-linecap="square"/>` +
  `<path d="M8 1.5v13M1.5 8h13" stroke="${INK}" stroke-width="1"/>`;

const FLOOR_IDS = new Set<string>(FLOORS.map((f) => f.id));

function badge(brush: Brush): string {
  switch (brush.id) {
    case "eraser":
      return (
        `<g transform="rotate(-40 23 23)" stroke="${INK}" stroke-width="1">` +
        `<rect x="15.5" y="19" width="15" height="8" rx="1.5" fill="#fff"/>` +
        `<rect x="15.5" y="19" width="6" height="8" rx="1.5" fill="#f08a8a"/></g>`
      );
    case "label":
      return (
        `<rect x="14.5" y="16.5" width="17" height="13" rx="2.5" fill="#fff" stroke="${INK}"/>` +
        `<text x="23" y="26.5" font-family="sans-serif" font-size="9" font-weight="700" ` +
        `text-anchor="middle" fill="${INK}">Aa</text>`
      );
    case "note":
      return (
        `<rect x="14.5" y="16.5" width="17" height="13" rx="3" fill="#fff8dc" stroke="#9c8440"/>` +
        `<path d="M18 21h10M18 25h7" stroke="#3d3626" stroke-width="1.3" stroke-linecap="round"/>`
      );
    case "socket":
      return (
        `<circle cx="23" cy="23" r="7" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` +
        `<path d="M20.5 20v6M25.5 20v6" stroke="${INK}" stroke-width="1.5"/>`
      );
    case "measure":
      return (
        `<g transform="rotate(-45 23 23)">` +
        `<rect x="13.5" y="19.5" width="19" height="7" rx="1" fill="#f4d35e" stroke="${INK}"/>` +
        `<path d="M17 19.5v3M20.5 19.5v2M24 19.5v3M27.5 19.5v2" stroke="${INK}"/></g>`
      );
  }
  const fill = solidFill(brush.code);
  // A floor is a patch of colour; a wall, window or door a thick bar, like the wall it paints.
  return FLOOR_IDS.has(brush.id)
    ? `<rect x="15.5" y="15.5" width="15" height="15" rx="3" fill="${fill}" stroke="${INK}"/>`
    : `<rect x="14.5" y="19.5" width="17" height="8" rx="1.5" fill="${fill}" stroke="${INK}"/>`;
}

/** The CSS cursor for a brush or tool on the plan. */
export function cursorFor(brush: Brush): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${CROSS}${badge(brush)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOT} ${HOT}, crosshair`;
}
