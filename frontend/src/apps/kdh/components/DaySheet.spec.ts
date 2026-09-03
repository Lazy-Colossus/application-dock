import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import DaySheet from "./DaySheet.vue";
import type { Invitee } from "@/apps/kdh/types";

const ROSTER: Invitee[] = [
  { id: "inv-1", name: "Dani", order: 0, removed_at: null },
  { id: "inv-2", name: "Jake", order: 1, removed_at: null },
  { id: "inv-3", name: "Kit", order: 2, removed_at: null },
];

const STUBS = {
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :class="$attrs.class" @click="$emit(\'click\')">{{ $attrs.label }}<slot /></button>',
    emits: ["click"],
  },
};

function mountSheet(props: Partial<Record<string, unknown>> = {}) {
  return mount(DaySheet, {
    props: {
      date: "2026-09-14",
      invitees: ROSTER,
      votes: {},
      notes: {},
      claimedId: "inv-1",
      past: false,
      chosen: false,
      isAdmin: false,
      ...props,
    },
    global: { stubs: STUBS },
  });
}

describe("DaySheet", () => {
  it("names the date in full", () => {
    expect(mountSheet().find('[data-testid="sheet-date"]').text()).toContain(
      "September",
    );
  });

  it("says so plainly when nobody has picked the day", () => {
    expect(mountSheet().find('[data-testid="sheet-empty"]').exists()).toBe(
      true,
    );
  });

  it("lists only the people on the day, in roster order", () => {
    const wrapper = mountSheet({ votes: { "inv-3": "yes", "inv-1": "yes" } });
    const rows = wrapper.findAll('[data-testid^="sheet-row-"]');

    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("Dani");
    expect(rows[1].text()).toContain("Kit");
    expect(wrapper.find('[data-testid="sheet-row-inv-2"]').exists()).toBe(
      false,
    );
  });

  it("sets an if-needed person apart by style", () => {
    const wrapper = mountSheet({
      votes: { "inv-1": "yes", "inv-2": "if_needed" },
    });

    const tentative = wrapper.find('[data-testid="sheet-row-inv-2"]');
    expect(tentative.classes()).toContain("tentative");
    expect(tentative.text()).toContain("Jake");
    expect(tentative.text()).toContain("IF NEEDED");
    // Shape as well as style: half-filled, against filled for a free person.
    expect(tentative.find(".g").classes()).toContain("maybe");
    expect(
      wrapper.find('[data-testid="sheet-row-inv-1"]').find(".g").classes(),
    ).toContain("free");

    expect(
      wrapper.find('[data-testid="sheet-row-inv-1"]').classes(),
    ).not.toContain("tentative");
  });

  it("still shows someone since removed, on a day they answered", () => {
    const wrapper = mountSheet({
      past: true,
      claimedId: null,
      invitees: [
        ...ROSTER,
        {
          id: "inv-gone",
          name: "Departed",
          order: 3,
          removed_at: "2026-08-20T18:00:00Z",
        },
      ],
      votes: { "inv-gone": "yes" },
    });

    expect(wrapper.find('[data-testid="sheet-row-inv-gone"]').text()).toContain(
      "Departed",
    );
  });

  it("marks which row is you", () => {
    const wrapper = mountSheet({ votes: { "inv-1": "yes" } });
    expect(wrapper.find('[data-testid="sheet-row-inv-1"]').text()).toContain(
      "YOU",
    );
    expect(wrapper.find('[data-testid="sheet-row-inv-1"]').classes()).toContain(
      "mine",
    );
  });

  it("offers the three states explicitly and shows your current answer", () => {
    const wrapper = mountSheet({ votes: { "inv-1": "if_needed" } });

    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="set-none"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="set-if_needed"]').classes()).toContain(
      "on",
    );
    expect(wrapper.find('[data-testid="set-yes"]').classes()).not.toContain(
      "on",
    );
  });

  it("emits the state that was picked", async () => {
    const wrapper = mountSheet();
    await wrapper.find('[data-testid="set-if_needed"]').trigger("click");
    expect(wrapper.emitted("set")?.[0]).toEqual(["if_needed"]);
  });

  it("offers no controls on a past day", () => {
    const wrapper = mountSheet({ past: true, votes: { "inv-1": "yes" } });
    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sheet-past"]').exists()).toBe(true);
  });

  it("asks an unclaimed visitor to say who they are, instead of the controls", () => {
    const wrapper = mountSheet({ claimedId: null });
    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="claim-prompt"]').exists()).toBe(true);
  });

  it("emits when the claim prompt is used", async () => {
    const wrapper = mountSheet({ claimedId: null });
    await wrapper.find('[data-testid="claim-prompt"]').trigger("click");
    expect(wrapper.emitted("claim")).toBeTruthy();
  });

  it("closes", async () => {
    const wrapper = mountSheet();
    await wrapper.find('[data-testid="sheet-close"]').trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("offers no marking control to a non-admin", () => {
    expect(mountSheet().find('[data-testid="toggle-chosen"]').exists()).toBe(
      false,
    );
  });

  it("lets an admin make this the day", async () => {
    const wrapper = mountSheet({ isAdmin: true });
    await wrapper.find('[data-testid="toggle-chosen"]').trigger("click");
    expect(wrapper.emitted("chosen")?.[0]).toEqual([true]);
  });

  it("lets an admin take it back", async () => {
    const wrapper = mountSheet({ isAdmin: true, chosen: true });
    expect(wrapper.find('[data-testid="toggle-chosen"]').text()).toContain(
      "This is the day",
    );

    await wrapper.find('[data-testid="toggle-chosen"]').trigger("click");
    expect(wrapper.emitted("chosen")?.[0]).toEqual([false]);
  });

  it("lets an admin mark a past day — a record may be corrected", async () => {
    const wrapper = mountSheet({ isAdmin: true, past: true, claimedId: null });

    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
    await wrapper.find('[data-testid="toggle-chosen"]').trigger("click");
    expect(wrapper.emitted("chosen")?.[0]).toEqual([true]);
  });

  it("shows the day's shape before any name", () => {
    const wrapper = mountSheet({
      votes: { "inv-1": "yes", "inv-2": "yes", "inv-3": "if_needed" },
    });

    const bar = wrapper.find('[data-testid="sheet-bar"]');
    expect(bar.exists()).toBe(true);
    // Two free, one if needed, and nobody left over on a roster of three.
    // jsdom expands the shorthand, so match the grow factor it actually sets.
    const segments = bar.findAll("i").map((i) => i.attributes("style"));
    expect(segments[0]).toContain("flex-grow: 2");
    expect(segments[1]).toContain("flex-grow: 1");
    expect(segments[2]).toContain("flex-grow: 0");

    expect(wrapper.find(".bar-key").text()).toContain("2 free");
    expect(wrapper.find(".bar-key").text()).toContain("1 if needed");
  });

  it("counts everyone who did not answer as not coming", () => {
    // Silence is a no: they are in the bar's remainder, not in the roster.
    const wrapper = mountSheet({ votes: { "inv-1": "yes" } });

    expect(wrapper.find(".bar-key").text()).toContain("2 not coming");
    expect(wrapper.findAll('[data-testid^="sheet-row-"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="sheet-roster"]').text()).not.toContain(
      "Jake",
    );
  });

  it("heads the roster with how many are coming", () => {
    const wrapper = mountSheet({
      votes: { "inv-1": "yes", "inv-2": "if_needed" },
    });
    expect(wrapper.find(".grp-h").text()).toContain("Coming");
    expect(wrapper.find(".grp-h .cnt").text()).toBe("2");
  });

  it("gives the answer buttons the same glyphs as the rows", () => {
    const wrapper = mountSheet({ votes: { "inv-1": "yes" } });

    expect(
      wrapper.find('[data-testid="set-yes"]').find(".g").classes(),
    ).toContain("free");
    expect(
      wrapper.find('[data-testid="set-if_needed"]').find(".g").classes(),
    ).toContain("maybe");
    expect(
      wrapper.find('[data-testid="set-none"]').find(".g").classes(),
    ).toContain("no");
  });

  it("lists someone who left a note but did not answer", () => {
    // The reason the feature exists: saying why you cannot come is worth as
    // much as saying you can.
    const wrapper = mountSheet({
      votes: { "inv-1": "yes" },
      notes: { "inv-2": "Away that week" },
    });

    const row = wrapper.find('[data-testid="sheet-row-inv-2"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("NOTE ONLY");
    expect(row.find(".g").classes()).toContain("no");
  });

  it("does not let a note move the day's shape", () => {
    const wrapper = mountSheet({
      votes: { "inv-1": "yes" },
      notes: { "inv-2": "Away that week" },
    });

    // One free, two not coming — the note-only person is still not coming.
    expect(wrapper.find(".bar-key").text()).toContain("1 free");
    expect(wrapper.find(".bar-key").text()).toContain("2 not coming");
    expect(wrapper.find(".grp-h .cnt").text()).toBe("1");
  });

  it("shows a note behind a pip, reachable by hover or by tap", () => {
    const wrapper = mountSheet({
      votes: { "inv-1": "yes" },
      notes: { "inv-1": "Bring dice" },
    });

    const pip = wrapper.find('[data-testid="note-inv-1"]');
    expect(pip.exists()).toBe(true);
    expect(pip.attributes("aria-label")).toBe("Note from Dani");
    expect(wrapper.find('[data-testid="note-inv-2"]').exists()).toBe(false);
  });

  it("offers to add a note, and to edit one that exists", async () => {
    const adding = mountSheet({ votes: { "inv-1": "yes" } });
    expect(adding.find('[data-testid="note-open"]').text()).toContain(
      "Add note",
    );

    const editing = mountSheet({ notes: { "inv-1": "Bring dice" } });
    expect(editing.find('[data-testid="note-open"]').text()).toContain(
      "Edit note",
    );
  });

  it("reveals the field in the button's own space and emits on save", async () => {
    const wrapper = mountSheet({ votes: { "inv-1": "yes" } });

    await wrapper.find('[data-testid="note-open"]').trigger("click");
    expect(wrapper.find('[data-testid="note-open"]').exists()).toBe(false);

    await wrapper
      .find('[data-testid="note-input"] input')
      .setValue("Only after 8pm");
    await wrapper.find('[data-testid="note-save"]').trigger("click");

    expect(wrapper.emitted("note")?.[0]).toEqual(["Only after 8pm"]);
    expect(wrapper.find('[data-testid="note-open"]').exists()).toBe(true);
  });

  it("prefills the editor with the existing note", async () => {
    const wrapper = mountSheet({ notes: { "inv-1": "Bring dice" } });
    await wrapper.find('[data-testid="note-open"]').trigger("click");

    expect(
      (
        wrapper.find('[data-testid="note-input"] input')
          .element as HTMLInputElement
      ).value,
    ).toBe("Bring dice");
  });

  it("offers no note control to someone who has not claimed a name", () => {
    expect(
      mountSheet({ claimedId: null })
        .find('[data-testid="note-open"]')
        .exists(),
    ).toBe(false);
  });
});
