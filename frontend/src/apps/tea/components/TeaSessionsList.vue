<template>
  <p v-if="sessions.length === 0" class="sessions__empty" data-testid="sessions-empty">
    No sessions yet. Brew it and it will show up here.
  </p>
  <ul v-else class="sessions">
    <li
      v-for="session in sessions"
      :key="session.id"
      class="sessions__row"
      :data-testid="`sessions-row-${session.id}`"
    >
      <router-link
        class="sessions__link"
        :to="{ name: 'tea-journal-entry', params: { id: session.id } }"
      >
        <span v-if="teaNames" class="sessions__tea" :data-testid="`sessions-tea-${session.id}`">{{
          teaOf(session, teaNames)
        }}</span>
        <span class="sessions__date">{{ dateOf(session) }}</span>
        <span class="sessions__stars">{{ starsOf(session) }}</span>
        <span
          v-if="shared && session.brewed_by !== me"
          class="sessions__brewer"
          :data-testid="`sessions-brewer-${session.id}`"
          >· {{ session.brewed_by }}</span
        >
        <span class="sessions__meta">
          {{ session.infusions.length }} {{ session.infusions.length === 1 ? "infusion" : "infusions" }}
          <template v-if="session.leaf_grams !== null"> · {{ session.leaf_grams }} g</template>
          <span
            v-if="vessels && vesselLabel(session, vessels)"
            :data-testid="`sessions-vessel-${session.id}`"
            >· {{ vesselLabel(session, vessels) }}</span
          >
        </span>
      </router-link>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { TeaSession, Teaware } from "../types";
import { vesselLabel } from "../ware";

// Brewers are named only once the cabinet is shared, so a cabinet of one looks as it always did.
defineProps<{
  sessions: TeaSession[];
  shared?: boolean;
  me?: string | null;
  teaNames?: Record<string, string>;
  vessels?: Teaware[];
}>();

function dateOf(session: TeaSession): string {
  return new Date(session.finished_at ?? session.started_at).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function teaOf(session: TeaSession, names: Record<string, string>): string {
  if (session.tea_id === null) return session.away_tea_name;
  return names[session.tea_id] ?? "a removed tea";
}

function starsOf(session: TeaSession): string {
  if (session.rating === null) return "unrated";
  return "★".repeat(session.rating) + "☆".repeat(5 - session.rating);
}
</script>

<style scoped lang="scss">
.sessions__link {
  display: contents;
  color: inherit;
  text-decoration: none;
}
.sessions {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sessions__row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid #241e19;
  font-size: 14px;
}
.sessions__date {
  color: #efe7da;
  min-width: 56px;
}
.sessions__stars {
  color: #d9a45b;
  letter-spacing: 1px;
}
.sessions__meta {
  color: #8b7a63;
  margin-left: auto;
}
.sessions__brewer {
  color: #8b7a63;
}
.sessions__tea {
  color: #efe7da;
}
.sessions__empty {
  color: #8b7a63;
  font-size: 14px;
  margin: 0;
}
</style>
