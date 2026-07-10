<template>
  <q-page class="hotaru-app column no-wrap flex-center q-pa-md">
    <FireflyLayer />
    <div class="identity-heading hotaru-glow q-mb-xl">Who's studying?</div>

    <div class="row justify-center q-gutter-lg">
      <button
        v-for="user in store.users"
        :key="user.id"
        class="identity-avatar column flex-center"
        :class="`identity-avatar--${user.id}`"
        :data-testid="`pick-${user.id}`"
        @click="pick(user.id)"
      >
        <span class="identity-avatar__initial">{{ user.name.charAt(0) }}</span>
        <span class="identity-avatar__name">{{ user.name }}</span>
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import "./../css/hotaru.sass";

const store = useHotaruUserStore();
const router = useRouter();

onMounted(() => {
  if (store.users.length === 0) {
    void store.loadUsers();
  }
});

function pick(id: string): void {
  store.setActiveUser(id);
  void router.replace("/hotaru");
}
</script>

<style scoped lang="sass">
.identity-heading
  font-size: 22px
  font-weight: 600
  color: var(--hotaru-cream)

.identity-avatar
  border: none
  background: transparent
  cursor: pointer
  gap: 8px

.identity-avatar__initial
  width: 88px
  height: 88px
  border-radius: 9999px
  display: flex
  align-items: center
  justify-content: center
  font-size: 36px
  font-weight: 700
  color: #22260f
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 22px rgba(255, 210, 74, 0.22)
  transition: transform 0.15s ease, box-shadow 0.15s ease

.identity-avatar:hover .identity-avatar__initial
  transform: translateY(-2px)
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 210, 74, 0.35)

.identity-avatar--dani .identity-avatar__initial
  background: var(--hotaru-fam-2)

.identity-avatar--jake .identity-avatar__initial
  background: var(--hotaru-fam-4)

.identity-avatar__name
  font-size: 15px
  color: var(--hotaru-cream-soft)
</style>
