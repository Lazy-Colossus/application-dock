<template>
  <div class="bulk floor-planner-panel" data-testid="bulk-dialog">
    <h2 class="bulk__title">Bulk add from a list</h2>
    <p class="bulk__help">
      One piece per line:
      <span class="fp-mono">name; shape; size; colour; note</span>. Shapes are
      rectangle, round, oval and egg. Sizes are whole cm,
      <span class="fp-mono">W x D</span>, or one diameter for round. The note is
      optional.
    </p>
    <textarea
      v-model="text"
      class="fp-mono bulk__text"
      rows="7"
      :placeholder="EXAMPLE"
      spellcheck="false"
      data-testid="bulk-text"
    />
    <table v-if="parsed.length" class="bulk__table" data-testid="bulk-preview">
      <tbody>
        <tr
          v-for="l in parsed"
          :key="l.line"
          :class="l.ok ? 'bulk__row--ok' : 'bulk__row--bad'"
          :data-testid="`bulk-line-${l.line}`"
        >
          <td class="fp-mono bulk__line">{{ l.line }}</td>
          <td class="bulk__mark">{{ l.ok ? "✓ OK" : "✗ Skipped" }}</td>
          <td v-if="l.ok" class="bulk__piece">
            <span
              class="bulk__swatch"
              :style="{ background: colourHex(l.piece.colour) }"
              :aria-label="l.piece.colour"
            />
            {{ l.piece.name }} · {{ l.piece.shape }} ·
            <span class="fp-mono">{{ sizeLabel(l.piece) }}</span>
          </td>
          <td v-else class="bulk__reason">{{ l.reason }}</td>
        </tr>
      </tbody>
    </table>
    <div class="bulk__actions">
      <span v-if="skipped" class="bulk__skipped" data-testid="bulk-skipped">
        {{ skipped }} line{{ skipped === 1 ? "" : "s" }} will be skipped
      </span>
      <span class="bulk__spacer" />
      <button type="button" class="fp-button" @click="emit('cancel')">
        Cancel
      </button>
      <button
        type="button"
        class="fp-button fp-button--primary"
        :disabled="good.length === 0"
        data-testid="bulk-add"
        @click="emit('add', good)"
      >
        Add {{ good.length }} piece{{ good.length === 1 ? "" : "s" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { colourHex, sizeLabel, type PieceDraft } from "../furniture";
import { parseFurnitureList } from "../furnitureFormat";
import "../css/floor-planner.sass";

const EXAMPLE = [
  "Sofa; rectangle; 220 x 95; grey; IKEA Kivik",
  "Coffee table; round; 80; brown",
  "Egg chair; egg; 85 x 90; green",
].join("\n");

const emit = defineEmits<{ add: [pieces: PieceDraft[]]; cancel: [] }>();

const text = ref("");
const parsed = computed(() => parseFurnitureList(text.value));
const good = computed(() =>
  parsed.value.flatMap((l) => (l.ok ? [l.piece] : [])),
);
const skipped = computed(() => parsed.value.length - good.value.length);
</script>

<style scoped lang="scss">
.bulk {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(640px, 90vw);
  max-height: 85vh;
  padding: 20px;
  box-sizing: border-box;
  overflow: auto;
  border-radius: 8px;
}
.bulk__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.bulk__help {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #4a4843;
}
.bulk__text {
  box-sizing: border-box;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}
.bulk__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.bulk__table td {
  padding: 6px 8px;
  border-bottom: 1px solid #e6e3dc;
  vertical-align: middle;
}
.bulk__line {
  width: 28px;
  color: var(--fp-muted);
}
.bulk__mark {
  width: 84px;
  font-weight: 600;
}
.bulk__row--ok .bulk__mark {
  color: var(--fp-locked-ink);
}
.bulk__row--bad .bulk__mark,
.bulk__reason {
  color: var(--fp-warn-ink);
}
.bulk__swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  border: 1px solid rgba(0, 0, 0, 0.4);
  border-radius: 2px;
  vertical-align: -1px;
}
.bulk__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bulk__spacer {
  flex: 1;
}
.bulk__skipped {
  font-size: 13px;
  color: var(--fp-warn-ink);
}
</style>
