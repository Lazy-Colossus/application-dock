<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button
        class="tea-page__back"
        data-testid="page-back"
        @click="router.push({ name: 'tea-cabinet' })"
      >
        ← Cabinet
      </button>
      <template v-if="tea">
        <div class="tea-page__actions">
          <button
            v-if="!editMode"
            class="tea-page__mode"
            data-testid="tea-brew"
            @click="router.push({ name: 'tea-timer', query: { tea: teaId } })"
          >
            Brew
          </button>
          <button
            v-if="!editMode"
            class="tea-page__mode"
            data-testid="tea-edit"
            aria-label="Edit tea"
            @click="editMode = true"
          >
            ✎ Edit
          </button>
          <button v-else class="tea-page__mode" data-testid="tea-edit-done" @click="leaveEditMode">
            Done
          </button>
        </div>
      </template>
    </header>

    <p v-if="!tea && !cabinet.loading" class="tea-page__missing" data-testid="tea-missing">
      That tea is not in your cabinet. It may have been removed.
    </p>

    <template v-if="tea">
      <div class="tea-page__wrapper">
        <img
          v-if="photoSrc"
          class="tea-page__photo"
          data-testid="tea-photo"
          :src="photoSrc"
          alt=""
        />
        <div class="tea-page__ident">
          <p class="tea-page__crumb" data-testid="tea-crumb">{{ crumb }}</p>
          <h1 class="tea-page__title" data-testid="tea-title">
            {{ tea.name }}
            <span v-if="nameZh" class="tea-page__zh" lang="zh">{{ nameZh }}</span>
          </h1>
          <template v-if="editMode">
            <button
              class="tea-page__photo-action"
              data-testid="tea-upload-photo"
              :disabled="cabinet.saving"
              @click="photoInput?.click()"
            >
              {{ tea.image_url ? "Replace photo" : "Add a photo" }}
            </button>
            <button
              v-if="tea.image_url"
              class="tea-page__photo-action"
              data-testid="tea-remove-photo"
              :disabled="cabinet.saving"
              @click="removePhoto"
            >
              Remove photo
            </button>
            <input
              ref="photoInput"
              type="file"
              accept="image/*"
              class="tea-page__photo-input"
              data-testid="tea-photo-input"
              @change="onPhotoChosen"
            />
          </template>
        </div>
        <button class="tea-page__rim" data-testid="tea-rim-button" @click="editing = true">
          <RimGauge
            size="page"
            :proportion="proportion"
            :threshold-fraction="thresholdFraction"
            :low="low"
            :empty="tea.grams_remaining <= 0"
            :color="color"
            :value="tea.grams_remaining"
            :caption="tea.grams_purchased ? `of ${tea.grams_purchased}g` : null"
          />
          <span class="tea-page__rim-hint">tap to adjust</span>
        </button>
      </div>

      <p v-if="cabinet.error" class="tea-page__error" data-testid="tea-error">
        {{ cabinet.error }}
      </p>

      <template v-if="!editMode">
        <section v-if="facts.length" class="tea-view__section" data-testid="tea-facts">
          <dl class="tea-view__params">
            <template v-for="fact in facts" :key="fact.label">
              <dt>{{ fact.label }}</dt>
              <dd :data-testid="`fact-${fact.key}`">{{ fact.value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="tea.notes" class="tea-view__section">
          <h2 class="tea-view__heading">Notes</h2>
          <p class="tea-view__notes" data-testid="tea-notes">{{ tea.notes }}</p>
        </section>

        <section v-if="almanacEntry" class="tea-view__section" data-testid="tea-almanac">
          <h2 class="tea-view__heading">
            From the almanac
            <span v-if="almanacIsAncestor" class="tea-view__via" data-testid="tea-almanac-via">
              · {{ almanacEntry.name }}
            </span>
          </h2>
          <p class="tea-view__meta" data-testid="tea-almanac-country">
            {{ almanacEntry.country
            }}<template v-if="almanacEntry.reading"> · {{ almanacEntry.reading }}</template>
          </p>
          <p class="tea-view__summary" data-testid="tea-almanac-summary">
            {{ almanacEntry.summary }}
          </p>
          <dl class="tea-view__params">
            <dt>Leaf</dt>
            <dd data-testid="tea-almanac-grams">{{ gramsLabel }}</dd>
            <dt>Water</dt>
            <dd data-testid="tea-almanac-temp">{{ tempLabel }}</dd>
            <dt>Infusions</dt>
            <dd data-testid="tea-almanac-steeps">{{ steepsLabel }}</dd>
          </dl>
          <button
            class="tea-view__link"
            data-testid="tea-almanac-open"
            @click="
              router.push({
                name: 'tea-almanac-entry',
                params: { catalogueNodeId: almanacEntry.catalogue_node_id },
              })
            "
          >
            Open in the almanac →
          </button>
        </section>

        <section class="tea-view__section" data-testid="tea-sessions">
          <h2 class="tea-view__heading">Sessions</h2>
          <TeaSessionsList :sessions="teaSessions" :shared="household.shared" :me="auth.username" />
        </section>
      </template>

      <template v-else>
        <div class="tea-page__body">
          <TeaForm v-if="draft" v-model="draft" :nodes="catalogue.nodes" @add-node="openAddNode" />
          <button
            class="tea-page__apply"
            data-testid="tea-save"
            :disabled="!dirty || !canSave || cabinet.saving"
            @click="save"
          >
            Save changes
          </button>
        </div>

        <button class="tea-page__remove" data-testid="tea-remove" @click="confirming = true">
          Remove from cabinet
        </button>
      </template>

      <div v-if="confirming" class="sheet" data-testid="remove-confirm">
        <p class="sheet__title">
          Remove {{ tea.name }} from the cabinet? Its notes go with it.
          <template v-if="othersSessions > 0">
            Also deletes {{ teaSessions.length }} sessions ({{ othersSessions }} by others).
          </template>
        </p>
        <button class="sheet__save" data-testid="remove-yes" @click="remove">Remove</button>
        <button class="sheet__cancel" data-testid="remove-no" @click="confirming = false">
          Keep it
        </button>
      </div>

      <GramsSheet v-if="editing" :tea="tea" @save="commitGrams" @cancel="editing = false" />

      <AddNodeDialog
        v-if="addingParentId"
        :parent-label="addingParentLabel"
        @create="createNode"
        @cancel="addingParentId = null"
      />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import RimGauge from "../components/RimGauge.vue";
import GramsSheet from "../components/GramsSheet.vue";
import TeaForm from "../components/TeaForm.vue";
import AddNodeDialog from "../components/AddNodeDialog.vue";
import TeaSessionsList from "../components/TeaSessionsList.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";
import { useTeaSessionsStore } from "../stores/useTeaSessionsStore";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { proportionOf, thresholdFractionOf, isLow, imageSrc, pricePerGram } from "../shelf";
import { nearestAlmanacEntry, pathOf } from "../catalogue";
import { CLASS_TOKENS } from "../tokens";
import { canSaveTea } from "../validation";
import type { Tea, TeaWrite } from "../types";

const route = useRoute();
const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();
const almanac = useTeaAlmanacStore();
const sessions = useTeaSessionsStore();
const auth = useAuthStore();
const household = useTeaHouseholdStore();

const teaId = computed(() => String(route.params.teaId));
const tea = computed(() => cabinet.teas.find((t) => t.id === teaId.value) ?? null);
const teaSessions = computed(() => sessions.byTea[teaId.value] ?? []);
const othersSessions = computed(
  () => teaSessions.value.filter((s) => s.brewed_by !== auth.username).length,
);

const editing = ref(false);
const editMode = ref(false);
const confirming = ref(false);

function toWrite(source: Tea): TeaWrite {
  const { id, class_id, created_at, updated_at, ...rest } = source;
  void id;
  void class_id;
  void created_at;
  void updated_at;
  return rest;
}

const draft = ref<TeaWrite | null>(null);
watch(
  tea,
  (value) => {
    if (value && draft.value === null) draft.value = toWrite(value);
  },
  { immediate: true },
);

const dirty = computed(
  () =>
    tea.value !== null &&
    draft.value !== null &&
    JSON.stringify(draft.value) !== JSON.stringify(toWrite(tea.value)),
);

// Same rule as NewTeaPage's `canSave` (FR-2): a name and a classification.
// Editing must not be able to save its way into invalid data any more than
// creating can — clearing the name or reclassifying to nothing disables Save
// here exactly as it would there.
const canSave = computed(() => draft.value !== null && canSaveTea(draft.value));

const chain = computed(() =>
  tea.value ? pathOf(catalogue.nodes, tea.value.catalogue_node_id) : [],
);
const crumb = computed(() => chain.value.map((node) => node.name).join(" › "));
const nameZh = computed(() => chain.value.at(-1)?.name_zh ?? "");
const color = computed(() =>
  tea.value ? (CLASS_TOKENS[tea.value.class_id]?.liquor ?? CLASS_TOKENS.other.liquor) : "",
);
const proportion = computed(() => (tea.value ? proportionOf(tea.value) : null));
const thresholdFraction = computed(() => (tea.value ? thresholdFractionOf(tea.value) : null));
const low = computed(() => (tea.value ? isLow(tea.value) : false));

const FORM_LABELS: Record<NonNullable<Tea["form"]>, string> = {
  loose: "Loose",
  cake: "Cake",
  brick: "Brick",
  tuo: "Tuo",
  ball: "Ball",
  bag: "Bag",
  sample: "Sample",
  other: "Other",
};

interface Fact {
  key: string;
  label: string;
  value: string;
}

function brewingLabel(t: Tea): string {
  if (!t.brewing) return "";
  const parts = [
    t.brewing.leaf_grams !== null ? `${t.brewing.leaf_grams}g` : "",
    t.brewing.water_temp_c !== null ? `${t.brewing.water_temp_c}°C` : "",
    t.brewing.steep_seconds.map((s) => `${s}s`).join(", "),
  ];
  return parts.filter(Boolean).join(" · ");
}

const facts = computed<Fact[]>(() => {
  const t = tea.value;
  if (!t) return [];
  const perGram = pricePerGram(t);
  const season = t.harvest_season
    ? t.harvest_season[0].toUpperCase() + t.harvest_season.slice(1)
    : "";
  const rows: [string, string, string][] = [
    ["form", "Form", t.form ? FORM_LABELS[t.form] : ""],
    ["origin", "Origin", t.origin],
    ["cultivar", "Cultivar", t.cultivar],
    ["harvest", "Harvest", [season, t.year ?? ""].filter(Boolean).join(" ")],
    ["vendor", "Vendor", t.vendor],
    ["purchased", "Bought", t.grams_purchased !== null ? `${t.grams_purchased}g` : ""],
    [
      "price",
      "Price",
      t.price_paid === null
        ? ""
        : perGram === null
          ? `${t.price_paid}`
          : `${t.price_paid} (${perGram.toFixed(2)} per gram)`,
    ],
    ["purchase-date", "Bought on", t.purchase_date ?? ""],
    ["storage", "Kept in", t.storage_location],
    ["low", "Low at", t.low_threshold_grams !== null ? `${t.low_threshold_grams}g` : ""],
    ["brewing", "Brewing", brewingLabel(t)],
  ];
  return rows
    .filter(([, , value]) => value !== "")
    .map(([key, label, value]) => ({ key, label, value }));
});

const almanacEntry = computed(() =>
  tea.value
    ? nearestAlmanacEntry(catalogue.nodes, almanac.entries, tea.value.catalogue_node_id)
    : null,
);
const almanacIsAncestor = computed(
  () =>
    almanacEntry.value !== null &&
    almanacEntry.value.catalogue_node_id !== tea.value?.catalogue_node_id,
);
const gramsLabel = computed(() => {
  const grams = almanacEntry.value?.brewing.leaf_grams ?? null;
  return grams !== null ? `${grams}g` : "Not recorded";
});
const tempLabel = computed(() => {
  const temp = almanacEntry.value?.brewing.water_temp_c ?? null;
  return temp !== null ? `${temp}°C` : "Not recorded";
});
const steepsLabel = computed(() => {
  const seconds = almanacEntry.value?.brewing.steep_seconds ?? [];
  return seconds.length === 0 ? "Not recorded" : seconds.map((s) => `${s}s`).join(", ");
});

const photoSrc = computed(() => imageSrc(tea.value?.image_url ?? null, auth.token));
const photoInput = ref<HTMLInputElement | null>(null);

// Merge only image_url into the existing draft, the same way commitGrams
// merges grams_remaining: a photo write must never clobber notes or any
// other field the person is mid-edit on.
async function onPhotoChosen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (photoInput.value) photoInput.value.value = "";
  if (!file) return;
  await cabinet.uploadImage(teaId.value, file);
  if (draft.value && tea.value) {
    draft.value = { ...draft.value, image_url: tea.value.image_url };
  }
}

async function removePhoto(): Promise<void> {
  await cabinet.removeImage(teaId.value);
  if (draft.value && tea.value) {
    draft.value = { ...draft.value, image_url: tea.value.image_url };
  }
}

const addingParentId = ref<string | null>(null);
function openAddNode(parentId: string): void {
  addingParentId.value = parentId;
}

// Correction: wired here as well as on NewTeaPage — reclassifying a tea you
// already own is exactly when a missing catalogue entry gets discovered.
const addingParentLabel = computed(() => {
  if (!addingParentId.value) return "";
  return pathOf(catalogue.nodes, addingParentId.value)
    .map((node) => node.name)
    .join(" › ");
});

async function createNode(payload: {
  name: string;
  name_zh: string;
  default_origin: string;
}): Promise<void> {
  const parentId = addingParentId.value;
  if (!parentId || !draft.value) return;
  const created = await catalogue.addNode({ parent_id: parentId, ...payload });
  addingParentId.value = null;
  if (created) draft.value = { ...draft.value, catalogue_node_id: created.id };
}

async function commitGrams(grams: number): Promise<void> {
  editing.value = false;
  await cabinet.setGrams(teaId.value, grams);
  // Merge only the grams into the existing draft: a grams write must never
  // clobber notes or any other field the person is mid-edit on. Read back
  // from `tea.value` rather than the `grams` argument so a failed write's
  // rollback is reflected too, not the rejected optimistic value.
  if (draft.value && tea.value) {
    draft.value = {
      ...draft.value,
      grams_remaining: tea.value.grams_remaining,
    };
  }
}

async function save(): Promise<void> {
  if (!draft.value) return;
  const updated = await cabinet.replaceTea(teaId.value, draft.value);
  if (updated) {
    draft.value = toWrite(updated);
    editMode.value = false;
  }
}

function leaveEditMode(): void {
  if (dirty.value && !window.confirm("Discard your unsaved changes to this tea?")) return;
  if (tea.value) draft.value = toWrite(tea.value);
  editMode.value = false;
}

async function remove(): Promise<void> {
  confirming.value = false;
  await cabinet.deleteTea(teaId.value);
  void router.push({ name: "tea-cabinet" });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this tea will be lost.");
});

onMounted(() => {
  if (cabinet.teas.length === 0) void cabinet.fetchTeas();
  void catalogue.fetchNodes();
  // Unfiltered on purpose: the Almanac page may have left a country/search
  // subset in the store that would hide this tea's entry.
  void almanac.fetchEntries();
  void sessions.fetchForTea(teaId.value);
  void household.fetchCabinet();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.tea-page__wrapper {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 18px;
}
.tea-page__ident {
  flex: 1;
  min-width: 0;
}
.tea-page__photo {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 6px;
  object-fit: cover;
  margin-right: 14px;
}
.tea-page__photo-action {
  background: transparent;
  border: 0;
  color: #8b6a5e;
  font-size: 12.5px;
  padding: 6px 0 0;
  margin-right: 14px;
  font-family: inherit;
  cursor: pointer;
}
.tea-page__actions {
  display: flex;
  gap: 14px;
}
.tea-page__mode {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
}
.tea-view__section {
  padding: 22px 18px 0;
}
.tea-view__heading {
  color: #efe7da;
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 10px;
}
.tea-view__via {
  color: #8b7a63;
  font-weight: 400;
}
.tea-view__params {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
}
.tea-view__params dt {
  color: #8b7a63;
  font-size: 13px;
}
.tea-view__params dd {
  color: #efe7da;
  font-size: 13px;
  margin: 0;
  overflow-wrap: anywhere;
}
.tea-view__notes,
.tea-view__summary {
  color: #e4d9c6;
  font-size: 14.5px;
  line-height: 1.5;
  margin: 0 0 14px;
  white-space: pre-line;
}
.tea-view__meta {
  color: #7a6244;
  font-size: 12.5px;
  margin: 0 0 8px;
}
.tea-view__link {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 14px 0 0;
  cursor: pointer;
}
.tea-page__photo-input {
  display: none;
}
.tea-page__crumb {
  color: #7a6244;
  font-size: 12px;
  padding: 0 18px;
  margin: 0;
}
.tea-page__zh {
  display: block;
  color: #a99781;
  font-size: 19px;
  font-weight: 300;
  margin-top: 3px;
}
.tea-page__rim {
  flex: none;
  background: transparent;
  border: 0;
  padding-top: 14px;
  cursor: pointer;
}
.tea-page__rim-hint {
  display: block;
  color: #8b7a63;
  font-size: 11.5px;
  margin-top: 3px;
}
.tea-page__apply {
  width: 100%;
  margin-top: 20px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.tea-page__apply:disabled {
  opacity: 0.4;
  cursor: default;
}
.tea-page__remove,
.tea-page__missing {
  display: block;
  background: transparent;
  border: 0;
  color: #8b6a5e;
  font-size: 13.5px;
  padding: 22px 18px 26px;
  font-family: inherit;
  cursor: pointer;
}
.tea-page__missing {
  color: #8b7a63;
  cursor: default;
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 20px 18px 24px;
}
.sheet__title {
  color: #efe7da;
  font-size: 15px;
  margin: 0 0 18px;
}
.sheet__save {
  display: block;
  width: 100%;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.sheet__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  cursor: pointer;
}
</style>
