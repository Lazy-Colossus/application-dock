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
      <button
        class="tea-page__save"
        data-testid="new-save"
        :disabled="!canSave || cabinet.saving"
        @click="save"
      >
        Save
      </button>
    </header>

    <h1 class="tea-page__title">New tea</h1>

    <p v-if="cabinet.error" class="tea-page__error" data-testid="new-error">{{ cabinet.error }}</p>

    <div class="tea-page__body">
      <TeaForm v-model="draft" :nodes="catalogue.nodes" @add-node="openAddNode" />
    </div>

    <AddNodeDialog
      v-if="addingParentId"
      :parent-label="addingParentLabel"
      @create="createNode"
      @cancel="addingParentId = null"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import TeaForm from "../components/TeaForm.vue";
import AddNodeDialog from "../components/AddNodeDialog.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { pathOf } from "../catalogue";
import { canSaveTea } from "../validation";
import type { TeaWrite } from "../types";

const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();

function blank(): TeaWrite {
  return {
    name: "",
    catalogue_node_id: "",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
  };
}

const draft = ref<TeaWrite>(blank());
const addingParentId = ref<string | null>(null);
const saved = ref(false);

// FR-2's two required fields, enforced here so the server's 422 is never the
// first thing the person sees. Shared with TeaDetailPage via canSaveTea.
const canSave = computed(() => canSaveTea(draft.value));

const dirty = computed(
  () => !saved.value && JSON.stringify(draft.value) !== JSON.stringify(blank()),
);

const addingParentLabel = computed(() => {
  if (!addingParentId.value) return "";
  return pathOf(catalogue.nodes, addingParentId.value)
    .map((node) => node.name)
    .join(" › ");
});

function openAddNode(parentId: string): void {
  addingParentId.value = parentId;
}

async function createNode(payload: {
  name: string;
  name_zh: string;
  default_origin: string;
}): Promise<void> {
  const parentId = addingParentId.value;
  if (!parentId) return;
  const created = await catalogue.addNode({ parent_id: parentId, ...payload });
  addingParentId.value = null;
  if (created) draft.value = { ...draft.value, catalogue_node_id: created.id };
}

async function save(): Promise<void> {
  const created = await cabinet.createTea(draft.value);
  if (!created) return; // The error is on screen; the typing is not thrown away.
  saved.value = true;
  void router.push({ name: "tea-detail", params: { teaId: created.id } });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this tea will be lost.");
});

onMounted(() => {
  void catalogue.fetchNodes();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";
</style>
