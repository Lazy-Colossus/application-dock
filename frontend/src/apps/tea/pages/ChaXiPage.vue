<template>
  <q-page class="tea-page chaxi-page">
    <BrewStrip @back="toTimer" />
    <div v-if="timer.live?.tea" class="tea-page__body">
      <p class="chaxi-page__what" data-testid="chaxi-what">
        {{ timer.live.tea.name }} · {{ day }}
      </p>
      <ChaXiFields
        :model-value="chaXi"
        :photo-src="photoSrc"
        :photo-saving="timer.photoSaving"
        :photo-error="timer.photoError"
        @update:model-value="onEdit"
        @photo="timer.uploadPhoto($event)"
        @remove-photo="timer.removePhoto()"
      />
      <TastingFields :model-value="timer.live.tasting ?? null" @update:model-value="onTasting" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import BrewStrip from "../components/BrewStrip.vue";
import ChaXiFields from "../components/ChaXiFields.vue";
import TastingFields from "../components/TastingFields.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyChaXi } from "../journal";
import { imageSrc } from "../shelf";
import type { ChaXi, Tasting } from "../types";

// Long enough to let a sentence finish, short enough that a lost phone loses little.
const PUSH_DELAY_MS = 1500;

const router = useRouter();
const timer = useTeaTimerStore();
const auth = useAuthStore();

const chaXi = computed(() => timer.live?.chaXi ?? emptyChaXi());
const photoSrc = computed(() => imageSrc(timer.live?.imageUrl ?? null, auth.token));
const day = computed(() =>
  timer.live
    ? new Date(timer.live.startedAt).toLocaleDateString([], { day: "numeric", month: "short" })
    : "",
);

let pending: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (pending === null) return;
  clearTimeout(pending);
  pending = null;
  void timer.push();
}

function schedule(): void {
  if (pending !== null) clearTimeout(pending);
  pending = setTimeout(flush, PUSH_DELAY_MS);
}

function onEdit(value: ChaXi): void {
  timer.setChaXi(value);
  schedule();
}

function onTasting(value: Tasting | null): void {
  timer.setTasting(value);
  schedule();
}

function toTimer(): void {
  void router.push({ name: "tea-timer" });
}

onBeforeRouteLeave(() => {
  flush();
});

onMounted(() => {
  if (!timer.live?.tea) void router.replace({ name: "tea-timer" });
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.chaxi-page__what {
  color: #8b7a63;
  font-size: 14px;
  margin: 14px 0 0;
}
</style>
