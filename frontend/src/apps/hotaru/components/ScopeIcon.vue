<template>
  <svg
    class="scope-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Lessons: an open book — sequential study units. -->
    <template v-if="kind === 'lessons'">
      <path d="M12 6.5C10.3 5.3 7.8 4.8 5 5v12.5c2.8-.2 5.3.3 7 1.5" />
      <path d="M12 6.5C13.7 5.3 16.2 4.8 19 5v12.5c-2.8-.2-5.3.3-7 1.5" />
      <path d="M12 6.5V19" opacity="0.5" />
    </template>
    <!-- Topics: a lightbulb — a theme/idea a group of words shares. -->
    <template v-else-if="kind === 'topics'">
      <path
        d="M12 3a6 6 0 0 0-3.8 10.7c.5.4.8 1 .8 1.6V16h6v-.7c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z"
      />
      <path d="M9.5 19h5" />
      <path d="M10.5 21.5h3" />
    </template>
    <!-- Quick: a sparkle — the ✦ motif; the primary action. -->
    <template v-else>
      <path
        d="M12 3.5 13.7 9 19 10.5 13.7 12 12 17.5 10.3 12 5 10.5 10.3 9z"
        fill="currentColor"
        stroke="none"
      />
      <circle
        cx="17.6"
        cy="5.4"
        r="1"
        fill="currentColor"
        stroke="none"
        opacity="0.75"
      />
    </template>
  </svg>
</template>

<script setup lang="ts">
// Decorative glyph for a practice scope family. Draws in `currentColor`, so the
// parent badge sets the hue (violet = lessons, magenta = topics, cyan = quick).
defineProps<{ kind: "lessons" | "topics" | "quick" }>();
</script>

<style scoped>
.scope-icon {
  display: block;
}
</style>
