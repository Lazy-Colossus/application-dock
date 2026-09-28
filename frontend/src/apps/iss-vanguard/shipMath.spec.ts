import { describe, it, expect } from "vitest";
import { emptyGrid } from "./resources";
import { diff, needed, perProjectShortfall, shortfall } from "./shipMath";
import type { Grid, Project, Ship } from "./types";

function grid(cells: Partial<Record<string, number>>): Grid {
  const g = emptyGrid();
  for (const [key, value] of Object.entries(cells)) {
    const [resource, tier] = key.split(".") as [
      keyof Grid,
      "basic" | "rare" | "very_rare",
    ];
    g[resource][tier] = value ?? 0;
  }
  return g;
}

function project(id: string, cost: Grid, done = false): Project {
  return {
    id,
    code: id.toUpperCase(),
    name: "",
    prerequisite_id: null,
    cost,
    done,
  };
}

function ship(stock: Grid, projects: Project[]): Ship {
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana"],
    is_owner: true,
    rev: 1,
    stock,
    projects,
  };
}

describe("shipMath", () => {
  const s = ship(grid({ "minerals.rare": 3, "strange_flora.basic": 1 }), [
    project("a", grid({ "minerals.rare": 2 })),
    project("b", grid({ "minerals.rare": 2, "strange_flora.basic": 1 })),
    project("done", grid({ "minerals.rare": 9 }), true),
  ]);

  it("sums the cost of projects that aren't done", () => {
    expect(needed(s).minerals.rare).toBe(4);
    expect(needed(s).strange_flora.basic).toBe(1);
  });

  it("subtracts needed from stock, going negative when short", () => {
    const d = diff(s);
    expect(d.minerals.rare).toBe(-1);
    expect(d.strange_flora.basic).toBe(0);
    expect(d.microorganisms.basic).toBe(0);
  });

  it("lists only the missing cells, in display order", () => {
    expect(
      shortfall(
        grid({ "minerals.basic": 1 }),
        grid({ "minerals.basic": 3, "microorganisms.rare": 1 }),
      ),
    ).toEqual([
      { resource: "microorganisms", tier: "rare", amount: 1 },
      { resource: "minerals", tier: "basic", amount: 2 },
    ]);
  });

  it("measures each open project against the whole stock on its own", () => {
    // a (2) and b (2) are each coverable by 3 alone, even though together they need 4.
    expect(perProjectShortfall(s)).toEqual([]);
    const short = ship(grid({ "minerals.rare": 1 }), s.projects);
    expect(
      perProjectShortfall(short).map((p) => [p.project.id, p.missing]),
    ).toEqual([
      ["a", [{ resource: "minerals", tier: "rare", amount: 1 }]],
      [
        "b",
        [
          { resource: "minerals", tier: "rare", amount: 1 },
          { resource: "strange_flora", tier: "basic", amount: 1 },
        ],
      ],
    ]);
  });
});
