<template>
  <q-page padding>
    <div class="section-label">MAINTENANCE</div>

    <div v-if="checking" class="hint-text">Checking…</div>
    <template v-else>
      <q-btn
        data-testid="update-btn"
        :label="btnLabel"
        :disable="!available || updateTriggered"
        color="primary"
        unelevated
        no-caps
        @click="onUpdateClick"
      />
      <p v-if="!available" class="hint-text">No update script found on host</p>
      <p v-if="error" class="error-text">{{ error }}</p>
    </template>

    <q-dialog v-model="confirmOpen">
      <q-card>
        <q-card-section>
          This will pull the latest images and restart the running container.
          The page will lose connection briefly — refresh once it's back.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" data-testid="cancel-btn" @click="confirmOpen = false" />
          <q-btn color="primary" label="Confirm" data-testid="confirm-btn" @click="onConfirm" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Notify } from 'quasar';
import { api, ApiError } from '@/composables/useApi';

const checking = ref(true);
const available = ref(false);
const error = ref<string | null>(null);
const confirmOpen = ref(false);
const updateTriggered = ref(false);

const btnLabel = computed(() => (available.value ? 'Update applications' : 'Update not available'));

onMounted(async () => {
  try {
    const status = await api.get<{ available: boolean }>('/shell/update-status');
    available.value = status.available;
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.detail;
    }
  } finally {
    checking.value = false;
  }
});

function onUpdateClick() {
  if (available.value && !updateTriggered.value) {
    confirmOpen.value = true;
  }
}

async function onConfirm() {
  confirmOpen.value = false;
  try {
    await api.post<{ detail: string }>('/shell/update');
    updateTriggered.value = true;
    Notify.create({
      type: 'positive',
      message: "Update started — connection may drop. Refresh once it's back.",
      persistent: true,
      actions: [{ label: 'Dismiss', color: 'white' }],
    });
  } catch (e) {
    if (e instanceof ApiError) {
      Notify.create({
        type: 'negative',
        message: e.detail,
      });
    }
  }
}
</script>

<style lang="sass" scoped>
.section-label
  color: #8A8A8A
  font-size: 12px
  font-weight: 400
  letter-spacing: 1px
  text-transform: uppercase
  margin-bottom: 12px

.hint-text
  color: #8A8A8A
  font-size: 12px
  margin-top: 8px

.error-text
  color: #f44336
  font-size: 12px
  margin-top: 8px
</style>
