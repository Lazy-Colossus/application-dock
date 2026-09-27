<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button
        class="tea-page__back"
        data-testid="page-back"
        @click="router.push({ name: 'tea-ware' })"
      >
        ← Teaware
      </button>
      <template v-if="item">
        <button v-if="!editMode" class="ware-page__mode" data-testid="ware-edit" @click="editMode = true">
          ✎ Edit
        </button>
        <button v-else class="ware-page__mode" data-testid="ware-edit-done" @click="leaveEditMode">
          Done
        </button>
      </template>
    </header>

    <p v-if="!item && !teaware.loading" class="ware-page__missing" data-testid="ware-missing">
      That piece is not in your cabinet. It may have been removed.
    </p>

    <template v-if="item">
      <img v-if="photoSrc" class="ware-page__photo" :src="photoSrc" alt="" />
      <h1 class="tea-page__title" data-testid="ware-title">{{ item.name }}</h1>
      <p class="ware-page__summary" data-testid="ware-summary">
        {{ typeLabel }}<template v-if="summary"> · {{ summary }}</template
        ><template v-if="item.retired_at"> · retired</template>
      </p>

      <p v-if="teaware.error" class="tea-page__error" data-testid="ware-error">
        {{ teaware.error }}
      </p>

      <template v-if="!editMode">
        <dl v-if="facts.length" class="ware-page__facts" data-testid="ware-facts">
          <template v-for="fact in facts" :key="fact.key">
            <dt>{{ fact.label }}</dt>
            <dd :data-testid="`ware-fact-${fact.key}`">{{ fact.value }}</dd>
          </template>
        </dl>
        <p v-if="item.notes" class="ware-page__notes">{{ item.notes }}</p>

        <section class="ware-page__section" data-testid="ware-usage">
          <h2 class="ware-page__heading">
            Sessions<template v-if="usage"> · {{ usageLabel }}</template>
          </h2>
          <TeaSessionsList
            :sessions="usage?.sessions ?? []"
            :tea-names="teaNames"
            :shared="household.shared"
            :me="auth.username"
          />
        </section>

        <button
          class="ware-page__retire"
          data-testid="ware-retire"
          :disabled="teaware.saving"
          @click="toggleRetired"
        >
          {{ item.retired_at ? "Bring back" : "Retire" }}
        </button>
      </template>

      <template v-else>
        <div class="tea-page__body">
          <button
            class="ware-page__photo-action"
            data-testid="ware-upload-photo"
            :disabled="teaware.saving"
            @click="photoInput?.click()"
          >
            {{ item.image_url ? "Replace photo" : "Add a photo" }}
          </button>
          <button
            v-if="item.image_url"
            class="ware-page__photo-action"
            data-testid="ware-remove-photo"
            :disabled="teaware.saving"
            @click="teaware.removeImage(item.id)"
          >
            Remove photo
          </button>
          <input
            ref="photoInput"
            type="file"
            accept="image/*"
            class="ware-page__photo-input"
            data-testid="ware-photo-input"
            @change="onPhotoChosen"
          />
          <WareForm v-if="draft" v-model="draft" :nodes="catalogue.nodes" />
          <button
            class="ware-page__apply"
            data-testid="ware-save"
            :disabled="!dirty || !canSave || teaware.saving"
            @click="save"
          >
            Save changes
          </button>
        </div>
        <button class="ware-page__remove" data-testid="ware-remove" @click="confirming = true">
          Delete from cabinet
        </button>
      </template>

      <div v-if="confirming" class="ware-page__sheet" data-testid="ware-remove-confirm">
        <p class="ware-page__sheet-title">
          Delete {{ item.name }}?
          <template v-if="usage && usage.total > 0">
            It is cleared from {{ usage.total }} {{ usage.total === 1 ? "session" : "sessions" }};
            they keep their record.
          </template>
        </p>
        <button class="ware-page__sheet-yes" data-testid="ware-remove-yes" @click="remove">
          Delete
        </button>
        <button class="ware-page__sheet-no" data-testid="ware-remove-no" @click="confirming = false">
          Keep it
        </button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import WareForm from "../components/WareForm.vue";
import TeaSessionsList from "../components/TeaSessionsList.vue";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { imageSrc } from "../shelf";
import { pathOf } from "../catalogue";
import { MATERIAL_LABELS, WARE_TYPE_LABELS, canSaveWare, toWareWrite, wareSummary } from "../ware";
import type { TeawareUsage, TeawareWrite } from "../types";

const route = useRoute();
const router = useRouter();
const teaware = useTeawareStore();
const catalogue = useTeaCatalogueStore();
const cabinet = useTeaCabinetStore();
const household = useTeaHouseholdStore();
const auth = useAuthStore();

const wareId = computed(() => String(route.params.wareId));
const item = computed(() => teaware.items.find((w) => w.id === wareId.value) ?? null);
const usage = ref<TeawareUsage | null>(null);

const editMode = ref(false);
const confirming = ref(false);
const draft = ref<TeawareWrite | null>(null);
watch(
  item,
  (value) => {
    if (value && draft.value === null) draft.value = toWareWrite(value);
  },
  { immediate: true },
);
const dirty = computed(
  () =>
    item.value !== null &&
    draft.value !== null &&
    JSON.stringify(draft.value) !== JSON.stringify(toWareWrite(item.value)),
);
const canSave = computed(() => draft.value !== null && canSaveWare(draft.value));

const typeLabel = computed(() => (item.value ? WARE_TYPE_LABELS[item.value.type].label : ""));
const summary = computed(() => (item.value ? wareSummary(item.value) : ""));
const photoSrc = computed(() => imageSrc(item.value?.image_url ?? null, auth.token));
const teaNames = computed(() => Object.fromEntries(cabinet.teas.map((t) => [t.id, t.name])));

const usageLabel = computed(() => {
  if (!usage.value) return "";
  const { total, off_dedication: off } = usage.value;
  const base = `${total} ${total === 1 ? "session" : "sessions"}`;
  return off > 0 ? `${base} · ${off} off-dedication` : base;
});

interface Fact {
  key: string;
  label: string;
  value: string;
}

const facts = computed<Fact[]>(() => {
  const w = item.value;
  if (!w) return [];
  const dedication = w.dedicated_node_id
    ? pathOf(catalogue.nodes, w.dedicated_node_id)
        .map((node) => node.name)
        .join(" › ")
    : "";
  const rows: [string, string, string][] = [
    ["material", "Material", w.material ? MATERIAL_LABELS[w.material] : ""],
    ["volume", "Volume", w.volume_ml !== null ? `${w.volume_ml} ml` : ""],
    ["seasons", "Seasons", w.porous ? (dedication ? `Yes — dedicated to ${dedication}` : "Yes") : ""],
    ["maker", "Maker", w.maker],
    ["origin", "Origin", w.origin],
    ["acquired", "Acquired", w.acquired_date ?? ""],
    ["price", "Price", w.price_paid !== null ? `${w.price_paid}` : ""],
  ];
  return rows.filter(([, , value]) => value !== "").map(([key, label, value]) => ({ key, label, value }));
});

const photoInput = ref<HTMLInputElement | null>(null);

async function onPhotoChosen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (photoInput.value) photoInput.value.value = "";
  if (file && item.value) await teaware.uploadImage(item.value.id, file);
}

async function toggleRetired(): Promise<void> {
  if (!item.value) return;
  const updated = await teaware.replaceItem(item.value.id, {
    ...toWareWrite(item.value),
    retired: item.value.retired_at === null,
  });
  if (updated) draft.value = toWareWrite(updated);
}

async function save(): Promise<void> {
  if (!draft.value) return;
  const updated = await teaware.replaceItem(wareId.value, draft.value);
  if (updated) {
    draft.value = toWareWrite(updated);
    editMode.value = false;
  }
}

function leaveEditMode(): void {
  if (dirty.value && !window.confirm("Discard your unsaved changes to this piece?")) return;
  if (item.value) draft.value = toWareWrite(item.value);
  editMode.value = false;
}

async function remove(): Promise<void> {
  confirming.value = false;
  if (await teaware.deleteItem(wareId.value)) void router.push({ name: "tea-ware" });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this piece will be lost.");
});

onMounted(async () => {
  teaware.error = null;
  void catalogue.fetchNodes();
  void household.fetchCabinet();
  if (cabinet.teas.length === 0) void cabinet.fetchTeas();
  if (teaware.items.length === 0) await teaware.fetchItems();
  usage.value = await teaware.fetchUsage(wareId.value);
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.ware-page__mode {
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}
.ware-page__missing {
  color: #8b7a63;
  padding: 0 18px;
}
.ware-page__photo {
  display: block;
  width: calc(100% - 36px);
  max-height: 260px;
  object-fit: cover;
  border-radius: 6px;
  margin: 6px 18px 4px;
}
.ware-page__summary {
  color: #8b7a63;
  font-size: 14px;
  margin: 4px 18px 0;
}
.ware-page__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 18px 18px 0;
  font-size: 14px;
  dt {
    color: #8b7a63;
  }
  dd {
    color: #efe7da;
    margin: 0;
  }
}
.ware-page__notes {
  color: #e4d9c6;
  font-size: 14.5px;
  line-height: 1.6;
  margin: 16px 18px 0;
  white-space: pre-wrap;
}
.ware-page__section {
  margin: 24px 18px 0;
}
.ware-page__heading {
  color: #9a8b78;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.05em;
  margin: 0 0 8px;
}
.ware-page__retire,
.ware-page__remove {
  display: block;
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  margin: 28px 18px 0;
  cursor: pointer;
}
.ware-page__photo-action {
  background: transparent;
  border: 1px solid #3b3026;
  border-radius: 3px;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 13px;
  padding: 7px 12px;
  margin: 10px 8px 0 0;
  cursor: pointer;
}
.ware-page__photo-input {
  display: none;
}
.ware-page__apply {
  display: block;
  width: 100%;
  margin-top: 18px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
  &:disabled {
    background: #3b3026;
    color: #6b5f52;
    cursor: default;
  }
}
.ware-page__sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 20px 18px 24px;
}
.ware-page__sheet-title {
  color: #efe7da;
  font-size: 15px;
  margin: 0 0 14px;
}
.ware-page__sheet-yes,
.ware-page__sheet-no {
  display: block;
  width: 100%;
  border: 0;
  font-family: inherit;
  font-size: 15px;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.ware-page__sheet-yes {
  background: #e4d9c6;
  color: #17120e;
  font-weight: 600;
}
.ware-page__sheet-no {
  background: transparent;
  color: #6b5f52;
  margin-top: 8px;
}
</style>
