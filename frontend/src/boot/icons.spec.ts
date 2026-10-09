import { describe, it, expect } from "vitest";
import { mapIcon } from "./icons";

describe("mapIcon", () => {
  it("resolves the tea leaf to an inline SVG in Quasar's path format", () => {
    const mapped = mapIcon("app:tea-leaf");

    expect(mapped?.icon).toMatch(/^M.*\|0 0 48 48$/);
  });

  it("leaves Material icon names to Quasar", () => {
    expect(mapIcon("adjust")).toBeUndefined();
  });
});
