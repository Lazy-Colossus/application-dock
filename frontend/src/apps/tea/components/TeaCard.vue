<template>
  <button
    :class="['card', { 'card--empty': empty }]"
    data-testid="card"
    @click="emit('open', tea.id)"
  >
    <span class="card__frame">
      <img v-if="photoSrc" class="card__photo" data-testid="card-photo" :src="photoSrc" alt="" />
      <span
        v-else
        class="card__placeholder"
        data-testid="card-placeholder"
        :lang="nameZh ? 'zh' : undefined"
        :style="{ background: color }"
      >
        {{ glyph }}
      </span>
      <span
        v-if="proportion !== null"
        class="card__stock"
        data-testid="card-stock"
        :style="{ width: `${proportion * 100}%`, background: color }"
      />
    </span>
    <span class="card__name" data-testid="card-name">{{ tea.name }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CLASS_TOKENS } from "../tokens";
import { proportionOf, imageSrc } from "../shelf";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Tea } from "../types";

const props = defineProps<{ tea: Tea; nameZh: string }>();
const emit = defineEmits<{ open: [teaId: string] }>();

const auth = useAuthStore();
const photoSrc = computed(() => imageSrc(props.tea.image_url, auth.token));
const proportion = computed(() => proportionOf(props.tea));
const empty = computed(() => props.tea.grams_remaining <= 0);
const color = computed(() => CLASS_TOKENS[props.tea.class_id]?.liquor ?? CLASS_TOKENS.other.liquor);
const glyph = computed(() => (props.nameZh || props.tea.name).charAt(0));
</script>

<style scoped lang="scss">
.card {
  flex: none;
  width: 112px;
  background: transparent;
  border: 0;
  padding: 0;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  scroll-snap-align: start;
}
.card__frame {
  position: relative;
  display: block;
  width: 112px;
  height: 112px;
  border-radius: 6px;
  overflow: hidden;
  background: #1e1712;
}
.card__photo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #17120e;
  font-size: 40px;
  font-weight: 300;
  opacity: 0.55;
}
// A hairline of how much is left, so the shelf still says "running low"
// without the full rim gauge the detail page carries.
.card__stock {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
}
.card__name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #efe7da;
  font-size: 13.5px;
  line-height: 1.3;
  margin-top: 7px;
}
.card--empty .card__frame {
  opacity: 0.4;
}
.card--empty .card__name {
  color: #574d43;
}
</style>
