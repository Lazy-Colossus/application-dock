<template>
  <router-link
    :to="{ name: 'tea-journal-entry', params: { id: entry.id } }"
    :class="['jcard', photo ? 'jcard--photo' : 'jcard--compact']"
    :data-testid="`journal-card-${entry.id}`"
  >
    <img v-if="photo" class="jcard__img" :src="photo" alt="" />
    <div class="jcard__body">
      <span class="jcard__head">
        <span v-if="!photo" class="jcard__dot" :style="{ background: tokens.liquor }"></span>
        <span class="jcard__tea" :style="{ color: tokens.head }">{{ entry.tea_name }}</span>
        <span class="jcard__date">{{ date }}</span>
      </span>
      <span class="jcard__meta">
        {{ meta }}<template v-if="stars"> · {{ stars }}</template
        ><template v-if="showBrewer"> · {{ entry.brewed_by }}</template>
      </span>
      <span v-if="entry.cha_xi?.moods.length" class="jcard__moods">
        {{ entry.cha_xi.moods.join(" · ") }}
      </span>
      <span v-if="mine && !hasChaXi(entry)" class="jcard__hint" data-testid="journal-card-hint">
        + cha xi
      </span>
    </div>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { CLASS_TOKENS } from "../tokens";
import { hasChaXi } from "../journal";
import { imageSrc } from "../shelf";
import type { JournalEntry } from "../types";

const props = defineProps<{ entry: JournalEntry; mine: boolean; showBrewer: boolean }>();

const auth = useAuthStore();
const tokens = computed(() => CLASS_TOKENS[props.entry.class_id]);
const photo = computed(() => imageSrc(props.entry.image_url, auth.token));
const date = computed(() =>
  new Date(props.entry.started_at).toLocaleDateString([], { day: "numeric", month: "short" }),
);
const stars = computed(() => (props.entry.rating === null ? "" : "★".repeat(props.entry.rating)));
const meta = computed(() => {
  const e = props.entry;
  const how = e.timed
    ? `${e.infusions.length} ${e.infusions.length === 1 ? "infusion" : "infusions"}`
    : e.tea_id === null
      ? "away"
      : "not timed";
  return e.leaf_grams !== null ? `${how} · ${e.leaf_grams} g` : how;
});
</script>

<style scoped lang="scss">
.jcard {
  display: block;
  background: #1e1712;
  border-radius: 8px;
  color: #e4d9c6;
  text-decoration: none;
  overflow: hidden;
}
.jcard__img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.jcard__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
}
.jcard__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.jcard__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  align-self: center;
}
.jcard__tea {
  font-size: 17px;
  flex: 1;
}
.jcard__date,
.jcard__meta {
  color: #8b7a63;
  font-size: 13px;
}
.jcard__moods {
  color: #a99781;
  font-size: 13px;
  font-style: italic;
}
.jcard__hint {
  color: #6b5f52;
  font-size: 13px;
}
</style>
