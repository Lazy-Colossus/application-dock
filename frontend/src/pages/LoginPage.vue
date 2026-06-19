<template>
  <div class="login-page">
    <q-card class="login-card">
      <q-card-section class="login-card__header">
        <div class="text-h6">Application Dock</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit.prevent="handleLogin">
          <q-input
            v-model="username"
            label="Username"
            outlined
            dense
            dark
            class="q-mb-md"
            autocomplete="username"
            :disable="authStore.loading"
          />
          <q-input
            v-model="password"
            label="Password"
            type="password"
            outlined
            dense
            dark
            class="q-mb-md"
            autocomplete="current-password"
            :disable="authStore.loading"
          />

          <div v-if="authStore.error" class="text-negative q-mb-md text-caption">
            {{ authStore.error }}
          </div>

          <q-btn
            type="submit"
            label="Login"
            color="primary"
            class="full-width"
            :loading="authStore.loading"
          />
        </q-form>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/useAuthStore';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const username = ref('');
const password = ref('');

async function handleLogin(): Promise<void> {
  await authStore.login(username.value, password.value);
  if (authStore.isAuthenticated) {
    const raw = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    // Reject absolute URLs and protocol-relative paths to prevent open redirect
    const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
    await router.push(redirect);
  }
}
</script>

<style lang="sass" scoped>
.login-page
  min-height: 100vh
  display: flex
  align-items: center
  justify-content: center
  background-color: #121212

.login-card
  width: 100%
  max-width: 360px
  background-color: #1E1E1E

.login-card__header
  text-align: center
  color: #F0F0F0
  font-weight: 700
</style>
