<template>
  <div class="recovery" data-testid="recovery-card">
    <p class="recovery__text" data-testid="recovery-text">
      Unfinished {{ teaName }} session · {{ when }} · {{ brewedCount }}
      {{ brewedCount === 1 ? "infusion" : "infusions" }}
    </p>
    <div class="recovery__actions">
      <button class="recovery__resume" data-testid="recovery-resume" @click="emit('resume')">
        Resume
      </button>
      <button class="recovery__discard" data-testid="recovery-discard" @click="emit('discard')">
        Discard
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TeaSession } from "../types";

const props = defineProps<{ session: TeaSession; teaName: string }>();
const emit = defineEmits<{ resume: []; discard: [] }>();

const brewedCount = computed(
  () => props.session.infusions.filter((i) => i.actual_seconds !== null).length,
);
const when = computed(() =>
  new Date(props.session.started_at).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }),
);
</script>

<style scoped lang="scss">
.recovery {
  background: #1e1712;
  border-left: 2px solid #d9a45b;
  margin: 8px 18px;
  padding: 12px 14px;
}
.recovery__text {
  color: #efe7da;
  font-size: 14px;
  margin: 0 0 10px;
}
.recovery__actions {
  display: flex;
  gap: 16px;
}
.recovery__resume,
.recovery__discard {
  background: transparent;
  border: 0;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}
.recovery__resume {
  color: #d9a45b;
}
.recovery__discard {
  color: #8b7a63;
}
</style>
