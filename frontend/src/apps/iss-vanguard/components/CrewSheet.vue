<template>
  <div class="crew" data-testid="crew-sheet">
    <p class="crew__title">Crew aboard this ship</p>
    <ul class="crew__members">
      <li
        v-for="member in members"
        :key="member"
        :data-testid="`crew-member-${member}`"
      >
        <span>
          {{ member }}
          <small v-if="member === store.ship?.owner"> · owner</small>
          <small v-if="member === me"> · you</small>
        </span>
        <button
          v-if="isOwner && member !== me"
          type="button"
          :data-testid="`crew-remove-${member}`"
          @click="store.removeMember(member)"
        >
          Remove
        </button>
      </li>
    </ul>

    <p v-if="store.error" class="crew__error" data-testid="crew-error">
      {{ store.error }}
    </p>

    <template v-if="isOwner">
      <label class="crew__label" for="crew-add">Add crew</label>
      <input
        id="crew-add"
        v-model="draft"
        list="crew-roster"
        placeholder="their dock username"
        data-testid="crew-add-input"
      />
      <datalist id="crew-roster">
        <option v-for="name in addable" :key="name" :value="name" />
      </datalist>
      <button
        type="button"
        data-testid="crew-add"
        :disabled="draft.trim() === '' || store.loading"
        @click="add"
      >
        Add to ship
      </button>
    </template>
    <template v-else-if="confirmingLeave">
      <p class="crew__hint">
        You'll start with an empty ship. Everything here stays with the crew.
      </p>
      <button type="button" data-testid="crew-leave-yes" @click="leave">
        Leave ship
      </button>
      <button type="button" @click="confirmingLeave = false">Stay</button>
    </template>
    <button
      v-else
      type="button"
      data-testid="crew-leave"
      @click="confirmingLeave = true"
    >
      Leave ship
    </button>

    <button type="button" data-testid="crew-close" @click="emit('close')">
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useShipStore } from "../stores/useShipStore";
import { useAuthStore } from "@/stores/useAuthStore";

const emit = defineEmits<{ close: []; left: [] }>();

const store = useShipStore();
const auth = useAuthStore();

const roster = ref<string[]>([]);
const draft = ref("");
const confirmingLeave = ref(false);

const me = computed(() => auth.username);
const members = computed(() => store.ship?.members ?? []);
const isOwner = computed(() => store.ship?.is_owner ?? false);
const addable = computed(() =>
  roster.value.filter((u) => u !== me.value && !members.value.includes(u)),
);

onMounted(async () => {
  roster.value = await store.fetchRoster();
});

async function add(): Promise<void> {
  if (await store.addMember(draft.value.trim())) draft.value = "";
}

async function leave(): Promise<void> {
  if (await store.leave()) emit("left");
}
</script>

<style scoped lang="scss">
.crew {
  padding: 16px;
  min-width: 280px;
}
.crew__title {
  font-size: 16px;
  margin: 0 0 8px;
}
.crew__members {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}
.crew__members li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}
.crew__label {
  display: block;
  font-size: 13px;
  margin-top: 6px;
}
.crew__error,
.crew__hint {
  font-size: 13px;
  margin: 6px 0;
}
.crew__error {
  color: #e05757;
}
</style>
