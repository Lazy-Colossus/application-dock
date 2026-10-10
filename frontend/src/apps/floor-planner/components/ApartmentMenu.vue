<template>
  <button
    type="button"
    class="apartment-menu__trigger"
    aria-haspopup="menu"
    data-testid="apartment-menu"
  >
    <span class="apartment-menu__name">{{ current?.name ?? "…" }}</span>
    <span aria-hidden="true">▾</span>
    <q-menu
      v-model="open"
      class="floor-planner-panel apartment-menu"
      anchor="bottom left"
      @before-show="emit('show')"
    >
      <div class="apartment-menu__body">
        <ul class="apartment-menu__list" role="menu">
          <li v-for="a in apartments" :key="a.id" role="none">
            <button
              type="button"
              role="menuitem"
              class="apartment-menu__item"
              :class="{ 'apartment-menu__item--current': a.id === current?.id }"
              :aria-current="a.id === current?.id"
              :data-testid="`apartment-${a.id}`"
              @click="pick(a.id)"
            >
              <span class="apartment-menu__item-name">{{ a.name }}</span>
              <small>{{ a.members.join(", ") }}</small>
            </button>
          </li>
        </ul>
        <div class="apartment-menu__actions">
          <button
            type="button"
            class="fp-button"
            data-testid="apartment-new"
            @click="
              open = false;
              emit('create');
            "
          >
            New apartment
          </button>
          <button
            type="button"
            class="fp-button"
            :disabled="!current"
            data-testid="apartment-duplicate"
            @click="
              open = false;
              emit('duplicate');
            "
          >
            Duplicate
          </button>
          <button
            type="button"
            class="fp-button"
            :disabled="!current"
            data-testid="apartment-rename"
            @click="
              open = false;
              emit('rename');
            "
          >
            Rename
          </button>
          <button
            v-if="current?.is_owner"
            type="button"
            class="fp-button apartment-menu__delete"
            data-testid="apartment-delete"
            @click="
              open = false;
              emit('remove');
            "
          >
            Delete
          </button>
        </div>
      </div>
    </q-menu>
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { ApartmentSummary } from "../types";
import "../css/floor-planner.sass";

defineProps<{
  apartments: ApartmentSummary[];
  current: ApartmentSummary | null;
}>();

const emit = defineEmits<{
  show: [];
  open: [id: string];
  create: [];
  duplicate: [];
  rename: [];
  remove: [];
}>();

const open = ref(false);

function pick(id: string): void {
  open.value = false;
  emit("open", id);
}
</script>

<style scoped lang="scss">
.apartment-menu__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--fp-line);
  border-radius: 6px;
  background: transparent;
  color: var(--fp-ink);
  font: 600 14px/1 var(--fp-sans);
  cursor: pointer;
}
.apartment-menu__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The menu's root is teleported out of this component's scope; style an inner box. */
.apartment-menu__body {
  min-width: 260px;
  padding: 6px;
}
.apartment-menu__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.apartment-menu__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fp-ink);
  font: 500 14px/1.2 var(--fp-sans);
  text-align: left;
  cursor: pointer;
  &:hover {
    background: #f1efea;
  }
  small {
    color: var(--fp-muted);
    font-size: 12px;
  }
}
.apartment-menu__item--current {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
.apartment-menu__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--fp-line);
}
.apartment-menu__delete {
  color: #b42318;
}
</style>
