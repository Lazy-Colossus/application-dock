<template>
  <div class="sheet" data-testid="pick-sheet">
    <p class="sheet__title">Which tea?</p>
    <input
      v-model="query"
      class="sheet__field"
      data-testid="pick-search"
      placeholder="Search your cabinet"
    />
    <ul class="pick__list">
      <li v-for="tea in shown" :key="tea.id">
        <button
          :class="['pick__row', { 'pick__row--current': tea.id === currentTeaId }]"
          :data-testid="`pick-tea-${tea.id}`"
          @click="emit('pick', tea)"
        >
          <img v-if="photo(tea)" class="pick__photo" :src="photo(tea)!" alt="" />
          <span v-else class="pick__swatch" :style="{ background: CUP_LIQUOR[tea.class_id] }"></span>
          <span class="pick__name">{{ tea.name }}</span>
          <span class="pick__grams">{{ tea.grams_remaining }} g</span>
        </button>
      </li>
    </ul>

    <div v-if="currentTeaId" class="pick__brew">
      <label class="pick__label">
        Leaf (g)
        <input
          class="sheet__field"
          data-testid="pick-grams"
          inputmode="decimal"
          :value="leafGrams ?? ''"
          @input="emit('update-grams', asNumber($event))"
        />
      </label>
      <label class="pick__label">
        Water (°C)
        <input
          class="sheet__field"
          data-testid="pick-temp"
          inputmode="numeric"
          min="1"
          max="100"
          :value="waterTempC ?? ''"
          @input="emit('update-temp', asNumber($event))"
        />
      </label>
    </div>

    <button class="sheet__cancel" data-testid="pick-close" @click="emit('close')">Done</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CUP_LIQUOR } from "../timer";
import { imageSrc, sortSection } from "../shelf";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Tea } from "../types";

const props = defineProps<{
  teas: Tea[];
  currentTeaId: string | null;
  leafGrams: number | null;
  waterTempC: number | null;
}>();
const emit = defineEmits<{
  pick: [tea: Tea];
  "update-grams": [grams: number | null];
  "update-temp": [celsius: number | null];
  close: [];
}>();

const auth = useAuthStore();
const query = ref("");

const shown = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const filtered = props.teas.filter((tea) => tea.name.toLowerCase().includes(needle));
  return sortSection(filtered);
});

function photo(tea: Tea): string | null {
  return imageSrc(tea.image_url, auth.token);
}

function asNumber(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.pick__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 42vh;
  overflow-y: auto;
}
.pick__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #241e19;
  padding: 10px 2px;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.pick__row--current .pick__name {
  color: #d9a45b;
}
.pick__photo,
.pick__swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.pick__name {
  flex: 1;
}
.pick__grams {
  color: #8b7a63;
  font-size: 13px;
}
.pick__brew {
  display: flex;
  gap: 12px;
}
.pick__label {
  flex: 1;
  color: #8b7a63;
  font-size: 12px;
}
</style>
