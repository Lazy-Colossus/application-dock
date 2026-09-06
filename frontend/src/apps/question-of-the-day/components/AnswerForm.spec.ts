import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AnswerForm from "./AnswerForm.vue";
import type { Answer, Question } from "@/apps/question-of-the-day/types";

const TEXT_Q: Question = {
  id: "q-text",
  text: "Best part of your day?",
  type: "text",
  scale: null,
};

const SCALE_Q: Question = {
  id: "q-scale",
  text: "Energy?",
  type: "scale",
  scale: { min: 1, max: 5, min_label: "Empty", max_label: "Charged" },
};

// q-input/q-btn/q-slider aren't installed in tests; stub what the form uses,
// exposing the value binding, click, and disabled state the assertions need.
const STUBS = {
  "q-input": {
    template:
      '<div><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></div>',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  "q-slider": {
    template:
      '<input type="range" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
    props: ["modelValue", "min", "max"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "disable", "loading"],
    emits: ["click"],
  },
};

function mountForm(props: {
  question: Question;
  initial?: Answer | null;
  loading?: boolean;
  error?: string | null;
}) {
  return mount(AnswerForm, {
    props: {
      initial: null,
      loading: false,
      error: null,
      ...props,
    },
    global: { stubs: STUBS },
  });
}

describe("AnswerForm", () => {
  it("renders a textarea for a text question, no slider", () => {
    const wrapper = mountForm({ question: TEXT_Q });
    expect(wrapper.find('[data-testid="answer-textarea"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="answer-slider"]').exists()).toBe(false);
  });

  it("renders a bounded slider with end labels for a scale question", () => {
    const wrapper = mountForm({ question: SCALE_Q });
    expect(wrapper.find('[data-testid="answer-slider"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="answer-textarea"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="scale-min-label"]').text()).toBe(
      "Empty",
    );
    expect(wrapper.find('[data-testid="scale-max-label"]').text()).toBe(
      "Charged",
    );
  });

  it("disables submit until non-empty text is entered", async () => {
    const wrapper = mountForm({ question: TEXT_Q });
    expect(
      wrapper.find('[data-testid="submit-answer"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper
      .find('[data-testid="answer-textarea"] textarea')
      .setValue("hello");
    expect(
      wrapper.find('[data-testid="submit-answer"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("emits submit with the trimmed text payload", async () => {
    const wrapper = mountForm({ question: TEXT_Q });
    await wrapper
      .find('[data-testid="answer-textarea"] textarea')
      .setValue("  a great day  ");
    await wrapper.find('[data-testid="submit-answer"]').trigger("click");

    expect(wrapper.emitted("submit")?.[0]).toEqual([{ text: "a great day" }]);
  });

  it("disables submit until a scale value is chosen, then emits the rating", async () => {
    const wrapper = mountForm({ question: SCALE_Q });
    expect(
      wrapper.find('[data-testid="submit-answer"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper.find('[data-testid="answer-slider"]').setValue(4);
    await wrapper.find('[data-testid="submit-answer"]').trigger("click");

    expect(wrapper.emitted("submit")?.[0]).toEqual([{ rating: 4 }]);
  });

  it("shows the error message and keeps the input for retry", async () => {
    const wrapper = mountForm({
      question: TEXT_Q,
      error: "an answer must not be empty",
    });
    expect(wrapper.find('[data-testid="form-error"]').text()).toContain(
      "must not be empty",
    );
  });

  it("pre-fills from an existing text answer and labels submit as an edit", () => {
    const initial: Answer = {
      text: "saved answer",
      rating: null,
      created_at: "2026-09-06T10:00:00Z",
      updated_at: "2026-09-06T10:00:00Z",
    };
    const wrapper = mountForm({ question: TEXT_Q, initial });
    expect(
      (
        wrapper.find('[data-testid="answer-textarea"] textarea')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe("saved answer");
    expect(wrapper.find('[data-testid="submit-answer"]').text()).toBe(
      "Save changes",
    );
  });

  it("pre-fills from an existing scale answer", () => {
    const initial: Answer = {
      text: null,
      rating: 3,
      created_at: "2026-09-06T10:00:00Z",
      updated_at: "2026-09-06T10:00:00Z",
    };
    const wrapper = mountForm({ question: SCALE_Q, initial });
    expect(
      (
        wrapper.find('[data-testid="answer-slider"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("3");
  });
});
