import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * The contrast guard UX-DR4 asks for by name.
 *
 * "Needs a guard — a test or lint rule — not just a note, because it is the one
 * rule a well-meaning implementer will break." So this reads the shipped token
 * layer, computes the real WCAG ratios from the declared hex values, and fails
 * on the traps the Notebook theme sets for itself: `rule-strong` carrying text,
 * `orange` carrying text, and navy on a burgundy fill (1.13:1).
 *
 * It measures the stylesheet rather than trusting the comments in it — editing
 * a hex value or adding a `color: var(--kc-orange)` rule breaks this test.
 */

// Read off disk, from the vitest root, rather than imported: the point is to
// assert on what actually ships in the stylesheet.
const CSS_DIR = "src/apps/kitchencraft/css";
const SASS_PATH = resolve(process.cwd(), CSS_DIR, "kitchencraft.sass");
const SASS = readFileSync(SASS_PATH, "utf-8");

function token(name: string): string {
  const match = SASS.match(new RegExp(`--kc-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`colour token --kc-${name} is not declared`);
  return match[1];
}

/** Any token's declared value, colour or not. */
function rawToken(name: string): string {
  const match = SASS.match(new RegExp(`--kc-${name}:\\s*(.+)`));
  if (!match) throw new Error(`token --kc-${name} is not declared`);
  return match[1].trim();
}

/** Relative luminance per WCAG 2.1, from an `#rrggbb` string. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Top-level rules, split on a line that starts in column zero — then rejoined
 * where a selector list runs over several lines, so `a,\nb\n  decl` is one
 * block and not two.
 */
function blocks(): string[] {
  const out: string[] = [];
  for (const chunk of SASS.split(/\n(?=\S)/)) {
    const previous = out[out.length - 1];
    if (previous !== undefined && previous.trimEnd().endsWith(",")) {
      out[out.length - 1] = `${previous}\n${chunk}`;
      continue;
    }
    out.push(chunk);
  }
  return out;
}

function block(selector: string): string {
  const found = blocks().find(
    (b) => b.startsWith(`${selector}\n`) || b.startsWith(`${selector},\n`),
  );
  if (!found) throw new Error(`rule ${selector} is not declared`);
  return found;
}

const paper = () => token("paper");
const paperRaise = () => token("paper-raise");
const navy = () => token("navy");
const burgundy = () => token("burgundy");
const orange = () => token("orange");
const orangeInk = () => token("orange-ink");
const teal = () => token("teal");
const plum = () => token("plum");
const pencil = () => token("pencil");
const cream = () => token("cream");
const ruleStrong = () => token("rule-strong");

describe("the declared inks", () => {
  it("declares every token the design contract names", () => {
    for (const name of [
      "desk",
      "manila",
      "paper",
      "paper-raise",
      "navy",
      "burgundy",
      "orange",
      "orange-ink",
      "teal",
      "plum",
      "pencil",
      "cream",
      "rule-strong",
    ]) {
      expect(token(name)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("declares the tokens on both roots, so a modal cannot fall back to Carbon", () => {
    expect(SASS).toContain(".kitchencraft-app,\n.kitchencraft-panel");
  });
});

describe("text contrast, measured not assumed", () => {
  it("passes AAA for navy on both paper steps, which carries all body copy", () => {
    expect(ratio(navy(), paper())).toBeGreaterThanOrEqual(7);
    expect(ratio(navy(), paperRaise())).toBeGreaterThanOrEqual(7);
  });

  it("passes AAA for burgundy, which carries every heading", () => {
    expect(ratio(burgundy(), paper())).toBeGreaterThanOrEqual(7);
    expect(ratio(burgundy(), paperRaise())).toBeGreaterThanOrEqual(7);
  });

  it("passes AA for pencil, which carries all the quiet text", () => {
    expect(ratio(pencil(), paper())).toBeGreaterThanOrEqual(4.5);
    expect(ratio(pencil(), paperRaise())).toBeGreaterThanOrEqual(4.5);
  });

  it("passes AA for orange-ink, the small-text half of the highlighter", () => {
    expect(ratio(orangeInk(), paper())).toBeGreaterThanOrEqual(4.5);
    expect(ratio(orangeInk(), paperRaise())).toBeGreaterThanOrEqual(4.5);
  });

  it("passes AA for cream on every fill it is ever written on", () => {
    for (const fill of [burgundy(), teal(), plum(), navy()]) {
      expect(ratio(cream(), fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears the 3:1 non-text floor for rule-strong, which bounds every control", () => {
    expect(ratio(ruleStrong(), paper())).toBeGreaterThanOrEqual(3);
    expect(ratio(ruleStrong(), paperRaise())).toBeGreaterThanOrEqual(3);
  });

  it("clears the 3:1 non-text floor for orange, which draws the rating", () => {
    expect(ratio(orange(), paper())).toBeGreaterThanOrEqual(3);
  });
});

describe("the three traps this palette sets for itself", () => {
  it("still measures navy-on-burgundy as a failure, so the rule below has a reason", () => {
    // If a palette edit ever made this pass, the prohibition would be stale and
    // this test should be revisited deliberately rather than silently.
    expect(ratio(navy(), burgundy())).toBeLessThan(4.5);
  });

  it("never sets navy as the text colour on a burgundy fill", () => {
    // Every rule that fills with burgundy must set its text to cream.
    const filled = blocks().filter((b) =>
      /background:\s*var\(--kc-burgundy\)/.test(b),
    );
    expect(filled.length).toBeGreaterThan(0);
    for (const b of filled) {
      expect(b).toMatch(/(^|\n)\s*color:\s*var\(--kc-cream\)/);
      expect(b).not.toMatch(/(^|\n)\s*color:\s*var\(--kc-navy\)/);
    }
  });

  it("never sets any text in rule-strong, which is 3.1:1 and non-text only", () => {
    // `border-color` and `border-bottom: 1px solid var(--kc-rule-strong)` are
    // fine; a bare `color:` is not. The lookbehind keeps `border-color` out.
    expect(
      SASS.match(/(?<![-\w])color:\s*var\(--kc-rule-strong\)/g),
    ).toBeNull();
  });

  it("spends orange on the rating mark and nowhere else", () => {
    // 4.3:1 clears the non-text floor and fails the text one, so the ONE rule
    // allowed to take it is the star — a drawn mark, not a word.
    const users = blocks().filter((b) =>
      /(?<![-\w])color:\s*var\(--kc-orange\)/.test(b),
    );
    expect(users.map((b) => b.split("\n")[0])).toEqual([".kc-rating__star"]);
  });
});

describe("status is never carried by colour alone", () => {
  it("marks a destructive button with a dashed edge, not a hue of its own", () => {
    // Danger and primary share burgundy in this theme; the edge is the whole
    // difference, which is the same shape-not-colour rule the heart follows.
    const b = block(".kc-btn--danger");
    expect(b).toMatch(/border:\s*1px dashed var\(--kc-burgundy\)/);
    expect(b).toMatch(/background:\s*transparent/);
  });

  it("marks an invalid field with a dashed rule, not only a red one", () => {
    expect(block(".kc-field--error")).toMatch(/border-bottom:.*dashed/);
  });
});

describe("the depth model", () => {
  it("lifts only the surfaces that are physically above the page", () => {
    // The Beige Ledger had no shadows at all. The Notebook has four, and each
    // one is an object resting on another: the folder on the desk, a slip and
    // an index card on the folder, the note taped over everything.
    const lifted = blocks()
      .filter((b) => /box-shadow:\s*(?!none)/.test(b))
      .map((b) => b.split("\n")[0].replace(/,$/, ""));
    expect(new Set(lifted)).toEqual(
      new Set([
        ".kc-band",
        ".kc-typeahead__panel",
        ".kc-modal",
        ".kc-sheet",
        ".kc-sheet::before",
      ]),
    );
  });

  it("bounds every flat surface with a rule instead of a fill", () => {
    expect(block(".kc-field")).toMatch(
      /border-bottom:\s*1px solid var\(--kc-rule-strong\)/,
    );
    expect(block(".kc-typeahead__panel")).toMatch(
      /border:\s*1px solid var\(--kc-rule-strong\)/,
    );
    // Two tiers, on purpose. `rule-strong` is 3.1:1 and bounds anything a
    // user has to find and operate — a field, a panel. The line between two
    // list items is decoration: it divides, it is not an edge you aim at, and
    // at 3:1 down a long collection it reads as a grid rather than a list.
    expect(block(".kc-row")).toMatch(
      /border-bottom:\s*1px dotted var\(--kc-rule\)/,
    );
  });

  it("keeps the paper step too faint to carry a boundary on its own", () => {
    // Which is why every flat surface takes a rule instead.
    expect(ratio(paper(), paperRaise())).toBeLessThan(1.3);
  });
});

describe("the type ramp", () => {
  it("holds the recipe body at its 18px floor, sitting on the 32px rule", () => {
    const b = block(".kc-recipe");
    expect(b).toMatch(/font-size:\s*18px/);
    expect(b).toMatch(/line-height:\s*32px/);
  });

  it("rules the reading surfaces off the one line-height token", () => {
    // The body text and the body field must share a rhythm, or typing into a
    // recipe would not land where reading it does.
    expect(rawToken("lh")).toBe("32px");
    for (const selector of [".kc-recipe", ".kc-field--body"]) {
      expect(block(selector)).toMatch(/repeating-linear-gradient/);
    }
  });

  it("keeps the recipe size and the measure identical at both breakpoints", () => {
    // A wide window buys margin, never a longer line or smaller text — so the
    // wide block must not restate either.
    const wide = SASS.slice(SASS.indexOf("@media (min-width: 700px)"));
    expect(wide).not.toMatch(/\.kc-recipe\b[^]*?font-size/);
    expect(wide).not.toMatch(/--kc-measure:/);
  });

  it("sets tabular numerals on the role that carries counts and times", () => {
    expect(block(".kc-meta")).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("gives each of the three hands exactly one job", () => {
    for (const name of ["display", "hand", "typed"]) {
      expect(rawToken(name)).toMatch(/^"KC /);
    }
  });

  it("self-hosts every face, so type never waits on the network", () => {
    // The dock ships as one container and must render without egress.
    expect(SASS).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import\s+url/);
    const srcs = SASS.match(/src:\s*url\([^)]+\)/g) ?? [];
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      expect(src).toMatch(/url\("\.\/fonts\/[a-z0-9-]+\.woff2"\)/);
    }
  });

  it("ships every font file it declares, so no face falls back silently", () => {
    const files = [
      ...SASS.matchAll(/url\("\.\/(fonts\/[a-z0-9-]+\.woff2)"\)/g),
    ];
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const [, relative] of files) {
      expect(
        existsSync(resolve(dirname(SASS_PATH), relative)),
        `${relative} is declared but not shipped`,
      ).toBe(true);
    }
  });

  it("covers latin-ext, which is what carries Polish recipe names", () => {
    expect(SASS).toMatch(/latin-ext\.woff2/);
  });
});

describe("shapes and touch targets", () => {
  it("keeps the whole shape language square", () => {
    expect(rawToken("r-sm")).toBe("1px");
    expect(rawToken("r-md")).toBe("2px");
  });

  it("uses no pills or circles", () => {
    // The punch holes are drawn as a radial gradient, not a rounded box, so
    // this stays true even though the page is full of them.
    expect(SASS).not.toMatch(/border-radius:\s*(50%|9999px|999px)/);
  });

  it("holds a 44px touch minimum", () => {
    expect(rawToken("touch")).toBe("44px");
  });

  it("keeps that floor for a finger even though the chip box is leaner", () => {
    // Buttons and filter chips are 34px and 30px for a mouse — above WCAG
    // 2.5.8's 24px pointer floor — and the coarse-pointer block puts the 44px
    // one back. Deleting that block would silently turn every action and every
    // filter into an undersized touch target, which is the kind of regression
    // a visual tweak makes by accident.
    expect(SASS).toContain("@media (pointer: coarse)");
    const coarse = SASS.slice(SASS.indexOf("@media (pointer: coarse)"));
    for (const selector of [
      "\\.kc-textbtn",
      "\\.kc-tab",
      "\\.kc-rating__star",
      "\\.kc-row > \\.kc-icon-btn",
      "\\.kc-field",
      "\\.kc-btn",
      "\\.kc-typeahead__add",
      "\\.kc-chip--control",
      "\\.kc-chip \\.kc-icon-btn",
    ]) {
      expect(coarse).toMatch(
        new RegExp(`${selector}[^]*?min-height:\\s*var\\(--kc-touch\\)`),
      );
    }
  });

  it("respects prefers-reduced-motion", () => {
    expect(SASS).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("the folder is built out of the markup that already exists", () => {
  it("makes the band the folder cover and its ::before the paper", () => {
    expect(block(".kc-band")).toMatch(/background:\s*var\(--kc-manila\)/);
    expect(block(".kc-band::before")).toMatch(
      /background-color:\s*var\(--kc-paper\)/,
    );
  });

  it("clears the punched margin without insetting a fixed modal with it", () => {
    // A `.kc-backdrop` is a sibling of the page content inside `.kc-band`, and
    // it is fixed to the viewport — shifting it by the punch would move the
    // whole overlay off-centre.
    expect(SASS).toContain(".kc-band > *:not(.kc-backdrop)");
  });
});

describe("the shopping list wears list-row, not recipe-row", () => {
  // DESIGN.md defines the two as separate components: `recipe-row` is tall
  // because it carries two lines, `list-row` is touch-min because it carries
  // one. The shopping row borrowing the recipe row's height is the mistake
  // this guards.
  it("sizes the shopping row to the touch minimum, not to the recipe row's", () => {
    expect(block(".kc-shop-row")).toMatch(/min-height:\s*var\(--kc-touch\)/);
    expect(block(".kc-shop-row")).not.toMatch(/min-height:\s*6\dpx/);
  });

  it("sizes its tick target the same, overriding the recipe row it extends", () => {
    expect(block(".kc-shop-row__tick")).toMatch(
      /min-height:\s*var\(--kc-touch\)/,
    );
  });

  it("insets row content to the grid the bar and the field sit on", () => {
    expect(block(".kc-shop-row__tick")).toMatch(/padding:.*var\(--kc-pad\)/);
  });

  it("strikes a ticked item through in ink, never in the quiet register", () => {
    // Three places in the spec say ink: the `list-row` token, the colour
    // allocation, and the State Patterns row. A ticked item has to stay
    // readable — fading it half-removes it, which FR-15 forbids.
    expect(block(".kc-shop-row__done")).toMatch(
      /text-decoration:\s*line-through/,
    );
    expect(block(".kc-shop-row__done")).not.toMatch(/color:/);
  });
});
