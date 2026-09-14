<template>
  <li class="kc-row">
    <!--
      The whole row opens the recipe; the favourite heart and the rating stars
      are separate targets inside it. Tapping either changes its own mark
      without opening the recipe and without moving the scroll position
      (FR-13, Story 2.7 AC 2).
    -->
    <div class="kc-row__main">
      <!--
        The name and the rating share the first line. They are siblings rather
        than nested, because the name navigates and the rating must not.

        The line WRAPS instead of truncating: five targets plus the heart still
        do not fit beside a long name at 375px (the constraint Story 2.7 AC 5
        named), and a clipped recipe name is a worse answer than stars that drop
        to their own line on a narrow screen.
      -->
      <div class="kc-row__line">
        <button
          type="button"
          class="kc-row__open"
          :data-testid="`row-${recipe.id}`"
          @click="emit('open')"
        >
          <span class="kc-body">{{ recipe.name }}</span>
        </button>

        <RatingStars
          :model-value="recipe.rating"
          :testid="`rating-${recipe.id}`"
          @update:model-value="emit('rate', $event)"
        />
      </div>

      <!--
        The absence rule: with no meal type and no time there is no second line
        at all.
      -->
      <span v-if="meta" class="kc-meta" data-testid="row-meta">{{ meta }}</span>
    </div>

    <button
      type="button"
      class="kc-icon-btn kc-heart"
      :aria-pressed="recipe.favourite"
      :aria-label="recipe.favourite ? 'Favourite, on' : 'Favourite, off'"
      :data-testid="`favourite-${recipe.id}`"
      @click="emit('toggle-favourite')"
    >
      <!--
        The favourite moved from the star to the heart in Story 2.7, because the
        rating conventionally owns the star. Everything else about the mark is
        unchanged: ink, and a SHAPE change — filled versus outlined — never a
        colour of its own and never moss, which means "pressable" everywhere
        else on the dock (UX-DR17).
      -->
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        :fill="recipe.favourite ? 'currentColor' : 'none'"
        stroke="currentColor"
        :stroke-width="recipe.favourite ? 0 : 1.5"
        aria-hidden="true"
      >
        <path
          d="M12 20.3l-1.4-1.3C5.4 14.3 2 11.3 2 7.6 2 4.6 4.4 2.2 7.4 2.2c1.7 0 3.3.8 4.6 2.1 1.3-1.3 2.9-2.1 4.6-2.1 3 0 5.4 2.4 5.4 5.4 0 3.7-3.4 6.7-8.6 11.4L12 20.3Z"
        />
      </svg>
    </button>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RatingStars from "@/apps/kitchencraft/components/RatingStars.vue";
import { metaLine } from "@/apps/kitchencraft/format";
import type { Recipe } from "@/apps/kitchencraft/types";

const props = defineProps<{ recipe: Recipe }>();

const emit = defineEmits<{
  open: [];
  "toggle-favourite": [];
  rate: [rating: number | null];
}>();

const meta = computed(() => metaLine(props.recipe));
</script>
