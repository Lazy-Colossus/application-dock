<template>
  <q-page class="fp floor-planner-app">
    <div class="fp__top">
      <div class="fp__modes" role="tablist" aria-label="Mode">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          role="tab"
          class="fp__mode"
          :class="{ 'fp__mode--active': mode === m.id }"
          :aria-selected="mode === m.id"
          :data-testid="`mode-${m.id}`"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>
      <div class="fp__spacer" />
      <template v-if="store.apartment">
        <span
          class="fp__chip"
          :class="
            store.apartment.locked ? 'fp__chip--locked' : 'fp__chip--unlocked'
          "
          data-testid="lock-chip"
        >
          {{ store.apartment.locked ? "Plan locked" : "Unlocked" }}
        </span>
        <button
          type="button"
          class="fp-button"
          data-testid="lock-toggle"
          :disabled="store.loading"
          @click="store.apartment.locked ? store.unlock() : store.lock()"
        >
          {{ store.apartment.locked ? "Unlock" : "Lock plan" }}
        </button>
        <button
          type="button"
          class="fp__people"
          aria-label="People sharing this apartment"
          data-testid="members-open"
          @click="membersOpen = true"
        >
          <span
            v-for="member in store.apartment.members"
            :key="member"
            class="fp__avatar"
            :title="member"
          >
            {{ member.charAt(0).toUpperCase() }}
          </span>
        </button>
      </template>
    </div>

    <div
      v-if="store.notice"
      class="fp__notice"
      role="status"
      data-testid="fp-notice"
    >
      <span>{{ store.notice }}</span>
      <button type="button" class="fp-button" @click="store.dismissNotice()">
        OK
      </button>
    </div>
    <p
      v-if="store.error && !membersOpen"
      class="fp__error"
      data-testid="fp-error"
    >
      {{ store.error }}
    </p>

    <div class="fp__body">
      <aside class="fp__panel fp__panel--left" data-testid="fp-left" />
      <section class="fp__plan" data-testid="fp-plan" />
      <aside class="fp__panel fp__panel--right" data-testid="fp-right" />
    </div>

    <div class="fp__status">
      <span class="fp-mono">1 square = 20 cm</span>
    </div>

    <q-dialog v-model="membersOpen">
      <MembersDialog
        v-if="membersOpen"
        @close="membersOpen = false"
        @left="membersOpen = false"
      />
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import MembersDialog from "../components/MembersDialog.vue";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import type { Mode } from "../types";
import "../css/floor-planner.sass";

const modes: { id: Mode; label: string }[] = [
  { id: "draw", label: "Draw plan" },
  { id: "furniture", label: "Furniture" },
  { id: "arrange", label: "Arrange" },
];

const store = useFloorPlanStore();
const mode = ref<Mode>("draw");
const membersOpen = ref(false);

onMounted(() => store.fetchApartment());
</script>

<style scoped lang="scss">
.fp {
  display: flex;
  flex-direction: column;
  background: var(--fp-ground);
}
.fp__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 16px;
  box-sizing: border-box;
  background: var(--fp-chrome);
  border-bottom: 1px solid var(--fp-line);
}
.fp__modes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.fp__mode {
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 13px/1 var(--fp-sans);
  cursor: pointer;
}
.fp__mode--active {
  background: var(--fp-accent);
  color: #ffffff;
  font-weight: 600;
}
.fp__spacer {
  flex: 1;
}
.fp__chip {
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
}
.fp__chip--locked {
  background: var(--fp-locked-bg);
  color: var(--fp-locked-ink);
}
.fp__chip--unlocked {
  background: var(--fp-unlocked-bg);
  color: var(--fp-unlocked-ink);
}
.fp__people {
  display: flex;
  min-height: 44px;
  align-items: center;
  padding: 0 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.fp__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 2px solid var(--fp-chrome);
  border-radius: 50%;
  background: var(--fp-accent);
  color: #ffffff;
  font: 600 13px/1 var(--fp-sans);
}
.fp__avatar + .fp__avatar {
  margin-left: -6px;
  background: #0f766e;
}
.fp__notice,
.fp__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
  padding: 8px 16px;
  font-size: 13px;
}
.fp__notice {
  background: #e8eefc;
  color: #1e3a8a;
}
.fp__error {
  background: var(--fp-warn-bg);
  color: var(--fp-warn-ink);
}
.fp__body {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
}
.fp__panel {
  flex: 0 1 252px;
  min-width: 220px;
  padding: 16px;
  box-sizing: border-box;
  background: var(--fp-panel);
}
.fp__panel--left {
  border-right: 1px solid var(--fp-line);
}
.fp__panel--right {
  flex-basis: 268px;
  border-left: 1px solid var(--fp-line);
}
.fp__plan {
  flex: 999 1 560px;
  min-width: 0;
  overflow: auto;
}
.fp__status {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 40px;
  padding: 6px 16px;
  box-sizing: border-box;
  background: var(--fp-chrome);
  border-top: 1px solid var(--fp-line);
  font-size: 12px;
  color: var(--fp-ink);
}
</style>
