<template>
  <q-page class="tea-page jentry">
    <p v-if="!entry && !journal.loading" class="jentry__missing" data-testid="journal-missing">
      That sitting isn't in the Journal. It may have been deleted.
    </p>

    <template v-if="entry">
      <img v-if="photo" class="jentry__photo" data-testid="journal-photo" :src="photo" alt="" />
      <div class="tea-page__body">
        <p class="jentry__tea">
          <router-link
            v-if="entry.tea_id"
            data-testid="journal-tea-link"
            :to="{ name: 'tea-detail', params: { teaId: entry.tea_id } }"
            :style="{ color: tokens.head }"
            >{{ entry.tea_name }}</router-link
          >
          <span v-else :style="{ color: tokens.head }">{{ entry.tea_name }}</span>
        </p>
        <p class="jentry__when" data-testid="journal-brewer">
          {{ date
          }}<template v-if="entry.brewed_by !== auth.username">
            · brewed by {{ entry.brewed_by }}</template
          ><template v-if="!entry.timed"> · {{ entry.tea_id ? "not timed" : "away" }}</template>
        </p>

        <dl v-if="facts.length" class="jentry__facts" data-testid="journal-facts">
          <template v-for="fact in facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </template>
        </dl>

        <p v-if="entry.cha_xi?.moods.length" class="jentry__moods" data-testid="journal-moods">
          {{ entry.cha_xi.moods.join(" · ") }}
        </p>
        <p v-if="entry.cha_xi?.guests" class="jentry__guests" data-testid="journal-guests">
          with {{ entry.cha_xi.guests }}
        </p>
        <p v-if="entry.cha_xi?.notes" class="jentry__notes" data-testid="journal-notes">
          {{ entry.cha_xi.notes }}
        </p>

        <ol v-if="entry.infusions.length" class="jentry__timeline" data-testid="journal-timeline">
          <li v-for="infusion in entry.infusions" :key="infusion.number">
            {{ infusion.actual_seconds }}s <small>/ {{ infusion.target_seconds }}s</small>
          </li>
        </ol>

        <div v-if="tastingBlocks.length" class="jentry__tasting" data-testid="journal-tasting">
          <section
            v-for="block in tastingBlocks"
            :key="block.key"
            class="jentry__tblock"
            :data-testid="`journal-tasting-${block.key}`"
          >
            <h2 class="jentry__theading">
              {{ block.title }}<span v-if="block.zh" class="jentry__zh">{{ block.zh }}</span>
            </h2>
            <dl class="jentry__facts">
              <template v-for="row in block.rows" :key="row.path">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </template>
            </dl>
          </section>
        </div>

        <p v-if="journal.error" class="tea-page__error" data-testid="journal-entry-error">
          {{ journal.error }}
        </p>

        <div v-if="entry.brewed_by === auth.username" class="jentry__actions">
          <button
            class="jentry__action"
            data-testid="journal-edit"
            @click="router.push({ name: 'tea-journal-edit', params: { id: entry.id } })"
          >
            ✎ Edit
          </button>
          <button
            class="jentry__action jentry__action--quiet"
            data-testid="journal-delete"
            :disabled="journal.saving"
            @click="onDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTeaJournalStore } from "../stores/useTeaJournalStore";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { CLASS_TOKENS } from "../tokens";
import { gramsReturned } from "../journal";
import { describeTasting } from "../tasting";
import { imageSrc } from "../shelf";
import { vesselLabel } from "../ware";

const route = useRoute();
const router = useRouter();
const journal = useTeaJournalStore();
const teaware = useTeawareStore();
const cabinet = useTeaCabinetStore();
const auth = useAuthStore();

const id = computed(() => String(route.params.id));
const entry = computed(() => journal.byId(id.value));
const tokens = computed(() => CLASS_TOKENS[entry.value?.class_id ?? "other"]);
const photo = computed(() => imageSrc(entry.value?.image_url ?? null, auth.token));
const date = computed(() =>
  entry.value
    ? new Date(entry.value.started_at).toLocaleDateString([], {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "",
);

const tastingBlocks = computed(() =>
  entry.value?.tasting ? describeTasting(entry.value.tasting) : [],
);

const facts = computed(() => {
  const e = entry.value;
  if (!e) return [];
  const rows: { label: string; value: string }[] = [];
  const vessel = vesselLabel(e, teaware.items);
  if (vessel) rows.push({ label: "Vessel", value: vessel });
  if (e.leaf_grams !== null) rows.push({ label: "Leaf", value: `${e.leaf_grams} g` });
  if (e.water_temp_c !== null) rows.push({ label: "Water", value: `${e.water_temp_c} °C` });
  if (e.rating !== null)
    rows.push({ label: "Rating", value: "★".repeat(e.rating) + "☆".repeat(5 - e.rating) });
  return rows;
});

async function onDelete(): Promise<void> {
  const e = entry.value;
  if (!e) return;
  const grams = gramsReturned(e);
  const question =
    grams !== null
      ? `Delete this sitting? ${grams} g goes back to ${e.tea_name}.`
      : "Delete this sitting?";
  if (!window.confirm(question)) return;
  if (!(await journal.remove(e.id))) return;
  void cabinet.fetchTeas();
  void router.replace({ name: "tea-journal" });
}

onMounted(() => {
  if (!journal.byId(id.value)) void journal.fetchJournal();
  if (teaware.items.length === 0) void teaware.fetchItems();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.jentry__missing {
  color: #8b7a63;
  padding: 24px 18px;
}
.jentry__photo {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
}
.jentry__tea {
  font-size: 24px;
  margin: 18px 0 2px;
}
.jentry__tea a {
  text-decoration: none;
}
.jentry__when {
  color: #8b7a63;
  font-size: 14px;
  margin: 0 0 16px;
}
.jentry__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  color: #e4d9c6;
  margin: 0 0 16px;
}
.jentry__facts dt {
  color: #8b7a63;
}
.jentry__facts dd {
  margin: 0;
}
.jentry__moods {
  color: #a99781;
  font-style: italic;
}
.jentry__guests {
  color: #e4d9c6;
}
.jentry__notes {
  color: #efe7da;
  white-space: pre-wrap;
  line-height: 1.5;
}
.jentry__timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 18px 0;
}
.jentry__timeline li {
  background: #241e19;
  border-radius: 999px;
  color: #e4d9c6;
  font-variant-numeric: tabular-nums;
  padding: 4px 10px;
  font-size: 13px;
}
.jentry__timeline small {
  color: #6b5f52;
}
.jentry__tasting {
  margin-top: 8px;
}
.jentry__theading {
  color: #a99781;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 18px 0 8px;
}
.jentry__zh {
  margin-left: 6px;
  letter-spacing: 0;
}
.jentry__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.jentry__action {
  background: #241e19;
  border: 0;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  padding: 10px 16px;
  cursor: pointer;
}
.jentry__action--quiet {
  background: transparent;
  color: #8b7a63;
}
</style>
