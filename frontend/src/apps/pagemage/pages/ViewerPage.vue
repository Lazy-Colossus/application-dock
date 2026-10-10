<template>
  <q-page class="pagemage-viewer column no-wrap">
    <div class="row items-center justify-between q-pa-sm bg-grey-2">
      <div class="row items-center no-wrap">
        <q-btn flat round dense icon="arrow_back" to="/pagemage" />
        <div class="text-subtitle1 q-ml-sm ellipsis">
          {{ store.currentPage?.name ?? "…" }}
        </div>
      </div>
      <div class="row items-center q-gutter-sm">
        <span
          v-if="savedFlash"
          class="text-positive text-caption"
          data-testid="saved-flash"
        >
          Saved
        </span>
        <q-btn
          flat
          no-caps
          icon="share"
          label="Share"
          :disable="!store.currentPage"
          data-testid="share"
          @click="shareOpen = true"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="save"
          label="Save"
          :loading="store.saving"
          :disable="!store.currentPage"
          data-testid="save"
          @click="requestSave"
        />
      </div>
    </div>

    <div v-if="store.error" class="text-negative q-pa-sm" data-testid="error">
      {{ store.error }}
    </div>

    <iframe
      v-if="srcdoc"
      ref="frame"
      class="pagemage-frame col"
      sandbox="allow-scripts allow-forms"
      :srcdoc="srcdoc"
      data-testid="frame"
    />

    <q-dialog v-model="shareOpen">
      <q-card style="min-width: 340px">
        <q-card-section class="text-subtitle1">Share this page</q-card-section>
        <q-card-section v-if="!shareToken" class="text-grey-7">
          Create a public link anyone can open without logging in.
        </q-card-section>
        <q-card-section v-else>
          <q-input
            :model-value="shareUrl"
            readonly
            outlined
            dense
            data-testid="share-url"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-if="!shareToken"
            unelevated
            no-caps
            color="primary"
            label="Create link"
            data-testid="create-link"
            @click="onCreateLink"
          />
          <template v-else>
            <q-btn
              flat
              no-caps
              color="negative"
              label="Disable link"
              data-testid="disable-link"
              @click="onDisableLink"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Copy"
              data-testid="copy-link"
              @click="onCopy"
            />
          </template>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { usePagemageStore } from "@/apps/pagemage/stores/usePagemageStore";
import { buildSrcdoc } from "@/apps/pagemage/capture";

const store = usePagemageStore();
const route = useRoute();
const frame = ref<HTMLIFrameElement | null>(null);
const savedFlash = ref(false);
const shareOpen = ref(false);

const pageId = computed(() => String(route.params.pageId));
const srcdoc = computed(() =>
  store.currentPage ? buildSrcdoc(store.currentPage.html) : "",
);

const shareToken = computed(() => store.currentPage?.share_token ?? "");
const shareUrl = computed(() =>
  shareToken.value
    ? `${window.location.origin}/api/pagemage/share/${shareToken.value}/raw`
    : "",
);

async function onCreateLink(): Promise<void> {
  await store.createShare(pageId.value);
}

async function onDisableLink(): Promise<void> {
  await store.revokeShare(pageId.value);
}

async function onCopy(): Promise<void> {
  await navigator.clipboard.writeText(shareUrl.value);
}

function onMessage(event: MessageEvent): void {
  const data = event.data as { type?: string; html?: string } | null;
  if (!data || data.type !== "pm:html" || typeof data.html !== "string") return;
  void store.savePage(pageId.value, data.html).then((ok) => {
    if (ok) {
      savedFlash.value = true;
      window.setTimeout(() => (savedFlash.value = false), 1500);
    }
  });
}

function requestSave(): void {
  const win = frame.value?.contentWindow;
  if (!win) return;
  win.postMessage({ type: "pm:capture" }, "*");
}

onMounted(() => {
  window.addEventListener("message", onMessage);
  void store.fetchPage(pageId.value);
});

onBeforeUnmount(() => window.removeEventListener("message", onMessage));
</script>

<style scoped>
.pagemage-viewer {
  height: calc(100vh - 50px);
}
.pagemage-frame {
  width: 100%;
  border: 0;
}
</style>
