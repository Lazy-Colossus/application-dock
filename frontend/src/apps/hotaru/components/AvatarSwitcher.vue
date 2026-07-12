<template>
  <button
    v-if="active"
    class="avatar-switcher"
    :class="`avatar-switcher--${active.id}`"
    data-testid="avatar-switcher"
  >
    <span class="avatar-switcher__initial">{{ active.name.charAt(0) }}</span>
    <q-menu anchor="bottom right" self="top right">
      <q-list style="min-width: 160px">
        <q-item
          v-if="other"
          clickable
          v-close-popup
          data-testid="switch-user"
          @click="switchTo(other.id)"
        >
          <q-item-section>Switch to {{ other.name }}</q-item-section>
        </q-item>
        <q-item
          clickable
          v-close-popup
          data-testid="settings"
          @click="onSettings"
        >
          <q-item-section>Settings</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";

const store = useHotaruUserStore();

const active = computed(() => store.activeUser);
const other = computed(
  () => store.users.find((u) => u.id !== store.activeUserId) ?? null,
);

function switchTo(id: string): void {
  store.setActiveUser(id);
}

function onSettings(): void {
  // TODO(later): open Settings. No Settings screen exists yet.
}
</script>

<style scoped lang="sass">
.avatar-switcher
  border: none
  cursor: pointer
  padding: 0
  background: transparent

.avatar-switcher__initial
  width: 38px
  height: 38px
  border-radius: 9999px
  display: flex
  align-items: center
  justify-content: center
  font-size: 16px
  font-weight: 700
  color: #22260f
  border: 2px solid rgba(246, 239, 218, 0.35)

.avatar-switcher--dani .avatar-switcher__initial
  background: var(--hotaru-fam-2)

.avatar-switcher--jake .avatar-switcher__initial
  background: var(--hotaru-fam-4)
</style>
