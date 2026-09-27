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
      <button
        class="tea-page__save"
        data-testid="ware-new-save"
        :disabled="!canSave || teaware.saving"
        @click="save"
      >
        Save
      </button>
    </header>

    <h1 class="tea-page__title">New teaware</h1>

    <p v-if="teaware.error" class="tea-page__error" data-testid="ware-new-error">
      {{ teaware.error }}
    </p>

    <div class="tea-page__body">
      <WareForm v-model="draft" :nodes="catalogue.nodes" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import WareForm from "../components/WareForm.vue";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { blankWare, canSaveWare } from "../ware";
import type { TeawareWrite } from "../types";

const router = useRouter();
const teaware = useTeawareStore();
const catalogue = useTeaCatalogueStore();

const draft = ref<TeawareWrite>(blankWare());
const saved = ref(false);
const canSave = computed(() => canSaveWare(draft.value));
const dirty = computed(
  () => !saved.value && JSON.stringify(draft.value) !== JSON.stringify(blankWare()),
);

async function save(): Promise<void> {
  const created = await teaware.createItem(draft.value);
  if (!created) return; // The error is on screen; the typing is kept.
  saved.value = true;
  void router.push({ name: "tea-ware-detail", params: { wareId: created.id } });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? This piece won't be added.");
});

onMounted(() => {
  teaware.error = null;
  void catalogue.fetchNodes();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";
</style>
