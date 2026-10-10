<template>
  <q-page class="pagemage-home q-pa-md">
    <div class="row items-center justify-between q-mb-lg">
      <div class="text-h5">PageMage</div>
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="upload_file"
        label="Upload HTML"
        data-testid="upload"
        @click="pickFile"
      />
      <input
        ref="fileInput"
        type="file"
        accept=".html,.htm,text/html"
        class="hidden"
        data-testid="file-input"
        @change="onFile"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
      {{ store.error }}
    </div>

    <div
      v-if="!store.loading && !store.error && store.pages.length === 0"
      class="text-grey-6"
      data-testid="empty-state"
    >
      No pages yet — upload an HTML file to get started.
    </div>

    <div v-else class="row q-col-gutter-md">
      <div
        v-for="page in store.pages"
        :key="page.id"
        class="col-12 col-sm-6 col-md-4"
      >
        <q-card
          clickable
          class="cursor-pointer"
          :data-testid="`page-${page.id}`"
          @click="open(page.id)"
        >
          <q-card-section>
            <div class="row items-center no-wrap">
              <q-icon name="html" size="sm" class="q-mr-sm" />
              <div class="text-subtitle1 ellipsis">{{ page.name }}</div>
            </div>
            <div class="text-caption text-grey-6 q-mt-xs">
              {{ formatDate(page.updated_at) }}
            </div>
            <q-badge
              v-if="page.shared"
              color="primary"
              class="q-mt-xs"
              label="shared"
              :data-testid="`shared-${page.id}`"
            />
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePagemageStore } from "@/apps/pagemage/stores/usePagemageStore";

const store = usePagemageStore();
const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);

onMounted(() => void store.fetchPages());

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function pickFile(): void {
  fileInput.value?.click();
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Reset so re-selecting the same file fires `change` again.
  input.value = "";
  if (!file) return;
  const summary = await store.upload(file);
  if (summary) void router.push(`/pagemage/pages/${summary.id}`);
}

function open(pageId: string): void {
  void router.push(`/pagemage/pages/${pageId}`);
}
</script>
