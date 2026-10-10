<template>
  <div class="members floor-planner-panel" data-testid="members-dialog">
    <h2 class="members__title">People sharing this apartment</h2>
    <ul class="members__list">
      <li
        v-for="member in members"
        :key="member"
        :data-testid="`members-member-${member}`"
      >
        <span>
          {{ member }}
          <small v-if="member === store.apartment?.owner"> · owner</small>
          <small v-if="member === me"> · you</small>
        </span>
        <button
          v-if="isOwner && member !== me"
          type="button"
          class="fp-button"
          :data-testid="`members-remove-${member}`"
          @click="store.removeMember(member)"
        >
          Remove
        </button>
      </li>
    </ul>

    <p v-if="store.error" class="members__error" data-testid="members-error">
      {{ store.error }}
    </p>

    <div v-if="isOwner" class="members__add">
      <label class="members__label" for="members-add">Add someone</label>
      <div class="members__row">
        <input
          id="members-add"
          v-model="draft"
          list="members-roster"
          placeholder="their dock username"
          data-testid="members-add-input"
        />
        <datalist id="members-roster">
          <option v-for="name in addable" :key="name" :value="name" />
        </datalist>
        <button
          type="button"
          class="fp-button fp-button--primary"
          data-testid="members-add"
          :disabled="draft.trim() === '' || store.loading"
          @click="add"
        >
          Add
        </button>
      </div>
    </div>
    <div v-else-if="confirmingLeave" class="members__row">
      <p class="members__hint">
        It leaves your list; everything here stays with the others.
      </p>
      <button
        type="button"
        class="fp-button"
        data-testid="members-leave-yes"
        @click="leave"
      >
        Leave
      </button>
      <button type="button" class="fp-button" @click="confirmingLeave = false">
        Stay
      </button>
    </div>
    <button
      v-else
      type="button"
      class="fp-button"
      data-testid="members-leave"
      @click="confirmingLeave = true"
    >
      Leave this apartment
    </button>

    <div class="members__footer">
      <button
        type="button"
        class="fp-button"
        data-testid="members-close"
        @click="emit('close')"
      >
        Close
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import { useAuthStore } from "@/stores/useAuthStore";
import "../css/floor-planner.sass";

const emit = defineEmits<{ close: []; left: [nextId: string] }>();

const store = useFloorPlanStore();
const auth = useAuthStore();

const roster = ref<string[]>([]);
const draft = ref("");
const confirmingLeave = ref(false);

const me = computed(() => auth.username);
const members = computed(() => store.apartment?.members ?? []);
const isOwner = computed(() => store.apartment?.is_owner ?? false);
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
  const next = await store.leave();
  if (next) emit("left", next);
}
</script>

<style scoped lang="scss">
.members {
  padding: 20px;
  min-width: 340px;
  border-radius: 8px;
}
.members__title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}
.members__list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}
.members__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  border-bottom: 1px solid var(--fp-line);
  font-size: 14px;
}
.members__list small {
  color: var(--fp-muted);
}
.members__label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--fp-muted);
}
.members__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.members__row input {
  flex: 1;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  font: 400 14px var(--fp-sans);
  color: var(--fp-ink);
  background: var(--fp-chrome);
}
.members__hint,
.members__error {
  margin: 0 0 8px;
  font-size: 13px;
}
.members__error {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--fp-warn-bg);
  color: var(--fp-warn-ink);
}
.members__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
