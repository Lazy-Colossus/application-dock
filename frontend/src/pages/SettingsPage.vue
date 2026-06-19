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
      <p v-if="updateError" class="error-text">{{ updateError }}</p>
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

    <div class="section-label section-label--spaced">USERS</div>

    <ul data-testid="username-list" class="username-list">
      <li v-for="name in usernames" :key="name">{{ name }}</li>
    </ul>

    <div class="users-add-row">
      <input
        data-testid="new-username-input"
        v-model="newUsername"
        placeholder="New username"
        type="text"
        class="username-input"
      />
      <q-btn
        data-testid="add-user-btn"
        label="Add user"
        :disable="newUsername.trim() === ''"
        color="primary"
        unelevated
        no-caps
        @click="onAddUser"
      />
    </div>

    <div class="section-label section-label--spaced">SECURITY</div>

    <q-input
      data-testid="current-password"
      v-model="currentPassword"
      type="password"
      label="Current password"
    />
    <q-input
      data-testid="new-password"
      v-model="newPassword"
      type="password"
      label="New password"
      :rules="[(val: string) => val.length >= 8 || 'Minimum 8 characters']"
    />
    <q-input
      data-testid="confirm-password"
      v-model="confirmPassword"
      type="password"
      label="Confirm new password"
      :error="confirmMismatch"
      error-message="Passwords do not match"
    />
    <q-btn
      data-testid="change-password-btn"
      label="Change password"
      :disable="!currentPassword || !newPassword || !confirmPassword"
      color="primary"
      unelevated
      no-caps
      @click="onChangePassword"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Notify } from 'quasar';
import { api, ApiError } from '@/composables/useApi';

const checking = ref(true);
const available = ref(false);
const updateError = ref<string | null>(null);
const confirmOpen = ref(false);
const updateTriggered = ref(false);

const usernames = ref<string[]>([]);
const newUsername = ref('');

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const confirmMismatch = ref(false);

const btnLabel = computed(() => (available.value ? 'Update applications' : 'Update not available'));

onMounted(async () => {
  try {
    const status = await api.get<{ available: boolean }>('/shell/update-status');
    available.value = status.available;
  } catch (e) {
    updateError.value = e instanceof ApiError ? e.detail : 'Could not reach server';
  } finally {
    checking.value = false;
  }

  try {
    const data = await api.get<{ usernames: string[] }>('/auth/users');
    usernames.value = data.usernames;
  } catch {
    // Non-critical — USERS section will remain empty on error
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

async function onChangePassword() {
  if (newPassword.value !== confirmPassword.value) {
    confirmMismatch.value = true;
    return;
  }
  confirmMismatch.value = false;
  try {
    await api.post('/auth/change-password', {
      current_password: currentPassword.value,
      new_password: newPassword.value,
    });
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    Notify.create({ type: 'positive', message: 'Password changed successfully.' });
  } catch (e) {
    if (e instanceof ApiError) {
      Notify.create({ type: 'negative', message: e.detail });
    }
  }
}

async function onAddUser() {
  const username = newUsername.value.trim();
  try {
    await api.post<{ username: string }>('/auth/users', { username });
    usernames.value = [...usernames.value, username];
    newUsername.value = '';
    Notify.create({
      type: 'positive',
      message: `User created. Temporary password: tmp123 — ask them to change it after first login.`,
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

  &--spaced
    margin-top: 32px

.hint-text
  color: #8A8A8A
  font-size: 12px
  margin-top: 8px

.error-text
  color: #f44336
  font-size: 12px
  margin-top: 8px

.username-list
  list-style: none
  padding: 0
  margin: 0 0 12px

  li
    font-size: 14px
    padding: 2px 0

.users-add-row
  display: flex
  align-items: center
  gap: 8px

.username-input
  font-size: 14px
  padding: 6px 10px
  border: 1px solid #ccc
  border-radius: 4px
</style>
