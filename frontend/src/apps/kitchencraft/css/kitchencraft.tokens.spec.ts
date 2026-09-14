import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The contrast guard UX-DR4 asks for by name.
 *
 * "Needs a guard — a test or lint rule — not just a note, because it is the one
 * rule a well-meaning implementer will break." So this reads the shipped token
 * layer, computes the real WCAG ratios from the declared hex values, and fails
 * on the two traps the design document calls out: `taupe` carrying text
 * (3.17:1) and `ink` on a moss fill (3.09:1).
 *
 * It measures the stylesheet rather than trusting the comments in it — editing
 * a hex value or adding a `color: var(--kc-taupe)` rule breaks this test.
 */

// Read off disk, from the vitest root, rather than imported: the point is to
// assert on what actually ships in the stylesheet.
const SASS = readFileSync(
  resolve(process.cwd(), "src/apps/kitchencraft/css/kitchencraft.sass"),
  "utf-8",
);

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

const beige = () => token("beige");
const beigeRaise = () => token("beige-raise");
const ink = () => token("ink");
const moss = () => token("moss");
const onMoss = () => token("on-moss");
const taupe = () => token("taupe");
const taupeInk = () => token("taupe-ink");
const danger = () => token("danger");

describe("the eight declared colours", () => {
  it("declares every token the design contract names", () => {
    for (const name of [
      "beige",
      "beige-raise",
      "ink",
      "moss",
      "on-moss",
      "taupe",
      "taupe-ink",
      "danger",
    ]) {
      expect(token(name)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("declares the tokens on both roots, so a modal cannot fall back to Carbon", () => {
    expect(SASS).toContain(".kitchencraft-app,\n.kitchencraft-panel");
  });
});

describe("text contrast, measured not assumed", () => {
  it("passes AAA for ink on both paper steps", () => {
    expect(ratio(ink(), beige())).toBeGreaterThanOrEqual(7);
    expect(ratio(ink(), beigeRaise())).toBeGreaterThanOrEqual(7);
  });

  it("passes AA for taupe-ink, which carries all the quiet text", () => {
    expect(ratio(taupeInk(), beige())).toBeGreaterThanOrEqual(4.5);
    expect(ratio(taupeInk(), beigeRaise())).toBeGreaterThanOrEqual(4.5);
  });

  it("passes AA for moss as text and as a focus ring on the page", () => {
    expect(ratio(moss(), beige())).toBeGreaterThanOrEqual(4.5);
  });

  it("passes AA for on-moss, the only text colour allowed on a moss fill", () => {
    expect(ratio(onMoss(), moss())).toBeGreaterThanOrEqual(4.5);
  });

  it("passes AA for danger on the page", () => {
    expect(ratio(danger(), beige())).toBeGreaterThanOrEqual(4.5);
  });

  it("clears the 3:1 non-text floor for taupe hairlines", () => {
    expect(ratio(taupe(), beige())).toBeGreaterThanOrEqual(3);
  });
});

describe("the two traps the design document calls out", () => {
  it("still measures ink-on-moss as a failure, so the rule below has a reason", () => {
    // If a palette edit ever made this pass, the prohibition would be stale and
    // this test should be revisited deliberately rather than silently.
    expect(ratio(ink(), moss())).toBeLessThan(4.5);
  });

  it("never sets ink as the text colour on a moss fill", () => {
    // Every rule that fills with moss must set its text to on-moss.
    const mossFillRules = SASS.split(/\n(?=\S)/).filter((block) =>
      /background:\s*var\(--kc-moss\)/.test(block),
    );
    expect(mossFillRules.length).toBeGreaterThan(0);
    for (const block of mossFillRules) {
      expect(block).toMatch(/(^|\n)\s*color:\s*var\(--kc-on-moss\)/);
      expect(block).not.toMatch(/(^|\n)\s*color:\s*var\(--kc-ink\)/);
    }
  });

  it("never sets any text in taupe, which is 3.17:1 and non-text only", () => {
    // `border-color` and `border: 1px solid var(--kc-taupe)` are fine; a bare
    // `color:` is not. The lookbehind is what keeps `border-color` out of it.
    const textInTaupe = SASS.match(/(?<![-\w])color:\s*var\(--kc-taupe\)/g);
    expect(textInTaupe).toBeNull();
  });
});

describe("the no-shadow depth model", () => {
  it("adds no box shadow anywhere", () => {
    expect(SASS).not.toMatch(/box-shadow:\s*(?!none)/);
  });

  it("keeps the paper step too faint to carry a boundary on its own", () => {
    // 1.14:1 — which is why every raised surface takes a hairline instead.
    expect(ratio(beige(), beigeRaise())).toBeLessThan(1.3);
  });

  it("gives every raised surface a taupe hairline", () => {
    for (const selector of [".kc-field", ".kc-typeahead__panel", ".kc-modal"]) {
      const block = SASS.split(/\n(?=\S)/).find((b) =>
        b.startsWith(`${selector}\n`),
      );
      expect(block, `${selector} should be a top-level rule`).toBeDefined();
      expect(block).toMatch(/border:\s*1px solid var\(--kc-taupe\)/);
    }
  });
});

describe("the type ramp", () => {
  it("holds the recipe body at its 18px/1.75 floor", () => {
    const block = SASS.split(/\n(?=\S)/).find((b) =>
      b.startsWith(".kc-recipe\n"),
    );
    expect(block).toMatch(/font-size:\s*18px/);
    expect(block).toMatch(/line-height:\s*1\.75/);
  });

  it("keeps the recipe size and the measure identical at both breakpoints", () => {
    // A wide window buys margin, never a longer line or smaller text — so the
    // wide block must not restate either.
    const wide = SASS.slice(SASS.indexOf("@media (min-width: 700px)"));
    expect(wide).not.toMatch(/\.kc-recipe\b[^]*?font-size/);
    expect(wide).not.toMatch(/--kc-measure:/);
  });

  it("sets tabular numerals on the role that carries counts and times", () => {
    const block = SASS.split(/\n(?=\S)/).find((b) =>
      b.startsWith(".kc-meta\n"),
    );
    expect(block).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("adds no webfont payload", () => {
    expect(SASS).not.toMatch(/@import\s+url|fonts\.googleapis|@font-face/);
  });
});

describe("shapes and touch targets", () => {
  it("keeps the whole shape language to 3px and 6px", () => {
    expect(rawToken("r-sm")).toBe("3px");
    expect(rawToken("r-md")).toBe("6px");
  });

  it("uses no pills or circles", () => {
    expect(SASS).not.toMatch(/border-radius:\s*(50%|9999px|999px)/);
  });

  it("holds a 44px touch minimum", () => {
    expect(rawToken("touch")).toBe("44px");
  });

  it("respects prefers-reduced-motion", () => {
    expect(SASS).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("the shopping list wears list-row, not recipe-row", () => {
  // DESIGN.md defines the two as separate components: `recipe-row` is 64px
  // because it carries two lines, `list-row` is touch-min because it carries
  // one. The shopping row borrowing 64px is the mistake this guards.
  function block(selector: string): string {
    const match = SASS.match(new RegExp(`\\${selector}\\n((?:  .*\\n|\\n)*)`));
    if (!match) throw new Error(`rule ${selector} is not declared`);
    return match[1];
  }

  it("sizes the shopping row to the touch minimum, not to 64px", () => {
    expect(block(".kc-shop-row")).toMatch(/min-height:\s*var\(--kc-touch\)/);
    expect(block(".kc-shop-row")).not.toMatch(/min-height:\s*64px/);
  });

  it("sizes its tick target the same, overriding the recipe row it extends", () => {
    expect(block(".kc-shop-row__tick")).toMatch(
      /min-height:\s*var\(--kc-touch\)/,
    );
  });

  it("insets row content to the 16px grid the bar and the field sit on", () => {
    expect(block(".kc-shop-row__tick")).toMatch(/padding:.*var\(--kc-pad\)/);
  });

  it("strikes a ticked item through in INK, never in the quiet register", () => {
    // Three places in the spec say ink: the `list-row` token, the colour
    // allocation, and the State Patterns row. A ticked item has to stay
    // readable — fading it half-removes it, which FR-15 forbids.
    expect(block(".kc-shop-row__done")).toMatch(
      /text-decoration:\s*line-through/,
    );
    expect(block(".kc-shop-row__done")).not.toMatch(/color:/);
  });
});
