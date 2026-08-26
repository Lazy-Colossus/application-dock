<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />
    <div class="hotaru-topbar row items-center justify-end">
      <AvatarSwitcher />
    </div>

    <div class="settings-title hotaru-glow q-mb-md">Settings</div>

    <section class="hotaru-panel settings-card">
      <h2 class="settings-card__title">Start over</h2>
      <p class="settings-card__body">
        Sets every word back to New for
        <strong>{{ activeName }}</strong> and forgets which ones were firming
        up. Your words and your notes stay exactly as they are.
      </p>
      <p class="settings-card__body settings-card__body--quiet">
        Nothing is held against you here — a clean slate costs nothing but the
        progress you have earned.
      </p>

      <q-btn
        class="settings-danger full-width"
        unelevated
        no-caps
        :disable="store.loading || userStore.activeUser === null"
        :label="`Reset ${activeName}'s progress`"
        data-testid="reset-progress"
        @click="confirmOpen = true"
      />

      <p v-if="store.error" class="settings-error" data-testid="reset-error">
        {{ store.error }}
      </p>
      <p v-if="done" class="settings-done" data-testid="reset-done">
        Progress reset. Every word is New again.
      </p>
    </section>

    <q-dialog v-model="confirmOpen">
      <q-card class="hotaru-app settings-confirm">
        <q-card-section>
          <div class="settings-confirm__title">
            Reset {{ activeName }}'s progress?
          </div>
          <p class="settings-confirm__line">
            <span class="settings-confirm__mark settings-confirm__mark--go"
              >Cleared</span
            >
            every word's familiarity — the whole library returns to New.
          </p>
          <p class="settings-confirm__line">
            <span class="settings-confirm__mark settings-confirm__mark--keep"
              >Kept</span
            >
            your words, your notes, and everything shared.
          </p>
          <p class="settings-confirm__warn">This cannot be undone.</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            label="Cancel"
            data-testid="reset-cancel"
            @click="confirmOpen = false"
          />
          <q-btn
            unelevated
            no-caps
            class="settings-danger settings-danger--compact"
            label="Reset"
            data-testid="reset-confirm"
            @click="onReset"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AvatarSwitcher from "@/apps/hotaru/components/AvatarSwitcher.vue";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import "./../css/hotaru.sass";

const userStore = useHotaruUserStore();
const store = useHotaruLibraryStore();
const router = useRouter();

const confirmOpen = ref(false);
const done = ref(false);

// Naming the learner is the safety mechanism: an unnamed "Reset progress" is
// how one person wipes the other's months without noticing who is signed in.
const activeName = computed(() => userStore.activeUser?.name ?? "");

onMounted(async () => {
  if (userStore.users.length === 0) {
    await userStore.loadUsers();
  }
  if (userStore.activeUser === null) {
    void router.replace("/hotaru/identity");
  }
});

async function onReset(): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  confirmOpen.value = false;
  done.value = false;
  const ok = await store.resetProgress(user);
  if (ok) done.value = true;
}
</script>

<style scoped lang="sass">
.hotaru-topbar
  min-height: 40px

.settings-title
  font-size: 24px
  font-weight: 600
  color: var(--hotaru-cream)

.settings-card
  padding: 20px

.settings-card__title
  font-size: 16px
  font-weight: 600
  margin: 0 0 10px
  color: var(--hotaru-cream)

.settings-card__body
  font-size: 14px
  line-height: 1.5
  margin: 0 0 10px
  color: var(--hotaru-cream-soft)

  strong
    color: var(--hotaru-cream)
    font-weight: 600

.settings-card__body--quiet
  color: var(--hotaru-sage)
  margin-bottom: 18px

// Magenta reads as consequence against the neon dusk without borrowing cyan,
// which is reserved for the primary/affirmative accent.
.settings-danger
  height: 52px
  border-radius: 14px
  font-size: 15px
  background: rgba(255, 92, 200, 0.14)
  color: #ff8fd8
  border: 1px solid rgba(255, 92, 200, 0.45)

.settings-danger--compact
  height: 40px
  padding: 0 20px
  font-size: 14px

.settings-error
  margin: 12px 0 0
  font-size: 13px
  color: #ff8fd8

.settings-done
  margin: 12px 0 0
  font-size: 13px
  color: var(--hotaru-bamboo-bright)

.settings-confirm
  border-radius: 18px
  max-width: 340px
  background: var(--hotaru-surface)
  border: 1px solid rgba(155, 107, 255, 0.28)

.settings-confirm__title
  font-size: 16px
  font-weight: 600
  margin-bottom: 14px
  color: var(--hotaru-cream)

.settings-confirm__line
  font-size: 13px
  line-height: 1.5
  margin: 0 0 8px
  color: var(--hotaru-cream-soft)

.settings-confirm__mark
  display: inline-block
  min-width: 58px
  font-size: 11px
  font-weight: 700
  letter-spacing: 0.5px
  text-transform: uppercase

.settings-confirm__mark--go
  color: #ff8fd8

.settings-confirm__mark--keep
  color: var(--hotaru-bamboo-bright)

.settings-confirm__warn
  margin: 14px 0 0
  font-size: 12px
  color: var(--hotaru-sage)
</style>
