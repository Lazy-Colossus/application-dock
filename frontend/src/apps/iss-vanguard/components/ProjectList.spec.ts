import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectList from "./ProjectList.vue";
import { emptyGrid } from "../resources";
import type { Project } from "../types";

function p(id: string, code: string, over: Partial<Project> = {}): Project {
  return {
    id,
    code,
    name: "",
    prerequisite_id: null,
    cost: emptyGrid(),
    done: false,
    ...over,
  };
}

const projects = [
  p("p-1", "VB03", { done: true }),
  p("p-2", "VB07", { name: "Reactor", prerequisite_id: "p-1" }),
  p("p-3", "VB09", { prerequisite_id: "p-2" }),
];

describe("ProjectList", () => {
  it("lists open projects and tucks done ones under Completed", () => {
    const wrapper = mount(ProjectList, { props: { projects } });
    const completed = wrapper.get("[data-testid=completed]");
    expect(completed.find("[data-testid=project-p-1]").exists()).toBe(true);
    expect(completed.find("[data-testid=project-p-2]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=project-p-2]").text()).toContain("VB07");
    expect(wrapper.get("[data-testid=project-p-2]").text()).toContain(
      "Reactor",
    );
  });

  it("shows prerequisite reminders, greyed once done", () => {
    const wrapper = mount(ProjectList, { props: { projects } });
    const done = wrapper.get("[data-testid=project-prereq-p-2]");
    const open = wrapper.get("[data-testid=project-prereq-p-3]");
    expect(done.text()).toBe("needs VB03");
    expect(done.classes()).toContain("chip--done");
    expect(open.classes()).not.toContain("chip--done");
  });

  it("emits the row's actions with the project", async () => {
    const wrapper = mount(ProjectList, { props: { projects } });
    await wrapper.get("[data-testid=project-complete-p-2]").trigger("click");
    await wrapper.get("[data-testid=project-reopen-p-1]").trigger("click");
    await wrapper.get("[data-testid=project-edit-p-2]").trigger("click");
    await wrapper.get("[data-testid=project-delete-p-3]").trigger("click");
    expect(wrapper.emitted("complete")?.[0]).toEqual([projects[1]]);
    expect(wrapper.emitted("reopen")?.[0]).toEqual([projects[0]]);
    expect(wrapper.emitted("edit")?.[0]).toEqual([projects[1]]);
    expect(wrapper.emitted("remove")?.[0]).toEqual([projects[2]]);
    expect(wrapper.find("[data-testid=project-complete-p-1]").exists()).toBe(
      false,
    );
  });

  it("says so when there are no projects", () => {
    expect(mount(ProjectList, { props: { projects: [] } }).text()).toContain(
      "No projects yet",
    );
  });
});
