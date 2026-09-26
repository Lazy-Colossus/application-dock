import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaCup from "./TeaCup.vue";

const cup = (elapsed: number, target = 20, color = "#d49a3f") =>
  mount(TeaCup, { props: { elapsed, target, color, running: true } });

describe("TeaCup", () => {
  it("is empty before a steep", () => {
    expect(cup(0).get("[data-testid=cup-liquor]").attributes("data-level")).toBe("0");
  });

  it("reaches the dashed line exactly at the target", () => {
    expect(cup(20).get("[data-testid=cup-liquor]").attributes("data-level")).toBe("0.85");
  });

  it("rises past the line and caps at the rim", () => {
    expect(Number(cup(30).get("[data-testid=cup-liquor]").attributes("data-level"))).toBeGreaterThan(
      0.85,
    );
    expect(cup(400).get("[data-testid=cup-liquor]").attributes("data-level")).toBe("1");
  });

  it("uses the tea colour, darkening only once over-steeped", () => {
    expect(cup(10).get("[data-testid=cup-liquor]").attributes("fill")).toBe("#d49a3f");
    expect(cup(35).get("[data-testid=cup-liquor]").attributes("fill")).not.toBe("#d49a3f");
  });

  it("labels the target line", () => {
    expect(cup(0, 25).get("[data-testid=cup-target-label]").text()).toBe("25s");
  });
});
