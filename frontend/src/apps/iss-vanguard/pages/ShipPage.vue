<template>
  <q-page class="ship">
    <div class="ship__header">
      <div class="ship__tabs" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          class="ship__tab"
          :class="{ 'ship__tab--active': tab === t.id }"
          :data-testid="`tab-${t.id}`"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <button
        type="button"
        class="ship__crew"
        data-testid="crew-open"
        @click="crewOpen = true"
      >
        Crew ({{ store.ship?.members.length ?? 1 }})
      </button>
    </div>

    <p v-if="store.error" class="ship__error" data-testid="ship-error">
      {{ store.error }}
    </p>

    <template v-if="store.ship">
      <section v-if="tab === 'ship'">
        <ResourceGrid
          :grid="store.ship.stock"
          mode="edit"
          @cell-tap="openStepper"
        />
      </section>

      <section v-else-if="tab === 'needed'">
        <ResourceGrid
          v-if="store.needed"
          :grid="store.needed"
          mode="readonly"
        />
        <button
          type="button"
          class="ship__add"
          data-testid="add-project"
          @click="openEditor(null)"
        >
          Add project
        </button>
        <ProjectList
          :projects="store.ship.projects"
          @edit="openEditor"
          @complete="(p) => (completing = p)"
          @reopen="(p) => store.reopenProject(p.id)"
          @remove="(p) => (deleting = p)"
        />
      </section>

      <section v-else>
        <ResourceGrid v-if="store.diff" :grid="store.diff" mode="diff" />
        <p class="ship__subtitle">Short per project</p>
        <ul
          v-if="store.shortfalls.length > 0"
          class="ship__shortfalls"
          data-testid="shortfall-list"
        >
          <li v-for="s in store.shortfalls" :key="s.project.id">
            <strong>{{ s.project.code }}</strong
            >{{ s.project.name ? ` · ${s.project.name}` : "" }}:
            {{ describe(s.missing) }}
          </li>
        </ul>
        <p v-else data-testid="all-covered">All projects covered.</p>
      </section>
    </template>

    <q-dialog
      :model-value="stepper !== null"
      @update:model-value="stepper = null"
    >
      <q-card class="ship__dialog">
        <StockStepper
          v-if="stepper && store.ship"
          :resource="stepper.resource"
          :tier="stepper.tier"
          :count="store.ship.stock[stepper.resource][stepper.tier]"
          :busy="store.loading"
          @step="
            (d) =>
              stepper && store.adjustStock(stepper.resource, stepper.tier, d)
          "
          @close="stepper = null"
        />
      </q-card>
    </q-dialog>

    <q-dialog
      :model-value="editing !== undefined"
      @update:model-value="editing = undefined"
    >
      <q-card class="ship__dialog">
        <ProjectEditor
          v-if="editing !== undefined && store.ship"
          :project="editing"
          :projects="store.ship.projects"
          :busy="store.loading"
          @save="saveProject"
          @cancel="editing = undefined"
        />
      </q-card>
    </q-dialog>

    <q-dialog
      :model-value="completing !== null"
      @update:model-value="completing = null"
    >
      <q-card class="ship__dialog">
        <div
          v-if="completing"
          class="ship__confirm"
          data-testid="confirm-complete"
        >
          <p>Deduct the cost of {{ completing.code }} from the ship?</p>
          <p v-if="completingShort.length > 0" data-testid="confirm-shortfall">
            Stock is short by {{ describe(completingShort) }} — those counts
            will stop at 0.
          </p>
          <button type="button" @click="completing = null">Cancel</button>
          <button
            type="button"
            data-testid="confirm-complete-yes"
            @click="complete"
          >
            Complete
          </button>
        </div>
      </q-card>
    </q-dialog>

    <q-dialog
      :model-value="deleting !== null"
      @update:model-value="deleting = null"
    >
      <q-card class="ship__dialog">
        <div v-if="deleting" class="ship__confirm">
          <p>
            Delete {{ deleting.code }}? Projects that require it will lose the
            reminder.
          </p>
          <button type="button" @click="deleting = null">Cancel</button>
          <button
            type="button"
            data-testid="confirm-delete-yes"
            @click="remove"
          >
            Delete
          </button>
        </div>
      </q-card>
    </q-dialog>

    <q-dialog v-model="crewOpen">
      <q-card class="ship__dialog">
        <CrewSheet v-if="crewOpen" @close="crewOpen = false" @left="onLeft" />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ResourceGrid from "../components/ResourceGrid.vue";
import StockStepper from "../components/StockStepper.vue";
import ProjectEditor from "../components/ProjectEditor.vue";
import ProjectList from "../components/ProjectList.vue";
import CrewSheet from "../components/CrewSheet.vue";
import {
  useShipEvents,
  type ShipEventsSubscription,
} from "../composables/useShipEvents";
import { useShipStore } from "../stores/useShipStore";
import { cellName } from "../resources";
import { shortfall } from "../shipMath";
import { useAuthStore } from "@/stores/useAuthStore";
import type {
  Project,
  ProjectDraft,
  ResourceId,
  Shortage,
  TierId,
} from "../types";

type Tab = "ship" | "needed" | "diff";
const tabs: { id: Tab; label: string }[] = [
  { id: "ship", label: "On ship" },
  { id: "needed", label: "Needed" },
  { id: "diff", label: "Difference" },
];

const store = useShipStore();
const auth = useAuthStore();

const tab = ref<Tab>("ship");
const stepper = ref<{ resource: ResourceId; tier: TierId } | null>(null);
// undefined = closed, null = new project, Project = editing that one.
const editing = ref<Project | null | undefined>(undefined);
const completing = ref<Project | null>(null);
const deleting = ref<Project | null>(null);
const crewOpen = ref(false);

const completingShort = computed<Shortage[]>(() =>
  completing.value && store.ship
    ? shortfall(store.ship.stock, completing.value.cost)
    : [],
);

function describe(missing: Shortage[]): string {
  return missing
    .map((m) => `${m.amount}× ${cellName(m.resource, m.tier)}`)
    .join(", ");
}

function openStepper(resource: ResourceId, tier: TierId): void {
  stepper.value = { resource, tier };
}

function openEditor(project: Project | null): void {
  editing.value = project;
}

async function saveProject(draft: ProjectDraft): Promise<void> {
  const target = editing.value;
  const ok = target
    ? await store.updateProject(target.id, draft)
    : await store.createProject(draft);
  if (ok) editing.value = undefined;
}

async function complete(): Promise<void> {
  if (completing.value) await store.completeProject(completing.value.id);
  completing.value = null;
}

async function remove(): Promise<void> {
  if (deleting.value) await store.deleteProject(deleting.value.id);
  deleting.value = null;
}

let subscription: ShipEventsSubscription | null = null;
// Set on unmount, so an await that finishes after leaving never opens a stream.
let disposed = false;

// The stream is bound to whichever ship the server resolves for me, so after
// being moved (removed, joined elsewhere, or leaving) it must be reopened.
function subscribe(): void {
  subscription?.close();
  if (disposed || !auth.token) return;
  subscription = useShipEvents(auth.token, {
    onOpen: () => void store.fetchShip(),
    onChanged: (e) => void store.applyRemoteRev(e.rev, e.ship_id),
    onMembersChanged: () => void store.fetchShip(),
    onClosed: (e) => {
      if (e.member === auth.username) void moved();
    },
  });
}

async function moved(): Promise<void> {
  await store.fetchShip();
  subscribe();
}

function onLeft(): void {
  crewOpen.value = false;
  subscribe();
}

onMounted(async () => {
  await store.fetchShip();
  subscribe();
});

onBeforeUnmount(() => {
  disposed = true;
  subscription?.close();
});
</script>

<style scoped lang="scss">
.ship {
  padding: 12px 16px 32px;
  max-width: 640px;
  margin: 0 auto;
}
.ship__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.ship__tabs {
  display: flex;
  flex: 1;
  gap: 4px;
}
.ship__tab {
  flex: 1;
  padding: 8px 4px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
}
.ship__tab--active {
  border-bottom-color: currentColor;
  font-weight: 600;
}
.ship__crew,
.ship__add {
  background: transparent;
  border: 1px solid rgba(127, 127, 127, 0.4);
  border-radius: 6px;
  padding: 6px 10px;
  color: inherit;
  cursor: pointer;
}
.ship__add {
  margin: 12px 0;
}
.ship__error {
  color: #e05757;
  font-size: 13px;
}
.ship__subtitle {
  margin: 16px 0 6px;
  font-weight: 600;
}
.ship__shortfalls {
  padding-left: 18px;
}
.ship__confirm {
  padding: 16px;
  max-width: 360px;
}
.ship__dialog {
  max-width: 92vw;
}
</style>
