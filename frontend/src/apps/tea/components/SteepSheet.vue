<template>
  <div class="sheet" data-testid="steep-sheet">
    <p class="sheet__title">How long did infusion {{ number }} steep?</p>
    <label class="steep__label">
      Time (seconds or m:ss)
      <input
        v-model="raw"
        class="sheet__field"
        data-testid="steep-seconds"
        inputmode="numeric"
        placeholder="e.g. 30 or 1:15"
      />
    </label>
    <button
      class="sheet__save"
      data-testid="steep-save"
      :disabled="parsed === null"
      @click="parsed !== null && emit('save', parsed)"
    >
      Save
    </button>
    <button
      class="sheet__cancel"
      data-testid="steep-cancel"
      @click="emit('cancel')"
    >
      Cancel
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{ number: number; seconds: number }>();
const emit = defineEmits<{ save: [seconds: number]; cancel: [] }>();

const raw = ref(String(props.seconds));

const parsed = computed(() => {
  const text = raw.value.trim();
  const plain = /^\d+$/.exec(text);
  if (plain) return Number(text);
  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  return clock ? Number(clock[1]) * 60 + Number(clock[2]) : null;
});
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.steep__label {
  display: block;
  color: #8b7a63;
  font-size: 12px;
}
</style>
