<template>
  <div
    class="door-setup"
    role="dialog"
    :aria-label="title"
    data-testid="door-setup"
    @pointerdown.stop
  >
    <div class="door-setup__head">
      <span>{{ title }}</span>
      <button
        type="button"
        class="door-setup__close"
        aria-label="Close"
        data-testid="door-setup-close"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <div class="door-setup__row">
      <span class="door-setup__label">
        {{ door.code === "fd" ? "Opens" : "Opens into" }}
      </span>
      <div class="door-setup__seg" role="group" aria-label="Opens into">
        <button
          v-for="(name, i) in sides"
          :key="i"
          type="button"
          :aria-pressed="door.setting.into === i"
          :title="name"
          :data-testid="`door-into-${i}`"
          @click="set({ into: i as 0 | 1 })"
        >
          {{ name }}
        </button>
      </div>
    </div>

    <div class="door-setup__row">
      <span class="door-setup__label">Leaves</span>
      <div class="door-setup__seg" role="group" aria-label="Leaves">
        <button
          v-for="opt in LEAVES"
          :key="opt.id"
          type="button"
          :aria-pressed="leaves === opt.id"
          :data-testid="`door-${opt.id}`"
          @click="set(opt.patch)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div v-if="leaves !== 'double'" class="door-setup__row">
      <span class="door-setup__label">
        {{ leaves === "sliding" ? "Slides to" : "Direction" }}
      </span>
      <div class="door-setup__seg" role="group" aria-label="Hinge">
        <button
          v-for="(name, i) in hingeNames"
          :key="i"
          type="button"
          :aria-pressed="door.setting.hinge === i"
          :data-testid="`door-hinge-${i}`"
          @click="set({ hinge: i as 0 | 1 })"
        >
          {{ name }}
        </button>
      </div>
    </div>

    <div class="door-setup__row">
      <span class="door-setup__label">Show it</span>
      <div class="door-setup__seg" role="group" aria-label="Show it">
        <button
          type="button"
          :aria-pressed="!open"
          data-testid="door-show-closed"
          @click="emit('open', false)"
        >
          Closed
        </button>
        <button
          type="button"
          :aria-pressed="open"
          data-testid="door-show-open"
          @click="emit('open', true)"
        >
          Open
        </button>
      </div>
    </div>

    <button
      type="button"
      class="fp-button door-setup__delete"
      data-testid="door-delete"
      @click="emit('remove')"
    >
      Delete door
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { doorShape, type Door } from "../doors";
import type { DoorSetting } from "../types";

const props = defineProps<{
  door: Door;
  /** What lies on side 0 and side 1, e.g. ["Living room", "Bedroom"]. */
  sides: [string, string];
  open: boolean;
}>();

const emit = defineEmits<{
  update: [setting: DoorSetting];
  open: [open: boolean];
  close: [];
  remove: [];
}>();

const title = computed(
  () =>
    `${props.door.code === "fd" ? "Front door" : "Door"} · ${doorShape(props.door).widthCm} cm`,
);
const LEAVES = [
  { id: "single", label: "Single", patch: { double: false, sliding: false } },
  { id: "double", label: "Double", patch: { double: true, sliding: false } },
  { id: "sliding", label: "Sliding", patch: { double: false, sliding: true } },
] as const;

const leaves = computed(() =>
  props.door.setting.sliding
    ? "sliding"
    : props.door.setting.double
      ? "double"
      : "single",
);
// A single door is named by the way it opens, from its hinge to its free edge.
const hingeNames = computed(() => {
  const [a, b] = props.door.dir === "h" ? ["Left", "Right"] : ["Top", "Bottom"];
  return leaves.value === "sliding"
    ? [a, b]
    : [`${a} to ${b.toLowerCase()}`, `${b} to ${a.toLowerCase()}`];
});

function set(patch: Partial<DoorSetting>): void {
  emit("update", { ...props.door.setting, ...patch });
}
</script>

<style scoped lang="scss">
.door-setup {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  width: 250px;
  padding: 10px 12px 12px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
  font-size: 12px;
}
.door-setup__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.door-setup__close {
  padding: 2px 4px;
  border: 0;
  background: none;
  color: var(--fp-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.door-setup__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.door-setup__label {
  color: var(--fp-muted);
}
.door-setup__seg {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.door-setup__seg button {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 12px/1 var(--fp-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.door-setup__delete {
  height: 30px;
  color: var(--fp-warn-ink);
}
.door-setup__seg button[aria-pressed="true"] {
  background: var(--fp-chrome);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  color: var(--fp-ink);
  font-weight: 600;
}
</style>
