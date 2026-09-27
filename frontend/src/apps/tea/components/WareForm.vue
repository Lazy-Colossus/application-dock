<template>
  <div class="form">
    <label class="form__label" for="ware-name">Name</label>
    <input
      id="ware-name"
      class="form__field"
      data-testid="ware-field-name"
      :value="modelValue.name"
      @input="patch({ name: asText($event) })"
    />

    <label class="form__label" for="ware-type">Type</label>
    <select
      id="ware-type"
      class="form__field"
      data-testid="ware-field-type"
      :value="modelValue.type"
      @change="patch({ type: asType($event) })"
    >
      <option v-for="type in WARE_TYPE_ORDER" :key="type" :value="type">
        {{ WARE_TYPE_LABELS[type].label }}
      </option>
    </select>

    <label class="form__label" for="ware-material">Material</label>
    <select
      id="ware-material"
      class="form__field"
      data-testid="ware-field-material"
      :value="modelValue.material ?? ''"
      @change="patch({ material: asMaterial($event) })"
    >
      <option value="">Not recorded</option>
      <option v-for="material in MATERIALS" :key="material" :value="material">
        {{ MATERIAL_LABELS[material] }}
      </option>
    </select>

    <label class="form__label" for="ware-volume">Volume (ml)</label>
    <input
      id="ware-volume"
      class="form__field"
      data-testid="ware-field-volume"
      inputmode="numeric"
      :value="modelValue.volume_ml ?? ''"
      @input="patch({ volume_ml: asVolume($event) })"
    />

    <label class="form__check">
      <input
        type="checkbox"
        data-testid="ware-field-porous"
        :checked="modelValue.porous"
        @change="onPorous"
      />
      Seasons — porous clay that takes on the tea
    </label>

    <template v-if="modelValue.porous">
      <p class="form__label">Dedicated to</p>
      <CataloguePicker
        bare
        :nodes="nodes"
        :model-value="modelValue.dedicated_node_id"
        @update:model-value="patch({ dedicated_node_id: $event })"
      />
      <button
        v-if="modelValue.dedicated_node_id"
        type="button"
        class="form__clear"
        data-testid="ware-clear-dedication"
        @click="patch({ dedicated_node_id: null })"
      >
        No dedication
      </button>
    </template>

    <p class="form__label">Where it's from</p>
    <input
      class="form__field"
      data-testid="ware-field-maker"
      placeholder="Maker or workshop"
      :value="modelValue.maker"
      @input="patch({ maker: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="ware-field-origin"
      placeholder="Origin — Yixing, Jingdezhen, Tokoname…"
      :value="modelValue.origin"
      @input="patch({ origin: asText($event) })"
    />

    <p class="form__label">Buying it</p>
    <input
      class="form__field"
      type="date"
      data-testid="ware-field-acquired"
      aria-label="Acquired on"
      :value="modelValue.acquired_date ?? ''"
      @input="patch({ acquired_date: asText($event) || null })"
    />
    <input
      class="form__field"
      data-testid="ware-field-price"
      placeholder="Price paid"
      inputmode="decimal"
      :value="modelValue.price_paid ?? ''"
      @input="patch({ price_paid: asPrice($event) })"
    />

    <label class="form__label" for="ware-notes">Notes</label>
    <textarea
      id="ware-notes"
      class="form__field"
      rows="4"
      data-testid="ware-field-notes"
      :value="modelValue.notes"
      @input="patch({ notes: asText($event) })"
    />
  </div>
</template>

<script setup lang="ts">
import CataloguePicker from "./CataloguePicker.vue";
import { MATERIAL_LABELS, WARE_TYPE_LABELS, WARE_TYPE_ORDER } from "../ware";
import type { CatalogueNode, TeawareMaterial, TeawareType, TeawareWrite } from "../types";

const props = defineProps<{ modelValue: TeawareWrite; nodes: CatalogueNode[] }>();
const emit = defineEmits<{ "update:modelValue": [value: TeawareWrite] }>();

const MATERIALS = Object.keys(MATERIAL_LABELS) as TeawareMaterial[];

function patch(change: Partial<TeawareWrite>): void {
  emit("update:modelValue", { ...props.modelValue, ...change });
}

function asText(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function asType(event: Event): TeawareType {
  return (event.target as HTMLSelectElement).value as TeawareType;
}

function asMaterial(event: Event): TeawareMaterial | null {
  const raw = (event.target as HTMLSelectElement).value;
  return raw === "" ? null : (raw as TeawareMaterial);
}

function asVolume(event: Event): number | null {
  const parsed = Number(asText(event).trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asPrice(event: Event): number | null {
  const raw = asText(event).trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// A pot that no longer seasons can't keep a dedication — the server would refuse the save.
function onPorous(event: Event): void {
  const porous = (event.target as HTMLInputElement).checked;
  patch({ porous, dedicated_node_id: porous ? props.modelValue.dedicated_node_id : null });
}
</script>

<style scoped lang="scss">
.form__label {
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
.form__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #e4d9c6;
  font-size: 14px;
  padding: 16px 0 4px;
}
.form__clear {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
}
</style>
