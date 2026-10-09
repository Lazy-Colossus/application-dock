<template>
  <div class="sheet" data-testid="household-sheet">
    <p class="sheet__title">Who shares this cabinet</p>

    <ul class="household__members">
      <li
        v-for="member in members"
        :key="member"
        class="household__member"
        :data-testid="`household-member-${member}`"
      >
        <span>
          {{ member }}
          <small v-if="member === household.cabinet?.owner"> · owner</small>
          <small v-if="member === me"> · you</small>
        </span>
        <button
          v-if="isOwner && member !== me"
          class="household__remove"
          :data-testid="`household-remove-${member}`"
          @click="household.removeMember(member)"
        >
          Remove
        </button>
      </li>
    </ul>

    <p
      v-if="household.error"
      class="household__error"
      data-testid="household-error"
    >
      {{ household.error }}
    </p>
    <button
      v-if="household.error"
      class="sheet__cancel"
      data-testid="household-retry"
      @click="household.fetchCabinet()"
    >
      Try again
    </button>

    <template v-if="loaded">
      <template v-if="isOwner">
        <label class="household__label" for="household-add">Add someone</label>
        <input
          id="household-add"
          v-model="draft"
          class="sheet__field"
          list="household-roster"
          placeholder="their dock username"
          data-testid="household-add-input"
        />
        <datalist id="household-roster">
          <option v-for="name in addable" :key="name" :value="name" />
        </datalist>
        <button
          class="sheet__save"
          data-testid="household-add"
          :disabled="draft.trim() === '' || household.loading"
          @click="add"
        >
          Add to cabinet
        </button>
      </template>

      <template v-else-if="confirmingLeave">
        <p class="household__hint">
          You'll start with an empty cabinet. Everything you logged stays here.
        </p>
        <button
          class="sheet__save"
          data-testid="household-leave-yes"
          @click="leave"
        >
          Leave cabinet
        </button>
        <button
          class="sheet__cancel"
          data-testid="household-leave-no"
          @click="confirmingLeave = false"
        >
          Stay
        </button>
      </template>
      <button
        v-else
        class="sheet__cancel"
        data-testid="household-leave"
        @click="confirmingLeave = true"
      >
        Leave cabinet
      </button>
    </template>

    <button
      class="sheet__cancel"
      data-testid="household-close"
      @click="emit('close')"
    >
      Close
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";

const emit = defineEmits<{ close: [] }>();

const household = useTeaHouseholdStore();
const auth = useAuthStore();

const roster = ref<string[]>([]);
const draft = ref("");
const confirmingLeave = ref(false);

const me = computed(() => auth.username);
const members = computed(() => household.cabinet?.members ?? []);
const loaded = computed(() => household.cabinet !== null);
const isOwner = computed(() => household.cabinet?.is_owner ?? false);
const addable = computed(() =>
  roster.value.filter((u) => u !== me.value && !members.value.includes(u)),
);

onMounted(async () => {
  await household.fetchCabinet();
  roster.value = await household.fetchRoster();
});

async function add(): Promise<void> {
  if (await household.addMember(draft.value.trim())) draft.value = "";
}

async function leave(): Promise<void> {
  if (await household.leave()) emit("close");
}
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.household__members {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}
.household__member {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid #241e19;
  color: #efe7da;
  font-size: 14px;
}
.household__member small {
  color: #8b7a63;
}
.household__remove {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-size: 13px;
  cursor: pointer;
}
.household__label {
  display: block;
  color: #8b7a63;
  font-size: 13px;
  margin-top: 6px;
}
.household__error,
.household__hint {
  color: #d9a45b;
  font-size: 13px;
  margin: 6px 0;
}
</style>
