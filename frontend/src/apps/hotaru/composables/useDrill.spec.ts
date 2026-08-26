import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { useDrill } from "./useDrill";
import type { QueueItem, Word } from "@/apps/hotaru/types";

function word(id: string): Word {
  return {
    id,
    source: "genki_3",
    reading: "よみ",
    kanji: null,
    romaji: "yomi",
    meaning: "meaning",
    pos: "noun",
    lesson: "L1",
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

function queueOf(...ids: string[]) {
  return ref<QueueItem[]>(ids.map((id) => ({ word: word(id) })));
}

describe("useDrill", () => {
  it("starts on the first card, not revealed", () => {
    const d = useDrill(queueOf("a", "b"));
    expect(d.current.value?.word.id).toBe("a");
    expect(d.revealed.value).toBe(false);
    expect(d.total.value).toBe(2);
    expect(d.progress.value).toBe("1 / 2");
    expect(d.finished.value).toBe(false);
  });

  it("reveal() flips the current card", () => {
    const d = useDrill(queueOf("a"));
    d.reveal();
    expect(d.revealed.value).toBe(true);
  });

  it("next() advances and clears the revealed state", () => {
    const d = useDrill(queueOf("a", "b"));
    d.reveal();
    d.next();
    expect(d.current.value?.word.id).toBe("b");
    expect(d.revealed.value).toBe(false);
    expect(d.progress.value).toBe("2 / 2");
  });

  it("is finished after advancing past the last card", () => {
    const d = useDrill(queueOf("a"));
    expect(d.finished.value).toBe(false);
    d.next();
    expect(d.finished.value).toBe(true);
    expect(d.current.value).toBeNull();
    // next() past the end is a no-op.
    d.next();
    expect(d.index.value).toBe(1);
  });

  it("an empty queue is finished immediately", () => {
    const d = useDrill(queueOf());
    expect(d.finished.value).toBe(true);
    expect(d.current.value).toBeNull();
  });

  it("grade() buffers the grade for the current card and advances", () => {
    const d = useDrill(queueOf("a", "b"));
    d.grade("correct");
    expect(d.pending.value).toEqual([
      { word_id: "a", grade: "correct", replay: false },
    ]);
    expect(d.current.value?.word.id).toBe("b");
    expect(d.revealed.value).toBe(false);
    d.grade("incorrect");
    expect(d.pending.value).toEqual([
      { word_id: "a", grade: "correct", replay: false },
      { word_id: "b", grade: "incorrect", replay: false },
    ]);
    expect(d.finished.value).toBe(true);
  });

  it("grade() marks a replay so the server can withhold promotion", () => {
    const d = useDrill(queueOf("a"));
    d.grade("correct", true);
    expect(d.pending.value).toEqual([
      { word_id: "a", grade: "correct", replay: true },
    ]);
  });

  it("restart() replays the queue from the top without dropping buffered grades", () => {
    const queue = queueOf("a", "b");
    const d = useDrill(queue);
    d.grade("correct");
    d.grade("incorrect");
    expect(d.finished.value).toBe(true);

    // The caller narrows the queue first; restart only resets position.
    queue.value = [queue.value[1]];
    d.restart();
    expect(d.finished.value).toBe(false);
    expect(d.current.value?.word.id).toBe("b");
    expect(d.revealed.value).toBe(false);
    expect(d.pending.value).toHaveLength(2);
  });
});
