<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button class="tea-page__back" @click="router.back()">← Cabinet</button>
    </header>

    <p v-if="!tea && !cabinet.loading" class="tea-page__missing" data-testid="tea-missing">
      That tea is not in your cabinet. It may have been removed.
    </p>

    <template v-if="tea">
      <div class="tea-page__wrapper">
        <div class="tea-page__ident">
          <p class="tea-page__crumb" data-testid="tea-crumb">{{ crumb }}</p>
          <h1 class="tea-page__title" data-testid="tea-title">
            {{ tea.name }}
            <span v-if="nameZh" class="tea-page__zh" lang="zh">{{ nameZh }}</span>
          </h1>
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

      <p v-if="cabinet.error" class="tea-page__error" data-testid="tea-error">{{ cabinet.error }}</p>

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

      <div v-if="confirming" class="sheet" data-testid="remove-confirm">
        <p class="sheet__title">Remove {{ tea.name }} from the cabinet? Its notes go with it.</p>
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
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { proportionOf, thresholdFractionOf, isLow } from "../shelf";
import { pathOf } from "../catalogue";
import { CLASS_TOKENS } from "../tokens";
import { canSaveTea } from "../validation";
import type { Tea, TeaWrite } from "../types";

const route = useRoute();
const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();

const teaId = computed(() => String(route.params.teaId));
const tea = computed(() => cabinet.teas.find((t) => t.id === teaId.value) ?? null);

const editing = ref(false);
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
    draft.value = { ...draft.value, grams_remaining: tea.value.grams_remaining };
  }
}

async function save(): Promise<void> {
  if (!draft.value) return;
  const updated = await cabinet.replaceTea(teaId.value, draft.value);
  if (updated) draft.value = toWrite(updated);
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
