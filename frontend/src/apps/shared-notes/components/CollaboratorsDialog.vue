<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="collaborators-dialog" style="min-width: 340px">
      <q-card-section class="text-h6">
        {{ canManage ? "Share this note" : "People with access" }}
      </q-card-section>

      <q-card-section
        v-if="store.error"
        class="text-negative"
        data-testid="share-error"
      >
        {{ store.error }}
      </q-card-section>

      <q-card-section class="column q-gutter-xs">
        <div class="text-caption text-grey-6">People with access</div>
        <div
          v-for="member in members"
          :key="member"
          class="row items-center justify-between"
          :data-testid="`member-${member}`"
        >
          <div>
            {{ member }}
            <span v-if="member === owner" class="text-caption text-grey-6">
              (owner)
            </span>
          </div>

          <!-- The owner is permanent; only they manage anyone else. -->
          <template v-if="canManage && member !== owner">
            <div v-if="confirmingRemove === member" class="row q-gutter-xs">
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
            <q-btn
              v-else
              dense
              flat
              round
              icon="close"
              :data-testid="`remove-${member}`"
              @click="confirmingRemove = member"
            />
          </template>
        </div>
      </q-card-section>

      <q-card-section v-if="canManage" class="column q-gutter-xs">
        <div class="text-caption text-grey-6">Add people</div>
        <div v-if="candidates.length === 0" class="text-grey-6">
          Everyone on the dock already has access.
        </div>
        <q-option-group
          v-else
          v-model="picked"
          type="checkbox"
          :options="candidates.map((u) => ({ label: u, value: u }))"
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          flat
          no-caps
          label="Close"
          data-testid="collaborators-close"
          @click="emit('update:modelValue', false)"
        />
        <q-btn
          v-if="canManage"
          unelevated
          no-caps
          color="primary"
          label="Share"
          :disable="picked.length === 0"
          data-testid="share-submit"
          @click="doShare"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useSharedNotesStore } from "@/apps/shared-notes/stores/useSharedNotesStore";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const store = useSharedNotesStore();
const picked = ref<string[]>([]);
const confirmingRemove = ref<string | null>(null);

const members = computed(() => store.currentNote?.members ?? []);
const owner = computed(() => store.currentNote?.owner ?? "");
const canManage = computed(() => store.currentNote?.can_manage ?? false);

// Offering someone who already has access would just be a no-op request.
const candidates = computed(() =>
  store.dockUsers.filter((u) => !members.value.includes(u)),
);

onMounted(() => {
  // A member who cannot share has no use for the platform roster, and asking
  // for it would leak the dock's user list to them for nothing.
  if (canManage.value) void store.fetchDockUsers();
});

async function doShare(): Promise<void> {
  if (picked.value.length === 0) return;
  const usernames = [...picked.value];
  await store.shareNote(store.currentNote!.id, usernames);
  if (!store.error) picked.value = [];
}

async function doRemove(username: string): Promise<void> {
  await store.removeMember(store.currentNote!.id, username);
  confirmingRemove.value = null;
}
</script>
