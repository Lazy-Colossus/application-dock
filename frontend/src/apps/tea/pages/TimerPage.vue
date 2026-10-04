<template>
  <q-page class="timer">
    <p v-if="timer.notice" class="timer__notice" data-testid="timer-notice">{{ timer.notice }}</p>
    <p v-if="timer.error && sheet !== 'finish'" class="timer__notice" data-testid="timer-error">
      {{ timer.error }}
    </p>

    <p v-if="sessions.error && !timer.live" class="timer__notice" data-testid="timer-sessions-error">
      {{ sessions.error }}
    </p>

    <section v-if="picking" class="timer__picker" data-testid="timer-picker">
      <p class="timer__picker-title">Open brews</p>
      <RecoveryCard
        v-for="session in sessions.inProgress"
        :key="session.id"
        :session="session"
        :tea-name="teaName(session.tea_id)"
        :vessel-name="vesselName(session.teaware_id)"
        @resume="onResume(session)"
        @discard="sessions.discard(session.id)"
      />
      <button class="timer__new-brew" data-testid="timer-new-brew" @click="newBrew = true">
        + New brew
      </button>
    </section>

    <template v-else>
      <header class="timer__bar">
        <div class="timer__what">
          <button class="timer__tea" data-testid="timer-tea" @click="open('tea')">
            <template v-if="timer.live?.tea">
              {{ timer.live.tea.name }}
              <small>change tea</small>
            </template>
            <template v-else>
              + pick a tea
              <small>just a timer</small>
            </template>
          </button>
          <button class="timer__tea timer__vessel" data-testid="timer-vessel" @click="open('vessel')">
            <template v-if="timer.live?.teaware">
              in {{ timer.live.teaware.name
              }}<template v-if="timer.live.teaware.volume_ml"> · {{ timer.live.teaware.volume_ml }} ml</template>
              <small>change vessel</small>
            </template>
            <template v-else>
              + vessel
              <small>what you're brewing in</small>
            </template>
          </button>
          <button
            v-if="timer.live?.tea"
            class="timer__tea timer__vessel"
            data-testid="timer-leaf"
            @click="open('leaf')"
          >
            <template v-if="timer.live.leafGrams !== null">
              {{ timer.live.leafGrams }} g leaf
              <small>change grams</small>
            </template>
            <template v-else>
              + leaf
              <small>grams used in this brew</small>
            </template>
          </button>
        </div>
        <span
          v-if="timer.unsynced"
          class="timer__unsynced"
          data-testid="timer-unsynced"
          title="Not synced yet — it will retry"
        ></span>
        <div class="timer__tools">
          <button
            v-if="timer.live?.tea"
            class="timer__tool timer__chaxi"
            data-testid="timer-chaxi"
            @click="router.push({ name: 'tea-timer-chaxi' })"
          >
            Cha Xi<span
              v-if="hasLiveChaXi"
              class="timer__chaxi-dot"
              data-testid="timer-chaxi-dot"
            ></span>
          </button>
          <button
            class="timer__tool"
            data-testid="timer-chime"
            :aria-label="timer.chimeOn ? 'Turn chime off' : 'Turn chime on'"
            @click="timer.toggleChime()"
          >
            {{ timer.chimeOn ? "🔔" : "🔕" }}
          </button>
          <button class="timer__tool" data-testid="timer-menu" aria-label="More" @click="menu = !menu">
            ⋯
          </button>
        </div>
        <div v-if="menu" class="timer__menu">
          <button
            v-if="timer.live?.tea"
            data-testid="timer-switch"
            :disabled="timer.running"
            @click="onSwitch"
          >
            Switch session
          </button>
          <button
            data-testid="timer-redo"
            :disabled="timer.running || timer.brewed.length === 0"
            @click="onRedo"
          >
            Redo last infusion
          </button>
          <button data-testid="timer-discard" :disabled="!timer.live" @click="onDiscard">
            Discard session
          </button>
        </div>
      </header>

      <TeaCup
        :elapsed="elapsed"
        :target="target"
        :color="timer.liquor"
        :running="timer.running"
        @edit-target="open('target')"
      />

      <p class="timer__elapsed" data-testid="timer-elapsed">{{ formatElapsed(elapsed) }}</p>

      <div class="timer__nudge">
        <button data-testid="timer-minus" @click="timer.nudge(-STEP_SECONDS)">−{{ STEP_SECONDS }}s</button>
        <button data-testid="timer-plus" @click="timer.nudge(STEP_SECONDS)">+{{ STEP_SECONDS }}s</button>
      </div>

      <div class="timer__chips">
        <template v-for="infusion in timer.live?.infusions ?? []" :key="infusion.number">
          <span
            v-if="infusion.actual_seconds === null"
            class="timer__chip timer__chip--now"
            :data-testid="`timer-chip-${infusion.number}`"
          >
            {{ infusion.number }}
          </span>
          <button
            v-else
            class="timer__chip"
            :data-testid="`timer-chip-${infusion.number}`"
            :aria-label="`Edit infusion ${infusion.number} time`"
            @click="onEditSteep(infusion.number)"
          >
            {{ infusion.number }} · {{ infusion.actual_seconds }}s
          </button>
        </template>
      </div>

      <p class="timer__source" data-testid="timer-source">
        {{ timer.live?.curve.source_label ?? "generic gongfu" }}
      </p>

      <button
        class="timer__finish"
        data-testid="timer-finish"
        :disabled="timer.running"
        @click="onFinishTap"
      >
        {{ timer.live?.tea ? "Finish" : "End" }}
      </button>

      <button
        :class="['timer__band', { 'timer__band--running': timer.running }]"
        data-testid="timer-band"
        @click="onBand"
      >
        {{ timer.running ? "tap to stop · pour" : "tap to start" }}
      </button>
    </template>

    <div v-if="sheet" class="timer__scrim" data-testid="timer-scrim" @click="sheet = null"></div>

    <PickTeaSheet
      v-if="sheet === 'tea'"
      :teas="cabinet.teas"
      :current-tea-id="timer.live?.tea?.id ?? null"
      :leaf-grams="timer.live?.leafGrams ?? null"
      :water-temp-c="timer.live?.waterTempC ?? null"
      @pick="onPick"
      @update-grams="timer.setLeafGrams($event)"
      @update-temp="timer.setWaterTemp($event)"
      @close="sheet = null"
    />

    <PickVesselSheet
      v-if="sheet === 'vessel'"
      :items="teaware.items"
      :current-id="timer.live?.teaware?.id ?? null"
      @pick="onPickVessel"
      @close="sheet = null"
    />

    <LeafSheet
      v-if="sheet === 'leaf'"
      :leaf-grams="timer.live?.leafGrams ?? null"
      @save="onSaveLeaf"
      @cancel="sheet = null"
    />

    <SteepSheet
      v-if="sheet === 'target'"
      :number="timer.current?.number ?? 1"
      :seconds="target"
      :title="`Target for infusion ${timer.current?.number ?? 1}`"
      @save="onSaveTarget"
      @cancel="sheet = null"
    />

    <SteepSheet
      v-if="sheet === 'steep' && editingSteep"
      :number="editingSteep.number"
      :seconds="editingSteep.actual_seconds ?? 0"
      @save="onSaveSteep"
      @cancel="sheet = null"
    />

    <FinishSheet
      v-if="sheet === 'finish' && timer.live?.tea"
      :tea-name="timer.live.tea.name"
      :grams-remaining="timer.live.tea.grams_remaining"
      :leaf-grams="timer.live.leafGrams"
      :saving="timer.loading"
      :error="timer.error"
      @save="onSave"
      @cancel="sheet = null"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TeaCup from "../components/TeaCup.vue";
import PickTeaSheet from "../components/PickTeaSheet.vue";
import PickVesselSheet from "../components/PickVesselSheet.vue";
import FinishSheet from "../components/FinishSheet.vue";
import LeafSheet from "../components/LeafSheet.vue";
import SteepSheet from "../components/SteepSheet.vue";
import RecoveryCard from "../components/RecoveryCard.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import { useTeaSessionsStore } from "../stores/useTeaSessionsStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useSteepClock } from "../composables/useSteepClock";
import { useWakeLock } from "../composables/useWakeLock";
import { useTargetChime } from "../composables/useTargetChime";
import { STEP_SECONDS, formatElapsed, targetFor } from "../timer";
import { hasChaXi } from "../journal";
import type { Tea, TeaSession, Teaware } from "../types";

const route = useRoute();
const router = useRouter();
const timer = useTeaTimerStore();
const sessions = useTeaSessionsStore();
const cabinet = useTeaCabinetStore();
const teaware = useTeawareStore();

type Sheet = "tea" | "vessel" | "leaf" | "steep" | "target" | "finish";

const sheet = ref<Sheet | null>(null);
const editingSteepNumber = ref<number | null>(null);
const editingSteep = computed(
  () => timer.live?.infusions.find((i) => i.number === editingSteepNumber.value) ?? null,
);
const menu = ref(false);
const newBrew = ref(false);
// Holds the picker between parking and the list arriving, so a stray tap
// can't start a plain timer over the brew just parked.
const switching = ref(false);
const picking = computed(
  () => !timer.live && !newBrew.value && (switching.value || sessions.inProgress.length > 0),
);
// "New brew" lasts until that brew is gone; then the open ones show again.
watch(
  () => timer.live === null,
  (none) => {
    if (!none) newBrew.value = false;
  },
);

const steepStartedAt = computed(() => timer.live?.steepStartedAt ?? null);
const { elapsed } = useSteepClock(steepStartedAt);
const target = computed(() => timer.current?.target_seconds ?? targetFor([], 1));
const { unlock } = useTargetChime(
  elapsed,
  computed(() => (timer.running ? target.value : null)),
  computed(() => timer.chimeOn),
);
useWakeLock(computed(() => timer.live !== null));

const hasLiveChaXi = computed(() =>
  timer.live
    ? hasChaXi({
        cha_xi: timer.live.chaXi ?? null,
        image_url: timer.live.imageUrl ?? null,
        tasting: timer.live.tasting ?? null,
      })
    : false,
);

function open(name: Sheet): void {
  if (sheet.value === null) sheet.value = name;
}

function teaName(teaId: string | null): string {
  return cabinet.teas.find((t) => t.id === teaId)?.name ?? "a tea";
}

function vesselName(teawareId: string | null): string | null {
  return teaware.items.find((w) => w.id === teawareId)?.name ?? null;
}

async function onSwitch(): Promise<void> {
  menu.value = false;
  switching.value = true;
  try {
    if (!(await timer.park())) return;
    // Else a reload would read ?tea= and resume the brew just parked.
    if (route.query.tea) void router.replace({ name: "tea-timer" });
    await sessions.fetchInProgress();
  } finally {
    switching.value = false;
  }
}

function onBand(): void {
  if (timer.running) {
    void timer.stop();
  } else {
    unlock();
    timer.start();
  }
}

async function onPick(tea: Tea): Promise<void> {
  await timer.attachTea(tea);
}

async function onPickVessel(item: Teaware | null): Promise<void> {
  sheet.value = null;
  await timer.setVessel(item);
}

async function onSaveLeaf(grams: number | null): Promise<void> {
  sheet.value = null;
  timer.setLeafGrams(grams);
  await timer.push();
}

function onEditSteep(number: number): void {
  if (sheet.value !== null) return;
  editingSteepNumber.value = number;
  sheet.value = "steep";
}

async function onSaveSteep(seconds: number): Promise<void> {
  sheet.value = null;
  if (editingSteepNumber.value !== null) await timer.setSteepSeconds(editingSteepNumber.value, seconds);
}

function onSaveTarget(seconds: number): void {
  sheet.value = null;
  timer.setTarget(seconds);
}

function onResume(session: TeaSession): void {
  const tea = cabinet.teas.find((t) => t.id === session.tea_id);
  if (!tea) return;
  timer.resume(session, tea, teaware.items.find((w) => w.id === session.teaware_id) ?? null);
  sessions.forget(session.id);
}

function onFinishTap(): void {
  if (timer.live?.tea) {
    open("finish");
  } else {
    timer.end();
  }
}

async function onSave(payload: { rating: number | null; leafGrams: number | null }): Promise<void> {
  timer.setLeafGrams(payload.leafGrams);
  const teaId = await timer.finish(payload.rating);
  if (teaId === null) return;
  sheet.value = null;
  await cabinet.fetchTeas();
  // Replace, not push: a pushed timer entry would let Back re-attach the
  // tea and start an empty new session.
  void router.replace({ name: "tea-detail", params: { teaId } });
}

function onRedo(): void {
  menu.value = false;
  void timer.redoLast();
}

async function onDiscard(): Promise<void> {
  menu.value = false;
  if (!window.confirm("Discard this session? Nothing from it will be saved.")) return;
  await timer.discard();
}

/** With nothing live: continue the requested tea's open session, else start it fresh. */
async function openRequested(
  wanted: string | null,
  tea: Tea | undefined,
  teawareLoad: Promise<void>,
): Promise<void> {
  // An unfinished server session for the requested tea must be resumed
  // rather than orphaned by attaching a brand-new one.
  await sessions.fetchInProgress();
  const existing = wanted ? sessions.inProgress.find((s) => s.tea_id === wanted) : undefined;
  if (existing) {
    await teawareLoad;
    onResume(existing);
    return;
  }
  if (tea) await timer.attachTea(tea);
}

onMounted(async () => {
  // Not awaited here: the cabinet/in-progress fetches below don't need it,
  // and only the resume branch does — await it there instead.
  const teawareLoad = teaware.items.length === 0 ? teaware.fetchItems() : Promise.resolve();
  if (cabinet.teas.length === 0) await cabinet.fetchTeas();
  const wanted = typeof route.query.tea === "string" ? route.query.tea : null;
  const tea = wanted ? cabinet.teas.find((t) => t.id === wanted) : undefined;

  // A local session always wins over the server.
  if (!timer.live) {
    await openRequested(wanted, tea, teawareLoad);
    return;
  }

  if (!tea || timer.live.tea?.id === tea.id) return;

  const current = timer.live.tea;
  if (current && timer.running) {
    timer.notice = `Your ${current.name} steep is still running — stop it before brewing ${tea.name}.`;
    return;
  }
  if (current && timer.brewed.length > 0) {
    // Re-targeting would file this tea's steeps under the new one; park it instead.
    if (await timer.park()) await openRequested(wanted, tea, teawareLoad);
    return;
  }
  await timer.attachTea(tea);
});
</script>

<style scoped lang="scss">
.timer {
  background: #17120e;
  min-height: 100%;
  position: relative;
  padding-bottom: 130px;
  color: #efe7da;
}
.timer__bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 18px 6px;
  position: relative;
}
.timer__what {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.timer__tea {
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  padding: 0;

  small {
    display: block;
    color: #8b7a63;
    font-size: 11px;
  }
}
.timer__vessel {
  font-size: 14px;
}
.timer__chaxi {
  font-size: 13px;
  letter-spacing: 0.04em;
  position: relative;
}
.timer__chaxi-dot {
  position: absolute;
  top: 2px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e4d9c6;
}
.timer__unsynced {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d9a45b;
  margin-top: 7px;
}
.timer__tools {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.timer__tool {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-size: 18px;
  cursor: pointer;
  min-width: 36px;
  min-height: 36px;
}
.timer__menu {
  position: absolute;
  right: 18px;
  top: 52px;
  z-index: 10;
  background: #1e1712;
  border: 1px solid #33291f;
  border-radius: 6px;
  display: flex;
  flex-direction: column;

  button {
    background: transparent;
    border: 0;
    color: #efe7da;
    font-family: inherit;
    font-size: 14px;
    text-align: left;
    padding: 12px 16px;
    cursor: pointer;

    &:disabled {
      color: #574d43;
      cursor: default;
    }
  }
}
.timer__notice {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  margin: 8px 18px;
  padding: 10px 14px;
  font-size: 14px;
}
.timer__picker {
  padding-top: 12px;
}
.timer__picker-title {
  margin: 4px 18px 6px;
  color: #8b7a63;
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.timer__new-brew {
  display: block;
  margin: 18px auto 0;
  background: transparent;
  border: 1px solid #3a2f25;
  border-radius: 16px;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 14px;
  padding: 8px 20px;
  cursor: pointer;
}
.timer__elapsed {
  text-align: center;
  font-size: 44px;
  line-height: 1;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.timer__nudge {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 12px;

  button {
    background: transparent;
    border: 1px solid #3a2f25;
    border-radius: 14px;
    color: #8b7a63;
    font-family: inherit;
    font-size: 13px;
    padding: 6px 14px;
    cursor: pointer;
  }
}
.timer__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 12px 18px 0;
}
.timer__chip {
  font-size: 12px;
  padding: 3px 8px;
  border: 0;
  border-radius: 10px;
  background: #1e1712;
  color: #e4d9c6;
  font-family: inherit;
}
button.timer__chip {
  cursor: pointer;
}
.timer__chip--now {
  background: #e4d9c6;
  color: #17120e;
}
.timer__source {
  text-align: center;
  font-size: 12px;
  font-style: italic;
  color: #8b7a63;
  margin: 10px 0 0;
}
.timer__finish {
  display: block;
  margin: 14px auto 0;
  background: transparent;
  border: 0;
  color: #c7a271;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    color: #574d43;
    cursor: default;
  }
}
// Above the band, below the sheets: tapping anywhere off a sheet dismisses it.
.timer__scrim {
  position: fixed;
  inset: 0;
  z-index: 15;
  background: rgba(0, 0, 0, 0.4);
}
// The whole thumb zone is the control: at the table there is no aiming.
.timer__band {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 112px;
  border: 0;
  border-radius: 40px 40px 0 0;
  background: #e4d9c6;
  color: #17120e;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  z-index: 5;
  transition: background 0.3s;
}
.timer__band--running {
  background: #dcc29a;
}
</style>
