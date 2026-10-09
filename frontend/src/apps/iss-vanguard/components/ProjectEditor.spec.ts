import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectEditor from "./ProjectEditor.vue";
import { emptyGrid } from "../resources";
import type { Project, ProjectDraft } from "../types";

const other: Project = {
  id: "p-1",
  code: "VB03",
  name: "Hull",
  prerequisite_id: null,
  cost: emptyGrid(),
  done: false,
};

describe("ProjectEditor", () => {
  it("builds a new draft from the fields and the cost grid", async () => {
    const wrapper = mount(ProjectEditor, {
      props: { project: null, projects: [other], busy: false },
    });
    expect(
      wrapper.get("[data-testid=editor-save]").attributes("disabled"),
    ).toBeDefined();

    await wrapper.get("[data-testid=editor-code]").setValue("VB07");
    await wrapper.get("[data-testid=editor-name]").setValue("Reactor");
    await wrapper.get("[data-testid=editor-prerequisite]").setValue("p-1");
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await wrapper.get("[data-testid=editor-save]").trigger("click");

    const [[draft]] = wrapper.emitted("save") as [[ProjectDraft]];
    expect(draft.code).toBe("VB07");
    expect(draft.name).toBe("Reactor");
    expect(draft.prerequisite_id).toBe("p-1");
    expect(draft.cost.minerals.rare).toBe(2);
  });

  it("edits a copy of an existing project and never offers itself as prerequisite", async () => {
    const project: Project = { ...other, cost: emptyGrid() };
    project.cost.minerals.basic = 1;
    const wrapper = mount(ProjectEditor, {
      props: { project, projects: [project], busy: false },
    });
    const options = wrapper.findAll("[data-testid=editor-prerequisite] option");
    expect(options.map((o) => o.attributes("value"))).toEqual([""]);
    await wrapper.get("[data-testid=cell-minerals-basic]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    expect(project.cost.minerals.basic).toBe(1);
    await wrapper.get("[data-testid=editor-save]").trigger("click");
    const [[draft]] = wrapper.emitted("save") as [[ProjectDraft]];
    expect(draft.cost.minerals.basic).toBe(2);
    expect(draft.prerequisite_id).toBeNull();
  });
});
