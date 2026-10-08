<template>
  <form class="piece-form" data-testid="piece-form" @submit.prevent="save">
    <h3 class="piece-form__heading">
      {{ piece ? "Edit piece" : "New piece" }}
    </h3>

    <label class="piece-form__field">
      Name
      <input
        v-model="draft.name"
        maxlength="40"
        placeholder="e.g. Sofa"
        data-testid="piece-name"
      />
    </label>

    <div class="piece-form__field">
      Shape
      <div class="piece-form__shapes" role="group" aria-label="Shape">
        <button
          v-for="s in SHAPES"
          :key="s.id"
          type="button"
          :class="{ 'piece-form__shape--on': draft.shape === s.id }"
          :aria-pressed="draft.shape === s.id"
          :data-testid="`shape-${s.id}`"
          @click="setShape(s.id)"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <div v-if="draft.shape === 'round'" class="piece-form__sizes">
      <label class="piece-form__field">
        Diameter (cm)
        <input
          v-model.number="draft.width_cm"
          type="number"
          min="1"
          max="1000"
          data-testid="piece-diameter"
          @input="draft.depth_cm = draft.width_cm"
        />
      </label>
    </div>
    <div v-else-if="draft.shape !== 'custom'" class="piece-form__sizes">
      <label class="piece-form__field">
        Width (cm)
        <input
          v-model.number="draft.width_cm"
          type="number"
          min="1"
          max="1000"
          data-testid="piece-width"
        />
      </label>
      <label class="piece-form__field">
        Depth (cm)
        <input
          v-model.number="draft.depth_cm"
          type="number"
          min="1"
          max="1000"
          data-testid="piece-depth"
        />
      </label>
    </div>
    <CustomShapeEditor v-else v-model="mask" />

    <div class="piece-form__field">
      Colour
      <div class="piece-form__colours">
        <button
          v-for="c in COLOURS"
          :key="c.id"
          type="button"
          class="piece-form__colour"
          :class="{ 'piece-form__colour--on': draft.colour === c.id }"
          :style="{ background: c.hex }"
          :aria-label="c.name"
          :aria-pressed="draft.colour === c.id"
          :title="c.name"
          :data-testid="`colour-${c.id}`"
          @click="draft.colour = c.id"
        />
      </div>
    </div>

    <label class="piece-form__field">
      Note
      <textarea
        v-model="draft.note"
        maxlength="200"
        rows="2"
        placeholder="Optional, e.g. IKEA Kivik"
        data-testid="piece-note"
      />
    </label>

    <div class="piece-form__preview" data-testid="piece-preview">
      <FurnitureShape
        v-if="drawable"
        :piece="sized"
        :scale="PLAN_SCALE"
        :max-px="PREVIEW_PX"
      />
      <span class="fp-mono piece-form__size">
        {{ sizeLabel(sized) }}
        <template v-if="shrunk"> · shown at {{ shrunk }} %</template>
      </span>
    </div>

    <p v-if="problem" class="piece-form__problem" data-testid="piece-problem">
      {{ problem }}
    </p>

    <div class="piece-form__actions">
      <button
        v-if="piece"
        type="button"
        class="fp-button piece-form__delete"
        data-testid="piece-delete"
        @click="remove"
      >
        Delete
      </button>
      <span class="piece-form__spacer" />
      <button type="button" class="fp-button" @click="emit('cancel')">
        Cancel
      </button>
      <button
        type="submit"
        class="fp-button fp-button--primary"
        :disabled="problem !== null"
        data-testid="piece-save"
      >
        Save
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import CustomShapeEditor from "./CustomShapeEditor.vue";
import FurnitureShape from "./FurnitureShape.vue";
import { maskSize } from "../customShape";
import {
  COLOURS,
  SHAPES,
  draftProblem,
  fitScale,
  sizeLabel,
  type PieceDraft,
} from "../furniture";
import { PX_PER_CM } from "../grid";
import type { Furniture, Shape } from "../types";

const PLAN_SCALE = PX_PER_CM;
const PREVIEW_PX = 228;

const props = defineProps<{ piece: Furniture | null; placedIn: number }>();
const emit = defineEmits<{
  save: [draft: PieceDraft];
  remove: [];
  cancel: [];
}>();

const draft = reactive<PieceDraft>(
  props.piece
    ? {
        name: props.piece.name,
        colour: props.piece.colour,
        note: props.piece.note,
        shape: props.piece.shape,
        width_cm: props.piece.width_cm,
        depth_cm: props.piece.depth_cm,
        cells: props.piece.cells,
      }
    : {
        name: "",
        colour: "grey",
        note: "",
        shape: "rectangle",
        width_cm: 100,
        depth_cm: 60,
        cells: null,
      },
);
const mask = ref<string[]>(props.piece?.cells ?? []);

watch(mask, (m) => {
  draft.cells = m;
  const { widthCm, depthCm } = maskSize(m);
  draft.width_cm = widthCm;
  draft.depth_cm = depthCm;
});

function setShape(shape: Shape): void {
  const wasCustom = draft.shape === "custom";
  draft.shape = shape;
  if (shape === "custom") {
    draft.cells = mask.value;
    const { widthCm, depthCm } = maskSize(mask.value);
    draft.width_cm = widthCm;
    draft.depth_cm = depthCm;
    return;
  }
  draft.cells = null;
  if (wasCustom && draft.width_cm === 0) {
    draft.width_cm = 100;
    draft.depth_cm = 60;
  }
  if (shape === "round") draft.depth_cm = draft.width_cm;
}

/** The draft as the preview and the size label see it. */
const sized = computed(() => ({ ...draft }));
const problem = computed(() => draftProblem(draft));
/** The shape can be drawn even while the name is still blank. */
const drawable = computed(
  () => draftProblem({ ...draft, name: "x", note: "" }) === null,
);
const shrunk = computed(() => {
  const used = fitScale(draft, PLAN_SCALE, PREVIEW_PX);
  return used < PLAN_SCALE ? Math.round((used / PLAN_SCALE) * 100) : 0;
});

function save(): void {
  if (problem.value) return;
  emit("save", {
    ...draft,
    name: draft.name.trim(),
    note: draft.note.trim(),
    cells: draft.shape === "custom" ? draft.cells : null,
  });
}

function remove(): void {
  const name = props.piece?.name ?? "this piece";
  const where = props.placedIn > 0 ? " It's removed from every layout." : "";
  if (window.confirm(`Delete ${name}?${where}`)) emit("remove");
}
</script>

<style scoped lang="scss">
.piece-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.piece-form__heading {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.piece-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #4a4843;
}
.piece-form__field input,
.piece-form__field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font: 400 14px var(--fp-sans);
  resize: vertical;
}
.piece-form__field input[type="number"] {
  font-family: var(--fp-mono);
}
.piece-form__sizes {
  display: flex;
  gap: 8px;
}
.piece-form__sizes .piece-form__field {
  flex: 1;
}
.piece-form__shapes {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.piece-form__shapes button {
  flex: 1 0 auto;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 12px/1 var(--fp-sans);
  cursor: pointer;
}
.piece-form__shapes .piece-form__shape--on {
  background: var(--fp-chrome);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  color: var(--fp-ink);
  font-weight: 600;
}
.piece-form__colours {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.piece-form__colour {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  cursor: pointer;
}
.piece-form__colour--on {
  outline: 2px solid var(--fp-accent);
  outline-offset: 2px;
}
.piece-form__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background-color: #fbfbf9;
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.07) 1px, transparent 1px);
  background-size: 16px 16px;
}
.piece-form__size {
  font-size: 13px;
}
.piece-form__problem {
  margin: 0;
  font-size: 13px;
  color: var(--fp-warn-ink);
}
.piece-form__actions {
  display: flex;
  gap: 8px;
}
.piece-form__spacer {
  flex: 1;
}
.piece-form__delete {
  color: var(--fp-warn-ink);
}
</style>
