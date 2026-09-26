<template>
  <div class="form">
    <CataloguePicker
      :nodes="nodes"
      :model-value="modelValue.catalogue_node_id || null"
      @update:model-value="patch({ catalogue_node_id: $event })"
      @prefill="onPrefill"
      @add-node="emit('add-node', $event)"
    />

    <label class="form__label" for="tea-name">Name</label>
    <div class="form__name-row">
      <input
        id="tea-name"
        class="form__field"
        data-testid="field-name"
        :value="modelValue.name"
        @input="patch({ name: asText($event) })"
      />
      <button
        type="button"
        class="form__autofill"
        data-testid="autofill"
        :disabled="!modelValue.name.trim() || autofilling"
        @click="onAutofill"
      >
        Autofill
      </button>
    </div>
    <p v-if="autofillMessage" class="form__autofill-message" data-testid="autofill-message">
      {{ autofillMessage }}
    </p>

    <input
      class="form__field"
      data-testid="field-image-url"
      placeholder="Photo URL"
      :value="modelValue.image_url ?? ''"
      @input="patch({ image_url: asText($event) || null })"
    />

    <p class="form__group" data-testid="group">Where it's from</p>
    <input
      class="form__field"
      data-testid="field-origin"
      placeholder="Origin"
      :value="modelValue.origin"
      @input="touchedOrigin = true; patch({ origin: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="field-cultivar"
      placeholder="Cultivar"
      :value="modelValue.cultivar"
      @input="patch({ cultivar: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="field-year"
      placeholder="Harvest year"
      inputmode="numeric"
      :value="modelValue.year ?? ''"
      @input="patch({ year: asNumber($event) })"
    />
    <select
      class="form__field"
      data-testid="field-harvest-season"
      aria-label="Harvest season"
      :value="modelValue.harvest_season ?? ''"
      @change="patch({ harvest_season: asHarvestSeason($event) })"
    >
      <option value="">Harvest season: not recorded</option>
      <option value="spring">Spring</option>
      <option value="summer">Summer</option>
      <option value="autumn">Autumn</option>
      <option value="winter">Winter</option>
    </select>
    <input
      class="form__field"
      data-testid="field-vendor"
      placeholder="Vendor"
      :value="modelValue.vendor"
      @input="patch({ vendor: asText($event) })"
    />

    <p class="form__group" data-testid="group">What it cost</p>
    <input
      class="form__field"
      data-testid="field-purchased"
      placeholder="Grams bought"
      inputmode="decimal"
      :value="modelValue.grams_purchased ?? ''"
      @input="patch({ grams_purchased: asNumber($event) })"
    />
    <input
      class="form__field"
      data-testid="field-price"
      placeholder="Price paid"
      inputmode="decimal"
      :value="modelValue.price_paid ?? ''"
      @input="patch({ price_paid: asNumber($event) })"
    />
    <span v-if="perGram !== null" class="form__sub" data-testid="price-per-gram">
      {{ perGram.toFixed(2) }} per gram
    </span>
    <input
      class="form__field"
      data-testid="field-purchase-date"
      placeholder="Bought on (2024-03-12)"
      :value="modelValue.purchase_date ?? ''"
      @input="patch({ purchase_date: asText($event) || null })"
    />

    <p class="form__group" data-testid="group">On the shelf</p>
    <select
      class="form__field"
      data-testid="field-form"
      aria-label="Form"
      :value="modelValue.form ?? ''"
      @change="patch({ form: asTeaForm($event) })"
    >
      <option value="">Form: not recorded</option>
      <option value="loose">Loose</option>
      <option value="cake">Cake</option>
      <option value="brick">Brick</option>
      <option value="tuo">Tuo</option>
      <option value="ball">Ball</option>
      <option value="bag">Bag</option>
      <option value="sample">Sample</option>
      <option value="other">Other</option>
    </select>
    <input
      class="form__field"
      data-testid="field-storage"
      placeholder="Kept in"
      :value="modelValue.storage_location"
      @input="patch({ storage_location: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="field-low"
      placeholder="Low at (grams)"
      inputmode="decimal"
      :value="modelValue.low_threshold_grams ?? ''"
      @input="patch({ low_threshold_grams: asNumber($event) })"
    />

    <p class="form__group form__group--notes">Notes</p>
    <textarea
      class="form__field form__field--notes"
      data-testid="field-notes"
      rows="4"
      :value="modelValue.notes"
      @input="patch({ notes: asText($event) })"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import CataloguePicker from "./CataloguePicker.vue";
import { pricePerGram } from "../shelf";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import type { CatalogueNode, HarvestSeason, Tea, TeaForm as TeaFormValue, TeaWrite } from "../types";

const props = defineProps<{ modelValue: TeaWrite; nodes: CatalogueNode[] }>();
const catalogueStore = useTeaCatalogueStore();
const emit = defineEmits<{
  "update:modelValue": [value: TeaWrite];
  "add-node": [parentId: string];
}>();

// Flips on the first keystroke in origin and never flips back, so prefill can
// tell "still untouched" from "typed and then cleared".
const touchedOrigin = ref(false);

function asText(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function asNumber(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Both selects use an empty option for "not recorded"; the empty string is
// never a valid enum member, so it collapses to `null` on either field.
function asTeaForm(event: Event): TeaFormValue | null {
  const raw = (event.target as HTMLSelectElement).value;
  return raw === "" ? null : (raw as TeaFormValue);
}

function asHarvestSeason(event: Event): HarvestSeason | null {
  const raw = (event.target as HTMLSelectElement).value;
  return raw === "" ? null : (raw as HarvestSeason);
}

function patch(change: Partial<TeaWrite>): void {
  emit("update:modelValue", { ...props.modelValue, ...change });
}

/**
 * Prefill writes into `origin` only when the person has not typed there and
 * the field is still empty, and never twice for the same field (FR-9).
 */
function onPrefill(origin: string): void {
  if (!origin || touchedOrigin.value || props.modelValue.origin) return;
  patch({ origin });
}

const autofilling = ref(false);
const autofillMessage = ref("");

async function onAutofill(): Promise<void> {
  const name = props.modelValue.name.trim();
  if (!name) return;
  autofillMessage.value = "";
  autofilling.value = true;
  try {
    const suggestion = await catalogueStore.autofill(name);
    if (!suggestion) {
      autofillMessage.value = catalogueStore.error || "Couldn't tell — pick a category below";
      return;
    }
    // One merged patch: two separate patch() calls here would each read the
    // same not-yet-updated props.modelValue, and the second would silently
    // discard the first (FR-9's guard still applies to origin).
    const change: Partial<TeaWrite> = { catalogue_node_id: suggestion.catalogue_node_id };
    if (suggestion.origin && !touchedOrigin.value && !props.modelValue.origin) {
      change.origin = suggestion.origin;
    }
    patch(change);
  } finally {
    autofilling.value = false;
  }
}

const perGram = computed(() => pricePerGram({ ...props.modelValue } as Tea));
</script>

<style scoped lang="scss">
.form__label,
.form__group {
  display: block;
  color: #9a8b78;
  font-size: 12px;
  letter-spacing: 0.05em;
  padding: 18px 0 6px;
  margin: 0;
}
.form__field {
  width: 100%;
  background: #241c16;
  border: 1px solid #3b3026;
  border-radius: 3px;
  padding: 11px 12px;
  color: #efe7da;
  font-size: 15px;
  font-family: inherit;
  margin-bottom: 8px;
}
.form__field--notes {
  line-height: 1.62;
}
.form__sub {
  display: block;
  color: #7a6d5e;
  font-size: 12.5px;
  margin: -4px 0 8px;
}
.form__name-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;

  .form__field {
    flex: 1;
    margin-bottom: 0;
  }
}
.form__autofill {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid #4a3d2e;
  border-radius: 3px;
  padding: 0 14px;
  height: 42px;
  color: #c7a271;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;

  &:disabled {
    color: #6b5f52;
    border-color: #3b3026;
    cursor: default;
  }
}
.form__autofill-message {
  color: #7a6d5e;
  font-size: 12.5px;
  margin: 4px 0 8px;
}
</style>
