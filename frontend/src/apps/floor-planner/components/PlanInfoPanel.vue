<template>
  <div class="plan-info" data-testid="plan-info">
    <section class="plan-info__card">
      <h3 class="plan-info__heading">Scale</h3>
      <div class="fp-mono plan-info__scale">1 square = 20 cm</div>
      <div class="plan-info__bar" aria-hidden="true">
        <span
          v-for="i in 5"
          :key="i"
          :class="{ 'plan-info__bar--dark': i % 2 === 1 }"
        />
      </div>
      <div class="fp-mono plan-info__bar-labels" aria-hidden="true">
        <span>0</span><span>1 m</span>
      </div>
      <p class="plan-info__note">
        Every 5 squares is 1 m, marked with a darker grid line.
      </p>
    </section>

    <section>
      <h3 class="plan-info__heading">Plan size</h3>
      <div class="fp-mono plan-info__size" data-testid="plan-size">
        {{ metres(plan.cols) }} × {{ metres(plan.rows) }} m
      </div>
      <div class="plan-info__muted">
        {{ plan.cols }} × {{ plan.rows }} squares
      </div>
      <div class="plan-info__inputs">
        <label>
          Width (m)
          <input
            v-model.number="width"
            type="number"
            min="1"
            max="30"
            step="0.2"
            :disabled="locked"
            data-testid="resize-width"
          />
        </label>
        <label>
          Depth (m)
          <input
            v-model.number="depth"
            type="number"
            min="1"
            max="30"
            step="0.2"
            :disabled="locked"
            data-testid="resize-depth"
          />
        </label>
      </div>
      <button
        type="button"
        class="fp-button"
        :disabled="locked || !valid"
        data-testid="resize"
        @click="apply"
      >
        Resize
      </button>
      <p v-if="!valid" class="plan-info__muted">Each side can be 1–30 m.</p>
    </section>

    <section>
      <h3 class="plan-info__heading">Room labels</h3>
      <p v-if="plan.labels.length === 0" class="plan-info__muted">
        Pick Room label and click the plan to add one.
      </p>
      <div
        v-for="l in plan.labels"
        :key="l.id"
        class="plan-info__label"
        :data-testid="`label-row-${l.id}`"
      >
        <span>{{ l.text }}</span>
        <span class="plan-info__label-actions">
          <button
            type="button"
            class="plan-info__link"
            :disabled="locked"
            @click="emit('rename', l.id)"
          >
            Rename
          </button>
          <button
            type="button"
            class="plan-info__link"
            :disabled="locked"
            :data-testid="`label-delete-${l.id}`"
            @click="emit('remove', l.id)"
          >
            Delete
          </button>
        </span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { labelsOutside, metres, squaresFor, type PlanGrid } from "../grid";

const props = defineProps<{ plan: PlanGrid; locked: boolean }>();

const emit = defineEmits<{
  resize: [cols: number, rows: number];
  rename: [id: string];
  remove: [id: string];
}>();

const width = ref(0);
const depth = ref(0);

watch(
  () => [props.plan.cols, props.plan.rows],
  ([cols, rows]) => {
    width.value = Number(metres(cols));
    depth.value = Number(metres(rows));
  },
  { immediate: true },
);

const inRange = (m: number) => Number.isFinite(m) && m >= 1 && m <= 30;
const valid = computed(() => inRange(width.value) && inRange(depth.value));

function apply(): void {
  const cols = squaresFor(width.value);
  const rows = squaresFor(depth.value);
  const lost = labelsOutside(props.plan, cols, rows);
  if (
    lost > 0 &&
    !window.confirm(
      `Shrinking removes ${lost} label${lost === 1 ? "" : "s"} outside the new size.`,
    )
  ) {
    return;
  }
  emit("resize", cols, rows);
}
</script>

<style scoped lang="scss">
.plan-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.plan-info section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plan-info__card {
  padding: 14px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
}
.plan-info__heading {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.plan-info__scale {
  font-size: 18px;
}
.plan-info__bar {
  display: flex;
  width: 80px;
  height: 8px;
  border: 1px solid var(--fp-ink);
}
.plan-info__bar span {
  flex: 1;
}
.plan-info__bar .plan-info__bar--dark {
  background: var(--fp-ink);
}
.plan-info__bar-labels {
  display: flex;
  justify-content: space-between;
  width: 84px;
  font-size: 11px;
  color: #3d3b36;
}
.plan-info__note,
.plan-info__muted {
  margin: 0;
  font-size: 13px;
  color: var(--fp-muted);
}
.plan-info__size {
  font-size: 15px;
}
.plan-info__inputs {
  display: flex;
  gap: 8px;
}
.plan-info__inputs label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #4a4843;
}
.plan-info__inputs input {
  width: 100%;
  height: 34px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font: 500 14px var(--fp-mono);
}
.plan-info__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  border-bottom: 1px solid #e6e3dc;
  font-size: 13px;
}
.plan-info__label-actions {
  display: flex;
  gap: 4px;
}
.plan-info__link {
  min-height: 32px;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: var(--fp-accent);
  font: 500 12px var(--fp-sans);
  cursor: pointer;
  &:disabled {
    color: var(--fp-muted);
    cursor: default;
  }
}
</style>
