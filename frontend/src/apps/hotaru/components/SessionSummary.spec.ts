import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SessionSummary from "./SessionSummary.vue";
import type { DrillGrade, SessionResult, Word } from "@/apps/hotaru/types";

// `$attrs` carries the parent's @click through as a native listener, so the stub
// must NOT re-emit one of its own or every click would register twice.
const STUBS = {
  "q-btn": {
    props: ["label"],
    template: `<button v-bind="$attrs">{{ label }}</button>`,
  },
};

function word(id: string, kanji: string | null, reading: string): Word {
  return {
    id,
    source: "genki_3",
    reading,
    kanji,
    romaji: "romaji",
    meaning: `${id} meaning`,
    pos: "noun",
    lesson: "L2",
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

function result(id: string, grade: DrillGrade, kanji: string | null = "大学") {
  return { word: word(id, kanji, "だいがく"), grade };
}

// One Correct, two Close, one Incorrect.
const RESULTS: SessionResult[] = [
  result("a", "correct"),
  result("b", "close"),
  result("c", "incorrect"),
  result("d", "close"),
];

function mountSummary(selected: DrillGrade[] = [], results = RESULTS) {
  return mount(SessionSummary, {
    props: { results, selected },
    global: { stubs: STUBS },
  });
}

describe("SessionSummary", () => {
  it("counts the session in the ring centre and the tallies", () => {
    const w = mountSummary();
    expect(w.find('[data-testid="summary-practised"]').text()).toBe("4");
    expect(w.find('[data-testid="tally-correct"]').text()).toContain("1");
    expect(w.find('[data-testid="tally-close"]').text()).toContain("2");
    expect(w.find('[data-testid="tally-incorrect"]').text()).toContain("1");
  });

  it("draws one ring segment per grade actually earned", () => {
    expect(mountSummary().findAll('[data-testid^="ring-seg-"]').length).toBe(3);
    const perfect = mountSummary([], [result("a", "correct")]);
    expect(perfect.findAll('[data-testid^="ring-seg-"]').length).toBe(1);
  });

  it("lists every word met, in the order it came up", () => {
    const rows = mountSummary().findAll('[data-testid^="summary-row-"]');
    expect(rows.length).toBe(4);
    expect(rows.map((r) => r.attributes("data-testid"))).toEqual([
      "summary-row-a",
      "summary-row-b",
      "summary-row-c",
      "summary-row-d",
    ]);
  });

  it("shows each result as a word, not only a colour", () => {
    const w = mountSummary();
    expect(w.find('[data-testid="summary-grade-a"]').text()).toBe("Correct");
    expect(w.find('[data-testid="summary-grade-b"]').text()).toBe("Close");
    expect(w.find('[data-testid="summary-grade-c"]').text()).toBe("Incorrect");
  });

  it("colours a kana-only headword differently from a kanji one", () => {
    const w = mountSummary(
      [],
      [result("a", "correct", null), result("b", "correct", "大学")],
    );
    const rows = w.findAll(".sum__jp");
    expect(rows[0].classes()).toContain("sum__jp--kana");
    expect(rows[1].classes()).not.toContain("sum__jp--kana");
  });

  it("filters the list to the selected grades", () => {
    const w = mountSummary(["close"]);
    const rows = w.findAll('[data-testid^="summary-row-"]');
    expect(rows.map((r) => r.attributes("data-testid"))).toEqual([
      "summary-row-b",
      "summary-row-d",
    ]);
  });

  it("treats a multi-grade selection as a union, not an intersection", () => {
    const w = mountSummary(["close", "incorrect"]);
    expect(w.findAll('[data-testid^="summary-row-"]').length).toBe(3);
    expect(w.find('[data-testid="summary-filter-label"]').text()).toBe(
      "This session · close · incorrect",
    );
  });

  it("dims the ring segments that are not selected", () => {
    const w = mountSummary(["incorrect"]);
    expect(
      w.find('[data-testid="ring-seg-incorrect"]').classes(),
    ).not.toContain("sum__seg--dim");
    expect(w.find('[data-testid="ring-seg-correct"]').classes()).toContain(
      "sum__seg--dim",
    );
    // Nothing selected → every segment burns full.
    expect(
      mountSummary().find('[data-testid="ring-seg-correct"]').classes(),
    ).not.toContain("sum__seg--dim");
  });

  it("marks the selected tallies as pressed for assistive tech", () => {
    const w = mountSummary(["close"]);
    expect(
      w.find('[data-testid="tally-close"]').attributes("aria-pressed"),
    ).toBe("true");
    expect(
      w.find('[data-testid="tally-correct"]').attributes("aria-pressed"),
    ).toBe("false");
  });

  it("names no count while unfiltered, so it cannot read as a subset", () => {
    const w = mountSummary();
    expect(w.find('[data-testid="summary-replay"]').text()).toBe(
      "Practice Again ✦",
    );
    expect(w.find('[data-testid="summary-filter-label"]').text()).toBe(
      "This session",
    );
    // Nothing to clear when nothing is picked.
    expect(w.find('[data-testid="summary-clear"]').exists()).toBe(false);
  });

  it("re-scopes the replay label to exactly what is listed", () => {
    expect(
      mountSummary(["close"]).find('[data-testid="summary-replay"]').text(),
    ).toBe("Practice these 2 again ✦");
    expect(
      mountSummary(["close", "incorrect"])
        .find('[data-testid="summary-replay"]')
        .text(),
    ).toBe("Practice these 3 again ✦");
  });

  it("hides the replay button when the selection is empty", () => {
    const w = mountSummary(["incorrect"], [result("a", "correct")]);
    expect(w.findAll('[data-testid^="summary-row-"]').length).toBe(0);
    expect(w.find('[data-testid="summary-replay"]').exists()).toBe(false);
    // Close is always available — the session can still end.
    expect(w.find('[data-testid="drill-done-btn"]').exists()).toBe(true);
  });

  it("emits the grade when a tally is tapped", async () => {
    const w = mountSummary();
    await w.find('[data-testid="tally-incorrect"]').trigger("click");
    expect(w.emitted("toggle")).toEqual([["incorrect"]]);
  });

  it("emits clear, replay and close from their controls", async () => {
    const w = mountSummary(["close"]);
    await w.find('[data-testid="summary-clear"]').trigger("click");
    await w.find('[data-testid="summary-replay"]').trigger("click");
    await w.find('[data-testid="drill-done-btn"]').trigger("click");
    expect(w.emitted("clear")).toHaveLength(1);
    expect(w.emitted("replay")).toHaveLength(1);
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("survives an empty session without drawing a ring", () => {
    const w = mountSummary([], []);
    expect(w.find('[data-testid="summary-practised"]').text()).toBe("0");
    expect(w.findAll('[data-testid^="ring-seg-"]').length).toBe(0);
    expect(w.find('[data-testid="summary-replay"]').exists()).toBe(false);
  });

  it("says 'word' for a single-card session", () => {
    const w = mountSummary([], [result("a", "correct")]);
    expect(w.find(".sum__unit").text()).toBe("word");
    expect(mountSummary().find(".sum__unit").text()).toBe("words");
  });
});
