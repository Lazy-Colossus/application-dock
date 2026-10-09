<template>
  <form class="piece-form" data-testid="piece-form" @submit.prevent="save">
    <h3 class="piece-form__heading">
      {{ piece ? "Edit piece" : "New piece" }}
    </h3>

    <label class="piece-form__field">
      Name
      <input
        v-model="name"
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
          v-model.number="width"
          type="number"
          min="1"
          max="1000"
          data-testid="piece-diameter"
        />
      </label>
    </div>
    <div v-else-if="draft.shape !== 'custom'" class="piece-form__sizes">
      <label class="piece-form__field">
        Width (cm)
        <input
          v-model.number="width"
          type="number"
          min="1"
          max="1000"
          data-testid="piece-width"
        />
      </label>
      <label class="piece-form__field">
        Depth (cm)
        <input
          v-model.number="depth"
          type="number"
          min="1"
          max="1000"
          data-testid="piece-depth"
        />
      </label>
    </div>
    <p v-else class="piece-form__drawn" data-testid="piece-drawn">
      <span class="fp-mono">{{ drawnSize }}</span>
      Paint on the grid in the middle. Each square is 10 cm.
    </p>

    <div v-if="draft.shape !== 'custom'" class="piece-form__field">
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
          @click="set({ colour: c.id })"
        />
      </div>
    </div>

    <label class="piece-form__field">
      Note
      <textarea
        v-model="note"
        maxlength="200"
        rows="2"
        placeholder="Optional, e.g. IKEA Kivik"
        data-testid="piece-note"
      />
    </label>

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
      <button
        v-if="piece"
        type="button"
        class="fp-button"
        data-testid="piece-copy"
        @click="emit('copy')"
      >
        Copy
      </button>
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
import { computed } from "vue";
import { canDraw, toDrawn } from "../customShape";
import {
  COLOURS,
  SHAPES,
  draftProblem,
  sizeLabel,
  type PieceDraft,
} from "../furniture";
import type { Furniture, Shape } from "../types";

const props = defineProps<{
  /** The saved piece being edited; null for a new one. */
  piece: Furniture | null;
  placedIn: number;
  draft: PieceDraft;
}>();
const emit = defineEmits<{
  "update:draft": [draft: PieceDraft];
  save: [draft: PieceDraft];
  remove: [];
  cancel: [];
  copy: [];
}>();

function set(patch: Partial<PieceDraft>): void {
  emit("update:draft", { ...props.draft, ...patch });
}

const name = computed({
  get: () => props.draft.name,
  set: (name: string) => set({ name }),
});
const note = computed({
  get: () => props.draft.note,
  set: (note: string) => set({ note }),
});
const width = computed({
  get: () => props.draft.width_cm,
  set: (width_cm: number) =>
    set(
      props.draft.shape === "round"
        ? { width_cm, depth_cm: width_cm }
        : { width_cm },
    ),
});
const depth = computed({
  get: () => props.draft.depth_cm,
  set: (depth_cm: number) => set({ depth_cm }),
});

const drawnSize = computed(() =>
  props.draft.cells?.length ? sizeLabel(props.draft) : "Nothing painted yet",
);

/** Custom keeps what was typed, as squares; leaving it keeps the size the squares covered. */
function setShape(shape: Shape): void {
  const d = props.draft;
  if (shape === d.shape) return;
  if (shape === "custom") {
    emit("update:draft", canDraw(d) ? toDrawn(d) : { ...d, shape, cells: [] });
    return;
  }
  const size =
    d.width_cm > 0
      ? { width_cm: d.width_cm, depth_cm: d.depth_cm }
      : { width_cm: 100, depth_cm: 60 };
  if (shape === "round") size.depth_cm = size.width_cm;
  set({ shape, cells: null, ...size });
}

const problem = computed(() => draftProblem(props.draft));

function save(): void {
  if (problem.value) return;
  const d = props.draft;
  emit("save", {
    ...d,
    name: d.name.trim(),
    note: d.note.trim(),
    cells: d.shape === "custom" ? d.cells : null,
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
.piece-form__drawn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}
.piece-form__drawn .fp-mono {
  font-size: 14px;
  color: var(--fp-ink);
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
