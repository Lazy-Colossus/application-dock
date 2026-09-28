<template>
  <div class="chaxi">
    <div class="chaxi__photo">
      <img v-if="shown" class="chaxi__img" data-testid="chaxi-photo-img" :src="shown" alt="" />
      <div class="chaxi__photo-actions">
        <button
          class="chaxi__photo-pick"
          data-testid="chaxi-photo-pick"
          :disabled="photoSaving"
          @click="input?.click()"
        >
          {{ photoSaving ? "Saving photo…" : shown ? "Replace photo" : "+ photo of the table" }}
        </button>
        <button
          v-if="shown"
          class="chaxi__photo-remove"
          data-testid="chaxi-photo-remove"
          :disabled="photoSaving"
          @click="onRemove"
        >
          Remove
        </button>
      </div>
      <input
        ref="input"
        type="file"
        accept="image/*"
        hidden
        data-testid="chaxi-photo-input"
        @change="onFile"
      />
      <p v-if="photoError" class="chaxi__error" data-testid="chaxi-photo-error">
        {{ photoError }}
        <button v-if="pending" data-testid="chaxi-photo-retry" @click="emit('photo', pending)">
          Try again
        </button>
      </p>
    </div>

    <div class="chaxi__moods" role="group" aria-label="Mood">
      <button
        v-for="mood in MOODS"
        :key="mood"
        :class="['chaxi__mood', { 'chaxi__mood--on': modelValue.moods.includes(mood) }]"
        :aria-pressed="modelValue.moods.includes(mood) ? 'true' : 'false'"
        :data-testid="`chaxi-mood-${mood}`"
        @click="update({ moods: toggleMood(modelValue.moods, mood) })"
      >
        {{ mood }}
      </button>
    </div>

    <label class="chaxi__label">
      Guests
      <input
        class="chaxi__field"
        data-testid="chaxi-guests"
        placeholder="who shared the table"
        :value="modelValue.guests"
        @input="update({ guests: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <label class="chaxi__label">
      Notes
      <textarea
        class="chaxi__field chaxi__notes"
        data-testid="chaxi-notes"
        rows="5"
        placeholder="the leaves, the liquor, the light…"
        :value="modelValue.notes"
        @input="update({ notes: ($event.target as HTMLTextAreaElement).value })"
      ></textarea>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { MOODS, toggleMood } from "../journal";
import type { ChaXi } from "../types";

const props = defineProps<{
  modelValue: ChaXi;
  photoSrc: string | null;
  photoSaving: boolean;
  photoError: string | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: ChaXi];
  photo: [file: File];
  "remove-photo": [];
}>();

const input = ref<HTMLInputElement | null>(null);
// The last picked file: shown straight away, and re-sent by Try again.
const pending = shallowRef<File | null>(null);
const preview = ref<string | null>(null);
// A replaced photo is served at the same URL, so the local preview beats a cached old image.
const shown = computed(() => preview.value ?? props.photoSrc);

function update(patch: Partial<ChaXi>): void {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function revokePreview(): void {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = null;
}

function onFile(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;
  pending.value = file;
  revokePreview();
  if (typeof URL.createObjectURL === "function") preview.value = URL.createObjectURL(file);
  emit("photo", file);
}

function onRemove(): void {
  pending.value = null;
  revokePreview();
  emit("remove-photo");
}

onBeforeUnmount(revokePreview);
</script>

<style scoped lang="scss">
.chaxi {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 12px;
}
.chaxi__img {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.chaxi__photo-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.chaxi__photo-pick,
.chaxi__photo-remove {
  background: #1e1712;
  border: 1px dashed #2c241d;
  border-radius: 6px;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 15px;
  padding: 14px;
  flex: 1;
  cursor: pointer;
}
.chaxi__photo-remove {
  flex: 0 0 auto;
  border-style: solid;
  color: #8b7a63;
}
.chaxi__error {
  color: #efe7da;
  border-left: 2px solid #e4d9c6;
  padding-left: 10px;
  margin: 8px 0 0;
}
.chaxi__error button {
  background: transparent;
  border: 0;
  color: #e4d9c6;
  text-decoration: underline;
  font-family: inherit;
  cursor: pointer;
}
.chaxi__moods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chaxi__mood {
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 999px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  cursor: pointer;
}
.chaxi__mood--on {
  background: #2c241d;
  border-color: #6b5f52;
  color: #efe7da;
}
.chaxi__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8b7a63;
  font-size: 13px;
}
.chaxi__field {
  background: #1e1712;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  padding: 10px 12px;
}
.chaxi__notes {
  resize: vertical;
  min-height: 110px;
}
</style>
