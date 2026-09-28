<template>
  <svg viewBox="0 0 48 48" :data-icon="name" aria-hidden="true">
    <template v-if="name === 'leaf'">
      <path
        v-for="d in LEAF_PATHS"
        :key="d"
        :d="d"
        :fill="INK"
        fill-rule="evenodd"
      />
    </template>

    <!-- Brew is the Teaware pot itself, tipped over a cup. -->
    <g
      v-if="name === 'pot' || name === 'pour'"
      :transform="
        name === 'pour'
          ? 'translate(29 20) rotate(-35) scale(0.78) translate(-24.9 -27)'
          : undefined
      "
    >
      <path
        d="M39.5 21.8 C47.6 21 47.6 35.6 40 35.2"
        fill="none"
        :stroke="INK"
        stroke-width="2.8"
        stroke-linecap="round"
      />
      <g :fill="INK">
        <path
          d="M12.5 22.5 C9.5 21.8 7.6 20.6 6.3 19 L3.7 21 C4.8 23.6 6 26.6 8.2 30 Z"
        />
        <path
          d="M7.4 29 C7.4 22 14 17.5 24.9 17 C35.8 17.5 42.2 22 42.2 29 C42.2 34.5 38 38.5 33 39.2 L16.8 39.2 C11.6 38.5 7.4 34.5 7.4 29 Z"
        />
        <path d="M15.5 38.8 H34.3 L33.8 40.4 H16 Z" />
        <path
          d="M12.8 18.2 C14.5 15.5 19 14 24.5 14 C30 14 34.5 15.5 36.2 18.2 Z"
        />
        <circle cx="24.5" cy="11.4" r="2.9" />
        <path d="M23 13.6 H26 V15 H23 Z" />
      </g>
      <path
        d="M12.6 18.4 C18 19.6 31 19.6 36.4 18.4"
        fill="none"
        :stroke="CUT"
        stroke-width="0.9"
      />
    </g>
    <template v-if="name === 'pour'">
      <path
        d="M13.1 25.2 C12.6 29.5 12.4 33.5 12.6 37.6"
        fill="none"
        :stroke="INK"
        stroke-width="1.6"
        stroke-linecap="round"
      />
      <g :fill="INK">
        <path
          d="M5.9 38 H19.1 C18.6 42 16.1 44.2 12.5 44.2 C8.9 44.2 6.4 42 5.9 38 Z"
        />
        <path d="M10.1 44 H14.9 V45.2 H10.1 Z" />
      </g>
    </template>

    <template v-if="name === 'tome'">
      <g :fill="INK">
        <path d="M12 5 H35.5 Q37.5 5 37.5 7 V41 Q37.5 43 35.5 43 H12 Z" />
        <path d="M9.5 5 H12.5 V43 H9.5 Q8.5 43 8.5 42 V6 Q8.5 5 9.5 5 Z" />
        <path
          d="M7.4 10.8 H12.5 V13.4 H7.4 Z M7.4 22.7 H12.5 V25.3 H7.4 Z M7.4 34.6 H12.5 V37.2 H7.4 Z"
        />
        <path
          d="M33 21.3 H39.6 Q40.6 21.3 40.6 22.3 V25.7 Q40.6 26.7 39.6 26.7 H33 Z"
        />
      </g>
      <g fill="none" :stroke="CUT" stroke-width="1" stroke-linecap="round">
        <path d="M12.5 5 V43" />
        <path
          d="M30.5 5 L37.5 12 M30.5 43 L37.5 36 M12.5 11 L18.5 5 M12.5 37 L18.5 43"
        />
        <path d="M33 21.3 V26.7" />
        <circle cx="24" cy="24" r="7" stroke-width="1.2" />
      </g>
      <g :fill="CUT">
        <circle cx="37.2" cy="24" r="1.1" />
        <path d="M23.5 29.6 V22 H24.5 V29.6 Z" />
        <path
          d="M24 17.6 C22.4 19.1 22.4 21.2 24 22.8 C25.6 21.2 25.6 19.1 24 17.6 Z"
        />
        <path
          d="M23.9 25.8 C21.6 25.9 19.9 24.7 19.2 22.6 C21.5 22.6 23.1 23.8 23.9 25.8 Z"
        />
        <path
          d="M24.1 28 C26.4 28.1 28.1 26.9 28.8 24.8 C26.5 24.8 24.9 26 24.1 28 Z"
        />
      </g>
    </template>
    <!-- A thread-bound notebook with a small cup seal. -->
    <template v-if="name === 'journal'">
      <path
        :fill="INK"
        d="M11 6 H37 Q39 6 39 8 V40 Q39 42 37 42 H11 Q9 42 9 40 V8 Q9 6 11 6 Z"
      />
      <path d="M15 6 V42" fill="none" :stroke="CUT" stroke-width="1" />
      <g fill="none" :stroke="CUT" stroke-width="0.9" stroke-linecap="round">
        <path d="M9 11 H15 M9 19.7 H15 M9 28.3 H15 M9 37 H15" />
      </g>
      <g :fill="CUT">
        <circle cx="12" cy="11" r="1.1" />
        <circle cx="12" cy="19.7" r="1.1" />
        <circle cx="12" cy="28.3" r="1.1" />
        <circle cx="12" cy="37" r="1.1" />
        <rect x="21" y="16" width="12" height="12" rx="1.5" />
      </g>
      <g :fill="INK">
        <path d="M23.6 20.2 H30.4 Q30.4 25.4 27 25.4 Q23.6 25.4 23.6 20.2 Z" />
        <path d="M24.4 26.3 H29.6 V27 H24.4 Z" />
      </g>
    </template>
  </svg>
</template>

<script setup lang="ts">
import { CLASS_TOKENS, GROUND } from "../tokens";
import { LEAF_PATHS } from "../leaf";

export type SectionIconName = "leaf" | "pot" | "pour" | "tome" | "journal";

defineProps<{ name: SectionIconName }>();

const INK = CLASS_TOKENS.oolong.liquor;
// Details are cut out of the silhouette in the tile's own colour.
const CUT = GROUND.raised;
</script>
