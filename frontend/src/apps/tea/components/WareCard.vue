<template>
  <button
    :class="['card', { 'card--retired': item.retired_at !== null }]"
    data-testid="ware-card"
    @click="emit('open', item.id)"
  >
    <span class="card__frame">
      <img v-if="photoSrc" class="card__photo" :src="photoSrc" alt="" />
      <span v-else class="card__placeholder" lang="zh">{{ glyph }}</span>
    </span>
    <span class="card__name" data-testid="ware-card-name">{{ item.name }}</span>
    <span v-if="summary" class="card__meta" data-testid="ware-card-meta">{{ summary }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { imageSrc } from "../shelf";
import { WARE_TYPE_LABELS, wareSummary } from "../ware";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Teaware } from "../types";

const props = defineProps<{ item: Teaware }>();
const emit = defineEmits<{ open: [teawareId: string] }>();

const auth = useAuthStore();
const photoSrc = computed(() => imageSrc(props.item.image_url, auth.token));
const summary = computed(() => wareSummary(props.item));
const glyph = computed(() => (WARE_TYPE_LABELS[props.item.type] ?? WARE_TYPE_LABELS.other).labelZh.charAt(0));
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
// Ware isn't a liquor, so its placeholder stays bone/ink (DESIGN.md).
.card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #2c241d;
  color: #8b7a63;
  font-size: 40px;
  font-weight: 300;
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
.card__meta {
  display: block;
  color: #8b7a63;
  font-size: 12px;
  margin-top: 2px;
}
.card--retired .card__frame {
  opacity: 0.4;
}
.card--retired .card__name {
  color: #574d43;
}
</style>
