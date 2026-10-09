<template>
  <q-page class="tea-page jform">
    <div v-if="ready" class="tea-page__body">
      <template v-if="journalOnly">
        <div class="jform__sources" role="group" aria-label="Which tea">
          <button
            :class="['jform__source', { 'jform__source--on': source === 'cabinet' }]"
            data-testid="jform-source-cabinet"
            @click="source = 'cabinet'"
          >
            From the cabinet
          </button>
          <button
            :class="['jform__source', { 'jform__source--on': source === 'away' }]"
            data-testid="jform-source-away"
            @click="source = 'away'"
          >
            Away tea
          </button>
        </div>

        <label v-if="source === 'cabinet'" class="jform__label">
          Tea
          <select v-model="teaId" class="jform__field" data-testid="jform-tea">
            <option :value="null" disabled>Pick a tea</option>
            <option v-for="tea in teas" :key="tea.id" :value="tea.id">{{ tea.name }}</option>
          </select>
        </label>
        <template v-else>
          <label class="jform__label">
            Tea
            <input
              v-model="awayName"
              class="jform__field"
              data-testid="jform-away-name"
              placeholder="what you drank"
            />
          </label>
          <label class="jform__label">
            Class
            <select v-model="awayClass" class="jform__field" data-testid="jform-away-class">
              <option :value="null">—</option>
              <option v-for="c in CLASS_ORDER" :key="c" :value="c">
                {{ CLASS_TOKENS[c].label }}
              </option>
            </select>
          </label>
        </template>

        <label class="jform__label">
          Day
          <input v-model="day" type="date" class="jform__field" data-testid="jform-day" />
        </label>
      </template>

      <label class="jform__label">
        Vessel
        <select v-model="teawareId" class="jform__field" data-testid="jform-vessel">
          <option :value="null">No vessel</option>
          <option v-for="item in vessels" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>

      <div class="jform__pair">
        <label class="jform__label">
          Leaf (g)
          <input
            v-model="grams"
            inputmode="decimal"
            class="jform__field"
            data-testid="jform-grams"
          />
        </label>
        <label class="jform__label">
          Water (°C)
          <input
            v-model="water"
            inputmode="numeric"
            class="jform__field"
            data-testid="jform-water"
          />
        </label>
      </div>

      <div class="jform__stars" role="group" aria-label="Rating">
        <button
          v-for="n in 5"
          :key="n"
          :class="['jform__star', { 'jform__star--on': rating !== null && n <= rating }]"
          :data-testid="`jform-star-${n}`"
          :aria-label="`${n} star${n === 1 ? '' : 's'}`"
          @click="rating = rating === n ? null : n"
        >
          ★
        </button>
      </div>

      <ChaXiFields
        v-model="chaXi"
        :photo-src="removed ? null : photoSrc"
        :photo-saving="journal.saving"
        :photo-error="photoError"
        @photo="onPhoto"
        @remove-photo="onRemovePhoto"
      />

      <TastingFields v-model="tasting" />

      <p v-if="journal.error" class="tea-page__error" data-testid="jform-error">
        {{ journal.error }}
      </p>

      <button
        class="jform__save"
        data-testid="jform-save"
        :disabled="!canSave || journal.saving"
        @click="save"
      >
        {{ journal.saving ? "Saving…" : "Save" }}
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import ChaXiFields from "../components/ChaXiFields.vue";
import TastingFields from "../components/TastingFields.vue";
import { useTeaJournalStore } from "../stores/useTeaJournalStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { CLASS_ORDER, CLASS_TOKENS } from "../tokens";
import { emptyChaXi, fromDateInput, toDateInput } from "../journal";
import { newSessionId } from "../timer";
import { imageSrc } from "../shelf";
import { isBrewingVessel } from "../ware";
import type { ChaXi, JournalEdit, Tasting, TeaClass, TeaSessionWrite } from "../types";

type Source = "cabinet" | "away";

const route = useRoute();
const router = useRouter();
const journal = useTeaJournalStore();
const cabinet = useTeaCabinetStore();
const teaware = useTeawareStore();
const auth = useAuthStore();

// Minted once, so a Save retried after a lost response lands on the same entry.
const newId = newSessionId();
// A new entry that saved but whose photo failed becomes an edit of that entry, so a retry
// can never create it twice.
const savedId = ref<string | null>(null);
const editId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : savedId.value,
);
const existing = computed(() => (editId.value ? journal.byId(editId.value) : null));
const journalOnly = computed(() => existing.value === null || !existing.value.timed);
const ready = ref(false);

const source = ref<Source>("cabinet");
const teaId = ref<string | null>(null);
const awayName = ref("");
const awayClass = ref<TeaClass | null>(null);
const day = ref(toDateInput(new Date().toISOString()));
const teawareId = ref<string | null>(null);
const grams = ref("");
const water = ref("");
const rating = ref<number | null>(null);
const chaXi = ref<ChaXi>(emptyChaXi());
const tasting = ref<Tasting | null>(null);
const pendingPhoto = shallowRef<File | null>(null);
const removed = ref(false);
const photoError = ref<string | null>(null);

const teas = computed(() => [...cabinet.teas].sort((a, b) => a.name.localeCompare(b.name)));
// The vessel already on the entry stays pickable even if it has since retired.
const vessels = computed(() =>
  teaware.items.filter((w) => isBrewingVessel(w) || w.id === existing.value?.teaware_id),
);
const photoSrc = computed(() => imageSrc(existing.value?.image_url ?? null, auth.token));

const canSave = computed(() => {
  if (!journalOnly.value) return true;
  if (!day.value) return false;
  return source.value === "cabinet" ? teaId.value !== null : awayName.value.trim() !== "";
});

function positive(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

function celsius(text: string): number | null {
  const value = Number(text);
  return text.trim() !== "" && Number.isInteger(value) && value >= 1 && value <= 100
    ? value
    : null;
}

function teaFields(): Pick<TeaSessionWrite, "tea_id" | "away_tea_name" | "away_class_id"> {
  return source.value === "cabinet"
    ? { tea_id: teaId.value, away_tea_name: "", away_class_id: null }
    : { tea_id: null, away_tea_name: awayName.value.trim(), away_class_id: awayClass.value };
}

function newBody(): TeaSessionWrite {
  return {
    ...teaFields(),
    status: "finalised",
    started_at: fromDateInput(day.value),
    leaf_grams: positive(grams.value),
    water_temp_c: celsius(water.value),
    rating: rating.value,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: teawareId.value,
    timed: false,
    cha_xi: chaXi.value,
    tasting: tasting.value,
  };
}

function editBody(): JournalEdit {
  const body: JournalEdit = {
    cha_xi: chaXi.value,
    tasting: tasting.value,
    rating: rating.value,
    leaf_grams: positive(grams.value),
    water_temp_c: celsius(water.value),
    teaware_id: teawareId.value,
  };
  if (journalOnly.value) Object.assign(body, teaFields(), { started_at: fromDateInput(day.value) });
  return body;
}

function onPhoto(file: File): void {
  pendingPhoto.value = file;
  removed.value = false;
  photoError.value = null;
  // The entry already exists (its photo failed before): Try again means upload now.
  if (savedId.value) void finish(savedId.value);
}

function onRemovePhoto(): void {
  pendingPhoto.value = null;
  removed.value = true;
}

async function save(): Promise<void> {
  const id = editId.value ?? newId;
  const ok = editId.value
    ? await journal.edit(id, editBody())
    : await journal.create(id, newBody());
  if (!ok) return;
  savedId.value = id;
  await finish(id);
}

async function finish(id: string): Promise<void> {
  if (removed.value && existing.value?.image_url) await journal.removePhoto(id);
  if (pendingPhoto.value) {
    if (!(await journal.uploadPhoto(id, pendingPhoto.value))) {
      photoError.value = journal.error;
      return;
    }
    pendingPhoto.value = null;
  }
  void cabinet.fetchTeas();
  void router.replace({ name: "tea-journal-entry", params: { id } });
}

function fill(): void {
  const e = existing.value;
  if (!e) return;
  source.value = e.tea_id === null ? "away" : "cabinet";
  teaId.value = e.tea_id;
  awayName.value = e.away_tea_name;
  awayClass.value = e.away_class_id;
  day.value = toDateInput(e.started_at);
  teawareId.value = e.teaware_id;
  grams.value = e.leaf_grams !== null ? String(e.leaf_grams) : "";
  water.value = e.water_temp_c !== null ? String(e.water_temp_c) : "";
  rating.value = e.rating;
  chaXi.value = e.cha_xi ?? emptyChaXi();
  tasting.value = e.tasting;
}

onMounted(async () => {
  const loads: Promise<void>[] = [];
  if (cabinet.teas.length === 0) loads.push(cabinet.fetchTeas());
  if (teaware.items.length === 0) loads.push(teaware.fetchItems());
  if (editId.value && !journal.byId(editId.value)) loads.push(journal.fetchJournal());
  await Promise.all(loads);
  fill();
  ready.value = true;
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.jform .tea-page__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
}
.jform__sources {
  display: flex;
  gap: 8px;
}
.jform__source {
  flex: 1;
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 10px;
  cursor: pointer;
}
.jform__source--on {
  background: #2c241d;
  color: #efe7da;
}
.jform__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8b7a63;
  font-size: 13px;
  flex: 1;
}
.jform__field {
  background: #1e1712;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  padding: 10px 12px;
}
.jform__pair {
  display: flex;
  gap: 12px;
}
.jform__stars {
  display: flex;
  gap: 6px;
}
.jform__star {
  background: transparent;
  border: 0;
  color: #574d43;
  font-size: 28px;
  cursor: pointer;
}
.jform__star--on {
  color: #e4d9c6;
}
.jform__save {
  background: #e4d9c6;
  border: 0;
  border-radius: 6px;
  color: #17120e;
  font-family: inherit;
  font-size: 16px;
  padding: 14px;
  cursor: pointer;
}
.jform__save:disabled {
  background: #2c241d;
  color: #574d43;
  cursor: default;
}
</style>
