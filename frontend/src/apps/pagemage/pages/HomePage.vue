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
            <div class="row items-center q-gutter-xs q-mt-sm">
              <template v-if="confirmingId === page.id">
                <span class="text-caption q-mr-xs">Delete this page?</span>
                <q-btn
                  dense
                  flat
                  no-caps
                  color="negative"
                  label="Delete"
                  :data-testid="`delete-confirm-${page.id}`"
                  @click.stop="confirmDelete(page.id)"
                />
                <q-btn
                  dense
                  flat
                  no-caps
                  label="Keep"
                  :data-testid="`delete-cancel-${page.id}`"
                  @click.stop="confirmingId = null"
                />
              </template>
              <template v-else>
                <q-btn
                  dense
                  flat
                  round
                  icon="edit"
                  :data-testid="`rename-${page.id}`"
                  @click.stop="openRename(page)"
                />
                <q-btn
                  dense
                  flat
                  round
                  icon="delete"
                  :data-testid="`delete-${page.id}`"
                  @click.stop="confirmingId = page.id"
                />
              </template>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="uploadDialog">
      <q-card style="min-width: 320px">
        <q-card-section class="text-subtitle1">Name this page</q-card-section>
        <q-card-section>
          <q-input
            v-model="uploadName"
            dense
            outlined
            autofocus
            label="Name"
            data-testid="upload-name"
            @keyup.enter="confirmUpload"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            label="Cancel"
            data-testid="upload-cancel"
            @click="cancelUpload"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Upload"
            data-testid="upload-submit"
            @click="confirmUpload"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="renameDialog">
      <q-card style="min-width: 320px">
        <q-card-section class="text-subtitle1">Rename page</q-card-section>
        <q-card-section>
          <q-input
            v-model="renameName"
            dense
            outlined
            autofocus
            label="Name"
            data-testid="rename-name"
            @keyup.enter="confirmRename"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            label="Cancel"
            data-testid="rename-cancel"
            @click="renameDialog = false"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Save"
            :disable="!renameName.trim()"
            data-testid="rename-submit"
            @click="confirmRename"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePagemageStore } from "@/apps/pagemage/stores/usePagemageStore";
import type { PageSummary } from "@/apps/pagemage/types";

const store = usePagemageStore();
const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);

const uploadDialog = ref(false);
const uploadName = ref("");
const pendingFile = ref<File | null>(null);

const renameDialog = ref(false);
const renameName = ref("");
const renamingId = ref<string | null>(null);

const confirmingId = ref<string | null>(null);

onMounted(() => void store.fetchPages());

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function stripExt(filename: string): string {
  return filename.replace(/\.html?$/i, "");
}

function pickFile(): void {
  fileInput.value?.click();
}

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Reset so re-selecting the same file fires `change` again.
  input.value = "";
  if (!file) return;
  pendingFile.value = file;
  uploadName.value = stripExt(file.name);
  uploadDialog.value = true;
}

async function confirmUpload(): Promise<void> {
  const file = pendingFile.value;
  if (!file) return;
  const summary = await store.upload(file, uploadName.value.trim() || undefined);
  uploadDialog.value = false;
  pendingFile.value = null;
  if (summary) void router.push(`/pagemage/pages/${summary.id}`);
}

function cancelUpload(): void {
  uploadDialog.value = false;
  pendingFile.value = null;
}

function openRename(page: PageSummary): void {
  renamingId.value = page.id;
  renameName.value = page.name;
  renameDialog.value = true;
}

async function confirmRename(): Promise<void> {
  const id = renamingId.value;
  const name = renameName.value.trim();
  if (!id || !name) return;
  const ok = await store.renamePage(id, name);
  if (ok) renameDialog.value = false;
}

async function confirmDelete(pageId: string): Promise<void> {
  await store.deletePage(pageId);
  confirmingId.value = null;
}

function open(pageId: string): void {
  if (confirmingId.value === pageId) return;
  void router.push(`/pagemage/pages/${pageId}`);
}
</script>
