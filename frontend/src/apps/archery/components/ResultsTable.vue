<template>
  <div class="results-table-wrap">
    <table class="results-table" role="table">
      <thead>
        <tr>
          <th class="results-table__th results-table__td--target">Target</th>
          <th
            v-for="archer in session.archers"
            :key="archer"
            class="results-table__th"
          >
            <div>{{ archer }}</div>
            <div class="results-table__total">{{ totalFor(session, archer) }}</div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="n in 18" :key="n" class="results-table__row">
          <td class="results-table__td results-table__td--target">{{ n }}</td>
          <td
            v-for="archer in session.archers"
            :key="archer"
            class="results-table__td"
          >
            <template v-if="scoreFor(n, archer)">
              <span class="results-table__shots">
                {{ scoreFor(n, archer)![0] ?? 0 }} / {{ scoreFor(n, archer)![1] ?? 0 }}
              </span>
              <span class="results-table__sub">
                = {{ (scoreFor(n, archer)![0] ?? 0) + (scoreFor(n, archer)![1] ?? 0) }}
              </span>
            </template>
            <span v-else class="results-table__empty">—</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { SessionData } from '@/apps/archery/types';
import { totalFor } from '@/apps/archery/composables/useScores';

const props = defineProps<{ session: SessionData }>();

function scoreFor(targetNumber: number, archer: string): [number | null, number | null] | null {
  const t = props.session.targets.find((x) => x.number === targetNumber);
  return t?.scores[archer] ?? null;
}
</script>

<style scoped lang="sass">
.results-table-wrap
  overflow-x: auto
  background: #242424
  border-radius: 12px
  padding: 16px

.results-table
  width: 100%
  border-collapse: collapse

.results-table__th
  position: sticky
  top: 0
  background: #242424
  text-align: center
  padding: 8px 12px
  font-size: 14px
  color: #F0F0F0
  white-space: nowrap
  z-index: 1

.results-table__total
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 20px
  color: #F0F0F0

.results-table__td--target
  color: #8A8A8A
  font-family: 'Roboto Mono', monospace
  font-size: 14px
  min-width: 52px

.results-table__row
  height: 44px

  &:nth-child(even)
    background: rgba(255, 255, 255, 0.03)

.results-table__td
  text-align: center
  padding: 4px 12px
  vertical-align: middle

.results-table__shots
  display: block
  font-family: 'Roboto Mono', monospace
  font-size: 13px
  color: #F0F0F0

.results-table__sub
  display: block
  font-family: 'Roboto Mono', monospace
  font-size: 11px
  color: #C8960A

.results-table__empty
  color: #4A4A4A
  font-size: 16px
</style>
