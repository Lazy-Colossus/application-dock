<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="share-sheet-dialog" data-testid="share-dialog">
      <q-card-section class="text-h6"
        >Share “{{ store.currentSheet?.name }}”</q-card-section
      >

      <q-card-section
        v-if="store.error"
        class="text-negative"
        data-testid="share-error"
      >
        {{ store.error }}
      </q-card-section>

      <q-card-section v-if="store.shared" class="column q-gutter-xs">
        <div class="text-caption text-grey-6">People with access</div>
        <div
          v-for="member in members"
          :key="member"
          class="row items-center justify-between"
          :data-testid="`member-${member}`"
        >
          <div>
            {{ member }}
            <span v-if="member === store.owner" class="text-caption text-grey-6"
              >(owner)</span
            >
          </div>
          <template v-if="member !== store.owner">
            <template v-if="confirmingRemove === member">
              <div class="row items-center q-gutter-xs">
                <q-btn
                  dense
                  flat
                  no-caps
                  color="negative"
                  label="Remove"
                  :data-testid="`remove-confirm-${member}`"
                  @click="doRemove(member)"
                />
                <q-btn
                  dense
                  flat
                  no-caps
                  label="Keep"
                  :data-testid="`remove-cancel-${member}`"
                  @click="confirmingRemove = null"
                />
              </div>
            </template>
            <q-btn
              v-else
              dense
              flat
              round
              icon="close"
              :data-testid="`remove-member-${member}`"
              @click="confirmingRemove = member"
            />
          </template>
        </div>
      </q-card-section>

      <q-card-section class="column q-gutter-xs">
        <div class="text-caption text-grey-6">
          {{ store.shared ? "Add more people" : "Choose who to share with" }}
        </div>
        <div
          v-if="addable.length === 0"
          class="text-caption text-grey-6"
          data-testid="no-one-to-add"
        >
          Everyone is already on this sheet.
        </div>
        <q-checkbox
          v-for="username in addable"
          :key="username"
          :model-value="selected.has(username)"
          :label="username"
          dense
          :data-testid="`add-user-${username}`"
          @update:model-value="toggle(username)"
        />
      </q-card-section>

      <q-card-actions align="right">
        <template v-if="confirmingStop">
          <span class="text-caption q-mr-sm">Stop sharing this sheet?</span>
          <q-btn
            flat
            no-caps
            color="negative"
            label="Stop sharing"
            data-testid="stop-confirm"
            @click="doStop"
          />
          <q-btn
            flat
            no-caps
            label="Keep sharing"
            data-testid="stop-cancel"
            @click="confirmingStop = false"
          />
        </template>
        <template v-else>
          <q-btn
            v-if="store.shared"
            flat
            no-caps
            color="negative"
            label="Stop sharing"
            data-testid="share-stop"
            @click="confirmingStop = true"
          />
          <q-space />
          <q-btn
            flat
            no-caps
            label="Close"
            data-testid="share-close"
            @click="close"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            :label="store.shared ? 'Add' : 'Share'"
            :disable="selected.size === 0"
            data-testid="share-add"
            @click="addSelected"
          />
        </template>
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { useAuthStore } from "@/stores/useAuthStore";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const store = useListiesStore();
const auth = useAuthStore();

const roster = ref<string[]>([]);
const selected = ref<Set<string>>(new Set());
const confirmingRemove = ref<string | null>(null);
const confirmingStop = ref(false);

const members = computed(() => store.members ?? []);

// The picker offers everyone on the platform except me and current members.
const addable = computed(() =>
  roster.value.filter((u) => u !== auth.username && !members.value.includes(u)),
);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    selected.value = new Set();
    confirmingRemove.value = null;
    confirmingStop.value = false;
    roster.value = await store.fetchUsers();
  },
  { immediate: true },
);

function toggle(username: string): void {
  const next = new Set(selected.value);
  if (next.has(username)) next.delete(username);
  else next.add(username);
  selected.value = next;
}

async function addSelected(): Promise<void> {
  if (selected.value.size === 0) return;
  await store.shareSheet([...selected.value]);
  // Only clear the picker if the write succeeded; keep the dialog usable.
  if (!store.error) selected.value = new Set();
}

async function doRemove(username: string): Promise<void> {
  await store.removeMember(username);
  confirmingRemove.value = null;
}

async function doStop(): Promise<void> {
  await store.stopSharing();
  confirmingStop.value = false;
  if (!store.error) emit("update:modelValue", false);
}

function close(): void {
  emit("update:modelValue", false);
}
</script>
